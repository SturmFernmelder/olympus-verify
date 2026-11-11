import type { Env } from './env';
import { securityHeaders } from './site-core';

const ZIP = '/static/olympus-verify/olympus-verify-0.6.29.zip';
const MANIFEST = '/static/olympus-verify/version.json';

/** Two public code downloads only. No credentials, member reads or generic static bypass. */
export async function verifyAddonDownload(request: Request, env: Env, site: boolean): Promise<Response | null> {
  const url = new URL(request.url);
  let decoded = url.pathname;
  try { decoded = decodeURIComponent(decoded); } catch { /* Malformed aliases never match an asset. */ }
  const candidate = [url.pathname, decoded].some(path => path.toLowerCase().startsWith(ZIP.slice(0, ZIP.lastIndexOf('/'))));
  if (!candidate) return null;
  const headers = securityHeaders(new Headers());
  if (!site || ![ZIP, MANIFEST].includes(url.pathname)) return new Response(null, { status: 404, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD'); return new Response(null, { status: 405, headers });
  }
  // Fetch only the fixed asset, without cookies, caller headers, queries or redirect following.
  const canonical = new URL(url.pathname, url.origin);
  const source = await env.ASSETS.fetch(new Request(canonical, { method: 'GET', redirect: 'manual' }));
  if (source.status !== 200) { await source.body?.cancel(); return new Response(null, { status: 404, headers }); }
  headers.set('Content-Type', url.pathname === ZIP ? 'application/zip' : 'application/json; charset=utf-8');
  if (url.pathname === ZIP) headers.set('Content-Disposition', 'attachment; filename="olympus-verify-0.6.29.zip"');
  if (request.method === 'HEAD') { await source.body?.cancel(); return new Response(null, { status: 200, headers }); }
  return new Response(source.body, { status: 200, headers });
}
