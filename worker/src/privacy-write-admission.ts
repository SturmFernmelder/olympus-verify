/** Source-qualified transaction transport. Entry selection is explicit and installation is separate.
 * Original generation/session/custody predicates remain payload authority. The global slot supplies
 * only transaction-local exclusion of old unwrapped writers. A committed active slot is refused.
 */
import {ADMISSION_CONTROL_TABLE as SLOT,ADMISSION_PROTOCOL as VERSION,ADMISSION_EXPECTED_JSON,ADMISSION_PHYSICAL_EXPECTED_JSON,ADMISSION_CONTROL_DDL} from './privacy-write-admission-catalogue';
import {lowerOriginalSchemaSQL,captureOriginalPhysicalStatement,type OriginalPhysicalSchemaPlan} from './privacy-schema-source-plan';
import {PROVIDER_METADATA_CURRENT_SQL,PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} from './privacy-provider-metadata';
import {originalServingNativeCostContext} from './privacy-global-serving-origin';
const registered=new WeakSet<D1Database>();
export type AdmissionLayout='canonical'|'recorded-live-20261010';
const catalogues=new WeakMap<D1Database,string>();
const epochs=new WeakMap<D1Database,string>();
const validEpoch=(x:unknown):x is string=>typeof x==='string'&&x.length===32&&!/[^0-9a-f]/.test(x);
const expectedLayout=(layout:AdmissionLayout):string=>{
 if(layout==='canonical')return ADMISSION_EXPECTED_JSON;
 if(layout==='recorded-live-20261010')return ADMISSION_PHYSICAL_EXPECTED_JSON;
 throw new PrivacyWriteAdmissionHeld('unqualified_layout');
};
const countedReads=new WeakMap<D1Database,()=>void>();
type OriginalMethod=Readonly<{receiver:object;owner:object;fn:Function}>;
const proofWitnesses=new WeakMap<D1Database,()=>void>();
const ownedAliases=new WeakMap<D1Database,D1Database>();
const nativeWitnesses=new WeakMap<D1Database,()=>void>();
const originalNativeIdentities=new WeakMap<D1Database,D1Database>();
/** Source-only emission counters. No SQL, binds, receiver, callback or mutable counter escapes. */
type OriginalPhysicalCost={statements:number;trips:number;returnedGroups:number;failedGroups:number;pendingGroups:number;maximumGroupStatements:number};
const originalPhysicalCosts=new WeakMap<object,OriginalPhysicalCost>();
export function originalPrivacyAdmissionPhysicalCostObservation(key:object):Readonly<OriginalPhysicalCost>|null{const s=originalPhysicalCosts.get(key);return s?Object.freeze({statements:s.statements,trips:s.trips,returnedGroups:s.returnedGroups,failedGroups:s.failedGroups,pendingGroups:s.pendingGroups,maximumGroupStatements:s.maximumGroupStatements}):null;}
async function originalMeasuredNativeEmission<T>(native:D1Database,count:number,measurementOwner:object|null,work:()=>Promise<T>):Promise<T>{
 const context=originalServingNativeCostContext();if(measurementOwner&&(!context||context.rootKey!==measurementOwner))throw new PrivacyWriteAdmissionHeld('original_cost_context_lost');
 // A nested admitted/owned alias has its own final protected boundary. Count that boundary once.
 if(registered.has(native)||ownedAliases.has(native)||nativeWitnesses.has(native))return work();
 if(!context)return work();context.check();
 if(!Number.isSafeInteger(count)||count<1||count>1000)throw new PrivacyWriteAdmissionHeld('original_cost_group');
 let s=originalPhysicalCosts.get(context.key);if(!s){s={statements:0,trips:0,returnedGroups:0,failedGroups:0,pendingGroups:0,maximumGroupStatements:0};originalPhysicalCosts.set(context.key,s);}
 if(!Number.isSafeInteger(s.statements+count)||!Number.isSafeInteger(s.trips+1))throw new PrivacyWriteAdmissionHeld('original_cost_overflow');
 s.statements+=count;s.trips++;s.pendingGroups++;if(count>s.maximumGroupStatements)s.maximumGroupStatements=count;
 try{const out=await work();context.check();s.returnedGroups++;return out;}catch(error){s.failedGroups++;throw error;}finally{s.pendingGroups--;}
}

