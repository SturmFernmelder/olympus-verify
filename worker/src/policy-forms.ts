/** Short script-free contact/case interface over the existing case engine. Conversation access is not account authority. */
import type { Env } from "./env";
import { currentUser, PAGE_VERSION } from "./site-core";
import { handlePrivacyIntakeForm, INTAKE_KINDS, intakeOpen, intakeRetentionDays } from "./community-privacy-intake";
import { communityFeatures } from "./community-context";
import { ACTION_CURSOR_LIMIT, actionCursorShape, EVENT_CHANGE_CURSOR_LIMIT, eventChangeCursorShape, exportMyData, exportMyHistory, exportMyEventChanges, type OwnActionHistoryView, type OwnEventChangeHistoryView, CONTRIBUTION_DECISION_CURSOR_LIMIT, contributionDecisionCursorShape, exportMyContributionDecisions, type OwnContributionDecisionHistoryView } from "./site-export";
import { escapeText as e, htmlResponse } from "./policy-render";
import { field, FormError, formCookie, formNonce, formToken, hidden, randomCode, readForm, requireFormToken, type FormPurpose } from "./policy-form-core";
import { privacyIdentityRoute } from "./privacy-identity";
import "./privacy-access-data";
import { beginPrivacyAccess, finishPrivacyAccess, privacyAccessPage, privacyAccessRefusal } from "./privacy-access";
import { exportPrivacyAccess } from "./privacy-access-export";
import { erasePrivacyAccess } from "./privacy-access-erasure";
import { requestServingErasure, erasureRequestStatus, type ErasureRequestResult } from './privacy-serving-authority';

