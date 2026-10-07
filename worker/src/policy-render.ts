/** .116b3 candidate. Local official fonts/crest only; text and attribute values are escaped. */
import { securityHeaders } from "./site-core";

export const POLICY_ASSETS = ["/static/policies.css", "/static/olympus-icon.png", "/static/wow/friz-quadrata.woff2", "/static/wow/morpheus.woff2"] as const;
export const STATIC_POLICY_CSP = "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
export const FORM_POLICY_CSP = STATIC_POLICY_CSP.replace("form-action 'none'", "form-action 'self'");
export const escapeText = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
/** body is composed by finite server templates, never arbitrary caller HTML. */
export function policyShell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Olympus — ${escapeText(title)}</title><link rel="stylesheet" href="/static/policies.css"></head><body class="olympus-policy"><a class="skip-link" href="#policy-content">Skip to content</a><header class="policy-header"><a class="brand" href="/"><img src="/static/olympus-icon.png" alt="" width="40" height="40">Olympus</a><nav aria-label="Policies"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></nav></header><main id="policy-content" tabindex="-1"><h1>${escapeText(title)}</h1>${body}</main></body></html>`;
}
export function policyHeaders(forms = false): Headers {
  const h = securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" }));
  h.set("Content-Security-Policy", forms ? FORM_POLICY_CSP : STATIC_POLICY_CSP);
  h.set("Referrer-Policy", forms ? "same-origin" : "no-referrer");
  return h;
}
export function htmlResponse(request: Request, title: string, body: string, status = 200, cookie?: string): Response {
  const h = policyHeaders(true);
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(request.method === "HEAD" ? null : policyShell(title, body), { status, headers: h });
}
export function policyRedirect(location: string, status = 303): Response {
  if (!/^\/(?!\/)[A-Za-z0-9/#?=&_.-]*$/.test(location)) throw new Error("invalid_policy_redirect");
  const h = policyHeaders(); h.set("Location", location);
  return new Response(null, { status, headers: h });
}
