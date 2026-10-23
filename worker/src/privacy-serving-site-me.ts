/** Exact /api/me custody only. OFF is the legacy path outside tickets; erasure cannot use it.
 * Local tickets do not fence same-ID account recreation, qualify platform origin or prove drain. */
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import type {Env} from './env';
import {nativeErasureMode} from './privacy-native-mode';
import {currentUser,readSession,apiJson,SESSION_COOKIE,ON_BOARD,ROLE_OF_FIRST,type SiteUser} from './site-core';
import {meData} from './site-api';
import {ensureSchema} from './schema';
import {PRIVACY_ADMISSION_SCHEMA_PROOF_SQL,createPrivacyWriteAdmissionDatabase,isPrivacyWriteAdmissionDatabase,type AdmissionLayout} from './privacy-write-admission';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PHYSICAL_EXPECTED_JSON} from './privacy-write-admission-catalogue';
import {privacyBoundSiteEnv,privacyGenerationLiteralFenceSql,privacyGenerationFenceSql,PRIVACY_DB_NOW,PrivacySiteRequestHeld} from './privacy-serving-authority';
import {createServingRecoveryGateClient,bindServingGateClientWitness,readServingRecoveryFloor,type ServingGateClient,type ServingOriginalConfig,type ServingGateEnvironment} from './privacy-serving-recovery-gate-client';
import {prepareServingInvocation,dispatchServingInvocation,runServingChild,servingContextCustody,type ServingContext} from './privacy-serving-recovery-context';

