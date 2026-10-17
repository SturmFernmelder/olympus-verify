/** One site OAuth atomic producer only. Local Env custody is not an external platform witness.
 * Cookie issuance is bound to this original native reply. Token/guild HTTP and post-login Names/audit
 * receive original local custody checks but remain outside recovery tickets/platform-origin/drain coverage. */
import type {Env} from './env';
import {RecoveryFloorHeld} from './privacy-recovery-floor';
import {createServingRecoveryGateClient,bindServingGateClientWitness,readServingRecoveryFloor,type ServingGateClient,type ServingGateEnvironment,type ServingOriginalConfig} from './privacy-serving-recovery-gate-client';
import {prepareServingInvocation,dispatchServingInvocation,runServingChild,servingContextCustody,type ServingContext} from './privacy-serving-recovery-context';
import {createPrivacyWriteAdmissionDatabase,isPrivacyWriteAdmissionDatabase,privacyAdmissionMatchesOriginalNative,type AdmissionLayout} from './privacy-write-admission';
import {admittedPrivacyOAuthWrite,privacyProviderCustodyDatabase,type PrivacySubject} from './privacy-serving-authority';
import {INCARNATION_SESSION_PURPOSE,INCARNATION_SESSION_SECONDS,canonicalSiteSession,canonicalSiteSessionBody,type OriginalSiteSession} from './privacy-site-session-incarnation';

