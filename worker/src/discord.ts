/** Minimal Discord REST + interactions helpers (no SDK; WebCrypto for Ed25519). */
import type { Env } from "./env";
import { staffChannel } from "./env";
import { audit } from "./db";
import {dispatchOriginalProviderFetch,captureOriginalProviderInit} from './privacy-global-serving-origin';
import {canonicalMigrationProducerHeld233} from './canonical-migration233';
import {botResponseHeaders280} from './bot-response280';
import {checkOriginalNativeResponse,checkOriginalNativeHeaders,ORIGINAL_RESPONSE_DESCRIPTORS,ORIGINAL_HEADER_DESCRIPTORS} from './privacy-native-http-intrinsics';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {uniqueJsonKeys} from './network-profile';

export const API = "https://discord.com/api/v10";

/**
 * Build .49: fetch for every call that carries a credential (a bot token, a client secret, a member's access token).
 * Never follows a redirect, so a 3xx from an upstream can never send the credential to a third host (the caller sees
 * the 3xx as a failed response); gives up after eight seconds instead of holding the invocation open. Same rules as
 * Olympus Forever's discordFetch.
 */
export const CREDENTIAL_FETCH_TIMEOUT_MS = 8000;
export function credentialFetch(input: string, init: RequestInit = {}, beforeDispatch?: () => void): Promise<Response> {
  const original=captureOriginalProviderInit(init);
  return dispatchOriginalProviderFetch(input, { ...original, redirect: "manual", signal: withDeadline(original.signal ?? undefined) }, beforeDispatch);
}

/**
 * .51: the eight-second deadline holds whether or not the caller passed a signal of its own (Codex's review of .49:
 * `init.signal ?? timeout` let a caller's signal replace the deadline). Both abort the request; `AbortSignal.any` is in
 * workerd and Node 20+, and a runtime without it gets the deadline alone rather than an open-ended call.
 */
export function withDeadline(signal: AbortSignal | null | undefined, ms = CREDENTIAL_FETCH_TIMEOUT_MS): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  if (!signal) return deadline;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof any === "function" ? any([signal, deadline]) : deadline;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Build .47: a signed request whose timestamp is further than this from now is refused even with a good signature, so a
 * captured request cannot be replayed later (Discord signs timestamp + body; the window is the one Forever used).
 */
export const INTERACTION_MAX_SKEW_S = 300;
/** Real interaction payloads are a few KB; anything far larger is refused before any parsing or crypto (index.ts). */
export const MAX_INTERACTION_BYTES = 128 * 1024;

/** Verify X-Signature-Ed25519 over timestamp + raw body, and that the timestamp is within INTERACTION_MAX_SKEW_S of now. */
export async function verifyInteraction(env: Env, request: Request, body: string, nowMs = Date.now()): Promise<boolean> {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !/^\d{1,12}$/.test(ts)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > INTERACTION_MAX_SKEW_S) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

/**
 * The request body as text, or null once it exceeds `max` bytes, by Content-Length or as it streams in: nothing over the
 * cap is buffered further or decoded, and the stream is cancelled.
 */
export async function readInteractionBody(request: Request, max = MAX_INTERACTION_BYTES): Promise<string | null> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class DiscordError extends Error {
  constructor(public status: number, public body: string) {
    super(`Discord ${status}: ${body}`);
  }
}

