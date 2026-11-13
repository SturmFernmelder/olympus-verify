/** Original guild-membership rejection provenance. It is neither an active ban nor an office decision.
 * Legacy cookie incarnation before the captured GET, absolute native clock truth, provider origin,
 * serving tickets and accepted-effect drain remain separate qualifications. Routes never install DDL. */
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import type {Env} from './env';
import {readSession,currentUser,sign,verify,b64u,sameOrigin,PAGE_VERSION,SESSION_COOKIE,isSiteAdmin,type SiteUser} from './site-core';
import {ORDINARY_DECLINE_ANSWER_KEY} from './application-edit219';
import {privacyGenerationFenceSql,privacySubjectKey,privacyProviderCustodyDatabase,privacyAccountIncarnation,privacyAccountIncarnationLiteralFenceSql,captureAccountErasureProof,CURRENT_ERASURE_SQL,originalErasureJobBirthSql,type AccountErasureProof} from './privacy-serving-authority';
import {privacyAdmissionMatchesOriginalNative,assertPrivacyAdmissionWitness} from './privacy-write-admission';
import {ORIGINAL_REQUEST_DESCRIPTORS,checkOriginalNativeRequest} from './privacy-native-http-intrinsics';
import {assertOriginalRecoveryDataIntrinsics,recoveryDataUtf8Length,recoveryScalarArraySha256} from './privacy-recovery-data-json';