const DATABASE='7e2cf8fd-a9e3-48f6-975a-890f1360e5d0';
export type SiteOAuthOrigin=Readonly<{scope:'site_oauth_atomic_producer';externalOriginQualified:false;readyToReopen:false}>;
export type SiteOAuthProfile=Readonly<{sql:string;binds:readonly unknown[]}>;
export type SiteOAuthSummary=Readonly<{ticketId:string;state:'acknowledged_local'|'unknown';externalOriginQualified:false;providerDrainQualified:false;readyToReopen:false}>;
type Method={receiver:object;owner:object;fn:Function};
type Identity={id:string;username:string;global_name:string|null;avatar:string|null};
type Reply=D1Result&{privacySubject:PrivacySubject};
type Origin={env:Env;native:D1Database;prepare:Method;batch:Method;metadata:object;metadataTuple:string;namespace:object|null;servingSecret:string|null;mode:'off'|'configured';slots:readonly Slot[];request:Request;requestTuple:string;callbackRequest:Request;callbackTuple:string;consumer:{env:Env;slots:readonly Slot[]}|null;authTuple:string;cookieSecret:string;config:ServingOriginalConfig|null;writeEpoch:string;layout:AdmissionLayout;client:ServingGateClient|null;url:string;created:number;expires:number;id:string;nonce:string;accountBound:boolean;userInput:object|null;user:Identity|null;captureInput:PrivacySubject|null;capture:PrivacySubject|null;issuedAt:number|null;spent:boolean;nativeSpent:boolean;lastClock:number;nativeSnapshot:NativeProfileSnapshot|null;nativeReplyValue:object|null;nativeReplyWitness:(()=>void)|null;phase:'captured'|'running'|'terminal'|'unknown';result:SiteOAuthSummary|null};
const origins=new WeakMap<SiteOAuthOrigin,Origin>();
const held=():never=>{throw new RecoveryFloorHeld();};
const hex=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length===n&&!/[^0-9a-f]/.test(v);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
function data(o:object,key:string):unknown{const d=Object.getOwnPropertyDescriptor(o,key);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;}
function optional(o:object,key:string):unknown{const d=Object.getOwnPropertyDescriptor(o,key);if(!d){if(key in o)return held();return undefined;}if(!Object.hasOwn(d,'value'))return held();return d.value;}
function method(receiver:object,name:string):Method{let owner:object|null=receiver;for(let depth=0;depth<4&&owner&&owner!==Object.prototype;depth++){const d=Object.getOwnPropertyDescriptor(owner,name);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return held();return{receiver,owner,fn:d.value};}owner=Object.getPrototypeOf(owner);}return held();}
function same(m:Method,name:string):void{const n=method(m.receiver,name);if(n.owner!==m.owner||n.fn!==m.fn)return held();}
function meta(o:object):string{const id=data(o,'id'),tag=data(o,'tag'),timestamp=data(o,'timestamp');if(typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)||typeof tag!=='string'||tag.length>1024||typeof timestamp!=='string'||timestamp.length>128)return held();return JSON.stringify([id,tag,timestamp]);}
function auth(env:Env):string{return JSON.stringify(['SITE_HOST','PUBLIC_BASE_URL','SITE_GUILD_ID','DISCORD_APP_ID','DISCORD_CLIENT_SECRET','COOKIE_SECRET'].map(key=>{const value=data(env,key);if(typeof value!=='string'||value.length>4096)return held();return value;}));}
function user(value:object):Identity{const id=data(value,'id'),username=data(value,'username'),global=optional(value,'global_name')??null,avatar=optional(value,'avatar')??null;if(optional(value,'bot')||avatar!==null&&(typeof avatar!=='string'||avatar.length>4096)||typeof id!=='string'||!/^\d{17,20}$/.test(id)||typeof username!=='string'||!username||username.length>4096||global!==null&&(typeof global!=='string'||global.length>4096))return held();return Object.freeze({id,username:username.slice(0,64),global_name:global===null?null:(global as string).slice(0,64),avatar:avatar as string|null});}
function subject(value:PrivacySubject|null,id:string):PrivacySubject|null{if(value===null)return null;if(!value||Reflect.ownKeys(value).sort().join('|')!=='revision|state|subject|subjectGeneration')return held();const generation=data(value,'subjectGeneration'),state=data(value,'state'),revision=data(value,'revision');if(data(value,'subject')!==id||!hex(generation,32)||!['active','retiring','retired'].includes(state as string)||!integer(revision))return held();return Object.freeze({subject:id,subjectGeneration:generation,state:state as PrivacySubject['state'],revision});}
const PRIVATE=['PRIVACY_RECOVERY_FLOOR','PRIVACY_SERVING_GATE_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID'] as const;
const FIELDS=[...PRIVATE,'PRIVACY_ERASURE_ENABLED','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_EPOCH','PRIVACY_WRITE_ADMISSION_LAYOUT','CF_VERSION_METADATA','SITE_HOST','PUBLIC_BASE_URL','SITE_GUILD_ID','DISCORD_APP_ID','DISCORD_CLIENT_SECRET','COOKIE_SECRET'] as const;
type Slot=Readonly<{key:string;present:boolean;descriptor:PropertyDescriptor|null}>;
type CallbackInput=Readonly<{env:Env;request:Request;url:URL}>;
const NativeRequest=Request,NativeHeaders=Headers,requestSlots=Object.getOwnPropertyDescriptors(NativeRequest.prototype),headerSlot=Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get')!,headerGet=headerSlot.value as typeof Headers.prototype.get;
function descriptorEqual(a:PropertyDescriptor|undefined,b:PropertyDescriptor):boolean{return !!a&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;}
function slot(env:object,key:string):Slot{const d=Object.getOwnPropertyDescriptor(env,key);if(!d){if(key in env)return held();return Object.freeze({key,present:false,descriptor:null});}if(!Object.hasOwn(d,'value'))return held();return Object.freeze({key,present:true,descriptor:Object.freeze({...d})});}
function slotsCurrent(env:object,old:readonly Slot[]):void{for(const s of old){const d=Object.getOwnPropertyDescriptor(env,s.key);if(s.present?!descriptorEqual(d,s.descriptor!):!!d||s.key in env)return held();}}
function servingMode(env:Env):'off'|'configured'{const values=PRIVATE.map(key=>slot(env,key)),erasure=slot(env,'PRIVACY_ERASURE_ENABLED');if(erasure.present&&typeof erasure.descriptor!.value!=='string')return held();if(values.every(v=>!v.present)){if(erasure.descriptor?.value==='true')return held();return 'off';}if(values.some(v=>!v.present))return held();const ns=values[0]!.descriptor!.value,secret=values[1]!.descriptor!.value,ce=values[2]!.descriptor!.value,tree=values[3]!.descriptor!.value,id=values[4]!.descriptor!.value,we=data(env,'PRIVACY_WRITE_ADMISSION_EPOCH');if(!ns||typeof ns!=='object'||typeof secret!=='string'||secret.length<32||secret.length>4096||!/^[\x21-\x7e]+$/.test(secret)||!hex(ce,32)||!hex(tree,40)||id!==DATABASE||ce===we)return held();return 'configured';}
function requestSnapshot(request:Request):Readonly<{tuple:string;url:string;cookie:string;address:string}>{
 if(Request!==NativeRequest||Headers!==NativeHeaders||!(request instanceof NativeRequest))return held();
 for(const key of ['url','method','headers'])if(!descriptorEqual(Object.getOwnPropertyDescriptor(NativeRequest.prototype,key),requestSlots[key]!))return held();
 if(!descriptorEqual(Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get'),headerSlot))return held();
 const url=requestSlots.url!.get!.call(request) as string,verb=requestSlots.method!.get!.call(request) as string,headers=requestSlots.headers!.get!.call(request) as Headers,cookie=headerGet.call(headers,'Cookie')??'',address=headerGet.call(headers,'CF-Connecting-IP')??'';
 if(typeof url!=='string'||url.length>8192||verb!=='GET'||cookie.length>8192||address.length>128)return held();return Object.freeze({tuple:JSON.stringify([url,verb,cookie,address]),url,cookie,address});
}
function bindings(h:SiteOAuthOrigin):Origin{const o=origins.get(h);if(!o||'PRIVACY_RECOVERY_OPERATOR_SECRET'in o.env||'PRIVACY_RECOVERY_INITIALIZER_SECRET'in o.env)return held();slotsCurrent(o.env,o.slots);
 if(servingMode(o.env)!==o.mode||data(o.env,'DB')!==o.native||data(o.env,'PRIVACY_WRITE_ADMISSION_ENABLED')!=='true'||data(o.env,'PRIVACY_WRITE_ADMISSION_EPOCH')!==o.writeEpoch||data(o.env,'PRIVACY_WRITE_ADMISSION_LAYOUT')!==o.layout||data(o.env,'CF_VERSION_METADATA')!==o.metadata||meta(o.metadata)!==o.metadataTuple||auth(o.env)!==o.authTuple||requestSnapshot(o.request).tuple!==o.requestTuple||requestSnapshot(o.callbackRequest).tuple!==o.callbackTuple)return held();
 same(o.prepare,'prepare');same(o.batch,'batch');o.nativeSnapshot?.check();o.nativeReplyWitness?.();
 if(o.consumer){slotsCurrent(o.consumer.env,o.consumer.slots);if(!privacyAdmissionMatchesOriginalNative(privacyProviderCustodyDatabase(o.consumer.env),o.native))return held();}
 if(o.accountBound&&(JSON.stringify(user(o.userInput!))!==JSON.stringify(o.user)||JSON.stringify(subject(o.captureInput,o.user!.id))!==JSON.stringify(o.capture)))return held();return o;
}
/** One finite millisecond sample per boundary; original deadlines never move forward. */
function originalClock(o:Origin):number{const t=Date.now();if(!Number.isSafeInteger(t)||t<o.lastClock||t<o.created*1000||t>=o.expires*1000)return held();o.lastClock=t;return t;}
function current(h:SiteOAuthOrigin):Origin{const o=bindings(h);if(o.phase==='terminal'||o.phase==='unknown')return held();originalClock(o);return o;}
function currentConfigured(h:SiteOAuthOrigin):Origin&{config:ServingOriginalConfig;client:ServingGateClient}{const o=current(h);if(o.mode!=='configured'||!o.config||!o.client)return held();return o as Origin&{config:ServingOriginalConfig;client:ServingGateClient};}
const random=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function digest(value:unknown):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');}

/** Genuine source entry captures the original mode, native Request, binding slots and methods before its first await. */
export function captureSiteOAuthOrigin(request:Request,env:Env):SiteOAuthOrigin{
 const snapshot=requestSnapshot(request),url=new URL(snapshot.url),host=data(env,'SITE_HOST');if(typeof host!=='string'||!host.trim()||url.protocol!=='https:'||url.hostname!==host.trim().toLowerCase()||url.port||url.pathname!=='/auth/callback'||url.hash||url.username||url.password)return held();
 const mode=servingMode(env),native=data(env,'DB'),metadata=data(env,'CF_VERSION_METADATA'),we=data(env,'PRIVACY_WRITE_ADMISSION_EPOCH'),layout=data(env,'PRIVACY_WRITE_ADMISSION_LAYOUT');
 if(!native||typeof native!=='object'||isPrivacyWriteAdmissionDatabase(native as D1Database)||!metadata||typeof metadata!=='object'||!hex(we,32)||!(['canonical','recorded-live-20261010'].includes(layout as string)||mode==='off'&&layout==='recorded-live-pre-seal-20261017')||data(env,'PRIVACY_WRITE_ADMISSION_ENABLED')!=='true'||'PRIVACY_RECOVERY_OPERATOR_SECRET'in env||'PRIVACY_RECOVERY_INITIALIZER_SECRET'in env)return held();
 const metadataTuple=meta(metadata),authTuple=auth(env),cookieSecret=data(env,'COOKIE_SECRET');if(typeof cookieSecret!=='string'||!cookieSecret)return held();const slots=Object.freeze(FIELDS.map(key=>slot(env,key))),prepare=method(native,'prepare'),batch=method(native,'batch'),initialClock=Date.now(),created=Math.floor(initialClock/1000);if(!Number.isSafeInteger(initialClock)||!integer(created,1)||!Number.isSafeInteger((created+300)*1000))return held();
 let config:ServingOriginalConfig|null=null,client:ServingGateClient|null=null,namespace:object|null=null,servingSecret:string|null=null;
 if(mode==='configured'){const ce=data(env,'PRIVACY_CREDENTIAL_EPOCH'),tree=data(env,'PRIVACY_SERVING_SOURCE_TREE');namespace=data(env,'PRIVACY_RECOVERY_FLOOR') as object;servingSecret=data(env,'PRIVACY_SERVING_GATE_SECRET') as string;config=Object.freeze({credentialEpoch:ce as string,writeEpoch:we,sourceTree:tree as string,deploymentVersion:JSON.parse(metadataTuple)[0] as string});const mapped=Object.freeze({PRIVACY_RECOVERY_FLOOR:namespace,PRIVACY_SERVING_GATE_SECRET:servingSecret,PRIVACY_CREDENTIAL_EPOCH:ce,PRIVACY_WRITE_EPOCH:we}) as ServingGateEnvironment;client=createServingRecoveryGateClient(mapped,config);}
 const callbackRequest=Object.freeze(new NativeRequest(snapshot.url,{method:'GET',headers:new NativeHeaders({Cookie:snapshot.cookie,'CF-Connecting-IP':snapshot.address})})),callbackTuple=requestSnapshot(callbackRequest).tuple;
 const h=Object.freeze({scope:'site_oauth_atomic_producer' as const,externalOriginQualified:false as const,readyToReopen:false as const});
 origins.set(h,{env,native:native as D1Database,prepare,batch,metadata,metadataTuple,namespace,servingSecret,mode,slots,request,requestTuple:snapshot.tuple,callbackRequest,callbackTuple,consumer:null,authTuple,cookieSecret,config,writeEpoch:we,layout:layout as AdmissionLayout,client,url:snapshot.url,created,expires:created+300,id:random(),nonce:random(),accountBound:false,userInput:null,user:null,captureInput:null,capture:null,issuedAt:null,spent:false,nativeSpent:false,lastClock:initialClock,nativeSnapshot:null,nativeReplyValue:null,nativeReplyWitness:null,phase:'captured',result:null});
 if(client)bindServingGateClientWitness(client,()=>{bindings(h);});current(h);return h;
}

/** Only the existing central alias of this original native database is consumed; no raw DB is exported. */
export function siteOAuthCallbackInput(h:SiteOAuthOrigin,request:Request,env:Env):CallbackInput{
 const o=current(h);if(request!==o.request||o.consumer||auth(env)!==o.authTuple||!privacyAdmissionMatchesOriginalNative(privacyProviderCustodyDatabase(env),o.native))return held();
 const slots=Object.freeze([...FIELDS,'DB'].map(key=>slot(env,key)));o.consumer={env,slots};bindings(h);
 const descriptors=Object.getOwnPropertyDescriptors(env);for(const s of o.slots)if(s.present)descriptors[s.key]={value:s.descriptor!.value,writable:false,configurable:false,enumerable:true};
 const projected=Object.freeze(Object.create(Object.getPrototypeOf(env),descriptors)) as Env;
 return Object.freeze({env:projected,request:o.callbackRequest,url:new URL(o.url)});
}
/** Original preawait custody at each genuine callback continuation, including after terminal cookie crypto. */
export function assertSiteOAuthCallbackCustody(h:SiteOAuthOrigin):void{const o=bindings(h);if(o.phase==='unknown')return held();originalClock(o);}
/** State verification uses the captured original secret, with a boundary after each genuine crypto await. */
export async function verifySiteOAuthState(h:SiteOAuthOrigin,state:string,mac:string):Promise<boolean>{try{
 const o=current(h);if(typeof state!=='string'||state.length>2048||typeof mac!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(mac))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`olympus-site/state|${o.cookieSecret}`),{name:'HMAC',hash:'SHA-256'},false,['verify']);current(h);
 const pad=mac.length%4===0?'':'='.repeat(4-mac.length%4),bytes=Uint8Array.from(atob(mac.replace(/-/g,'+').replace(/_/g,'/')+pad),c=>c.charCodeAt(0));
 const valid=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(state));current(h);return valid;
 }catch{return false;}}