const ID = /^[A-Za-z0-9_-]{22}$/, CODE = /^[A-Za-z0-9_-]{43}$/;
const CASE_FIELDS = ["csrf", "caseId", "caseCode", "before"] as const;
const controls = `<section class="data-controls"><h2>Privacy and account data</h2><p><a href="/privacy/account">Account data controls</a> · <a href="/privacy/contact">Account help</a> · <a href="/privacy/case">Read an existing case</a></p></section>`;
const erasurePaused = '<p>Automatic serving-account erasure is temporarily paused while Olympus checks older account records. Downloads and checks of existing erasure requests remain available. Ask an Olympus officer for attended help. Reconnecting Discord does not enable erasure.</p>';
function erasureRequest(request:Request):Request {
 const headers=new Headers(request.headers);headers.set('X-Olympus',PAGE_VERSION);
 return new Request(new URL('/api/me/erasure',request.url),{method:'POST',headers});
}
async function erasureStatusForm(env:Env,nonce:string,operationId='',statusToken=''):Promise<string>{
 return `<form method="post" action="/privacy/account/erasure-status">${hidden('csrf',await formToken(env,nonce,'erasure-status'))}<label>Erasure request ID<input name="operationId" value="${e(operationId)}" required pattern="[a-f0-9]{32}" maxlength="32" autocomplete="off"></label><label>Private status code (optional while the original session is current)<textarea name="statusToken" maxlength="1024" rows="3" autocomplete="off">${e(statusToken)}</textarea></label><button type="submit">Check my erasure request</button></form>`;
}
async function showErasureStatus(request:Request,env:Env,nonce:string,operationId:string,status:ErasureRequestResult|null):Promise<Response>{
 const body=status?`<p>Request <code>${e(operationId)}</code>: <strong>${e(status.state)}</strong>.</p><p>${status.state==='complete'?'Serving account records were erased after the bot-managed Guild Member role was confirmed absent.':'The request is queued or held; account erasure is not complete.'}</p><p>Manually assigned staff roles are human-managed. External Discord cleanup has ${e(status.externalCleanup.known)} known pointer(s), ${e(status.externalCleanup.unknown)} unknown outcome(s), and ${e(status.externalCleanup.expiredUnresolved)} unresolved record(s) past their original deadline. Unknown or expired unresolved custody can need attended resolution; it is not silently marked erased. Private recovery exports and Cloudflare recovery history have separate custody. This result does not mean every copy was erased.</p><p>Save this private status code; it can read only this request until its original deadline, without restoring account access. A held request that reaches that deadline needs attended resolution; its authority is not renewed.</p><pre>${e(status.statusToken)}</pre>`:`<p>The service could not confirm this request. Keep the same request ID and check again; do not submit a different erasure request to resolve a lost response.</p>`;
 return htmlResponse(request,'Account erasure status',body+await erasureStatusForm(env,nonce,operationId,status?.statusToken??'')+controls,status?200:503,formCookie(nonce));
}
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
  let body = `<p>These controls concern your own data held by Olympus. They grant no guild or staff access. ${env.PRIVACY_ACCESS_ENABLED === 'true' ? '<a href="/privacy/access">Connect Discord for privacy actions</a>, including without a current website account or server membership.' : 'The separate account connection for privacy requests is not available yet.'}</p>`;
  if(env.PRIVACY_ERASURE_ENABLED!=='true')body+=erasurePaused;
  if (user) {
    const b = `${user.discord_id}:${user.session_version}`;
    body += `<p>Your existing site session can read its curated partial copy, including when the account is denied, banned or has left the server. Each history view or JSON download uses one of five copy reads per hour. History completion covers only the retained captured action range and grants no guild access.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", b))}<label>Saved action continuation (optional)<input name="actions" maxlength="${ACTION_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my curated copy</button><button name="mode" value="history" type="submit">View my action history</button></form>`;
    body += `<h2>My event-change history</h2><p>Only retained changes recorded with your account as actor are included. These controls share the same five-read hourly budget with the action form above.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", `${b}:event_changes`))}${hidden("collection", "event_changes")}<label>Saved event-change continuation (optional)<input name="eventChanges" maxlength="${EVENT_CHANGE_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my event-change page in curated copy</button><button name="mode" value="history" type="submit">View my event-change history</button></form>`;
    body += `<h2>My contribution-decision history</h2><p>Retained decisions name your account as subject or explicitly record it as a member/staff actor. Only action, time and your relation are included. These controls share the same five-read hourly budget with the other account forms.</p><form method="post" action="/privacy/account/export">${hidden("csrf", await formToken(env, nonce, "copy-export", `${b}:contribution_decisions`))}${hidden("collection", "contribution_decisions")}<label>Saved contribution-decision continuation (optional)<input name="contributionDecisions" maxlength="${CONTRIBUTION_DECISION_CURSOR_LIMIT}" autocomplete="off"></label><button name="mode" value="download" type="submit">Download my contribution-decision page in curated copy</button><button name="mode" value="history" type="submit">View my contribution-decision history</button></form>`;
  } else body += env.PRIVACY_ACCESS_ENABLED === 'true'
    ? '<p>You have no current site session. <a href="/privacy/access">Connect your Discord account for privacy actions</a>; this also works without a website account or current server membership.</p>'
    : '<p>You have no current site session. <a href="/privacy/signin">Check identify-only sign-in availability</a>. You may contact the inbox without signing in.</p>';
  if(user&&env.PRIVACY_ERASURE_ENABLED==='true'){
   const operationId=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
   body+=`<h2>Erase my serving account</h2><p>This closes ordinary account access immediately, then removes the bot-managed Guild Member role before erasing serving account records. Staff roles need a human administrator. Active safety cases, unresolved external-message cleanup, and private recovery copies have separate retention. A minimized rejected-application/membership marker may last 12 months from the original rejection; a separate account ID and retired-generation replay record lasts 366 days for restore suppression.</p><p>Save this request ID before submitting: <code>${e(operationId)}</code>.</p><form method="post" action="/privacy/account/full-erase">${hidden('csrf',await formToken(env,nonce,'full-erase',`${user.discord_id}:${user.session_version}`))}${hidden('operationId',operationId)}<label><input type="checkbox" name="confirm" value="erase" required> I request erasure and understand that Guild Member access ends.</label><button type="submit">Request serving account erasure</button></form>`;
  }
  body+=`<h2>Check an erasure request</h2>${await erasureStatusForm(env,nonce)}`;
  body += `<h2>Other deletion and unlink controls</h2><p>${env.PRIVACY_ERASURE_ENABLED==='true'?'Serving-account erasure covers the attributable bot and website records. Separate site-only erasure and local Battle.net unlink are not offered here.':'Automatic site-only erasure, full-tool erasure and local Battle.net unlink are not available yet.'} Ask an Olympus officer for attended help. This page does not change a Discord server ban or remove a connection stored by Discord.</p>`;
  return htmlResponse(request, "Account data controls", body + controls, 200, formCookie(nonce));
}