type DecisionRefusal = 'original_membership_decision_held' | 'reload' | 'target_expired' | 'review_changed';
export class MembershipDecisionHeld extends Error {
 constructor(readonly code: DecisionRefusal = 'original_membership_decision_held') { super(code); }
}
const held=(code?:DecisionRefusal):never=>{throw new MembershipDecisionHeld(code);};
function unb64u(text:string):Uint8Array{if(typeof text!=='string'||!/^[A-Za-z0-9_-]*$/.test(text))return held();const raw=atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
const HEX=/^[0-9a-f]{32}$/,ID=/^\d{17,20}$/,KEY=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const PROTOCOL='original-guild-membership-rejection-v1',TOKEN_PURPOSE='site-membership-decision-target-incarnation-v2';
type Session=Readonly<{u:string;v:number;e:number;g:string|null;n:string}>;
type Method=Readonly<{receiver:object;owner:object;fn:Function}>;
type Field=Readonly<{receiver:object;name:string;owner:object;descriptor:PropertyDescriptor}>;
type Action='business_only'|'membership_rejection_v1'|'membership_reconsideration_v1'|'partial_delete';
type DecisionRoute='status'|'deny'|'undeny'|'delete';
export type MembershipDecisionOrigin=Readonly<{purpose:'original_staff_membership_decision'}>;
type Origin={request:Request;env:Env;raw:D1Database;cookie:string;token:string|null;method:string;path:string;action:Action;id:string;check:()=>void;authRequest:Request;bodyRequest:Request;authEnv:Env;unsigned:Session|null;session:Session|null;originalRead:OriginalSiteSession|null;spent:boolean};
const origins=new WeakMap<MembershipDecisionOrigin,Origin>(),byRequest=new WeakMap<Request,MembershipDecisionOrigin>();
function data(object:object,name:string):unknown{const d=Object.getOwnPropertyDescriptor(object,name);if(!d||!Object.hasOwn(d,'value'))return held();return d.value;}
function field(receiver:object,name:string):Field{let owner:object|null=receiver;for(let i=0;i<5&&owner;i++){const d=Object.getOwnPropertyDescriptor(owner,name);if(d)return Object.freeze({receiver,name,owner,descriptor:d});owner=Object.getPrototypeOf(owner);}return held();}
function sameField(f:Field):void{const n=field(f.receiver,f.name),a=f.descriptor,b=n.descriptor;if(n.owner!==f.owner||a.value!==b.value||a.get!==b.get||a.set!==b.set||a.writable!==b.writable||a.configurable!==b.configurable)return held();}
function method(receiver:object,name:string):Method{const f=field(receiver,name);if(!Object.hasOwn(f.descriptor,'value')||typeof f.descriptor.value!=='function')return held();return Object.freeze({receiver,owner:f.owner,fn:f.descriptor.value});}
function sameMethod(m:Method,name:string):void{const n=method(m.receiver,name);if(n.owner!==m.owner||n.fn!==m.fn)return held();}
// .174 (2026-10-19): Workerd inherits json/text from Body. Reuse the closed original
// native chain rather than assuming ownership on Request.prototype; shadows still hold.
const requestURL=ORIGINAL_REQUEST_DESCRIPTORS.url!.get!,requestMethod=ORIGINAL_REQUEST_DESCRIPTORS.method!.get!,requestHeaders=ORIGINAL_REQUEST_DESCRIPTORS.headers!.get!;
const headerGet=Headers.prototype.get;
function nativeGet(request:Request,name:'url'|'method'|'headers'):unknown{try{checkOriginalNativeRequest(request);}catch{return held();}if(Object.getOwnPropertyDescriptor(request,name))return held();return Reflect.apply(name==='url'?requestURL:name==='method'?requestMethod:requestHeaders,request,[]);}
export function captureMembershipDecisionOrigin(request:Request,env:Env):MembershipDecisionOrigin|null{
 const url=new URL(nativeGet(request,'url') as string),m=nativeGet(request,'method') as string;
 const match=/^\/api\/admin\/(?:applications\/(\d{17,20})(?:\/status)?|users\/(\d{17,20})\/(deny|undeny|delete|decision-target))$/.exec(url.pathname);
 if(!match||!['GET','POST'].includes(m))return null;
 const id=match[1]??match[2]!;
 const bodyMethods=['clone','json','text'].map(name=>method(request,name));for(let i=0;i<bodyMethods.length;i++){const name=['clone','json','text'][i]!;if(bodyMethods[i]!.fn!==ORIGINAL_REQUEST_DESCRIPTORS[name]?.value)return held();}
 const bodyRequest=Reflect.apply(bodyMethods[0]!.fn,request,[]) as Request;
 const headers=nativeGet(request,'headers') as Headers;if(Object.getOwnPropertyDescriptor(headers,'get'))return held();
 const getter=method(headers,'get');if(getter.fn!==headerGet)return held();const requestFields=['url','method','headers'].map(k=>field(request,k));if(requestFields[0]!.descriptor.get!==requestURL||requestFields[1]!.descriptor.get!==requestMethod||requestFields[2]!.descriptor.get!==requestHeaders)return held();
 const get=(key:string)=>Reflect.apply(headerGet,headers,[key]) as string|null;
 const cookie=get('Cookie')??'',token=get('X-Olympus-Decision-Target');
 let unsigned:Session|null=null;const cookiePart=cookie.split(/;\s*/).find(s=>s.startsWith(SESSION_COOKIE+'='));if(cookiePart){const value=cookiePart.slice(SESSION_COOKIE.length+1),dot=value.indexOf('.');if(dot>0){try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(unb64u(value.slice(0,dot))));unsigned=sessionCopy({u:parsed.u,v:parsed.v,e:parsed.e,g:parsed.g??null,n:parsed.n});}catch{return held();}}}
 const raw=data(env,'DB') as D1Database;if(!raw||typeof raw!=='object')return held();
 const prepare=method(raw,'prepare'),batch=method(raw,'batch'),config=['DB','COOKIE_SECRET','SITE_ADMINS'].map(k=>field(env,k));
 const values=config.map(f=>{if(!Object.hasOwn(f.descriptor,'value'))return held();return f.descriptor.value;});
 const optionalNames=['SITE_HOST','PUBLIC_BASE_URL','PRIVACY_WRITE_ADMISSION_ENABLED','PRIVACY_WRITE_ADMISSION_LAYOUT','PRIVACY_WRITE_ADMISSION_EPOCH'];const optional=optionalNames.map(name=>{try{const f=field(env,name);if(!Object.hasOwn(f.descriptor,'value'))return held();return f;}catch(e){let owner:object|null=env;for(let i=0;i<5&&owner;i++){if(Object.getOwnPropertyDescriptor(owner,name))throw e;owner=Object.getPrototypeOf(owner);}return null;}});
 const actionValue=get('X-Olympus-Decision-Action')??url.searchParams.get('decisionAction')??'business_only';
 if(!['business_only','membership_rejection_v1','membership_reconsideration_v1','partial_delete'].includes(actionValue))return held();
 const original=Object.freeze({url:url.href,method:m,cookie,token,page:get('X-Olympus'),origin:get('Origin'),fetchSite:get('Sec-Fetch-Site'),action:actionValue});
 const check=()=>{for(let i=0;i<bodyMethods.length;i++)sameMethod(bodyMethods[i]!,['clone','json','text'][i]!);for(const f of requestFields)sameField(f);for(const f of config)sameField(f);for(let i=0;i<optionalNames.length;i++){const f=optional[i];if(f)sameField(f);else{let owner:object|null=env;for(let depth=0;depth<5&&owner;depth++){if(Object.getOwnPropertyDescriptor(owner,optionalNames[i]!))return held();owner=Object.getPrototypeOf(owner);}}}if(data(env,'DB')!==raw)return held();sameMethod(prepare,'prepare');sameMethod(batch,'batch');if(nativeGet(request,'url')!==original.url||nativeGet(request,'method')!==m||nativeGet(request,'headers')!==headers)return held();sameMethod(getter,'get');if(get('Cookie')!==cookie||get('X-Olympus-Decision-Target')!==token||get('X-Olympus')!==original.page||get('Origin')!==original.origin||get('Sec-Fetch-Site')!==original.fetchSite||(get('X-Olympus-Decision-Action')??url.searchParams.get('decisionAction')??'business_only')!==original.action)return held();};
 check();
 // Authentication consumes a private Request created from the ORIGINAL signed cookie, never late headers.get.
 const authRequest=new Request(url.href,{headers:{Cookie:cookie}}),descriptors=Object.getOwnPropertyDescriptors(env);
 descriptors.DB={value:raw,enumerable:true};descriptors.COOKIE_SECRET={value:values[1],enumerable:true};descriptors.SITE_ADMINS={value:values[2],enumerable:true};
 const authEnv=Object.freeze(Object.create(Object.getPrototypeOf(env),descriptors)) as Env,opaque=Object.freeze({purpose:'original_staff_membership_decision' as const});
 origins.set(opaque,{request,env,raw,cookie,token,method:m,path:url.pathname,action:actionValue as Action,id,check,authRequest,bodyRequest,authEnv,unsigned,session:null,originalRead:null,spent:false});byRequest.set(request,opaque);return opaque;
}
export const membershipDecisionOrigin=(request:Request):MembershipDecisionOrigin|null=>byRequest.get(request)??null;
function original(origin:MembershipDecisionOrigin,env?:Env):Origin{assertOriginalRecoveryDataIntrinsics();const o=origins.get(origin);if(!o)return held();o.check();if(o.originalRead)assertOriginalSiteSessionRead(o.originalRead);if(env){const custody=privacyProviderCustodyDatabase(env);assertPrivacyAdmissionWitness(custody);if(!privacyAdmissionMatchesOriginalNative(custody,o.raw))return held();}return o;}
export function assertMembershipDecisionOrigin(origin:MembershipDecisionOrigin,env:Env):void{original(origin,env);}
function sessionCopy(s:Session):Session{const u=data(s,'u'),v=data(s,'v'),e=data(s,'e'),g=data(s,'g'),n=privacyAccountIncarnation(data(s,'n'));if(typeof u!=='string'||u.length<17||u.length>20||/[^0-9]/.test(u)||!Number.isSafeInteger(v)||(v as number)<1||!Number.isSafeInteger(e)||(e as number)<1||g!==null&&(typeof g!=='string'||g.length!==32||!HEX.test(g)))return held();return Object.freeze({u,v:v as number,e:e as number,g:g as string|null,n});}
export async function authenticateMembershipDecision(origin:MembershipDecisionOrigin,env:Env):Promise<{user:SiteUser;session:OriginalSiteSession}|null>{
 const o=original(origin,env);const descriptors=Object.getOwnPropertyDescriptors(o.authEnv);descriptors.DB={value:env.DB,enumerable:true};const authEnv=Object.freeze(Object.create(Object.getPrototypeOf(o.authEnv),descriptors)) as Env;
 const s=await readSession(authEnv,o.authRequest);original(origin,env);if(!s)return null;assertOriginalSiteSessionRead(s);const copied=sessionCopy(s);if(!o.unsigned||JSON.stringify(copied)!==JSON.stringify(o.unsigned)||o.session)return held();o.session=copied;o.originalRead=s;
 const user=await currentUser(authEnv,o.authRequest);original(origin,env);if(!user||user.discord_id!==copied.u||!isSiteAdmin(authEnv,copied.u))return null;
 if(o.method==='POST'){
  if(!sameOrigin(o.request))return held();
  if(Reflect.apply(headerGet,nativeGet(o.request,'headers') as Headers,['X-Olympus'])!==PAGE_VERSION)return held('reload');
 }
 return Object.freeze({user,session:s});
}
export function membershipDecisionAuthRequest(origin:MembershipDecisionOrigin):Request{return original(origin).authRequest;}
export function membershipDecisionBodyRequest(origin:MembershipDecisionOrigin):Request{return original(origin).bodyRequest;}
// Type CASEs are evaluated before JSON constructors; absence is distinct from an invalid row.
const APP_REVIEW_TYPES="typeof(a.discord_id)='text' AND typeof(a.position)='text' AND typeof(a.answers)='text' AND typeof(a.status)='text' AND typeof(a.class_lead) IN('null','text') AND typeof(a.backup1) IN('null','text') AND typeof(a.backup2) IN('null','text') AND typeof(a.character) IN('null','text') AND typeof(a.char_key) IN('null','text') AND typeof(a.class) IN('null','text') AND typeof(a.role) IN('null','text') AND typeof(a.region) IN('null','text') AND typeof(a.avail) IN('null','text') AND typeof(a.avail_tz) IN('null','text') AND typeof(a.admin_note) IN('null','text') AND typeof(a.reviewed_by) IN('null','text') AND typeof(a.rejection_event_id) IN('null','text') AND typeof(a.rejection_subject_key) IN('null','text') AND typeof(a.rejection_scope) IN('null','text') AND typeof(a.fallback)='integer' AND typeof(a.created_at)='integer' AND typeof(a.updated_at)='integer' AND typeof(a.rejection_window_expired)='integer' AND typeof(a.fit_na) IN('null','integer') AND typeof(a.fit_eu) IN('null','integer') AND typeof(a.board_at) IN('null','integer') AND typeof(a.reviewed_at) IN('null','integer')";
const APP_REVIEW_KIND=`CASE WHEN NOT EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id=u.discord_id) THEN 'absent' WHEN EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id=u.discord_id AND NOT (${APP_REVIEW_TYPES})) THEN 'invalid' ELSE 'present' END`;
const USER_PROOF=`CASE WHEN typeof(u.rejection_event_id) IN('null','text') AND typeof(u.rejection_subject_key) IN('null','text') AND typeof(u.rejection_scope) IN('null','text') AND typeof(u.rejection_window_expired)='integer' THEN json_array(u.rejection_event_id,u.rejection_subject_key,u.rejection_scope,u.rejection_window_expired) ELSE NULL END`;
const APP_PROOF=`(SELECT CASE WHEN ${APP_REVIEW_TYPES} THEN json_array(a.status,a.position,a.class_lead,a.backup1,a.backup2,a.fallback,a.created_at,a.updated_at,a.reviewed_at,a.rejection_event_id,a.rejection_subject_key,a.rejection_scope,a.rejection_window_expired) ELSE NULL END FROM site_applications a WHERE a.discord_id=u.discord_id)`;
// .210: a fixed Native application-row serialization, never parsed/reserialized answers.
// This explicit decision-review resource ceiling is below the existing 2000000-byte Native
// bind bound. It is not a maximum for every legal row: oversized rows require operator review.
// Oversized historical OR currently accumulated rows hold409 rather than truncate, expose raw
// answers in tokens or enlarge proof/token caps. No universal compatibility claim is made.
const APPLICATION_REVIEW_BYTES=256000;
const APP_REVIEW_RAW=`(SELECT CASE WHEN ${APP_REVIEW_TYPES} THEN json_array(typeof(a.discord_id),a.discord_id,typeof(a.position),a.position,typeof(a.class_lead),a.class_lead,typeof(a.backup1),a.backup1,typeof(a.backup2),a.backup2,typeof(a.fallback),a.fallback,typeof(a.character),a.character,typeof(a.char_key),a.char_key,typeof(a.class),a.class,typeof(a.role),a.role,typeof(a.region),a.region,typeof(a.avail),a.avail,typeof(a.avail_tz),a.avail_tz,typeof(a.fit_na),a.fit_na,typeof(a.fit_eu),a.fit_eu,typeof(a.board_at),a.board_at,typeof(a.answers),a.answers,typeof(a.status),a.status,typeof(a.admin_note),a.admin_note,typeof(a.reviewed_by),a.reviewed_by,typeof(a.reviewed_at),a.reviewed_at,typeof(a.created_at),a.created_at,typeof(a.updated_at),a.updated_at,typeof(a.rejection_event_id),a.rejection_event_id,typeof(a.rejection_subject_key),a.rejection_subject_key,typeof(a.rejection_scope),a.rejection_scope,typeof(a.rejection_window_expired),a.rejection_window_expired) ELSE NULL END FROM site_applications a WHERE a.discord_id=u.discord_id)`;
const APP_REVIEW_IN_BOUNDS=`CASE WHEN (${APP_REVIEW_KIND})='invalid' THEN 0 ELSE (${APP_REVIEW_RAW} IS NULL OR length(CAST(${APP_REVIEW_RAW} AS BLOB))<=${APPLICATION_REVIEW_BYTES}) END`;
function reviewRaw(value:unknown):string|null{if(value!==null&&(typeof value!=='string'||recoveryDataUtf8Length(value)>APPLICATION_REVIEW_BYTES))return held();return value as string|null;}
function reviewDigest(value:string|null):Promise<string>{return recoveryScalarArraySha256(['native-application-row-review-v1',value]);}
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const CLOCK="typeof(strftime('%s','now'))='text' AND instr(strftime('%s','now'),char(0))=0 AND strftime('%s','now') NOT GLOB '*[^0-9]*' AND substr(strftime('%s','now'),1,1) BETWEEN '1' AND '9' AND length(CAST(strftime('%s','now') AS BLOB))=length(strftime('%s','now')) AND CAST(CAST(strftime('%s','now') AS INTEGER) AS TEXT)=strftime('%s','now') AND CAST(strftime('%s','now') AS INTEGER) BETWEEN 1 AND 253402300499";
type Target=Readonly<{session:Session;actorNonce:string;id:string;targetNonce:string;g:string|null;revision:number|null;version:number;denied:number;deniedAt:number|null;app:string|null;proof:string;prepared:number;expires:number;decisionId:string;action:Action;route:string;subjectKey:string;reviewDigest:string}>;
const targets=new WeakMap<MembershipDecisionOrigin,Target>();
const applicationReviews=new WeakMap<MembershipDecisionOrigin,string|null>();
function capturedReview(origin:MembershipDecisionOrigin):string|null{if(!applicationReviews.has(origin))return held();return applicationReviews.get(origin) as string|null;}
function targetShape(x:unknown):Target{if(!x||typeof x!=='object'||Array.isArray(x))return held();const keys=['session','actorNonce','id','targetNonce','g','revision','version','denied','deniedAt','app','proof','prepared','expires','decisionId','action','route','subjectKey','reviewDigest'];if(Reflect.ownKeys(x).length!==keys.length)return held();const r=Object.fromEntries(keys.map(k=>[k,data(x,k)]));const session=sessionCopy(r.session as Session);
 if(typeof r.actorNonce!=='string'||r.actorNonce.length!==32||!HEX.test(r.actorNonce)||r.actorNonce!==session.n||typeof r.id!=='string'||!ID.test(r.id)||typeof r.targetNonce!=='string'||!HEX.test(r.targetNonce)||r.g!==null&&(typeof r.g!=='string'||!HEX.test(r.g))||r.revision!==null&&(!Number.isSafeInteger(r.revision)||(r.revision as number)<0)||!Number.isSafeInteger(r.version)||(r.version as number)<1||![0,1].includes(r.denied as number)||r.deniedAt!==null&&!Number.isSafeInteger(r.deniedAt)||r.app!==null&&typeof r.app!=='string'||typeof r.proof!=='string'||!Number.isSafeInteger(r.prepared)||(r.prepared as number)<1||!Number.isSafeInteger(r.expires)||r.expires!==Math.min((r.prepared as number)+300,session.e)||typeof r.decisionId!=='string'||!HEX.test(r.decisionId)||!['business_only','membership_rejection_v1','membership_reconsideration_v1','partial_delete'].includes(r.action as string)||typeof r.route!=='string'||!['status','deny','undeny','delete'].includes(r.route)||typeof r.subjectKey!=='string'||!canonicalRejectionKey(r.subjectKey)||typeof r.reviewDigest!=='string'||!/^[0-9a-f]{64}$/.test(r.reviewDigest))return held();
 const proof=JSON.parse(r.proof as string);if(!Array.isArray(proof)||proof.length!==4)return held();return Object.freeze({...r,session}) as Target;}
