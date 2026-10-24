/** Fixed private navigation only. The public script-free policy responder stays independent.
 * No provider read, session refresh, cookie write, query reflection or policy-content rewrite. */
import type { Env } from './env';
import { currentUser, securityHeaders, SESSION_COOKIE } from './site-core';
export async function memberLegalNavigation(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!['/legal/privacy', '/legal/terms'].includes(path) || !['GET', 'HEAD'].includes(request.method)) return null;
  const cookie = request.headers.get('Cookie');
  if (!cookie || !cookie.split(';').some(part => part.trim().startsWith(SESSION_COOKIE + '='))) return null;
  // A missing, stale, denied or held identity always retains the public reader.
  try {
    const user = await currentUser(env, request);
    if (!user || user.in_server !== 1 || user.denied !== 0) return null;
    const headers = securityHeaders(new Headers({ Location: '/#' + path, Vary: 'Cookie' }));
    headers.set('Cache-Control', 'private, no-store, no-transform');
    return new Response(null, { status: 303, headers });
  } catch { return null; }
}
