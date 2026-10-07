/** Short script-free contact/case interface over the existing case engine. Conversation access is not account authority. */
import type { Env } from "./env";
import { currentUser, PAGE_VERSION } from "./site-core";
import { handlePrivacyIntakeForm, INTAKE_KINDS, intakeOpen, intakeRetentionDays } from "./community-privacy-intake";
import { communityFeatures } from "./community-context";
import { ACTION_CURSOR_LIMIT, actionCursorShape, EVENT_CHANGE_CURSOR_LIMIT, eventChangeCursorShape, exportMyData, exportMyHistory, exportMyEventChanges, type OwnActionHistoryView, type OwnEventChangeHistoryView, CONTRIBUTION_DECISION_CURSOR_LIMIT, contributionDecisionCursorShape, exportMyContributionDecisions, type OwnContributionDecisionHistoryView } from "./site-export";
import { escapeText as e, htmlResponse } from "./policy-render";
import { field, FormError, formCookie, formNonce, formToken, hidden, randomCode, readForm, requireFormToken, type FormPurpose } from "./policy-form-core";
import { privacyIdentityRoute } from "./privacy-identity";

const ID = /^[A-Za-z0-9_-]{22}$/, CODE = /^[A-Za-z0-9_-]{43}$/;
const CASE_FIELDS = ["csrf", "caseId", "caseCode", "before"] as const;
const controls = `<section class="data-controls"><h2>Privacy and account data</h2><p><a href="/privacy/account">Account data controls</a> · <a href="/privacy/contact">Contact the privacy inbox</a> · <a href="/privacy/case">Read an existing case</a></p></section>`;
function credentials(f: Readonly<Record<string, string>>) {
  const caseId = field(f, "caseId", 22, true, true), caseCode = field(f, "caseCode", 43, true, true);
  if (!ID.test(caseId) || !CODE.test(caseCode)) throw new FormError("invalid_form");
  return Object.freeze({ caseId, caseCode });
}
const binding = (c: { caseId: string; caseCode: string }) => `${c.caseId}:${c.caseCode}`;
async function caseReadForm(env: Env, nonce: string, c?: { caseId: string; caseCode: string }, before?: string): Promise<string> {
  return `<form method="post" action="/privacy/case">${hidden("csrf", await formToken(env, nonce, "case-read"))}${before ? hidden("before", before) : ""}<label>Case ID<input name="caseId" required maxlength="22" autocomplete="off" value="${e(c?.caseId ?? "")}"></label><label>Private case code<input name="caseCode" type="password" required maxlength="43" autocomplete="off" value="${e(c?.caseCode ?? "")}"></label><button type="submit">${before ? "Older messages" : "Read case"}</button></form>`;
}
async function intake(request: Request, env: Env, path: string, body: Record<string, unknown>): Promise<{ response: Response; data: Record<string, unknown> }> {
  const headers = new Headers({ "Content-Type": "application/json", Origin: new URL(request.url).origin, "X-Olympus": PAGE_VERSION });
  // Preserve the existing first-filter network limiter; no client address is stored by this adapter.
  const ip = request.headers.get("CF-Connecting-IP"); if (ip) headers.set("CF-Connecting-IP", ip);
  const result = await handlePrivacyIntakeForm(new Request(new URL(path, request.url), { method: "POST", headers, body: JSON.stringify(body) }), env, path);
  return { response: result, data: await result.json() as Record<string, unknown> };
}
async function showCase(request: Request, env: Env, nonce: string, c: Readonly<{ caseId: string; caseCode: string }>, before?: string): Promise<Response> {
  const result = await intake(request, env, "/api/privacy/requests/read", { ...c, ...(before ? { before } : {}) });
  if (!result.response.ok) return htmlResponse(request, "Case unavailable", `<p>The case is missing, expired or the code is incorrect. No account data was accessed.</p>${await caseReadForm(env, nonce)}${controls}`, result.response.status);
  const d = result.data, rows = Array.isArray(d.messages) ? d.messages as Record<string, unknown>[] : [];
  let body = `<p>Case <code>${e(c.caseId)}</code>. Status: <strong>${e(d.status)}</strong>. Inactivity deadline: ${e(d.retentionDeadline)}.</p><p>This code gives access to this conversation only. It does not verify an account or authorise deletion.</p><ol class="case-messages">${rows.map(m => `<li><p><strong>${e(m.from)}</strong> · ${e(m.at)}</p><p class="preserve-text">${e(m.text)}</p></li>`).join("")}</ol>`;
  if (d.hasMore && rows.length) body += await caseReadForm(env, nonce, c, String(rows[0]!.messageId));
  if (d.status !== "completed" && d.status !== "declined") body += `<form method="post" action="/privacy/case/reply">${hidden("csrf", await formToken(env, nonce, "case-reply", binding(c)))}${hidden("caseId", c.caseId)}${hidden("caseCode", c.caseCode)}${hidden("messageId", randomCode(16))}<label>Reply<textarea name="text" required maxlength="2000" rows="5"></textarea></label><button type="submit">Send reply</button></form>`;
  body += await caseReadForm(env, nonce, c) + controls;
  return htmlResponse(request, "Your private case", body);
}
async function showHistory(request: Request, env: Env, nonce: string, result: Response, user: { discord_id: string; session_version: number }, resumeCursor?: string): Promise<Response> {
  const data = await result.json() as OwnActionHistoryView & { error?: string; message?: string };
  const b = `${user.discord_id}:${user.session_version}`;
  const post = async (mode: "history" | "download", cursor: string, label: string) =>
    `<form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", b))}${hidden("mode", mode)}${hidden("actions", cursor)}<button type="submit">${e(label)}</button></form>`;
  const saved = (cursor: string, label: string) =>
    `<label>${e(label)}<textarea readonly rows="2" spellcheck="false" autocomplete="off">${e(cursor)}</textarea></label>`;
  const resumeHelp = `<p>Keep continuation values privately. To resume after the rate window or an expired form, reopen <a href="/privacy/account">Account data controls</a>, paste a saved value into Saved action continuation, and choose View my action history or Download my curated copy. Use the same original site session before it expires. Never put a continuation in an address or share it.</p>`;
  if (!result.ok) {
    let body = `<p>${e(data.error ?? "unconfirmed")}. ${e(data.message ?? "No history completion is claimed. Reopen the account controls.")}</p>`;
    if (result.status === 429 && resumeCursor && actionCursorShape(resumeCursor)) {
      body += resumeHelp + saved(resumeCursor, "Saved history-page continuation");
      body += await post("history", resumeCursor, "Retry this history page after the rate window");
    }
    return htmlResponse(request, "History not available", body + controls, result.status, formCookie(nonce));
  }
  const page = data.actions, capture = page.capture;
  let body = `<p>This is a curated partial view of your own retained action history, not a copy of every store or an erasure.</p><p>Captured range: ${e(capture.at)}. ${e(capture.delivered)} of ${e(capture.count)} included records reached; ${e(capture.remaining)} remain. This page was read at ${e(data.generatedAt)}.</p><ol>${page.entries.map(row => `<li>${e(row.at)} · ${e(row.action)}</li>`).join("")}</ol><p>Each view or download counts toward five copy reads per hour. A current-page JSON download freshly reads its other sections at that download's generatedAt; this view does not prove a file was saved.</p>`;
  body += resumeHelp + saved(page.currentCursor, "Current-page continuation");
  body += await post("download", page.currentCursor, "Download this page in my curated copy");
  if (page.nextCursor) {
    body += saved(page.nextCursor, "Next-page continuation");
    body += await post("history", page.nextCursor, "Next history page");
  } else body += "<p>The included retained action range has been traversed. This does not claim an all-store copy.</p>";
  return htmlResponse(request, "Your action history", body + controls, 200, formCookie(nonce));
}

