/** .162 guarded recovery successor, Floor side. Mounted by ONE additive dispatch line in PrivacyRecoveryFloor.fetch.
 * Incident-scoped and additive: it never edits, completes, refuses, relabels or deletes an existing journal, completion
 * attempt, cut, lifecycle, ticket or suppression row, and it never derives or labels a predecessor child identity.
 * Existing unresolved rows are bound as an OPAQUE preserved set. The only base-state change is S5's single transaction:
 * the unchanged reopenServingFloor advance, the gate tuple and the suppression control Floor pointer. */
import type {FloorStorage} from './privacy-recovery-floor';
import {servingOriginalRequestTuple,servingOriginalBody,SERVING_GATE_TUPLE_SQL,SERVING_CUT_TUPLE_SQL,SERVING_LIFECYCLE_TUPLE_SQL,type ServingFloorReopenInput} from './privacy-serving-recovery-gate';
import {SUPPRESSION_CONTROL_SQL,SUPPRESSION_COPY_SQL} from './privacy-recovery-suppression';
import {ORIGINAL_REQUEST_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS,checkOriginalNativeRequest,checkOriginalNativeHeaders} from './privacy-native-http-intrinsics';

export const SUCCESSOR_CONTROL_DOMAIN='olympus-private-successor-control-v1';
export const SUCCESSOR_FLOOR_DOMAIN='olympus-private-successor-floor-v1';
export const SUCCESSOR_OPEN_DOMAIN='olympus-private-successor-floor-open-v1';
export const SUCCESSOR_FENCE_ACK_DOMAIN='successor-fence-ack-v1';
export const SUCCESSOR_CENSUS_DOMAIN='successor-census-v1';
export const SUCCESSOR_CENSUS_MAX_BYTES=65536;
export const SUCCESSOR_FLOOR_ORIGIN='https://privacy-recovery-floor.invalid';
export const SUCCESSOR_FLOOR_PATHS=['/v2/successor/census','/v2/successor/reserve','/v2/successor/fenced','/v2/successor/open','/v2/successor/observe'] as const;
/** Same value as privacy-cookie-profile-migration VERSION; kept literal so the Floor bundle does not import the Native module. */
export const SUCCESSOR_NATIVE_PROTOCOL='olympus-write-admission-epoch-2';
export const SUCCESSOR_FLAGS=Object.freeze({providerDrainQualified:false,unmanagedOldVersionClosureQualified:false,restoreBarrierQualified:false,allPhysicalCopyReplayQualified:false,readyToReopen:false});
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const refuse=():never=>{throw Error('successor_recovery_held');};
const hex=(x:unknown,n:number):x is string=>typeof x==='string'&&x.length===n&&!/[^0-9a-f]/.test(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const counter=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
function canonical(raw:unknown,max:number):unknown{if(typeof raw!=='string'||raw.length>max)return refuse();let v:unknown;try{v=JSON.parse(raw);}catch{return refuse();}if(JSON.stringify(v)!==raw)return refuse();return v;}
function array(raw:unknown,length:number,max=6144):unknown[]{const a=canonical(raw,max);if(!Array.isArray(a)||a.length!==length)return refuse();return a;}
function record(raw:string,keys:readonly string[]):Record<string,unknown>{
 if(new TextEncoder().encode(raw).length>8192)return refuse();const v=canonical(raw,8192);
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))return refuse();return v as Record<string,unknown>;
}
function clockPair(v:Record<string,unknown>):{createdAt:number;expiresAt:number}{if(!integer(v.createdAt)||v.createdAt>253402300499||v.expiresAt!==v.createdAt+300)return refuse();return {createdAt:v.createdAt,expiresAt:v.expiresAt as number};}

export type SuccessorRecoverCommand=Readonly<{attemptId:string;nonce:string;createdAt:number;expiresAt:number;sourceWriteEpoch:string;sourceMode:'serving'|'closed';targetWriteEpoch:string;targetCredentialEpoch:string;
 burnedEpochs:readonly (readonly ['credential'|'write',string])[];servingTree:string;servingVersion:string;layout:'canonical'|'recorded-live-20261010';expectedFloor:string;expectedGate:string;expectedCensusDigest:string;nativeWatermark:number;controlVersion:string}>;
