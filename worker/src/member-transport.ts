/** How signed-in member responses travel (Evergreen 12 Nov 2026, CL2-076). Owner ruling of 13 Nov 2026, "Yes, both":
 * "Script and style files are kept privately in the member's browser and pages are compressed in transit. After
 * sign-out the script file stays in that browser's cache until it expires." Not covered, so unchanged here: caching
 * the page or any API response (they stay no-store), the public (signed-out) responses, and every privacy, account
 * and export route the member gate lets through without admitting a member (site-access.ts memberGateExempt).
 */
import { memberGateExempt, privateSiteAsset } from './site-access';

/** The files the signed-in page requests with the build's version parameter (site.ts page()). wow-cursor.css?v= is
 * requested the same way, but it is a public policy file answered before the member gate (index.ts POLICY_ASSETS),
 * and the public cache policy is outside the ruling, so it keeps its headers. */
export const VERSIONED_MEMBER_ASSETS: readonly string[] = Object.freeze(['/static/app.js', '/static/app.css']);
/** The exact query site.ts writes after those two files: ?v= and the URL-encoded build, nothing else. */
export const versionSearch = (build: string): string => '?v=' + encodeURIComponent(build);
export const MEMBER_ASSET_CACHE = 'private, max-age=31536000, immutable';

// Script, style and JSON only: the zone's content-changing features (site-core.ts, the note on no-transform) act on
// HTML, so these may be compressed by the edge. Images, fonts, media, archives and HTML keep no-transform, so nothing
// re-encodes them.
const COMPRESSIBLE = /^(?:text\/javascript|application\/javascript|text\/css|application\/json)\s*(?:;|$)/i;

/** A file under /static/ after the member gate admitted a current member (index.ts). Every file stays no-store except
 * app.js and app.css requested with the current build's version: those bytes come straight from the deployed
 * assets, the same for every member who may load them, and a new build changes the URL, so the browser keeps them
 * privately for a year (no shared cache may store them) and never asks again. An old or missing version gets the
 * current bytes under a URL that names another build, so it is not kept. */
export function memberSiteAsset(request: Request, response: Response, build: string): Response {
  const asset = privateSiteAsset(response);
  if (!COMPRESSIBLE.test(asset.headers.get('Content-Type') ?? '')) return asset;
  const url = new URL(request.url), headers = new Headers(asset.headers);
  const versioned = (asset.status === 200 || asset.status === 304) && VERSIONED_MEMBER_ASSETS.includes(url.pathname) && url.search === versionSearch(build);
  if (versioned) {
    headers.set('Cache-Control', MEMBER_ASSET_CACHE);
    // The body does not depend on the cookie, and private keeps shared caches out. Varying on Cookie would only make
    // the browser download the file again after every new sign-in, which is the returning visit the ruling is for.
    headers.delete('Vary');
  } else headers.set('Cache-Control', 'private, no-store');
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

/** A JSON answer from /api/ for an admitted member: still no-store, without no-transform so the edge compresses it.
 * The exempt privacy, account-data and export routes, and any other header value, are returned untouched. */
export function memberApiTransport(path: string, response: Response): Response {
  if (!path.startsWith('/api/') || memberGateExempt(path) || !/^application\/json\s*(?:;|$)/i.test(response.headers.get('Content-Type') ?? '')) return response;
  const now = response.headers.get('Cache-Control');
  const next = now === 'no-store, no-transform' ? 'no-store' : now === 'private, no-store, no-transform' ? 'private, no-store' : null;
  if (!next) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', next);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Whether the browser takes gzip. On Cloudflare the Worker may see a rewritten Accept-Encoding; the client's own
 * value is then in cf.clientAcceptEncoding, so that one is used when present. */
export function acceptsGzip(request: Request): boolean {
  const client = (request as { cf?: { clientAcceptEncoding?: unknown } }).cf?.clientAcceptEncoding;
  const value = typeof client === 'string' ? client : request.headers.get('Accept-Encoding') ?? '';
  let gzip: number | null = null, any: number | null = null;
  for (const part of value.split(',')) {
    const [coding = '', ...params] = part.split(';').map(s => s.trim().toLowerCase());
    const q = params.find(p => p.startsWith('q='));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    if (!Number.isFinite(weight)) continue;
    if (coding === 'gzip' || coding === 'x-gzip') gzip = Math.max(gzip ?? 0, weight);
    else if (coding === '*') any = weight;
  }
  return (gzip ?? any ?? 0) > 0;
}

/** The signed-in page itself. It keeps no-store and no-transform (the zone's content-changing features would
 * otherwise rewrite it under its exact content-security policy), so the Worker compresses it: gzip when the browser
 * takes it, the same bytes after decoding, Vary: Accept-Encoding either way. HEAD carries the same headers and no
 * body; a Range header is ignored and the whole page is sent, as before. */
export async function memberDocument(request: Request, html: string, status: number, headers: Headers): Promise<Response> {
  headers.set('Vary', 'Accept-Encoding');
  if (!acceptsGzip(request)) return new Response(request.method === 'HEAD' ? null : html, { status, headers });
  headers.set('Content-Encoding', 'gzip');
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const body = await new Response(new Response(html).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  // manual: the body is already gzip; without it the runtime would compress it a second time.
  return new Response(body, { status, headers, encodeBody: 'manual' });
}