/** Genuine callback captures original me/G-or-absence/issuedAt before its awaited member lookup. */
export function captureSiteOAuthAccount(h:SiteOAuthOrigin,me:object,original:PrivacySubject|null,issuedAt:number|null):void{const o=current(h);if(o.accountBound||o.spent||issuedAt!==null&&!integer(issuedAt,1))return held();const projected=user(me),capture=subject(original,projected.id);o.accountBound=true;o.userInput=me;o.user=projected;o.captureInput=original;o.capture=capture;o.issuedAt=issuedAt;current(h);}

// These are the exact existing producer SQL strings, not caller-supplied identifiers or new guards.
const PROFILE=`INSERT INTO site_users (discord_id, username, global_name, nick, avatar, account_created, server_joined, first_login, last_login, checked_at, in_server, session_version)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8, 1, ?9)
     ON CONFLICT(discord_id) DO UPDATE SET username = ?2, global_name = ?3, nick = ?4, avatar = ?5, account_created = ?6,
       server_joined = ?7, last_login = ?8, checked_at = ?8, in_server = 1
     RETURNING session_version, account_incarnation`;
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const ALLOWED=`(CASE WHEN ?2 IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1)
 ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?2 AND revision=?3 AND state=?4
 AND (state='active' OR (state='retired' AND ?5 IS NOT NULL AND ?5>erased_at))) END)
 AND NOT EXISTS(SELECT 1 FROM privacy_denial_markers WHERE subject_key=?6 AND retain_until>${NOW})`;