/** Witness only: these private facts neither classify an effect nor acknowledge Native persistence. */
export type OriginalDiscordRoleReply280=Readonly<{kind:'source_original_discord_delete_reply280'}>;
export type OriginalDiscordRoleReplyFacts280=Readonly<{method:'DELETE';path:string;status:403|404|429;code:number|null;eofSeconds:number;retryAfterHeaderSeconds:number|null;retryAfterBodySeconds:number|null;global:boolean|null;rateScope:'user'|'global'|'shared'|null}>;
type RoleReply280={error:DiscordError;cap:OriginalDiscordRoleReply280;env:Env;path:string;callback:()=>void;facts:OriginalDiscordRoleReplyFacts280;spent:boolean;check:()=>void};
const roleReplyErrors280=new WeakMap<object,RoleReply280>(),roleReplyCaps280=new WeakMap<OriginalDiscordRoleReply280,RoleReply280>();
const replyJson280=JSON,replyJsonParse280=JSON.parse,replyJsonSlot280=Object.getOwnPropertyDescriptor(JSON,'parse'),replyEncoder280=TextEncoder,replyEncodeSlot280=Object.getOwnPropertyDescriptor(TextEncoder.prototype,'encode'),replyErrorPrototype280=DiscordError.prototype;
const replyErrorClassCheck280=replyGraph280(DiscordError),replyErrorPrototypeCheck280=replyGraph280(replyErrorPrototype280);
const replySame280=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined)=>a===undefined?b===undefined:!!b&&(['value','get','set','writable','enumerable','configurable'] as const).every(k=>Object.is(a[k],b[k]));
function replyGraph280(ref:object):()=>void{const prototype=Object.getPrototypeOf(ref),keys=Reflect.ownKeys(ref),slots=keys.map(k=>Object.getOwnPropertyDescriptor(ref,k));return ()=>{const current=Reflect.ownKeys(ref);if(Object.getPrototypeOf(ref)!==prototype||current.length!==keys.length||keys.some((k,i)=>k!==current[i]||!replySame280(slots[i],Object.getOwnPropertyDescriptor(ref,k))))throw Error('original_role_reply_held');};}
function replyProvider280():()=>void{const rows:{ref:object;prototype:object|null;slot:PropertyDescriptor|undefined}[]=[];let ref:object|null=globalThis;for(let i=0;ref&&i<8;i++){const slot=Object.getOwnPropertyDescriptor(ref,'fetch'),prototype=Object.getPrototypeOf(ref);rows.push({ref,prototype,slot});if(slot){if(!Object.hasOwn(slot,'value')||typeof slot.value!=='function')throw Error('original_role_reply_held');const fn=slot.value as Function,fp=Object.getPrototypeOf(fn);return ()=>{for(const r of rows)if(Object.getPrototypeOf(r.ref)!==r.prototype||!replySame280(r.slot,Object.getOwnPropertyDescriptor(r.ref,'fetch')))throw Error('original_role_reply_held');if(Object.getPrototypeOf(fn)!==fp)throw Error('original_role_reply_held');};}ref=prototype;}throw Error('original_role_reply_held');}
function replyParser280():void{replyErrorClassCheck280();replyErrorPrototypeCheck280();if(JSON!==replyJson280||JSON.parse!==replyJsonParse280||!replySame280(replyJsonSlot280,Object.getOwnPropertyDescriptor(JSON,'parse'))||TextEncoder!==replyEncoder280||!replySame280(replyEncodeSlot280,Object.getOwnPropertyDescriptor(TextEncoder.prototype,'encode')))throw Error('original_role_reply_held');}
function replyText280(text:string):boolean{if(typeof text!=='string'||text.includes('\uFFFD'))return false;for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(n>=0xdc00&&n<=0xdfff)return false;}return new replyEncoder280().encode(text).byteLength<=4096;}
function replyBody280(text:string,status:number):Readonly<{code:number|null;retryAfterBodySeconds:number|null;global:boolean|null}>|null{
 replyParser280();if(!replyText280(text)||!uniqueJsonKeys(text))return null;const v=Reflect.apply(replyJsonParse280,replyJson280,[text]) as unknown;
 if(!v||typeof v!=='object'||Array.isArray(v))return null;const o=v as Record<string,unknown>,keys=Object.keys(o),message=o.message;
 // Only shallow documented scalar shapes. Complex error details remain unsupported witnesses.
 if(typeof message!=='string'||!message.length||!replyText280(message))return null;
 if(status===403||status===404){if(keys.length!==2||!keys.includes('code')||!keys.includes('message')||typeof o.code!=='number'||!Number.isSafeInteger(o.code)||o.code<1)return null;return Object.freeze({code:o.code,retryAfterBodySeconds:null,global:null});}
 if(status!==429||keys.some(k=>!['code','message','retry_after','global'].includes(k))||!keys.includes('retry_after')||typeof o.retry_after!=='number'||!Number.isFinite(o.retry_after)||o.retry_after<0||typeof o.global!=='boolean'||'code'in o&&(typeof o.code!=='number'||!Number.isSafeInteger(o.code)||o.code<0))return null;
 return Object.freeze({code:typeof o.code==='number'?o.code:null,retryAfterBodySeconds:o.retry_after,global:o.global});
}
function captureRoleReply280(env:Env,method:string,path:string,callback:(()=>void)|undefined){try{
 if(method!=='DELETE'||!/^\/guilds\/[0-9]{17,20}\/members\/[0-9]{17,20}\/roles\/[0-9]{17,20}$/.test(path)||typeof callback!=='function')return null;
 const token=Object.getOwnPropertyDescriptor(env,'DISCORD_BOT_TOKEN'),guild=Object.getOwnPropertyDescriptor(env,'GUILD_ID'),ep=Object.getPrototypeOf(env),callbackCheck=replyGraph280(callback),providerCheck=replyProvider280(),credential=credentialFetch,start=originalRecoveryClockMilliseconds()/1000;
 if(!token||!Object.hasOwn(token,'value')||typeof token.value!=='string'||!token.value.length)return null;
 const check=()=>{providerCheck();callbackCheck();replyParser280();if(Object.getPrototypeOf(env)!==ep||!replySame280(token,Object.getOwnPropertyDescriptor(env,'DISCORD_BOT_TOKEN'))||!replySame280(guild,Object.getOwnPropertyDescriptor(env,'GUILD_ID'))||credentialFetch!==credential)throw Error('original_role_reply_held');};check();let invoked=false;
 return {invoked(value:unknown){try{check();invoked=value===undefined;}catch{invoked=false;}},response(res:Response){try{
   check();if(!invoked)return null;checkOriginalNativeResponse(res);const status=Reflect.apply(ORIGINAL_RESPONSE_DESCRIPTORS.status!.get!,res,[]) as number;if(status!==403&&status!==404&&status!==429)return null;
   const headers=Reflect.apply(ORIGINAL_RESPONSE_DESCRIPTORS.headers!.get!,res,[]) as Headers;checkOriginalNativeHeaders(headers);const get=(key:string)=>Reflect.apply(ORIGINAL_HEADER_DESCRIPTORS.get!.value,headers,[key]) as string|null,contentType=get('Content-Type'),retry=get('Retry-After'),scope=get('X-RateLimit-Scope');
   if(!/^application\/json(?:\s*;|$)/i.test(contentType??''))return null;
   const headerRetry=retry===null?null:retry.length<=32&&/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(retry)?Number(retry):NaN;
   if(headerRetry!==null&&(!Number.isFinite(headerRetry)||headerRetry<0)||scope!==null&&!['user','global','shared'].includes(scope))return null;
   const responseCheck=()=>{check();checkOriginalNativeResponse(res);checkOriginalNativeHeaders(headers);if(Reflect.apply(ORIGINAL_RESPONSE_DESCRIPTORS.status!.get!,res,[])!==status||Reflect.apply(ORIGINAL_RESPONSE_DESCRIPTORS.headers!.get!,res,[])!==headers||get('Content-Type')!==contentType||get('Retry-After')!==retry||get('X-RateLimit-Scope')!==scope)throw Error('original_role_reply_held');};
   return (text:string,error:DiscordError)=>{try{responseCheck();const eof=originalRecoveryClockMilliseconds()/1000,body=replyBody280(text,status);if(!body||eof<start||Object.getPrototypeOf(error)!==replyErrorPrototype280||error.status!==status||error.body!==text||Reflect.apply(ORIGINAL_RESPONSE_DESCRIPTORS.bodyUsed!.get!,res,[])!==true)return;
    const errorCheck=replyGraph280(error),cap=Object.freeze({kind:'source_original_discord_delete_reply280' as const}),facts=Object.freeze({method:'DELETE' as const,path,status,code:body.code,eofSeconds:eof,retryAfterHeaderSeconds:headerRetry,retryAfterBodySeconds:body.retryAfterBodySeconds,global:body.global,rateScope:scope as 'user'|'global'|'shared'|null});
    const current=()=>{responseCheck();errorCheck();if(Object.getPrototypeOf(error)!==replyErrorPrototype280||error.status!==status||error.body!==text||originalRecoveryClockMilliseconds()/1000<eof)throw Error('original_role_reply_held');};current();const record:RoleReply280={error,cap,env,path,callback,facts,spent:false,check:current};roleReplyErrors280.set(error,record);roleReplyCaps280.set(cap,record);
   }catch{/* Observation failure never changes the original error. */}};
  }catch{return null;}}};
 }catch{return null;}}