function admissionSlot(receiver:object,name:string):OriginalMethod|null {
 let owner:object|null=receiver;
 for(let depth=0;depth<4&&owner&&owner!==Object.prototype;depth++){
  const d=Object.getOwnPropertyDescriptor(owner,name);
  if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw new PrivacyWriteAdmissionHeld('method_descriptor');return Object.freeze({receiver,owner,fn:d.value});}
  owner=Object.getPrototypeOf(owner);
 }
 return null;
}
function admissionMethod(receiver:object,name:string):OriginalMethod{const slot=admissionSlot(receiver,name);if(!slot)throw new PrivacyWriteAdmissionHeld('method_descriptor');return slot;}
function admissionSame(method:OriginalMethod,name:string):void{const now=admissionMethod(method.receiver,name);if(now.owner!==method.owner||now.fn!==method.fn)throw new PrivacyWriteAdmissionHeld('original_method_changed');}
function admissionSlotSame(receiver:object,name:string,slot:OriginalMethod|null):void{const now=admissionSlot(receiver,name);if(now?.owner!==slot?.owner||now?.fn!==slot?.fn)throw new PrivacyWriteAdmissionHeld('original_method_changed');}
/** Private native custody: even proof helpers use these original receivers and post-await checks. */
function admissionNativeSnapshot(native:D1Database):D1Database {
 const measurementOwner=originalServingNativeCostContext()?.rootKey??null;
 const prepare=admissionMethod(native,'prepare'),batch=admissionMethod(native,'batch'),raws=new WeakMap<object,Readonly<{raw:D1PreparedStatement;current:()=>void}>>();
 const check=()=>{admissionSame(prepare,'prepare');admissionSame(batch,'batch');};
 const protect=(raw:D1PreparedStatement,sql:string,values:readonly CapturedBind[]):D1PreparedStatement=>{
  const methods=new Map(['bind','all','run','first'].map(name=>[name,admissionSlot(raw,name)] as const));
  const originalSQL=captureOriginalPhysicalStatement(raw,false,{sql}),originalData=captureOriginalPhysicalStatement(raw,true,{sql,values});
  const original=(name:string)=>{const m=methods.get(name);if(!m)throw new PrivacyWriteAdmissionHeld('method_descriptor');return m;};
  const slots=()=>{check();originalSQL();for(const[name,m]of methods)admissionSlotSame(raw,name,m);};
  const current=()=>{slots();originalData();};current();
  const wrapper={
   bind(...values:unknown[]){current();const m=original('bind'),out=Reflect.apply(m.fn,m.receiver,values) as D1PreparedStatement,next=protect(out,sql,Object.freeze(values.map(captureBind)));slots();if(out!==raw)originalData();return next;},
   async all<T=unknown>(){current();const m=original('all'),out=await originalMeasuredNativeEmission(native,1,measurementOwner,()=>Reflect.apply(m.fn,m.receiver,[]) as Promise<D1Result<T>>);current();return out;},
   async run<T=unknown>(){current();const m=original('run'),out=await originalMeasuredNativeEmission(native,1,measurementOwner,()=>Reflect.apply(m.fn,m.receiver,[]) as Promise<D1Result<T>>);current();return out;},
   async first<T=unknown>(column?:string){if(column!==undefined&&typeof column!=='string')throw new PrivacyWriteAdmissionHeld('column');current();const m=original('first'),out=await originalMeasuredNativeEmission(native,1,measurementOwner,()=>Reflect.apply(m.fn,m.receiver,column===undefined?[]:[column]) as Promise<T|null>);current();return out;},
   raw<T=unknown>():Promise<T[]>{throw new PrivacyWriteAdmissionHeld('raw_epoch_boundary_unqualified');},
  };
  raws.set(wrapper,Object.freeze({raw,current}));return Object.freeze(wrapper) as unknown as D1PreparedStatement;
 };
 const safe=Object.freeze({
  prepare(sql:string){check();const raw=Reflect.apply(prepare.fn,prepare.receiver,[sql]) as D1PreparedStatement,out=protect(raw,sql,Object.freeze([]));check();return out;},
  async batch<T=unknown>(plan:D1PreparedStatement[]){check();const captured=plan.map(s=>{const record=raws.get(s);if(!record)throw new PrivacyWriteAdmissionHeld('foreign_native_statement');record.current();return record;});const rawInput=captured.map(r=>r.raw),parent=originalAdmissionBatchLineages.get(originalPrivacyAdmissionOpaqueReference(plan));if(parent){const arrayCheck=originalAdmissionArrayWitness(rawInput),current=()=>{check();parent.check();arrayCheck();for(const r of captured)r.current();};current();originalAdmissionBatchLineages.set(originalPrivacyAdmissionOpaqueReference(rawInput),Object.freeze({kind:'native',parent:originalPrivacyAdmissionOpaqueReference(plan),check:current}));}const out=await originalMeasuredNativeEmission(native,rawInput.length,measurementOwner,()=>Reflect.apply(batch.fn,batch.receiver,[rawInput]) as Promise<D1Result<T>[]>);check();for(const r of captured)r.current();return out;},
 }) as unknown as D1Database;
 nativeWitnesses.set(safe,check);originalNativeIdentities.set(safe,native);return safe;
}
export const copyPrivacyAdmissionBind=(value:unknown):CapturedBind=>captureBind(value);
export function assertPrivacyAdmissionWitness(db:D1Database):void{if(!registered.has(db))throw new PrivacyWriteAdmissionHeld('unregistered_database');proofWitnesses.get(db)?.();}
function admissionProofBefore(db:D1Database):void{proofWitnesses.get(db)?.();countedReads.get(db)?.();proofWitnesses.get(db)?.();}
function admissionProofAfter(db:D1Database):void{proofWitnesses.get(db)?.();}
/** Central constructs this exact closed alias; no caller-shaped object can obtain this brand. */
export function createPrivacyAdmissionAlias(base:D1Database,witness:()=>void,onExecute?:(sqls:readonly string[],kind:'batch'|'raw')=>void,onProofRead?:()=>void):D1Database {
 if(!registered.has(base)||typeof witness!=='function'||onExecute!==undefined&&typeof onExecute!=='function'||onProofRead!==undefined&&typeof onProofRead!=='function')throw new PrivacyWriteAdmissionHeld('alias_original_required');
 const prepare=admissionMethod(base,'prepare'),batch=admissionMethod(base,'batch'),records=new WeakMap<object,Readonly<{sql:string;values:readonly CapturedBind[]|null}>>();
 const check=()=>{proofWitnesses.get(base)?.();admissionSame(prepare,'prepare');admissionSame(batch,'batch');witness();admissionSame(prepare,'prepare');admissionSame(batch,'batch');proofWitnesses.get(base)?.();};
 check();
 const materialize=(r:Readonly<{sql:string;values:readonly CapturedBind[]|null}>):D1PreparedStatement=>{check();const raw=Reflect.apply(prepare.fn,prepare.receiver,[r.sql]) as D1PreparedStatement;check();if(r.values===null)return raw;const bind=admissionMethod(raw,'bind'),out=Reflect.apply(bind.fn,bind.receiver,r.values.map(v=>typeof v==='object'&&v!==null?Uint8Array.from(v.blob).buffer:v)) as D1PreparedStatement;check();admissionSame(bind,'bind');return out;};
 const execute=async<T=unknown>(plan:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{
  check();const source=admissionAliasPlan(plan,records);onExecute?.(source.map(r=>r.sql),'batch');check();const projection=originalPrivacyAdmissionGroupProjection(db,plan),native=source.map(materialize),arrayCheck=originalAdmissionArrayWitness(native),derived=originalPrivacyAdmissionGroupProjection(base,native);const current=()=>{check();projection.check();arrayCheck();derived.check();};current();originalAdmissionBatchLineages.set(originalPrivacyAdmissionOpaqueReference(native),Object.freeze({kind:'alias',parent:originalPrivacyAdmissionOpaqueReference(plan),check:current}));check();const out=await Reflect.apply(batch.fn,batch.receiver,[native]) as D1Result<T>[];check();return out;
 };
 const make=(sql:string,values:readonly CapturedBind[]|null):D1PreparedStatement=>{
  check();if(typeof sql!=='string'||sql.includes('\0'))throw new PrivacyWriteAdmissionHeld('unsupported_constructor');
  const statement={
   bind(...values:unknown[]){check();return make(sql,Object.freeze(values.map(captureBind)));},
   async all<T=unknown>(){return(await execute<T>([statement as unknown as D1PreparedStatement]))[0]!;},
   async run<T=unknown>(){return(await execute<T>([statement as unknown as D1PreparedStatement]))[0]!;},
   async first<T=unknown>(column?:string){if(column!==undefined&&typeof column!=='string')throw new PrivacyWriteAdmissionHeld('column');const result=(await execute([statement as unknown as D1PreparedStatement]))[0]?.results[0]??null;return(column&&result!==null?(result as Record<string,unknown>)[column]??null:result) as T|null;},
   async raw<T=unknown>(options?:{columnNames?:boolean}):Promise<T[]>{
    let columnNames=false;if(options!==undefined){if(!options||typeof options!=='object'||Reflect.ownKeys(options).some(k=>k!=='columnNames'))throw new PrivacyWriteAdmissionHeld('raw_options');const d=Object.getOwnPropertyDescriptor(options,'columnNames');if(d&&(!Object.hasOwn(d,'value')||typeof d.value!=='boolean'))throw new PrivacyWriteAdmissionHeld('raw_options');columnNames=d?.value===true;}
    check();onExecute?.([sql],'raw');check();const raw=materialize(Object.freeze({sql,values})),method=admissionMethod(raw,'raw');check();const out=await Reflect.apply(method.fn,method.receiver,columnNames?[Object.freeze({columnNames:true})]:[]) as T[];check();admissionSame(method,'raw');return out;
   },
  };
  records.set(statement,Object.freeze({sql,values}));return Object.freeze(statement) as unknown as D1PreparedStatement;
 };
 const db=Object.freeze({prepare:(sql:string)=>make(sql,null),batch:execute,exec(){throw new PrivacyWriteAdmissionHeld('exec');},dump(){throw new PrivacyWriteAdmissionHeld('dump');},withSession(){throw new PrivacyWriteAdmissionHeld('session');}}) as unknown as D1Database;
 originalAdmissionProjectors.set(db,plan=>{check();const original=admissionAliasPlan(plan,records),arrayCheck=originalAdmissionArrayWitness(plan),current=()=>{check();arrayCheck();const now=admissionAliasPlan(plan,records);if(now.length!==original.length||now.some((r,i)=>r!==original[i]))throw new PrivacyWriteAdmissionHeld('original_group_changed');};return originalAdmissionPublicProjection(original,current);});
 const parentRead=countedReads.get(base);registered.add(db);natives.set(db,nativeFor(base));catalogues.set(db,catalogues.get(base)!);epochs.set(db,epochs.get(base)!);ownedAliases.set(db,base);proofWitnesses.set(db,check);
 countedReads.set(db,()=>{check();parentRead?.();check();onProofRead?.();check();});return db;
}
function admissionAliasPlan(plan:D1PreparedStatement[],records:WeakMap<object,Readonly<{sql:string;values:readonly CapturedBind[]|null}>>):readonly Readonly<{sql:string;values:readonly CapturedBind[]|null}>[]{
 if(!Array.isArray(plan))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const size=Object.getOwnPropertyDescriptor(plan,'length');if(!size||!Object.hasOwn(size,'value')||!Number.isSafeInteger(size.value)||size.value<0||size.value>150)throw new PrivacyWriteAdmissionHeld('plan_too_large');
 for(const key of Reflect.ownKeys(plan))if(key!=='length'&&(typeof key!=='string'||!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=size.value))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const source=[];
 for(let i=0;i<size.value;i++){const d=Object.getOwnPropertyDescriptor(plan,String(i));if(!d||!Object.hasOwn(d,'value'))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');const r=records.get(d.value);if(!r)throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');source.push(r);}
 return Object.freeze(source);
}
export function privacyAdmissionAliasDescendsFrom(alias:D1Database,parent:D1Database):boolean{let current=alias;for(let i=0;i<32;i++){admissionProofAfter(current);const base=ownedAliases.get(current);if(!base)return false;if(base===parent){admissionProofAfter(parent);return true;}current=base;}return false;}

