/** Digest addresses for the finite public policy and sign-in art closure. */
import type { Env } from "./env";
import { securityHeaders } from "./site-core";

const policyDigests = Object.freeze({
  "/static/policies.css": "490c52bc213f7c8d55b17b5e24ad4fa53e8b31d5b12f7d7edbfc5bba26f1e1d4",
  "/static/olympus-icon.png": "6363b15aff31a623aef0a6d7e52104fc44066f64852a328da788c84c325874eb",
  "/static/wow-cursor.css": "90146d7844b925b88187a11279798340e2afb63a3d82cb8b60aaaae77c2447d9",
  "/static/wow/cursor-point.png": "e0c2e4058da870eba331be9c2aff62895b1afefc3b3ee3ed9ab24c63771fc42c",
  "/static/wow/cursor-interact.png": "e82d06135e75f3a8a6de36d7432a4ed2d1ded0fce38ed790f8c311ca736b6942",
  "/static/wow/icon-shield.png": "8440e2ac469adcba4b985b480d6cf9588f66175087864286088938c852bf7ea5",
  "/static/wow/friz-quadrata.woff2": "0b81818e6d999c463288926ec9f3afeb771d89c6712f2c2e1e2eee5c97df522d",
  "/static/wow/morpheus.woff2": "ea845e2ac467f107eb1617c88b0d38acf6c8234bdf21675db710f90051409f3e",
  "/static/wow/rock.jpg": "984d97df82fd8482593f0297d66d22d2ede14c793f0d2a48f5bfd27963d80dad",
  "/static/wow/parchment.jpg": "14685ef2f7c49e8be2e9c0a91e26a2cf3417a594509e0c115a27184690efbd07",
  "/static/wow/frame-gold.png": "bbb2000f8040c2f3d8391d8a253c3d9e955b9934f508b98359f86ebb5ce4e48f",
  "/static/wow/button-up.png": "170fae7ca18f342912c89da3f277915896e3b194b2ff144f8b50ce89a01c81bf",
  "/static/wow/button-hover.png": "5f475ebcbae6055b946c493611aa66bc643de5785cbe500e1df2d89656badb46",
});
const loginDigests = Object.freeze({
  "/static/wow/login/dark-portal.webm": "930ca8937c601245c7893cdc46750de3eca729c5fa9b91ef11dc08d87687521c",
  "/static/wow/login/dark-portal-poster.jpg": "c2c0820f50c6cf1944e88e5fd54f2b421df1955ebe7842cb976ac5599f191050",
  "/static/wow/login/olympus-dark-portal-wide.png": "17661fd0184e3a20fd6ed366673e64fc66baef41ed378bfdf5ab9f3ed0a16dc6",
  "/static/wow/login/olympus-dark-portal-portrait.png": "218063b8ba4e5496c659a310cb46cd26d5c14d4784a7e66f9497d968e1679659",
  // Owner ruling of 13 Nov 2026 (CL2-074): WebP copies of the two stills above (quality 0.82); the PNGs stay the fallback.
  "/static/wow/login/olympus-dark-portal-wide.webp": "3898651551731cd1585a5682636d457e8200183504c23c633c8aaa1dd3fddbc9",
  "/static/wow/login/olympus-dark-portal-portrait.webp": "cd908960637f06c5dc509bf4315ba55859f984bb7e523f73dfdc47cd40462fe1",
});

export const POLICY_ASSETS = Object.freeze(Object.keys(policyDigests));
export const LOGIN_ASSETS = Object.freeze(Object.keys(loginDigests));
export const POLICY_ASSET_DIGEST_PREFIX = "/public-assets/by-digest/";
const digests = Object.freeze({ ...policyDigests, ...loginDigests });
type PolicyAssetPath = keyof typeof digests;

export function immutablePolicyAssetUrl(path: PolicyAssetPath): string {
  return POLICY_ASSET_DIGEST_PREFIX + digests[path] + "/" + path.slice("/static/".length);
}

/** Rewrite only literal allowlisted URLs in the script-free public templates. */
export function renderImmutablePolicyAssets(html: string): string {
  return html.replace(/(\b(?:href|src|srcset)=")(\/static\/[^"\s]+)"/g, (original, attribute: string, path: string) =>
    Object.hasOwn(digests, path) ? attribute + immutablePolicyAssetUrl(path as PolicyAssetPath) + '"' : original);
}

const publicRoutes = new Map((Object.keys(digests) as PolicyAssetPath[]).map(path => [immutablePolicyAssetUrl(path), path]));
const requestHeaderNames = ["Range", "If-Range", "If-None-Match", "If-Modified-Since"] as const;
const responseHeaderNames = ["Content-Type", "Content-Encoding", "Content-Length", "Accept-Ranges", "Content-Range", "ETag", "Last-Modified"] as const;

export async function immutablePolicyAsset(request: Request, url: URL, assets: Env["ASSETS"], siteHost: boolean): Promise<Response> {
  const path = publicRoutes.get(url.pathname);
  const headers = securityHeaders(new Headers());
  if (!path || url.search || (!siteHost && Object.hasOwn(loginDigests, path))) return new Response(null, { status: 404, headers });
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Allow", "GET, HEAD");
    return new Response(null, { status: 405, headers });
  }

  // The digest is checked against the exact reviewed static file by the source gate.
  // Only that file can be resolved. Session and provider headers never reach the binding.
  const assetHeaders = new Headers();
  for (const name of requestHeaderNames) {
    const value = request.headers.get(name);
    if (value !== null) assetHeaders.set(name, value);
  }
  let asset: Response;
  try {
    asset = await assets.fetch(new Request(new URL(path, url.origin), { method: request.method, headers: assetHeaders }));
  } catch {
    return new Response(null, { status: 502, headers });
  }
  if (![200, 206, 304, 416].includes(asset.status)) {
    await asset.body?.cancel();
    return new Response(null, { status: asset.status === 404 ? 404 : 502, headers });
  }
  for (const name of responseHeaderNames) {
    const value = asset.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (asset.status !== 416) headers.set("Cache-Control", "public, max-age=31536000, immutable, no-transform");
  const bodyless = request.method === "HEAD" || asset.status === 304;
  if (bodyless) await asset.body?.cancel();
  return new Response(bodyless ? null : asset.body, { status: asset.status, headers });
}