/** No public raw-error/Response issuer exists; a wrong original tuple cannot consume another request's witness. */
export function takeOriginalDiscordRoleReply280(error:unknown,env:Env,method:string,path:string,callback:()=>void):OriginalDiscordRoleReply280|null{try{if(!error||typeof error!=='object')return null;const r=roleReplyErrors280.get(error);if(!r||r.spent||r.env!==env||method!=='DELETE'||r.path!==path||r.callback!==callback)return null;r.check();r.spent=true;return r.cap;}catch{return null;}}
export function originalDiscordRoleReplyFacts280(cap:OriginalDiscordRoleReply280):OriginalDiscordRoleReplyFacts280{const r=roleReplyCaps280.get(cap);if(!r||!r.spent)throw Error('original_role_reply_held');r.check();return r.facts;}

/**
 * Say what a Discord failure actually means. 401 and 403 read alike in a log line and need opposite fixes: 401 is the
 * bot's TOKEN (a Worker secret), 403 is the bot's PERMISSIONS (Discord settings). Blaming permissions for a 401 sends
 * whoever reads it off to change settings that cannot possibly help — which is exactly what happened on 26 Sep.
 */
export function explainDiscordError(e: unknown): string {
  if (!(e instanceof DiscordError)) return String(e).slice(0, 200);
  let code = 0;
  try {
    code = (JSON.parse(e.body) as { code?: number }).code ?? 0;
  } catch {
    /* body was not JSON */
  }
  switch (e.status) {
    case 401:
      return "Discord rejected the bot's token (401). The DISCORD_BOT_TOKEN secret in the Worker is stale \u2014 usually because the token was reset in the Developer Portal. Fix: `npx wrangler secret put DISCORD_BOT_TOKEN`. Permissions have nothing to do with it.";
    case 403:
      if (code === 50001) return "the bot cannot see that channel (403 Missing Access) \u2014 its role needs View Channel there";
      if (code === 50013) return "the bot lacks a permission it needs there, or the member/role sits above the bot's role (403 Missing Permissions)";
      return `Discord refused the bot (403, code ${code})`;
    case 404:
      if (code === 10011) return "that role no longer exists (404 Unknown Role)";
      if (code === 10003) return "that channel no longer exists (404 Unknown Channel)";
      if (code === 10008) return "that message no longer exists (404 Unknown Message)";
      if (code === 10007) return "that member is no longer in the server (404 Unknown Member)";
      return `Discord could not find it (404, code ${code})`;
    case 429:
      return "rate-limited by Discord (429) \u2014 try again in a moment";
    default:
      return `Discord ${e.status}: ${e.body.slice(0, 160)}`;
  }
}