type CapturedBind=string|number|null|Readonly<{blob:readonly number[]}>;
type CapturedStatement=Readonly<{sql:string;values:readonly CapturedBind[]|null;origin:object}>;
const statements=new WeakMap<D1PreparedStatement,CapturedStatement>();
export type OriginalAdmissionLogicalPlan=Readonly<{sql:string;values:readonly CapturedBind[]|null}>;
export type OriginalAdmissionGroupProjection=Readonly<{logical:readonly OriginalAdmissionLogicalPlan[];records:readonly object[];check:()=>void}>;
export type OriginalAdmissionBatchLineage=Readonly<{kind:'alias'|'central'|'native';parent:object;check:()=>void;physical?:readonly OriginalPhysicalSchemaPlan[];payloadOffset?:number;logical?:readonly OriginalAdmissionLogicalPlan[];purpose?:'writer'|'lifecycle';layout?:AdmissionLayout;epoch?:string}>;
const originalAdmissionProjectors=new WeakMap<D1Database,(plan:D1PreparedStatement[])=>OriginalAdmissionGroupProjection>();
const originalAdmissionBatchLineages=new WeakMap<object,OriginalAdmissionBatchLineage>();
const originalAdmissionRecordHandles=new WeakMap<object,object>();
/** Canonical identity only: no inverse lookup, SQL registration or authority is created. */
export function originalPrivacyAdmissionOpaqueReference(value:object):object{
 let reference=originalAdmissionRecordHandles.get(value);if(!reference){reference=Object.freeze({});originalAdmissionRecordHandles.set(value,reference);}return reference;
}