export function canonicalRejectionKey(x:unknown):x is string{if(typeof x!=='string'||!KEY.test(x)||x.includes('\0'))return false;try{const bytes=unb64u(x);return bytes.byteLength===32&&b64u(bytes)===x;}catch{return false;}}
function reviewNoteKey(o:Origin,actor:Session,nonce:string):Promise<string>{
 return sign(o.authEnv.COOKIE_SECRET,'site-membership-review-note-scope-v1',JSON.stringify([actor.u,actor.n,o.id,nonce]));
}
export async function membershipDecisionDetailKey(origin:MembershipDecisionOrigin,env:Env,id:string,nonce:unknown):Promise<string>{
 const o=original(origin,env),actor=o.session;
 if(!actor||o.method!=='GET'||o.id!==id||o.path!==`/api/admin/applications/${id}`)return held();
 if(typeof nonce!=='string'||nonce.length!==32||!HEX.test(nonce))return held();
 const key=await reviewNoteKey(o,actor,nonce);
 original(origin,env);return key;
}
export async function membershipDecisionTargetToken(origin:MembershipDecisionOrigin,env:Env,route:DecisionRoute):Promise<Readonly<{targetToken:string|null;decisionAction:Action;decisionAvailable:boolean;preparedAt:number|null;expiresAt:number|null;reviewKey:string|null}>>{
 const o=original(origin,env),s=o.session;
 if(!s||o.method!=='GET')return held();
 const subjectKey=await privacySubjectKey(o.authEnv,o.id);original(origin,env);
 const row=await env.DB.prepare(`SELECT actor.account_incarnation AS actor_nonce,u.account_incarnation AS target_nonce,u.session_version AS version,u.denied,u.denied_at,${APP_PROOF} AS app,${APP_REVIEW_RAW} AS review_raw,${USER_PROOF} AS proof,EXISTS(SELECT 1 FROM privacy_rejection_decisions d WHERE d.subject_key=?6) AS has_rejection,(SELECT generation FROM privacy_subjects WHERE subject_id=u.discord_id) AS g,(SELECT revision FROM privacy_subjects WHERE subject_id=u.discord_id) AS revision,${NOW} AS prepared,lower(hex(randomblob(16))) AS decision_id FROM site_users u JOIN site_users actor ON actor.discord_id=?1 WHERE u.discord_id=?2 AND actor.session_version=?3 AND ${privacyAccountIncarnationLiteralFenceSql('actor.account_incarnation',s.n)} AND ?4>${NOW} AND ${privacyGenerationFenceSql(1,5)} AND ${CLOCK} AND ${nonceSql('actor.account_incarnation')} AND ${nonceSql('u.account_incarnation')} AND typeof(u.session_version)='integer' AND u.session_version>0 AND typeof(u.denied)='integer' AND u.denied IN(0,1) AND (u.denied_at IS NULL OR (typeof(u.denied_at)='integer' AND u.denied_at>0 AND u.denied_at<=${NOW})) AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id AND NOT (${nonceSql('p.generation')} AND typeof(p.revision)='integer' AND p.revision>=0)) AND ${APP_REVIEW_IN_BOUNDS} AND (${APP_PROOF} IS NULL OR length(CAST(${APP_PROOF} AS BLOB))<=4096) AND length(CAST(${USER_PROOF} AS BLOB))<=1024`).bind(s.u,o.id,s.v,s.e,s.g,subjectKey).first<Record<string,unknown>>();original(origin,env);if(!row)return held();
 const snapshot=reviewRaw(data(row,'review_raw'));original(origin,env);const digest=await reviewDigest(snapshot);original(origin,env);
 const t=targetShape({session:s,actorNonce:row.actor_nonce,id:o.id,targetNonce:row.target_nonce,g:row.g,revision:row.revision,version:row.version,denied:row.denied,deniedAt:row.denied_at,app:row.app,proof:row.proof,prepared:row.prepared,expires:Math.min(Number(row.prepared)+300,s.e),decisionId:row.decision_id,action:o.action,route,subjectKey,reviewDigest:digest});
 const selected=route==='deny'||route==='undeny'?permanentDenialAction(t,route,data(row,'has_rejection')):{action:t.action,available:true};
 if(!selected.available)return Object.freeze({targetToken:null,decisionAction:selected.action,decisionAvailable:false,preparedAt:null,expiresAt:null,reviewKey:null});
 const raw=b64u(new TextEncoder().encode(JSON.stringify({...t,action:selected.action})));
 // Scope an in-memory draft to the same actor and account birth. Only the target token authorizes a decision.
 const [mac,reviewKey]=await Promise.all([
  sign(o.authEnv.COOKIE_SECRET,TOKEN_PURPOSE,raw),
  reviewNoteKey(o,s,t.targetNonce)
 ]);
 original(origin,env);const token=raw+'.'+mac;if(token.length>8192)return held();
 return Object.freeze({targetToken:token,decisionAction:selected.action,decisionAvailable:selected.available,preparedAt:t.prepared,expiresAt:t.expires,reviewKey});
}
/** Verify once before readJson awaits. A negative/expired/unknown token never renews its native target. */
export async function prepareMembershipDecision(origin:MembershipDecisionOrigin,env:Env):Promise<void>{
 const o=original(origin,env),s=o.session;if(!s||o.method!=='POST'||!o.token||o.spent||targets.has(origin))return held();
 const dot=o.token.indexOf('.');if(dot<1||o.token.length>8192)return held();const raw=o.token.slice(0,dot),signature=o.token.slice(dot+1);
 if(!await verify(o.authEnv.COOKIE_SECRET,TOKEN_PURPOSE,raw,signature))return held();original(origin,env);
 let parsed:unknown;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(unb64u(raw)));}catch{return held();}const t=targetShape(parsed);
 const route=o.path.endsWith('/status')?'status':o.path.endsWith('/deny')?'deny':o.path.endsWith('/undeny')?'undeny':'delete';
 if(t.id!==o.id||t.route!==route||t.action!==o.action||JSON.stringify(t.session)!==JSON.stringify(s))return held();
 // The actual route also uses privacyBoundSiteEnv. This SELECT independently fences original
 // actor authority and the original target incarnation before any private snapshot is returned.
 original(origin,env);
 const row=await env.DB.prepare(`SELECT ${NOW} AS observed_at,${APP_REVIEW_RAW} AS review_raw FROM site_users u JOIN site_users actor ON actor.discord_id=?1 WHERE u.discord_id=?2 AND actor.session_version=?3 AND ${privacyAccountIncarnationLiteralFenceSql('actor.account_incarnation',s.n)} AND ?4>${NOW} AND ${privacyGenerationFenceSql(1,5)} AND u.account_incarnation=?6 AND u.session_version=?7 AND u.denied=?8 AND u.denied_at IS ?9 AND ((?10 IS NULL AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id)) OR EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id AND p.generation=?10 AND p.revision=?11 AND p.state='active')) AND ${USER_PROOF}=?12 AND ${APP_PROOF} IS ?13 AND ${APP_REVIEW_IN_BOUNDS} AND ${CLOCK}`).bind(s.u,t.id,s.v,s.e,s.g,t.targetNonce,t.version,t.denied,t.deniedAt,t.g,t.revision,t.proof,t.app).first<Record<string,unknown>>();original(origin,env);if(!row){
 // CL2-129 (Evergreen 12 Nov 2026): this refusal precedes every write. When the same actor and the same target account
 // (birth, session, standing, privacy subject) still match and only the application or rejection proof moved, say so
 // (review_changed) instead of the generic hold, so staff read 'the application changed', not 'result unconfirmed'.
 // Any other miss keeps the generic hold. Both answers refuse; neither renews the target.
 const same=await env.DB.prepare(`SELECT 1 AS same FROM site_users u JOIN site_users actor ON actor.discord_id=?1 WHERE u.discord_id=?2 AND actor.session_version=?3 AND ${privacyAccountIncarnationLiteralFenceSql('actor.account_incarnation',s.n)} AND ?4>${NOW} AND ${privacyGenerationFenceSql(1,5)} AND u.account_incarnation=?6 AND u.session_version=?7 AND u.denied=?8 AND u.denied_at IS ?9 AND ((?10 IS NULL AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id)) OR EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=u.discord_id AND p.generation=?10 AND p.revision=?11 AND p.state='active')) AND ${CLOCK}`).bind(s.u,t.id,s.v,s.e,s.g,t.targetNonce,t.version,t.denied,t.deniedAt,t.g,t.revision).first<Record<string,unknown>>();original(origin,env);
 return held(same?'review_changed':undefined);
}
 const observedAt=data(row,'observed_at');
 if(typeof observedAt!=='number'||!Number.isSafeInteger(observedAt)||observedAt<t.prepared)return held();
 if(observedAt>=t.expires)return held('target_expired');
 const snapshot=reviewRaw(data(row,'review_raw'));original(origin,env);const digest=await reviewDigest(snapshot);original(origin,env);if(digest!==t.reviewDigest)return held('review_changed');
 applicationReviews.set(origin,snapshot);targets.set(origin,t);original(origin,env);
}
const APP_REVIEW_NOW=APP_REVIEW_RAW.replaceAll('u.discord_id','?6');
const APP_NOW=APP_PROOF.replaceAll('u.discord_id','?6'),PROOF_NOW=`(SELECT ${USER_PROOF} FROM site_users u WHERE u.discord_id=?6)`;
function targetGuard(env:Env,t:Target,review:string|null):D1PreparedStatement{
 const requireEmptyEvent=t.route==='undeny'&&t.action==='business_only'||t.route==='deny'&&emptyRejectionProof(JSON.parse(t.proof));
 const noOrphan=requireEmptyEvent?' AND NOT EXISTS(SELECT 1 FROM privacy_rejection_decisions d WHERE d.subject_key=?17)':'';
 return env.DB.prepare(`SELECT CASE WHEN ${CLOCK} AND ?15<=${NOW} AND ${NOW}<?16 AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND session_version=?2 AND account_incarnation=?5) AND ?3>${NOW} AND ${privacyGenerationFenceSql(1,4)} AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=?6 AND account_incarnation=?7 AND session_version=?10 AND denied=?11 AND denied_at IS ?12) AND ((?8 IS NULL AND NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?6)) OR EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?6 AND generation=?8 AND revision=?9 AND state='active')) AND (${APP_REVIEW_KIND.replaceAll('u.discord_id','?6')})<>'invalid' AND ${APP_NOW} IS ?13 AND CAST(${APP_REVIEW_NOW} AS BLOB) IS CAST(?18 AS BLOB) AND ${PROOF_NOW}=?14${noOrphan} AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?6 AND (CASE WHEN u.rejection_event_id IS NOT NULL THEN EXISTS(SELECT 1 FROM privacy_rejection_decisions d WHERE d.decision_id=u.rejection_event_id AND d.subject_key=?17 AND u.rejection_subject_key=?17 AND d.target_account_incarnation=u.account_incarnation AND d.scope=u.rejection_scope AND u.rejection_window_expired=0 AND ${validEvent} AND (d.target_generation IS NULL OR d.target_generation IS ?8)) WHEN u.rejection_window_expired=1 THEN u.rejection_event_id IS NULL AND u.rejection_subject_key=?17 AND ${keySql('u.rejection_subject_key')} AND u.rejection_scope IN('pure_member_including_fallback0','pure_member_including_fallback1') ELSE u.rejection_event_id IS NULL AND u.rejection_subject_key IS NULL AND u.rejection_scope IS NULL AND u.rejection_window_expired=0 END)) THEN 1 ELSE json_extract('original_membership_target_held','$') END AS admitted`).bind(t.session.u,t.session.v,t.session.e,t.session.g,t.actorNonce,t.id,t.targetNonce,t.g,t.revision,t.version,t.denied,t.deniedAt,t.app,t.proof,t.prepared,t.expires,t.subjectKey,review);}