/**
 * .95 (P-20, Codex's review of .90, 1 Oct 08:15 UTC): a run's bound on the ACTUAL requests made to Discord through the
 * role writer (roles.ts `CallBudget` carries it; the free plan counts requests, not calls). The 429 retry in rest() is a
 * request too: it is counted here and refused when the run cannot afford it, unless the call is a mandatory removal
 * (never skipped, counted whatever is left; its caller reserved it).
 */
export interface AttemptBudget {
  limit: number;
  attempts: number;
  retries: number;
}

/** Bot-token REST call. Retries once on 429 using retry_after (within `budget`, when the caller gives one). */
/**
 * `reason` goes to Discord's audit log. It travels in the X-Audit-Log-Reason header, the documented way; until 27 Sep
 * it was appended to the URL as ?reason=, which the role endpoints ignore, so role grants and removals showed up in
 * the audit log with no reason at all.
 */
export async function rest<T = unknown>(env: Env, method: string, path: string, body?: unknown, attempt = 0, reason?: string, budget?: AttemptBudget, mandatory = false, beforeDispatch?: () => void): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "olympus-verify (https://github.com/olympus, 0.1)",
  };
  if (reason) headers["X-Audit-Log-Reason"] = auditReason(reason);
  const replyObserver280=attempt===1?captureRoleReply280(env,method,path,beforeDispatch):null;
  const observedDispatch280=replyObserver280?()=>{const value=beforeDispatch!();replyObserver280.invoked(value);return value;}:beforeDispatch;
  const res = await credentialFetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, observedDispatch280);
  if (res.status === 429 && attempt < 1) {
    const text = await res.text();
    if (budget) {
      if (budget.attempts >= budget.limit && !mandatory) throw new DiscordError(429, text); // .95: no retry the run cannot afford; the caller records the failure and a later run retries
      budget.attempts++;
      budget.retries++;
    }
    let j: { retry_after?: number } = {};
    try {
      j = JSON.parse(text) as { retry_after?: number };
    } catch {
      /* no usable body: wait a second */
    }
    await new Promise((r) => setTimeout(r, Math.ceil(((j.retry_after ?? 1) as number) * 1000)));
    return rest<T>(env, method, path, body, attempt + 1, reason, budget, mandatory, beforeDispatch);
  }
  if (!res.ok) {
    const observeReply280=replyObserver280?.response(res)??null;
    const text=await res.text(),error=new DiscordError(res.status,text);
    observeReply280?.(text,error);
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Header values must be ASCII-safe; Discord expects the reason URL-encoded and caps it at 512 characters. Cut on a
 *  whole character, never inside a %XX escape. */
export function auditReason(reason: string): string {
  let out = "";
  for (const ch of reason) {
    const enc = encodeURIComponent(ch);
    if (out.length + enc.length > 512) break;
    out += enc;
  }
  return out;
}

/** Restrict generic producers at their final transport boundary. The central
 * writer retains its separate original-custody paths through rest(), including
 * DELETE-only owned drains. Capture the actual URL target before any await. */
function genericRoleDispatch233(env:Env,guild:string,role:string,beforeDispatch?:()=>void):()=>void{
 const check=()=>{if('CANONICAL_RANKS233' in env&&canonicalMigrationProducerHeld233(env,guild,role))throw Error('canonical233_old_producer_held');};
 return ()=>{check();beforeDispatch?.();check();};
}
export const addRole = (env: Env, userId: string, roleId: string, reason: string, budget?: AttemptBudget,beforeDispatch?:()=>void) => {
  const guild=env.GUILD_ID;
  return rest(env, "PUT", `/guilds/${guild}/members/${userId}/roles/${roleId}`, undefined, 0, reason, budget,false,genericRoleDispatch233(env,guild,roleId,beforeDispatch));
};

/** `mandatory` (.95): a removal the run owes (after a ban, or while a restriction is held): its retry is counted, never refused. */
export const removeRole = (env: Env, userId: string, roleId: string, reason: string, budget?: AttemptBudget, mandatory = false,beforeDispatch?:()=>void) => {
  const guild=env.GUILD_ID;
  return rest(env, "DELETE", `/guilds/${guild}/members/${userId}/roles/${roleId}`, undefined, 0, reason, budget, mandatory,genericRoleDispatch233(env,guild,roleId,beforeDispatch));
};

/** A guild member, or null when they are not in the server (404). Used to read someone's current roles. */
export async function guildMember(env: Env, userId: string, budget?: AttemptBudget): Promise<{ roles: string[]; nick?: string | null; user?: { id: string; username: string } } | null> {
  try {
    return await rest(env, "GET", `/guilds/${env.GUILD_ID}/members/${userId}`, undefined, 0, undefined, budget);
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) return null;
    throw e;
  }
}