async function showEventChanges(request: Request, env: Env, nonce: string, result: Response, user: { discord_id: string; session_version: number }, resumeCursor?: string): Promise<Response> {
  const data = await result.json() as OwnEventChangeHistoryView & { error?: string; message?: string };
  const b = `${user.discord_id}:${user.session_version}:event_changes`;
  const post = async (mode: "history" | "download", cursor: string, label: string) =>
    `<form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", b))}${hidden("collection", "event_changes")}${hidden("mode", mode)}${hidden("eventChanges", cursor)}<button type="submit">${e(label)}</button></form>`;
  const saved = (cursor: string, label: string) => `<label>${e(label)}<textarea readonly rows="2" spellcheck="false" autocomplete="off">${e(cursor)}</textarea></label>`;
  const resumeHelp = `<p>Keep event-change continuations privately. Reopen <a href="/privacy/account">Account data controls</a>, paste into Saved event-change continuation, and use the event-change buttons with the same original site session before it expires. Never put a continuation in an address or share it.</p>`;
  if (!result.ok) {
    let body = `<p>${e(data.error ?? "unconfirmed")}. ${e(data.message ?? "No event-change completion is claimed. Reopen the account controls.")}</p>`;
    if (result.status === 429 && resumeCursor && eventChangeCursorShape(resumeCursor)) body += resumeHelp + saved(resumeCursor, "Saved event-change continuation") + await post("history", resumeCursor, "Retry this event-change page after the rate window");
    return htmlResponse(request, "Event-change history not available", body + controls, result.status, formCookie(nonce));
  }
  const page = data.eventChanges, capture = page.capture;
  let body = `<p>This curated partial view includes retained event-change records where your account was the recorded actor. It does not include other people's changes to your events, removed records, or arbitrary event text.</p><p>Captured range: ${e(capture.at)}. ${e(capture.delivered)} of ${e(capture.count)} included records reached; ${e(capture.remaining)} remain. This page was read at ${e(data.generatedAt)}.</p><ol>${page.entries.map(row => `<li>${e(row.at)} · ${e(row.eventId)} · ${e(row.action)} · ${row.changedFieldNames.map(e).join(", ") || "no changed field names"}</li>`).join("")}</ol><p>Action views, event-change views and downloads share about five reads per hour. A JSON download reads other sections freshly; this view is not an immutable snapshot or proof that a file was saved.</p>`;
  body += resumeHelp + saved(page.currentCursor, "Current event-change page continuation") + await post("download", page.currentCursor, "Download this event-change page in my curated copy");
  if (page.nextCursor) body += saved(page.nextCursor, "Next event-change page continuation") + await post("history", page.nextCursor, "Next event-change history page");
  else body += "<p>The included retained event-change range has been traversed. This does not claim an all-store copy.</p>";
  return htmlResponse(request, "Your event-change history", body + controls, 200, formCookie(nonce));
}