const DATABASE='7e2cf8fd-a9e3-48f6-975a-890f1360e5d0';
const PRIVATE=['PRIVACY_RECOVERY_FLOOR','PRIVACY_SERVING_GATE_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID'] as const;
const FIELDS=[...PRIVATE,'PRIVACY_ERASURE_ENABLED','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_EPOCH','PRIVACY_WRITE_ADMISSION_LAYOUT','CF_VERSION_METADATA','COOKIE_SECRET','SITE_HOST','SITE_GUILD_ID','SITE_ADMINS','PUBLIC_BASE_URL','SITE_LEGACY_HOSTS','NAME_RESERVATION_AT','LAUNCH_AT','GUILD_MEMBER_CAP','LINKS_NOT_BEFORE','GUILD_ID','CHANNEL_VISITOR_CHAT'] as const;
const USER_FIELDS=['discord_id','account_incarnation','privacyGeneration','username','global_name','nick','avatar','account_created','server_joined','first_login','last_login','checked_at','in_server','session_version','denied','denied_reason','denied_at','denied_by'] as const;
type Method=Readonly<{receiver:object;owner:object;fn:Function}>;
type Slot=Readonly<{key:string;present:boolean;value:unknown}>;
type Session=Readonly<{u:string;v:number;e:number;g:string|null;n:string}>;
type Plan=Readonly<{sql:string;values:readonly (string|number|null)[]|null}>;
type Group=Readonly<{label:string;method:'first'|'all'|'batch';plans:readonly Plan[]}>;
type RawRecord={raw:D1PreparedStatement;plan:Plan;bound:boolean;methods:ReadonlyMap<string,Method|null>};
type Active={child:ServingContext;label:string;expected:readonly Plan[];prepared:RawRecord[];nativeStarted:boolean;direct:boolean};
export type SiteMeOrigin=Readonly<{scope:'site_me_original_read';externalOriginQualified:false;readyToReopen:false}>;
type Origin={env:Env;request:Request;requestTuple:string;authRequest:Request;authTuple:string;cookie:string;slots:readonly Slot[];native:D1Database;prepare:Method;batch:Method;metadata:object;metadataTuple:string;config:ServingOriginalConfig;layout:AdmissionLayout;client:ServingGateClient;created:number;expires:number;id:string;nonce:string;phase:'captured'|'running'|'terminal'|'unknown';spent:boolean;session:Session|null;originalRead:OriginalSiteSession|null;user:Readonly<SiteUser>|null;active:Active|null;admitted:D1Database|null;sourceEnv:Env|null;dataIndex:number;dataGroups:readonly Group[];failed:boolean};
const origins=new WeakMap<SiteMeOrigin,Origin>();
const held=():never=>{throw new PrivacySiteRequestHeld();};
const hex=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length===n&&!/[^0-9a-f]/.test(v);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const random=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function digest(v:unknown):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function data(o:object,key:string):unknown{const d=Object.getOwnPropertyDescriptor(o,key);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;}
function slot(o:object,key:string):Slot{const d=Object.getOwnPropertyDescriptor(o,key);if(!d){if(key in o)return held();return Object.freeze({key,present:false,value:undefined});}if(!Object.hasOwn(d,'value'))return held();return Object.freeze({key,present:true,value:d.value});}
function methodSlot(receiver:object,name:string):Method|null{let owner:object|null=receiver;for(let i=0;i<4&&owner&&owner!==Object.prototype;i++){const d=Object.getOwnPropertyDescriptor(owner,name);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')return held();return Object.freeze({receiver,owner,fn:d.value});}owner=Object.getPrototypeOf(owner);}return null;}
function method(receiver:object,name:string):Method{const m=methodSlot(receiver,name);return m??held();}
function same(m:Method,name:string):void{const now=method(m.receiver,name);if(now.owner!==m.owner||now.fn!==m.fn)return held();}
function sameSlot(receiver:object,name:string,old:Method|null):void{const now=methodSlot(receiver,name);if(now?.owner!==old?.owner||now?.fn!==old?.fn)return held();}
function boundedString(v:unknown,maximum=4096):v is string{return typeof v==='string'&&v.length<=maximum&&!v.includes('\0');}
function metadata(v:object):string{const id=data(v,'id'),tag=data(v,'tag'),timestamp=data(v,'timestamp');if(!uuid(id)||!boundedString(tag,1024)||!boundedString(timestamp,128))return held();return JSON.stringify([id,tag,timestamp]);}
/** Absent is inspected without invoking accessors; existing metadata/admission alone do not enable this route. */
export function siteMeServingMode(env:Env):'off'|'configured'|'held'{try{
 if(nativeErasureMode(env))return 'off';
 const entries=PRIVATE.map(key=>slot(env,key)),erasure=slot(env,'PRIVACY_ERASURE_ENABLED');
 if(erasure.present&&typeof erasure.value!=='string')return 'held';
 if(entries.every(v=>!v.present))return erasure.value==='true'?'held':'off';
 if(entries.some(v=>!v.present))return 'held';
 const values=entries.map(v=>v.value),ce=values[2],tree=values[3];
 if(!values[0]||typeof values[0]!=='object'||!boundedString(values[1])||(values[1] as string).length<32||!/^[\x21-\x7e]+$/.test(values[1] as string)||!hex(ce,32)||!hex(tree,40)||values[4]!==DATABASE)return 'held';
 const we=data(env,'PRIVACY_WRITE_ADMISSION_EPOCH'),layout=data(env,'PRIVACY_WRITE_ADMISSION_LAYOUT'),meta=data(env,'CF_VERSION_METADATA');
 if(data(env,'PRIVACY_WRITE_ADMISSION_ENABLED')!=='true'||!hex(we,32)||ce===we||!['canonical','recorded-live-20261010'].includes(layout as string)||!meta||typeof meta!=='object')return 'held';
 metadata(meta);if('PRIVACY_RECOVERY_OPERATOR_SECRET'in env||'PRIVACY_RECOVERY_INITIALIZER_SECRET'in env)return 'held';return 'configured';
 }catch{return 'held';}}

// Genuine platform getters are captured once, never replaced by request-owned getters.
const NativeRequest=Request,NativeHeaders=Headers,requestGetters=Object.getOwnPropertyDescriptors(NativeRequest.prototype),headerGet=Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get')!.value as typeof Headers.prototype.get;
function requestTuple(request:Request):{tuple:string;cookie:string}{
 if(Request!==NativeRequest||Headers!==NativeHeaders||!(request instanceof NativeRequest))return held();
 for(const name of ['url','method','headers'])if(Object.getOwnPropertyDescriptor(Request.prototype,name)?.get!==requestGetters[name]?.get)return held();
 const headerSlot=Object.getOwnPropertyDescriptor(NativeHeaders.prototype,'get');if(!headerSlot||!Object.hasOwn(headerSlot,'value')||headerSlot.value!==headerGet)return held();
 const url=requestGetters.url!.get!.call(request) as string,verb=requestGetters.method!.get!.call(request) as string,headers=requestGetters.headers!.get!.call(request) as Headers;
 const raw=headerGet.call(headers,'Cookie')??'',origin=headerGet.call(headers,'Origin'),fetchSite=headerGet.call(headers,'Sec-Fetch-Site'),csrf=headerGet.call(headers,'X-Olympus');
 if(url.length>8192||raw.length>8192||verb!=='GET')return held();
 return {tuple:JSON.stringify([url,verb,raw,origin,fetchSite,csrf]),cookie:raw};
}
function bindings(o:Origin):void{
 for(const old of o.slots){const now=slot(o.env,old.key);if(now.present!==old.present||now.value!==old.value)return held();}
 if(siteMeServingMode(o.env)!=='configured'||data(o.env,'DB')!==o.native||data(o.env,'CF_VERSION_METADATA')!==o.metadata||metadata(o.metadata)!==o.metadataTuple||requestTuple(o.request).tuple!==o.requestTuple||requestTuple(o.authRequest).tuple!==o.authTuple)return held();
 same(o.prepare,'prepare');same(o.batch,'batch');
}
function current(o:Origin):void{if(o.originalRead)assertOriginalSiteSessionRead(o.originalRead);bindings(o);const t=Date.now();if(o.phase==='terminal'||o.phase==='unknown'||!Number.isSafeInteger(t)||t<o.created*1000||t>=o.expires*1000||o.session&&t>=o.session.e*1000||o.failed)return held();}
/** Source entry calls synchronously before facade substitution, schema/auth awaits or private gate fetches. */
export function captureServingSiteMeOrigin(request:Request,env:Env):SiteMeOrigin{
 if(siteMeServingMode(env)!=='configured')return held();const snapshot=requestTuple(request),url=new URL(JSON.parse(snapshot.tuple)[0] as string),host=data(env,'SITE_HOST');
 if(!boundedString(host)||!host.trim()||url.protocol!=='https:'||url.hostname!==host.trim().toLowerCase()||url.port||url.username||url.password||url.hash||url.pathname.replace(/\/+$/,'')!=='/api/me')return held();
 const native=data(env,'DB'),meta=data(env,'CF_VERSION_METADATA'),cookieSecret=data(env,'COOKIE_SECRET'),guild=data(env,'SITE_GUILD_ID');
 if(!native||typeof native!=='object'||isPrivacyWriteAdmissionDatabase(native as D1Database)||!meta||typeof meta!=='object'||!boundedString(cookieSecret)||!cookieSecret||typeof guild!=='string'||!/^\d{17,20}$/.test(guild))return held();
 const slots=Object.freeze(FIELDS.map(key=>slot(env,key)));for(const v of slots)if(v.present&&!PRIVATE.includes(v.key as typeof PRIVATE[number])&&v.key!=='CF_VERSION_METADATA'&&!boundedString(v.value))return held();
 const tuple=metadata(meta),config=Object.freeze({credentialEpoch:data(env,'PRIVACY_CREDENTIAL_EPOCH') as string,writeEpoch:data(env,'PRIVACY_WRITE_ADMISSION_EPOCH') as string,sourceTree:data(env,'PRIVACY_SERVING_SOURCE_TREE') as string,deploymentVersion:JSON.parse(tuple)[0] as string}),layout=data(env,'PRIVACY_WRITE_ADMISSION_LAYOUT') as AdmissionLayout;
 const mapped=Object.freeze({PRIVACY_RECOVERY_FLOOR:data(env,'PRIVACY_RECOVERY_FLOOR'),PRIVACY_SERVING_GATE_SECRET:data(env,'PRIVACY_SERVING_GATE_SECRET'),PRIVACY_CREDENTIAL_EPOCH:config.credentialEpoch,PRIVACY_WRITE_EPOCH:config.writeEpoch}) as ServingGateEnvironment;
 const client=createServingRecoveryGateClient(mapped,config),created=Math.floor(Date.now()/1000);if(!integer(created,1))return held();
 // The genuine cookie producers consume this private genuine Request, not any shadowed caller property.
 // Its cookie comes only from the entry's captured native header; no late session or credential is adopted.
 const authRequest=Object.freeze(new NativeRequest(url.toString(),{method:'GET',headers:new NativeHeaders({Cookie:snapshot.cookie})})),authTuple=requestTuple(authRequest).tuple;
 const h=Object.freeze({scope:'site_me_original_read' as const,externalOriginQualified:false as const,readyToReopen:false as const});
 const o:Origin={env,request,requestTuple:snapshot.tuple,authRequest,authTuple,cookie:snapshot.cookie,slots,native:native as D1Database,prepare:method(native,'prepare'),batch:method(native,'batch'),metadata:meta,metadataTuple:tuple,config,layout,client,created,expires:created+300,id:random(),nonce:random(),phase:'captured',spent:false,session:null,originalRead:null,user:null,active:null,admitted:null,sourceEnv:null,dataIndex:0,dataGroups:[],failed:false};
 origins.set(h,o);bindServingGateClientWitness(client,()=>bindings(o));current(o);return h;
}
function session(v:unknown):Session{assertOriginalSiteSessionRead(v as OriginalSiteSession);if(!v||typeof v!=='object')return held();const u=data(v,'u'),ver=data(v,'v'),e=data(v,'e'),g=data(v,'g'),n=data(v,'n');if(typeof u!=='string'||!/^\d{17,20}$/.test(u)||!integer(ver,1)||!integer(e,1)||g!==null&&!hex(g,32)||!hex(n,32))return held();return Object.freeze({u,v:ver,e,g:g as string|null,n});}
function user(v:SiteUser,o:Origin):Readonly<SiteUser>{const s=o.session;if(!s||!v||typeof v!=='object')return held();const out:Record<string,unknown>={};
 for(const key of USER_FIELDS){const value=data(v,key);if(value!==null&&typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!Number.isSafeInteger(value)||typeof value==='string'&&value.length>65536)return held();out[key]=value;}
 if(out.discord_id!==s.u||out.session_version!==s.v||out.account_incarnation!==s.n||out.privacyGeneration!==s.g||!integer(out.denied)||!integer(out.in_server)||!integer(out.first_login)||!integer(out.last_login))return held();return Object.freeze(out) as unknown as Readonly<SiteUser>;
}
function projected(o:Origin,db:D1Database):Env{const ds=Object.getOwnPropertyDescriptors(o.env);ds.DB={value:db,writable:false,configurable:false,enumerable:true};return Object.freeze(Object.create(Object.getPrototypeOf(o.env),ds)) as Env;}
function schemaPlan(o:Origin):Plan{return Object.freeze({sql:PRIVACY_ADMISSION_SCHEMA_PROOF_SQL,values:Object.freeze(['','',o.layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON,o.config.writeEpoch])});}
function sitePlan(o:Origin):Plan{const s=o.session??held();return Object.freeze({sql:`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2 AND account_incarnation='${s.n}')
 AND ?3>${PRIVACY_DB_NOW} AND ${privacyGenerationFenceSql(1,4)} THEN 1 ELSE json_extract('privacy_site_request_refused','$') END AS admitted`,values:Object.freeze([s.u,s.v,s.e,s.g])});}
function ownArray<T>(v:unknown,maximum:number):readonly T[]{if(!Array.isArray(v))return held();const length=data(v,'length');if(!integer(length)||length>maximum||Reflect.ownKeys(v).some(k=>k!=='length'&&(typeof k!=='string'||!/^(?:0|[1-9]\d*)$/.test(k)||Number(k)>=length)))return held();return Object.freeze(Array.from({length},(_,i)=>data(v,String(i)) as T));}
function sameValues(a:readonly unknown[]|null,b:readonly unknown[]|null):boolean{if(a===null||b===null)return a===b;const x=ownArray<unknown>(a,16),y=ownArray<unknown>(b,16);return x.length===y.length&&x.every((v,i)=>(v===null||typeof v==='string'||typeof v==='number'&&Number.isSafeInteger(v))&&v===y[i]);}
function payload(sql:string,values:readonly (string|number|null)[]|null):Plan{return Object.freeze({sql,values:values===null?null:Object.freeze([...values])});}
/** Detached own digest data only; getters/functions never run and inherited values are never copied.
 * Native rows may have null or another realm's plain prototype. JSON's ordinary undefined omission remains. */
function plain(value:unknown,depth=0):unknown{if(value===undefined||value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number')return Number.isFinite(value)?value:held();if(!value||typeof value!=='object'||depth>12)return held();if(Array.isArray(value))return Object.freeze(ownArray<unknown>(value,10000).map(v=>plain(v,depth+1)));const keys=Reflect.ownKeys(value);if(keys.length>256)return held();const out:Record<string,unknown>=Object.create(null);for(const key of keys){if(typeof key!=='string')return held();out[key]=plain(data(value,key),depth+1);}return Object.freeze(out);}
function nativeResult(value:unknown):D1Result{if(!value||typeof value!=='object'||Array.isArray(value)||data(value,'success')!==true||'error'in value)return held();plain(value);ownArray(data(value,'results'),10000);const meta=data(value,'meta');if(!meta||typeof meta!=='object'||Array.isArray(meta))return held();return value as D1Result;}
/** No raw DB escapes. Exactly one original schema first or exact admitted read batch under the current child. */
function nativeTransport(o:Origin):D1Database{
 const records=new WeakMap<object,RawRecord>();
 const active=():Active=>{current(o);const a=o.active;if(!a)return held();servingContextCustody(a.child);return a;};
 const checkRecord=(r:RawRecord)=>{active();for(const [name,m]of r.methods)sameSlot(r.raw,name,m);};
 const wrap=(raw:D1PreparedStatement,plan:Plan,bound:boolean):D1PreparedStatement=>{
  const r:RawRecord={raw,plan,bound,methods:new Map(['bind','first','all','run','raw'].map(name=>[name,methodSlot(raw,name)] as const))};
  const bind=r.methods.get('bind')??held();
  const w=Object.freeze({bind(...values:unknown[]){const a=active();checkRecord(r);if(r.bound||r.plan.values===null||!sameValues(values,r.plan.values))return held();r.bound=true;const next=Reflect.apply(bind.fn,bind.receiver,values) as D1PreparedStatement;checkRecord(r);const b=wrap(next,plan,true);if(o.active!==a)return held();return b;},async first(){const a=active();checkRecord(r);if(!a.direct||a.nativeStarted||!r.bound||a.expected.length!==1||a.prepared.length!==1)return held();a.nativeStarted=true;const first=r.methods.get('first')??held(),out=await Reflect.apply(first.fn,first.receiver,[]);checkRecord(r);if(o.active!==a||!out||typeof out!=='object')return held();plain(out);if(data(out,'current')!==1)return held();return out;}});
  records.set(w,r);return w as unknown as D1PreparedStatement;
 };
 const safe=Object.freeze({prepare(sql:string){const a=active(),p=a.expected[a.prepared.length];if(!p||sql!==p.sql)return held();const raw=Reflect.apply(o.prepare.fn,o.prepare.receiver,[sql]) as D1PreparedStatement;current(o);if(o.active!==a)return held();const w=wrap(raw,p,p.values===null);a.prepared.push(records.get(w as object)!);return w;},async batch(statements:D1PreparedStatement[]){const a=active();if(a.direct||a.nativeStarted||a.prepared.length!==a.expected.length)return held();const list=ownArray<object>(statements,16);if(list.length!==a.expected.length)return held();const selected=list.map((w,i)=>{const r=records.get(w);if(!r||!r.bound||r.plan!==a.expected[i])return held();checkRecord(r);return r;});a.nativeStarted=true;const out=await Reflect.apply(o.batch.fn,o.batch.receiver,[Object.freeze(selected.map(r=>r.raw))]) as unknown;current(o);if(o.active!==a)return held();for(const r of [...a.prepared,...selected])checkRecord(r);const results=ownArray<unknown>(out,16);if(results.length!==a.expected.length)return held();for(const result of results)nativeResult(result);return out;}});
 return safe as unknown as D1Database;
}
async function child<T>(o:Origin,parent:ServingContext,label:string,plans:readonly Plan[],direct:boolean,work:()=>Promise<T>):Promise<T>{current(o);if(o.active)return held();const id=random(),nonce=random(),intent=await digest(['site-me-d1-v1',servingContextCustody(parent).nativeTuple,o.config,DATABASE,o.layout,o.session,label,id,nonce,plans]);current(o);
 const result=await runServingChild<T>(parent,{ticketId:id,purpose:'d1',nonce,requestDigest:intent},async c=>{current(o);const p=servingContextCustody(parent),q=servingContextCustody(c);if(q.createdAt!==o.created||q.expiresAt!==o.expires||p.createdAt!==q.createdAt||p.expiresAt!==q.expiresAt)return held();const a:Active={child:c,label,expected:plans,prepared:[],nativeStarted:false,direct};o.active=a;try{const value=await work();current(o);if(o.active!==a||!a.nativeStarted||a.prepared.length!==plans.length)return held();const resultDigest=await digest(['site-me-d1-known-v1',intent,plain(value)]);current(o);servingContextCustody(c);return {kind:'known_local' as const,value,resultDigest};}finally{if(o.active===a)o.active=null;}});
 current(o);if(!result.claimed||result.state!=='settled'||!result.nativeTerminal){o.failed=true;return held();}return result.value as T;
}
function groups(o:Origin):readonly Group[]{const id=o.session!.u,p=(sql:string,bind=true)=>payload(sql,bind?[id]:null),g=(label:string,method:Group['method'],plans:Plan[]):Group=>Object.freeze({label,method,plans:Object.freeze(plans)});
 const out=[
  g('settings','all',[p("SELECT key, value FROM site_settings WHERE key < 'newsWebhook:' OR key >= 'newsWebhook;'",false)]),
  g('application','first',[p('SELECT * FROM site_applications WHERE discord_id = ?1')]),
  g('votes','all',[p('SELECT ballot, slot, nominee_kind AS kind, nominee_key AS key, nominee_label AS label, reason FROM site_votes WHERE voter_id = ?1 ORDER BY ballot, slot')]),
  g('friends','all',[p('SELECT friend_kind AS kind, friend_key AS key, friend_label AS label, note FROM site_friends WHERE owner_id = ?1 ORDER BY created_at, friend_label')]),
  g('reserved','all',[p(`SELECT r.id, r.name, r.name_key, r.status, q.status AS queueStatus
       FROM site_reserved r LEFT JOIN invite_queue q ON q.id = r.queue_id
      WHERE r.owner_id = ?1 AND r.status <> 'released' ORDER BY r.id`)]),
  g('nominatedFor','all',[p(`SELECT DISTINCT v.ballot FROM site_votes v JOIN site_users u ON u.discord_id = v.voter_id AND u.denied = 0
      WHERE v.nominee_kind = 'discord' AND v.nominee_key = ?1 AND v.voter_id <> ?1`)]),
  g('boardVotes','all',[p(`SELECT v.role_key AS rk, COUNT(*) AS n FROM site_board_votes v
       JOIN site_applications a ON a.discord_id = v.candidate_id
       JOIN site_users u ON u.discord_id = v.candidate_id
      WHERE v.voter_id = ?1 AND ${ON_BOARD} AND (${ROLE_OF_FIRST} = v.role_key OR a.backup1 = v.role_key OR a.backup2 = v.role_key)
      GROUP BY v.role_key`)])
 ];
 if(!o.user!.denied)out.push(g('guildSeats','batch',[
  p('SELECT id, member_count, exported_at, received_at, trusted, complete, first_received_at FROM roster_snapshots ORDER BY id DESC LIMIT 1',false),
  p("SELECT ts FROM audit WHERE actor = 'watcher' AND action = 'guild.full' ORDER BY id DESC LIMIT 1",false),
  p(`SELECT q.name_key AS nameKey, q.name AS name,
          1 + (SELECT COUNT(*) FROM invite_queue o WHERE o.status IN ('queued','written')
                 AND (o.priority > q.priority OR (o.priority = q.priority AND o.id < q.id))) AS position
     FROM invite_queue q
    WHERE q.discord_id = ?1 AND q.status IN ('queued','written')
    ORDER BY q.priority DESC, q.id LIMIT 5`)
 ]));
 out.push(g('reapply','first',[p("SELECT old_name, new_name, decided_at FROM rename_holds WHERE discord_id = ?1 AND state = 'reapply' ORDER BY decided_at DESC LIMIT 1")]));return Object.freeze(out);
}
function authProducer(o:Origin):D1Database{const sql=`SELECT * FROM site_users WHERE discord_id = ?1 AND account_incarnation = ?2 AND session_version = ?3 AND ?4>CAST(strftime('%s','now') AS INTEGER) AND ${privacyGenerationLiteralFenceSql('discord_id',o.session!.g)}`;let prepared=false,bound=false,read=false;
 return Object.freeze({prepare(text:string){current(o);if(prepared||text!==sql)return held();prepared=true;return Object.freeze({bind(...values:unknown[]){current(o);if(bound||!sameValues(values,[o.session!.u,o.session!.n,o.session!.v,o.session!.e]))return held();bound=true;return Object.freeze({async first(){current(o);if(read||!o.active||o.active.label!=='auth')return held();read=true;return o.admitted!.prepare(sql).bind(o.session!.u,o.session!.n,o.session!.v,o.session!.e).first<SiteUser>();}});}});}}) as unknown as D1Database;
}
function dataProducer(o:Origin,parent:ServingContext,boundEnv:Env):D1Database{
 const records=new WeakMap<object,Plan>();let prepared=0;
 const validate=(plans:readonly Plan[],methodName:Group['method']):Group=>{current(o);const g=o.dataGroups[o.dataIndex];if(!g||g.method!==methodName||g.plans.length!==plans.length||plans.some((p,i)=>p.sql!==g.plans[i].sql||!sameValues(p.values,g.plans[i].values)))return held();o.dataIndex++;return g;};
 const execute=async(plans:readonly Plan[],methodName:Group['method']):Promise<D1Result[]>=>{const g=validate(plans,methodName),nativePlans=Object.freeze([schemaPlan(o),sitePlan(o),...plans]);return child(o,parent,g.label,nativePlans,false,async()=>{current(o);const own=plans.map(p=>{const s=boundEnv.DB.prepare(p.sql);return p.values===null?s:s.bind(...p.values);});return boundEnv.DB.batch(own);});};
 const make=(sql:string,values:readonly (string|number|null)[]|null):D1PreparedStatement=>{const p=payload(sql,values),s=Object.freeze({bind(...args:unknown[]){current(o);if(values!==null||args.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'||typeof v==='number'&&!Number.isSafeInteger(v)))return held();return make(sql,args as (string|number|null)[]);},async all(){return(await execute([p],'all'))[0];},async first(column?:string){if(column!==undefined)return held();return(await execute([p],'first'))[0]?.results[0]??null;},run(){return held();},raw(){return held();}});records.set(s,p);return s as unknown as D1PreparedStatement;};
 return Object.freeze({prepare(sql:string){current(o);if(typeof sql!=='string'||++prepared>11)return held();return make(sql,null);},async batch(statements:D1PreparedStatement[]){const plans=ownArray<object>(statements,3).map(s=>records.get(s)??held());return execute(Object.freeze(plans),'batch');}}) as unknown as D1Database;
}
/** A spent origin cannot retry; only this source invokes the genuine fixed schema/auth/data producers. */
export async function dispatchServingSiteMe(h:SiteMeOrigin|undefined):Promise<Response>{const o=h&&origins.get(h);if(!o||o.spent)return held();o.spent=true;const output:{response:Response|null;headers:string|null}={response:null,headers:null};
 try{current(o);const rootDigest=await digest(['site-me-root-v1',o.requestTuple,o.config,DATABASE,o.layout,o.metadataTuple]);current(o);const floor=await readServingRecoveryFloor(o.client);current(o);
  const attempt=prepareServingInvocation(o.client,floor,{ticketId:o.id,purpose:'fetch',nonce:o.nonce,requestDigest:rootDigest,createdAt:o.created,expiresAt:o.expires},async parent=>{
   current(o);o.phase='running';o.admitted=createPrivacyWriteAdmissionDatabase(nativeTransport(o),'writer',o.layout,o.config.writeEpoch);o.sourceEnv=projected(o,o.admitted);
   await child(o,parent,'schema',Object.freeze([schemaPlan(o)]),true,async()=>{await ensureSchema(o.sourceEnv!);return null;});current(o);
   const cookies=o.cookie.split(';').map(v=>v.trim()).filter(v=>v.startsWith(SESSION_COOKIE+'='));
   let signed:Awaited<ReturnType<typeof readSession>>=null;if(cookies.length===1)signed=await readSession(o.sourceEnv,o.authRequest);current(o);
   if(!signed)output.response=apiJson({error:'signed_out',message:'You are signed out. Sign in with Discord again.'},401);
   else{o.originalRead=signed;o.session=session(signed);current(o);const authSql=`SELECT * FROM site_users WHERE discord_id = ?1 AND account_incarnation = ?2 AND session_version = ?3 AND ?4>CAST(strftime('%s','now') AS INTEGER) AND ${privacyGenerationLiteralFenceSql('discord_id',o.session.g)}`,auth=payload(authSql,[o.session.u,o.session.n,o.session.v,o.session.e]);
    const found=await child(o,parent,'auth',Object.freeze([schemaPlan(o),auth]),false,()=>currentUser(projected(o,authProducer(o)),o.authRequest));current(o);
    if(!found)output.response=apiJson({error:'signed_out',message:'You are signed out. Sign in with Discord again.'},401);
    else{o.user=user(found,o);o.dataGroups=groups(o);const bound=privacyBoundSiteEnv(o.sourceEnv,o.originalRead!),producer=projected(o,dataProducer(o,parent,bound)),dto=await meData(producer,o.user);current(o);if(o.dataIndex!==o.dataGroups.length)return held();plain(dto);output.response=apiJson(dto);}
   }
   const result=output.response??held();output.headers=JSON.stringify([...result.headers]);const body=await result.clone().text();current(o);const resultDigest=await digest(['site-me-response-known-v1',rootDigest,result.status,output.headers,body]);current(o);return {kind:'known_local' as const,value:result,resultDigest};
  });
  const result=await dispatchServingInvocation<Response>(attempt);current(o);if(!result.claimed||result.state!=='settled'||!result.nativeTerminal||!output.response||result.value!==output.response||JSON.stringify([...output.response.headers])!==output.headers)return held();o.phase='terminal';return output.response;
 }catch{o.phase='unknown';return held();}
}
