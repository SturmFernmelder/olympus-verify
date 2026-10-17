/** Attended single-parent retirement. A site session is never a general Discord role capability. */
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import type {Env} from './env';
import {apiJson,isSiteAdmin,PAGE_VERSION,rateLimited,readSession,sameOrigin,sign,verify,type SiteUser} from './site-core';
import {fenceSql} from './community-context';
import {membershipTargets,membershipTargetsCurrent,membershipTransitionEnabled} from './membership-role-transition';
import {DB_NOW,randomGeneration} from './account-generation-contracts';
import {admitAttendedMembershipRetirement,retireOwnedMembershipRole,RETIREMENT_PARENT_FIELDS,type RetirementParent} from './role-settlements';
import {captureBetaRoleDispatch,type BetaRoleDispatch} from './beta-reset-policy';

const ROOT='/api/admin/membership-retirement',HEX=/^[0-9a-f]{32}$/,MAC=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
type Session=OriginalSiteSession;
type Form={expiresAt:number;formNonce:string;token:string};
type Captured={parent:RetirementParent;generation:string|null;active:boolean;at:number};
class Refused extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
const keys=(v:unknown,wanted:string)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===wanted;
const canonical=(p:RetirementParent)=>Object.fromEntries(RETIREMENT_PARENT_FIELDS.map(k=>[k,p[k]]));
const claims=(purpose:string,s:Session,b:ReturnType<typeof membershipTargets>,c:Captured,f:Omit<Form,'token'>,child:RetirementParent|null)=>JSON.stringify({purpose,staff:s,binding:b,parent:canonical(c.parent),generation:c.generation,form:f,child:child?canonical(child):null});
const purpose=(reconcile:boolean)=>reconcile?'membership-retirement-reconcile-v1':'membership-retirement-v1';
/** Closed, bounded JSON. Canonical string escapes/numbers and no duplicate keys are required. */
async function body(request:Request):Promise<Record<string,unknown>>{
 if(request.headers.get('Content-Type')?.split(';')[0]?.trim()!=='application/json'||!request.body)throw new Refused('retirement_bad_request',400);
 const reader=request.body.getReader(),pieces:Uint8Array[]=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2048){await reader.cancel();throw new Refused('retirement_bad_request',400);}pieces.push(r.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of pieces){bytes.set(p,at);at+=p.length;}
 let raw:string,v:unknown;try{raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);v=JSON.parse(raw);}catch{throw new Refused('retirement_bad_request',400);}
 let compact='',quoted=false,escaped=false;for(const ch of raw!){if(quoted){compact+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"'){quoted=true;compact+=ch;}else if(!/[\t\r\n ]/.test(ch))compact+=ch;}
 if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v)!==compact)throw new Refused('retirement_bad_request',400);
 return v as Record<string,unknown>;
}
async function capture(env:Env,s:Session,id:string,b:ReturnType<typeof membershipTargets>):Promise<Captured>{
 const p=await env.DB.prepare(`SELECT p.*,g.generation AS capture_generation,g.state AS capture_state,${DB_NOW} AS capture_at
 FROM role_settlements p LEFT JOIN privacy_subjects g ON g.subject_id=p.subject WHERE p.id=?1
 AND p.guild_id=?2 AND p.role_id=?3 AND p.purpose='roster_membership' AND p.proof_id IS NULL
 AND p.desired=1 AND p.attempts=1 AND p.state='settled' AND p.claim_nonce IS NOT NULL
 AND ${fenceSql('applicantWrite',4,5,6,s.g,s.n)}`).bind(id,b.guild,b.retired,s.u,s.v,s.e).first<RetirementParent&{capture_generation:string|null;capture_state:string|null;capture_at:number}>();
 if(!p||!isSiteAdmin(env,s.u)||!membershipTargetsCurrent(env,b))throw new Refused('retirement_original_admission_changed');
 const parent=Object.freeze(canonical(p)) as RetirementParent,generation=p.capture_generation??null;
 return {parent,generation,active:p.capture_state===null||p.capture_state==='active',at:p.capture_at};
}
async function child(env:Env,parent:RetirementParent):Promise<RetirementParent|null>{
 const rows=(await env.DB.prepare(`SELECT * FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1 ORDER BY created_at,id LIMIT 2`).bind(parent.id).all<RetirementParent>()).results;
 if(rows.length>1)throw new Refused('retirement_receipt_ambiguous');const r=rows[0];
 if(r&&(r.subject!==parent.subject||r.guild_id!==parent.guild_id||r.role_id!==parent.role_id||r.subject_generation!==parent.subject_generation||r.desired!==0||!r.reason.startsWith('membership_retirement')))throw new Refused('retirement_receipt_changed');
 return r?Object.freeze(canonical(r)) as RetirementParent:null;
}
const childDto=(r:RetirementParent|null)=>r?{operationId:r.id,state:r.state,attempted:r.attempts===1}:null;
export async function handleMembershipRetirement(request:Request,env:Env,path:string,admin:SiteUser,originalDispatch?:BetaRoleDispatch):Promise<Response>{
 // Item 15: the beta dispatch mode is captured before this handler's first await and threaded to the attended removal.
 const removalDispatch=originalDispatch??captureBetaRoleDispatch(env);
 try{
  if(path!==ROOT&&path!==ROOT+'/retire'&&path!==ROOT+'/reconcile')throw new Refused('not_found',404);
  if(!membershipTransitionEnabled(env))throw new Refused('retirement_disabled',503);
  let binding:ReturnType<typeof membershipTargets>;try{binding=membershipTargets(env);}catch{throw new Refused('retirement_configuration');}
  if(!binding.retired)throw new Refused('retirement_binding_absent');
  const s=await readSession(env,request);
  if(!s||!isSiteAdmin(env,s.u)||s.u!==admin.discord_id||s.v!==admin.session_version||s.g!==(admin.privacyGeneration??null)||!Number.isSafeInteger(s.v)||s.v<1||!Number.isSafeInteger(s.e))throw new Refused('retirement_staff_required',403);
  assertOriginalSiteSessionRead(s);const original=s;const url=new URL(request.url);
  if(url.pathname!==path)throw new Refused('not_found',404);
  if(request.method==='GET'&&path===ROOT){
   if([...url.searchParams.keys()].join(',')!=='parentGrantId'||!HEX.test(url.searchParams.get('parentGrantId')??''))throw new Refused('retirement_bad_request',400);
   const c=await capture(env,original,url.searchParams.get('parentGrantId')!,binding),r=await child(env,c.parent);
   const f={expiresAt:Math.min(original.e,c.at+300),formNonce:randomGeneration()};
   const retire=!r&&c.active&&c.generation===c.parent.subject_generation;
   const recover=!!r&&r.attempts===1&&!!r.claim_nonce&&['dispatching','unknown','settled'].includes(r.state);
   const form=retire||recover?{...f,token:await sign(env.COOKIE_SECRET,purpose(recover),claims(purpose(recover),original,binding,c,f,recover?r:null))}:null;
   return apiJson({parentGrantId:c.parent.id,subject:c.parent.subject,guildId:binding.guild,currentRoleId:binding.current,retiredRoleId:binding.retired,ownedGrantState:c.parent.state,child:childDto(r),action:retire?'retire':recover?'reconcile':null,form});
  }
  if(request.method!=='POST'||path===ROOT)throw new Refused('method_not_allowed',405);
  if(url.search||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)throw new Refused('retirement_bad_origin',403);
  if(rateLimited('membership-retirement:'+s.u,12,60))throw new Refused('retirement_slow_down',429);
  const input=await body(request),reconcile=path.endsWith('/reconcile');
  if(!keys(input,reconcile?'form,operationId,parentGrantId':'form,parentGrantId')||typeof input.parentGrantId!=='string'||!HEX.test(input.parentGrantId)||reconcile&&(typeof input.operationId!=='string'||!HEX.test(input.operationId)))throw new Refused('retirement_bad_request',400);
  const f=input.form as Form;
  if(!keys(f,'expiresAt,formNonce,token')||!Number.isSafeInteger(f.expiresAt)||f.expiresAt>original.e||!HEX.test(f.formNonce)||typeof f.token!=='string'||!MAC.test(f.token))throw new Refused('retirement_form_refused',403);
  const c=await capture(env,original,input.parentGrantId,binding),r=await child(env,c.parent);
  if(f.expiresAt<=c.at||f.expiresAt>c.at+300)throw new Refused('retirement_form_expired');
  if(reconcile?(!r||r.id!==input.operationId||r.attempts!==1||!r.claim_nonce||!['dispatching','unknown','settled'].includes(r.state)):(!c.active||c.generation!==c.parent.subject_generation))throw new Refused('retirement_original_capture_changed');
  if(!await verify(env.COOKIE_SECRET,purpose(reconcile),claims(purpose(reconcile),original,binding,c,{expiresAt:f.expiresAt,formNonce:f.formNonce},reconcile?r:null),f.token))throw new Refused('retirement_form_refused',403);
  const admission=admitAttendedMembershipRetirement(env,{staff:original,binding,parent:c.parent,subjectGeneration:c.generation,expiresAt:f.expiresAt,formNonce:f.formNonce,child:reconcile?r:null});
  const budget={limit:8,attempts:0,retries:0};
  const settled=await retireOwnedMembershipRole(env,c.parent.id,{subjectGeneration:c.generation},budget,admission,removalDispatch);
  return apiJson({...settled,providerAttempts:budget.attempts},settled.state==='held'?409:200);
 }catch(e){return e instanceof Refused?apiJson({error:e.code},e.status):apiJson({error:'retirement_outcome_unconfirmed'},503);}
}