/** Ban a member. Requires the bot role to hold Ban Members and to outrank the target. delete_message_seconds = 0. */
export const banMember = (env: Env, userId: string, reason: string) =>
  rest(env, "PUT", `/guilds/${env.GUILD_ID}/bans/${userId}`, { delete_message_seconds: 0 }, 0, reason);

export const setNickname = (env: Env, userId: string, nick: string) =>
  rest(env, "PATCH", `/guilds/${env.GUILD_ID}/members/${userId}`, { nick });

/** .233 self-service nickname effect: one HTTP attempt, no429 replay and no
 * response body/name in errors. The caller durably claims before this call. */
export async function patchNicknameOnce233(env:Env,userId:string,nick:string|null,beforeDispatch:()=>void):Promise<number>{
 if(!/^[1-9][0-9]{16,19}$/.test(userId))throw Error('nickname_subject_held');
 const response=await credentialFetch(API+`/guilds/${env.GUILD_ID}/members/${userId}`,{method:'PATCH',headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({nick})},beforeDispatch);
 const status=response.status;await response.body?.cancel().catch(()=>{});return status;
}

export const postMessage = (env: Env, channelId: string, payload: unknown) =>
  rest<{ id: string }>(env, "POST", `/channels/${channelId}/messages`, payload);

export const editMessage = (env: Env, channelId: string, messageId: string, payload: unknown) =>
  rest(env, "PATCH", `/channels/${channelId}/messages/${messageId}`, payload);