const GUARD=`SELECT CASE WHEN ${ALLOWED} THEN 1 ELSE json_extract('privacy_oauth_refused','$') END AS admitted`;
const GENERATION=`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)
 VALUES(?1,?2,'active',1,${NOW},${NOW}) ON CONFLICT(subject_id) DO UPDATE SET
 generation=CASE WHEN state='retired' THEN ?2 ELSE generation END,state='active',revision=revision+1,updated_at=${NOW},retain_until=NULL
 WHERE state IN('active','retired') RETURNING subject_id AS subject,generation AS subjectGeneration,state,revision`;
function profile(value:SiteOAuthProfile,o:Origin):Readonly<{sql:string;binds:readonly (string|number|null)[]}>{if(!value||Reflect.ownKeys(value).sort().join('|')!=='binds|sql'||data(value,'sql')!==PROFILE)return held();const input=data(value,'binds');if(!Array.isArray(input)||data(input,'length')!==9||Reflect.ownKeys(input).sort().join('|')!=='0|1|2|3|4|5|6|7|8|length')return held();const values=Array.from({length:9},(_,i)=>data(input,String(i)));if(values.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number')||values[0]!==o.user!.id||values[1]!==o.user!.username||values[2]!==o.user!.global_name||values[3]!==null&&(typeof values[3]!=='string'||values[3].length>64)||values[4]!==null&&(typeof values[4]!=='string'||values[4].length>4096)||!integer(values[5])||values[6]!==null&&!integer(values[6])||!integer(values[7])||values[7]<o.created||values[7]>=o.expires||!integer(values[8],2)||values[8]>4294967297)return held();return Object.freeze({sql:PROFILE,binds:Object.freeze(values as (string|number|null)[])});}
type Plan=Readonly<{sql:string;binds:readonly (string|number|null)[]}>;
function plansCurrent(o:Origin,plans:readonly Plan[],p:ReturnType<typeof profile>):void{if(plans.length!==3||plans[0]!.sql!==GUARD||plans[1]!.sql!==GENERATION||plans[2]!.sql!==PROFILE)return held();const a=plans[0]!.binds,b=plans[1]!.binds;if(a.length!==6||a[0]!==o.user!.id||a[1]!==o.capture?.subjectGeneration&&!(a[1]===null&&o.capture===null)||a[2]!==o.capture?.revision&&!(a[2]===null&&o.capture===null)||a[3]!==o.capture?.state&&!(a[3]===null&&o.capture===null)||a[4]!==o.issuedAt||typeof a[5]!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(a[5])||b.length!==2||b[0]!==o.user!.id||!hex(b[1],32)||JSON.stringify(plans[2]!.binds)!==JSON.stringify(p.binds))return held();}
/** Exact original array/row data descriptors; mutation never runs a getter or mints a reply. */
function nativeProfileRow(value:object):object{const rows=data(value,'results');if(!Array.isArray(rows)||Reflect.ownKeys(rows).sort().join('|')!=='0|length'||data(rows,'length')!==1)return held();const row=data(rows,'0');if(!row||typeof row!=='object'||Array.isArray(row)||Reflect.ownKeys(row).join('|')!=='session_version|account_incarnation'||!integer(data(row,'session_version'),1)||!hex(data(row,'account_incarnation'),32))return held();return row;}
type NativeProfileSnapshot=Readonly<{outer:unknown[];result:object;rows:object[];row:object;v:number;n:string;cap:PrivacySubject;check:()=>void}>;
type NativeSlot=Readonly<{owner:object;key:string;descriptor:PropertyDescriptor}>;
function nativeSlot(owner:object,key:string):NativeSlot{const d=Object.getOwnPropertyDescriptor(owner,key);if(!d||!Object.hasOwn(d,'value'))return held();return Object.freeze({owner,key,descriptor:Object.freeze({...d})});}
function nativeSlotsCurrent(slots:readonly NativeSlot[]):void{for(const s of slots)if(!descriptorEqual(Object.getOwnPropertyDescriptor(s.owner,s.key),s.descriptor))return held();}
function exactNativeArray(value:unknown,length:number):unknown[]{if(!Array.isArray(value)||data(value,'length')!==length||Reflect.ownKeys(value).sort().join('|')!==[...Array.from({length},(_,i)=>String(i)),'length'].sort().join('|'))return held();for(let i=0;i<length;i++)data(value,String(i));return value;}
/** Raw Native batch ACK capture, before central/producer return, crypto digest or terminal awaits. */
function captureNativeProfile(h:SiteOAuthOrigin,value:unknown):unknown[]{const o=current(h);if(o.nativeSnapshot||!o.user)return held();const outer=exactNativeArray(value,7),slots:NativeSlot[]=[nativeSlot(outer,'length')];
 for(let i=0;i<7;i++){slots.push(nativeSlot(outer,String(i)));const r=data(outer,String(i));if(!r||typeof r!=='object'||data(r,'success')!==true||!Array.isArray(data(r,'results')))return held();slots.push(nativeSlot(r,'success'),nativeSlot(r,'results'));}
 const result=data(outer,'4') as object,rows=exactNativeArray(data(result,'results'),1) as object[],row=nativeProfileRow(result),generation=data(outer,'3') as object,gs=exactNativeArray(data(generation,'results'),1),gr=data(gs,'0');
 if(!gr||typeof gr!=='object')return held();const cap=subject(gr as PrivacySubject,o.user.id);if(!cap||cap.state!=='active')return held();const v=data(row,'session_version') as number,n=data(row,'account_incarnation') as string;
 for(const a of [rows,gs])slots.push(nativeSlot(a,'length'),nativeSlot(a,'0'));for(const key of ['session_version','account_incarnation'])slots.push(nativeSlot(row,key));for(const key of ['subject','subjectGeneration','state','revision'])slots.push(nativeSlot(gr,key));
 const check=()=>{nativeSlotsCurrent(slots);exactNativeArray(outer,7);exactNativeArray(rows,1);exactNativeArray(gs,1);if(nativeProfileRow(result)!==row||data(row,'session_version')!==v||data(row,'account_incarnation')!==n||data(gs,'0')!==gr||JSON.stringify(subject(gr as PrivacySubject,o.user!.id))!==JSON.stringify(cap))return held();};
 const snapshot=Object.freeze({outer,result,rows,row,v,n,cap,check});o.nativeSnapshot=snapshot;check();current(h);return outer;
}
/** The producer reply must retain the ORIGINAL native array/row/scalars and acknowledged G. */
function nativeReply(value:unknown,o:Origin):Reply{if(!value||typeof value!=='object')return held();const w=o.nativeSnapshot??held();w.check();const capValue=data(value,'privacySubject'),cap=subject(capValue as PrivacySubject,o.user!.id);
 if(nativeProfileRow(value)!==w.row||data(value,'results')!==w.rows||!cap||JSON.stringify(cap)!==JSON.stringify(w.cap)||data(value,'success')!==true)return held();
 if(o.nativeReplyValue){if(value!==o.nativeReplyValue)return held();o.nativeReplyWitness?.();}
 else{const slots=[nativeSlot(value,'success'),nativeSlot(value,'results'),nativeSlot(value,'privacySubject')];if(!capValue||typeof capValue!=='object')return held();for(const key of ['subject','subjectGeneration','state','revision'])slots.push(nativeSlot(capValue,key));o.nativeReplyValue=value;o.nativeReplyWitness=()=>{nativeSlotsCurrent(slots);w.check();};o.nativeReplyWitness();}
 return value as Reply;
}

/** The only native dispatch accepts source-generated SQL/binds and the original acknowledged D1 child. */
async function native(h:SiteOAuthOrigin,parent:ServingContext,child:ServingContext,plans:readonly Plan[],p:ReturnType<typeof profile>,intent:string,rootDigest:string):Promise<D1Result[]>{const o=currentConfigured(h),pc=servingContextCustody(parent),cc=servingContextCustody(child),tuple=JSON.parse(cc.nativeTuple) as unknown[],parentTuple=JSON.parse(pc.nativeTuple) as unknown[];if(o.nativeSpent)return held();o.nativeSpent=true;plansCurrent(o,plans,p);if(pc.id!==o.id||parentTuple[1]!==null||parentTuple[4]!=='fetch'||parentTuple[5]!==o.nonce||parentTuple[6]!==rootDigest||tuple[1]!==parent.ticketId||tuple[4]!=='d1'||tuple[6]!==intent||pc.createdAt!==o.created||pc.expiresAt!==o.expires||cc.createdAt!==o.created||cc.expiresAt!==o.expires)return held();const observed:{method:Method;name:string}[]=[],raws=new WeakMap<object,D1PreparedStatement>();const check=()=>{current(h);servingContextCustody(parent);servingContextCustody(child);for(const m of observed)same(m.method,m.name);};const own=(receiver:object,name:string)=>{const m=method(receiver,name);observed.push({method:m,name});return m;};const protect=(raw:D1PreparedStatement):D1PreparedStatement=>{const bind=own(raw,'bind'),wrapper=Object.freeze({bind(...values:unknown[]){check();const next=Reflect.apply(bind.fn,bind.receiver,values) as D1PreparedStatement;check();return protect(next);}});raws.set(wrapper,raw);return wrapper as unknown as D1PreparedStatement;};const safe={prepare(sql:string){check();const raw=Reflect.apply(o.prepare.fn,o.prepare.receiver,[sql]) as D1PreparedStatement;check();return protect(raw);},async batch(statements:D1PreparedStatement[]){check();if(statements.length!==7)return held();const original=statements.map(s=>{const raw=raws.get(s as object);if(!raw)return held();return raw;});const result=await Reflect.apply(o.batch.fn,o.batch.receiver,[Object.freeze(original)]) as unknown;const acknowledged=captureNativeProfile(h,result);check();return acknowledged;}} as unknown as D1Database;const admitted=createPrivacyWriteAdmissionDatabase(safe,'writer',o.layout,o.config.writeEpoch),prepare=admitted.prepare,prepared=plans.map(plan=>{check();const raw=Reflect.apply(prepare,admitted,[plan.sql]) as D1PreparedStatement,bind=own(raw,'bind'),bound=Reflect.apply(bind.fn,bind.receiver,[...plan.binds]) as D1PreparedStatement;check();return bound;});const batch=own(admitted,'batch');const out=await Reflect.apply(batch.fn,batch.receiver,[prepared]) as D1Result[];check();if(out.length!==3)return held();return out;}

/** Existing admittedPrivacyOAuthWrite creates the complete inert atomic plan before the sole D1 claim.
 * No provider or native prepare begins inside this producer before the exact original claim ACK. */
async function dispatchConfiguredSiteOAuthProfile(h:SiteOAuthOrigin,value:SiteOAuthProfile):Promise<Reply>{const o=currentConfigured(h);if(!o.accountBound||o.spent)return held();o.spent=true;const p=profile(value,o);o.phase='running';const saved=(state:SiteOAuthSummary['state'])=>Object.freeze({ticketId:o.id,state,externalOriginQualified:false as const,providerDrainQualified:false as const,readyToReopen:false as const});try{const rootDigest=await digest(['site-oauth-atomic-root-v1',o.url,o.config,DATABASE,o.layout,o.user,o.capture,o.issuedAt,p]);current(h);const floor=await readServingRecoveryFloor(o.client);current(h);const invocation=prepareServingInvocation(o.client,floor,{ticketId:o.id,purpose:'fetch',nonce:o.nonce,requestDigest:rootDigest,createdAt:o.created,expiresAt:o.expires},async parent=>{current(h);const recorded=new WeakMap<object,Plan>();let preparedCount=0,batched=false;const producer={prepare(sql:unknown){current(h);if(typeof sql!=='string'||![PROFILE,GUARD,GENERATION].includes(sql)||++preparedCount>3)return held();const statement=Object.freeze({bind(...values:unknown[]){current(h);if(values.length>9||values.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'||typeof v==='number'&&!Number.isSafeInteger(v)))return held();const bound=Object.freeze({});recorded.set(bound,Object.freeze({sql,binds:Object.freeze([...values] as (string|number|null)[])}));return bound;}});return statement;},async batch(statements:D1PreparedStatement[]){current(h);if(batched||preparedCount!==3||statements.length!==3)return held();batched=true;const plans=Object.freeze(statements.map(s=>{const plan=recorded.get(s as object);if(!plan)return held();return plan;}));plansCurrent(o,plans,p);const childId=random(),childNonce=random(),intent=await digest(['site-oauth-atomic-d1-v1',servingContextCustody(parent).nativeTuple,o.config,DATABASE,o.layout,o.user,o.capture,o.issuedAt,childId,childNonce,plans]);current(h);const result=await runServingChild<D1Result[]>(parent,{ticketId:childId,purpose:'d1',nonce:childNonce,requestDigest:intent},async child=>{current(h);const out=await native(h,parent,child,plans,p,intent,rootDigest);current(h);const resultDigest=await digest(['site-oauth-atomic-native-result-v1',intent,out]);current(h);return{kind:'known_local' as const,value:out,resultDigest};});current(h);if(!result.claimed||result.state!=='settled'||!result.nativeTerminal||!result.value)return held();return result.value;}} as unknown as D1Database;const producerEnv={COOKIE_SECRET:o.cookieSecret,DB:producer} as Env;const statement=producer.prepare(p.sql).bind(...p.binds);const reply=nativeReply(await admittedPrivacyOAuthWrite(producerEnv,o.user!.id,o.capture,o.issuedAt,statement),o);current(h);const resultDigest=await digest(['site-oauth-atomic-known-local-v1',rootDigest,reply.privacySubject,(reply.results[0] as {session_version:number;account_incarnation:string}).session_version,(reply.results[0] as {session_version:number;account_incarnation:string}).account_incarnation]);current(h);return{kind:'known_local' as const,value:reply,resultDigest};});const result=await dispatchServingInvocation<Reply>(invocation);current(h);if(!result.claimed||result.state!=='settled'||!result.nativeTerminal||!result.value)return held();const reply=nativeReply(result.value,o);o.phase='terminal';o.result=saved('acknowledged_local');return reply;}catch{o.phase='unknown';o.result=saved('unknown');return held();}}
type CookieReceipt={h:SiteOAuthOrigin;reply:Reply;row:object;capture:PrivacySubject;session:OriginalSiteSession;spent:boolean};
const cookieReceipts=new WeakMap<object,CookieReceipt>();
function rememberCookieReceipt(h:SiteOAuthOrigin,reply:Reply,p:ReturnType<typeof profile>):Reply{
 const o=bindings(h);if(o.phase!=='terminal'||!o.result||o.result.state!=='acknowledged_local'||cookieReceipts.has(reply))return held();originalClock(o);
 nativeReply(reply,o);const w=o.nativeSnapshot??held();w.check();const {row,cap,v,n}=w,created=p.binds[7];
 if(!integer(created,1)||!integer(v,1)||!hex(n,32)||!Number.isSafeInteger((created+INCARNATION_SESSION_SECONDS)*1000))return held();
 const session=canonicalSiteSession(Object.assign(Object.create(null),{u:o.user!.id,v,e:created+INCARNATION_SESSION_SECONDS,g:cap.subjectGeneration,n}));
 cookieReceipts.set(reply,{h,reply,row,capture:cap,session,spent:false});return reply;
}
function currentCookieReceipt(h:SiteOAuthOrigin,reply:Reply,r:CookieReceipt,afterSpend=false):Origin{
 const o=bindings(h),t=Math.floor(originalClock(o)/1000);
 if(r.h!==h||r.reply!==reply||r.spent!==afterSpend||o.phase!=='terminal'||!o.result||o.result.state!=='acknowledged_local'||!integer(t,1)||t>=r.session.e)return held();
 const row=nativeProfileRow(reply);if(row!==r.row||data(row,'session_version')!==r.session.v||data(row,'account_incarnation')!==r.session.n)return held();
 const cap=subject(data(reply,'privacySubject') as PrivacySubject,r.session.u);if(!cap||JSON.stringify(cap)!==JSON.stringify(r.capture)||cap.subjectGeneration!==r.session.g)return held();return o;
}
/** One-use actual native reply only. No exported Env/id/version/nonce tuple issuer. */
export async function signSiteOAuthCookie(h:SiteOAuthOrigin,reply:Reply):Promise<string>{
 const r=cookieReceipts.get(reply);if(!r)return held();const o=currentCookieReceipt(h,reply,r),body=canonicalSiteSessionBody(r.session);
 // Spend before crypto; losing a signing reply never repairs/replays an old native acknowledgment.
 r.spent=true;
 const check=()=>{currentCookieReceipt(h,reply,r,true);};
 try{
  check();const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`olympus-site/${INCARNATION_SESSION_PURPOSE}|${o.cookieSecret}`),{name:'HMAC',hash:'SHA-256'},false,['sign']);check();
  const raw=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body));check();
  const mac=btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const remaining=Math.min(INCARNATION_SESSION_SECONDS,r.session.e-Math.floor(originalClock(o)/1000));if(!integer(remaining,1))return held();
  return `__Host-olg=${body}.${mac}; Max-Age=${remaining}; Path=/; HttpOnly; Secure; SameSite=Lax`;
 }catch{return held();}
}

/** Local OFF uses the actual producer/registered central writer, not a configured root downgrade. */
async function dispatchLocalSiteOAuthProfile(h:SiteOAuthOrigin,value:SiteOAuthProfile):Promise<Reply>{
 const o=current(h);if(o.mode!=='off'||!o.accountBound||o.spent||o.nativeSpent)return held();o.spent=true;o.phase='running';const p=profile(value,o);
 const saved=(state:SiteOAuthSummary['state'])=>Object.freeze({ticketId:o.id,state,externalOriginQualified:false as const,providerDrainQualified:false as const,readyToReopen:false as const});
 try{
  const records=new WeakMap<object,Plan>();let prepared=0,used=false;
  const producer={prepare(sql:unknown){current(h);if(typeof sql!=='string'||![PROFILE,GUARD,GENERATION].includes(sql)||++prepared>3)return held();return Object.freeze({bind(...values:unknown[]){current(h);if(values.length>9||values.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'||typeof v==='number'&&!Number.isSafeInteger(v)))return held();const statement=Object.freeze({});records.set(statement,Object.freeze({sql,binds:Object.freeze([...values] as (string|number|null)[])}));return statement;}});},async batch(statements:D1PreparedStatement[]){
   current(h);if(used||prepared!==3||statements.length!==3)return held();used=true;
   const plans=Object.freeze(statements.map(s=>{const plan=records.get(s as object);return plan??held();}));plansCurrent(o,plans,p);
   if(o.nativeSpent)return held();o.nativeSpent=true;
   const observed:{method:Method;name:string}[]=[],raws=new WeakMap<object,D1PreparedStatement>();
   const check=()=>{current(h);for(const m of observed)same(m.method,m.name);};
   const ownMethod=(receiver:object,name:string)=>{const m=method(receiver,name);observed.push({method:m,name});return m;};
   const protect=(raw:D1PreparedStatement):D1PreparedStatement=>{const bind=ownMethod(raw,'bind'),wrapper=Object.freeze({bind(...v:unknown[]){check();const next=Reflect.apply(bind.fn,bind.receiver,v) as D1PreparedStatement;check();return protect(next);}});raws.set(wrapper,raw);return wrapper as unknown as D1PreparedStatement;};
   const safe={prepare(sql:string){check();const raw=Reflect.apply(o.prepare.fn,o.prepare.receiver,[sql]) as D1PreparedStatement;check();return protect(raw);},async batch(input:D1PreparedStatement[]){check();if(input.length!==7)return held();const selected=input.map(s=>raws.get(s as object)??held());const out=await Reflect.apply(o.batch.fn,o.batch.receiver,[Object.freeze(selected)]) as unknown;const acknowledged=captureNativeProfile(h,out);check();return acknowledged;}} as unknown as D1Database;
   const admitted=createPrivacyWriteAdmissionDatabase(safe,'writer',o.layout,o.writeEpoch),prepare=admitted.prepare;
   const bound=plans.map(plan=>{check();const statement=Reflect.apply(prepare,admitted,[plan.sql]) as D1PreparedStatement,bind=ownMethod(statement,'bind'),out=Reflect.apply(bind.fn,bind.receiver,[...plan.binds]) as D1PreparedStatement;check();return out;});
   const batch=ownMethod(admitted,'batch'),out=await Reflect.apply(batch.fn,batch.receiver,[bound]) as D1Result[];check();if(out.length!==3)return held();return out;
  }} as unknown as D1Database;
  const producerEnv={COOKIE_SECRET:o.cookieSecret,DB:producer} as Env;
  const write=producer.prepare(p.sql).bind(...p.binds),reply=nativeReply(await admittedPrivacyOAuthWrite(producerEnv,o.user!.id,o.capture,o.issuedAt,write),o);current(h);
  o.phase='terminal';o.result=saved('acknowledged_local');return rememberCookieReceipt(h,reply,p);
 }catch{o.phase='unknown';o.result=saved('unknown');return held();}
}

/** Public source dispatcher selects its ORIGINAL mode once; a configured failure never enters OFF. */
export async function dispatchSiteOAuthProfile(h:SiteOAuthOrigin,value:SiteOAuthProfile):Promise<Reply>{
 const o=current(h);if(o.mode==='off')return dispatchLocalSiteOAuthProfile(h,value);
 if(o.mode!=='configured')return held();const p=profile(value,o),reply=await dispatchConfiguredSiteOAuthProfile(h,value);return rememberCookieReceipt(h,reply,p);
}

/** Saved local correlation only. It cannot issue an action, retry, generation or current provider witness. */
export function observeSiteOAuthProfile(h:SiteOAuthOrigin):SiteOAuthSummary{const o=origins.get(h);if(!o||!o.spent||!o.result)return held();return o.result;}