async function showContributionDecisions(request: Request, env: Env, nonce: string, result: Response, user: { discord_id: string; session_version: number }, resumeCursor?: string): Promise<Response> {
  const data = await result.json() as OwnContributionDecisionHistoryView & { error?: string; message?: string };
  const b = `${user.discord_id}:${user.session_version}:contribution_decisions`;
  const post = async (mode: "history" | "download", cursor: string, label: string) =>
    `<form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", b))}${hidden("collection", "contribution_decisions")}${hidden("mode", mode)}${hidden("contributionDecisions", cursor)}<button type="submit">${e(label)}</button></form>`;
  const saved = (cursor: string, label: string) => `<label>${e(label)}<textarea readonly rows="2" spellcheck="false" autocomplete="off">${e(cursor)}</textarea></label>`;
  const resumeHelp = `<p>Keep contribution-decision continuations privately. Reopen <a href="/privacy/account">Account data controls</a>, paste into Saved contribution-decision continuation, and use the contribution-decision buttons with the same original site session before it expires. Never put a continuation in an address or share it.</p>`;
  if (!result.ok) {
    let body = `<p>${e(data.error ?? "unconfirmed")}. ${e(data.message ?? "No contribution-decision completion is claimed. Reopen the account controls.")}</p>`;
    if (result.status === 429 && resumeCursor && contributionDecisionCursorShape(resumeCursor)) body += resumeHelp + saved(resumeCursor, "Saved contribution-decision continuation") + await post("history", resumeCursor, "Retry this contribution-decision page after the rate window");
    return htmlResponse(request, "Contribution-decision history not available", body + controls, result.status, formCookie(nonce));
  }
  const page = data.contributionDecisions, capture = page.capture;
  let body = `<p>This curated partial view includes retained contribution decisions naming your account as subject or explicitly recording it as a member/staff actor. A row matching both appears once. Only action, time and your relation are included; payment evidence, counterpart identities, arbitrary actor text and expired records are omitted.</p><p>Captured range: ${e(capture.at)}. ${e(capture.delivered)} of ${e(capture.count)} included records reached; ${e(capture.remaining)} remain. This page was read at ${e(data.generatedAt)}.</p><ol>${page.entries.map(row => `<li>${e(row.at)} · ${e(row.action)} · ${e(row.relation)}</li>`).join("")}</ol><p>All history views and downloads share about five reads per hour. A JSON download reads other sections freshly; counts and positions do not authenticate equal-count content changes, an immutable snapshot or a complete all-store copy.</p>`;
  body += resumeHelp + saved(page.currentCursor, "Current contribution-decision page continuation") + await post("download", page.currentCursor, "Download this contribution-decision page in my curated copy");
  if (page.nextCursor) body += saved(page.nextCursor, "Next contribution-decision page continuation") + await post("history", page.nextCursor, "Next contribution-decision history page");
  else body += "<p>The included retained contribution-decision range has been traversed. This does not claim an all-store copy.</p>";
  return htmlResponse(request, "Your contribution-decision history", body + controls, 200, formCookie(nonce));
}