// There is deliberately no DM function here any more. See dm.ts: notices go to a channel, never to a DM.

/**
 * Post to the staff channel, and never let a failure there propagate.
 *
 * Everything sent to that channel is a notification — a rank mismatch, a full guild, a ban card. On 18 September an
 * unguarded one of these took roster ingest down completely: the bot had no access to #mod-alerts, postMessage threw
 * `Discord 403 Missing Access`, and because that throw happened *after* the snapshot row was inserted, every retry
 * was then told its export was "older than the last snapshot". Roles stopped being granted for forty minutes because
 * a status message could not be delivered. A notice nobody can read is a nuisance; a notice that stops the pipeline
 * is an outage.
 */
export async function staffNotice(env: Env, payload: unknown, kind: string): Promise<boolean> {
  const channel = staffChannel(env);
  if (!channel) return false;
  try {
    await postMessage(env, channel, payload);
    return true;
  } catch (e) {
    await audit(env, "system", "staff_notice.failed", kind, { channel, error: String(e).slice(0, 200) });
    // The server log is a different channel, so this usually still lands somewhere a human will see it.
    await logLine(env, `\u26a0\ufe0f could not post the ${kind} notice to <#${channel}> \u2014 ${explainDiscordError(e)}`);
    return false;
  }
}

export async function logLine(env: Env, text: string, references?:import('./db').PrivacyReference[]) {
  if (!env.CHANNEL_SERVER_LOG) return;
  try {
    const body={content:text.slice(0,1900),allowed_mentions:{parse:[]}};
    if(references?.length){
      const {postPrivacyMessage,messageOperationId}=await import('./privacy-provider-messages');
      const operationId=await messageOperationId('guild_log',JSON.stringify({text:body.content,subjects:references.map(r=>({id:r.subject,g:r.capture?.subjectGeneration??null}))}));
      await postPrivacyMessage(env,'guild_log',env.CHANNEL_SERVER_LOG,body,references,operationId);
    }else await postMessage(env,env.CHANNEL_SERVER_LOG,body);
  } catch {
    /* logging must never break the flow */
  }
}

