/** Member-site delivery boundary (.154). No application source or guild payload is sent before Discord sign-in. */
import type { Env } from './env';
import { currentUser, originalUserSession, securityHeaders } from './site-core';
import { stillMember } from './site-api';
import { privacyBoundSiteEnv } from './privacy-serving-authority';
import { loginHeaders, policyShell } from './policy-render';

const AUTH_PATHS = new Set(['/auth/login', '/auth/callback']);
// These existing privacy flows have their own Discord identity / one-use case credentials.
// Requiring current guild membership here would lock departed users out of their own data rights.
const PRIVACY_PATHS = new Set(['/privacy/access', '/privacy/signin', '/privacy/callback', '/privacy/access/export', '/privacy/access/erasure', '/privacy/contact', '/privacy/case', '/privacy/case/reply', '/privacy/account', '/privacy/account/export', '/privacy/account/site-erase', '/privacy/account/full-erase', '/privacy/account/erasure-status', '/privacy/account/bnet-unlink', '/api/privacy/config', '/api/privacy/requests', '/api/privacy/requests/read', '/api/privacy/requests/reply']);
const FLASH: Record<string, string> = {
  cancelled: 'Discord sign-in was cancelled. You can try again when ready.',
  expired: 'This sign-in attempt expired. Start a new Discord sign-in.',
  not_member: 'Join the Asmongold Discord server before using the guild site.',
  pending: 'Finish the Discord server membership screening, then sign in again.',
  denied: 'This account cannot enter the guild site. Your privacy account connection remains available.',
  busy: 'Discord is busy. Wait a moment before trying again.',
  updating: 'The guild site is updating. Please try again shortly.',
  discord_error: 'Discord sign-in could not be completed. Please try again shortly.',
  not_configured: 'Discord sign-in is temporarily unavailable.',
  privacy_held: 'Your sign-in could not be completed while account controls are updating. Please try again later.',
};

export function siteSignIn(request: Request, status = 200, flash?: string, cookies: string[] = []): Response {
  const note = flash && FLASH[flash] ? `<p role="status">${FLASH[flash]}</p>` : '';
  // Owner's .173 choice: approved wide/portrait art fills the viewport, with sign-in below the shields.
  const body = `<section class="sign-in-gate portal-login"><div class="login-portal" aria-hidden="true"><picture class="login-portal-art"><source media="(max-aspect-ratio: 6/5)" srcset="/static/wow/login/olympus-dark-portal-portrait.png" width="852" height="1847"><img class="login-portal-poster" src="/static/wow/login/olympus-dark-portal-wide.png" alt="" aria-hidden="true" width="1916" height="821"></picture></div><div class="login-card"><h1>Enter Olympus</h1><p class="eyebrow">The gates of Olympus</p><p>Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required.</p>${note}<a class="policy-button" href="/auth/login">Sign in with Discord</a></div></section>`;
  const headers = loginHeaders();
  for (const value of cookies) headers.append('Set-Cookie', value);
  // Owner's entry-page simplification (18 Oct 2026): policy URLs remain public for Discord's application links.
  return new Response(request.method === 'HEAD' ? null : policyShell('Enter Olympus', body, { policyNavigation: false, loginPresentation: true }), { status, headers });
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
  let user;
  try { user = await currentUser(env, request); }
  catch {
    return new Response(JSON.stringify({ error: 'site_access_unavailable' }), { status: 503, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
  }
  // Preserve the existing signed-in own-record reads, including a departed or denied identity.
  if (user && request.method === 'GET' && (path === '/api/me' || path === '/api/application' || path === '/api/community/context')) return null;
  if (user && user.in_server === 1 && !user.denied) {
    try {
      const held = await stillMember(privacyBoundSiteEnv(env, originalUserSession(user)), user);
      if (held) return request.method === 'HEAD' ? new Response(null, { status: held.status, headers: held.headers }) : held;
      return null;
    } catch {
      return new Response(JSON.stringify({ error: 'site_access_unavailable' }), { status: 503, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
    }
  }
  const status = user ? 403 : 401;
  if ((request.method === 'GET' || request.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/static/') && (!path.includes('.') || path === '/index.html')) {
    return siteSignIn(request, path === '/' || path === '/index.html' ? 200 : status, user ? user.denied ? 'denied' : 'not_member' : undefined);
  }
  const api = path.startsWith('/api/');
  const error = user ? user.denied ? 'denied' : 'not_member' : api ? 'signed_out' : 'discord_sign_in_required';
  const body = api ? { error, message: user ? 'This account cannot enter the guild site. Your own account-data controls remain available.' : 'Sign in with Discord to enter Olympus.' } : { error };
  return new Response(JSON.stringify(body), { status, headers: securityHeaders(new Headers({ 'Content-Type': 'application/json; charset=utf-8' })) });
}

export function privateSiteAsset(response: Response): Response {
  const headers = securityHeaders(new Headers(response.headers));
  headers.set('Cache-Control', 'private, no-store, no-transform');
  headers.set('Vary', 'Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
