/** Fresh identify-only privacy access (owner takeover, 2026-10-10). No membership or ordinary session authority. */
import type { Env } from './env';
import { PRIVACY_ALL_HISTORY_COLLECTIONS, type PrivacyHistoryCollection } from './privacy-access-history';
import { API, credentialFetch } from './discord';
import { b64u, sign, siteHost, rateLimited } from './site-core';
import { htmlResponse, policyHeaders } from './policy-render';
import { FormError, readForm, hidden } from './policy-form-core';
import { discardPrivacyProvider, fetchPrivacyProvider, readPrivacyProviderJson, PRIVACY_PROVIDER_DEADLINE_MS } from './privacy-provider-body';

export const PRIVACY_ACCESS_COOKIE='__Host-olg_privacy_access';
export const PRIVACY_ACCESS_FLOW_COOKIE='__Host-olg_privacy_access_flow';
export const PRIVACY_ACCESS_SECONDS=720;
export const PRIVACY_ACCESS_NOW="CAST(strftime('%s','now') AS INTEGER)";
const TOKEN=/^[A-Za-z0-9_-]{43}$/,HEX32=/^[0-9a-f]{32}$/,HEX64=/^[0-9a-f]{64}$/,ID=/^\d{17,20}$/;
export type PrivacyAccessPurpose='own_export'|'own_erasure';
export type PrivacyAccessCapture={subject:string;generation:string|null;state:'active'|'retiring'|'retired'|null;revision:number|null};
export type PrivacyAccessGrant=PrivacyAccessCapture&{sessionHash:string;purpose:PrivacyAccessPurpose;grantId:string;csrfHash:string;createdAt:number;expiresAt:number;consumedAt:number|null;erasureOperation:string|null};
const random=()=>b64u(crypto.getRandomValues(new Uint8Array(32)));
export const privacyAccessRandomId=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function privacyAccessHash(value:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const browserCookie=(name:string,value:string,age:number)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function cookieValue(request:Request,name:string):string|null{
 const hits=(request.headers.get('Cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 const value=hits.length===1?hits[0]!.slice(name.length+1):'';return TOKEN.test(value)?value:null;
}
function origin(env:Env,request:Request):string{
 const url=new URL(request.url),host=siteHost(env);
 if(!host||url.protocol!=='https:'||url.hostname!==host||url.port)throw new FormError('privacy_origin_refused',403);
 return url.origin;
}
function validCapture(c:PrivacyAccessCapture):boolean{
 return ID.test(c.subject)&&(c.generation===null?c.state===null&&c.revision===null:HEX32.test(c.generation)&&['active','retiring','retired'].includes(c.state??'')&&Number.isSafeInteger(c.revision)&&c.revision!>=0);
}
/** Compile-time columns/parameter positions. Captured absence never adopts an account created during an await. */
export const PRIVACY_ACCESS_CAPTURE_SQL=`(CASE WHEN ?2 IS NULL THEN NOT EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1)
 ELSE EXISTS(SELECT 1 FROM privacy_subjects WHERE subject_id=?1 AND generation=?2 AND state=?3 AND revision=?4) END)`;
const captureValues=(c:PrivacyAccessCapture)=>[c.subject,c.generation,c.state,c.revision];
async function captureSubject(env:Env,subject:string):Promise<PrivacyAccessCapture>{
 const row=await env.DB.prepare('SELECT generation,state,revision FROM privacy_subjects WHERE subject_id=?1').bind(subject).first<{generation:string;state:PrivacyAccessCapture['state'];revision:number}>();
 const capture=Object.freeze({subject,generation:row?.generation??null,state:row?.state??null,revision:row?.revision??null});
 if(!validCapture(capture))throw new FormError('privacy_authority_refused',503);return capture;
}
const csrfFor=(env:Env,rawCookie:string,purpose:PrivacyAccessPurpose)=>sign(env.COOKIE_SECRET,'privacy-access-form-v1',JSON.stringify([rawCookie,purpose]));

/** Two statements, each deleting at most 100 original expired rows. Composed with the counted retention job. */
export function privacyAccessPurgeStatements(env:Env):D1PreparedStatement[]{return [
 env.DB.prepare(`DELETE FROM privacy_access_oauth WHERE state_hash IN(SELECT state_hash FROM privacy_access_oauth WHERE expires_at<=${PRIVACY_ACCESS_NOW} ORDER BY expires_at,state_hash LIMIT 100)`),
 env.DB.prepare(`DELETE FROM privacy_access_grants WHERE rowid IN(SELECT rowid FROM privacy_access_grants WHERE expires_at<=${PRIVACY_ACCESS_NOW} ORDER BY expires_at,session_hash,purpose LIMIT 100)`),
 ];}
export async function beginPrivacyAccess(request:Request,env:Env):Promise<Response>{
 const base=origin(env,request),u=new URL(request.url);
 if(request.method!=='GET'||u.pathname!=='/privacy/signin'||u.search)throw new FormError('invalid_identity_flow');
 if(!env.DISCORD_APP_ID||!env.DISCORD_CLIENT_SECRET||!env.COOKIE_SECRET)throw new FormError('privacy_unavailable',503);
 if(rateLimited('privacy-access:'+String(request.headers.get('CF-Connecting-IP')??''),10,60))throw new FormError('slow_down',429);
 const state=random(),browser=random(),stateHash=await privacyAccessHash(state),browserHash=await privacyAccessHash(browser);
 await env.DB.batch(privacyAccessPurgeStatements(env));
 const result=await env.DB.prepare(`INSERT INTO privacy_access_oauth(state_hash,browser_hash,purpose,created_at,expires_at)
 SELECT ?1,?2,'privacy_identify',${PRIVACY_ACCESS_NOW},${PRIVACY_ACCESS_NOW}+300
 WHERE (SELECT COUNT(*) FROM privacy_access_oauth WHERE expires_at>${PRIVACY_ACCESS_NOW})<1000`).bind(stateHash,browserHash).run();
 if(result.meta.changes!==1)throw new FormError('privacy_busy',503);
 const authorize=new URL('https://discord.com/oauth2/authorize');
 authorize.searchParams.set('client_id',env.DISCORD_APP_ID);authorize.searchParams.set('response_type','code');
 authorize.searchParams.set('redirect_uri',base+'/privacy/callback');authorize.searchParams.set('scope','identify');
 authorize.searchParams.set('state',state);authorize.searchParams.set('prompt','consent');
 const h=policyHeaders();h.set('Location',authorize.href);h.append('Set-Cookie',browserCookie(PRIVACY_ACCESS_FLOW_COOKIE,browser,300));
 return new Response(null,{status:303,headers:h});
}
/** Callback state is consumed before any exchange. A spent callback cannot repeat a provider call. */
export async function finishPrivacyAccess(request:Request,env:Env):Promise<Response>{
 const base=origin(env,request),u=new URL(request.url),params=u.searchParams;
 if(!env.DISCORD_APP_ID||!env.DISCORD_CLIENT_SECRET||!env.COOKIE_SECRET)throw new FormError('privacy_unavailable',503);
 if(request.method!=='GET'||u.pathname!=='/privacy/callback'||[...params.keys()].some(k=>!['state','code','error'].includes(k)||params.getAll(k).length!==1))throw new FormError('invalid_identity_callback');
 const state=params.get('state')??'',code=params.get('code')??'',browser=cookieValue(request,PRIVACY_ACCESS_FLOW_COOKIE);
 if(!TOKEN.test(state)||!browser||!/^[A-Za-z0-9_-]{1,256}$/.test(code)||params.has('error'))throw new FormError('invalid_identity_callback');
 const stateHash=await privacyAccessHash(state),browserHash=await privacyAccessHash(browser);
 const flow=await env.DB.prepare(`UPDATE privacy_access_oauth SET consumed_at=${PRIVACY_ACCESS_NOW}
 WHERE state_hash=?1 AND browser_hash=?2 AND purpose='privacy_identify' AND consumed_at IS NULL AND expires_at>${PRIVACY_ACCESS_NOW}
 RETURNING expires_at`).bind(stateHash,browserHash).first<{expires_at:number}>();
 if(!flow)throw new FormError('identity_state_expired',403);
 const controller=new AbortController(),until=Date.now()+PRIVACY_PROVIDER_DEADLINE_MS;
 const exchange=await fetchPrivacyProvider(credentialFetch('https://discord.com/api/oauth2/token',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:env.DISCORD_APP_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:base+'/privacy/callback'})}),until,controller);
 if(!exchange.ok){discardPrivacyProvider(exchange);throw new FormError('identity_exchange_unconfirmed',503);}
 const tokenResult=await readPrivacyProviderJson(exchange,until,controller);
 if(!tokenResult||typeof tokenResult!=='object'||Array.isArray(tokenResult))throw new FormError('identity_exchange_refused',503);
 const t=tokenResult as {access_token?:unknown;token_type?:unknown;scope?:unknown};
 if(typeof t.access_token!=='string'||t.access_token.length<1||t.access_token.length>2048||t.token_type!=='Bearer'||t.scope!=='identify')throw new FormError('identity_exchange_refused',503);
 const response=await fetchPrivacyProvider(credentialFetch(API+'/users/@me',{signal:controller.signal,headers:{Authorization:'Bearer '+t.access_token}}),until,controller);
 if(!response.ok){discardPrivacyProvider(response);throw new FormError('identity_read_unconfirmed',503);}
 const identity=await readPrivacyProviderJson(response,until,controller);
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||typeof (identity as {id?:unknown}).id!=='string'||!ID.test((identity as {id:string}).id))throw new FormError('identity_read_refused',503);
 const captured=await captureSubject(env,(identity as {id:string}).id);
 const session=random(),sessionHash=await privacyAccessHash(session),exportCsrf=await privacyAccessHash(await csrfFor(env,session,'own_export')),eraseCsrf=await privacyAccessHash(await csrfFor(env,session,'own_erasure'));
 const guard=env.DB.prepare(`SELECT CASE WHEN ${PRIVACY_ACCESS_CAPTURE_SQL}
 AND EXISTS(SELECT 1 FROM privacy_access_oauth WHERE state_hash=?5 AND browser_hash=?6 AND purpose='privacy_identify' AND consumed_at IS NOT NULL AND expires_at=?7 AND expires_at>${PRIVACY_ACCESS_NOW})
 AND (SELECT COUNT(*) FROM privacy_access_grants WHERE expires_at>${PRIVACY_ACCESS_NOW})<2000
 THEN 1 ELSE json_extract('privacy_identity_capture_refused','$') END AS admitted`).bind(...captureValues(captured),stateHash,browserHash,flow.expires_at);
 const insert=(purpose:PrivacyAccessPurpose,csrfHash:string)=>env.DB.prepare(`INSERT INTO privacy_access_grants(session_hash,purpose,grant_id,csrf_hash,subject_id,subject_generation,state,revision,created_at,expires_at)
 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,${PRIVACY_ACCESS_NOW},${PRIVACY_ACCESS_NOW}+720)`).bind(sessionHash,purpose,privacyAccessRandomId(),csrfHash,...captureValues(captured));
 const result=await env.DB.batch([guard,insert('own_export',exportCsrf),insert('own_erasure',eraseCsrf),env.DB.prepare(`SELECT CASE WHEN ${PRIVACY_ACCESS_CAPTURE_SQL}
 AND EXISTS(SELECT 1 FROM privacy_access_oauth WHERE state_hash=?5 AND browser_hash=?6 AND purpose='privacy_identify' AND consumed_at IS NOT NULL AND expires_at=?7 AND expires_at>${PRIVACY_ACCESS_NOW})
 AND (SELECT COUNT(*) FROM privacy_access_grants WHERE session_hash=?8 AND subject_id=?1 AND subject_generation IS ?2 AND state IS ?3 AND revision IS ?4 AND consumed_at IS NULL AND expires_at>${PRIVACY_ACCESS_NOW})=2
 THEN 1 ELSE json_extract('privacy_grants_unconfirmed','$') END AS admitted`).bind(...captureValues(captured),stateHash,browserHash,flow.expires_at,sessionHash)]);
 if(result.length!==4||(result[0]?.results[0] as {admitted?:number}|undefined)?.admitted!==1||(result[3]?.results[0] as {admitted?:number}|undefined)?.admitted!==1)throw new FormError('identity_capture_unconfirmed',503);
 const h=policyHeaders();h.set('Location','/privacy/access');h.append('Set-Cookie',browserCookie(PRIVACY_ACCESS_FLOW_COOKIE,'',0));h.append('Set-Cookie',browserCookie(PRIVACY_ACCESS_COOKIE,session,720));
 return new Response(null,{status:303,headers:h});
}
export async function readPrivacyAccessGrant(request:Request,env:Env,purpose:PrivacyAccessPurpose):Promise<PrivacyAccessGrant|null>{
 origin(env,request);const session=cookieValue(request,PRIVACY_ACCESS_COOKIE);if(!session)return null;
 const row=await env.DB.prepare(`SELECT session_hash AS sessionHash,purpose,grant_id AS grantId,csrf_hash AS csrfHash,subject_id AS subject,
 subject_generation AS generation,state,revision,created_at AS createdAt,expires_at AS expiresAt,consumed_at AS consumedAt,erasure_operation AS erasureOperation
 FROM privacy_access_grants WHERE session_hash=?1 AND purpose=?2 AND expires_at>${PRIVACY_ACCESS_NOW}`).bind(await privacyAccessHash(session),purpose).first<PrivacyAccessGrant>();
 if(!row)return null;
 if(!validCapture(row)||row.purpose!==purpose||!HEX64.test(row.sessionHash)||!HEX32.test(row.grantId)||!HEX64.test(row.csrfHash)||!Number.isSafeInteger(row.createdAt)||row.expiresAt!==row.createdAt+720||row.consumedAt!==null&&!Number.isSafeInteger(row.consumedAt)||row.erasureOperation!==null&&!HEX32.test(row.erasureOperation))throw new FormError('privacy_grant_refused',503);
 return Object.freeze({...row});
}
/** Native atomic action guard and consume are composed with the payload, never executed on their own. */
export function privacyAccessActionStatements(env:Env,g:PrivacyAccessGrant):D1PreparedStatement[]{
 if(!validCapture(g)||!HEX64.test(g.sessionHash)||!HEX32.test(g.grantId)||!HEX64.test(g.csrfHash)||!['own_export','own_erasure'].includes(g.purpose)||g.expiresAt!==g.createdAt+720||g.consumedAt!==null)throw new FormError('privacy_grant_refused',403);
 return [env.DB.prepare(`SELECT CASE WHEN ${PRIVACY_ACCESS_CAPTURE_SQL} AND EXISTS(SELECT 1 FROM privacy_access_grants
 WHERE session_hash=?5 AND purpose=?6 AND grant_id=?7 AND csrf_hash=?8 AND subject_id=?1 AND subject_generation IS ?2 AND state IS ?3 AND revision IS ?4
 AND created_at=?9 AND expires_at=?10 AND expires_at>${PRIVACY_ACCESS_NOW} AND consumed_at IS NULL)
 THEN 1 ELSE json_extract('privacy_access_action_refused','$') END AS admitted`).bind(...captureValues(g),g.sessionHash,g.purpose,g.grantId,g.csrfHash,g.createdAt,g.expiresAt),
 env.DB.prepare(`UPDATE privacy_access_grants SET consumed_at=${PRIVACY_ACCESS_NOW} WHERE session_hash=?1 AND purpose=?2 AND grant_id=?3 AND consumed_at IS NULL AND expires_at>${PRIVACY_ACCESS_NOW}`).bind(g.sessionHash,g.purpose,g.grantId),
 env.DB.prepare(`SELECT CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM privacy_access_grants WHERE session_hash=?1 AND purpose=?2 AND grant_id=?3
 AND consumed_at IS NOT NULL AND expires_at>${PRIVACY_ACCESS_NOW}) THEN 1 ELSE json_extract('privacy_access_consume_refused','$') END AS consumed`).bind(g.sessionHash,g.purpose,g.grantId)];
}
/** Read payloads finish under the same original capture and absolute deadline; this never renews a grant. */
export function privacyAccessConsumedReadFence(env:Env,g:PrivacyAccessGrant,historyExpires:number|null=null):D1PreparedStatement{
 return env.DB.prepare(`SELECT CASE WHEN ${PRIVACY_ACCESS_CAPTURE_SQL} AND EXISTS(SELECT 1 FROM privacy_access_grants
 WHERE session_hash=?5 AND purpose=?6 AND grant_id=?7 AND csrf_hash=?8 AND subject_id=?1 AND subject_generation IS ?2 AND state IS ?3 AND revision IS ?4
 AND created_at=?9 AND expires_at=?10 AND expires_at>${PRIVACY_ACCESS_NOW} AND consumed_at IS NOT NULL)
 AND (?11 IS NULL OR ${PRIVACY_ACCESS_NOW}<?11)
 THEN 1 ELSE json_extract('privacy_access_read_refused','$') END AS admitted`).bind(...captureValues(g),g.sessionHash,g.purpose,g.grantId,g.csrfHash,g.createdAt,g.expiresAt,historyExpires);
}
async function actionForm(request:Request,env:Env,purpose:PrivacyAccessPurpose,allowConsumed=false):Promise<{grant:PrivacyAccessGrant;form:Readonly<Record<string,string>>}>{
 const g=await readPrivacyAccessGrant(request,env,purpose);if(!g||g.consumedAt!==null&&!allowConsumed)throw new FormError('privacy_access_expired',403);
 const form=await readForm(request,purpose==='own_erasure'?['csrf','grant','confirm']:['csrf','grant','collection','cursor']);
 if(request.method!=='POST'||form.grant!==g.grantId||!TOKEN.test(form.csrf??'')||await privacyAccessHash(form.csrf!)!==g.csrfHash||purpose==='own_erasure'&&form.confirm!=='yes')throw new FormError('privacy_form_refused',403);
 return {grant:g,form};
}
export async function privacyAccessFormAction(request:Request,env:Env,purpose:PrivacyAccessPurpose,allowConsumed=false):Promise<PrivacyAccessGrant>{
 const out=await actionForm(request,env,purpose,allowConsumed);
 if(purpose==='own_export'&&('collection'in out.form||'cursor'in out.form))throw new FormError('privacy_purpose_refused',403);
 return out.grant;
}
export async function privacyAccessExportFormAction(request:Request,env:Env):Promise<{grant:PrivacyAccessGrant;collection:'copy'|PrivacyHistoryCollection;cursor:string|null}>{
 if(new URL(request.url).search)throw new FormError('invalid_history_cursor');
 const {grant,form}=await actionForm(request,env,'own_export'),collection=form.collection??'copy',cursor=form.cursor??'';
 if(!(collection==='copy'||PRIVACY_ALL_HISTORY_COLLECTIONS.includes(collection as PrivacyHistoryCollection))||cursor.length>140||/[\r\n\t ]/.test(cursor)||(collection==='copy'&&cursor))throw new FormError('invalid_history_cursor');
 return {grant,collection:collection as 'copy'|PrivacyHistoryCollection,cursor:cursor||null};
}
export async function privacyAccessPage(request:Request,env:Env):Promise<Response>{
 const erasureEnabled=env.PRIVACY_ERASURE_ENABLED==='true';
 const grants=await Promise.all([readPrivacyAccessGrant(request,env,'own_export'),readPrivacyAccessGrant(request,env,'own_erasure')]);
 const session=cookieValue(request,PRIVACY_ACCESS_COOKIE);
 let body=erasureEnabled?'<p>Connect your Discord account to read a curated copy of your own retained records or request serving-account erasure. You can use this connection after leaving the server or without a website account. The connection lasts twelve minutes and each form can be used once.</p>':'<p>Connect your Discord account to read a curated copy of your own retained records. You can use this connection after leaving the server or without a website account. The connection lasts twelve minutes and each download form can be used once.</p>'+erasurePaused;
 if(!session||!grants.some(Boolean))body+='<p><a href="/privacy/signin">Connect Discord for privacy requests</a></p>';
 else for(const g of grants){if(!g||g.consumedAt!==null||!erasureEnabled&&g.purpose==='own_erasure')continue;
 const csrf=await csrfFor(env,session,g.purpose),erase=g.purpose==='own_erasure';
 body+=`<section><h2>${erase?'Request serving-account erasure':'Download my retained records'}</h2><p>${erase?'Erasure is held while the bot-managed Guild Member role or Discord outcome is unresolved. Active bans and safety cases can be retained under policy exceptions. Staff permissions require human handling, and private recovery copies have separate custody.':'The copy includes selected account, verification and community records, with a preview of up to 25 entries per history and an exact count. Larger histories can be continued separately. The file states selected fields and omissions. A record that cannot safely fit holds the download and can require attended help from an officer. All 36 listed histories have separate downloads: save nextCursor from the file, reconnect Discord, select the same history and paste it below. Leave the cursor empty to start a new capture. Each history page holds at most 1,000 entries, and its original traversal deadline is twenty-four hours.'}</p><form method="post" action="/privacy/access/${erase?'erasure':'export'}">${hidden('grant',g.grantId)}${hidden('csrf',csrf)}${erase?'<label><input type="checkbox" name="confirm" value="yes" required> Request erasure of my own serving account records.</label>':historyControls()}<button type="submit">${erase?'Request my erasure':'Download my data'}</button></form></section>`;
 }
 body+=erasureEnabled?'<p>This connection grants only these privacy actions. <a href="/privacy/signin">Reconnect Discord for a fresh page grant</a> · <a href="/privacy/account">Check an erasure request with its private status code</a> · <a href="/privacy/contact">Account help</a></p>':'<p>This connection grants only these privacy actions. <a href="/privacy/signin">Reconnect Discord for a fresh download grant</a> · <a href="/privacy/account">Check an erasure request with its private status code</a> · <a href="/privacy/contact">Account help</a></p>';
 return htmlResponse(request,'Privacy account connection',body);
}
export function privacyAccessRefusal(request:Request,error:unknown):Response{
 if(error instanceof FormError&&error.code==='privacy_erasure_unavailable')return htmlResponse(request,'Erasure temporarily unavailable',erasurePaused+'<p>No new erasure request was submitted by this attempt.</p><p><a href="/privacy/access">Download my retained records</a> · <a href="/privacy/account">Check an existing erasure request</a> · <a href="/privacy/contact">Account help</a></p>',503);
 const status=error instanceof FormError?error.status:503;
 return htmlResponse(request,'Privacy connection unavailable',`<p>The connection or form could not be confirmed. Reconnect Discord for a fresh twelve-minute privacy connection. If an erasure response was lost, keep its request ID and use its private status code at Account data controls. Unresolved outcomes need attended help from an Olympus officer.</p><p><a href="/privacy/access">Privacy account connection</a> · <a href="/privacy/contact">Account help</a></p>`,status);
}

const erasurePaused='<p>Automatic serving-account erasure is temporarily paused while Olympus checks older account records. Downloads and checks of existing erasure requests remain available. Ask an Olympus officer for attended help. Reconnecting Discord does not enable erasure.</p>';

function historyControls():string { return '<label>Download <select name="collection"><option value="copy">Selected account copy</option>'+PRIVACY_ALL_HISTORY_COLLECTIONS.map(c=>'<option value="'+c+'">'+c.split('.').map(p=>{const s=p.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');return s.charAt(0).toUpperCase()+s.slice(1);}).join(' · ')+'</option>').join('')+'</select></label><label>History cursor from a previous file (optional)<textarea name="cursor" maxlength="140" rows="3" spellcheck="false" autocomplete="off"></textarea></label>'; }