// ---- interaction payload helpers ----
export const EPHEMERAL = 64;

// .210: Discord refuses a message over 2,000 characters, so an echoed 4,000-character name lost the whole answer.
const CONTENT_MAX = 2000;
export const fitContent = (content: string): string => {
  if (content.length <= CONTENT_MAX) return content;
  const cut = content.slice(0, CONTENT_MAX - 1);
  return (/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut) + "…";
};

export const reply = (content: string, extra: Record<string, unknown> = {}) =>
  json({ type: 4, data: { content: fitContent(content), flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });

export const replyPublic = (data: Record<string, unknown>) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });

export const updateMessage = (data: Record<string, unknown>) => json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });

export const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: botResponseHeaders280({ "Content-Type": "application/json; charset=utf-8" }) });

export interface Interaction {
  type: number;
  id: string;
  application_id?: string; // the application Discord signed this for; index.ts refuses another application's payload
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user: { id: string; username: string; global_name?: string | null }; roles: string[]; nick?: string | null };
  user?: { id: string; username: string; global_name?: string | null };
  data?: {
    name?: string;
    type?: number; // application command type: 1 = slash, 2 = user context menu, 3 = message context menu
    target_id?: string; // user id for a user context-menu command
    custom_id?: string;
    component_type?: number;
    values?: string[];
    options?: Array<{ name: string; type: number; value?: string | number | boolean; focused?: boolean; options?: any[] }>;
    components?: Array<{ type: number; components?: Array<{ type: number; custom_id?: string; value?: string }> }>; // modal submit
  };
  message?: { id: string; channel_id: string; flags?: number };
}

export const userOf = (i: Interaction) => i.member?.user ?? i.user!;

export const hasAnyRole = (i: Interaction, roleIds: string[]) => (i.member?.roles ?? []).some((r) => roleIds.includes(r));

export function option<T = string>(i: Interaction, name: string): T | undefined {
  const opts = i.data?.options ?? [];
  for (const o of opts) {
    if (o.name === name) return o.value as T;
    if (o.options) for (const s of o.options) if (s.name === name) return s.value as T;
  }
  return undefined;
}

export const subcommand = (i: Interaction) => i.data?.options?.find((o) => o.type === 1)?.name;

/** The option Discord is asking us to complete (interaction type 4), looking one level into a subcommand. */
export function focusedOption(i: Interaction): { name: string; value: string } | undefined {
  for (const o of i.data?.options ?? []) {
    if (o.focused) return { name: o.name, value: String(o.value ?? "") };
    for (const s of o.options ?? []) if (s.focused) return { name: s.name, value: String(s.value ?? "") };
  }
  return undefined;
}

/** Interaction response type 8: up to 25 autocomplete choices. */
export const autocomplete = (choices: Array<{ name: string; value: string }>) =>
  json({ type: 8, data: { choices: choices.slice(0, 25) } });

/** Value of a text input in a modal submit (interaction type 5). */
export function modalField(i: Interaction, customId: string): string | undefined {
  for (const row of i.data?.components ?? []) for (const c of row.components ?? []) if (c.custom_id === customId) return c.value;
  return undefined;
}

/**
 * The one answer a command gets when its handler threw: no detail (a message can carry codes), and a way forward.
 * .51: moved here from index.ts. workerd refuses a module entry that exports anything but functions and the handler
 * ("Incorrect type for map entry 'INTERACTION_FAILED'": Codex's review of .49 on the real runtime, 1 Oct 00:23 UTC);
 * the CJS suites could not see that, so tests/bundle_runtime_test.cjs now loads the real bundle in workerd.
 */
export const INTERACTION_FAILED = "Something went wrong on our side and the command did not finish. Please run it again in a moment; if it keeps failing, tell an officer.";
