/** Owner preview and immutable arming of the fixed beta reset. This route never touches Discord. */
import type {Env} from './env';
import {assertOriginalSiteSessionRead,type OriginalSiteSession} from './privacy-site-session-incarnation';
import {apiJson,isSiteAdmin,PAGE_VERSION,rateLimited,readSession,sameOrigin,sign,verify,type SiteUser} from './site-core';
import {fenceSql} from './community-context';
import {DB_NOW,randomGeneration} from './account-generation-contracts';
import {betaRoleResetStatus} from './beta-reset';
import {BETA_RESET_POLICY_KEY,BETA_RESET_EPOCH,BETA_RESET_CUTOFF,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS,
 captureBetaGrant,betaGrantCurrent,betaGrantSql,betaRetentionSourceSql,betaPolicyRetirementSql,parseBetaResetPolicy,parseBetaResetRetirement} from './beta-reset-policy';
import {BETA_RETENTION_ANCHOR_KEY} from './privacy-retention-clocks';
import {betaRetentionEvidence,betaRetentionCanConfirm,betaRetentionBinding,betaRetentionStatus} from './beta-retention-anchor';
const ROOT='/api/admin/beta-role-reset',PURPOSE='beta-role-reset-arm-v1',HEX=/^[0-9a-f]{32}$/,MAC=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const RETENTION_PURPOSE='beta-retention-cutoff-confirm-v1';
const RETIRE_PURPOSE='beta-role-reset-retire-v1';
type Session=OriginalSiteSession;
type Form={expiresAt:number;formNonce:string;token:string};
class Refused extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
const keys=(v:unknown,wanted:string)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===wanted;
const config=(env:Env)=>['BETA_RESET_REMOVALS_ENABLED','GUILD_ID','DISCORD_APP_ID','SITE_ADMINS','ROLE_GUILD_MEMBER','ROLE_GUILD_LEADER','ROLE_OFFICER','ROLE_RAID_LEADER','ROLE_GUILD_MASTER','ROLE_MODERATOR','QR_NATIVE_ROLE_MAP'].map(k=>Object.getOwnPropertyDescriptor(env,k)?.value??null);
const claims=(s:Session,b:unknown,f:Omit<Form,'token'>,purpose=PURPOSE,retention:unknown=null)=>JSON.stringify({purpose,staff:s,binding:b,epoch:BETA_RESET_EPOCH,cutoff:BETA_RESET_CUTOFF,guildId:BETA_RESET_GUILD_ID,roleIds:BETA_RESET_ROLE_IDS,form:f,retention});
async function body(request:Request,wanted='form'):Promise<Record<string,unknown>>{
 if(request.headers.get('Content-Type')?.split(';')[0]?.trim()!=='application/json'||!request.body)throw new Refused('beta_reset_bad_request',400);
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1024){await reader.cancel();throw new Refused('beta_reset_bad_request',400);}parts.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 let raw:string,v:unknown;try{raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);v=JSON.parse(raw);}catch{throw new Refused('beta_reset_bad_request',400);}
 let compact='',quoted=false,escaped=false;for(const ch of raw!){if(quoted){compact+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"'){quoted=true;compact+=ch;}else if(!/[\t\r\n ]/.test(ch))compact+=ch;}
 if(!keys(v,wanted)||JSON.stringify(v)!==compact)throw new Refused('beta_reset_bad_request',400);return v as Record<string,unknown>;
}
async function authority(env:Env,s:Session):Promise<number>{
 assertOriginalSiteSessionRead(s);if(!isSiteAdmin(env,s.u))throw new Refused('beta_reset_owner_required',403);
 const r=await env.DB.prepare(`SELECT ${DB_NOW} AS at WHERE ${fenceSql('applicantWrite',1,2,3,s.g,s.n)}`).bind(s.u,s.v,s.e).first<{at:number}>();
 assertOriginalSiteSessionRead(s);if(!r||!Number.isSafeInteger(r.at)||!isSiteAdmin(env,s.u))throw new Refused('beta_reset_original_owner_changed',403);return r.at;
}
export async function handleBetaRoleReset(request:Request,env:Env,path:string,admin:SiteUser):Promise<Response>{
 try{
  const url=new URL(request.url);if(url.pathname!==path||url.search||![ROOT,ROOT+'/arm',ROOT+'/confirm-cutoff',ROOT+'/retire'].includes(path))throw new Refused('not_found',404);
  const s=await readSession(env,request);
  if(!s||!isSiteAdmin(env,s.u)||s.u!==admin.discord_id||s.v!==admin.session_version||s.n!==admin.account_incarnation||s.g!==(admin.privacyGeneration??null)||!Number.isSafeInteger(s.v)||s.v<1||!Number.isSafeInteger(s.e))throw new Refused('beta_reset_owner_required',403);
  assertOriginalSiteSessionRead(s);const original=s,at=await authority(env,original);
  const c=await captureBetaGrant(env,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS[0]!),binding=config(env);
  if(request.method==='GET'&&path===ROOT){
   const status=await betaRoleResetStatus(env);let form:Form|null=null;
   if(status.canArm&&c.mode==='open'&&c.raw===null&&await betaGrantCurrent(env,c)){
    const f={expiresAt:Math.min(original.e,at+300,BETA_RESET_CUTOFF),formNonce:randomGeneration()};
    form={...f,token:await sign(env.COOKIE_SECRET,PURPOSE,claims(original,binding,f))};
   }
   const evidence=await betaRetentionEvidence(env);let retentionForm:Form|null=null;
   if(betaRetentionCanConfirm(evidence)&&betaRetentionSourceSql(env,c,1).sql!=='0=1'){
    const f={expiresAt:Math.min(original.e,at+300),formNonce:randomGeneration()};
    retentionForm={...f,token:await sign(env.COOKIE_SECRET,RETENTION_PURPOSE,claims(original,binding,f,RETENTION_PURPOSE,betaRetentionBinding(evidence)))};
   }
   let retireForm:Form|null=null;
   if(status.canRetire&&parseBetaResetPolicy(c.raw,env)&&betaPolicyRetirementSql(env,c,1).sql!=='0=1'){
    const f={expiresAt:Math.min(original.e,at+300),formNonce:randomGeneration()};
    retireForm={...f,token:await sign(env.COOKIE_SECRET,RETIRE_PURPOSE,claims(original,binding,f,RETIRE_PURPOSE,c.raw))};
   }
   await authority(env,original);return apiJson({...status,form,retention:betaRetentionStatus(evidence),retentionForm,retireForm},200,{'Cache-Control':'no-store'});
  }
  if(request.method!=='POST'||path!==ROOT+'/arm'&&path!==ROOT+'/confirm-cutoff'&&path!==ROOT+'/retire')throw new Refused('method_not_allowed',405);
  if(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)throw new Refused('beta_reset_bad_origin',403);
  if(rateLimited('beta-reset-arm:'+s.u,6,60))throw new Refused('beta_reset_slow_down',429);
  if(path===ROOT+'/retire'){
   const retired=parseBetaResetRetirement(c.raw,env),originalRaw=retired?.originalPolicy??(parseBetaResetPolicy(c.raw,env)?c.raw:null);
   if(originalRaw===null||betaPolicyRetirementSql(env,c,1).sql==='0=1')throw new Refused('beta_reset_not_retirable');
   const input=await body(request,'confirm,form'),f=input.form as Form;
   if(input.confirm!=='RETIRE'||!keys(f,'expiresAt,formNonce,token')||!Number.isSafeInteger(f.expiresAt)||f.expiresAt>original.e||f.expiresAt>at+300||f.expiresAt<=at||!HEX.test(f.formNonce)||typeof f.token!=='string'||!MAC.test(f.token))throw new Refused('beta_reset_retire_form_refused',403);
   if(!await verify(env.COOKIE_SECRET,RETIRE_PURPOSE,claims(original,binding,{expiresAt:f.expiresAt,formNonce:f.formNonce},RETIRE_PURPOSE,originalRaw),f.token))throw new Refused('beta_reset_retire_form_refused',403);
   const now=await authority(env,original),retiredAt=retired?.retiredAt??now,g=betaPolicyRetirementSql(env,c,6);
   const raw=retired?c.raw!:JSON.stringify({version:3,state:'retired',originalPolicy:originalRaw,retiredAt});
   if(!parseBetaResetRetirement(raw,env)||g.sql==='0=1')throw new Refused('beta_reset_original_source_changed');
   const guard=`key=?1 AND ${fenceSql('applicantWrite',2,3,4,original.g,original.n)} AND ?5>${DB_NOW} AND ${g.sql}`;
   const values=[BETA_RESET_POLICY_KEY,original.u,original.v,original.e,f.expiresAt,...g.values];
   assertOriginalSiteSessionRead(original);
   const row=retired
    ?await env.DB.prepare(`SELECT value FROM site_settings WHERE ${guard}`).bind(...values).first<{value:string}>()
    :await env.DB.prepare(`UPDATE site_settings SET value=?9,updated_at=${DB_NOW},updated_by=?2 WHERE ${guard} AND ?10<=${DB_NOW} AND ?10>=${BETA_RESET_CUTOFF} RETURNING value`).bind(...values,raw,retiredAt).first<{value:string}>();
   assertOriginalSiteSessionRead(original);if(!row||row.value!==raw)throw new Refused('beta_reset_original_admission_changed');
   return apiJson({ok:true,policyRetired:true,retiredAt,cutoff:BETA_RESET_CUTOFF,phase:'retired_awaiting_drain',finalCompletion:false,roleReuseReady:false},200,{'Cache-Control':'no-store'});
  }
  if(path===ROOT+'/confirm-cutoff'){
   const evidence=await betaRetentionEvidence(env);
   if(!betaRetentionCanConfirm(evidence)||betaRetentionSourceSql(env,c,1).sql==='0=1')throw new Refused('beta_retention_not_confirmable');
   const input=await body(request),f=input.form as Form;
   if(!keys(f,'expiresAt,formNonce,token')||!Number.isSafeInteger(f.expiresAt)||f.expiresAt>original.e||f.expiresAt>at+300||f.expiresAt<=at||!HEX.test(f.formNonce)||typeof f.token!=='string'||!MAC.test(f.token))throw new Refused('beta_retention_form_refused',403);
   if(!await verify(env.COOKIE_SECRET,RETENTION_PURPOSE,claims(original,binding,{expiresAt:f.expiresAt,formNonce:f.formNonce},RETENTION_PURPOSE,betaRetentionBinding(evidence)),f.token))throw new Refused('beta_retention_form_refused',403);
   const confirmedAt=await authority(env,original),anchor=JSON.stringify({version:1,epoch:BETA_RESET_EPOCH,cutoff:BETA_RESET_CUTOFF,confirmedAt}),g=betaRetentionSourceSql(env,c,10);
   assertOriginalSiteSessionRead(original);const row=await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
    SELECT ?1,?2,${DB_NOW},?3 WHERE ${fenceSql('applicantWrite',3,4,5,original.g,original.n)}
    AND ?6>${DB_NOW} AND ?7<=${DB_NOW} AND ?7>=${BETA_RESET_CUTOFF}
    AND (SELECT value FROM site_settings WHERE key='betaClosedAt') IS ?8 COLLATE BINARY
    AND (SELECT value FROM site_settings WHERE key='betaResetFor') IS ?9 COLLATE BINARY
    AND ${g.sql} ON CONFLICT(key) DO NOTHING RETURNING value`)
    .bind(BETA_RETENTION_ANCHOR_KEY,anchor,original.u,original.v,original.e,f.expiresAt,confirmedAt,evidence.closed,evidence.reset,...g.values).first<{value:string}>();
   assertOriginalSiteSessionRead(original);if(!row||row.value!==anchor)throw new Refused('beta_retention_original_admission_changed');
   return apiJson({ok:true,cutoff:BETA_RESET_CUTOFF,confirmedAt,removalCompletion:false},200,{'Cache-Control':'no-store'});
  }
  if(c.mode!=='open'||c.raw!==null)throw new Refused('beta_reset_not_armable');
  const input=await body(request),f=input.form as Form;
  if(!keys(f,'expiresAt,formNonce,token')||!Number.isSafeInteger(f.expiresAt)||f.expiresAt>original.e||f.expiresAt>at+300||f.expiresAt<=at||f.expiresAt>BETA_RESET_CUTOFF||!HEX.test(f.formNonce)||typeof f.token!=='string'||!MAC.test(f.token))throw new Refused('beta_reset_form_refused',403);
  if(!await verify(env.COOKIE_SECRET,PURPOSE,claims(original,binding,{expiresAt:f.expiresAt,formNonce:f.formNonce}),f.token))throw new Refused('beta_reset_form_refused',403);
  if(!await betaGrantCurrent(env,c))throw new Refused('beta_reset_original_source_changed');
  const armedAt=await authority(env,original),policy=JSON.stringify({version:2,epoch:BETA_RESET_EPOCH,cutoff:BETA_RESET_CUTOFF,guildId:BETA_RESET_GUILD_ID,roleIds:BETA_RESET_ROLE_IDS,armedAt});
  if(!parseBetaResetPolicy(policy,env)||!await betaGrantCurrent(env,c))throw new Refused('beta_reset_original_source_changed');
  const g=betaGrantSql(c,8);
  assertOriginalSiteSessionRead(original);const row=await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
   SELECT ?1,?2,${DB_NOW},?3 WHERE ${fenceSql('applicantWrite',3,4,5,original.g,original.n)} AND ?6>${DB_NOW} AND ?7<=${DB_NOW}
   AND ${g.sql} ON CONFLICT(key) DO NOTHING RETURNING value`).bind(BETA_RESET_POLICY_KEY,policy,original.u,original.v,original.e,f.expiresAt,armedAt,...g.values).first<{value:string}>();
  assertOriginalSiteSessionRead(original);if(!row||row.value!==policy)throw new Refused('beta_reset_original_admission_changed');
  return apiJson({ok:true,policyArmed:true,removalsEnabled:env.BETA_RESET_REMOVALS_ENABLED==='true',cutoff:BETA_RESET_CUTOFF,roleIds:BETA_RESET_ROLE_IDS},200,{'Cache-Control':'no-store'});
 }catch(e){return e instanceof Refused?apiJson({error:e.code},e.status):apiJson({error:'beta_reset_outcome_unconfirmed'},503);}
}
