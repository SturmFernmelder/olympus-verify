/** Member-site delivery boundary (.154). No application source or guild payload is sent before Discord sign-in. */
import type { Env } from './env';
import { currentUser, originalUserSession, rememberGateUser, securityHeaders } from './site-core';
import { membershipRecheckDue, stillMember } from './site-api';
import { privacyBoundSiteEnv } from './privacy-serving-authority';
import { loginHeaders, policyShell } from './policy-render';
import { errorRef } from './log';
import { siteEntryReturn, siteLoginLocation } from './site-return';

const AUTH_PATHS = new Set(['/auth/login', '/auth/callback']);
// These existing privacy flows have their own Discord identity / one-use case credentials.
// Requiring current guild membership here would lock departed users out of their own data rights.
const PRIVACY_PATHS = new Set(['/privacy/access', '/privacy/signin', '/privacy/callback', '/privacy/access/export', '/privacy/access/erasure', '/privacy/contact', '/privacy/case', '/privacy/case/reply', '/privacy/account', '/privacy/account/export', '/privacy/account/site-erase', '/privacy/account/full-erase', '/privacy/account/erasure-status', '/privacy/account/bnet-unlink', '/api/privacy/config', '/api/privacy/requests', '/api/privacy/requests/read', '/api/privacy/requests/reply']);
const FLASH: Record<string, string> = {
  cancelled: 'Discord sign-in was cancelled. You can try again when ready.',
  expired: 'This sign-in attempt expired. Start a new Discord sign-in.',
  session_ended: 'Your session ended. Sign in with Discord again.',
  not_member: 'Join the Asmongold Discord server before using the guild site.',
  pending: 'Finish the Discord server membership screening, then sign in again.',
  denied: 'This account cannot enter the guild site.',
  busy: 'Discord is busy. Wait a moment before trying again.',
  updating: 'The guild site is updating. Please try again shortly.',
  discord_error: 'Discord sign-in could not be completed. Please try again shortly.',
  not_configured: 'Discord sign-in is temporarily unavailable.',
  privacy_held: 'Your sign-in could not be completed while account controls are updating. Please try again later.',
};

export function siteSignIn(request: Request, status = 200, flash?: string, cookies: string[] = [], animation = false): Response {
  const privacyLink = flash === 'denied' || flash === 'not_member'
    ? ' <a href="/privacy/access">Connect to your account data</a>.' : '';
  const note = flash && Object.hasOwn(FLASH, flash) ? `<p role="status">${FLASH[flash]}${privacyLink}</p>` : '';
  // Direct owner answer, 23 Oct 2026: approved .173 stills remain the default.
  // The optional animation is a client-model render, not a publisher-issued video.
  // Owner ruling of 13 Nov 2026 (CL2-074): browsers that support WebP load the same stills as WebP copies
  // (quality 0.82, same pixel size); the PNG sources stay as the fallback, with the same media, sizes and alt text.
  const still = `<picture class="login-portal-art"><source media="(max-aspect-ratio: 6/5)" srcset="/static/wow/login/olympus-dark-portal-portrait.webp" type="image/webp" width="852" height="1847"><source media="(max-aspect-ratio: 6/5)" srcset="/static/wow/login/olympus-dark-portal-portrait.png" width="852" height="1847"><source srcset="/static/wow/login/olympus-dark-portal-wide.webp" type="image/webp" width="1916" height="821"><img class="login-portal-poster" src="/static/wow/login/olympus-dark-portal-wide.png" alt="" aria-hidden="true" width="1916" height="821"></picture>`;
  const motion = animation && request.headers.get('Save-Data')?.trim().toLowerCase() !== 'on'
    ? `<details class="login-motion" open><summary><span class="motion-hide">Hide animated background</span><span class="motion-show">Show animated background</span></summary><video class="login-portal-video" aria-hidden="true" width="960" height="540" autoplay loop muted playsinline preload="metadata"><source src="/static/wow/login/dark-portal.webm" type="video/webm" media="(prefers-reduced-motion: no-preference)"></video></details>` : '';
  const login = siteLoginLocation(siteEntryReturn(new URL(request.url)));
  const body = `<section class="sign-in-gate portal-login"><div class="login-portal" aria-hidden="true">${still}</div>${motion}<div class="login-card"><img class="login-card-crest" src="/static/olympus-icon.png" alt="Olympus guild tabard" width="72" height="72"><h1>Enter Olympus</h1><p class="eyebrow">The gates of Olympus</p><p>Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required.</p>${note}<a class="policy-button" href="${login}">Sign in with Discord</a></div></section>`;
  const headers = loginHeaders();
  for (const value of cookies) headers.append('Set-Cookie', value);
  // Owner's entry-page simplification (18 Oct 2026): policy URLs remain public for Discord's application links.
  return new Response(request.method === 'HEAD' ? null : policyShell('Enter Olympus', body, { policyNavigation: false, loginPresentation: true }), { status, headers });
}

/** One public, nonpersonal branding bit only. Missing/unavailable/malformed settings retain stills.
 * Legal readers remain database-free; this lookup never reads a session, member or private setting.
 */