export const SUCCESSOR_RECOVER_KEYS=Object.freeze(['attemptId','nonce','createdAt','expiresAt','sourceWriteEpoch','sourceMode','targetWriteEpoch','targetCredentialEpoch','burnedEpochs','servingTree','servingVersion','layout','expectedFloor','expectedGate','expectedCensusDigest','nativeWatermark','controlVersion']);
/** Shared closed parser for the owner's recover command (worker and DO). Canonical JSON, exact keys, typed values. */
export function parseSuccessorRecoverCommand(raw:string):SuccessorRecoverCommand{
 const v=record(raw,SUCCESSOR_RECOVER_KEYS),{createdAt,expiresAt}=clockPair(v);
 if(!hex(v.attemptId,32)||!hex(v.nonce,32)||v.attemptId===v.nonce||!hex(v.sourceWriteEpoch,32)||v.sourceMode!=='serving'&&v.sourceMode!=='closed'||!hex(v.targetWriteEpoch,32)||!hex(v.targetCredentialEpoch,32)
  ||new Set([v.sourceWriteEpoch,v.targetWriteEpoch,v.targetCredentialEpoch]).size!==3||!hex(v.servingTree,40)||typeof v.servingVersion!=='string'||!UUID.test(v.servingVersion)
  ||v.layout!=='canonical'&&v.layout!=='recorded-live-20261010'||typeof v.expectedFloor!=='string'||v.expectedFloor.length>2048||typeof v.expectedGate!=='string'||v.expectedGate.length>6144
  ||!hex(v.expectedCensusDigest,64)||!counter(v.nativeWatermark)||typeof v.controlVersion!=='string'||!UUID.test(v.controlVersion)||!Array.isArray(v.burnedEpochs)||v.burnedEpochs.length<1||v.burnedEpochs.length>4)return refuse();
 const burned=(v.burnedEpochs as unknown[]).map(b=>{if(!Array.isArray(b)||b.length!==2||b[0]!=='credential'&&b[0]!=='write'||!hex(b[1],32))return refuse();return Object.freeze([b[0],b[1]] as const);});
 if(new Set(burned.map(b=>b[0]+':'+b[1])).size!==burned.length||burned.some(b=>b[1]===v.targetWriteEpoch||b[1]===v.targetCredentialEpoch))return refuse();
 return Object.freeze({attemptId:v.attemptId,nonce:v.nonce,createdAt,expiresAt,sourceWriteEpoch:v.sourceWriteEpoch,sourceMode:v.sourceMode,targetWriteEpoch:v.targetWriteEpoch,targetCredentialEpoch:v.targetCredentialEpoch,
  burnedEpochs:Object.freeze(burned),servingTree:v.servingTree,servingVersion:v.servingVersion,layout:v.layout,expectedFloor:v.expectedFloor,expectedGate:v.expectedGate,expectedCensusDigest:v.expectedCensusDigest,nativeWatermark:v.nativeWatermark,controlVersion:v.controlVersion}) as SuccessorRecoverCommand;
}
export function parseSuccessorCensusCommand(raw:string):Readonly<{nonce:string;createdAt:number;expiresAt:number}>{const v=record(raw,['nonce','createdAt','expiresAt']),c=clockPair(v);if(!hex(v.nonce,32))return refuse();return Object.freeze({nonce:v.nonce,...c});}
export function parseSuccessorObserveCommand(raw:string):Readonly<{attemptId:string;recoverRequestDigest:string;nonce:string;createdAt:number;expiresAt:number}>{
 const v=record(raw,['attemptId','recoverRequestDigest','nonce','createdAt','expiresAt']),c=clockPair(v);if(!hex(v.attemptId,32)||!hex(v.recoverRequestDigest,64)||!hex(v.nonce,32))return refuse();
 return Object.freeze({attemptId:v.attemptId,recoverRequestDigest:v.recoverRequestDigest,nonce:v.nonce,...c});
}
/** One HMAC/digest lane for the successor's two new roots; never used with any base root. */
export async function successorHmac(secret:string,message:string):Promise<string>{
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function successorVerify(secret:string,message:string,mac:unknown):Promise<boolean>{
 if(!hex(mac,64))return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(mac.match(/../g)!,x=>parseInt(x,16)),new TextEncoder().encode(message));
}
export async function successorSha256(text:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const successorOwnerMessage=(path:string,controlTree:string,metadata:string,raw:string)=>JSON.stringify([SUCCESSOR_CONTROL_DOMAIN,'POST',path,controlTree,metadata,raw]);
export const successorRequestDigestText=(controlTree:string,metadata:string,raw:string)=>JSON.stringify([SUCCESSOR_CONTROL_DOMAIN,controlTree,metadata,raw]);
export const successorFloorMessage=(path:string,body:string)=>JSON.stringify([SUCCESSOR_FLOOR_DOMAIN,'POST',path,body]);
export const successorFenceAckText=(a:Readonly<{preTuple:string;closedTuple:string;fencedAt:number;nativeResultDigest:string;auditSequence:number}>)=>JSON.stringify([SUCCESSOR_FENCE_ACK_DOMAIN,a.preTuple,a.closedTuple,a.fencedAt,a.nativeResultDigest,a.auditSequence]);
export const successorOpenIdentityText=(attemptId:string,requestDigest:string,fenceAckDigest:string)=>JSON.stringify([SUCCESSOR_OPEN_DOMAIN,attemptId,requestDigest,fenceAckDigest]);

export const SUCCESSOR_ATTEMPT_DDL=`CREATE TABLE recovery_successor_attempt(
 attempt_id TEXT PRIMARY KEY CHECK(length(attempt_id)=32 AND attempt_id NOT GLOB '*[^0-9a-f]*'),
 nonce TEXT NOT NULL UNIQUE CHECK(length(nonce)=32 AND nonce NOT GLOB '*[^0-9a-f]*' AND nonce<>attempt_id),
 request_digest TEXT NOT NULL UNIQUE CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at BETWEEN 1 AND 253402300499),expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=created_at+300),
 control_tree TEXT NOT NULL CHECK(length(control_tree)=40 AND control_tree NOT GLOB '*[^0-9a-f]*'),control_version TEXT NOT NULL CHECK(length(control_version)=36),
 serving_tree TEXT NOT NULL CHECK(length(serving_tree)=40 AND serving_tree NOT GLOB '*[^0-9a-f]*'),serving_version TEXT NOT NULL CHECK(length(serving_version)=36),
 layout TEXT NOT NULL CHECK(layout IN('canonical','recorded-live-20261010')),
 source_write_epoch TEXT NOT NULL CHECK(length(source_write_epoch)=32 AND source_write_epoch NOT GLOB '*[^0-9a-f]*'),source_mode TEXT NOT NULL CHECK(source_mode IN('serving','closed')),
 target_write_epoch TEXT NOT NULL CHECK(length(target_write_epoch)=32 AND target_write_epoch NOT GLOB '*[^0-9a-f]*' AND target_write_epoch<>source_write_epoch),
 target_credential_epoch TEXT NOT NULL CHECK(length(target_credential_epoch)=32 AND target_credential_epoch NOT GLOB '*[^0-9a-f]*' AND target_credential_epoch<>target_write_epoch),
 burned_epochs TEXT NOT NULL CHECK(json_valid(burned_epochs)),native_watermark INTEGER NOT NULL CHECK(typeof(native_watermark)='integer' AND native_watermark>=0),
 predecessor_floor TEXT NOT NULL CHECK(json_valid(predecessor_floor)),predecessor_gate TEXT NOT NULL CHECK(json_valid(predecessor_gate)),
 census_safety TEXT NOT NULL CHECK(json_valid(census_safety)),census_preserved TEXT NOT NULL CHECK(json_valid(census_preserved)),census_successor TEXT NOT NULL CHECK(json_valid(census_successor)),
 census_digest TEXT NOT NULL CHECK(length(census_digest)=64 AND census_digest NOT GLOB '*[^0-9a-f]*'),
 phase TEXT NOT NULL CHECK(phase IN('reserved','fenced','opened')),
 fence_ack TEXT,fenced_at INTEGER,open_operation_id TEXT,open_nonce TEXT,open_digest TEXT,open_ack TEXT,opened_at INTEGER,result_floor TEXT,result_gate TEXT,
 CHECK((phase='reserved' AND fence_ack IS NULL AND fenced_at IS NULL AND open_operation_id IS NULL AND open_nonce IS NULL AND open_digest IS NULL AND open_ack IS NULL AND opened_at IS NULL AND result_floor IS NULL AND result_gate IS NULL)
  OR(phase IN('fenced','opened') AND json_valid(fence_ack) AND typeof(fenced_at)='integer' AND fenced_at>=created_at AND fenced_at<expires_at
   AND length(open_digest)=64 AND open_digest NOT GLOB '*[^0-9a-f]*' AND open_operation_id=substr(open_digest,1,32) AND open_nonce=substr(open_digest,33,32)
   AND((phase='fenced' AND open_ack IS NULL AND opened_at IS NULL AND result_floor IS NULL AND result_gate IS NULL)
    OR(phase='opened' AND json_valid(open_ack) AND typeof(opened_at)='integer' AND opened_at>=fenced_at AND opened_at<expires_at AND json_valid(result_floor) AND json_valid(result_gate))))))`;
/** Lifetime ledger: a target or burned epoch can never be a future target. Rows are never updated or deleted. */
export const SUCCESSOR_EPOCH_DDL=`CREATE TABLE recovery_successor_epoch(
 kind TEXT NOT NULL CHECK(kind IN('credential','write')),epoch TEXT NOT NULL CHECK(length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'),
 attempt_id TEXT NOT NULL CHECK(length(attempt_id)=32 AND attempt_id NOT GLOB '*[^0-9a-f]*'),role TEXT NOT NULL CHECK(role IN('target','burned')),
 PRIMARY KEY(kind,epoch))`;
export const SUCCESSOR_ATTEMPT_TUPLE_SQL='json_array(attempt_id,nonce,request_digest,created_at,expires_at,control_tree,control_version,serving_tree,serving_version,layout,source_write_epoch,source_mode,target_write_epoch,target_credential_epoch,burned_epochs,native_watermark,predecessor_floor,predecessor_gate,census_digest,phase,fence_ack,fenced_at,open_operation_id,open_nonce,open_digest,open_ack,opened_at,result_floor,result_gate)';
const EPOCH_TUPLE_SQL='json_array(kind,epoch,attempt_id,role)';

type SuccessorEnvironment={PRIVACY_RECOVERY_OPERATOR_SECRET?:string;PRIVACY_RECOVERY_INITIALIZER_SECRET?:string;PRIVACY_SERVING_GATE_SECRET?:string;PRIVACY_RECOVERY_SUCCESSOR_SECRET?:string;PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET?:string};
export type SuccessorFloorAuthority=Readonly<{floor:()=>string;claims:(native:string)=>void;validateFloor:(raw:unknown)=>string;advanceFloor:(original:string,value:ServingFloorReopenInput)=>string;floorTupleSQL:string;journalTupleSQL:string;completionTupleSQL:string}>;
const ROOT_KEYS=['PRIVACY_RECOVERY_SUCCESSOR_SECRET','PRIVACY_SUCCESSOR_CONTROL_AUTH_SECRET','PRIVACY_RECOVERY_OPERATOR_SECRET','PRIVACY_RECOVERY_INITIALIZER_SECRET','PRIVACY_SERVING_GATE_SECRET'] as const;
/** The two successor roots must be present, valid and distinct from each other and from every base root present. */
function successorRoots(env:SuccessorEnvironment):{floor:string;owner:string}{
 const value=(k:typeof ROOT_KEYS[number]):string|null=>{const d=Object.getOwnPropertyDescriptor(env,k);if(!d){if(k in env)return refuse();return null;}
  if(!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length<32||d.value.length>4096||/[^\x21-\x7e]/.test(d.value))return refuse();return d.value;};
 const all=ROOT_KEYS.map(value),floor=all[0],owner=all[1];if(floor===null||owner===null)return refuse();const present=all.filter((v):v is string=>v!==null);if(new Set(present).size!==present.length)return refuse();return {floor,owner};
}
const URL_GET=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,METHOD_GET=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,HEADERS_GET=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!,HEADER_GET=ORIGINAL_HEADER_DESCRIPTORS.get!.value as typeof Headers.prototype.get;
type Slot=Readonly<{object:object;prototype:object|null;key:PropertyKey;descriptor:PropertyDescriptor|undefined}>;
const slot=(object:object,key:PropertyKey):Slot=>Object.freeze({object,prototype:Object.getPrototypeOf(object),key,descriptor:Object.getOwnPropertyDescriptor(object,key)});
function same(s:Slot):void{const d=Object.getOwnPropertyDescriptor(s.object,s.key),a=s.descriptor;if(Object.getPrototypeOf(s.object)!==s.prototype||(a===undefined?d!==undefined:!d||['value','get','set','writable','enumerable','configurable'].some(k=>d[k as keyof PropertyDescriptor]!==a[k as keyof PropertyDescriptor])))return refuse();}
/** Native request/header/root custody captured before the first await and rechecked after each. */
function successorRequest(request:Request,env:SuccessorEnvironment):Readonly<{roots:{floor:string;owner:string};proof:string|null;check:()=>void}>{
 checkOriginalNativeRequest(request);if(Object.getPrototypeOf(request)!==Request.prototype)return refuse();const slots:Slot[]=['url','method','headers','body'].map(k=>slot(request,k));if(slots.some(s=>s.descriptor!==undefined))return refuse();
 slots.push(...['url','method','headers','body'].map(k=>slot(Request.prototype,k)),slot(Headers.prototype,'get'));const headers=Reflect.apply(HEADERS_GET,request,[]) as Headers;checkOriginalNativeHeaders(headers);
 if(Object.getPrototypeOf(headers)!==Headers.prototype)return refuse();const get=slot(headers,'get');if(get.descriptor!==undefined)return refuse();slots.push(get,...ROOT_KEYS.map(k=>slot(env,k)));
 const roots=successorRoots(env),url=Reflect.apply(URL_GET,request,[]),method=Reflect.apply(METHOD_GET,request,[]),keys=['Content-Type','Content-Length','X-Olympus-Successor-Proof'],values=keys.map(k=>Reflect.apply(HEADER_GET,headers,[k]) as string|null);
 const check=()=>{checkOriginalNativeRequest(request);checkOriginalNativeHeaders(headers);for(const s of slots)same(s);if(Reflect.apply(URL_GET,request,[])!==url||Reflect.apply(METHOD_GET,request,[])!==method||Reflect.apply(HEADERS_GET,request,[])!==headers||keys.some((k,i)=>Reflect.apply(HEADER_GET,headers,[k])!==values[i])||JSON.stringify(successorRoots(env))!==JSON.stringify(roots))return refuse();};
 check();return Object.freeze({roots,proof:values[2]!,check});
}
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
type Census=Readonly<{safety:string;preserved:string;successor:string}>;
type Attempt=unknown[];

/** Same original FloorStorage; constructor performs no SQL. Every effect is one transactionSync with exact predicates. */
export class PrivacySuccessorRecovery{
 constructor(private storage:FloorStorage,private env:SuccessorEnvironment,private authority:SuccessorFloorAuthority){}
 private rows(sql:string,...b:(string|number|null)[]){return this.storage.sql.exec(sql,...b).toArray();}
 private admit(sql:string,...b:(string|number|null)[]):void{const r=this.rows(`SELECT CASE WHEN ${sql} THEN 1 ELSE json_extract('successor_recovery_held','$') END admitted`,...b);if(r.length!==1||r[0]!.admitted!==1)return refuse();}
 private tables():boolean{
  const r=this.rows("SELECT type,name,sql FROM sqlite_master WHERE name IN('recovery_successor_attempt','recovery_successor_epoch') OR(tbl_name IN('recovery_successor_attempt','recovery_successor_epoch') AND sql IS NOT NULL AND type IN('index','trigger')) ORDER BY name");
  if(r.length===0)return false;const expected=[['table','recovery_successor_attempt',SUCCESSOR_ATTEMPT_DDL],['table','recovery_successor_epoch',SUCCESSOR_EPOCH_DDL]];
  if(r.length!==2||r.some(v=>!expected.some(e=>v.type===e[0]&&v.name===e[1]&&v.sql===e[2])))return refuse();return true;
 }
 private gate():string{const r=this.rows(`SELECT ${SERVING_GATE_TUPLE_SQL} tuple FROM recovery_serving_gate WHERE singleton=1`);if(r.length!==1)return refuse();array(r[0]!.tuple,11);return r[0]!.tuple as string;}
 private control():unknown[]{const r=this.rows(`SELECT ${SUPPRESSION_CONTROL_SQL} tuple FROM recovery_suppression_control WHERE singleton=1`);if(r.length!==1)return refuse();return array(r[0]!.tuple,5);}
 /** Safety part S: every base row and schema object that a successor transition depends on, byte-exact. No successor row. */
 private safety():string{
  const floor=this.authority.floor();this.authority.claims(floor);
  const schema=this.rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE(substr(name,1,9)='recovery_' OR substr(tbl_name,1,9)='recovery_') AND substr(tbl_name,1,19)<>'recovery_successor_' ORDER BY type,name").map(r=>[r.type,r.name,r.tbl_name,r.sql]);
  const claims=this.rows('SELECT kind,epoch,native_floor FROM recovery_epoch_claim ORDER BY kind,epoch').map(r=>[r.kind,r.epoch,r.native_floor]);
  const cuts=this.rows(`SELECT ${SERVING_CUT_TUPLE_SQL} tuple FROM recovery_serving_cut ORDER BY operation_id`).map(r=>r.tuple);
  const lifecycle=this.rows(`SELECT ${SERVING_LIFECYCLE_TUPLE_SQL} tuple FROM recovery_serving_lifecycle ORDER BY operation_id`).map(r=>r.tuple);
  const tickets=this.rows('SELECT state,COUNT(*) n FROM recovery_serving_ticket GROUP BY state ORDER BY state').map(r=>[r.state,r.n]);
  const copies=this.rows(`SELECT ${SUPPRESSION_COPY_SQL} tuple FROM recovery_suppression_copy ORDER BY operation_id`).map(r=>r.tuple);
  const journal=this.rows('SELECT state,COUNT(*) n FROM recovery_suppression_journal GROUP BY state ORDER BY state').map(r=>[r.state,r.n]);
  const companions=this.rows('SELECT COUNT(*) n FROM recovery_suppression_companion')[0]!.n;
  return JSON.stringify(['successor-safety-v1',schema,floor,claims,this.gate(),cuts,lifecycle,tickets,JSON.stringify(this.control()),copies,journal,companions]);
 }
 /** Preserved part P: every base journal and completion tuple, kept opaque. */
 private preserved():string{
  const journals=this.rows(`SELECT ${this.authority.journalTupleSQL} tuple FROM recovery_journal ORDER BY operation_id`).map(r=>r.tuple);
  const attempts=this.rows(`SELECT ${this.authority.completionTupleSQL} tuple FROM recovery_completion_attempt ORDER BY operation_id,phase`).map(r=>r.tuple);
  return JSON.stringify(['successor-preserved-v1',journals,attempts]);
 }
 /** Successor part X: every successor attempt and ledger row except the named current attempt's own rows. */
 private successorPart(exclude:string):string{
  if(!this.tables())return JSON.stringify(['successor-ledger-v1',[],[]]);
  const attempts=this.rows(`SELECT ${SUCCESSOR_ATTEMPT_TUPLE_SQL} tuple FROM recovery_successor_attempt WHERE attempt_id<>?1 ORDER BY attempt_id`,exclude).map(r=>r.tuple);
  const epochs=this.rows(`SELECT ${EPOCH_TUPLE_SQL} tuple FROM recovery_successor_epoch WHERE attempt_id<>?1 ORDER BY kind,epoch`,exclude).map(r=>r.tuple);
  return JSON.stringify(['successor-ledger-v1',attempts,epochs]);
 }
 private census(exclude:string):Census{return Object.freeze({safety:this.safety(),preserved:this.preserved(),successor:this.successorPart(exclude)});}
 private attempt(attemptId:string,requestDigest:string):Attempt{
  if(!this.tables())return refuse();const r=this.rows(`SELECT ${SUCCESSOR_ATTEMPT_TUPLE_SQL} tuple,census_safety,census_preserved,census_successor FROM recovery_successor_attempt WHERE attempt_id=?1 AND request_digest=?2`,attemptId,requestDigest);
  if(r.length!==1)return refuse();const a=array(r[0]!.tuple,29,32768);a.push(r[0]!.census_safety,r[0]!.census_preserved,r[0]!.census_successor);return a;
 }
 /** Exact non-authority id space: a fresh successor id or nonce may collide with nothing durable. */
 private fresh(ids:readonly string[]):void{
  const list=JSON.stringify(ids);this.admit(`NOT EXISTS(SELECT 1 FROM recovery_floor WHERE operation_id IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE operation_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE operation_id IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_gate WHERE operation_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_cut WHERE operation_id IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_lifecycle WHERE operation_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_ticket WHERE ticket_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_suppression_journal WHERE operation_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_suppression_copy WHERE operation_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)))
   AND NOT EXISTS(SELECT 1 FROM recovery_successor_attempt WHERE attempt_id IN(SELECT value FROM json_each(?1)) OR nonce IN(SELECT value FROM json_each(?1)) OR open_operation_id IN(SELECT value FROM json_each(?1)) OR open_nonce IN(SELECT value FROM json_each(?1)))`,list);
 }
 /** Monotone reachability from the stored P to the current P using only the non-authority transitions the base
  * routes can still make on expired rows (privacy-recovery-floor.ts /v1/completion-reserve and /v1/complete). */
 private admissiblePreserved(storedRaw:string,currentRaw:string):void{
  if(storedRaw===currentRaw)return;const s=array(storedRaw,3,1048576),c=array(currentRaw,3,1048576);if(s[0]!=='successor-preserved-v1'||c[0]!=='successor-preserved-v1'||!Array.isArray(s[1])||!Array.isArray(s[2])||!Array.isArray(c[1])||!Array.isArray(c[2]))return refuse();
  const journals=(list:unknown[])=>new Map(list.map(t=>{const a=array(t,10);return [a[0] as string,{raw:t as string,a}];}));
  const attempts=(list:unknown[])=>new Map(list.map(t=>{const a=array(t,7);return [a[0]+':'+a[1],{raw:t as string,a}];}));
  const sj=journals(s[1]),cj=journals(c[1]),sa=attempts(s[2]),ca=attempts(c[2]);
  if(sj.size!==cj.size||[...cj.keys()].some(k=>!sj.has(k)))return refuse();
  for(const [key,now] of ca){
   const before=sa.get(key),journal=sj.get(now.a[0] as string);if(!journal||journal.a[1]!=='reserve'||now.a[5]==='complete'&&before?.raw!==now.raw)return refuse();
   if(before){if(before.raw===now.raw)continue;
    if(before.a.slice(0,5).some((x,i)=>x!==now.a[i])||before.a[5]!=='reserved'||!integer(now.a[6])||!(before.a[3]==='complete'&&now.a[5]==='refused'||before.a[3]==='unknown'&&now.a[5]==='unknown'))return refuse();continue;}
   if(journal.a[7]!=='reserved'||now.a[2]!==journal.raw||!['reserved','refused','unknown'].includes(now.a[5] as string)||(now.a[5]==='reserved')!==(now.a[6]===null))return refuse();
   if(now.a[1]===0){if(sa.has(now.a[0]+':0')||sa.has(now.a[0]+':1')||!(now.a[3]==='complete'&&now.a[5]!=='unknown'||now.a[3]==='unknown'&&now.a[5]!=='refused'))return refuse();}
   else{const zero=ca.get(now.a[0]+':0');if(now.a[1]!==1||!zero||zero.a[3]!=='complete'||zero.a[5]!=='refused'||now.a[3]!=='unknown'||now.a[5]==='refused')return refuse();}
  }
  for(const key of sa.keys())if(!ca.has(key))return refuse();
  for(const [key,now] of cj){
   const before=sj.get(key)!;if(before.raw===now.raw)continue;
   if(before.a[7]!=='reserved'||now.a[7]!=='unknown'||before.a.slice(0,7).some((x,i)=>x!==now.a[i]))return refuse();
   const settled=[...ca.values()].find(v=>v.a[0]===key&&v.a[3]==='unknown'&&v.a[5]==='unknown');if(!settled||now.a[8]!==settled.a[4]||now.a[9]!==settled.a[6])return refuse();
  }
  for(const v of ca.values())if(v.a[5]==='unknown'&&cj.get(v.a[0] as string)!.a[7]!=='unknown')return refuse();
 }
 /** The current attempt's own ledger rows: exactly its two targets plus burned rows from its own burned list. */
 private ownLedger(a:Attempt):void{
  const rows=this.rows(`SELECT kind,epoch,role FROM recovery_successor_epoch WHERE attempt_id=?1 ORDER BY kind,epoch`,a[0] as string),burned=array(a[14],(JSON.parse(a[14] as string) as unknown[]).length,1024) as [string,string][];
  const targets=rows.filter(r=>r.role==='target').map(r=>r.kind+':'+r.epoch).sort().join('|');if(targets!==['credential:'+a[13],'write:'+a[12]].sort().join('|'))return refuse();
  if(rows.some(r=>r.role==='burned'&&!burned.some(b=>b[0]===r.kind&&b[1]===r.epoch)))return refuse();
 }
 private unchanged(a:Attempt):void{
  const c=this.census(a[0] as string);if(c.safety!==a[29]||c.successor!==a[31])return refuse();this.admissiblePreserved(a[30] as string,c.preserved);this.ownLedger(a);
  if(this.authority.floor()!==a[16]||this.gate()!==a[17])return refuse();
 }
 private reserve(c:SuccessorRecoverCommand,controlTree:string,requestDigest:string,hashed:Census,digest:string):Response{
  this.admit(`?1<=${NOW} AND ?2>${NOW}`,c.createdAt,c.expiresAt);
  const census=this.census('');if(census.safety!==hashed.safety||census.preserved!==hashed.preserved||census.successor!==hashed.successor||digest!==c.expectedCensusDigest)return refuse();
  const floor=this.authority.floor();this.authority.claims(floor);const gate=this.gate(),f=array(floor,12,2048),g=array(gate,11);
  if(floor!==c.expectedFloor||gate!==c.expectedGate||g[3]!=='closing_held'||g[2]!==floor||!integer(g[7])||!integer(g[8])||!hex(g[9],32)||c.createdAt<(g[8] as number))return refuse();
  this.admit(`?1<=${NOW} AND NOT EXISTS(SELECT 1 FROM recovery_serving_lifecycle WHERE purpose<>'initialize_closed') AND EXISTS(SELECT 1 FROM recovery_serving_lifecycle)
   AND NOT EXISTS(SELECT 1 FROM recovery_serving_ticket) AND NOT EXISTS(SELECT 1 FROM recovery_suppression_journal) AND NOT EXISTS(SELECT 1 FROM recovery_suppression_companion)
   AND NOT EXISTS(SELECT 1 FROM recovery_suppression_copy WHERE expires_at>${NOW}) AND ?4=(SELECT native_floor FROM recovery_suppression_control WHERE singleton=1)
   AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE created_at>?2)
   AND NOT EXISTS(SELECT 1 FROM recovery_journal WHERE state<>'complete' AND(created_at<>?2 OR expires_at<>?1 OR original_floor<>?4))
   AND NOT EXISTS(SELECT 1 FROM recovery_completion_attempt WHERE state<>'complete' AND(json_extract(original_journal,'$[5]')<>?2 OR json_extract(original_journal,'$[6]')<>?1 OR json_extract(original_journal,'$[3]')<>?4))`,g[8] as number,g[7] as number,0,floor);
  if(!this.tables()){this.rows(SUCCESSOR_ATTEMPT_DDL);this.rows(SUCCESSOR_EPOCH_DDL);if(!this.tables())return refuse();}
  const priors=this.rows('SELECT attempt_id,target_write_epoch,expires_at,phase FROM recovery_successor_attempt');
  this.admit(`NOT EXISTS(SELECT 1 FROM recovery_successor_attempt WHERE expires_at>${NOW} OR phase='opened')`);
  const sourceOk=c.sourceWriteEpoch===g[9]&&c.sourceMode==='serving'||priors.some(p=>p.target_write_epoch===c.sourceWriteEpoch);if(!sourceOk)return refuse();
  if(priors.length===0&&(!c.burnedEpochs.some(b=>b[0]==='write'&&b[1]===g[9])||!c.burnedEpochs.some(b=>b[0]==='credential')))return refuse();
  const taken=new Set<string>([f[6] as string,f[7] as string,g[9] as string,c.sourceWriteEpoch,...c.burnedEpochs.map(b=>b[1]),
   ...this.rows('SELECT epoch FROM recovery_epoch_claim UNION ALL SELECT epoch FROM recovery_successor_epoch').map(r=>r.epoch as string)]);
  if(taken.has(c.targetWriteEpoch)||taken.has(c.targetCredentialEpoch))return refuse();
  this.fresh([c.attemptId,c.nonce]);
  const inserted=this.rows(`INSERT INTO recovery_successor_attempt(attempt_id,nonce,request_digest,created_at,expires_at,control_tree,control_version,serving_tree,serving_version,layout,source_write_epoch,source_mode,target_write_epoch,target_credential_epoch,burned_epochs,native_watermark,predecessor_floor,predecessor_gate,census_safety,census_preserved,census_successor,census_digest,phase)
   SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,'reserved' WHERE ?4<=${NOW} AND ?5>${NOW} RETURNING attempt_id`,
   c.attemptId,c.nonce,requestDigest,c.createdAt,c.expiresAt,controlTree,c.controlVersion,c.servingTree,c.servingVersion,c.layout,c.sourceWriteEpoch,c.sourceMode,c.targetWriteEpoch,c.targetCredentialEpoch,
   JSON.stringify(c.burnedEpochs),c.nativeWatermark,floor,gate,census.safety,census.preserved,census.successor,digest);if(inserted.length!==1)return refuse();
  for(const [kind,epoch] of [['write',c.targetWriteEpoch],['credential',c.targetCredentialEpoch]] as const)if(this.rows("INSERT INTO recovery_successor_epoch(kind,epoch,attempt_id,role)VALUES(?1,?2,?3,'target') RETURNING kind",kind,epoch,c.attemptId).length!==1)return refuse();
  for(const [kind,epoch] of c.burnedEpochs){const r=this.rows('SELECT role FROM recovery_successor_epoch WHERE kind=?1 AND epoch=?2',kind,epoch);if(r.length===0&&this.rows("INSERT INTO recovery_successor_epoch(kind,epoch,attempt_id,role)VALUES(?1,?2,?3,'burned') RETURNING kind",kind,epoch,c.attemptId).length!==1)return refuse();}
  const a=this.attempt(c.attemptId,requestDigest);this.ownLedger(a);
  return response({scope:'private_successor_reserved',attempt:JSON.stringify(a.slice(0,29)),ledger:this.rows(`SELECT ${EPOCH_TUPLE_SQL} tuple FROM recovery_successor_epoch WHERE attempt_id=?1 ORDER BY kind,epoch`,c.attemptId).map(r=>r.tuple),...SUCCESSOR_FLAGS});
 }
 private fenced(v:Record<string,unknown>,ack:Readonly<{preTuple:string;closedTuple:string;fencedAt:number;nativeResultDigest:string;auditSequence:number}>,open:string):Response{
  const a=this.attempt(v.attemptId as string,v.requestDigest as string);if(a[19]!=='reserved')return refuse();this.admit(`?1<=${NOW} AND ?2>${NOW}`,a[3] as number,a[4] as number);this.unchanged(a);
  const pre=array(ack.preTuple,9,1024),closed=array(ack.closedTuple,9,1024);
  if(pre[0]!==1||pre[1]!==SUCCESSOR_NATIVE_PROTOCOL||pre[2]!==a[10]||pre[3]!==a[11]||pre[4]!==0||pre[5]!==''||pre[6]!==''||!counter(pre[7])||!counter(pre[8])
   ||closed.some((x,i)=>i===2?x!==a[12]:i===3?x!=='closed':x!==pre[i])||!integer(ack.fencedAt)||ack.fencedAt<(a[3] as number)||ack.fencedAt>=(a[4] as number)
   ||!hex(ack.nativeResultDigest,64)||!counter(ack.auditSequence)||ack.auditSequence<(a[15] as number)||!hex(open,64))return refuse();
  this.fresh([open.slice(0,32),open.slice(32)]);
  const r=this.rows(`UPDATE recovery_successor_attempt SET phase='fenced',fence_ack=?1,fenced_at=?2,open_operation_id=?3,open_nonce=?4,open_digest=?5
   WHERE attempt_id=?6 AND request_digest=?7 AND phase='reserved' AND created_at<=${NOW} AND expires_at>${NOW} RETURNING attempt_id`,successorFenceAckText(ack),ack.fencedAt,open.slice(0,32),open.slice(32),open,a[0] as string,a[2] as string);
  if(r.length!==1)return refuse();return response({scope:'private_successor_fenced',attempt:JSON.stringify(this.attempt(a[0] as string,a[2] as string).slice(0,29)),...SUCCESSOR_FLAGS});
 }
 private opened(v:Record<string,unknown>,ack:Readonly<{servingTuple:string;openedAt:number;nativeResultDigest:string}>):Response{
  const a=this.attempt(v.attemptId as string,v.requestDigest as string);if(a[19]!=='fenced')return refuse();this.admit(`?1<=${NOW} AND ?2>${NOW}`,a[3] as number,a[4] as number);this.unchanged(a);
  const fence=array(a[20],6,4096),closed=array(fence[2],9,1024),serving=array(ack.servingTuple,9,1024);
  if(serving.some((x,i)=>i===3?x!=='serving':x!==closed[i])||!integer(ack.openedAt)||ack.openedAt<(a[21] as number)||ack.openedAt>=(a[4] as number)||!hex(ack.nativeResultDigest,64))return refuse();
  this.admit("NOT EXISTS(SELECT 1 FROM recovery_epoch_claim WHERE(kind='credential' AND epoch=?1)OR(kind='write' AND epoch=?2))",a[13] as string,a[12] as string);
  const floor=a[16] as string,gate=a[17] as string,control=this.control(),before=array(floor,12,2048);
  const next=this.authority.advanceFloor(floor,Object.freeze({operationId:a[22] as string,nonce:a[23] as string,requestDigest:a[24] as string,createdAt:a[3] as number,expiresAt:a[4] as number,credentialEpoch:a[13] as string,writeEpoch:a[12] as string,sourceTree:a[7] as string,deploymentVersion:a[8] as string}));
  this.authority.claims(next);const f=array(next,12,2048);if(f[5]!==Number(before[5])+1||f[6]!==a[13]||f[7]!==a[12]||f[8]!==a[7]||f[9]!==a[8]||f[10]!==a[22])return refuse();
  const g=this.rows(`UPDATE recovery_serving_gate SET native_floor=?1,state='managed_open',operation_id=NULL,nonce=NULL,request_digest=NULL,created_at=NULL,expires_at=NULL,next_write_epoch=NULL,closed_at=NULL
   WHERE singleton=1 AND ${SERVING_GATE_TUPLE_SQL}=?2 AND state='closing_held' AND expires_at<=${NOW} AND ?3<=${NOW} AND ?4>${NOW}
    AND EXISTS(SELECT 1 FROM recovery_floor WHERE ${this.authority.floorTupleSQL}=?1) RETURNING singleton`,next,gate,a[3] as number,a[4] as number);if(g.length!==1)return refuse();
  const s=this.rows('UPDATE recovery_suppression_control SET native_floor=?1 WHERE singleton=1 AND native_floor=?2 AND action_sequence=?3 AND key_fingerprint=?4 RETURNING singleton',next,floor,control[3] as number,control[4] as string);if(s.length!==1||control[2]!==floor)return refuse();
  const resultGate=this.gate(),rg=array(resultGate,11);if(rg[2]!==next||rg[3]!=='managed_open'||rg.slice(4).some(x=>x!==null))return refuse();
  const openAck=JSON.stringify(['successor-open-ack-v1',ack.servingTuple,ack.openedAt,ack.nativeResultDigest]);
  const r=this.rows(`UPDATE recovery_successor_attempt SET phase='opened',open_ack=?1,opened_at=?2,result_floor=?3,result_gate=?4
   WHERE attempt_id=?5 AND request_digest=?6 AND phase='fenced' AND created_at<=${NOW} AND expires_at>${NOW} RETURNING attempt_id`,openAck,ack.openedAt,next,resultGate,a[0] as string,a[2] as string);if(r.length!==1)return refuse();
  return response({scope:'private_successor_opened',floor:next,gate:resultGate,attempt:JSON.stringify(this.attempt(a[0] as string,a[2] as string).slice(0,29)),...SUCCESSOR_FLAGS});
 }

 async fetch(request:Request):Promise<Response>{
  try{
   const tuple=servingOriginalRequestTuple(request),u=new URL(tuple.url);
   if(u.origin!==SUCCESSOR_FLOOR_ORIGIN||u.search||u.hash||tuple.method!=='POST'||!SUCCESSOR_FLOOR_PATHS.includes(u.pathname as typeof SUCCESSOR_FLOOR_PATHS[number]))return response({error:'successor_recovery_held'},404);
   const original=successorRequest(request,this.env),raw=await servingOriginalBody(request,original.check);original.check();
   if(!await successorVerify(original.roots.floor,successorFloorMessage(u.pathname,raw),original.proof))return response({error:'successor_recovery_held'},403);original.check();
   if(u.pathname==='/v2/successor/census'){record(raw,[]);return this.storage.transactionSync(()=>{original.check();const floor=this.authority.floor(),c=this.census(''),body=JSON.stringify({scope:'private_successor_census',floor,gate:this.gate(),...c,...SUCCESSOR_FLAGS});
    if(new TextEncoder().encode(body).length>SUCCESSOR_CENSUS_MAX_BYTES)return refuse();return new Response(body,{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});});}
   if(u.pathname==='/v2/successor/observe'){const v=record(raw,['attemptId','requestDigest']);if(!hex(v.attemptId,32)||!hex(v.requestDigest,64))return refuse();
    return this.storage.transactionSync(()=>{original.check();const a=this.attempt(v.attemptId as string,v.requestDigest as string);return response({scope:'private_successor_observation',attempt:JSON.stringify(a.slice(0,29)),floor:this.authority.floor(),gate:this.gate(),...SUCCESSOR_FLAGS});});}
   if(u.pathname==='/v2/successor/reserve'){
    const v=record(raw,['command','proof','controlTree','metadata']);if(typeof v.command!=='string'||!hex(v.proof,64)||!hex(v.controlTree,40)||typeof v.metadata!=='string')return refuse();
    const meta=array(v.metadata,3,1280);if(!meta.every(x=>typeof x==='string'))return refuse();
    if(!await successorVerify(original.roots.owner,successorOwnerMessage('/v1/control/reopen',v.controlTree,v.metadata,v.command),v.proof))return response({error:'successor_recovery_held'},403);original.check();
    const c=parseSuccessorRecoverCommand(v.command);if(meta[0]!==c.controlVersion)return refuse();
    const requestDigest=await successorSha256(successorRequestDigestText(v.controlTree,v.metadata,v.command));original.check();
    const hashed=this.storage.transactionSync(()=>this.census(''));const digest=await successorSha256(JSON.stringify([SUCCESSOR_CENSUS_DOMAIN,hashed.safety,hashed.preserved,hashed.successor]));original.check();
    return this.storage.transactionSync(()=>{original.check();return this.reserve(c,v.controlTree as string,requestDigest,hashed,digest);});
   }
   if(u.pathname==='/v2/successor/fenced'){
    const v=record(raw,['attemptId','requestDigest','fenceAck']);if(!hex(v.attemptId,32)||!hex(v.requestDigest,64)||!v.fenceAck||typeof v.fenceAck!=='object'||Array.isArray(v.fenceAck))return refuse();
    const f=v.fenceAck as Record<string,unknown>;if(Object.keys(f).sort().join('|')!=='auditSequence|closedTuple|fencedAt|nativeResultDigest|preTuple'||typeof f.preTuple!=='string'||typeof f.closedTuple!=='string'||!integer(f.fencedAt)||!hex(f.nativeResultDigest,64)||!counter(f.auditSequence))return refuse();
    const ack=Object.freeze({preTuple:f.preTuple,closedTuple:f.closedTuple,fencedAt:f.fencedAt,nativeResultDigest:f.nativeResultDigest,auditSequence:f.auditSequence});
    const open=await successorSha256(successorOpenIdentityText(v.attemptId,v.requestDigest,await successorSha256(successorFenceAckText(ack))));original.check();
    return this.storage.transactionSync(()=>{original.check();return this.fenced(v,ack,open);});
   }
   const v=record(raw,['attemptId','requestDigest','openAck']);if(!hex(v.attemptId,32)||!hex(v.requestDigest,64)||!v.openAck||typeof v.openAck!=='object'||Array.isArray(v.openAck))return refuse();
   const o=v.openAck as Record<string,unknown>;if(Object.keys(o).sort().join('|')!=='nativeResultDigest|openedAt|servingTuple'||typeof o.servingTuple!=='string'||!integer(o.openedAt)||!hex(o.nativeResultDigest,64))return refuse();
   const ack=Object.freeze({servingTuple:o.servingTuple,openedAt:o.openedAt,nativeResultDigest:o.nativeResultDigest});
   return this.storage.transactionSync(()=>{original.check();return this.opened(v,ack);});
  }catch{return response({error:'successor_recovery_held'},409);}
 }
}
