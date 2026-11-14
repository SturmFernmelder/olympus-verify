'use strict';
// sync503 (14 Nov 2026): the page side of the refused-read fix (SYNC503-DESIGN.md draft 3, sections 2.6 and 2.7). Real app.js,
// real Worker and SQLite from the existing frontend fixture; the 503 answers are injected before the Worker, as the new Worker
// sends them: {"error":"read_unavailable","message":"The site could not read its data for a moment. Please try again."}.
// Proves: the page's own sentence for read_unavailable on a read wherever the page shows the answer's message (explain,
// explainAdmin, explainRead, err.message); a write answered with read_unavailable keeps the wording for an unknown outcome;
// the application view's failure text without "No changes were made."; its Try again button reloads the view once per click,
// not twice on a double click, never by itself, and is absent for a held decision and where the existing buttons apply;
// the view's other branches (403, 409 held, review_changed, 401, the kept note) are unchanged. No browser engine is used.
// Run from the worker folder: node tests/sync503_page_test.cjs
const fs503 = require('node:fs'), path503 = require('node:path'), { Module: Module503 } = require('node:module');
const fixture503 = fs503.readFileSync(path503.join(__dirname, 'frontend_check.cjs'), 'utf8');
const cuts503 = [...fixture503.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (cuts503.length !== 1) throw Error('sync503_original_frontend_fixture_boundary');
const body503 = String.raw`
const SENTENCE503 = "The site could not read its data for a moment. Please try again.";
const VIEW_TEXT503 = "This application could not be loaded. Return to the list and try again.";
const UNKNOWN_WRITE503 = "The site had a problem answering, so the outcome is not known. Check the current state before acting again.";
const json503 = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const unavailable503 = message => json503(503, message === undefined ? { error: "read_unavailable" } : { error: "read_unavailable", message });
const MESSAGES503 = [["the Worker's own sentence", SENTENCE503], ["another server text", "PRIVATE_UPSTREAM_TEXT_503"], ["no message", undefined]];
// One ordered record of every request the page makes (the intercept sees each one first) and of each injected answer.
const log503 = [];
const pause503 = ms => new Promise(resolve => setTimeout(resolve, ms));
const fetchesSince = mark => log503.slice(mark).filter(e => e.kind === "fetch");
const DETAIL503 = "/api/admin/applications/" + OTHER;
const viewReads503 = entries => entries.filter(e => e.pathname === DETAIL503 || e.pathname.startsWith("/api/admin/users/" + OTHER + "/decision-target?"));
const recorder503 = (page) => {
  const state = { fail: null };
  page.intercept((pathname, init) => {
    log503.push({ kind: "fetch", pathname, method: init.method || "GET" });
    const early = state.fail ? state.fail(pathname, init) : null;
    if (early) log503.push({ kind: "answer", pathname });
    return early;
  });
  return state;
};
const toasts503 = page => page.document.body.querySelectorAll(".toast").map(t => t.dataset.message);
(async () => {
  await siteUser(MEMBER, { global_name: "Mia" }); await character(MEMBER, "Mia One", "Player-1-0001");
  await siteUser(OTHER, { global_name: "Oz" }); await character(OTHER, "Oz Two", "Player-1-0002");
  await siteUser(STAFF, { global_name: "Vik" });
  await fixtureRun("INSERT INTO site_applications (discord_id,position,board_at,answers,status,created_at,updated_at) VALUES (?,'officer',?,'{}','submitted',?,?)", OTHER, now, now, now);
  const staff = await openPage(STAFF);
  const S503 = recorder503(staff);

  console.log("\n== 1. read_unavailable on a read: the page's sentence wherever the answer's message is shown ==");
  for (const [label, message] of MESSAGES503) {
    // explain() with a fallback: the audit log.
    S503.fail = pathname => pathname.startsWith("/api/admin/audit-log?") ? unavailable503(message) : null;
    await staff.go("#/"); await staff.go("#/admin/audit");
    await waitFor(() => !!staff.app.querySelector("p.err"), "sync503 audit failure " + label);
    const line = staff.app.querySelector("p.err");
    check("explain (audit log), " + label + ": exactly the page's sentence", !!line && line.textContent === SENTENCE503 && !staff.app.textContent.includes("PRIVATE_UPSTREAM_TEXT_503") && !staff.app.textContent.includes("read_unavailable"), line && line.textContent);
    // err.message through showError: the applications list.
    S503.fail = pathname => pathname.startsWith("/api/admin/applications?") ? unavailable503(message) : null;
    await staff.go("#/"); await staff.go("#/admin/applications");
    await waitFor(() => !!byText(staff.app, "h2", "Something went wrong"), "sync503 list failure " + label);
    const said = byText(staff.app, "h2", "Something went wrong")?.closest("section")?.querySelector("p");
    check("err.message (showError, applications list), " + label + ": exactly the page's sentence", !!said && said.textContent === SENTENCE503 && !staff.app.textContent.includes("PRIVATE_UPSTREAM_TEXT_503"), said && said.textContent);
    // explainAdmin: the officer digest.
    S503.fail = pathname => pathname === "/api/admin/community/digest" ? unavailable503(message) : null;
    await staff.go("#/"); await staff.go("#/admin/community");
    await waitFor(() => !!byText(staff.app, "h2", "Officer digest") && !!staff.app.querySelector(".notice-box.warn p"), "sync503 digest failure " + label);
    const digest = byText(staff.app, "h2", "Officer digest")?.closest("section")?.querySelector(".notice-box.warn p");
    check("explainAdmin (officer digest), " + label + ": exactly the page's sentence", !!digest && digest.textContent === SENTENCE503 && !staff.app.textContent.includes("PRIVATE_UPSTREAM_TEXT_503"), digest && digest.textContent);
  }
  // Review round: another 503 answer to a read keeps its own words; only read_unavailable gets the page's sentence.
  for (const code of ["erasure_held", "write_admission_held"]) {
    const own = "PRIVATE_OWN_WORDS_" + code;
    S503.fail = pathname => pathname.startsWith("/api/admin/audit-log?") ? json503(503, { error: code, message: own }) : null;
    await staff.go("#/"); await staff.go("#/admin/audit");
    await waitFor(() => !!staff.app.querySelector("p.err"), "sync503 audit failure " + code);
    const line = staff.app.querySelector("p.err");
    S503.fail = pathname => pathname.startsWith("/api/admin/applications?") ? json503(503, { error: code, message: own }) : null;
    await staff.go("#/"); await staff.go("#/admin/applications");
    await waitFor(() => !!byText(staff.app, "h2", "Something went wrong"), "sync503 list failure " + code);
    const said = byText(staff.app, "h2", "Something went wrong")?.closest("section")?.querySelector("p");
    check("a GET answered 503 " + code + " keeps its own words through explain (audit log) and showError (applications list), not the read sentence", line?.textContent === own && said?.textContent === own && !staff.app.textContent.includes(SENTENCE503), (line && line.textContent) + " | " + (said && said.textContent));
  }
  S503.fail = null;
  // explainRead (readFailureBox): a member's own profile.
  const member = await openPage(MEMBER);
  const M503 = recorder503(member);
  for (const [label, message] of MESSAGES503) {
    M503.fail = pathname => pathname === "/api/community/profile" ? unavailable503(message) : null;
    await member.go("#/"); await member.go("#/community/profile");
    await waitFor(() => !!byText(member.app, "h2", "My profile") && !!member.app.querySelector(".notice-box.warn p"), "sync503 profile failure " + label);
    const box = byText(member.app, "h2", "My profile")?.closest("section")?.querySelector(".notice-box.warn");
    check("explainRead (readFailureBox, my profile), " + label + ": exactly the page's sentence and the existing Try again", box?.querySelector("p")?.textContent === SENTENCE503 && !!byText(box, "button", "Try again") && !member.app.textContent.includes("PRIVATE_UPSTREAM_TEXT_503"), box && box.textContent);
  }
  M503.fail = null;

  console.log("\n== 2. read_unavailable on a write: never worded as retryable ==");
  const HOLD503 = { id: 7, decidedAt: now, from: "Oz Two", to: "Oz Three", discordId: OTHER };
  for (const [label, message] of MESSAGES503) {
    let posts = 0;
    S503.fail = (pathname, init) => {
      if (pathname === "/api/admin/renames" && (init.method || "GET") === "GET") return json503(200, { openHolds: [HOLD503], renames: [] });
      if (pathname === "/api/admin/renames/7/cancel") { posts++; return unavailable503(message); }
      return null;
    };
    await staff.go("#/"); await staff.go("#/admin/renames");
    await waitFor(() => !!byText(staff.app, "button", "Withdraw the decision"), "sync503 renames " + label);
    const before = toasts503(staff).length;
    byText(staff.app, "button", "Withdraw the decision").click();
    await waitFor(() => !!byText(staff.document.body, "button", "Withdraw"), "sync503 confirm " + label);
    byText(staff.document.body, "button", "Withdraw").click();
    await waitFor(() => posts === 1 && toasts503(staff).length > before, "sync503 write failure " + label);
    const said = toasts503(staff);
    check("a POST answered 503 read_unavailable, " + label + ": the unknown-outcome wording, not the read sentence", posts === 1 && said.includes(UNKNOWN_WRITE503) && !said.some(t => t.includes("Please try again") || t.includes("PRIVATE_UPSTREAM_TEXT_503")) && !staff.document.body.textContent.includes(SENTENCE503), JSON.stringify(said));
    for (const t of staff.document.body.querySelectorAll(".toast")) t.parentNode.removeChild(t);
  }
  S503.fail = null;

  console.log("\n== 3. the application view: the failed read ==");
  S503.fail = pathname => pathname === DETAIL503 ? unavailable503(SENTENCE503) : null;
  await staff.go("#/"); await staff.go("#/admin/applications");
  await waitFor(() => !!staff.app.querySelector("table.admin-applications"), "sync503 application list");
  let mark = log503.length;
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened") && !!byText(staff.app, "button", "Try again"), "sync503 failed application view");
  const firstLoad = viewReads503(fetchesSince(mark));
  const answered = log503.findIndex((e, i) => i >= mark && e.kind === "answer");
  const box = () => byText(staff.app, "h2", "Application could not be opened")?.closest("section")?.querySelector(".notice-box.warn");
  check("the failed read shows the new sentence, keeps the heading and the way back", box()?.querySelector("p")?.textContent === VIEW_TEXT503 && !!byText(staff.app, "a", "Back to all applications"), box() && box().textContent);
  check("the view no longer says \"No changes were made.\" nor the old sentence", !staff.app.textContent.includes("No changes were made.") && !staff.app.textContent.includes("This application could not be read."));
  check("the box keeps its warning picture (the notice box is drawn as before)", !!box()?.querySelector("img") && APP_JS.includes('  const noticeBox = (kind, iconName, ...body) => h("div", { class: "notice-box " + kind }, iconName ? icon(iconName, "l") : null, h("div", null, ...body));'));
  check("exactly one Try again and no other button in the failed view", staff.app.querySelectorAll("button").filter(b => b.closest("section") === box()?.closest("section")).map(b => b.textContent).join("|") === "Try again", staff.app.querySelectorAll("button").map(b => b.textContent).join("|"));
  const shown503 = byText(staff.app, "button", "Try again");
  check("Try again is a native button of type button with its visible label: not hidden, not disabled, no tabindex", !!shown503 && shown503.tagName === "BUTTON" && shown503.getAttribute("type") === "button" && shown503.textContent === "Try again" && !shown503.hidden && !shown503.hasAttribute("hidden") && !shown503.disabled && !shown503.hasAttribute("disabled") && shown503.getAttribute("tabindex") === null && shown503.classList.contains("read-retry"), shown503 && JSON.stringify(shown503.attributes));
  check("the first load read the decision targets and the application once each, then stopped at the refused read", firstLoad.length >= 2 && firstLoad.filter(e => e.pathname === DETAIL503).length === 1 && firstLoad[firstLoad.length - 1].pathname === DETAIL503, JSON.stringify(firstLoad));
  check("no request after the refused answer while the box is drawn", answered >= 0 && fetchesSince(answered).length === 0, JSON.stringify(log503.slice(answered)));
  mark = log503.length; await pause503(1500);
  check("nothing repeats by itself: no request in 1.5 s after the failure", fetchesSince(mark).length === 0, JSON.stringify(fetchesSince(mark)));

  console.log("\n== 4. Try again: once per click, never twice, never by itself ==");
  let button = byText(staff.app, "button", "Try again");
  mark = log503.length; button.click();
  await waitFor(() => !!byText(staff.app, "button", "Try again") && byText(staff.app, "button", "Try again") !== button, "sync503 second failure");
  await pause503(300);
  const reload = viewReads503(fetchesSince(mark));
  check("one click reloads the view once: the same reads as the first load, in the same order, and nothing else", JSON.stringify(reload.map(e => e.pathname)) === JSON.stringify(firstLoad.map(e => e.pathname)) && fetchesSince(mark).length === firstLoad.length, JSON.stringify(fetchesSince(mark)));
  button = byText(staff.app, "button", "Try again");
  mark = log503.length; button.click(); button.click();
  await waitFor(() => !!byText(staff.app, "button", "Try again") && byText(staff.app, "button", "Try again") !== button, "sync503 third failure");
  await pause503(300);
  check("a double click reloads once", viewReads503(fetchesSince(mark)).filter(e => e.pathname === DETAIL503).length === 1 && fetchesSince(mark).length === firstLoad.length, JSON.stringify(fetchesSince(mark)));
  mark = log503.length; button.click(); await pause503(300);
  check("the earlier, replaced button does nothing", fetchesSince(mark).length === 0, JSON.stringify(fetchesSince(mark)));
  await waitFor(() => !!byText(staff.app, "button", "Try again"), "sync503 view settled");
  mark = log503.length; await pause503(3500);
  check("after the reloads nothing repeats by itself (3.5 s)", fetchesSince(mark).length === 0, JSON.stringify(fetchesSince(mark)));
  // Review round, live(): a Try again still attached when the view is no longer current (the route has changed and the
  // redraw has not run yet) asks for nothing of the view.
  const stale503 = byText(staff.app, "button", "Try again");
  mark = log503.length; staff.location.hash = "#/";
  const attached503 = !!stale503 && stale503.isConnected && !stale503.disabled;
  stale503.click();
  await pause503(300);
  check("a Try again clicked while still attached but no longer current (route changed) reads nothing of the view", attached503 && viewReads503(fetchesSince(mark)).length === 0, JSON.stringify(fetchesSince(mark)));
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened") && !!byText(staff.app, "button", "Try again"), "sync503 failed view reopened");
  S503.fail = null;
  mark = log503.length; byText(staff.app, "button", "Try again").click();
  await waitFor(() => !!byText(staff.app, "button", "Save note"), "sync503 recovered application");
  check("Try again after the database recovers opens the application with one read of it", !!byText(staff.app, "button", "Save note") && !byText(staff.app, "h2", "Application could not be opened") && viewReads503(fetchesSince(mark)).filter(e => e.pathname === DETAIL503).length === 1);

  console.log("\n== 5. the view's other branches are unchanged ==");
  // A kept note: the existing "Retry and keep my note" applies, so no Try again.
  staff.app.querySelector("textarea").value = "sync503 kept note";
  S503.fail = pathname => pathname === DETAIL503 ? unavailable503(SENTENCE503) : null;
  byText(staff.app, "button", "Reload application").click();
  await waitFor(() => !!byText(staff.app, "button", "Retry and keep my note"), "sync503 failed reload with a note");
  check("a failed reload with an unsaved note keeps \"Retry and keep my note\" alone, with the new sentence and no Try again", !!byText(staff.app, "button", "Retry and keep my note") && !byText(staff.app, "button", "Try again") && box()?.querySelector("p")?.textContent === VIEW_TEXT503);
  S503.fail = null;
  byText(staff.app, "button", "Retry and keep my note").click();
  await waitFor(() => !!byText(staff.app, "button", "Save note"), "sync503 note retried");
  check("Retry and keep my note still brings the note back", staff.app.querySelector("textarea")?.value === "sync503 kept note");
  // An other 5xx read failure (erasure_held) is a failed read too: the same sentence and Try again.
  S503.fail = pathname => pathname === DETAIL503 ? json503(503, { error: "erasure_held", message: "PRIVATE_OTHER_503" }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), "sync503 erasure_held view");
  check("503 erasure_held on the read: the same sentence and a Try again, no server text", box()?.querySelector("p")?.textContent === VIEW_TEXT503 && !!byText(staff.app, "button", "Try again") && !staff.app.textContent.includes("PRIVATE_OTHER_503"));
  // A refusal of access offers no Try again (the existing retryableRead rule).
  S503.fail = pathname => pathname === DETAIL503 ? json503(403, { error: "forbidden" }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), "sync503 403 view");
  check("403 on the read: the sentence and no Try again", box()?.querySelector("p")?.textContent === VIEW_TEXT503 && !byText(staff.app, "button", "Try again"));
  // Review round: 404 offers no Try again; 429 is a failed read the existing retryableRead rule allows, so it offers one.
  S503.fail = pathname => pathname === DETAIL503 ? json503(404, { error: "not_found" }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), "sync503 404 view");
  check("404 on the read: the sentence and no Try again", box()?.querySelector("p")?.textContent === VIEW_TEXT503 && !byText(staff.app, "button", "Try again"));
  S503.fail = pathname => pathname === DETAIL503 ? new Response(JSON.stringify({ error: "slow_down" }), { status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "30" } }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), "sync503 429 view");
  mark = log503.length; await pause503(500);
  check("429 on the read: the sentence and a Try again, and nothing by itself", box()?.querySelector("p")?.textContent === VIEW_TEXT503 && !!byText(staff.app, "button", "Try again") && fetchesSince(mark).length === 0, JSON.stringify(fetchesSince(mark)));
  // A held decision: its own heading and words, no Try again.
  S503.fail = pathname => pathname === DETAIL503 ? json503(409, { error: "original_membership_decision_held" }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application decision held"), "sync503 held application");
  const heldBox = byText(staff.app, "h2", "Application decision held")?.closest("section");
  check("a held decision keeps its heading and its exact sentence, and has no Try again and no other button", heldBox?.querySelector(".notice-box.warn p")?.textContent === "The original membership decision for this account could not be safely confirmed. No data or access was changed. Ask a site administrator to investigate. Reopening alone may not resolve this hold." && !byText(staff.app, "button", "Try again") && heldBox.querySelectorAll("button").length === 0 && !staff.app.textContent.includes(VIEW_TEXT503));
  mark = log503.length; await pause503(1000);
  check("a held decision asks for nothing more by itself", fetchesSince(mark).length === 0, JSON.stringify(fetchesSince(mark)));
  // review_changed: its own sentence and the existing button.
  S503.fail = pathname => pathname === DETAIL503 ? json503(409, { error: "review_changed" }) : null;
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "button", "Open the current account"), "sync503 review_changed");
  check("review_changed keeps its sentence and \"Open the current account\" alone, with no Try again", box()?.querySelector("p")?.textContent === "The account changed while you opened the review. Open the current record before deciding." && !byText(staff.app, "button", "Try again"));
  S503.fail = null;
  // 401: the view draws nothing of its own.
  const signedOut = await openPage(STAFF);
  const O503 = recorder503(signedOut);
  await signedOut.go("#/admin/applications");
  await waitFor(() => !!signedOut.app.querySelector("table.admin-applications"), "sync503 401 list");
  O503.fail = pathname => pathname === DETAIL503 ? json503(401, { error: "signed_out" }) : null;
  await signedOut.go("#/admin/applications/" + OTHER);
  await waitFor(() => signedOut.document.body.textContent.includes("You were signed out"), "sync503 401");
  await pause503(200);
  check("401 on the read signs out and the view draws no failure box and no Try again", signedOut.document.body.textContent.includes("You were signed out") && !signedOut.app.textContent.includes("Application could not be opened") && !byText(signedOut.app, "button", "Try again"));

  console.log("\n== 6. by source: the view has no path to a repeat without a click ==");
  const start503 = APP_JS.indexOf("  async function adminApplication(body, id, draft = null) {");
  const catch503 = start503 < 0 ? -1 : APP_JS.indexOf("    catch (err) {\n      if (!live() || err && err.status === 401) return;", start503);
  const end503 = catch503 < 0 ? -1 : APP_JS.indexOf("\n      return;\n    }", catch503);
  const branch503 = start503 >= 0 && catch503 > start503 && end503 > catch503 ? APP_JS.slice(catch503, end503) : "";
  check("the view's failure branch schedules and listens to nothing: no timer, frame, microtask, then or listener", branch503.includes("readRetryButton(err, () => { if (live()) adminApplication(body, id); })") && !/setTimeout|setInterval|requestAnimationFrame|queueMicrotask|addEventListener|\.then\(/.test(branch503), branch503.length);
  const retry503 = APP_JS.slice(APP_JS.indexOf("  function readRetryButton(e, retry) {"), APP_JS.indexOf("  const readFailureBox = "));
  check("readRetryButton has exactly one listener, a click, and schedules nothing", retry503.length > 0 && (retry503.match(/addEventListener\(/g) || []).length === 1 && retry503.includes('button.addEventListener("click", ') && !/setTimeout|setInterval|requestAnimationFrame|queueMicrotask|\.then\(/.test(retry503));
  check("the view is opened from its eight existing places only (the route, its own buttons and its receipts), so no new caller can reload it by itself", (APP_JS.match(/adminApplication\(/g) || []).length === 8, (APP_JS.match(/adminApplication\(/g) || []).length);

  console.log("\n" + ok + "/" + n + " sync503 page checks passed");
  process.exit(ok === n ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
`;
const execution503 = new Module503(__filename, module);
execution503.filename = __filename;
execution503.paths = Module503._nodeModulePaths(__dirname);
execution503._compile(fixture503.slice(0, cuts503[0].index) + '\n' + body503, __filename);
