/** .116b3 dormant connector: immutable same-version OFF release plus immediate admin pause. */
import type { Env } from './env';
import { now } from './db';
import { isSiteAdmin } from './site-core';
import { PRIVACY_DESCRIBES_BNET_LOGIN } from './policy-content';
import { BNET_RELEASE, bnetReleasedOn } from './policy-release';
import { policyShell, policyHeaders } from './policy-render';
export const BNET_SWITCH_KEY = 'bnetLogin';
const INTENT_KEY = 'bnetEnableIntent';
export interface BnetLoginState {
 configured:boolean; policyReady:boolean; adminOn:boolean; effective:boolean;
 enableRequested:boolean; releaseProfile:'OFF'|'ON'; releasePolicyVersion:string;
 changedAt:number|null; changedBy:string|null;
}
export const bnetConfigured=(env:Env):boolean=>!!(env.BNET_CLIENT_ID&&env.BNET_CLIENT_SECRET);
/** Compatibility symbol for historical tests. An override no longer changes collection admission. */
export const setPolicyReadyForTests=(_value:boolean|null):void=>{};
export async function bnetLoginState(env:Env):Promise<BnetLoginState>{
 let adminOn=false,enableRequested=false,changedAt:number|null=null,changedBy:string|null=null;
 try { const rows=await env.DB.prepare('SELECT key,value,updated_at,updated_by FROM site_settings WHERE key IN (?1,?2)').bind(BNET_SWITCH_KEY,INTENT_KEY).all<{key:string;value:string;updated_at:number;updated_by:string|null}>();
  for(const r of rows.results){if(r.key===BNET_SWITCH_KEY)adminOn=r.value==='1';if(r.key===INTENT_KEY)enableRequested=r.value==='1';if(changedAt===null||r.updated_at>changedAt){changedAt=r.updated_at;changedBy=r.updated_by;}}
 }catch{adminOn=false;enableRequested=false;}
 const configured=bnetConfigured(env),policyReady=PRIVACY_DESCRIBES_BNET_LOGIN&&bnetReleasedOn();
 return {configured,policyReady,adminOn,effective:configured&&policyReady&&adminOn,enableRequested,releaseProfile:BNET_RELEASE.profile,releasePolicyVersion:BNET_RELEASE.policyVersion,changedAt,changedBy};
}
export async function bnetLoginOn(env:Env):Promise<boolean>{return(await bnetLoginState(env)).effective;}
export type SwitchResult={ok:true;state:BnetLoginState}|{ok:false;error:'not_configured'|'policy_not_ready'|'admission_refused';message:string};
export type SwitchAdmission=Readonly<{sessionVersion:number;expiresAt:number}>;
/** Existing SITE_ADMINS/origin/page fence remains in site-admin.ts. Enable is an intent only; never writes adminOn=1. */
export async function setBnetSwitch(env:Env,actor:string,on:boolean,admission?:SwitchAdmission):Promise<SwitchResult>{
 const at=now(), who=actor, requested=on===true, version=admission?.sessionVersion,expires=admission?.expiresAt;
 if(typeof who!=='string'||!isSiteAdmin(env,who)||!Number.isSafeInteger(version)||!Number.isSafeInteger(expires)||(expires??0)<=at)return{ok:false,error:'admission_refused',message:'Your staff session is no longer admitted. Reload before saving.'};
 const fence="EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?4 AND u.session_version=?5 AND u.denied=0 AND u.in_server=1) AND ?6>CAST(strftime('%s','now') AS INTEGER)";
 const statement=(key:string,value:string)=>env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT ?1,?2,?3,?4 WHERE ${fence} ON CONFLICT(key) DO UPDATE SET value=?2,updated_at=?3,updated_by=?4 WHERE ${fence}`).bind(key,value,at,who,version,expires);
 const mutations=requested?[statement(INTENT_KEY,'1')]:[statement(BNET_SWITCH_KEY,'0'),statement(INTENT_KEY,'0')];
 const audit=env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ?3,?4,'bnet.switch',NULL,?1 WHERE ${fence}`).bind(JSON.stringify({enableRequested:requested,collectionEnabled:false}),null,at,who,version,expires);
 const results=await env.DB.batch([...mutations,audit]);
 if(results[0]?.meta.changes!==1)return{ok:false,error:'admission_refused',message:'Your staff session changed before saving. Nothing was admitted.'};
 return{ok:true,state:await bnetLoginState(env)};
}
export function bnetSwitchedOffPage(extraHeaders:Record<string,string>={}):Response{
 const h=policyHeaders();for(const[k,v]of Object.entries(extraHeaders))h.set(k,v);
 return new Response(policyShell('Battle.net linking is switched off','<p>Olympus does not use Battle.net sign-in at the moment, so this link was not finished and nothing from it was stored. Verification does not need it: use Get my code in the pinned guide in #join-olympus.</p><p><a href="/privacy/account">Your data controls</a></p>'),{status:200,headers:h});
}
