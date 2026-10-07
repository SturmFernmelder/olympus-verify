/** Identify-only OAuth mechanics. Production dispatch is deliberately bound to CLOSED_PRIVACY_AUTHORITY. */
import type { Env } from "./env";
import { credentialFetch, API } from "./discord";
import { b64u } from "./site-core";
import { htmlResponse, policyHeaders } from "./policy-render";
import { CLOSED_PRIVACY_AUTHORITY, snapshotCapture, type PrivacyAuthority, type PrivacyCapture, type PrivacyPurpose } from "./privacy-rights-hooks";
import { PRIVACY_FENCE, privacyValues } from './account-privacy-generations';
import { discardPrivacyProvider, fetchPrivacyProvider, PRIVACY_PROVIDER_DEADLINE_MS, readPrivacyProviderJson } from './privacy-provider-body';

const FLOW_COOKIE = "__Host-olg_privacy_oauth", SESSION_COOKIE = "__Host-olg_privacy_rights";
const TOKEN = /^[A-Za-z0-9_-]{43}$/, HEX = /^[0-9a-f]{64}$/;
const DB_NOW = "CAST(strftime('%s','now') AS INTEGER)";
const token = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (key: string, value: string, age: number) => `${key}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
async function hash(value: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function cookieValue(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(name + "="));
  const v = values.length === 1 ? values[0]!.slice(name.length + 1) : ""; return TOKEN.test(v) ? v : null;
}
/** Canonical V3 consuming-SQL fence and parameter order. This does not activate a rights authority. */
export const PRIVACY_SESSION_FENCE = PRIVACY_FENCE;
const values = privacyValues;
function ready(authority: PrivacyAuthority): void { if (authority.implementation !== "reviewed-generation-successor") throw new Error("privacy_generation_not_adopted"); }

/** Trusted composition seam, not a public switch. caseBinding is an already verified case-context digest, never its code. */
export async function beginIdentity(env: Env, authority: PrivacyAuthority, purpose: PrivacyPurpose, caseBinding: string | null = null): Promise<Response> {
  ready(authority);
  const p = purpose, b = caseBinding;
  if (p !== "privacy_identity" || (b !== null && (typeof b!=='string'||!HEX.test(b)))) throw new Error("invalid_identity_flow");
  if (!env.DISCORD_APP_ID || !env.DISCORD_CLIENT_SECRET) throw new Error("privacy_identity_unconfigured");
  const state = token(), nonce = token(), stateHash = await hash(state), nonceHash = await hash(nonce);
  const result = await env.DB.prepare(`INSERT INTO privacy_identity_flows(state_hash,nonce_hash,purpose,case_binding,epoch,expires_at,consumed_at)
    SELECT ?1,?2,?3,?4,epoch,${DB_NOW}+300,NULL FROM generation_control WHERE singleton=1 AND restore_hold=0
    AND (SELECT COUNT(*) FROM privacy_identity_flows)<1000`).bind(stateHash, nonceHash, p, b).run();
  if (result.meta.changes !== 1) throw new Error("privacy_identity_busy");
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", env.DISCORD_APP_ID); u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", "https://olympus.roachcouncil.com/privacy/callback");
  u.searchParams.set("scope", "identify"); u.searchParams.set("state", state); u.searchParams.set("prompt", "consent");
  const headers = policyHeaders(); headers.set("Location", u.href); headers.append("Set-Cookie", cookie(FLOW_COOKIE, nonce, 300));
  return new Response(null, { status: 303, headers });
}

/** One-use state consumed BEFORE provider calls. Delayed/duplicate callback never retries a spent credential exchange. */
export async function finishIdentity(request: Request, env: Env, authority: PrivacyAuthority): Promise<Response> {
  ready(authority);
  const u = new URL(request.url), params = u.searchParams;
  if ([...params.keys()].some(k => !["state", "code", "error"].includes(k)) || [...params.keys()].some(k => params.getAll(k).length !== 1)) throw new Error("invalid_identity_callback");
  const state = params.get("state") ?? "", code = params.get("code") ?? "", nonce = cookieValue(request, FLOW_COOKIE);
  if (!TOKEN.test(state) || !nonce || !/^[A-Za-z0-9_-]{1,256}$/.test(code) || params.has("error")) throw new Error("invalid_identity_callback");
  const stateHash = await hash(state), nonceHash = await hash(nonce);
  const flow = await env.DB.prepare(`UPDATE privacy_identity_flows SET consumed_at=${DB_NOW}
    WHERE state_hash=?1 AND nonce_hash=?2 AND purpose='privacy_identity' AND consumed_at IS NULL AND expires_at>${DB_NOW}
    AND EXISTS(SELECT 1 FROM generation_control g WHERE g.singleton=1 AND g.restore_hold=0 AND g.epoch=privacy_identity_flows.epoch)
    RETURNING purpose,case_binding,epoch`).bind(stateHash, nonceHash).first<{ purpose: PrivacyPurpose; case_binding: string | null;epoch:string }>();
  if (!flow) throw new Error("identity_state_expired");
  // Copy the returned case context before provider waits. It is never a case code or deletion capability.
  const caseBinding = flow.case_binding,flowEpoch=flow.epoch;
  if(flow.purpose!=='privacy_identity'||typeof flowEpoch!=='string'||!/^[0-9a-f]{32}$/.test(flowEpoch)||(caseBinding!==null&&(typeof caseBinding!=='string'||!HEX.test(caseBinding))))throw new Error('identity_case_context_refused');
  const controller=new AbortController(),until=Date.now()+PRIVACY_PROVIDER_DEADLINE_MS;
  const exchange = await fetchPrivacyProvider(credentialFetch("https://discord.com/api/oauth2/token", { method: "POST", signal:controller.signal,headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: "https://olympus.roachcouncil.com/privacy/callback" }) }),until,controller);
  if (!exchange.ok) {discardPrivacyProvider(exchange);throw new Error("identity_exchange_unconfirmed");}
  const rawResult=await readPrivacyProviderJson(exchange,until,controller);
  if(!rawResult||typeof rawResult!=='object'||Array.isArray(rawResult))throw Error('identity_exchange_refused');
  const result = rawResult as { access_token?: unknown; token_type?: unknown; scope?: unknown };
  if (typeof result.access_token !== "string" || result.access_token.length<1 || result.access_token.length > 2048 || result.token_type !== "Bearer" || result.scope !== "identify") throw new Error("identity_exchange_refused");
  // No guild membership endpoint, site user insert, name refresh, role write or normal member-session cookie.
  const identityResponse = await fetchPrivacyProvider(credentialFetch(`${API}/users/@me`, { signal:controller.signal,headers: { Authorization: `Bearer ${result.access_token}` } }),until,controller);
  if (!identityResponse.ok) {discardPrivacyProvider(identityResponse);throw new Error("identity_read_unconfirmed");}
  const rawIdentity=await readPrivacyProviderJson(identityResponse,until,controller);
  if(!rawIdentity||typeof rawIdentity!=='object'||Array.isArray(rawIdentity))throw Error('identity_read_refused');
  const identity = rawIdentity as { id?: unknown };
  if (typeof identity.id !== "string" || !/^\d{17,20}$/.test(identity.id)) throw new Error("identity_read_refused");
  const rawCapture = await authority.capture(env, identity.id, "privacy_identity");
  if (!rawCapture) throw new Error("identity_account_unavailable");
  const captured = snapshotCapture(rawCapture);
  if (captured.subject !== identity.id || captured.purpose !== "privacy_identity" ||captured.epoch!==flowEpoch||!await authority.current(env,captured)) throw new Error("identity_capture_refused");
  const session = token(), csrf = token(), sessionHash = await hash(session), csrfHash = await hash(csrf);
  const inserted = await env.DB.prepare(`INSERT INTO privacy_rights_sessions(session_hash,csrf_hash,subject,account_generation,purpose,purpose_generation,epoch,lifecycle,case_binding,expires_at)
    SELECT ?7,?8,?1,?2,?3,?4,?5,?6,?9,${DB_NOW}+900 WHERE ${PRIVACY_SESSION_FENCE} AND (SELECT COUNT(*) FROM privacy_rights_sessions)<1000
    AND EXISTS(SELECT 1 FROM privacy_identity_flows WHERE state_hash=?10 AND nonce_hash=?11 AND epoch=?5 AND case_binding IS ?9 AND consumed_at IS NOT NULL AND expires_at>${DB_NOW})`).bind(...values(captured), sessionHash, csrfHash, caseBinding,stateHash,nonceHash).run();
  if (inserted.meta.changes !== 1) throw new Error("identity_generation_changed");
  const h = policyHeaders(); h.set("Location", "/privacy/account"); h.append("Set-Cookie", cookie(FLOW_COOKIE, "", 0)); h.append("Set-Cookie", cookie(SESSION_COOKIE, session, 900));
  // CSRF secret is not stored in the cookie and is not returned here; account rendering issues a new purpose-bound form.
  return new Response(null, { status: 303, headers: h });
}

export async function readPrivacySession(request: Request, env: Env, authority: PrivacyAuthority): Promise<PrivacyCapture | null> {
  ready(authority); const session = cookieValue(request, SESSION_COOKIE); if (!session) return null;
  const row = await env.DB.prepare(`SELECT subject,account_generation,purpose,purpose_generation,epoch,lifecycle FROM privacy_rights_sessions WHERE session_hash=?1 AND expires_at>${DB_NOW}`).bind(await hash(session)).first<{ subject: string; account_generation: string; purpose: PrivacyPurpose; purpose_generation: string; epoch: string; lifecycle: PrivacyCapture["lifecycle"] }>();
  if (!row) return null;
  const c = snapshotCapture({ subject: row.subject, accountGeneration: row.account_generation, purpose: row.purpose, purposeGeneration: row.purpose_generation, epoch: row.epoch, lifecycle: row.lifecycle });
  if(!await authority.current(env,c))return null;
  const admitted = await env.DB.prepare(`SELECT 1 AS ok WHERE ${PRIVACY_SESSION_FENCE}`).bind(...values(c)).first<{ ok: number }>();
  return admitted?.ok === 1 ? c : null;
}

/** These tables are inert until a reviewed composition successor exists; expiration admission is synchronous. */
export const PRIVACY_IDENTITY_DDL = [
  "CREATE TABLE IF NOT EXISTS privacy_identity_flows(state_hash TEXT PRIMARY KEY CHECK(length(state_hash)=64),nonce_hash TEXT NOT NULL CHECK(length(nonce_hash)=64),purpose TEXT NOT NULL CHECK(purpose='privacy_identity'),case_binding TEXT CHECK(case_binding IS NULL OR length(case_binding)=64),epoch TEXT NOT NULL CHECK(length(epoch)=32),expires_at INTEGER NOT NULL,consumed_at INTEGER)",
  "CREATE TABLE IF NOT EXISTS privacy_rights_sessions(session_hash TEXT PRIMARY KEY CHECK(length(session_hash)=64),csrf_hash TEXT NOT NULL CHECK(length(csrf_hash)=64),subject TEXT NOT NULL,account_generation TEXT NOT NULL,purpose TEXT NOT NULL CHECK(purpose='privacy_identity'),purpose_generation TEXT NOT NULL,epoch TEXT NOT NULL,lifecycle TEXT NOT NULL CHECK(lifecycle IN('active','retiring','retired')),case_binding TEXT,expires_at INTEGER NOT NULL)",
] as const;

/** Prospective bounded cleanup seam. Not attached to the keeper cron; no inactive table is created here. */
export async function purgeExpiredPrivacyIdentity(env: Env): Promise<{ flows: number; sessions: number }> {
  const rows = await env.DB.batch([
    env.DB.prepare(`DELETE FROM privacy_identity_flows WHERE state_hash IN (SELECT state_hash FROM privacy_identity_flows WHERE expires_at<=${DB_NOW} ORDER BY expires_at,state_hash LIMIT 100)`),
    env.DB.prepare(`DELETE FROM privacy_rights_sessions WHERE session_hash IN (SELECT session_hash FROM privacy_rights_sessions WHERE expires_at<=${DB_NOW} ORDER BY expires_at,session_hash LIMIT 100)`),
  ]);
  return { flows: rows[0]?.meta.changes ?? 0, sessions: rows[1]?.meta.changes ?? 0 };
}

export async function privacyIdentityRoute(request: Request, _env: Env, path: string): Promise<Response> {
  // An unconditional compile-time composition gate. No provider, schema/session lookup, callback processing or account mutation.
  if (CLOSED_PRIVACY_AUTHORITY.implementation === "unadopted") return htmlResponse(request, "Identify-only sign-in unavailable", `<p>The separate account connection for privacy requests is not available yet. You can still <a href="/privacy/contact">contact the private inbox</a> without signing in. This page grants no member access.</p>`, 503);
  throw new Error(`unbound_privacy_route:${path}`);
}
