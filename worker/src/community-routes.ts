/**
 * .56/.57: /api/community/* (members) and /api/admin/community/* (SITE_ADMINS, through site-admin.ts). site-api.ts hands
 * every signed-in request under the member prefix here after its own session and origin rules; each handler applies the
 * community fence and the feature list itself.
 */
import type { Env } from "./env";
import { apiJson, type SiteUser } from "./site-core";
import { communityContext, contextDto, refusal } from "./community-context";
import "./community-refs"; // registers its erasure and export
import { adminAltDecision, adminDirectory, craftingSearch, directoryList, profileGet, profilePut } from "./community-directory";
import { attendanceList, cancelEvent, createEvent, getEvent, listEvents, myAttendance, recordAttendance, rsvp, updateEvent } from "./community-events";
import { createTrial, listTrials, trialMe, updateTrial } from "./community-trials";
import { listRestrictions, restrictionAction, returnReview } from "./community-restrictions";
import { listDepartures, updateDeparture } from "./community-departures";
import { adminContributionAction, adminContributions, contributionsAcknowledge, contributionsMe } from "./community-contributions-api";
import { adminListCases, adminReadCase, adminUpdateCase } from "./community-privacy-intake";
import { coverageReport, digestStatus, resumeDigest } from "./community-digest";

export async function handleCommunity(request: Request, env: Env, path: string): Promise<Response> {
  const ctx = await communityContext(env, request);
  const m = request.method;
  if (m === "GET" && path === "/api/community/context") return apiJson(contextDto(ctx));
  if (m === "GET" && path === "/api/community/profile") return profileGet(request, env, ctx);
  if (m === "PUT" && path === "/api/community/profile") return profilePut(request, env, ctx);
  if (m === "GET" && path === "/api/community/directory") return directoryList(request, env, ctx);
  if (m === "GET" && path === "/api/community/crafting") return craftingSearch(request, env, ctx);
  // .59: the calendar
  if (m === "GET" && path === "/api/community/events") return listEvents(request, env, ctx);
  if (m === "GET" && path === "/api/community/event") return getEvent(request, env, ctx);
  if (m === "PUT" && path === "/api/community/events/rsvp") return rsvp(request, env, ctx);
  if (m === "POST" && path === "/api/community/events") return createEvent(request, env, ctx);
  if (m === "POST" && path === "/api/community/events/update") return updateEvent(request, env, ctx);
  if (m === "POST" && path === "/api/community/events/cancel") return cancelEvent(request, env, ctx);
  if (m === "GET" && path === "/api/community/event/attendance") return attendanceList(request, env, ctx);
  if (m === "POST" && path === "/api/community/attendance/record") return recordAttendance(request, env, ctx);
  if (m === "GET" && path === "/api/community/attendance/me") return myAttendance(request, env, ctx);
  if (m === "GET" && path === "/api/community/trial/me") return trialMe(request, env, ctx); // .61
  // .75: the contribution ledger, the member's own side
  if (m === "GET" && path === "/api/community/contributions/me") return contributionsMe(request, env, ctx);
  if (m === "POST" && path === "/api/community/contributions/acknowledge") return contributionsAcknowledge(request, env, ctx);
  return apiJson({ error: "not_found" }, 404);
}

/** The staff half, reached through site-admin.ts after its SITE_ADMINS check. */
export async function handleCommunityAdmin(request: Request, env: Env, path: string, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  const m = request.method;
  if (m === "GET" && path === "/api/admin/community/directory") {
    const ctx = await communityContext(env, request);
    if (!ctx.capabilities.communityStaff) return refusal(env, request, "applicantWrite"); // .66
    return adminDirectory(request, env, ctx, new URL(request.url)); // .72: behind the staff member's own admission
  }
  // every staff WRITE carries the admin's own fence (.61 trials, .64 directory), so the context is read here; and every
  // community staff route, reads included, requires the declared communityStaff capability (.66, Codex's .61 review):
  // site-api admits a SITE_ADMINS id to the admin namespace, this is where their standing is judged for community data
  const ctx = await communityContext(env, request);
  if (!ctx.capabilities.communityStaff) return refusal(env, request, "applicantWrite");
  if (m === "POST" && path === "/api/admin/community/directory/alt") return adminAltDecision(request, env, ctx, admin, body);
  if (m === "GET" && path === "/api/admin/community/trials") return ctx.features.has("trials") ? listTrials(request, env, ctx, new URL(request.url)) : apiJson({ error: "feature_disabled" }, 503);
  if (m === "POST" && path === "/api/admin/community/trials") return createTrial(request, env, ctx, admin, body);
  if (m === "POST" && path === "/api/admin/community/trials/update") return updateTrial(request, env, ctx, admin, body);
  // .69: restriction cases, their watch-list and the return review (staff records and evidence only)
  if (m === "GET" && path === "/api/admin/community/restrictions") return listRestrictions(request, env, ctx, new URL(request.url));
  if (m === "POST" && path === "/api/admin/community/restrictions") return restrictionAction(request, env, ctx, admin, body);
  if (m === "GET" && path === "/api/admin/community/return-review") return returnReview(request, env, ctx);
  // .70: departure review items
  if (m === "GET" && path === "/api/admin/community/departures") return listDepartures(request, env, ctx, new URL(request.url));
  if (m === "POST" && path === "/api/admin/community/departures/update") return updateDeparture(request, env, ctx, admin, body);
  // .75: the contribution ledger, the staff side
  if (m === "GET" && path === "/api/admin/community/contributions") return adminContributions(request, env, ctx, new URL(request.url));
  if (m === "POST" && path === "/api/admin/community/contributions") return adminContributionAction(request, env, ctx, admin, body);
  // .82: the private request intake, the staff side
  if (m === "GET" && path === "/api/admin/community/privacy-requests") return adminListCases(request, env, ctx, new URL(request.url));
  if (m === "GET" && path === "/api/admin/community/privacy-requests/case") return adminReadCase(request, env, ctx, new URL(request.url));
  if (m === "POST" && path === "/api/admin/community/privacy-requests/update") return adminUpdateCase(request, env, ctx, admin, body);
  // .85: the officer digest (counts only, its fenced state) and the coverage report, consolidation batch 7
  if (m === "GET" && path === "/api/admin/community/digest") return digestStatus(request, env, ctx);
  if (m === "POST" && path === "/api/admin/community/digest/resume") return resumeDigest(request, env, ctx, admin);
  if (m === "GET" && path === "/api/admin/community/coverage") return coverageReport(request, env, ctx);
  return apiJson({ error: "not_found" }, 404);
}