export function membershipDecisionPartialGuard(origin:MembershipDecisionOrigin,env:Env,denied:number):D1PreparedStatement{const o=original(origin,env),t=targets.get(origin);if(!t||o.action!=='partial_delete'||o.spent)return held();const p=JSON.parse(t.proof) as unknown[];if(denied!==t.denied||!denied&&(p[0]!==null||p[1]!==null||p[2]!==null||p[3]!==0))return held();o.spent=true;return targetGuard(env,t,capturedReview(origin));}
function pureMemberApplication(a:unknown[]|null):boolean {
 return !!a&&a[1]==='member'&&a[2]===null&&a[3]===null&&a[4]===null&&(a[5]===0||a[5]===1);
}
function emptyRejectionProof(p:unknown[]):boolean {
 return p.length===4&&p.every((v,i)=>i===3?v===0:v===null);
}
function emptyApplicationRejection(t:Target):boolean {
 if(t.app===null)return true;
 const app:unknown=JSON.parse(t.app);
 return Array.isArray(app)&&app.length===13&&emptyRejectionProof(app.slice(9));
}
function permanentDenialAction(t:Target,route:'deny'|'undeny',hasRejection:unknown):{action:Action;available:boolean}{
 const proof=JSON.parse(t.proof) as unknown[];
 if(route==='undeny'){
  if(!emptyRejectionProof(proof))return {action:'membership_reconsideration_v1',available:true};
  return {action:'business_only',available:hasRejection===0&&emptyApplicationRejection(t)};
 }
 const app=t.app===null?null:JSON.parse(t.app) as unknown[];
 return {action:'membership_rejection_v1',available:t.denied===0&&pureMemberApplication(app)
  &&(emptyRejectionProof(proof)?hasRejection===0&&emptyApplicationRejection(t)&&app?.[0]!=='declined':proof[3]===0)};
}
function eventCondition(t:Target):{newEvent:boolean;scope:string|null;proof:unknown[]}{const p=JSON.parse(t.proof) as unknown[],a=t.app===null?null:JSON.parse(t.app) as unknown[];if(p.length!==4)return held();const empty=emptyRejectionProof(p);if(!empty&&(p[1]!==t.subjectKey||typeof p[2]!=='string'||!['pure_member_including_fallback0','pure_member_including_fallback1'].includes(p[2])||p[3]!==0&&p[3]!==1||p[3]===0&&(typeof p[0]!=='string'||!HEX.test(p[0]))||p[3]===1&&p[0]!==null))return held();
 const pure=pureMemberApplication(a);if(t.action==='membership_rejection_v1'&&!pure)return held();const legacyNegative=empty&&(t.denied===1||a?.[0]==='declined');if(legacyNegative&&t.action==='membership_rejection_v1')return held();return {newEvent:empty&&!legacyNegative&&t.action==='membership_rejection_v1',scope:pure?'pure_member_including_fallback'+a![5]:null,proof:p};}

