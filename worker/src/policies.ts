/**
 * The Privacy Policy and Terms of Service, served by the Worker itself since .65 (1 Oct 2026; W03 of the consolidation,
 * Codex's countersigned delivery candidate, manifest 5519466c…, 02:31 UTC, integrated on .64): public GET/HEAD 200 HTML
 * at /privacy and /terms and every alias that ever served or redirected them, on the site host and the bot host, with
 * no Location, no cookie, no database and no session (index.ts calls this right after the host check, before the
 * schema check), a strict self-only CSP with scripts disabled, and one local stylesheet (/static/policies.css, the only
 * static file the bot host serves). Other methods are 405.
 *
 * The text is src/policy-content.ts, GENERATED from the tracked policies/privacy.html and policies/terms.html by
 * scripts/build-policy-content.mjs (`npm run check:policies` fails when stale), so the Worker's copy and the GitHub Pages
 * mirror (repo olympus-verify-policies, the Discord application's portal links) cannot drift. Until .64 these paths
 * redirected to the Pages mirror. The wording itself is the tracked text; its truth review against every consolidated
 * module is a separate gate (checklist .65).
 */
import { securityHeaders } from "./site-core";
import { policyDocument } from "./policy-content";

export const POLICY_CSP = ["default-src 'none'", "script-src 'none'", "style-src 'self'", "font-src 'self'", "img-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'"].join("; ");

/** The policy a path names as a complete response, or null when the path is not a policy address. */
export function policyResponse(request: Request, path: string): Response | null {
  const document = policyDocument(path);
  if (document === null) return null;
  const headers = securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" }));
  headers.set("Content-Security-Policy", POLICY_CSP);
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Allow", "GET, HEAD");
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response("method not allowed", { status: 405, headers });
  }
  return new Response(request.method === "HEAD" ? null : document, { status: 200, headers });
}
