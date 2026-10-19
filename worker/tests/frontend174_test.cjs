// .174 audit repairs: real app.js, Worker and SQLite from the existing fixture.
// Deliberate readable error responses qualify safe display only, not a production
// membership repair. Browser layout remains a separate desktop/mobile check.
const fs174 = require("node:fs"), path174 = require("node:path"), { Module } = require("node:module");
const fixture174 = fs174.readFileSync(path174.join(__dirname, "frontend_check.cjs"), "utf8");
const starts174 = [...fixture174.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts174.length !== 1) throw new Error("one existing frontend fixture boundary required");
const body174 = String.raw`
// The shared minimal DOM records focus calls but does not otherwise model
// document.activeElement or text-input selection. Model those browser facts for
// this leaf's filter-refresh lifecycle checks.
const focus174 = Element.prototype.focus;
Element.prototype.focus = function(...args) { this.lastFocusOptions174 = args[0]; focus174.apply(this, args); let documentNode = this; while (documentNode.parentNode) documentNode = documentNode.parentNode; if (documentNode.tagName === "#DOCUMENT") documentNode.activeElement = this; };
Element.prototype.setSelectionRange = function(start, end, direction = "none") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; };
const enter174 = field => { const event = new Event("keydown", { bubbles: true }); event.key = "Enter"; field.dispatchEvent(event); };
(async () => {
  await siteUser(MEMBER, { global_name: "Mia" }); await character(MEMBER, "Mia One", "Player-1-0001");
  await siteUser(OTHER, { global_name: "Oz" }); await character(OTHER, "Oz Two", "Player-1-0002");
  await siteUser(STAFF, { global_name: "Vik" });
  await fixtureRun("INSERT INTO site_applications (discord_id,position,board_at,answers,status,created_at,updated_at) VALUES (?,'officer',?,'{}','submitted',?,?)", OTHER, now, now, now);

  const member = await openPage(MEMBER);
  check(".176 signed-in header keeps Sign out and removes the redundant Account data shortcut", !byText(member.app.querySelector("header"), "a", "Account data") && !!byText(member.app, "button", "Sign out") && !byText(member.app.querySelector("footer"), "a", "Private request"));
  await member.go("#/guide/member");
  check("member guide account action opens the actual account surface instead of Home", byText(member.app, "a", "Open my account")?.getAttribute("href") === "/privacy/account" && member.app.querySelectorAll(".guide-steps section").length === 5);

  const staff = await openPage(STAFF), requests = [];
  staff.before((pathname, init) => { requests.push({ pathname, method: init.method || "GET" }); return false; });
  await staff.go("#/community/directory");
  check(".176 actual site admin reads the directory without being marked roster-confirmed", staff.boot.user.isAdmin === true && staff.boot.community.capabilities.confirmedGuildData === false && staff.boot.community.capabilities.communityRead === true && staff.app.textContent.includes("Site administrator") && !staff.app.textContent.includes("not yet confirmed") && requests.some(r => r.pathname.startsWith("/api/community/directory")));
  await staff.go("#/community/profile");
  check(".176 read-only admin access retains verified-character requirements for member profile edits", staff.app.textContent.includes("Updating a member profile") && staff.app.textContent.includes("current guild roster") && !!byText(staff.app, "a", "Read the member guide") && !byText(staff.app, "button", "Save profile"));

  await staff.go("#/admin/applications");
  await waitFor(() => !!staff.app.querySelector("table.admin-applications"), ".174 application list");
  check("admin section picker retains all permitted section destinations and correct current section", staff.app.querySelector(".admin-section-picker select")?.querySelectorAll("option").length === staff.app.querySelectorAll('nav[aria-label="Admin sections"] a').length && staff.app.querySelector('nav[aria-label="Admin sections"] a[aria-current="page"]')?.getAttribute("href") === "#/admin/applications" && staff.app.querySelectorAll("#admin-section-select option").some(o => o.getAttribute("value") === "/admin/ranks" || o.value === "/admin/ranks"));
  check("application filters and every table column remain reachable behind compact controls", !!staff.app.querySelector("details.admin-filter-panel .filters") && staff.app.querySelector("table.admin-applications").querySelectorAll("th").length === 8 && staff.app.textContent.includes("Scroll sideways to see every column"));
  let applicationFilters = staff.app.querySelector("details.admin-filter-panel");
  check("default application list stays compact with its default criteria visible in the closed summary", !applicationFilters.open && applicationFilters.querySelector("summary").textContent.includes("Open applications") && applicationFilters.querySelector("summary").textContent.includes("Recently updated"));
  applicationFilters.open = true;
  const firstPosition = staff.app.querySelector("#application-filter-position"); firstPosition.value = "officer"; firstPosition.focus(); fire(firstPosition, "change");
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== applicationFilters, ".174 first application filter refresh");
  applicationFilters = staff.app.querySelector("details.admin-filter-panel");
  check("changing a position keeps the application filters open and restores the selected control's focus", applicationFilters.open && staff.app.querySelector("#application-filter-position").value === "officer" && staff.document.activeElement === staff.app.querySelector("#application-filter-position") && applicationFilters.querySelector("summary").textContent.includes("Officer"));
  const nextStatus = staff.app.querySelector("#application-filter-status"); nextStatus.value = "submitted"; nextStatus.focus(); fire(nextStatus, "change");
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== applicationFilters, ".174 second application filter refresh");
  applicationFilters = staff.app.querySelector("details.admin-filter-panel");
  check("a second successive criterion remains open/focused and preserves the first criterion", applicationFilters.open && staff.app.querySelector("#application-filter-position").value === "officer" && staff.app.querySelector("#application-filter-status").value === "submitted" && staff.document.activeElement === staff.app.querySelector("#application-filter-status") && applicationFilters.querySelector("summary").textContent.includes("Submitted"));
  const applicationSearch = staff.app.querySelector("#application-filter-search"); applicationSearch.value = "Oz"; applicationSearch.focus(); applicationSearch.setSelectionRange(1, 2, "backward"); enter174(applicationSearch);
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== applicationFilters, ".174 application search refresh");
  applicationFilters = staff.app.querySelector("details.admin-filter-panel");
  const refreshedSearch = staff.app.querySelector("#application-filter-search");
  check("application search refresh preserves the exact text selection and active input", applicationFilters.open && staff.document.activeElement === refreshedSearch && refreshedSearch.value === "Oz" && refreshedSearch.selectionStart === 1 && refreshedSearch.selectionEnd === 2 && refreshedSearch.selectionDirection === "backward");
  staff.hold(pathname => pathname.startsWith("/api/admin/applications?") ? 60 : 0);
  const sortPending = staff.app.querySelector("#application-filter-sort"); sortPending.value = "old"; sortPending.focus(); fire(sortPending, "change");
  applicationFilters.open = false; const outsideFocus = byText(staff.app, "button", "Sign out"); outsideFocus.focus();
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== applicationFilters, ".174 application refresh after user leaves filters");
  check("a late refresh respects a newly closed panel and does not steal focus from elsewhere", !staff.app.querySelector("details.admin-filter-panel").open && staff.document.activeElement === outsideFocus && staff.app.querySelector("details.admin-filter-panel summary").textContent.includes("Oldest first"));
  staff.hold(null);
  const preconfigured = await openPage(STAFF);
  await preconfigured.go("#/admin"); await waitFor(() => preconfigured.app.querySelectorAll("tr.clickable").some(row => row.querySelector("td")?.textContent.trim() === "Officer"), ".174 overview role filter shortcut");
  preconfigured.app.querySelectorAll("tr.clickable").find(row => row.querySelector("td")?.textContent.trim() === "Officer").click();
  await waitFor(() => !!preconfigured.app.querySelector("table.admin-applications"), ".174 preconfigured application criteria");
  check("normal overview shortcut exposes its preconfigured role/status criteria on entry", preconfigured.app.querySelector("details.admin-filter-panel")?.open === true && preconfigured.app.querySelector("#application-filter-position")?.value === "officer" && preconfigured.app.querySelector("#application-filter-status")?.value === "" && preconfigured.app.querySelector("details.admin-filter-panel summary").textContent.includes("Officer") && preconfigured.app.querySelector("details.admin-filter-panel summary").textContent.includes("All statuses"));

  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response(JSON.stringify({ error: "original_membership_decision_held", message: "PRIVATE_GUARD_DETAIL_MUST_NOT_RENDER" }), { status: 409, headers: { "Content-Type": "application/json" } }) : null);
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application temporarily held"), ".174 held application explanation");
  check("held application read clears Loading and provides a safe back action without raw guard/private detail", !!byText(staff.app, "h2", "Application temporarily held") && !staff.app.textContent.includes("Loading…") && !staff.app.textContent.includes("Something went wrong") && !staff.app.textContent.includes("PRIVATE_GUARD_DETAIL") && !staff.app.textContent.includes("original_membership_decision_held") && byText(staff.app, "a", "Back to all applications")?.getAttribute("href") === "#/admin/applications");
  check("held read exposes no status, denial or deletion mutation controls", !byText(staff.app, "button", "Deny permanently") && !byText(staff.app, "button", "Delete their site data") && staff.app.textContent.includes("application details remain withheld"));
  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response('{"error":"unavailable","message":"PRIVATE_OTHER_ERROR"}', { status: 503, headers: { "Content-Type": "application/json" } }) : null);
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), ".174 unavailable application");
  check("other read failures also replace the loading state without leaking server detail", !!byText(staff.app, "h2", "Application could not be opened") && !staff.app.textContent.includes("Loading…") && !staff.app.textContent.includes("PRIVATE_OTHER_ERROR") && !!byText(staff.app, "a", "Back to all applications"));
  staff.answer(null); await staff.go("#/admin/applications");
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "button", "Deny permanently"), ".174 genuine readable application");
  check("a genuine admitted application still opens its existing staff controls", !!byText(staff.app, "button", "Deny permanently") && !!byText(staff.app, "button", "Delete their site data") && !staff.app.textContent.includes("Application temporarily held"));
  const applicationBoard = staff.app.querySelector("table.admin-application-board");
  check("application detail keeps every voting field in a scrollable table with a separate wrapping role label", !!applicationBoard && applicationBoard.querySelectorAll("th").length === 5 && !!applicationBoard.querySelector(".admin-board-role-label") && staff.app.textContent.includes("Scroll sideways to see every voting column"));
  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response('{"error":"original_membership_decision_held"}', { status: 409, headers: { "Content-Type": "application/json" } }) : null);
  staff.hold(pathname => pathname === "/api/admin/applications/" + OTHER ? 80 : 0);
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER); await staff.go("#/");
  await new Promise(resolve => setTimeout(resolve, 120));
  check("a late held read cannot add its error panel to the newly selected Home", !!staff.app.querySelector(".welcome") && !staff.app.textContent.includes("Application temporarily held") && !staff.app.textContent.includes("Application could not be opened"));
  staff.answer(null); staff.hold(null);

  await fixtureRun("INSERT INTO audit (ts,actor,action,subject,details) VALUES (?,?,'role.sweep',?,?)", now, STAFF, MEMBER, JSON.stringify({ checked: 1, privateNote: "PRIVATE_AUDIT_SENTINEL" }));
  await staff.go("#/admin/audit");
  await waitFor(() => !!staff.app.querySelector("table.admin-audit"), ".174 audit log");
  const auditTime = staff.app.querySelector("table.admin-audit time"), auditDetail = staff.app.querySelector("table.admin-audit details.audit-detail");
  check("audit rows use compact exact UTC timestamps and retain a complete machine-readable instant", auditTime?.getAttribute("datetime") === new Date(now * 1000).toISOString() && auditTime.textContent.includes("UTC") && auditTime.textContent.includes(new Date(now * 1000).toISOString().slice(11, 19)));
  check("approved audit detail stays available in a closed disclosure with original filters and read-limit explanation", !!auditDetail && !auditDetail.open && auditDetail.textContent.includes("checked: 1") && !staff.app.textContent.includes("PRIVATE_AUDIT_SENTINEL") && !!staff.app.querySelector("#audit-actor") && staff.app.textContent.includes("2,000 record IDs"));
  let auditFilters = staff.app.querySelector("details.admin-filter-panel"); auditFilters.open = true;
  staff.app.querySelector("#audit-family").value = "role"; staff.app.querySelector("#audit-show").focus(); staff.app.querySelector("#audit-show").click();
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== auditFilters, ".174 audit filter refresh");
  auditFilters = staff.app.querySelector("details.admin-filter-panel");
  check("audit Show preserves the open filter panel and its active control while summarizing actual criteria", auditFilters.open && staff.app.querySelector("#audit-family").value === "role" && staff.document.activeElement === staff.app.querySelector("#audit-show") && auditFilters.querySelector("summary").textContent.includes("Family: role"));
  const auditActor = staff.app.querySelector("#audit-actor"); auditActor.value = STAFF; auditActor.focus(); auditActor.setSelectionRange(2, 5, "forward"); enter174(auditActor);
  await waitFor(() => staff.app.querySelector("details.admin-filter-panel") !== auditFilters, ".174 audit second filter refresh");
  check("a second audit filter retains its earlier criterion and exact text selection", staff.app.querySelector("details.admin-filter-panel").open && staff.app.querySelector("#audit-family").value === "role" && staff.document.activeElement === staff.app.querySelector("#audit-actor") && staff.app.querySelector("#audit-actor").selectionStart === 2 && staff.app.querySelector("#audit-actor").selectionEnd === 5 && staff.app.querySelector("#audit-actor").selectionDirection === "forward" && staff.app.querySelector("details.admin-filter-panel summary").textContent.includes("Actor: " + STAFF));
  check("all exercised admin and membership navigation issued only GETs", requests.length > 4 && requests.every(r => r.method === "GET"));
  await staff.go("#/admin/community/claims");
  await waitFor(() => !!byText(staff.app, "h2", "Character claims"), ".174 staff character claims guidance");
  check("directory-claim guidance uses plain language while preserving the distinction from ownership verification and roles", staff.app.textContent.includes("only marks the label officer-confirmed in the directory") && staff.app.textContent.includes("does not establish verified character ownership or change any role") && !staff.app.textContent.includes("binds nothing in the keeper"));

  const appointments = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.appointed = { officer: "richwcampbell.", treasurer: "Appointed member" }; } });
  await appointments.go("#/roles");
  check("role descriptions preserve all responsibilities while defaulting to collapsed reading", appointments.app.querySelectorAll("details.role-details").length === appointments.boot.meta.positions.length && appointments.app.querySelectorAll("details.role-details").every(d => !d.open && d.textContent.includes("Responsibilities") && d.textContent.includes("Expectations")));
  check("appointment labels retain a trailing-period username once and use an identity-free fallback", appointments.app.textContent.includes("Appointed: richwcampbell. This role") && !appointments.app.textContent.includes("richwcampbell..") && appointments.app.textContent.includes("Filled by appointment") && !appointments.app.textContent.includes("Appointed: Appointed member"));
  await appointments.go("#/roles/officer");
  check("deep role links open that role's full responsibilities without losing other roles", appointments.app.querySelector("#role-officer details.role-details")?.hasAttribute("open") === true && appointments.app.querySelectorAll(".role-card").length === appointments.boot.meta.positions.length);
  await appointments.go("#/vote/officer");
  check("appointed role board preserves appointment closure without doubled punctuation", !appointments.app.textContent.includes("richwcampbell..") && appointments.app.textContent.includes("filled by appointment rather than by the board") && !appointments.app.querySelector("button.vote"));
  await appointments.go("#/apply");
  check("application's appointed role stays disabled with its concise private fallback", appointments.app.querySelectorAll('input[name="position"]').find(r => r.value === "treasurer")?.disabled === true && appointments.app.textContent.includes("Filled by appointment") && !appointments.app.textContent.includes("Appointed: Appointed member"));
  check("in-flow submit action keeps all application questions and consent with safe section shortcuts", !!appointments.app.querySelector("#application-submit.apply-savebar") && appointments.app.querySelectorAll(".application-sections button").length === 4 && !!byText(appointments.app, "button", "Back to role choices") && appointments.app.textContent.includes("I understand, and everything above is true") && !!appointments.app.querySelector('[data-field="ack"]'));

  await member.go("#/governance");
  await waitFor(() => member.app.querySelectorAll("details.governance-chapter").length === 14, ".174 complete current governance reader");
  const archive = member.app.querySelector("details.governance-archive"), adoption = member.app.querySelector("details.governance-draft");
  check("current book actions remain primary while all six historical/preparation downloads stay in Archive", !!archive && !archive.open && archive.querySelectorAll("a[download]").length === 6 && byText(member.app, "a", "Download current R7 source")?.getAttribute("href") === "/static/governance/reconciled-book.md" && !archive.contains(byText(member.app, "a", "Download current R7 source")));
  check("adoption qualifications remain intact and blank instrument fields are explicitly unexecuted", !!adoption && adoption.textContent.includes("Adoption issues no individual appointment or named signature") && adoption.textContent.includes("changes no native rank, bank limit or platform permission") && member.app.querySelector('[data-chapter="2-royal-charter-of-olympus"] .governance-instrument-note')?.textContent.includes("A blank field is not a completed record") && member.app.textContent.includes("Article S12a") && member.app.textContent.includes("Independent auditor warrant"));
  const instrumentNoteIndices = member.app.querySelectorAll("details.governance-chapter").map((chapter, index) => chapter.querySelector(".governance-instrument-note") ? index : null).filter(index => index !== null);
  const instrumentNoteIds = member.app.querySelectorAll("details.governance-chapter").filter(chapter => chapter.querySelector(".governance-instrument-note")).map(chapter => chapter.getAttribute("data-chapter")).sort();
  const instrumentIdsDigest = require("node:crypto").createHash("sha256").update(JSON.stringify(instrumentNoteIds)).digest("hex"), reviewedBookDigest = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, "public/static/governance/reconciled-book.md"))).digest("hex");
  check("the reviewed book's four instrument-note placements and execution limits remain exact", reviewedBookDigest === "5070062380f257451eb39fdf8b6320eb7b90897bad58085adde6dc8d1aa4afdf" && instrumentIdsDigest === "a5cf89f9778efa8f188b4af0db64ab6fb02ca02a177206f7d8247034f47636cf" && JSON.stringify(instrumentNoteIndices) === "[2,3,11,12]" && member.app.querySelectorAll(".governance-instrument-note").every(note => note.textContent.includes("A blank field is not a completed record")));
  const bookSearch = member.app.querySelector("#governance-search"), printStates = [], originalPrint = member.window.print;
  bookSearch.value = "Independent auditor warrant"; fire(bookSearch, "input");
  const nativeChapters = member.app.querySelectorAll("details.governance-chapter"), searchStatus = member.app.querySelector('.governance-controls p[role="status"]');
  nativeChapters[0].open = true; // retain an independently expanded, currently hidden chapter too
  const readerState = () => JSON.stringify({ scopeOpen: adoption.open, search: bookSearch.value, count: searchStatus.textContent, chapters: nativeChapters.map(chapter => ({ open: chapter.open, hidden: chapter.hidden })) });
  const beforeButtonPrint = readerState();
  const filteredBeforePrint = member.app.querySelectorAll("details.governance-chapter").filter(chapter => !chapter.hidden).length === 1 && !adoption.open;
  member.window.print = () => { member.window.dispatchEvent(new Event("beforeprint")); printStates.push({ scopeOpen: adoption.open, scopeText: adoption.textContent, chapters: member.app.querySelectorAll("details.governance-chapter").map(chapter => ({ open: chapter.open, hidden: chapter.hidden })), archiveOpen: archive.open }); };
  byText(member.app, "button", "Print current R7 book").click();
  member.window.print = originalPrint;
  check("printing a filtered book opens all current chapters and the full adoption scope before the print dialog", filteredBeforePrint && printStates.length === 1 && printStates[0].scopeOpen === true && printStates[0].scopeText.includes("Adoption issues no individual appointment or named signature") && printStates[0].scopeText.includes("changes no native rank, bank limit or platform permission") && printStates[0].chapters.length === 14 && printStates[0].chapters.every(chapter => chapter.open && !chapter.hidden) && printStates[0].archiveOpen === false);
  member.window.dispatchEvent(new Event("afterprint"));
  check("button preparation followed by native beforeprint snapshots once and restores the exact filtered reader afterward", readerState() === beforeButtonPrint);
  adoption.open = true; bookSearch.value = "Independent auditor warrant"; fire(bookSearch, "input");
  const beforeNativePrint = readerState();
  member.window.dispatchEvent(new Event("beforeprint"));
  check("native browser printing expands the live book and adoption scope without the page Print button", adoption.open === true && nativeChapters.every(chapter => chapter.open && !chapter.hidden) && archive.open === false && member.window.listeners.beforeprint.length === 1);
  member.window.dispatchEvent(new Event("afterprint"));
  check("native print close or cancel restores current search/count and every previous open/hidden state", readerState() === beforeNativePrint && adoption.open === true);
  member.window.dispatchEvent(new Event("beforeprint"));
  await member.go("#/vote/raid_leader_na");
  const cleanupRestoredReader = readerState() === beforeNativePrint;
  adoption.open = false; nativeChapters.forEach(chapter => { chapter.open = false; chapter.hidden = true; });
  member.window.dispatchEvent(new Event("beforeprint")); member.window.dispatchEvent(new Event("afterprint"));
  check("leaving governance restores a pending print snapshot, removes both listeners and cannot mutate the detached reader", cleanupRestoredReader && member.window.listeners.beforeprint.length === 0 && member.window.listeners.afterprint.length === 0 && adoption.open === false && nativeChapters.every(chapter => !chapter.open && chapter.hidden) && !!member.app.querySelector(".board-layout"));
  check("voting task comes first while reversible vote mechanics and essential privacy statement remain", !!member.app.querySelector("details.voting-help") && member.app.textContent.includes("click again to take a vote back") && member.app.textContent.includes("until voting closes") && member.app.textContent.includes("Your votes are private") && member.app.textContent.includes("except the guild's leadership"));
  check("role rail exposes a continuation cue while retaining every ballot destination", member.app.querySelector(".role-list-hint")?.textContent === "Scroll this list for every role." && member.app.querySelectorAll(".role-list a").length === member.boot.meta.ballots.length);

  // .175: follow-up audit regressions use the original admitted local fixture.
  // They do not change a real appointment, membership, digest or production flag.
  const followup175 = await openPage(STAFF);
  await followup175.go("#/admin/applications");
  await waitFor(() => !!followup175.app.querySelector("table.admin-applications"), ".175 accessible applications");
  const applicationLinks175 = followup175.app.querySelectorAll("table.admin-applications a.application-open");
  check(".175 every application row has an ordinary keyboard-accessible detail link", applicationLinks175.length === followup175.app.querySelectorAll("table.admin-applications tbody tr").length && applicationLinks175.length > 0 && applicationLinks175.every(link => /^#\/admin\/applications\/\d+$/.test(link.getAttribute("href")) && !link.getAttribute("tabindex")));

  for (let i = 0; i < 61; i++) await fixtureRun("INSERT INTO audit(ts,actor,action,subject,details) VALUES (?,?,'role.sweep',?,?)", now - i, "cron", OTHER, JSON.stringify({ checked: i + 1 }));
  await followup175.go("#/admin/audit");
  await waitFor(() => !!followup175.app.querySelector("#audit-page-older") && !followup175.app.querySelector("#audit-page-older").disabled, ".175 audit first page");
  let older175 = followup175.app.querySelector("#audit-page-older");
  older175.focus(); older175.click();
  await waitFor(() => followup175.app.querySelector("#audit-page-older") !== older175, ".175 audit older replacement");
  let auditFocused175 = followup175.document.activeElement;
  check(".175 paging restores focus to the same available pager or an enabled alternative", ["audit-page-older", "audit-page-newest"].includes(auditFocused175?.id) && !auditFocused175.disabled && !!followup175.app.querySelector('#audit-status[role="status"]'));
  let newest175 = followup175.app.querySelector("#audit-page-newest"); newest175.focus(); newest175.click();
  await waitFor(() => followup175.app.querySelector("#audit-page-newest") !== newest175, ".175 audit newest replacement");
  check(".175 reaching newest restores focus to Older instead of a disabled Newest button", followup175.document.activeElement === followup175.app.querySelector("#audit-page-older") && followup175.app.querySelector("#audit-page-newest").disabled);
  check(".175 pager focus permits native scrolling when a longer replacement page moves it below the viewport", followup175.document.activeElement.lastFocusOptions174?.preventScroll !== true);
  followup175.hold(pathname => pathname.startsWith("/api/admin/audit-log?") ? 60 : 0);
  older175 = followup175.app.querySelector("#audit-page-older"); older175.focus(); older175.click();
  const outside175 = byText(followup175.app, "button", "Sign out"); outside175.focus();
  await waitFor(() => followup175.app.querySelector("#audit-page-older") !== older175, ".175 audit deferred refresh");
  check(".175 a delayed audit page does not steal focus after the reader leaves the pager", followup175.document.activeElement === outside175);
  followup175.hold(null);
  await followup175.go("#/admin/community");
  await waitFor(() => !!followup175.app.querySelector(".digest-preview"), ".175 digest preview");
  check(".175 digest preview displays its fixed heading without raw Discord bold delimiters", followup175.app.querySelector(".digest-preview").textContent.startsWith("Officer digest:") && !followup175.app.querySelector(".digest-preview").textContent.includes("**Officer digest:**") && followup175.app.textContent.includes("Discord message preview"));
  check(".175 community rail explains horizontal continuation in accessible text", followup175.app.querySelector('nav[aria-label="Community admin sections"]')?.getAttribute("aria-describedby") === "community-admin-scroll-hint" && followup175.app.querySelector("#community-admin-scroll-hint")?.textContent.includes("Scroll") && !!followup175.app.querySelector('nav[aria-label="Community admin sections"] a[href="#/admin/community/claims"]'));

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution174 = new Module(__filename, module);
execution174.filename = __filename;
execution174.paths = Module._nodeModulePaths(__dirname);
execution174._compile(fixture174.slice(0, starts174[0].index) + "\n" + body174, __filename);