const DECLINE_PATH='$.'+ORDINARY_DECLINE_ANSWER_KEY;
const APP_REJECTION_EMPTY='a.rejection_event_id IS NULL AND a.rejection_subject_key IS NULL AND a.rejection_scope IS NULL AND a.rejection_window_expired=0';
const PURE_MEMBER_DECLINE="a.status='declined' AND a.position='member' AND a.class_lead IS NULL AND a.backup1 IS NULL AND a.backup2 IS NULL";
function ordinaryDeclineStampMatches(incarnation:string):string {
 return `typeof(a.created_at)='integer' AND a.created_at>0 AND typeof(a.reviewed_at)='integer' AND a.reviewed_at>=a.created_at
  AND json_type(a.answers,'${DECLINE_PATH}')='array' AND (SELECT COUNT(*) FROM json_each(a.answers) WHERE key='${ORDINARY_DECLINE_ANSWER_KEY}')=1
  AND CAST(json_extract(a.answers,'${DECLINE_PATH}') AS BLOB) IS CAST(json_array(${incarnation},a.created_at,a.reviewed_at) AS BLOB)`;
}
function noAmbiguousMemberDecline(subjectKey:string):string {
 return `NOT EXISTS(SELECT 1 FROM site_applications a WHERE a.discord_id=u.discord_id AND ${PURE_MEMBER_DECLINE}
  AND CASE WHEN ${APP_REJECTION_EMPTY} AND json_valid(a.answers) THEN CASE WHEN json_type(a.answers)='object'
   AND ${ordinaryDeclineStampMatches('u.account_incarnation')}
   AND NOT EXISTS(SELECT 1 FROM privacy_rejection_decisions d WHERE d.subject_key=${subjectKey}) THEN 0 ELSE 1 END ELSE 1 END)`;
}
function applicationStatusStatement(env:Env,t:Target,values:Readonly<{status?:string;note?:string|null;at:number}>):D1PreparedStatement {
 const app=t.app===null?null:JSON.parse(t.app) as unknown[];
 const ordinaryDecline=t.action==='business_only'&&values.status==='declined'&&pureMemberApplication(app);
 const note=values.note===undefined?'':', admin_note = ?5';
 const parameters=[t.id,values.status!,t.session.u,values.at,...(values.note===undefined?[]:[values.note])];
 const incarnation='(SELECT account_incarnation FROM site_users WHERE discord_id=a.discord_id)';
 // A new ordinary decision stamps only its current application and account.
 // Saving a note may carry forward a valid stamp, but cannot classify a legacy decline.
 const answers=ordinaryDecline?`, answers = CASE WHEN json_valid(a.answers) THEN CASE
  WHEN json_type(a.answers)='object' AND ((a.status<>'declined' AND json_type(a.answers,'${DECLINE_PATH}') IS NULL)
   OR (a.status='declined' AND ${ordinaryDeclineStampMatches(incarnation)})) THEN
   json_set(a.answers,'${DECLINE_PATH}',json_array(${incarnation},a.created_at,CAST(?4 AS INTEGER)))
  ELSE a.answers END ELSE a.answers END`:app?.[0]==='declined'&&values.status!=='declined'?`, answers = CASE WHEN json_valid(a.answers) THEN CASE
  WHEN json_type(a.answers)='object' AND json_type(a.answers,'${DECLINE_PATH}') IS NOT NULL
  THEN json_remove(a.answers,'${DECLINE_PATH}') ELSE a.answers END ELSE a.answers END`:'';
 return env.DB.prepare(`UPDATE site_applications${answers?' AS a':''} SET status = ?2, reviewed_by = ?3, reviewed_at = ?4${note}${answers} WHERE discord_id = ?1 AND NOT (?2 = 'accepted' AND status = 'withdrawn')`).bind(...parameters);
}
/** The six core slots cover the decision and both native mirrors. */
export async function applyMembershipDecision(origin:MembershipDecisionOrigin,env:Env,route:'status'|'deny'|'undeny',values:Readonly<{status?:string;note?:string|null;reason?:string|null;at:number}>):Promise<D1Result>{
 const o=original(origin,env),t=targets.get(origin);if(!t||o.spent||t.route!==route)return held();const copied=Object.freeze({status:values.status,note:values.note,reason:values.reason,at:values.at});if(!Number.isSafeInteger(copied.at))return held();
 if(route==='status'&&!['submitted','reviewing','accepted','declined','withdrawn'].includes(copied.status??''))return held();
 const classification=eventCondition(t);
 if(route==='deny'&&(t.action!=='membership_rejection_v1'||emptyRejectionProof(classification.proof)&&!emptyApplicationRejection(t)))return held();
 if(route==='undeny'&&(emptyRejectionProof(classification.proof)
  ?t.action!=='business_only'||!emptyApplicationRejection(t):t.action!=='membership_reconsideration_v1'))return held();
 if(t.action==='membership_rejection_v1'&&(route==='undeny'||route==='status'&&copied.status!=='declined')||t.action==='membership_reconsideration_v1'&&(route==='deny'||route==='status'&&copied.status==='declined'))return held();
 o.spent=true;const p=classification.proof,reconsider=t.action==='membership_reconsideration_v1';
 const event=env.DB.prepare(`INSERT INTO privacy_rejection_decisions(decision_id,subject_key,target_account_incarnation,target_generation,protocol,source,scope,rejected_at,retain_until) SELECT ?1,?2,?3,?4,'${PROTOCOL}',?5,?6,${NOW},${NOW}+31536000 WHERE ?7=1`).bind(t.decisionId,t.subjectKey,t.targetNonce,t.g,route==='deny'?'explicit_membership_deny':'member_application_decline',classification.scope,classification.newEvent?1:0);
 const business=route==='status'?applicationStatusStatement(env,t,copied):route==='deny'?env.DB.prepare('UPDATE site_users SET denied = 1, denied_reason = ?2, denied_at = ?3, denied_by = ?4, session_version = session_version + 1 WHERE discord_id = ?1').bind(t.id,copied.reason??null,copied.at,t.session.u):env.DB.prepare('UPDATE site_users SET denied = 0, denied_reason = NULL, denied_at = NULL, denied_by = NULL WHERE discord_id = ?1 AND denied = 1').bind(t.id);
 const eventId=classification.newEvent?t.decisionId:p[0],key=classification.newEvent?t.subjectKey:p[1],scope=classification.newEvent?classification.scope:p[2],expired=classification.newEvent?0:p[3];
 const user=env.DB.prepare('UPDATE site_users SET rejection_event_id=?2,rejection_subject_key=?3,rejection_scope=?4,rejection_window_expired=?5 WHERE discord_id=?1').bind(t.id,reconsider?null:eventId,reconsider?null:key,reconsider?null:scope,reconsider?0:expired);
 // Only a NEW selected decision or explicit reconsideration updates the app mirror. Unrelated apps are untouched.
 const app=env.DB.prepare('UPDATE site_applications SET rejection_event_id=?2,rejection_subject_key=?3,rejection_scope=?4,rejection_window_expired=?5 WHERE discord_id=?1 AND ?6=1').bind(t.id,reconsider?null:eventId,reconsider?null:key,reconsider?null:scope,reconsider?0:expired,classification.newEvent||reconsider?1:0);
 const terminal=reconsider?env.DB.prepare('DELETE FROM privacy_rejection_decisions WHERE subject_key=?1 AND target_account_incarnation=?2').bind(t.subjectKey,t.targetNonce):env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_users WHERE discord_id=?1 AND account_incarnation=?2 AND rejection_event_id IS ?3 AND rejection_subject_key IS ?4 AND rejection_scope IS ?5 AND rejection_window_expired=?6) AND (?7=0 OR EXISTS(SELECT 1 FROM privacy_rejection_decisions WHERE decision_id=?3 AND subject_key=?4 AND target_account_incarnation=?2 AND target_generation IS ?8 AND rejected_at BETWEEN ?9 AND ${NOW} AND retain_until=rejected_at+31536000)) THEN 1 ELSE json_extract('membership_decision_receipt_held','$') END AS recorded`).bind(t.id,t.targetNonce,eventId,key,scope,expired,classification.newEvent?1:0,t.g,t.prepared);
 const plan=[targetGuard(env,t,capturedReview(origin)),event,business,user,app,terminal];let result:D1Result[];try{result=await env.DB.batch(plan);original(origin,env);}catch{return held();}
 if(result.length!==6||result.some(r=>!r||r.success!==true)||(result[0]?.results[0] as {admitted?:unknown}|undefined)?.admitted!==1||result[2]?.meta.changes!==1||result[3]?.meta.changes!==1||(classification.newEvent||reconsider&&t.app!==null)&&result[4]?.meta.changes!==1||!reconsider&&(result[5]?.results[0] as {recorded?:unknown}|undefined)?.recorded!==1)return held();return result[2]!;
}

export const REJECTION_EXPIRY_PREPARE_SQL="WITH native_clock AS MATERIALIZED(SELECT strftime('%s','now') AS raw)\nSELECT CASE WHEN typeof(raw)='text' AND length(raw) BETWEEN 1 AND 12\n AND length(CAST(raw AS BLOB))=length(raw) AND instr(raw,char(0))=0\n AND raw NOT GLOB '*[^0-9]*' AND substr(raw,1,1) BETWEEN '1' AND '9'\n AND CAST(CAST(raw AS INTEGER) AS TEXT)=raw AND CAST(raw AS INTEGER) BETWEEN 1 AND 253402300499\n AND (SELECT COUNT(*) FROM privacy_rejection_expiry_control)=1\n AND EXISTS(SELECT 1 FROM privacy_rejection_expiry_control WHERE singleton=1\n  AND protocol='original-guild-rejection-expiry-v1' AND typeof(observed_at)='integer'\n  AND observed_at BETWEEN 0 AND CAST(raw AS INTEGER)\n  AND typeof(selected_count)='integer' AND selected_count BETWEEN 0 AND 1000)\n THEN CAST(raw AS INTEGER) ELSE json_extract('rejection_expiry_preparation_held','$') END AS prepared_at\nFROM native_clock;";
export const REJECTION_EXPIRY_UPDATE_SQL="WITH native_clock AS MATERIALIZED(SELECT strftime('%s','now') AS raw),\n native_at AS MATERIALIZED(\n  SELECT CASE WHEN typeof(raw)='text' AND length(raw) BETWEEN 1 AND 12\n   AND length(CAST(raw AS BLOB))=length(raw) AND instr(raw,char(0))=0\n   AND raw NOT GLOB '*[^0-9]*' AND substr(raw,1,1) BETWEEN '1' AND '9'\n   AND CAST(CAST(raw AS INTEGER) AS TEXT)=raw AND CAST(raw AS INTEGER) BETWEEN 1 AND 253402300799\n   AND typeof(?1)='text' AND length(?1) BETWEEN 1 AND 12\n   AND length(CAST(?1 AS BLOB))=length(?1) AND instr(?1,char(0))=0\n   AND ?1 NOT GLOB '*[^0-9]*' AND substr(?1,1,1) BETWEEN '1' AND '9'\n   AND CAST(CAST(?1 AS INTEGER) AS TEXT)=?1 COLLATE BINARY\n   AND CAST(?1 AS INTEGER) BETWEEN 1 AND 253402300499\n   AND typeof(?2)='text' AND length(?2) BETWEEN 1 AND 12\n   AND length(CAST(?2 AS BLOB))=length(?2) AND instr(?2,char(0))=0\n   AND ?2 NOT GLOB '*[^0-9]*' AND substr(?2,1,1) BETWEEN '1' AND '9'\n   AND CAST(CAST(?2 AS INTEGER) AS TEXT)=?2 COLLATE BINARY\n   AND CAST(?2 AS INTEGER) BETWEEN 1 AND 253402300799\n   AND CAST(?2 AS INTEGER)=CAST(?1 AS INTEGER)+300\n   AND CAST(raw AS INTEGER)>=CAST(?1 AS INTEGER) AND CAST(raw AS INTEGER)<CAST(?2 AS INTEGER)\n   AND CAST(raw AS INTEGER)>=observed_at\n   THEN CAST(raw AS INTEGER) ELSE json_extract('rejection_expiry_original_clock_held','$') END AS at\n  FROM native_clock,privacy_rejection_expiry_control WHERE singleton=1\n )\nUPDATE privacy_rejection_expiry_control SET observed_at=(SELECT at FROM native_at),\n selected_count=(SELECT COUNT(*) FROM(\n  SELECT decision_id FROM privacy_rejection_decisions INDEXED BY privacy_rejection_decisions_expiry\n  WHERE retain_until<=(SELECT at FROM native_at) ORDER BY retain_until,decision_id LIMIT 1000))\nWHERE singleton=1 AND protocol='original-guild-rejection-expiry-v1'\nRETURNING observed_at,selected_count;";

type ExpiryInvocation=Readonly<{purpose:'original_rejection_expiry'}>;
const expiryOrigins=new WeakMap<ExpiryInvocation,{env:Env;db:D1Database;check:()=>void;spent:boolean}>();
export function captureRejectionExpiryInvocation(env:Env):ExpiryInvocation{const db=data(env,'DB') as D1Database,prepare=method(db,'prepare'),batch=method(db,'batch'),descriptor=field(env,'DB');assertPrivacyAdmissionWitness(db);const check=()=>{sameField(descriptor);if(data(env,'DB')!==db)return held();sameMethod(prepare,'prepare');sameMethod(batch,'batch');assertPrivacyAdmissionWitness(db);};check();const o=Object.freeze({purpose:'original_rejection_expiry' as const});expiryOrigins.set(o,{env,db,check,spent:false});return o;}
export async function sweepRejectionExpiry(env:Env,invocation:ExpiryInvocation):Promise<{preparedAt:number;observedAt:number;deleted:number;providerDrainQualified:false}>{const o=expiryOrigins.get(invocation);if(!o||o.env!==env||o.spent)return held();o.check();o.spent=true;const row=await o.db.prepare(REJECTION_EXPIRY_PREPARE_SQL).first<{prepared_at:number}>();o.check();const prepared=row?.prepared_at;if(!Number.isSafeInteger(prepared)||prepared!<1||prepared!>253402300499)return held();const result=await o.db.prepare(REJECTION_EXPIRY_UPDATE_SQL).bind(String(prepared!),String(prepared!+300)).all<{observed_at:number;selected_count:number}>();o.check();if(!result.success||result.results.length!==1)return held();const r=result.results[0]!;if(!Number.isSafeInteger(r.observed_at)||r.observed_at<prepared!||r.observed_at>=prepared!+300||!Number.isSafeInteger(r.selected_count)||r.selected_count<0||r.selected_count>1000)return held();return{preparedAt:prepared!,observedAt:r.observed_at,deleted:r.selected_count,providerDrainQualified:false};}

const SUMMARY_SOURCE=`SELECT CASE WHEN u.rejection_event_id IS NOT NULL THEN 'active' WHEN u.rejection_window_expired=1 THEN 'expired' WHEN u.denied=1 OR a.status='declined' THEN 'legacy_unknown' ELSE 'none' END AS state,d.source,d.rejected_at,d.retain_until,CASE WHEN a.rejection_event_id=u.rejection_event_id THEN 'original_application' ELSE 'account_mirror_only' END AS relation FROM site_users u LEFT JOIN site_applications a ON a.discord_id=u.discord_id LEFT JOIN privacy_rejection_decisions d ON d.decision_id=u.rejection_event_id AND d.subject_key=?2 AND d.target_account_incarnation=u.account_incarnation WHERE u.discord_id=?1`;
/** Exactly two fixed primitives; native byte/NUL limits execute BEFORE large values reach the FFI. */
export function rejectionSummaryStatement(env:Env,id:string,key:string):D1PreparedStatement{if(!ID.test(id)||!canonicalRejectionKey(key))return held();const fields=['state','source','rejected_at','retain_until','relation'];const bounded=fields.map(f=>`CASE WHEN ${f} IS NULL THEN NULL WHEN typeof(${f}) IN('integer','real') THEN ${f} WHEN typeof(${f})='text' AND length(CAST(${f} AS BLOB))<=256 AND instr(${f},char(0))=0 THEN ${f} ELSE json_extract('rejection_copy_scalar_held','$') END AS ${f}`).join(',');return env.DB.prepare(`WITH selected AS MATERIALIZED(${SUMMARY_SOURCE}) SELECT ${bounded} FROM selected LIMIT 2`).bind(id,key);}
export function projectRejectionSummary(rows:readonly unknown[]):unknown{if(rows.length>1)return held();if(!rows.length)return null;const r=rows[0];if(!r||typeof r!=='object')return held();const state=data(r,'state'),source=data(r,'source'),at=data(r,'rejected_at'),until=data(r,'retain_until'),relation=data(r,'relation');if(!['active','expired','legacy_unknown','none'].includes(state as string)||source!==null&&!['member_application_decline','explicit_membership_deny'].includes(source as string)||at!==null&&!Number.isSafeInteger(at)||until!==null&&!Number.isSafeInteger(until)||state==='active'&&(source===null||typeof at!=='number'||at<1||until!==at+31536000))return held();return Object.freeze({purpose:'guild_membership_rejection',state,source,originalRejectedAt:at,retainUntil:until,relation,coverage:'current minimized account mirror; legacy clock and other copies unqualified'});}


function keySql(x:string):string{return `typeof(${x})='text' AND length(${x})=43 AND length(CAST(${x} AS BLOB))=43 AND instr(${x},char(0))=0 AND ${x} NOT GLOB '*[^A-Za-z0-9_-]*' AND substr(${x},43,1) IN('A','E','I','M','Q','U','Y','c','g','k','o','s','w','0','4','8')`;}
function nonceSql(x:string):string{return `typeof(${x})='text' AND length(${x})=32 AND length(CAST(${x} AS BLOB))=32 AND instr(${x},char(0))=0 AND ${x} NOT GLOB '*[^0-9a-f]*'`;}
const validEvent=`((((${nonceSql('d.decision_id')}) AND ((${keySql('d.subject_key')}) AND (${nonceSql('d.target_account_incarnation')}))) AND (((d.target_generation IS NULL OR (${nonceSql('d.target_generation')}))) AND ((d.protocol='original-guild-membership-rejection-v1') AND (d.source IN('member_application_decline','explicit_membership_deny'))))) AND (((d.scope IN('pure_member_including_fallback0','pure_member_including_fallback1')) AND ((typeof(d.rejected_at)='integer') AND (d.rejected_at>0))) AND ((d.rejected_at<=${NOW}) AND ((typeof(d.retain_until)='integer') AND (d.retain_until=d.rejected_at+31536000)))))`;
/** Fixed Native pre-deletion scalar, reused verbatim by the consuming terminal guard. The existing
 * marker guard additionally checks the original grant/digest bridge in the SAME atomic group. */
export const ORIGINAL_REJECTION_COMPANION_READ_SQL=`(SELECT CASE
 WHEN u.discord_id IS NOT NULL AND(u.account_incarnation IS NOT j.original_account_incarnation OR j.original_account_incarnation IS NULL) THEN json_extract('recovery_birth_changed_held','$')
 WHEN u.discord_id IS NULL AND j.original_account_incarnation IS NOT NULL THEN json_extract('recovery_birth_absent_held','$')
 WHEN m.subject_key IS NOT NULL AND NOT(${keySql('m.subject_key')} AND typeof(m.denied_at)='integer' AND m.denied_at>0 AND m.denied_at<=${NOW} AND typeof(m.retain_until)='integer' AND m.retain_until=m.denied_at+31536000 AND m.reason='rejected_guild_application_or_membership') THEN json_extract('recovery_original_marker_held','$')
 WHEN u.rejection_event_id IS NOT NULL AND NOT(d.decision_id IS NOT NULL AND ${validEvent} AND d.subject_key=?7 AND u.rejection_subject_key=?7 AND d.scope=u.rejection_scope AND d.target_account_incarnation=u.account_incarnation AND u.rejection_window_expired=0 AND(d.target_generation=j.subject_generation OR(d.target_generation IS NULL AND EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=j.subject_id AND ps.generation=j.subject_generation AND ps.state='retiring' AND ps.revision=1 AND ps.created_at=j.created_at)))) THEN json_extract('recovery_original_event_held','$')
 WHEN u.rejection_event_id IS NULL AND u.discord_id IS NOT NULL AND NOT((u.rejection_window_expired=1 AND u.rejection_subject_key=?7 AND u.rejection_scope IN('pure_member_including_fallback0','pure_member_including_fallback1')) OR(u.rejection_window_expired=0 AND u.rejection_subject_key IS NULL AND u.rejection_scope IS NULL AND u.denied=0 AND ${noAmbiguousMemberDecline('?7')})) THEN json_extract('recovery_legacy_denial_held','$')
 WHEN u.discord_id IS NULL AND(EXISTS(SELECT 1 FROM site_applications WHERE discord_id=j.subject_id) OR EXISTS(SELECT 1 FROM privacy_rejection_decisions WHERE subject_key=?7)) THEN json_extract('recovery_original_absence_held','$')
 WHEN m.retain_until>${NOW} AND(d.retain_until IS NULL OR m.denied_at<=d.rejected_at) THEN json_array('active',m.denied_at,m.retain_until)
 WHEN d.retain_until>${NOW} THEN json_array('active',d.rejected_at,d.retain_until)
 ELSE json_array('none',NULL,NULL) END
 FROM(SELECT j.subject_id AS subject) original
 LEFT JOIN site_users u ON u.discord_id=original.subject
 LEFT JOIN privacy_denial_markers m ON m.subject_key=?7
 LEFT JOIN privacy_rejection_decisions d ON d.decision_id=u.rejection_event_id)`;

/** Original job facts are read once; digest equality and the same native row facts are fenced in the consuming group.
 * A null event generation adopts ONLY the first genuine erasure birth, never a later OAuth/PITR generation. */
const INACTIVE_BOT_MARKER_CLOCK=`MAX(COALESCE(m.activity_at,0),COALESCE(m.linked_at,0),COALESCE(m.bnet_linked_at,0),
 COALESCE((SELECT MAX(COALESCE(c.left_at,c.verified_at,c.bound_at)) FROM characters c WHERE c.discord_id=m.discord_id),0),
 COALESCE((SELECT MAX(p.created_at) FROM pending p WHERE p.discord_id=m.discord_id),0),
 COALESCE((SELECT MAX(COALESCE(q.joined_at,q.invited_at,q.written_at,q.created_at)) FROM invite_queue q WHERE q.discord_id=m.discord_id),0))`;
function markerProof(proof:AccountErasureProof){
 const p=Object.freeze({purpose:data(proof,'purpose'),subject:data(proof,'subject') as string,g:data(proof,'subjectGeneration') as string,op:data(proof,'operationId') as string,digest:data(proof,'requestDigest') as string,n:data(proof,'accountIncarnation') as string|null});
 if(p.purpose!=='account_erasure'||typeof p.subject!=='string'||p.subject.length<17||p.subject.length>20||/[^0-9]/.test(p.subject)||!ID.test(p.subject)||typeof p.g!=='string'||p.g.length!==32||!HEX.test(p.g)||typeof p.op!=='string'||p.op.length!==32||!HEX.test(p.op)||typeof p.digest!=='string'||p.digest.length!==64||!/^[0-9a-f]{64}$/.test(p.digest))return held();if(p.n!==null)privacyAccountIncarnation(p.n);
 return p;
}
const markerBasisColumns=(activityClock:string)=>`j.original_session_version AS v,j.original_session_expires AS e,j.created_at AS created,j.original_account_incarnation AS original_n,u.account_incarnation AS site_n,u.discord_id AS site_subject,u.last_login AS last_login,${activityClock} AS activity_clock,a.session_hash AS grant_session,a.subject_generation AS grant_generation,a.state AS grant_state,a.revision AS grant_revision,a.grant_id AS grant_id,a.csrf_hash AS grant_csrf,a.created_at AS grant_created,a.expires_at AS grant_expires,a.consumed_at AS grant_consumed,(SELECT COUNT(*) FROM privacy_access_grants ag WHERE ag.grant_id=j.operation_id AND ag.subject_id=j.subject_id AND ag.purpose='own_erasure' AND ag.consumed_at IS NOT NULL) AS grant_count`;
async function markerBridge(db:D1Database,p:ReturnType<typeof markerProof>,nativeRow:Record<string,unknown>){
 const row=Object.freeze({v:data(nativeRow,'v') as number,e:data(nativeRow,'e') as number,created:data(nativeRow,'created') as number,original_n:data(nativeRow,'original_n') as string|null,site_n:data(nativeRow,'site_n') as string|null,site_subject:data(nativeRow,'site_subject') as string|null,last_login:data(nativeRow,'last_login') as number|null,activity_clock:data(nativeRow,'activity_clock') as number|null,grant_session:data(nativeRow,'grant_session') as string|null,grant_generation:data(nativeRow,'grant_generation') as string|null,grant_state:data(nativeRow,'grant_state') as string|null,grant_revision:data(nativeRow,'grant_revision') as number|null,grant_id:data(nativeRow,'grant_id') as string|null,grant_csrf:data(nativeRow,'grant_csrf') as string|null,grant_created:data(nativeRow,'grant_created') as number|null,grant_expires:data(nativeRow,'grant_expires') as number|null,grant_consumed:data(nativeRow,'grant_consumed') as number|null,grant_count:data(nativeRow,'grant_count') as number});if(row.original_n!==p.n||!Number.isSafeInteger(row.v)||!Number.isSafeInteger(row.e)||!Number.isSafeInteger(row.created)||row.created<1)return held();
 const bot=row.v===0&&row.e===0&&p.n===null&&row.site_subject===null,identify=row.v===0&&row.e>0;
  if(identify&&(row.grant_count!==1||typeof row.grant_session!=='string'||row.grant_session.length!==64||/[^0-9a-f]/.test(row.grant_session)||typeof row.grant_csrf!=='string'||row.grant_csrf.length!==64||/[^0-9a-f]/.test(row.grant_csrf)||row.grant_id!==p.op||row.grant_expires!==row.e||typeof row.grant_created!=='number'||!Number.isSafeInteger(row.grant_created)||row.grant_expires!==row.grant_created+720||row.grant_created<1||typeof row.grant_consumed!=='number'||!Number.isSafeInteger(row.grant_consumed)||row.grant_consumed<row.grant_created||row.grant_consumed>=row.grant_expires||row.grant_generation!==null&&(typeof row.grant_generation!=='string'||row.grant_generation.length!==32||/[^0-9a-f]/.test(row.grant_generation))||(row.grant_generation===null?(row.grant_state!==null||row.grant_revision!==null):!(['active','retiring','retired'].includes(row.grant_state??'')&&Number.isSafeInteger(row.grant_revision)&&row.grant_revision!==null&&row.grant_revision>=0))))return held();
 if(bot?(typeof row.activity_clock!=='number'||!Number.isSafeInteger(row.activity_clock)||row.activity_clock<1):identify?(p.n===null?row.site_subject!==null:row.site_subject!==p.subject||row.site_n!==p.n):(row.site_subject!==p.subject||row.site_n!==p.n||row.v<1||row.e<0||typeof row.last_login!=='number'||!Number.isSafeInteger(row.last_login)))return held();
  const raw=bot?['inactive_bot_account',p.subject,p.g,p.op,row.activity_clock]:identify?['identify_only_erasure_incarnation_v1',row.grant_session,p.subject,row.grant_generation,row.grant_state,row.grant_revision,row.grant_id,p.g,row.grant_expires,row.grant_csrf,p.n===null?0:1,p.n]:row.e===0?['inactive_serving_account_incarnation_v1',p.subject,p.g,p.op,row.v,row.last_login,p.n]:['serving_account_incarnation_v1',p.subject,p.g,p.op,row.v,row.e,null,p.n];
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(raw))))].map(b=>b.toString(16).padStart(2,'0')).join('');assertPrivacyAdmissionWitness(db);
 const bridge=digest===p.digest?1:0;
 if(identify&&bridge!==1)return held();
 return {row,bot,identify,bridge};
}
function currentRejectionEventSql(key:string,generation:string):string{
 return `d.decision_id=u.rejection_event_id AND d.subject_key=${key} AND u.rejection_subject_key=${key} AND d.scope=u.rejection_scope AND d.target_account_incarnation=u.account_incarnation AND u.rejection_window_expired=0 AND ${validEvent} AND ${generation}`;
}
function qualifiedExpiredRejectionMirrorSql(key:string):string{
 return `NOT EXISTS(SELECT 1 FROM privacy_denial_markers m WHERE m.subject_key=${key} AND m.retain_until>${NOW}) AND ${keySql('u.rejection_subject_key')} AND u.rejection_subject_key=${key} AND u.rejection_scope IN('pure_member_including_fallback0','pure_member_including_fallback1')`;
}
const validPriorMarkerSql=`${keySql('m.subject_key')} AND typeof(m.denied_at)='integer' AND m.denied_at>0 AND m.denied_at<=${NOW} AND typeof(m.retain_until)='integer' AND m.retain_until=m.denied_at+31536000 AND m.reason='rejected_guild_application_or_membership'`;

/** A single non-throwing decision projection. Storage failure stays distinct from a proved review hold. */
export async function readNativeErasureRejectionPreflight(env:Env,proof:AccountErasureProof,key:string|null,reviewReason:string):Promise<'ready'|'stale'|'staff_review'|'unknown'>{
 const original=captureAccountErasureProof(proof);proof=original.proof;const p=markerProof(proof);
 if(p.n===null?key!==null:key===null||!canonicalRejectionKey(key))return held();
 const firstGeneration=`(d.target_generation IS NULL AND EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=j.subject_id AND ps.generation=j.subject_generation AND ps.state='retiring' AND ps.revision=1 AND ps.created_at=j.created_at))`;
 const ownedEvent=currentRejectionEventSql('?5',`(d.target_generation=j.subject_generation OR ${firstGeneration})`);
 const qualified=`((u.rejection_event_id IS NOT NULL AND d.decision_id IS NOT NULL AND ${ownedEvent}) OR
  (u.rejection_event_id IS NULL AND u.rejection_window_expired=1 AND ${qualifiedExpiredRejectionMirrorSql('?5')}))`;
 original.check();
 const row=await env.DB.prepare(`SELECT CASE
  WHEN NOT (${CURRENT_ERASURE_SQL} AND ${originalErasureJobBirthSql(proof)}) THEN 'stale'
  WHEN j.hold_reason=?6 THEN 'staff_review'
  WHEN u.discord_id IS NULL OR (typeof(u.denied)='integer' AND u.denied=0) THEN 'ready'
  WHEN typeof(u.denied)<>'integer' OR u.denied<>1 OR NOT (${CLOCK}) THEN 'unknown'
  WHEN NOT COALESCE(${qualified},0) THEN 'staff_review'
  WHEN EXISTS(SELECT 1 FROM privacy_denial_markers m WHERE m.subject_key=?5 AND NOT (${validPriorMarkerSql})) THEN 'unknown'
  WHEN u.rejection_event_id IS NOT NULL AND d.target_generation IS NULL THEN 'first_generation'
  ELSE 'ready' END AS disposition, ${markerBasisColumns('NULL')}
  FROM privacy_serving_jobs j LEFT JOIN site_users u ON u.discord_id=j.subject_id
  LEFT JOIN privacy_rejection_decisions d ON d.decision_id=u.rejection_event_id
  LEFT JOIN privacy_access_grants a ON a.grant_id=j.operation_id AND a.subject_id=j.subject_id AND a.purpose='own_erasure' AND a.consumed_at IS NOT NULL
   AND typeof(u.denied)='integer' AND u.denied=1 AND d.decision_id IS NOT NULL AND d.target_generation IS NULL
  WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4`)
  .bind(p.op,p.subject,p.g,p.digest,key,reviewReason).first<Record<string,unknown>>();
 original.check();if(!row)return 'stale';
 const disposition=data(row,'disposition');
 if(disposition==='staff_review'||disposition==='ready'||disposition==='stale')return disposition;
 if(disposition!=='first_generation')return 'unknown';
 const db=privacyProviderCustodyDatabase(env);assertPrivacyAdmissionWitness(db);
 const originalBasis=await markerBridge(db,p,row);original.check();
 return originalBasis.bridge===1?'ready':'unknown';
}

export async function rejectionErasureMarkerStatements(env:Env,proof:AccountErasureProof,key:string):Promise<D1PreparedStatement[]>{
 const p=markerProof(proof);if(!canonicalRejectionKey(key))return held();
 const db=privacyProviderCustodyDatabase(env);assertPrivacyAdmissionWitness(db);
 const nativeRow=await db.prepare(`SELECT ${markerBasisColumns(`(SELECT ${INACTIVE_BOT_MARKER_CLOCK} FROM members m WHERE m.discord_id=j.subject_id)`)} FROM privacy_serving_jobs j LEFT JOIN site_users u ON u.discord_id=j.subject_id LEFT JOIN privacy_access_grants a ON a.grant_id=j.operation_id AND a.subject_id=j.subject_id AND a.purpose='own_erasure' AND a.consumed_at IS NOT NULL WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4 AND j.state IN('waiting_role','held','erasing')`).bind(p.op,p.subject,p.g,p.digest).first<Record<string,unknown>>();assertPrivacyAdmissionWitness(db);if(!nativeRow)return held();
 const {row,bot,identify,bridge}=await markerBridge(db,p,nativeRow);
  const originalGrantSql=identify?`EXISTS(SELECT 1 FROM privacy_access_grants a WHERE a.session_hash='${row.grant_session}' AND a.purpose='own_erasure' AND a.subject_id='${p.subject}' AND a.grant_id='${p.op}' AND a.csrf_hash='${row.grant_csrf}' AND a.subject_generation IS ${row.grant_generation===null?'NULL':`'${row.grant_generation}'`} AND a.state IS ${row.grant_state===null?'NULL':`'${row.grant_state}'`} AND a.revision IS ${row.grant_revision===null?'NULL':row.grant_revision} AND a.created_at=${row.grant_created} AND a.expires_at=${row.e} AND a.consumed_at=${row.grant_consumed}) AND (SELECT COUNT(*) FROM privacy_access_grants a WHERE a.grant_id='${p.op}' AND a.subject_id='${p.subject}' AND a.purpose='own_erasure' AND a.consumed_at IS NOT NULL)=1`:'1';
 if(bot||identify&&p.n===null){
  if(bridge!==1)return held();
  const prior=validPriorMarkerSql;
  const guard=env.DB.prepare(`SELECT CASE WHEN ${CLOCK} AND ?5=1
   AND EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN privacy_subjects ps ON ps.subject_id=j.subject_id AND ps.generation=j.subject_generation WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4 AND j.original_session_version=0 AND j.original_session_expires=${row.e} AND j.original_account_incarnation IS NULL AND j.created_at=?7 AND j.state IN('waiting_role','held','erasing') AND j.retain_until>${NOW} AND ps.state='retiring')
   AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=?2)
   AND ${originalGrantSql} AND ${bot?`EXISTS(SELECT 1 FROM members m WHERE m.discord_id=?2 AND typeof(${INACTIVE_BOT_MARKER_CLOCK})='integer' AND ${INACTIVE_BOT_MARKER_CLOCK}=?6 AND ?6>0 AND ?6<=${NOW}-31536000)`:'1'}
   AND NOT EXISTS(SELECT 1 FROM site_applications WHERE discord_id=?2)
   AND NOT EXISTS(SELECT 1 FROM privacy_rejection_decisions WHERE subject_key=?8)
   AND NOT EXISTS(SELECT 1 FROM privacy_denial_markers m WHERE m.subject_key=?8 AND NOT (${prior}))
   THEN 1 ELSE json_extract('original_inactive_bot_rejection_held','$') END AS admitted`).bind(p.op,p.subject,p.g,p.digest,bridge,row.activity_clock,row.created,key);
  // The original accountless proof has no qualifying site rejection to create a marker from.
  // Keep the real guarded two-payload transaction and preserve every existing valid prior marker.
  const insert=env.DB.prepare(`INSERT INTO privacy_denial_markers(subject_key,denied_at,retain_until,reason) SELECT ?8,?6,?6+31536000,'rejected_guild_application_or_membership' WHERE 0`).bind(p.op,p.subject,p.g,p.digest,bridge,row.activity_clock,row.created,key);
  return [guard,insert];
 }
 const generation=`(d.target_generation=?3 OR (d.target_generation IS NULL AND ?5=1 AND EXISTS(SELECT 1 FROM privacy_subjects ps JOIN privacy_serving_jobs j ON j.subject_id=ps.subject_id AND j.subject_generation=ps.generation WHERE ps.subject_id=?1 AND ps.generation=?3 AND ps.state='retiring' AND ps.revision=1 AND ps.created_at=j.created_at AND j.operation_id=?4 AND j.original_session_version=?6 AND j.original_session_expires=?7 AND j.original_account_incarnation IS ${p.n===null?'NULL':`'${privacyAccountIncarnation(p.n)}'`} AND j.created_at=?8 AND u.last_login=?9)))`;
 const own=`${p.n===null?'0':privacyAccountIncarnationLiteralFenceSql('u.account_incarnation',p.n)} AND ${currentRejectionEventSql('?2',generation)}`;
 const prior=validPriorMarkerSql;
 const params=[p.subject,key,p.g,p.op,bridge,row.v,row.e,row.created,row.last_login];
 const guard=env.DB.prepare(`SELECT CASE WHEN ${CLOCK} AND ${originalGrantSql} AND NOT EXISTS(SELECT 1 FROM privacy_denial_markers m WHERE m.subject_key=?2 AND NOT (${prior})) AND EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.operation_id=?4 AND j.request_digest='${p.digest}' AND j.subject_id=?1 AND j.subject_generation=?3 AND j.original_session_version=?6 AND j.original_session_expires=?7 AND j.created_at=?8 AND j.original_account_incarnation IS ${p.n===null?'NULL':`'${privacyAccountIncarnation(p.n)}'`} AND j.state IN('waiting_role','held','erasing')) AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?1 AND ${p.n===null?'0':privacyAccountIncarnationLiteralFenceSql('u.account_incarnation',p.n)} AND (CASE WHEN u.rejection_event_id IS NOT NULL THEN EXISTS(SELECT 1 FROM privacy_rejection_decisions d WHERE ${own}) WHEN u.rejection_window_expired=1 THEN ${qualifiedExpiredRejectionMirrorSql('?2')} WHEN u.rejection_subject_key IS NULL AND u.rejection_scope IS NULL AND u.rejection_window_expired=0 THEN u.denied=0 AND ${noAmbiguousMemberDecline('?2')} ELSE 0 END)) THEN 1 ELSE json_extract('original_rejection_marker_held','$') END AS admitted`).bind(...params);
 const insert=env.DB.prepare(`INSERT INTO privacy_denial_markers(subject_key,denied_at,retain_until,reason) SELECT ?2,CASE WHEN m.denied_at IS NOT NULL AND m.denied_at<=d.rejected_at THEN m.denied_at ELSE d.rejected_at END,CASE WHEN m.denied_at IS NOT NULL AND m.denied_at<=d.rejected_at THEN m.retain_until ELSE d.retain_until END,'rejected_guild_application_or_membership' FROM site_users u JOIN privacy_rejection_decisions d ON d.decision_id=u.rejection_event_id LEFT JOIN privacy_denial_markers m ON m.subject_key=?2 AND m.retain_until>${NOW} WHERE u.discord_id=?1 AND ${own} AND (CASE WHEN m.denied_at IS NOT NULL AND m.denied_at<=d.rejected_at THEN m.retain_until ELSE d.retain_until END)>${NOW} ON CONFLICT(subject_key) DO UPDATE SET denied_at=excluded.denied_at,retain_until=excluded.retain_until,reason=excluded.reason`).bind(...params);
 return [guard,insert];
}