async function accountPage(request: Request, env: Env, nonce: string): Promise<Response> {
  const user = await currentUser(env, request);
  let body = `<p>These controls concern your own data held by Olympus. They grant no guild or staff access. The separate account connection for privacy requests is not available yet.</p>`;
  if (user) {
    const b = `${user.discord_id}:${user.session_version}`;
    body += `<p>Your existing site session can read its curated partial copy, including when the account is denied, banned or has left the server. Each history view or JSON download uses one of five copy reads per hour. History completion covers only the retained captured action range and grants no guild access.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", b))}<label>Saved action continuation (optional)<input name="actions" maxlength="${ACTION_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my curated copy</button><button name="mode" value="history" type="submit">View my action history</button></form>`;
    body += `<h2>My event-change history</h2><p>Only retained changes recorded with your account as actor are included. These controls share the same five-read hourly budget with the action form above.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", `${b}:event_changes`))}${hidden("collection", "event_changes")}<label>Saved event-change continuation (optional)<input name="eventChanges" maxlength="${EVENT_CHANGE_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my event-change page in curated copy</button><button name="mode" value="history" type="submit">View my event-change history</button></form>`;
    body += `<h2>My contribution-decision history</h2><p>Retained decisions name your account as subject or explicitly record it as a member/staff actor. Only action, time and your relation are included. These controls share the same five-read hourly budget with the other account forms.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", `${b}:contribution_decisions`))}${hidden("collection", "contribution_decisions")}<label>Saved contribution-decision continuation (optional)<input name="contributionDecisions" maxlength="${CONTRIBUTION_DECISION_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my contribution-decision page in curated copy</button><button name="mode" value="history" type="submit">View my contribution-decision history</button></form>`;
  } else body += `<p>You have no current site session. <a href="/privacy/signin">Check identify-only sign-in availability</a>. You may contact the inbox without signing in.</p>`;
  body += `<h2>Deletion and unlink controls</h2><p>Automatic site-only erasure, full-tool erasure and local Battle.net unlink are not available yet. Contact the private inbox to request help from staff. This page does not change a Discord server ban or remove a connection stored by Discord.</p>`;
  for (const [action, label] of [["site-erase", "Site-only erasure"], ["full-erase", "Full-tool erasure"], ["bnet-unlink", "Local Battle.net unlink"]] as const) {
    body += `<form method="post" action="/privacy/account/${action}">${hidden("csrf", await formToken(env, nonce, action))}<button type="submit">Check ${e(label.toLowerCase())} availability</button></form>`;
  }
  return htmlResponse(request, "Account data controls", body + controls, 200, formCookie(nonce));
}