/** Canonical-site dispatch only (site.ts). Every response, including refusal/HEAD, is no-store/no-transform. */
export async function handlePolicyForms(request: Request, env: Env, path: string, schemaReady: boolean): Promise<Response | null> {
  const paths = ["/privacy/contact", "/privacy/case", "/privacy/case/reply", "/privacy/account", "/privacy/account/export", "/privacy/account/site-erase", "/privacy/account/full-erase", "/privacy/account/erasure-status", "/privacy/account/bnet-unlink", "/privacy/signin", "/privacy/callback", "/privacy/access", "/privacy/access/export", "/privacy/access/erasure"];
  if (!paths.includes(path)) return null;
  if (new URL(request.url).search && path !== "/privacy/callback") return htmlResponse(request, "Request refused", "<p>Use the form without a query string. Private codes must never appear in an address.</p>", 400);
  const m = request.method;
  if (!["GET", "HEAD", "POST"].includes(m)) { const r = htmlResponse(request, "Method not allowed", "<p>Use this page's form.</p>", 405); r.headers.set("Allow", "GET, HEAD, POST"); return r; }
  if (!schemaReady) return htmlResponse(request, "Temporarily unavailable", "<p>The database is updating. No request was submitted.</p>", 503);
  if (env.PRIVACY_ACCESS_ENABLED === 'true' && ['/privacy/signin','/privacy/callback','/privacy/access','/privacy/access/export','/privacy/access/erasure'].includes(path)) {
    if (m === 'HEAD' && path === '/privacy/access') return htmlResponse(request,'Privacy account connection','');
    const expected = path === '/privacy/access/export' || path === '/privacy/access/erasure' ? 'POST' : 'GET';
    if (m !== expected) { const out=htmlResponse(request,'Method not allowed','<p>Use the supplied privacy form.</p>',405);out.headers.set('Allow',expected);return out; }
    try {
      if (path === '/privacy/signin') return await beginPrivacyAccess(request,env);
      if (path === '/privacy/callback') return await finishPrivacyAccess(request,env);
      if (path === '/privacy/access/export') return await exportPrivacyAccess(request,env);
      if (path === '/privacy/access/erasure') return await erasePrivacyAccess(request,env);
      return await privacyAccessPage(request,env);
    } catch(error) { return privacyAccessRefusal(request,error); }
  }
  if (path.startsWith('/privacy/access')) return htmlResponse(request,'Privacy connection unavailable','<p>This account connection is not enabled.</p>',503);
  if (path === "/privacy/signin" || path === "/privacy/callback") return privacyIdentityRoute(request, env, path);
  if ((path.endsWith("/reply") || path.startsWith("/privacy/account/")) && m !== "POST") { const r = htmlResponse(request, "Method not allowed", "<p>Use the account or case form.</p>", 405); r.headers.set("Allow", "POST"); return r; }
  if (m === "HEAD") return htmlResponse(request, "Privacy controls", "");
  try {
    const nonce = formNonce(request) ?? randomCode();
    if(m==='POST'&&path==='/privacy/account/full-erase'&&env.PRIVACY_ERASURE_ENABLED!=='true')return htmlResponse(request,'Erasure temporarily unavailable',erasurePaused+'<p>No new erasure request was submitted by this attempt. Deletion was not performed.</p>'+controls,503);
    if ((m === 'GET' || m === 'POST') && path === '/privacy/contact' && env.PRIVACY_ACCESS_ENABLED === 'true' && env.PRIVACY_INTAKE_ENABLED !== 'true') {
      const introduction=env.PRIVACY_ERASURE_ENABLED==='true'?'<p>The request inbox has been replaced by account data controls. Connect your own Discord account to download retained records or request serving-account erasure; this grants no guild access.</p>':'<p>The request inbox has been replaced by account data controls. Connect your own Discord account to download retained records; this grants no guild access.</p>'+erasurePaused;
      return htmlResponse(request,'Privacy account controls',introduction+'<p><a href="/privacy/access">Open account data controls</a> · <a href="/privacy/case">Read an existing case</a></p><p>Existing cases keep their original inactivity deadlines. Unattributable text, unresolved provider outcomes and human-managed staff permissions may require attended handling.</p>',m === 'GET' ? 200 : 503);
    }
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

    if(m==='POST'&&path==='/privacy/account/erasure-status'){
      const f=await readForm(request,['csrf','operationId','statusToken']);await requireFormToken(env,request,field(f,'csrf',160),'erasure-status');
      const operationId=field(f,'operationId',32,true,true),token=field(f,'statusToken',1024,false,true);if(!/^[a-f0-9]{32}$/.test(operationId))throw new FormError('invalid_form');
      const status=await erasureRequestStatus(env,erasureRequest(request),operationId,token||undefined);
      return showErasureStatus(request,env,nonce,operationId,status);
    }
    if(m==='POST'&&path==='/privacy/account/full-erase'&&env.PRIVACY_ERASURE_ENABLED==='true'){
      const f=await readForm(request,['csrf','operationId','confirm']),user=await currentUser(env,request);
      if(!user)throw new FormError('session_unavailable',401);
      await requireFormToken(env,request,field(f,'csrf',160),'full-erase',`${user.discord_id}:${user.session_version}`);
      const operationId=field(f,'operationId',32,true,true);if(!/^[a-f0-9]{32}$/.test(operationId)||field(f,'confirm',5,true,true)!=='erase')throw new FormError('invalid_form');
      const bridge=erasureRequest(request);await requestServingErasure(env,bridge,operationId);
      return showErasureStatus(request,env,nonce,operationId,await erasureRequestStatus(env,bridge,operationId).catch(()=>null));
    }
    if (m === "POST" && path.startsWith("/privacy/account/")) {
      const action = path.slice("/privacy/account/".length) as FormPurpose;
      const f = await readForm(request, ["csrf"]); await requireFormToken(env, request, field(f, "csrf", 160), action);
      return htmlResponse(request, "Account action unavailable", `<section class="receipt"><p>Status: <strong>not performed</strong>. This automatic control is unavailable. Use <a href="/privacy/contact">Account help</a> for the available controls, or ask an Olympus officer for attended help. No rows were deleted, no roles changed and no remote connection removed.</p></section>${controls}`, 503);
    }
    return htmlResponse(request, "Method not allowed", "<p>Use the form provided on this page.</p>", 405);
  } catch (error) {
    if (error instanceof FormError) return htmlResponse(request, "Request refused", `<p>${e(error.code)}. No account action was performed. Reopen the form and try again.</p>${controls}`, error.status);
    // A lost database response can leave an admitted case/message. Never turn uncertainty into a false rollback claim.
    return htmlResponse(request, "Outcome not confirmed", `<p>The service could not confirm the outcome. Keep the saved case credentials or erasure request ID and read its status before retrying.</p>${controls}`, 503);
  }
}