function originalAdmissionPublicProjection(source:readonly OriginalAdmissionLogicalPlan[],check:()=>void):OriginalAdmissionGroupProjection{
 const records=source.map(r=>{let h=originalAdmissionRecordHandles.get(r);if(!h){h=Object.freeze({});originalAdmissionRecordHandles.set(r,h);}return h;});
 // CapturedStatement.origin contains the protected Native receiver and never leaves this module.
 const logical=Object.freeze(source.map(r=>Object.freeze({sql:r.sql,values:r.values})));check();return Object.freeze({logical,records:Object.freeze(records),check});
}
/** Data-only source projection. This never registers an erasure group or creates payload authority. */
export function originalPrivacyAdmissionGroupProjection(db:D1Database,plan:D1PreparedStatement[]):OriginalAdmissionGroupProjection{
 const project=originalAdmissionProjectors.get(db);if(!project)throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');admissionProofAfter(db);return project(plan);
}
/** Only the existing source materialization frames below write this private map. */
export function originalPrivacyAdmissionBatchLineage(plan:object):OriginalAdmissionBatchLineage|null{
 const original=originalAdmissionBatchLineages.get(plan)??originalAdmissionBatchLineages.get(originalPrivacyAdmissionOpaqueReference(plan));original?.check();return original??null;
}
function originalAdmissionArrayWitness(plan:D1PreparedStatement[]):()=>void{
 if(!Array.isArray(plan))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const prototype=Object.getPrototypeOf(plan),keys=Reflect.ownKeys(plan),length=Object.getOwnPropertyDescriptor(plan,'length');
 if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>1000||keys.length!==length.value+1)throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 for(let i=0;i<length.value;i++)if(!keys.includes(String(i)))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(plan,k));if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const check=()=>{const now=Reflect.ownKeys(plan);if(Object.getPrototypeOf(plan)!==prototype||now.length!==keys.length||keys.some(k=>!now.includes(k)))throw new PrivacyWriteAdmissionHeld('original_group_changed');for(let i=0;i<keys.length;i++){const d=Object.getOwnPropertyDescriptor(plan,keys[i]!),old=descriptors[i]!;if(!d||!['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(d[k as keyof PropertyDescriptor],old[k as keyof PropertyDescriptor])))throw new PrivacyWriteAdmissionHeld('original_group_changed');}};check();return check;
}

export class PrivacyWriteAdmissionHeld extends Error {constructor(reason:string){super(`privacy_write_admission_held:${reason}`);}}
const arrayBufferPrototype=ArrayBuffer.prototype;
const arrayBufferLength=Object.getOwnPropertyDescriptor(arrayBufferPrototype,'byteLength')!.get!;
const ByteView=Uint8Array;
const typedArrayPrototype=Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer=Object.getOwnPropertyDescriptor(typedArrayPrototype,'buffer')!.get!;
const typedArrayOffset=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteOffset')!.get!;
const typedArrayLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteLength')!.get!;
const dataViewBuffer=Object.getOwnPropertyDescriptor(DataView.prototype,'buffer')!.get!;
const dataViewOffset=Object.getOwnPropertyDescriptor(DataView.prototype,'byteOffset')!.get!;
const dataViewLength=Object.getOwnPropertyDescriptor(DataView.prototype,'byteLength')!.get!;
/** Inert bind copies only. No caller bind object, view, buffer, accessor or native statement is retained. */
function captureBind(value:unknown):CapturedBind{
 if(value===null||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object')throw new PrivacyWriteAdmissionHeld('unsupported_bind');
 for(const key of Reflect.ownKeys(value)){
  const d=Object.getOwnPropertyDescriptor(value,key);
  if(!d||!Object.hasOwn(d,'value')||typeof key!=='string'||!/^(?:0|[1-9]\d*)$/.test(key))throw new PrivacyWriteAdmissionHeld('unsupported_bind');
 }
 let buffer:ArrayBuffer,offset=0,length:number;
 try{
  if(Object.getPrototypeOf(value)===arrayBufferPrototype){buffer=value as ArrayBuffer;length=Reflect.apply(arrayBufferLength,buffer,[]) as number;}
  else if(ArrayBuffer.isView(value)){
   try{buffer=Reflect.apply(dataViewBuffer,value,[]) as ArrayBuffer;offset=Reflect.apply(dataViewOffset,value,[]) as number;length=Reflect.apply(dataViewLength,value,[]) as number;}
   catch{buffer=Reflect.apply(typedArrayBuffer,value,[]) as ArrayBuffer;offset=Reflect.apply(typedArrayOffset,value,[]) as number;length=Reflect.apply(typedArrayLength,value,[]) as number;}
  }else throw new PrivacyWriteAdmissionHeld('unsupported_bind');
  if(Object.getPrototypeOf(buffer)!==arrayBufferPrototype||Reflect.ownKeys(buffer).length!==0)throw new PrivacyWriteAdmissionHeld('unsupported_bind');
  const total=Reflect.apply(arrayBufferLength,buffer,[]) as number;
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>total)throw new PrivacyWriteAdmissionHeld('unsupported_bind');
  const bytes=new ByteView(buffer,offset,length),copy:number[]=[];
  for(let i=0;i<length;i++)copy.push(bytes[i]);
  return Object.freeze({blob:Object.freeze(copy)});
 }catch{throw new PrivacyWriteAdmissionHeld('unsupported_bind');}
}
function capturePlan(plan:D1PreparedStatement[],origin:object):readonly CapturedStatement[]{
 if(!Array.isArray(plan))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const length=Object.getOwnPropertyDescriptor(plan,'length');
 if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>150)throw new PrivacyWriteAdmissionHeld('plan_too_large');
 for(const key of Reflect.ownKeys(plan))if(key!=='length'&&(typeof key!=='string'||!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=length.value))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
 const source:CapturedStatement[]=[];
 for(let i=0;i<length.value;i++){
  const d=Object.getOwnPropertyDescriptor(plan,String(i));
  if(!d||!Object.hasOwn(d,'value'))throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');
  const p=statements.get(d.value);if(!p||p.origin!==origin)throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');source.push(p);
 }
 return Object.freeze(source);
}
export const isPrivacyWriteAdmissionDatabase=(db:D1Database):boolean=>registered.has(db);
/** Boolean source relation only; never unwraps a NativeDB or creates an admission brand. */
export function privacyAdmissionMatchesOriginalNative(db:D1Database,original:D1Database):boolean{if(!registered.has(db))return false;admissionProofAfter(db);const native=nativeFor(db);nativeWitnesses.get(native)?.();const matches=originalNativeIdentities.get(native)===original;admissionProofAfter(db);return matches;}
/** Source-owned counted facade only; preserve protocol identity and charge native proof reads. */
export function registerAdmissionCountedDatabase(_wrapper:D1Database,_base:D1Database,_onRead:()=>void):void{
 throw new PrivacyWriteAdmissionHeld('counted_requires_central_owned_alias');
}
/** Conservative source-plan classification. It can overcharge a read mentioning DML; it never exempts a writer. */
export const admissionPlanWrites=(sql:string):boolean=>/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
export const admissionTransportCost=(sqls:readonly string[]):number=>sqls.some(admissionPlanWrites)?4:(sqls.length?1:0); // an aborting native epoch proof precedes every read group

const CATALOGUE_CTE=`WITH business AS MATERIALIZED(SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} AND name<>'${SLOT}'),
 expected AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.columns') AS columns FROM json_each(?3,'$.tables')),
 actual_columns AS MATERIALIZED(SELECT m.name,p.name AS column_name FROM business m JOIN pragma_table_info(m.name) p),
 wanted_columns AS MATERIALIZED(SELECT e.name,j.value AS column_name FROM expected e JOIN json_each(e.columns) j),
 expected_triggers AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql FROM json_each(?3,'$.triggers')),
 expected_indexes AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.tbl_name') AS tbl_name FROM json_each(?3,'$.indexes'))`;
const TABLES_CURRENT=`${PROVIDER_METADATA_CURRENT_SQL} AND (SELECT sql FROM sqlite_master WHERE type='table' AND name='${SLOT}')=json_extract(?3,'$.slotSQL')
 AND (SELECT COUNT(*) FROM pragma_table_info('${SLOT}'))=9
 AND NOT EXISTS(SELECT name FROM pragma_table_info('${SLOT}') EXCEPT SELECT value FROM json_each(?3,'$.slotColumns'))
 AND (SELECT COUNT(*) FROM business)=json_array_length(?3,'$.tables') AND (SELECT COUNT(*) FROM expected)=json_array_length(?3,'$.tables')
 AND NOT EXISTS(SELECT name,sql FROM business EXCEPT SELECT name,sql FROM expected)
 AND NOT EXISTS(SELECT name,sql FROM expected EXCEPT SELECT name,sql FROM business)
 AND NOT EXISTS(SELECT name,column_name FROM actual_columns EXCEPT SELECT name,column_name FROM wanted_columns)
 AND NOT EXISTS(SELECT name,column_name FROM wanted_columns EXCEPT SELECT name,column_name FROM actual_columns)
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' EXCEPT SELECT name,sql,tbl_name FROM expected_indexes)
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM expected_indexes EXCEPT SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_')`;
const SCHEMA_CURRENT=`${TABLES_CURRENT} AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger')=json_array_length(?3,'$.triggers')
 AND NOT EXISTS(SELECT name,sql FROM sqlite_master WHERE type='trigger' EXCEPT SELECT name,sql FROM expected_triggers)
 AND NOT EXISTS(SELECT name,sql FROM expected_triggers EXCEPT SELECT name,sql FROM sqlite_master WHERE type='trigger')`;
const CONTROL_ROW=`(SELECT COUNT(*) FROM ${SLOT})=1 AND EXISTS(SELECT 1 FROM ${SLOT} WHERE singleton=1 AND protocol='${VERSION}'
 AND typeof(singleton)='integer' AND typeof(active)='integer' AND typeof(entry_changes)='integer' AND entry_changes>=0
 AND typeof(logical_changes)='integer' AND logical_changes>=0`;
const ADMIT=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=1 AND nonce=?1 AND purpose=?2 AND epoch=?4 AND mode='serving')
 THEN 1 ELSE json_extract('privacy_write_catalogue_or_control_refused','$') END AS admitted`;
const CURRENT=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='' AND epoch=?4 AND mode='serving') THEN 1 ELSE 0 END AS current`;
const CURRENT_SCHEMA=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='' AND epoch=?4 AND mode='serving')
 AND EXISTS(SELECT 1 FROM site_settings WHERE key='auditTypedNames' AND value='115')
 AND NOT EXISTS(SELECT 1 FROM site_applications WHERE position IN('raid_leader','raid_assist'))
 AND NOT EXISTS(SELECT 1 FROM site_votes WHERE ballot='raid_leader')
 AND NOT EXISTS(SELECT 1 FROM audit WHERE action='site.settings' AND CASE WHEN json_valid(details)
 THEN json_type(details,'$.appointed') IS NOT NULL OR json_type(details,'$.notice')='text' ELSE 1 END)
 THEN 1 ELSE json_extract('privacy_current_schema_requires_attended_setup','$') END AS current`;
/** Data only: this SQL literal issues no admission, operation or origin authority. */
export { CURRENT_SCHEMA as PRIVACY_ADMISSION_SCHEMA_PROOF_SQL };
/** Explicit installation only, never invoked by fetch/cron. Exact canonical business/schema data,
 * neutral control and zero preexisting triggers are prerequisites. Every DDL/proof shares one native
 * transaction; failure rolls back. A lost commit reply is preserved and never automatically retried.
 * This does not qualify old accepted HTTP effects or historic differing physical CREATE text.
 */
export async function installCurrentPrivacyWriteAdmission(_native:D1Database,_layout:AdmissionLayout='canonical'):Promise<never>{
 throw new PrivacyWriteAdmissionHeld('epoch_requires_separate_closed_transition');
}
const HEADER=`UPDATE ${SLOT} SET entry_changes=changes(),active=1,nonce=?1,purpose=?2 WHERE singleton=1 AND protocol='${VERSION}'
 AND epoch=?3 AND mode='serving' AND active=0 AND nonce='' AND purpose='' AND typeof(singleton)='integer' AND typeof(active)='integer'
 AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0`;
const CLEAR=`UPDATE ${SLOT} SET logical_changes=changes(),active=CASE WHEN protocol='${VERSION}' AND epoch=?3 AND mode='serving' AND active=1 AND nonce=?1 AND purpose=?2 THEN 0 ELSE -1 END,nonce='',purpose=''
 WHERE singleton=1 RETURNING active,nonce,purpose,entry_changes,logical_changes,epoch,mode`;
const TERMINAL=`SELECT CASE WHEN changes()=1 AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='' AND epoch=?1 AND mode='serving') THEN 1
 ELSE json_extract('privacy_terminal_write_control_refused','$') END AS closed`;
const randomHex=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
function assertSourcePlan(plan:readonly {sql:string}[]):void {
 if(plan.length>150)throw new PrivacyWriteAdmissionHeld('plan_too_large');
 for(const s of plan)if(s.sql.includes(SLOT)||/\b(?:CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/i.test(s.sql)||!/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql))throw new PrivacyWriteAdmissionHeld('unsupported_constructor');
 const first=plan.findIndex(s=>admissionPlanWrites(s.sql));
 for(let i=0;i<plan.length;i++)if(/\bchanges\s*\(/i.test(plan[i].sql)&&(first<0||i<=first))throw new PrivacyWriteAdmissionHeld('first_changes_requires_closed_constructor');
}
/** Exact source-derived proof; neither an installed control name nor arbitrary namespace grants an exemption. */
export async function admissionCatalogueCurrent(db:D1Database):Promise<boolean>{
 if(!registered.has(db))return false;
 admissionProofBefore(db);
 const row=await nativeFor(db).prepare(CURRENT).bind('', '', catalogues.get(db)!,epochs.get(db)!).first<{current:number}>();
 admissionProofAfter(db);
 return row?.current===1;
}
const natives=new WeakMap<D1Database,D1Database>();
const nativeFor=(db:D1Database):D1Database=>{const n=natives.get(db);if(!n)throw new PrivacyWriteAdmissionHeld('unregistered_database');return n;};
/** This branch is a read only proof. Missing migration/marker/legacy rewrite is held, never performed here. */
export async function assertAdmissionCurrentSchema(db:D1Database):Promise<void>{
 admissionProofBefore(db);
 const row=await nativeFor(db).prepare(CURRENT_SCHEMA).bind('', '', catalogues.get(db)!,epochs.get(db)!).first<{current:number}>();
 admissionProofAfter(db);
 if(row?.current!==1)throw new PrivacyWriteAdmissionHeld('current_schema_unconfirmed');
}
/** Installation and provider-transition closure are separately measured prerequisites.
 * Unknown prepared objects/DDL/native first changes consumers are refused. Payload metadata and slots
 * are returned unchanged after a known native commit. Lost primary replies are never retried.
 * Physical changes() across calls is unsupported; last_insert_rowid() is untouched by control UPDATEs.
 * Every read group adds one native epoch/schema proof; raw is deliberately held. The existing700 schedule is NOT qualified for this draft.
 */
export function createPrivacyWriteAdmissionDatabase(native:D1Database,purpose:'writer'|'lifecycle'='writer',layout:AdmissionLayout='canonical',expectedEpoch:string=''):D1Database {
 if(purpose!=='writer'&&purpose!=='lifecycle')throw new PrivacyWriteAdmissionHeld('purpose');
 if(!validEpoch(expectedEpoch))throw new PrivacyWriteAdmissionHeld('original_epoch_required');
 const expected=expectedLayout(layout);
 const originalNative=admissionNativeSnapshot(native);
 const origin=Object.freeze({native:originalNative,purpose,layout,epoch:expectedEpoch});
 const execute=async(plan:D1PreparedStatement[]):Promise<D1Result<Record<string,unknown>>[]>=>{
  admissionProofAfter(db);
  const source=capturePlan(plan,origin);
  assertSourcePlan(source);
  if(!source.length)return [];
  // All physical statements and immutable binds validate before the first Native constructor.
  // Original logical source remains the purpose/write/custody input; lowering is never new authority.
  const physical=Object.freeze(source.map(s=>lowerOriginalSchemaSQL(s.sql,s.values)));
  const checkPhysical=(plans:readonly OriginalPhysicalSchemaPlan[])=>{for(const p of plans)p.check();admissionProofAfter(db);};
  const materialize=(s:OriginalPhysicalSchemaPlan):D1PreparedStatement=>{
   s.check();const raw=originalNative.prepare(s.sql);
   const out=s.values.length===0?raw:raw.bind(...s.values.map(v=>typeof v==='object'&&v!==null?Uint8Array.from(v.blob).buffer:v));s.check();return out;
  };
  if(!source.some(s=>admissionPlanWrites(s.sql))){
   const proof=lowerOriginalSchemaSQL(CURRENT_SCHEMA,Object.freeze(['','',expected,expectedEpoch])),plans=Object.freeze([proof,...physical]);checkPhysical(plans);
   const projection=originalPrivacyAdmissionGroupProjection(db,plan),nativeInput=plans.map(materialize),arrayCheck=originalAdmissionArrayWitness(nativeInput),current=()=>{projection.check();arrayCheck();checkPhysical(plans);};current();
   originalAdmissionBatchLineages.set(originalPrivacyAdmissionOpaqueReference(nativeInput),Object.freeze({kind:'central',parent:originalPrivacyAdmissionOpaqueReference(plan),check:current,physical:plans,logical:projection.logical,payloadOffset:source.some(s=>admissionPlanWrites(s.sql))?2:1,purpose,layout,epoch:expectedEpoch}));
   const out=await originalNative.batch<Record<string,unknown>>(nativeInput);
   checkPhysical(plans);
   if(out.length!==source.length+1||out[0]?.results[0]?.current!==1)throw new PrivacyWriteAdmissionHeld('read_epoch_unconfirmed');
   return out.slice(1);
  }
  const nonce=randomHex(),plans=Object.freeze([
   lowerOriginalSchemaSQL(HEADER,Object.freeze([nonce,purpose,expectedEpoch])),lowerOriginalSchemaSQL(ADMIT,Object.freeze([nonce,purpose,expected,expectedEpoch])),
   ...physical,lowerOriginalSchemaSQL(CLEAR,Object.freeze([nonce,purpose,expectedEpoch])),lowerOriginalSchemaSQL(TERMINAL,Object.freeze([expectedEpoch])),
  ]);checkPhysical(plans);
  const projection=originalPrivacyAdmissionGroupProjection(db,plan),nativeInput=plans.map(materialize),arrayCheck=originalAdmissionArrayWitness(nativeInput),current=()=>{projection.check();arrayCheck();checkPhysical(plans);};current();
  originalAdmissionBatchLineages.set(originalPrivacyAdmissionOpaqueReference(nativeInput),Object.freeze({kind:'central',parent:originalPrivacyAdmissionOpaqueReference(plan),check:current,physical:plans,logical:projection.logical,payloadOffset:source.some(s=>admissionPlanWrites(s.sql))?2:1,purpose,layout,epoch:expectedEpoch}));
  const out=await originalNative.batch<Record<string,unknown>>(nativeInput);
  checkPhysical(plans);
  const closed=out.at(-2)?.results;
  if(closed?.length!==1||closed[0].active!==0||closed[0].nonce!==''||closed[0].purpose!==''||closed[0].epoch!==expectedEpoch||closed[0].mode!=='serving'||out.at(-1)?.results[0]?.closed!==1)throw new PrivacyWriteAdmissionHeld('known_commit_reply_unconfirmed');
  return out.slice(2,-2);
 };
 const makeStatement=(sql:string,values:readonly CapturedBind[]|null):D1PreparedStatement=>{
  admissionProofAfter(db);
  if(typeof sql!=='string'||sql.includes('\0'))throw new PrivacyWriteAdmissionHeld('unsupported_constructor');
  const statement={
   bind(...values:unknown[]){return makeStatement(sql,Object.freeze(values.map(captureBind)));},
   async all<T=unknown>(){return (await execute([statement as unknown as D1PreparedStatement]))[0] as D1Result<T>;},
   async run<T=unknown>(){return (await execute([statement as unknown as D1PreparedStatement]))[0] as D1Result<T>;},
   async first<T=unknown>(column?:string){const row=(await execute([statement as unknown as D1PreparedStatement]))[0]?.results[0]??null;return (column&&row!==null?(row as Record<string,unknown>)[column]??null:row) as T|null;},
   raw<T=unknown>(_options?:{columnNames?:boolean}):Promise<T[]>{throw new PrivacyWriteAdmissionHeld('raw_epoch_boundary_unqualified');},
  };
  statements.set(statement as unknown as D1PreparedStatement,Object.freeze({sql,values,origin}));return Object.freeze(statement) as unknown as D1PreparedStatement;
 };
 const prepare=(sql:string):D1PreparedStatement=>makeStatement(sql,null);
 const db={prepare,batch:execute,exec(){throw new PrivacyWriteAdmissionHeld('exec');},dump(){throw new PrivacyWriteAdmissionHeld('dump');},withSession(){throw new PrivacyWriteAdmissionHeld('session');}} as unknown as D1Database;
 const emittedPrepare=admissionMethod(db,'prepare'),emittedBatch=admissionMethod(db,'batch');
 originalAdmissionProjectors.set(db,plan=>{admissionProofAfter(db);const original=capturePlan(plan,origin),arrayCheck=originalAdmissionArrayWitness(plan);assertSourcePlan(original);const current=()=>{admissionProofAfter(db);arrayCheck();const now=capturePlan(plan,origin);if(now.length!==original.length||now.some((r,i)=>r!==original[i]))throw new PrivacyWriteAdmissionHeld('original_group_changed');};return originalAdmissionPublicProjection(original,current);});
 registered.add(db);natives.set(db,originalNative);catalogues.set(db,expected);epochs.set(db,expectedEpoch);proofWitnesses.set(db,()=>{admissionSame(emittedPrepare,'prepare');admissionSame(emittedBatch,'batch');nativeWitnesses.get(originalNative)!();});return db;
}