/** Canonical-site dispatch only (site.ts). Every response, including refusal/HEAD, is no-store/no-transform. */
export async function handlePolicyForms(request: Request, env: Env, path: string, schemaReady: boolean): Promise<Response | null> {
  const paths = ["/privacy/contact", "/privacy/case", "/privacy/case/reply", "/privacy/account", "/privacy/account/export", "/privacy/account/site-erase", "/privacy/account/full-erase", "/privacy/account/bnet-unlink", "/privacy/signin", "/privacy/callback"];
  if (!paths.includes(path)) return null;
  if (new URL(request.url).search && path !== "/privacy/callback") return htmlResponse(request, "Request refused", "<p>Use the form without a query string. Private codes must never appear in an address.</p>", 400);
  const m = request.method;
  if (!["GET", "HEAD", "POST"].includes(m)) { const r = htmlResponse(request, "Method not allowed", "<p>Use this page's form.</p>", 405); r.headers.set("Allow", "GET, HEAD, POST"); return r; }
  if (!schemaReady) return htmlResponse(request, "Temporarily unavailable", "<p>The database is updating. No request was submitted.</p>", 503);
  if (path === "/privacy/signin" || path === "/privacy/callback") return privacyIdentityRoute(request, env, path);
  if ((path.endsWith("/reply") || path.startsWith("/privacy/account/")) && m !== "POST") { const r = htmlResponse(request, "Method not allowed", "<p>Use the account or case form.</p>", 405); r.headers.set("Allow", "POST"); return r; }
  if (m === "HEAD") return htmlResponse(request, "Privacy controls", "");
  try {
    const nonce = formNonce(request) ?? randomCode();
    if (m === "GET" && path === "/privacy/contact") {
      if (!communityFeatures(env).has("privacy_intake") || !intakeOpen(env)) return htmlResponse(request, "Contact the privacy inbox", `<p>New requests are paused. Existing cases can still be read.</p>${controls}`, 503);
      const c = Object.freeze({ caseId: randomCode(16), caseCode: randomCode() });
      const form = `<p>This is a private manually reviewed conversation, not an automatic export or deletion. The owner monitors it each working day. Cases expire after ${e(intakeRetentionDays(env))} days of inactivity; reads do not extend them.</p><section class="receipt"><h2>Save these before submitting</h2><p>Case ID: <code>${e(c.caseId)}</code><br>Private code: <code>${e(c.caseCode)}</code></p><p>Keep both privately. They let you read replies even if submission's response is lost.</p></section><form method="post" action="/privacy/contact">${hidden("csrf", await formToken(env, nonce, "contact-create", binding(c)))}${hidden("caseId", c.caseId)}${hidden("caseCode", c.caseCode)}<label>Request type<select name="kind">${INTAKE_KINDS.map(k => `<option value="${k}">${k}</option>`).join("")}</select></label><label>Message<textarea name="details" required maxlength="2000" rows="6"></textarea></label><label>Account hint (optional)<input name="subjectHint" maxlength="64"></label><label>Character hint (optional)<input name="characterHint" maxlength="64"></label><button type="submit">Send message to the privacy inbox</button></form>`;
      return htmlResponse(request, "Contact the privacy inbox", form + controls, 200, formCookie(nonce));
    }
    if (m === "GET" && path === "/privacy/case") return htmlResponse(request, "Read an existing case", `<p>Enter the credentials you saved. They are sent in the form body and never in the address.</p>${await caseReadForm(env, nonce)}${controls}`, 200, formCookie(nonce));
    if (m === "GET" && path === "/privacy/account") return accountPage(request, env, nonce);
    if (m === "POST" && path === "/privacy/contact") {
      const f = await readForm(request, ["csrf", "caseId", "caseCode", "kind", "details", "subjectHint", "characterHint"]), c = credentials(f);
      await requireFormToken(env, request, field(f, "csrf", 160), "contact-create", binding(c));
      const kind = field(f, "kind", 16, true, true); if (!(INTAKE_KINDS as readonly string[]).includes(kind)) throw new FormError("invalid_form");
      const result = await intake(request, env, "/api/privacy/requests", { ...c, kind, details: field(f, "details", 2000), subjectHint: field(f, "subjectHint", 64, false, true), characterHint: field(f, "characterHint", 64, false, true) });
      if (!result.response.ok) return htmlResponse(request, "Request not confirmed", `<p>The intake did not confirm this request (${e(result.data.error)}). Keep the saved credentials; check the case before submitting again.</p>${await caseReadForm(env, nonce, c)}${controls}`, result.response.status);
      return htmlResponse(request, "Message received by the privacy inbox", `<p>Case <code>${e(c.caseId)}</code> was received. Status: ${e(result.data.status)}. Inactivity deadline: ${e(result.data.retentionDeadline)}.</p><p>No account was exported, erased or granted access.</p>${await caseReadForm(env, nonce, c)}${controls}`, result.response.status);
    }
    if (m === "POST" && path === "/privacy/case") {
      const f = await readForm(request, CASE_FIELDS), c = credentials(f);
      await requireFormToken(env, request, field(f, "csrf", 160), "case-read");
      const before = field(f, "before", 22, false, true); if (before && !ID.test(before)) throw new FormError("invalid_form");
      return showCase(request, env, nonce, c, before || undefined);
    }
    if (m === "POST" && path === "/privacy/case/reply") {
      const f = await readForm(request, ["csrf", "caseId", "caseCode", "messageId", "text"]), c = credentials(f);
      await requireFormToken(env, request, field(f, "csrf", 160), "case-reply", binding(c));
      const messageId = field(f, "messageId", 22, true, true); if (!ID.test(messageId)) throw new FormError("invalid_form");
      const result = await intake(request, env, "/api/privacy/requests/reply", { ...c, messageId, text: field(f, "text", 2000) });
      if (!result.response.ok) return htmlResponse(request, "Reply not confirmed", `<p>The intake did not confirm the reply (${e(result.data.error)}). Read the case before retrying; no account action was performed.</p>${await caseReadForm(env, nonce, c)}${controls}`, result.response.status);
      return showCase(request, env, nonce, c);
    }
    if (m === "POST" && path === "/privacy/account/export") {
      const f = await readForm(request, ["csrf", "actions", "mode", "collection", "eventChanges", "contributionDecisions"]);
      const collection = Object.hasOwn(f, "collection") ? field(f, "collection", 22, true, true) : "actions";
      if (collection !== "actions" && collection !== "event_changes" && collection !== "contribution_decisions") throw new FormError("invalid_form");
      const eventCollection = collection === "event_changes", decisionCollection = collection === "contribution_decisions";
      const key = decisionCollection ? "contributionDecisions" : eventCollection ? "eventChanges" : "actions";
      if (["actions", "eventChanges", "contributionDecisions"].some(other => other !== key && Object.hasOwn(f, other))) throw new FormError("invalid_form");
      const mode = field(f, "mode", 8, false, true) || "download";
      if (mode !== "history" && mode !== "download") throw new FormError("invalid_form");
      const user = await currentUser(env, request);
      if (!user) return htmlResponse(request, "Session unavailable", "<p>Your current site session is no longer valid. No copy was made.</p>" + controls, 401);
      const id = String(user.discord_id), version = Number(user.session_version);
      await requireFormToken(env, request, field(f, "csrf", 160), "copy-export", `${id}:${version}${decisionCollection ? ":contribution_decisions" : eventCollection ? ":event_changes" : ""}`);
      const cursor = field(f, key, decisionCollection ? CONTRIBUTION_DECISION_CURSOR_LIMIT : eventCollection ? EVENT_CHANGE_CURSOR_LIMIT : ACTION_CURSOR_LIMIT, false, true);
      if (cursor && !(decisionCollection ? contributionDecisionCursorShape(cursor) : eventCollection ? eventChangeCursorShape(cursor) : actionCursorShape(cursor))) throw new FormError("invalid_form");
      const result = decisionCollection
        ? mode === "history" ? await exportMyContributionDecisions(request, env, user, cursor || undefined) : await exportMyData(request, env, user, undefined, undefined, cursor || undefined)
        : eventCollection
          ? mode === "history" ? await exportMyEventChanges(request, env, user, cursor || undefined) : await exportMyData(request, env, user, undefined, cursor || undefined)
          : mode === "history" ? await exportMyHistory(request, env, user, cursor || undefined) : await exportMyData(request, env, user, cursor || undefined);
      if (mode === "history") return decisionCollection
        ? showContributionDecisions(request, env, nonce, result, { discord_id: id, session_version: version }, cursor || undefined)
        : eventCollection
          ? showEventChanges(request, env, nonce, result, { discord_id: id, session_version: version }, cursor || undefined)
          : showHistory(request, env, nonce, result, { discord_id: id, session_version: version }, cursor || undefined);
      result.headers.set("Referrer-Policy", "no-referrer");
      return result;
    }

    if (m === "POST" && path.startsWith("/privacy/account/")) {
      const action = path.slice("/privacy/account/".length) as FormPurpose;
      const f = await readForm(request, ["csrf"]); await requireFormToken(env, request, field(f, "csrf", 160), action);
      return htmlResponse(request, "Account action unavailable", `<section class="receipt"><p>Status: <strong>not performed</strong>. This automatic control is not available yet. Contact the private inbox for staff help. No rows were deleted, no roles changed and no remote connection removed.</p></section>${controls}`, 503);
    }
    return htmlResponse(request, "Method not allowed", "<p>Use the form provided on this page.</p>", 405);
  } catch (error) {
    if (error instanceof FormError) return htmlResponse(request, "Request refused", `<p>${e(error.code)}. No account action was performed. Reopen the form and try again.</p>${controls}`, error.status);
    // A lost database response can leave an admitted case/message. Never turn uncertainty into a false rollback claim.
    return htmlResponse(request, "Outcome not confirmed", `<p>The service could not confirm the outcome. For a case submission or reply, keep the credentials and read the case before retrying. This interface does not perform account deletion.</p>${controls}`, 503);
  }
}