export async function siteSignInWithMedia(request:Request,env:Env,status=200,flash?:string,cookies:string[]=[]):Promise<Response>{
  if(request.headers.get('Save-Data')?.trim().toLowerCase()==='on')return siteSignIn(request,status,flash,cookies,false);
  let animation=false;
  try{const row=await env.DB.prepare("SELECT value FROM site_settings WHERE key='loginAnimation' AND value='1'").first<{value:string}>();animation=row?.value==='1';}catch{}
  return siteSignIn(request,status,flash,cookies,animation);
}

/** Called only after the canonical host check. Public policies/assets are handled before this boundary. */
export async function memberSiteGate(request: Request, env: Env, path: string): Promise<Response | null> {
  // The .165 HTTP 203 attempt lost this deny body at the Cloudflare edge to a managed HTTP 200 response.
  // Restore the original HTTP 200 deny response; verify the merged body after deployment.
  // The provider's injected Allow directive remains separate from this member access boundary.
  if (path === '/robots.txt' && (request.method === 'GET' || request.method === 'HEAD')) {
    return new Response(request.method === 'HEAD' ? null : 'User-agent: *\nDisallow: /\nDisallow: /*$\n', { status: 200, headers: securityHeaders(new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })) });
  }
  if (AUTH_PATHS.has(path) || PRIVACY_PATHS.has(path) || path === '/api/me/export' || path === '/api/me/erasure/status' || path === '/api/me/erasure') return null;
  if (path === '/auth/logout' && request.method === 'POST') return null; // the original same-origin handler must clear even a departed/denied session
  // This exact own-account service authenticates in site-api. Its POST admits
  // the account rate before fresh membership/body work and rechecks standing;
  // its GET stays available for an authenticated denied/departed account.
  if(path==='/api/me/verification'&&(request.method==='GET'||request.method==='POST'))return null;
  let user;
  try { user = await currentUser(env, request); }
  catch (e) {
    // .177: identify the failed boundary without retaining request, account or error text.
    console.error('site access unavailable', 'current_user', errorRef(e));
    return new Response(JSON.stringify({ error: 'site_access_unavailable' }), { status: 503, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
  }
  // Preserve the existing signed-in own-record reads, including a departed or denied identity.
  if (user && request.method === 'GET' && (path === '/api/me' || path === '/api/application' || path === '/api/community/context')) return null;
  if (user && user.in_server === 1 && !user.denied) {
    try {
      // Evergreen 12 Nov 2026 (CL2-073): when no Discord check is due nothing rewrites the row, so the page may reuse it.
      const unchanged = !membershipRecheckDue(user);
      const held = await stillMember(privacyBoundSiteEnv(env, originalUserSession(user)), user);
      if (held) return request.method === 'HEAD' ? new Response(null, { status: held.status, headers: held.headers }) : held;
      if (unchanged) rememberGateUser(request, user);
      return null;
    } catch (e) {
      console.error('site access unavailable', 'membership', errorRef(e));
      return new Response(JSON.stringify({ error: 'site_access_unavailable' }), { status: 503, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
    }
  }
  const status = user ? 403 : 401;
  if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/static/') && (!path.includes('.') || path === '/index.html')) {
    const entry = path === '/' || path === '/index.html';
    const ended = entry && new URL(request.url).search === '?entry=session-ended';
    return siteSignInWithMedia(request, env, entry ? 200 : status, user ? user.denied ? 'denied' : 'not_member' : ended ? 'session_ended' : undefined);
  }
  const api = path.startsWith('/api/');
  const error = user ? user.denied ? 'denied' : 'not_member' : api ? 'signed_out' : 'discord_sign_in_required';
  const body = api ? { error, message: user ? 'This account cannot enter the guild site. Your own account-data controls remain available.' : 'Sign in with Discord to enter Olympus.' } : { error };
  return new Response(JSON.stringify(body), { status, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
}

/** The routes memberSiteGate lets through before it admits a member (sign-in, privacy rights, own-data export and
 * erasure, sign-out). Their responses keep their headers exactly (CL2-076, owner ruling of 13 Nov 2026). */
export const memberGateExempt = (path: string): boolean => AUTH_PATHS.has(path) || PRIVACY_PATHS.has(path) ||
  path === '/api/me/export' || path === '/api/me/erasure/status' || path === '/api/me/erasure' || path === '/auth/logout';

export function privateSiteAsset(response: Response): Response {
  const headers = securityHeaders(new Headers(response.headers));
  headers.set('Cache-Control', 'private, no-store, no-transform');
  headers.set('Vary', 'Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Fetch a verified .html route's extensionless ASSETS key so the provider's
 * default HTML redirect cannot move the browser outside its exact policy route. */
export function fetchCanonicalHtmlAsset(request: Request, assets: Env['ASSETS'], htmlPath: string): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = htmlPath.slice(0, -'.html'.length);
  return assets.fetch(new Request(url, { method: request.method, headers: request.headers, redirect: 'manual' }));
}

/** The councillor verification page alone may use the device camera (owner item 32 fallback, 14 October 2026): an
 * attended, local QR read of a screen this browser cannot capture. Same origin only, delivered only behind the member
 * gate; every other response keeps camera=(). Microphone and the rest stay closed. */
export const CAMERA_PAGE_PATH = '/static/qr-phase1.html';
export function privateCameraPageAsset(response: Response): Response {
  const asset = privateSiteAsset(response);
  const headers = new Headers(asset.headers);
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}
