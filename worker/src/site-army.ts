/** Finite signed-in Army reader and separately admitted Admin reporter. No anonymous delivery exception. */
import type { Env } from "./env";
import { apiJson } from "./site-core";
import { armyReporterFragment, ARMY_PUBLIC_ASSETS, ARMY_REPORTER_ASSETS } from "./army-pages";
import { armyPrivate, armyPublic, armyReporter, armyReader, privateArmyResponse } from "./army-census";
const method = (request: Request) => privateArmyResponse(request, apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" }));
const RETIRED_ARMY_ZIP = "/static/army-live/olympus-army-addon-0.2.0.zip";
/** Keep the original site boundary's refusal and policy, adding only finite Army cache/HEAD isolation. */
export function armyGateReply(request: Request, path: string, gate: Response): Response {
  const army = path === "/army" || path === "/army/report" || path === "/army/report/fragment" || path === "/api/army" || path.startsWith("/api/army/") ||
    path.startsWith("/static/army-live/");
  return army ? privateArmyResponse(request, gate) : gate;
}
/** Called only after the original member delivery gate; every finite Army route independently rechecks its reader. */
export async function armyAfterMemberGate(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === RETIRED_ARMY_ZIP) {
    if (!["GET", "HEAD"].includes(request.method)) return method(request);
    const reader = await armyReader(request, env); if (reader instanceof Response) return reader;
    reader.check(); return privateArmyResponse(request, apiJson({ error: "standalone_army_addon_retired" }, 410));
  }
  if (path === "/api/army") return armyPublic(request, env);
  if (path === "/army") {
    if (!["GET", "HEAD"].includes(request.method)) return method(request);
    if (new URL(request.url).search) return privateArmyResponse(request, apiJson({ error: "bad_request" }, 400));
    const reader = await armyReader(request, env); if (reader instanceof Response) return reader;
    reader.check(); return privateArmyResponse(request, new Response(null, {status:302, headers:{Location:"/#/army"}}));
  }
  if ((ARMY_PUBLIC_ASSETS as readonly string[]).includes(path)) {
    if (!["GET", "HEAD"].includes(request.method)) return method(request);
    const reader = await armyReader(request, env); if (reader instanceof Response) return reader;
    const response = await env.ASSETS.fetch(request), admission = await reader.read();
    if (admission instanceof Response) return admission;
    reader.check(); return privateArmyResponse(request, response);
  }
  if (path.startsWith("/api/army/")) return privateArmyResponse(request, await armyPrivate(request, env, path));
  if (path === "/army/report" || path === "/army/report/fragment" || (ARMY_REPORTER_ASSETS as readonly string[]).includes(path)) {
    if (!["GET", "HEAD"].includes(request.method)) return method(request);
    const reporter = await armyReporter(request, env); if (reporter instanceof Response) return privateArmyResponse(request, reporter);
    reporter.check();
    if (path === "/army/report" || path === "/army/report/fragment") {
      if (new URL(request.url).search) return privateArmyResponse(request, apiJson({ error: "bad_request" }, 400));
      if (path === "/army/report/fragment") return privateArmyResponse(request, armyReporterFragment(request));
      return privateArmyResponse(request, new Response(null, {status: 302, headers: {Location: "/#/army/report"}}));
    }
    const response = await env.ASSETS.fetch(request); reporter.check();
    // Asset storage is awaited; re-admit the same original request against live Admin/session/standing facts.
    const current = await armyReporter(request, env); reporter.check();
    if (current instanceof Response) return privateArmyResponse(request, current);
    current.check();
    return privateArmyResponse(request, response);
  }
  // Historical collector sources are retained for audit but never fall through to static delivery.
  if (path.startsWith("/static/army-live/")) return privateArmyResponse(request, apiJson({ error: "not_found" }, 404));
  return null;
}
