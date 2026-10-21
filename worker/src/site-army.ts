/** Finite Army public reader and separately admitted reporter; no private SPA or Community-route exception. */
import type { Env } from "./env";
import { apiJson, securityHeaders } from "./site-core";
import { publicArmyPage, armyReporterPage, ARMY_PUBLIC_ASSETS, ARMY_REPORTER_ASSETS } from "./army-pages";
import { armyPrivate, armyPublic, armyReporter } from "./army-census";
const method = () => apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
export async function armyBeforeMemberGate(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === "/api/army") return armyPublic(request, env);
  if (path === "/army") {
    if (!["GET", "HEAD"].includes(request.method)) return method();
    if (new URL(request.url).search) return apiJson({ error: "bad_request" }, 400);
    return publicArmyPage(request);
  }
  if ((ARMY_PUBLIC_ASSETS as readonly string[]).includes(path)) {
    if (!["GET", "HEAD"].includes(request.method)) return method();
    const response = await env.ASSETS.fetch(request), headers = securityHeaders(new Headers(response.headers));
    return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
  }
  return null;
}
/** Called only after the existing membership delivery gate. Server capability is checked again, never from browser flags. */
export async function armyAfterMemberGate(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path.startsWith("/api/army/")) return armyPrivate(request, env, path);
  if (path === "/army/report" || (ARMY_REPORTER_ASSETS as readonly string[]).includes(path)) {
    if (!["GET", "HEAD"].includes(request.method)) return method();
    const reporter = await armyReporter(request, env); if (reporter instanceof Response) return reporter;
    reporter.check();
    if (path === "/army/report") return armyReporterPage(request);
    const response = await env.ASSETS.fetch(request); reporter.check();
    const headers = securityHeaders(new Headers(response.headers)); headers.set("Cache-Control", "private, no-store, no-transform"); headers.set("Vary", "Cookie");
    return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
  }
  return null;
}
