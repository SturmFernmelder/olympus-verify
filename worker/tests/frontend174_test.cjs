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
const directoryCoverage203 = page => {
  const model=page.boot.meta.roleDirectory203, expected=[...page.boot.meta.appointments.map(row=>row.key),"member","raider","pvp_team"].sort();
  const declared=model.families.flatMap(family=>family.sourceKeys).sort(),visible=model.families.flatMap(family=>[family.primaryKey,...family.variants.filter(row=>['office','region','class'].includes(row.presentation)).map(row=>row.key)]).sort();
  const actual=page.app.querySelectorAll("[data-role-key201]").map(row=>row.getAttribute("data-role-key201")).sort();
  return model?.version===1 && model.sourceKeyCount===142 && expected.length===142 && JSON.stringify(declared)===JSON.stringify(expected)
    && expected.every(key=>model.families.find(family=>family.key===model.keyToFamily[key])?.sourceKeys.includes(key))
    && visible.length===117 && JSON.stringify(actual)===JSON.stringify(visible)
    && page.app.querySelectorAll("details.role-family203").length===72;
};
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
  // .196: the owner-approved default is the Olympus Discord directory. The
  // original .176 member-profile reader remains behind this explicit button.
  byText(staff.app, "button", "Show Member profiles and crafting offers").click();
  await waitFor(() => staff.app.textContent.includes("Site administrator") && requests.some(r => r.pathname.startsWith("/api/community/directory")), ".176 explicit optional profile reader");
  check(".176 actual site admin reads the directory without being marked roster-confirmed", staff.boot.user.isAdmin === true && staff.boot.community.capabilities.confirmedGuildData === false && staff.boot.community.capabilities.communityRead === true && staff.app.textContent.includes("Site administrator") && !staff.app.textContent.includes("not yet confirmed") && requests.some(r => r.pathname.startsWith("/api/community/directory")));
  await staff.go("#/community/profile");
  check(".176 read-only admin access retains verified-character requirements for member profile edits", staff.app.textContent.includes("Updating a member profile") && staff.app.textContent.includes("current guild roster") && !!byText(staff.app, "a", "Read the member guide") && !byText(staff.app, "button", "Save profile"));

  await staff.go("#/admin/applications");
  await waitFor(() => !!staff.app.querySelector("table.admin-applications"), ".174 application list");
  check("admin section picker retains all permitted section destinations and correct current section", staff.app.querySelector(".admin-section-picker select")?.querySelectorAll("option").length === staff.app.querySelectorAll('nav[aria-label="Admin sections"] a').length && staff.app.querySelector('nav[aria-label="Admin sections"] a[aria-current="page"]')?.getAttribute("href") === "#/admin/applications" && staff.app.querySelectorAll("#admin-section-select option").some(o => o.getAttribute("value") === "#/admin/ranks" || o.value === "#/admin/ranks"));
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
  await preconfigured.go("#/admin"); await waitFor(() => preconfigured.app.querySelectorAll("a.summary-role-open").some(link => link.textContent.trim() === "Officer"), ".174 overview role filter shortcut");
  const roleShortcut174 = preconfigured.app.querySelectorAll("a.summary-role-open").find(link => link.textContent.trim() === "Officer");
  roleShortcut174.click(); await preconfigured.go(roleShortcut174.getAttribute("href")); // The minimal DOM does not follow native anchors itself.
  await waitFor(() => !!preconfigured.app.querySelector("table.admin-applications"), ".174 preconfigured application criteria");
  check("normal overview shortcut exposes its preconfigured role/status criteria on entry", preconfigured.app.querySelector("details.admin-filter-panel")?.open === true && preconfigured.app.querySelector("#application-filter-position")?.value === "officer" && preconfigured.app.querySelector("#application-filter-status")?.value === "" && preconfigured.app.querySelector("details.admin-filter-panel summary").textContent.includes("Officer") && preconfigured.app.querySelector("details.admin-filter-panel summary").textContent.includes("All statuses"));

  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response(JSON.stringify({ error: "original_membership_decision_held", message: "PRIVATE_GUARD_DETAIL_MUST_NOT_RENDER" }), { status: 409, headers: { "Content-Type": "application/json" } }) : null);
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application decision held"), ".174 held application explanation");
  check("held application read clears Loading and provides a safe back action without raw guard/private detail", !!byText(staff.app, "h2", "Application decision held") && !staff.app.textContent.includes("Loading…") && !staff.app.textContent.includes("Opening the application…") && !staff.app.textContent.includes("Something went wrong") && !staff.app.textContent.includes("PRIVATE_GUARD_DETAIL") && !staff.app.textContent.includes("original_membership_decision_held") && byText(staff.app, "a", "Back to all applications")?.getAttribute("href") === "#/admin/applications");
  check("held read exposes no status, denial or deletion mutation controls", !byText(staff.app, "button", "Deny permanently") && !byText(staff.app, "button", "Delete their site data") && ["Under review", "Accept", "Not accepted", "Back to submitted", "Save note", "Lift the denial"].every(label => !byText(staff.app, "button", label)) && !staff.app.querySelector("textarea") && !staff.app.querySelector("table.admin-application-board") && staff.app.textContent.includes("No data or access was changed.") && staff.app.textContent.includes("Ask a site administrator to investigate.") && staff.app.textContent.includes("Reopening alone may not resolve this hold."));
  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response('{"error":"unavailable","message":"PRIVATE_OTHER_ERROR"}', { status: 503, headers: { "Content-Type": "application/json" } }) : null);
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "h2", "Application could not be opened"), ".174 unavailable application");
  check("other read failures also replace the loading state without leaking server detail", !!byText(staff.app, "h2", "Application could not be opened") && !staff.app.textContent.includes("Loading…") && !staff.app.textContent.includes("Opening the application…") && !staff.app.textContent.includes("PRIVATE_OTHER_ERROR") && !!byText(staff.app, "a", "Back to all applications"));
  staff.answer(null); await staff.go("#/admin/applications");
  await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!byText(staff.app, "button", "Delete their site data"), ".174 genuine readable application");
  check("an admitted Officer application retains its staff controls and directs permanent denial to review", !!byText(staff.app, "button", "Delete their site data") && !!byText(staff.app, "button", "Save note") && !!byText(staff.app, "button", "Under review") && !byText(staff.app, "button", "Deny permanently") && staff.app.textContent.includes("requires an attended membership review") && !staff.app.textContent.includes("Application decision held"));
  const applicationBoard = staff.app.querySelector("table.admin-application-board");
  check("application detail keeps every voting field in a scrollable table with a separate wrapping role label", !!applicationBoard && applicationBoard.querySelectorAll("th").length === 5 && !!applicationBoard.querySelector(".admin-board-role-label") && staff.app.textContent.includes("Scroll sideways to see every voting column"));
  staff.answer(pathname => pathname === "/api/admin/applications/" + OTHER ? new Response('{"error":"original_membership_decision_held"}', { status: 409, headers: { "Content-Type": "application/json" } }) : null);
  let heldDetailAnswers174 = 0;
  staff.hold(pathname => { if (pathname !== "/api/admin/applications/" + OTHER) return 0; heldDetailAnswers174++; return 80; });
  await staff.go("#/admin/applications"); await staff.go("#/admin/applications/" + OTHER);
  await waitFor(() => heldDetailAnswers174 === 1, ".174 actual held application read before leaving");
  await staff.go("#/");
  await new Promise(resolve => setTimeout(resolve, 120));
  check("a late held read cannot add its error panel to the newly selected Home", heldDetailAnswers174 === 1 && !!staff.app.querySelector(".welcome") && !staff.app.textContent.includes("Application decision held") && !staff.app.textContent.includes("Application could not be opened"));
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
  check("canonical role families retain all 142 source identities and 117 specifications while defaulting to collapsed reading", directoryCoverage203(appointments) && appointments.app.querySelectorAll("details.role-family203").every(d => !d.open && d.querySelector('.role-primary203').querySelectorAll('.role-guide201').length===1 && d.textContent.includes("Responsibilities") && d.textContent.includes("Expectations")));
  check("appointment labels retain a trailing-period username once and use an identity-free fallback", appointments.app.textContent.includes("Appointed: richwcampbell.") && !appointments.app.textContent.includes("richwcampbell..") && appointments.app.textContent.includes("Filled by appointment") && !appointments.app.textContent.includes("Appointed: Appointed member"));
  await appointments.go("#/roles/officer");
  const officerFamily218=appointments.app.querySelector('[data-role-family203="officer"]'),officerGuide218=appointments.boot.meta.roleGuides201.officer;
  check("deep alias links open the canonical family and retain its full duties and independently scoped holder without a stub drawer", !appointments.app.querySelector("#role-officer") && officerFamily218?.open === true && officerFamily218.querySelector(".role-primary203 .role-info")?.textContent.includes("Responsibilities") && officerFamily218.querySelector('[data-appointment-scope203="officer"]')?.textContent.includes('richwcampbell.') && officerFamily218.textContent.includes(officerGuide218.definition) && officerGuide218.responsibilities.every(text=>officerFamily218.textContent.includes(text)) && officerGuide218.expectations.every(text=>officerFamily218.textContent.includes(text)) && directoryCoverage203(appointments));
  await appointments.go("#/roles/raider");
  const raiderFamily218=appointments.app.querySelector('[data-role-family203="raider"]'),raiderPrimary218=raiderFamily218.querySelector('.role-primary203'),rankRaider218=raiderFamily218.querySelector('#role-rank_raider');
  check(".219 canonical Raider application is clear without a duplicate native standing-only footer",raiderFamily218.querySelector('summary .badge')?.textContent==='Applications accepted'&&!raiderPrimary218.textContent.includes('Standing or review status only — not an application vacancy.')&&!raiderPrimary218.textContent.includes(appointments.boot.meta.roleGuides201.raider.eligibilityNote));
  check(".219 native Raider retains exact metadata and slot6 on its one master specification without a stub drawer",!rankRaider218&&appointments.boot.meta.roleDirectory203.keyToFamily.rank_raider==='raider'&&appointments.boot.meta.roleGuides201.rank_raider.nativeSlot===6&&appointments.boot.meta.roleGuides201.rank_raider.eligibility==='standing'&&raiderFamily218.querySelector('summary .rank-office199')?.textContent.includes('Slot 6')&&!raiderPrimary218.querySelector('.rank-office199')&&raiderPrimary218.querySelectorAll('h3').filter(node=>node.textContent==='Responsibilities').length===1/* Evergreen 12 Nov 2026: role-guide parts are H3s under the role H2 */&&raiderFamily218.querySelectorAll('.role-variant203 .role-info').length===0&&raiderFamily218.getAttribute('data-role-family203')==='raider');
  await appointments.go("#/vote/officer");
  check("appointed role board preserves appointment closure without doubled punctuation", !appointments.app.textContent.includes("richwcampbell..") && appointments.app.textContent.includes("filled by appointment rather than by the board") && !appointments.app.querySelector("button.vote"));
  await appointments.go("#/apply");
  check("the compact application chooser keeps Treasury closed and points to the canonical guide", !appointments.app.querySelectorAll('input[name="position"]').some(r => r.value === "treasurer") && !appointments.app.querySelector('[data-family-apply203="treasurer"]') && !appointments.app.querySelector('#application-directory201') && !!appointments.app.querySelector('#application-track-chooser228 a[href="#/roles"][target="_blank"]') && appointments.app.textContent.includes("seats are reserved appointments"));
  check("in-flow submit action keeps all application questions and consent with safe section shortcuts", !!appointments.app.querySelector("#application-submit.apply-savebar") && appointments.app.querySelectorAll(".application-sections button").length === 4 && !!byText(appointments.app, "button", "Back to role choices") && appointments.app.textContent.includes("I understand, and everything above is true") && !!appointments.app.querySelector('[data-field="ack"]'));

  await member.go("#/governance");
  await waitFor(() => member.app.querySelectorAll("details.governance-chapter").length === 20, ".174 complete current governance reader");
  const archive = member.app.querySelector("details.governance-archive"), adoption = member.app.querySelector("details.governance-draft");
  check("current book actions remain primary without a reader-facing archive or editorial update panel", !archive && !member.app.querySelector("#trading-portfolio208") && !member.app.textContent.includes("Archive and release records") && byText(member.app, "a", "Download current R7 source")?.getAttribute("href") === "/static/governance/reconciled-book.md");
  check("adoption qualifications remain intact and blank instrument fields are explicitly unexecuted", !!adoption && adoption.textContent.includes("Adoption issues no individual appointment or named signature") && adoption.textContent.includes("changes no native rank, bank limit or platform permission") && member.app.querySelector('[data-chapter="2-royal-charter-of-olympus"] .governance-instrument-note')?.textContent.includes("A blank field is not a completed record") && member.app.textContent.includes("Article S12a") && member.app.textContent.includes("Independent auditor warrant"));
  const instrumentNoteIndices = member.app.querySelectorAll("details.governance-chapter").map((chapter, index) => chapter.querySelector(".governance-instrument-note") ? index : null).filter(index => index !== null);
  const instrumentNoteIds = member.app.querySelectorAll("details.governance-chapter").filter(chapter => chapter.querySelector(".governance-instrument-note")).map(chapter => chapter.getAttribute("data-chapter")).sort();
  const instrumentIdsDigest = require("node:crypto").createHash("sha256").update(JSON.stringify(instrumentNoteIds)).digest("hex"), reviewedBookDigest = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, "public/static/governance/reconciled-book.md"))).digest("hex");
  check("the reviewed book's four instrument-note placements and execution limits remain exact", reviewedBookDigest === "fb6816b77507c2855f45511a32d1b46fbdcab804965e78a3650eb6f071684cac" && instrumentIdsDigest === "a5cf89f9778efa8f188b4af0db64ab6fb02ca02a177206f7d8247034f47636cf" && JSON.stringify(instrumentNoteIndices) === "[2,3,17,18]" && member.app.querySelectorAll(".governance-instrument-note").every(note => note.textContent.includes("A blank field is not a completed record")));
  // Search through the real reviewed book, including its genuine strong/plain
  // inline boundary. Mark fragments share one logical match index; neither
  // generated reader controls nor adoption/instrument qualifications are hits.
  const governanceSearch = member.app.querySelector("#governance-search");
  const governanceSourceText = () => member.app.querySelectorAll("details.governance-chapter").map(chapter => ({ heading: chapter.querySelector("summary h2").textContent, prose: chapter.querySelector(".governance-prose").textContent }));
  const unmarkedGovernanceText = JSON.stringify(governanceSourceText());
  const governanceMarks = () => member.app.querySelectorAll("mark.governance-search-match");
  const governanceGroups = () => [...new Set(governanceMarks().map(mark => mark.getAttribute("data-governance-match")))];
  const currentGovernanceGroup = () => [...new Set(governanceMarks().filter(mark => mark.getAttribute("aria-current") === "true").map(mark => mark.getAttribute("data-governance-match")))];
  const previousMatch = byText(member.app, "button", "Previous match"), nextMatch = byText(member.app, "button", "Next match");
  const matchNavigation = member.app.querySelector(".governance-match-nav");
  const matchStatus = () => matchNavigation.querySelector('[role="status"]').textContent;
  const searchGovernance = query => { governanceSearch.value = query; fire(governanceSearch, "input"); };
  check("governance match navigation starts hidden and disabled with no empty-query highlights", !!previousMatch && !!nextMatch && !!matchNavigation && matchNavigation.hidden && previousMatch.disabled && nextMatch.disabled && governanceMarks().length === 0);
  const codices199 = [
    ["title-i-the-sovereign-royal-decrees", "Title I · Sovereign", "Verification checks the exact bytes"],
    ["title-ii-the-high-council-co-guild-master-privy-court", "Title II · Council & Court", "balance of probabilities"],
    ["title-iii-the-imperial-treasury-guild-bank-tithe-ledger", "Title III · Treasury", "Benefactor of Olympus — 500 gold"],
    ["title-iv-the-grand-alliance-concordat", "Title IV · Grand Alliance", "The October Beta census of 1,000/1,000 and 247 queued"],
    ["title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord", "Title V · Artisans & Heralds", "A received invitation, accepted group and completed arrival"]
  ];
  check(".198 all five substantive statutory/RP Titles render with complete Articles,Sections and146subclauses", member.app.querySelectorAll("details.governance-chapter").length === 20 && codices199.every(([id, label]) => { const chapter = member.app.querySelector('[data-chapter="' + id + '"]'); return chapter && chapter.textContent.includes("Article ") && chapter.textContent.includes("Section ") && chapter.querySelector(".governance-prose").textContent.length > 8000 && byText(member.app, "a", label)?.getAttribute("href") === "#/governance/" + id; }) && member.app.querySelectorAll(".governance-prose h3").filter(node => /^Article [IVX]+\.\d+ — /.test(node.textContent)).length === 36 && member.app.querySelectorAll(".governance-prose h3").filter(node => /^Section [IVX]+\.\d+\.\d+ — /.test(node.textContent)).length === 72);
  for (const [id, label, query] of codices199) {
    searchGovernance(query);
    const shown = member.app.querySelectorAll("details.governance-chapter").filter(chapter => !chapter.hidden);
    check(".198 whole-book search reaches the new code and selects the exact source chapter: " + label, shown.length === 1 && shown[0].getAttribute("data-chapter") === id && shown[0].open && governanceGroups().length === 1 && governanceMarks().map(mark => mark.textContent).join("") === query && currentGovernanceGroup().length === 1 && matchStatus().includes("Match 1 of 1") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  }
  for (const [id, query] of [
    ["title-ii-the-high-council-co-guild-master-privy-court", "Writ of Royal Clemency (Standard Unban Bail)"],
    ["title-iii-the-imperial-treasury-guild-bank-tithe-ledger", "Flagship Charter of Direct Induction (Bypass Overflow into Olympus I)"],
    ["title-iv-the-grand-alliance-concordat", "The current stable-office register and its assignable keys"],
    ["title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord", "no raw or derived Discord ID is retained to suppress future directory eligibility"]
  ]) {
    searchGovernance(query);
    const shown = member.app.querySelectorAll("details.governance-chapter").filter(chapter => !chapter.hidden);
    check(".199 expanded gold/role/privacy code is searchable as one exact source occurrence: " + query, shown.length === 1 && shown[0].getAttribute("data-chapter") === id && shown[0].open && governanceGroups().length === 1 && governanceMarks().map(mark => mark.textContent).join("") === query && currentGovernanceGroup().length === 1 && matchStatus().includes("Match 1 of 1") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  }
  byText(member.app, "button", "Clear search").click();
  check(".198 new-Title searches clear to the complete20chapter book with all source and adoption protections intact", governanceMarks().length === 0 && member.app.querySelectorAll("details.governance-chapter").every(chapter => !chapter.hidden) && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText && adoption.textContent.includes("Adoption issues no individual appointment or named signature"));
  governanceSearch.focus();
  searchGovernance("tReAsUrEr");
  const treasurerGroups = governanceGroups(), matchingChapters = member.app.querySelectorAll("details.governance-chapter").filter(chapter => !chapter.hidden);
  check("literal case-insensitive governance search marks source text and announces occurrence and chapter counts without moving typing focus", treasurerGroups.length > 8 && governanceMarks().every(mark => mark.textContent.toLowerCase() === "treasurer" && !!mark.closest("details.governance-chapter")) && matchingChapters.length === 12 && member.app.querySelector('.governance-controls p[role="status"]').textContent.includes("12 of 20 chapters") && /Match 1 of /i.test(matchStatus()) && matchStatus().includes(String(treasurerGroups.length)) && !matchNavigation.hidden && !previousMatch.disabled && !nextMatch.disabled && currentGovernanceGroup().length === 1 && currentGovernanceGroup()[0] === treasurerGroups[0] && member.document.activeElement === governanceSearch);
  check("governance highlights do not alter any rendered chapter text or inline emphasis", JSON.stringify(governanceSourceText()) === unmarkedGovernanceText && member.app.querySelectorAll(".governance-prose strong").length > 5 && !member.app.querySelector(".governance-toc mark") && !adoption.querySelector("mark") && !member.app.querySelector(".governance-archive mark") && !member.app.querySelector(".governance-instrument-note mark"));
  previousMatch.click();
  check("Previous match wraps from the first occurrence to the last without leaving the chapter route", currentGovernanceGroup()[0] === treasurerGroups.at(-1) && member.location.hash === "#/governance");
  nextMatch.click();
  check("Next match wraps from the last occurrence to the first", currentGovernanceGroup()[0] === treasurerGroups[0] && /Match 1 of /i.test(matchStatus()));
  member.app.querySelectorAll("details.governance-chapter").forEach(chapter => { chapter.open = false; });
  nextMatch.click();
  const secondHit = governanceMarks().find(mark => mark.getAttribute("aria-current") === "true");
  check("moving to a match reopens its collapsed source chapter while keeping the search input and page", currentGovernanceGroup()[0] === treasurerGroups[1] && secondHit.closest("details.governance-chapter").open && governanceSearch.value === "tReAsUrEr" && member.location.hash === "#/governance");
  nextMatch.focus(); byText(member.app, "button", "Edit search").click();
  check("Edit search returns focus to the existing input without clearing its query or current match", member.document.activeElement === governanceSearch && governanceSearch.value === "tReAsUrEr" && currentGovernanceGroup()[0] === treasurerGroups[1]);
  searchGovernance("Federal Treasurer. Coordinates");
  const crossInlineMarks = governanceMarks();
  check("one literal match may cross strong and plain source text without flattening either", governanceGroups().length === 1 && crossInlineMarks.length > 0 && crossInlineMarks.map(mark => mark.textContent).join("") === "Federal Treasurer. Coordinates" && member.app.querySelectorAll(".governance-prose strong").some(strong => strong.textContent === "Federal Treasurer.") && /Match 1 of 1/i.test(matchStatus()) && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  previousMatch.click(); nextMatch.click();
  check("a single split-inline match keeps both fragments selected through navigation", currentGovernanceGroup().length === 1 && governanceMarks().every(mark => mark.getAttribute("aria-current") === "true") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  searchGovernance("Reading and Adopting This Book");
  check("chapter heading matches are highlighted without marking the duplicate contents link", governanceGroups().length === 1 && !!member.app.querySelector("details.governance-chapter summary h2 mark") && !member.app.querySelector(".governance-toc mark"));
  for (const excluded of ["Archive and release records", "A blank field is not a completed record.", "Explore the organization", "Roles referenced by Title", "Link to this article"]) {
    searchGovernance(excluded);
    check("generated reader text is not a source-book match: " + excluded, governanceMarks().length === 0 && previousMatch.disabled && nextMatch.disabled && !matchNavigation.hidden && currentGovernanceGroup().length === 0);
  }
  searchGovernance("[.*](Treasurer)+?");
  check("search punctuation is a literal string rather than an executable regular expression", governanceMarks().length === 0 && previousMatch.disabled && nextMatch.disabled && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  searchGovernance('<img src=x onerror="throw 1">');
  check("query markup is displayed only as text and cannot create HTML or source matches", governanceMarks().length === 0 && previousMatch.disabled && nextMatch.disabled && !member.app.querySelector('img[src="x"]') && !member.app.querySelector(".governance-controls script") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  searchGovernance("Treasurer"); searchGovernance("Federal Treasurer. Coordinates"); searchGovernance("TREASURER");
  check("editing and repeating search rebuilds exact matches without nested marks or altered source", governanceGroups().length === treasurerGroups.length && !member.app.querySelector("mark mark") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  byText(member.app, "button", "Clear search").click();
  check("Clear search removes all marks and current-hit state while restoring all 20 chapters exactly", governanceSearch.value === "" && governanceMarks().length === 0 && previousMatch.disabled && nextMatch.disabled && matchNavigation.hidden && member.app.querySelectorAll("details.governance-chapter").every(chapter => !chapter.hidden) && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);

  // P2: a common one-character query must not turn the whole book into tens of
  // thousands of DOM marks. Count independently from unmarked rendered source;
  // the display budget must not truncate the searchable results or navigation.
  const sourceBlocks = member.app.querySelectorAll("details.governance-chapter").flatMap(chapter => [chapter.querySelector("summary h2"), ...chapter.querySelectorAll(".governance-prose p, .governance-prose h3, .governance-prose h4, .governance-prose li, .governance-prose th, .governance-prose td").filter(block => !block.closest(".governance-instrument-note, .governance-overview, .role-reference-links228, .governance-article-links228"))]);
  const expectedSingleLetterHits = sourceBlocks.reduce((total, block) => total + [...block.textContent.matchAll(/e/giu)].length, 0);
  const originalEmphasis = JSON.stringify(member.app.querySelectorAll(".governance-prose strong, .governance-prose code").map(node => ({ tag: node.tagName, text: node.textContent })));
  const singleLetterBudget = () => governanceMarks().length > 0 && governanceMarks().length <= 200 && governanceGroups().length <= 200;
  searchGovernance("e");
  check("a common short query reports every source occurrence while bounding the initial highlight DOM", expectedSingleLetterHits > 10000 && matchStatus().includes("Match 1 of " + expectedSingleLetterHits) && currentGovernanceGroup().join(",") === "0" && singleLetterBudget() && member.app.querySelector('.governance-controls p[role="status"]').textContent.includes("Showing up to 200 highlights at a time") && member.app.querySelector('.governance-controls p[role="status"]').textContent.includes("match navigation reaches every result"));
  previousMatch.click();
  const lastShortHit = governanceMarks().find(mark => mark.getAttribute("aria-current") === "true");
  check("short-query Previous wraps to the final global result and highlights it on demand within the same DOM budget", currentGovernanceGroup().join(",") === String(expectedSingleLetterHits - 1) && matchStatus().includes("Match " + expectedSingleLetterHits + " of " + expectedSingleLetterHits) && lastShortHit?.textContent.toLowerCase() === "e" && lastShortHit.closest("details.governance-chapter").open && singleLetterBudget());
  nextMatch.click();
  check("short-query Next wraps back to the first global result without accumulating old highlight windows", currentGovernanceGroup().join(",") === "0" && matchStatus().includes("Match 1 of " + expectedSingleLetterHits) && singleLetterBudget());
  nextMatch.click();
  check("short-query navigation inside the current window advances the logical result without exceeding the budget", currentGovernanceGroup().join(",") === "1" && matchStatus().includes("Match 2 of " + expectedSingleLetterHits) && singleLetterBudget() && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  searchGovernance("E");
  check("editing a short query preserves its complete case-insensitive count and does not nest highlights", matchStatus().includes("Match 1 of " + expectedSingleLetterHits) && currentGovernanceGroup().join(",") === "0" && singleLetterBudget() && !member.app.querySelector("mark mark") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  byText(member.app, "button", "Clear search").click();
  check("clearing a windowed search restores exact source text and emphasis with no leftover highlight nodes", governanceMarks().length === 0 && currentGovernanceGroup().length === 0 && matchNavigation.hidden && previousMatch.disabled && nextMatch.disabled && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText && JSON.stringify(member.app.querySelectorAll(".governance-prose strong, .governance-prose code").map(node => ({ tag: node.tagName, text: node.textContent }))) === originalEmphasis);

  // .192: the .191 review follow-ups (N1 first Next, F2 Enter/Shift+Enter, F5
  // restore, F3 whitespace, N2 footer) and the test gaps that review found:
  // escaping a regular expression would not survive, exact counts including
  // list items and table cells, and a restore after another script rewrote an
  // inserted node. Counts are pinned to the reviewed book digest checked above.
  const scrolled192 = [], scrollIntoView192 = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function(options) { scrolled192.push({ node: this, options }); };
  const groupOf192 = mark => mark ? mark.getAttribute("data-governance-match") : null;
  const blockTag192 = mark => mark.closest("p, h2, h3, h4, li, th, td").tagName;
  const independentCount192 = (source, flags) => sourceBlocks.reduce((total, block) => total + [...block.textContent.matchAll(new RegExp(source, flags))].length, 0);
  const treasurerHits192 = independentCount192("Treasurer", "giu");
  const lastTreasurerIndex192 = String(treasurerHits192 - 1);
  const sortedCounts192 = counts => JSON.stringify(Object.keys(counts).sort().map(tag => [tag, counts[tag]]));
  const markedTagCounts192 = () => { const counts = {}; for (const group of governanceGroups()) { const tag = blockTag192(governanceMarks().find(mark => groupOf192(mark) === group)); counts[tag] = (counts[tag] || 0) + 1; } return sortedCounts192(counts); };
  const sourceTagCounts192 = word => { const counts = {}; for (const block of sourceBlocks) { const hits = [...block.textContent.matchAll(new RegExp(word, "giu"))].length; if (hits) counts[block.tagName] = (counts[block.tagName] || 0) + hits; } return sortedCounts192(counts); };
  searchGovernance("Treasurer");
  check(".192 a known office has its exact occurrence count, equal to an independent count of the unmarked source", treasurerHits192 > 40 && governanceGroups().length === treasurerHits192 && matchStatus().includes("Match 1 of " + treasurerHits192) && governanceMarks().every(mark => mark.textContent.toLowerCase() === "treasurer"));
  searchGovernance("access");
  check(".192 the exact count includes list items, table cells, headings and several hits in one block", governanceGroups().length === 104 && independentCount192("access", "giu") === 104 && markedTagCounts192() === sourceTagCounts192("access") && markedTagCounts192() === JSON.stringify([["H3", 3], ["LI", 2], ["P", 98], ["TD", 1]]) && member.app.querySelectorAll(".governance-prose p, .governance-prose li, .governance-prose td, .governance-prose h3").some(block => new Set(block.querySelectorAll("mark.governance-search-match").map(groupOf192)).size > 1) && matchStatus().includes("Match 1 of 104"));
  searchGovernance("No.");
  const literalHit192 = governanceMarks();
  check(".192 a query that a regular expression would read differently is matched literally", independentCount192("No.", "giu") > 100 && governanceGroups().length === 1 && literalHit192.length === 1 && literalHit192[0].textContent === "No." && blockTag192(literalHit192[0]) === "TH" && matchStatus().includes("Match 1 of 1") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  for (const spacedQuery of ["Article S10 Treasury", "  article\tS10   TREASURY "]) {
    searchGovernance(spacedQuery);
    const spaced192 = governanceMarks();
    check(".192 whitespace in the query matches the book's collapsed spacing: " + JSON.stringify(spacedQuery), governanceGroups().length === 1 && spaced192.map(mark => mark.textContent).join("") === "Article S10   Treasury" && blockTag192(spaced192[0]) === "H3" && spaced192[0].closest("h3").textContent.startsWith("Article S10   Treasury") && matchStatus().includes("Match 1 of 1") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  }

  const scrollsBeforeTyping192 = scrolled192.length;
  searchGovernance("Treasurer");
  const scrollsAfterTyping192 = scrolled192.length, typedStatus192 = matchStatus();
  nextMatch.click();
  check(".192 typing selects match 1 without scrolling, and the first Next reveals match 1 instead of skipping to match 2", scrollsAfterTyping192 === scrollsBeforeTyping192 && scrolled192.length === scrollsAfterTyping192 + 1 && groupOf192(scrolled192.at(-1).node) === "0" && currentGovernanceGroup().join(",") === "0" && matchStatus().includes("match 1 of " + treasurerHits192) && scrolled192.at(-1).node.closest("details.governance-chapter").open && member.location.hash === "#/governance");
  check(".192 the reveal announces itself with wording distinct from the typing announcement, for the same match and chapter", typedStatus192.startsWith("Match 1 of " + treasurerHits192 + " · ") && matchStatus() === "Showing match" + typedStatus192.slice("Match".length));
  nextMatch.click();
  check(".192 the next Next advances to match 2", currentGovernanceGroup().join(",") === "1" && groupOf192(scrolled192.at(-1).node) === "1" && matchStatus().includes("Match 2 of " + treasurerHits192));
  searchGovernance("Treasurer"); previousMatch.click();
  check(".192 the first Previous after typing still goes to the last match", currentGovernanceGroup().join(",") === lastTreasurerIndex192 && groupOf192(scrolled192.at(-1).node) === lastTreasurerIndex192 && matchStatus().includes("Match " + treasurerHits192 + " of " + treasurerHits192));
  nextMatch.click();
  check(".192 after Previous, Next wraps straight to match 1", currentGovernanceGroup().join(",") === "0" && groupOf192(scrolled192.at(-1).node) === "0" && matchStatus().includes("Match 1 of " + treasurerHits192));

  const key192 = (key, shift, extra) => { const event = new Event("keydown", { bubbles: true }); event.key = key; event.shiftKey = !!shift; Object.assign(event, extra || {}); governanceSearch.dispatchEvent(event); return event; };
  governanceSearch.focus(); searchGovernance("Treasurer");
  const firstEnter192 = key192("Enter");
  check(".192 Enter in the search field reveals match 1 first, prevents the default action and keeps focus and query", firstEnter192.defaultPrevented && currentGovernanceGroup().join(",") === "0" && matchStatus().startsWith("Showing match 1 of " + treasurerHits192 + " · ") && groupOf192(scrolled192.at(-1).node) === "0" && member.document.activeElement === governanceSearch && governanceSearch.value === "Treasurer");
  const secondEnter192 = key192("Enter");
  check(".192 a second Enter moves to match 2 with focus kept", secondEnter192.defaultPrevented && currentGovernanceGroup().join(",") === "1" && matchStatus().includes("Match 2 of " + treasurerHits192) && member.document.activeElement === governanceSearch);
  const shiftEnter192 = key192("Enter", true);
  check(".192 Shift+Enter moves back to match 1 with focus kept", shiftEnter192.defaultPrevented && currentGovernanceGroup().join(",") === "0" && member.document.activeElement === governanceSearch);
  key192("Enter", true);
  check(".192 Shift+Enter wraps from match 1 to the last match", currentGovernanceGroup().join(",") === lastTreasurerIndex192 && matchStatus().includes("Match " + treasurerHits192 + " of " + treasurerHits192) && member.document.activeElement === governanceSearch);
  searchGovernance("Treasurer");
  const firstShiftEnter192 = key192("Enter", true);
  check(".192 the first Shift+Enter after typing goes to the last match, as Previous does", firstShiftEnter192.defaultPrevented && currentGovernanceGroup().join(",") === lastTreasurerIndex192 && member.document.activeElement === governanceSearch);
  const otherKey192 = key192("a");
  check(".192 other keys in the search field are left alone", !otherKey192.defaultPrevented && currentGovernanceGroup().join(",") === lastTreasurerIndex192);
  searchGovernance("Treasurer");
  const scrollsBeforeIme192 = scrolled192.length;
  const composingEnter192 = key192("Enter", false, { isComposing: true });
  check(".192 an IME composition Enter (isComposing) neither moves nor prevents the default action", !composingEnter192.defaultPrevented && scrolled192.length === scrollsBeforeIme192 && currentGovernanceGroup().join(",") === "0" && matchStatus().startsWith("Match 1 of " + treasurerHits192 + " · ") && member.document.activeElement === governanceSearch);
  const safariCommit192 = key192("Enter", false, { keyCode: 229, isComposing: false });
  check(".192 Safari's composition-commit Enter (keyCode 229) neither moves nor prevents the default action", !safariCommit192.defaultPrevented && scrolled192.length === scrollsBeforeIme192 && currentGovernanceGroup().join(",") === "0" && matchStatus().startsWith("Match 1 of " + treasurerHits192 + " · ") && member.document.activeElement === governanceSearch);
  const afterIme192 = key192("Enter");
  check(".192 after IME Enters the first real Enter still reveals match 1", afterIme192.defaultPrevented && scrolled192.length === scrollsBeforeIme192 + 1 && groupOf192(scrolled192.at(-1).node) === "0" && currentGovernanceGroup().join(",") === "0" && matchStatus().startsWith("Showing match 1 of " + treasurerHits192 + " · "));
  searchGovernance("zzqx no such governance text");
  const emptyEnter192 = key192("Enter");
  check(".192 Enter without matches moves nothing and keeps focus in the field", emptyEnter192.defaultPrevented && governanceMarks().length === 0 && nextMatch.disabled && /No matches/.test(matchStatus()) && member.document.activeElement === governanceSearch);

  // F5: a translator-style script replaces one inserted text node with a <font>
  // wrapper holding the same text. Browsers throw NotFoundError for a missing
  // reference or child, which the minimal DOM does not; model that here only.
  const insertBefore192 = Node.prototype.insertBefore, removeChild192 = Node.prototype.removeChild;
  Node.prototype.insertBefore = function(child, ref) { if (ref && !this.childNodes.includes(ref)) throw new Error("NotFoundError: the reference node is not a child"); return insertBefore192.call(this, child, ref); };
  Node.prototype.removeChild = function(child) { if (!this.childNodes.includes(child)) throw new Error("NotFoundError: the node is not a child"); return removeChild192.call(this, child); };
  try {
    const textNodes192 = node => node.nodeType === 3 ? [node] : node.childNodes.flatMap(textNodes192);
    const originalTexts192 = new Set(sourceBlocks.flatMap(textNodes192));
    const originalBlockTexts192 = new Map(sourceBlocks.map(block => [block, textNodes192(block)]));
    searchGovernance("Treasurer");
    const insertedNeighbour192 = mark => { const siblings = mark.parentNode.childNodes, at = siblings.indexOf(mark); return [siblings[at - 1], siblings[at + 1]].find(node => node && node.nodeType === 3 && !originalTexts192.has(node)) || null; };
    const rewritten192 = insertedNeighbour192(governanceMarks().find(mark => insertedNeighbour192(mark) && !mark.closest("p, h2, h3, h4, li, th, td").textContent.includes("Federal Treasurer. Coordinates")));
    const rewrittenBlock192 = sourceBlocks.find(block => block.contains(rewritten192)), rewrittenParent192 = rewritten192.parentNode;
    const intactBlock192 = sourceBlocks.find(block => block !== rewrittenBlock192 && !block.textContent.includes("Federal Treasurer. Coordinates") && !!block.querySelector("mark.governance-search-match"));
    const font192 = new Element("font"); font192.appendChild(new Text(rewritten192.textContent));
    insertBefore192.call(rewrittenParent192, font192, rewritten192); removeChild192.call(rewrittenParent192, rewritten192);
    let restoreError192 = null;
    try { searchGovernance("Federal Treasurer. Coordinates"); } catch (error) { restoreError192 = error; }
    check(".192 a search after another script replaced an inserted text node does not throw and leaves no stale highlight", restoreError192 === null && governanceGroups().join(",") === "0" && governanceMarks().map(mark => mark.textContent).join("") === "Federal Treasurer. Coordinates" && !font192.querySelector("mark") && rewrittenBlock192.textContent === [...originalBlockTexts192.get(rewrittenBlock192)].map(node => node.textContent).join("") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText, String(restoreError192));
    let laterError192 = null;
    try { searchGovernance("Treasurer"); byText(member.app, "button", "Clear search").click(); } catch (error) { laterError192 = error; }
    const intactNodes192 = textNodes192(intactBlock192), originalIntact192 = originalBlockTexts192.get(intactBlock192);
    check(".192 later searches keep working and intact highlights still restore the exact original text nodes", laterError192 === null && governanceMarks().length === 0 && matchNavigation.hidden && !!intactBlock192 && intactNodes192.length === originalIntact192.length && intactNodes192.every((node, i) => node === originalIntact192[i]) && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText, String(laterError192));
    // A translator that wraps every text node: in another block, the text it
    // rewrites is a later inserted node (not the first) and the mark's own text.
    // Putting the original node back there would duplicate text, so the entry is
    // left as rewritten; the mark is unwrapped and the wrapper inside it stays.
    let trailingError192 = null, trailingOk192 = false;
    try {
      searchGovernance("Treasurer");
      const trailing192 = governanceMarks().find(mark => { const block = mark.closest("p, h2, h3, h4, li, th, td"), after = mark.parentNode.childNodes[mark.parentNode.childNodes.indexOf(mark) + 1]; return !!block && block !== intactBlock192 && block !== rewrittenBlock192 && !block.textContent.includes("Federal Treasurer. Coordinates") && !!after && after.nodeType === 3 && !originalTexts192.has(after) && mark.childNodes.length === 1 && mark.firstChild.nodeType === 3; });
      const trailingBlock192 = trailing192.closest("p, h2, h3, h4, li, th, td"), trailingParent192 = trailing192.parentNode, trailingBlockText192 = trailingBlock192.textContent;
      const afterText192 = trailingParent192.childNodes[trailingParent192.childNodes.indexOf(trailing192) + 1];
      const afterFont192 = new Element("font"); afterFont192.appendChild(new Text(afterText192.textContent));
      insertBefore192.call(trailingParent192, afterFont192, afterText192); removeChild192.call(trailingParent192, afterText192);
      const markFont192 = new Element("font"), markText192 = trailing192.firstChild;
      removeChild192.call(trailing192, markText192); markFont192.appendChild(markText192); trailing192.appendChild(markFont192);
      searchGovernance("Federal Treasurer. Coordinates");
      trailingOk192 = !trailingBlock192.querySelector("mark") && trailingBlock192.textContent === trailingBlockText192 && markFont192.parentNode === trailingParent192 && markFont192.textContent.toLowerCase() === "treasurer" && afterFont192.parentNode === trailingParent192 && governanceMarks().map(mark => mark.textContent).join("") === "Federal Treasurer. Coordinates" && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText;
      byText(member.app, "button", "Clear search").click();
    } catch (error) { trailingError192 = error; }
    check(".192 a rewritten later node is not restored over (no duplicated text), and the mark is unwrapped keeping the wrapper inside it", trailingError192 === null && trailingOk192, String(trailingError192));
  } finally {
    Node.prototype.insertBefore = insertBefore192; Node.prototype.removeChild = removeChild192;
  }

  // Another script replaces a highlighted inline element with a deep copy (as
  // cloneNode(true) would; the minimal DOM has none, so copy it here). The copied
  // mark was never in the replacement list. Clearing must still leave no
  // highlight, and the next search must not nest a mark inside a stale one.
  const deepCopy192 = node => { if (node.nodeType === 3) return new Text(node.textContent); const copy = new Element(node.tagName.toLowerCase()); Object.assign(copy.attributes, node.attributes); for (const child of node.childNodes) copy.appendChild(deepCopy192(child)); return copy; };
  searchGovernance("Federal Treasurer. Coordinates");
  const strong192 = member.app.querySelectorAll(".governance-prose strong").find(node => node.textContent === "Federal Treasurer." && !!node.querySelector("mark.governance-search-match"));
  const strongCopy192 = deepCopy192(strong192), strongHost192 = strong192.parentNode;
  strongHost192.insertBefore(strongCopy192, strong192); strongHost192.removeChild(strong192);
  const copiedMark192 = !!strongCopy192.querySelector("mark.governance-search-match");
  let copyError192 = null;
  try { byText(member.app, "button", "Clear search").click(); } catch (error) { copyError192 = error; }
  check(".192 Clear search after another script deep-copied a highlighted element leaves no stale highlight and exact text", copiedMark192 && copyError192 === null && governanceMarks().length === 0 && !strongCopy192.querySelector("mark") && strongCopy192.textContent === "Federal Treasurer." && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText, String(copyError192));
  searchGovernance("Treasurer");
  check(".192 the next search after a deep copy keeps the exact count and nests no highlight", governanceGroups().length === treasurerHits192 && !member.app.querySelector("mark mark") && !!strongCopy192.querySelector("mark.governance-search-match") && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  byText(member.app, "button", "Clear search").click();

  // A block another script shortened after indexing yields no mark for its match.
  // Navigating there opens the chapter without scrolling and without a TypeError.
  searchGovernance("e");
  const shortenedBlock192 = [...sourceBlocks].reverse().find(block => /e/i.test(block.textContent)), shortenedChapter192 = shortenedBlock192.closest("details.governance-chapter");
  const unpainted192 = !shortenedBlock192.querySelector("mark"), savedChildren192 = [...shortenedBlock192.childNodes];
  for (const child of savedChildren192) shortenedBlock192.removeChild(child);
  shortenedBlock192.appendChild(new Text("x")); shortenedChapter192.open = false;
  const scrollsBeforeShortened192 = scrolled192.length; let shortenedError192 = null;
  try { previousMatch.click(); } catch (error) { shortenedError192 = error; }
  check(".192 moving to a match whose block another script shortened opens its chapter without scrolling or a missing-mark error", unpainted192 && shortenedError192 === null && matchStatus().startsWith("Match " + expectedSingleLetterHits + " of " + expectedSingleLetterHits + " · ") && shortenedChapter192.open && scrolled192.length === scrollsBeforeShortened192 && currentGovernanceGroup().length === 0 && singleLetterBudget() && !shortenedBlock192.querySelector("mark"), String(shortenedError192));
  byText(member.app, "button", "Clear search").click();
  shortenedBlock192.removeChild(shortenedBlock192.firstChild);
  for (const child of savedChildren192) shortenedBlock192.appendChild(child);
  check(".192 after that search is cleared the shortened block's original nodes return and the book text is exact", governanceMarks().length === 0 && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);

  const css192 = fs.readFileSync(path.join(root, "public/static/app.css"), "utf8"), printAt192 = css192.indexOf("@media print");
  const screenCss192 = css192.slice(0, printAt192), printCss192 = css192.slice(printAt192);
  searchGovernance("Treasurer");
  const shell192 = member.app.querySelector("main.shell"), footer192 = member.app.querySelector("footer.footer"), chrome192 = footer192 && footer192.parentNode;
  check(".192 while searching, the fixed navigator's space is reserved below the footer, so the footer is not covered", shell192.classList.contains("governance-searching") && shell192.parentNode === chrome192 && chrome192.childNodes.indexOf(footer192) > chrome192.childNodes.indexOf(shell192) && /\n\.governance-searching ~ \.footer \{ padding-bottom: (1[5-9]\d|[2-9]\d\d)px; \}/.test(screenCss192) && screenCss192.includes("  .governance-searching ~ .footer { padding-bottom: 200px; }") && !/\.governance-searching \{/.test(css192) && /\.governance-match-nav \{ position: fixed; bottom: 12px;/.test(screenCss192) && printCss192.includes(".governance-match-nav { display: none !important; }") && printCss192.includes(".governance-searching ~ .footer { padding-bottom: 0; }"));
  const liveStatus192 = matchNavigation.querySelector('[role="status"]');
  check(".192 the match status stays a polite atomic live region", liveStatus192.getAttribute("aria-live") === "polite" && liveStatus192.getAttribute("aria-atomic") === "true");
  byText(member.app, "button", "Clear search").click();
  check(".192 clearing the search removes the footer reservation and every highlight", !shell192.classList.contains("governance-searching") && governanceMarks().length === 0 && matchNavigation.hidden && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  Element.prototype.scrollIntoView = scrollIntoView192;

  const bookSearch = member.app.querySelector("#governance-search"), printStates = [], originalPrint = member.window.print;
  bookSearch.value = "Independent auditor warrant"; fire(bookSearch, "input");
  const nativeChapters = member.app.querySelectorAll("details.governance-chapter"), searchStatus = member.app.querySelector('.governance-controls p[role="status"]');
  const markedReaderState = () => JSON.stringify(governanceMarks().map(mark => ({ text: mark.textContent, group: mark.getAttribute("data-governance-match"), current: mark.getAttribute("aria-current") })));
  const beforePrintHighlights = markedReaderState();
  nativeChapters[0].open = true; // retain an independently expanded, currently hidden chapter too
  const readerState = () => JSON.stringify({ scopeOpen: adoption.open, search: bookSearch.value, count: searchStatus.textContent, chapters: nativeChapters.map(chapter => ({ open: chapter.open, hidden: chapter.hidden })) });
  const beforeButtonPrint = readerState();
  const filteredBeforePrint = member.app.querySelectorAll("details.governance-chapter").filter(chapter => !chapter.hidden).length === 1 && !adoption.open;
  member.window.print = () => { member.window.dispatchEvent(new Event("beforeprint")); printStates.push({ scopeOpen: adoption.open, scopeText: adoption.textContent, chapters: member.app.querySelectorAll("details.governance-chapter").map(chapter => ({ open: chapter.open, hidden: chapter.hidden })), archiveOpen: archive?.open ?? false }); };
  byText(member.app, "button", "Print current R7 book").click();
  member.window.print = originalPrint;
  check("printing a filtered book opens all current chapters and the full adoption scope before the print dialog", filteredBeforePrint && printStates.length === 1 && printStates[0].scopeOpen === true && printStates[0].scopeText.includes("Adoption issues no individual appointment or named signature") && printStates[0].scopeText.includes("changes no native rank, bank limit or platform permission") && printStates[0].chapters.length === 20 && printStates[0].chapters.every(chapter => chapter.open && !chapter.hidden) && printStates[0].archiveOpen === false);
  member.window.dispatchEvent(new Event("afterprint"));
  check("button preparation followed by native beforeprint snapshots once and restores the exact filtered reader afterward", readerState() === beforeButtonPrint);
  check("printing keeps the same literal highlights, logical match selection and complete source text", markedReaderState() === beforePrintHighlights && JSON.stringify(governanceSourceText()) === unmarkedGovernanceText);
  adoption.open = true; bookSearch.value = "Independent auditor warrant"; fire(bookSearch, "input");
  const beforeNativePrint = readerState();
  member.window.dispatchEvent(new Event("beforeprint"));
  check("native browser printing expands the live book and adoption scope without the page Print button", adoption.open === true && nativeChapters.every(chapter => chapter.open && !chapter.hidden) && !archive && member.window.listeners.beforeprint.length === 1);
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

  const chapterReader = await openPage(MEMBER);
  await chapterReader.go("#/governance/3-letters-patent-and-warrants");
  await waitFor(() => chapterReader.app.querySelectorAll("details.governance-chapter").length === 20, "governance search existing deep chapter");
  const linkedChapter = chapterReader.app.querySelector('[data-chapter="3-letters-patent-and-warrants"]');
  check("existing deep chapter links still open the complete requested chapter with unfiltered navigation", linkedChapter.open && chapterReader.app.querySelector('a[aria-current="location"]').getAttribute("href") === "#/governance/3-letters-patent-and-warrants" && chapterReader.app.querySelectorAll("details.governance-chapter").every(chapter => !chapter.hidden) && chapterReader.app.querySelector(".governance-match-nav").hidden && chapterReader.app.querySelectorAll("mark").length === 0 && !!byText(chapterReader.app, "a", "Previous chapter")?.getAttribute("href") && !!byText(chapterReader.app, "a", "Next chapter")?.getAttribute("href"));

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

  // .178: the .177 audit's native keyboard actions. The original minimal DOM
  // does not synthesize Enter/Space activation; native semantics are checked
  // here, with genuine read effects. Desktop/mobile keyboard use is separate.
  const accessibility178 = await openPage(STAFF), reads178 = [];
  accessibility178.before((pathname, init) => { reads178.push({ pathname, method: init.method || "GET" }); return false; });
  await accessibility178.go("#/admin/lookup/Mi");
  await waitFor(() => accessibility178.app.querySelectorAll("a.lookup-result").length >= 2, ".178 actual character and site search results");
  const realResults178 = accessibility178.app.querySelectorAll("a.lookup-result");
  check(".178 real character and site lookup results are named native links to their exact account", realResults178.length >= 2 && realResults178.every(link => link.getAttribute("href") === "#/admin/lookup/" + MEMBER && link.getAttribute("aria-label")?.startsWith("Look up ") && link.getAttribute("tabindex") === null));
  const memberLink178 = realResults178[0]; memberLink178.focus();
  await accessibility178.go(memberLink178.getAttribute("href")); // Native anchor following is performed by the browser, not this DOM fixture.
  await waitFor(() => !!byText(accessibility178.app, "dt", "On this site"), ".178 actual account panel from native destination");
  check(".178 following a lookup result re-reads the exact account without changing site state", !!byText(accessibility178.app, "dt", "On this site") && accessibility178.app.textContent.includes(MEMBER) && reads178.filter(r => r.pathname === "/api/admin/lookup?q=" + MEMBER).length === 1);
  // Discord itself is the existing fake provider. This one display fixture
  // adds a Discord search result for the already genuine account; its native
  // destination still goes through the real Worker's fresh admin read.
  accessibility178.answer(pathname => pathname === "/api/admin/lookup?q=Discord" ? { discord: [{ id: MEMBER, label: "Mia Discord" }], characters: [], site: [] } : null);
  await accessibility178.go("#/admin/lookup/Discord");
  await waitFor(() => !!accessibility178.app.querySelector("a.lookup-result"), ".178 Discord-result display fixture");
  const discordLink178 = accessibility178.app.querySelector("a.lookup-result");
  check(".178 Discord lookup result has the same named native account destination", discordLink178?.getAttribute("href") === "#/admin/lookup/" + MEMBER && discordLink178.getAttribute("aria-label") === "Look up Mia Discord" && discordLink178.getAttribute("tabindex") === null);
  accessibility178.answer(null);
  await accessibility178.go(discordLink178.getAttribute("href"));
  await waitFor(() => !!byText(accessibility178.app, "dt", "On this site"), ".178 Discord-result genuine destination");
  check(".178 provider-result destination is a genuine fresh admin account read", reads178.filter(r => r.pathname === "/api/admin/lookup?q=" + MEMBER).length === 2 && accessibility178.app.textContent.includes(MEMBER));

  await fixtureRun("INSERT INTO site_board_votes (voter_id,candidate_id,role_key,vote,created_at,updated_at) VALUES (?,?,'officer',1,?,?)", MEMBER, OTHER, now, now);
  await fixtureRun("INSERT INTO site_votes (voter_id,ballot,slot,nominee_kind,nominee_key,nominee_label,created_at,updated_at) VALUES (?,'officer',1,'discord',?,'Oz',?,?)", MEMBER, OTHER, now, now);
  await accessibility178.go("#/admin/votes/officer");
  await waitFor(() => accessibility178.app.querySelectorAll("button.row-detail-open").length === 2, ".178 board and write-in native detail actions");
  const details178 = accessibility178.app.querySelectorAll("button.row-detail-open");
  check(".178 each populated board and write-in row exposes one named native button", details178.length === 2 && details178.every(button => button.getAttribute("type") === "button" && button.getAttribute("tabindex") === null && /Show (votes|write-ins) for Oz \(@u04\): Officer/.test(button.getAttribute("aria-label"))));
  details178[0].focus(); details178[0].click();
  await waitFor(() => !!accessibility178.document.body.querySelector("dialog"), ".178 board votes dialog");
  const boardDialog178 = accessibility178.document.body.querySelector("dialog");
  check(".178 native board button opens one genuine voter dialog with exactly one fresh GET", !!boardDialog178 && boardDialog178.textContent.includes("Oz (@u04): Officer") && boardDialog178.textContent.includes("Mia") && reads178.filter(r => r.pathname.startsWith("/api/admin/board/voters?")).length === 1 && accessibility178.document.body.querySelectorAll("dialog").length === 1);
  boardDialog178.close(); details178[1].focus(); details178[1].click();
  await waitFor(() => !!accessibility178.document.body.querySelector("dialog"), ".178 write-in voters dialog");
  const writeInDialog178 = accessibility178.document.body.querySelector("dialog");
  check(".178 native write-in button opens one genuine voter dialog with exactly one fresh GET", !!writeInDialog178 && writeInDialog178.textContent.includes("Oz (@u04): Officer") && writeInDialog178.textContent.includes("Mia") && reads178.filter(r => r.pathname.startsWith("/api/admin/votes/voters?")).length === 1 && accessibility178.document.body.querySelectorAll("dialog").length === 1);
  writeInDialog178.close(); details178[0].closest("tr").querySelector("td").click();
  await waitFor(() => !!accessibility178.document.body.querySelector("dialog"), ".178 retained pointer row shortcut");
  check(".178 pointer row shortcut retains one fresh dialog read", reads178.filter(r => r.pathname.startsWith("/api/admin/board/voters?")).length === 2 && accessibility178.document.body.querySelectorAll("dialog").length === 1);
  accessibility178.document.body.querySelector("dialog").close();
  await accessibility178.go("#/admin/applications/" + OTHER);
  await waitFor(() => !!accessibility178.app.querySelector("table.admin-application-board a.admin-board-role"), ".178 application board native role link");
  const boardRole178 = accessibility178.app.querySelector("table.admin-application-board a.admin-board-role");
  check(".178 application board role is a native named link retaining all five table fields", boardRole178?.getAttribute("href") === "#/admin/votes/officer" && boardRole178.getAttribute("aria-label") === "Open Officer voting details" && boardRole178.querySelector(".admin-board-role-label")?.textContent === "Officer" && accessibility178.app.querySelector("table.admin-application-board").querySelectorAll("th").length === 5);
  await accessibility178.go(boardRole178.getAttribute("href"));
  await waitFor(() => accessibility178.app.querySelectorAll("button.row-detail-open").length === 2, ".178 application board destination");
  check(".178 detail navigation retains the two admitted native voting actions and performs no writes", accessibility178.app.querySelectorAll("button.row-detail-open").length === 2 && reads178.length > 8 && reads178.every(r => r.method === "GET") && one("SELECT vote FROM site_board_votes WHERE voter_id=? AND candidate_id=? AND role_key='officer'", MEMBER, OTHER).vote === 1);
  const attribution178 = accessibility178.app.querySelector("footer").textContent;
  check("the footer credits the default stills, optional client-derived animation, guild crest and game assets separately", attribution178.includes("default login backgrounds are custom AI-generated stills") && attribution178.includes("optional portal animation is a guild render of the World of Warcraft Classic Era client model and textures") && attribution178.includes("Olympus crest is the guild's own logo") && attribution178.includes("game interface artwork and icons come from the World of Warcraft game client") && attribution178.includes("International Typeface Corporation") && attribution178.includes("Kiwi Media/Design"));


  // .218: actual App/Worker fixture; only the completed read response is substituted.
  // These checks qualify refusal presentation, not production throttling or a changed allowance.
  {
    const refusal218 = () => new Response(JSON.stringify({ error: "slow_down", message: "Too many pages in one minute. Wait a moment, then carry on." }), { status: 429, headers: { "Content-Type": "application/json" } });
    const isBoardRole218 = pathname => pathname.startsWith("/api/board/");
    const hasRefusal218 = page => page.app.querySelector(".board-results [role=alert]")?.textContent === "Applications could not be checked. Too many pages in one minute. Wait a moment, then carry on.";
    const freshBoard218 = page => page.app.querySelector(".board-results")?.getAttribute("aria-busy") === "false" && !!page.app.querySelector(".board-results")?.dataset.boardFresh;
    const limited218 = await openPage(MEMBER), reads218 = [];
    limited218.before((pathname, init) => { if (pathname === "/api/board" || isBoardRole218(pathname)) reads218.push([pathname, init.method || "GET"]); return false; });
    limited218.answer(pathname => isBoardRole218(pathname) ? refusal218() : null);
    limited218.hold(pathname => pathname === "/api/board" ? 100 : 0);
    await limited218.go("#/vote/office_26");
    await waitFor(() => hasRefusal218(limited218), ".218 terminal board429");
    const failedBoard218 = limited218.app.querySelector(".board-results");
    check(".218 a completed board429 ends busy with one local alert and no fresh or actionable results", failedBoard218?.getAttribute("aria-busy") === "false" && !failedBoard218.dataset.boardFresh && hasRefusal218(limited218) && failedBoard218.querySelectorAll("[role=alert]").length === 1 && !failedBoard218.textContent.includes("Checking applications") && !failedBoard218.querySelector(".cand") && !limited218.app.textContent.includes("Something went wrong"));
    await new Promise(resolve => setTimeout(resolve, 140));
    check(".218 a late admitted summary cannot turn the refused role into a fresh board or start a retry", hasRefusal218(limited218) && !failedBoard218.dataset.boardFresh && reads218.filter(row => isBoardRole218(row[0])).length === 1 && reads218.every(row => row[1] === "GET"));
    const chooser218 = limited218.app.querySelector(".role-pick");
    limited218.answer(null); limited218.hold(null);
    await limited218.go("#/vote/raid_leader_na");
    await waitFor(() => freshBoard218(limited218), ".218 fresh manual role navigation");
    check(".218 ordinary manual navigation permits one new admitted role read without retaining the refusal", limited218.app.querySelector(".role-pick") === chooser218 && freshBoard218(limited218) && limited218.app.querySelector(".board-results").dataset.boardFresh === "raid_leader_na" && !hasRefusal218(limited218) && reads218.filter(row => isBoardRole218(row[0])).length === 2);

    const stale218 = await openPage(MEMBER);
    stale218.answer(pathname => pathname.startsWith("/api/board/office_26?") ? refusal218() : null);
    stale218.hold(pathname => pathname.startsWith("/api/board/office_26?") ? 100 : 0);
    await stale218.go("#/vote/office_26");
    await stale218.go("#/vote/raid_leader_eu");
    await waitFor(() => freshBoard218(stale218), ".218 replacement board");
    await new Promise(resolve => setTimeout(resolve, 140));
    check(".218 a late prior-role429 cannot replace the newer fresh role or add a global error", freshBoard218(stale218) && stale218.app.querySelector(".board-results").dataset.boardFresh === "raid_leader_eu" && !hasRefusal218(stale218) && !stale218.app.textContent.includes("Something went wrong"));

    const draft218 = await openPage(MEMBER);
    await draft218.go("#/vote/officer"); await waitFor(() => freshBoard218(draft218) && !!draft218.app.querySelector('.board-results select'), ".218 populated filter board");
    const nomination218 = draft218.app.querySelector('input[placeholder="Why them? (optional)"]');
    if (!nomination218) throw Error("original admitted nomination reason fixture required");
    nomination218.value = "PRESERVE_PENDING_NOMINATION_218"; fire(nomination218, "input");
    draft218.answer(pathname => isBoardRole218(pathname) ? refusal218() : null);
    fire(draft218.app.querySelector('.board-results select'), "change");
    await waitFor(() => hasRefusal218(draft218), ".218 filter429");
    check(".218 a refused filter read removes old candidate actions but preserves the exact unsaved nomination node", hasRefusal218(draft218) && !draft218.app.querySelector(".board-results").dataset.boardFresh && !draft218.app.querySelector(".board-results .cand") && nomination218.isConnected && draft218.app.querySelector('input[placeholder="Why them? (optional)"]') === nomination218 && nomination218.value === "PRESERVE_PENDING_NOMINATION_218");
    await draft218.go("#/roles");
    check(".218 board429 does not clear the existing dirty-navigation confirmation", !!draft218.document.body.querySelector("dialog") && nomination218.isConnected && nomination218.value === "PRESERVE_PENDING_NOMINATION_218");

    for (const why218 of ["no_vote", "appointed"]) {
      const closed218 = await openPage(MEMBER);
      closed218.answer(pathname => pathname.startsWith("/api/board/officer?") ? new Response(JSON.stringify({ error: why218, appointed: "Synthetic appointed holder", message: "Current role closure" }), { status: 409, headers: { "Content-Type": "application/json" } }) : null);
      await closed218.go("#/vote/officer");
      await waitFor(() => !closed218.app.querySelector(".board-results"), ".218 original " + why218 + " closure");
      check(".218 original " + why218 + " handling still replaces board and write-ins with dedicated closure", !closed218.app.querySelector(".board-results") && !closed218.app.querySelector("button.vote") && !byText(closed218.app, "button", "Save nominations") && closed218.app.textContent.includes(why218 === "appointed" ? "filled by appointment rather than by the board" : "No public vote"));
    }
    const session218 = await openPage(MEMBER);
    session218.answer(pathname => isBoardRole218(pathname) ? new Response('{"error":"signed_out"}', { status: 401, headers: { "Content-Type": "application/json" } }) : null);
    await session218.go("#/vote/officer");
    await waitFor(() => session218.location.replaced, ".218 API401 document replacement", 8000);
    check(".218 a role401 clears the board and private header before returning to sign-in", session218.location.navigated === '/?entry=session-ended'
      && !!session218.app.querySelector('[data-session-ending]') && !session218.app.querySelector(".board-results, header") && !session218.app.textContent.includes("Applications could not be checked"));
    const denied218 = await openPage(MEMBER);
    denied218.answer(pathname => pathname === "/api/board" ? new Response('{"error":"site_forbidden"}', { status: 403, headers: { "Content-Type": "application/json" } }) : null);
    denied218.hold(pathname => isBoardRole218(pathname) ? 100 : 0);
    await denied218.go("#/vote/officer");
    await waitFor(() => denied218.app.querySelector(".role-pick")?.disabled, ".218 unchanged summary403");
    await new Promise(resolve => setTimeout(resolve, 140));
    check(".218 original summary403 still disables controls and fences its late admitted role response", denied218.app.querySelector(".role-pick")?.disabled === true && denied218.app.querySelector(".board-results")?.getAttribute("aria-busy") === "false" && !denied218.app.querySelector(".board-results .cand") && !denied218.app.textContent.includes("Applications could not be checked"));
  }


  {
    const board066 = page => page.app.querySelector(".board-results");
    const counts066 = page => page.app.querySelector(".board-summary-status");
    const roleRead066 = path => path.startsWith("/api/board/") && path.includes("?");
    const alert066 = node => node?.querySelector('[role="alert"]');
    const retry066 = node => node?.querySelector("button");
    const fail066 = status => Response.json({ message: "INTERNAL_DIAGNOSTIC_066" }, { status });
    const recovering066 = await openPage(MEMBER), requests066 = [];
    let failRole066 = true, failSummary066 = true;
    recovering066.intercept((pathname, init) => {
      if (pathname !== "/api/board" && !roleRead066(pathname)) return null;
      requests066.push([pathname, init.method]);
      return pathname === "/api/board" ? failSummary066 && fail066(503) : failRole066 && fail066(500);
    });
    await recovering066.go("#/vote/officer");
    await waitFor(() => alert066(board066(recovering066)) && alert066(counts066(recovering066)), "CC066 two section-local read failures");
    const badRole066 = board066(recovering066), badSummary066 = counts066(recovering066);
    check("CC066 failed role and counts reads stop loading and give separate explicit recovery without raw diagnostics",
      badRole066.getAttribute("aria-busy") === "false" && alert066(badRole066)?.textContent === "Applications could not be checked."
      && alert066(badSummary066)?.textContent === "Role counts could not be checked."
      && retry066(badRole066)?.textContent === "Retry applications" && retry066(badSummary066)?.textContent === "Retry role counts"
      && recovering066.app.querySelector("#role-applicants").textContent === "Applicant count unavailable"
      && !recovering066.app.textContent.includes("Checking applications") && !recovering066.app.textContent.includes("INTERNAL_DIAGNOSTIC_066")
      && !recovering066.app.textContent.includes("Something went wrong") && requests066.length === 2);
    const oldRoleRetry066 = retry066(badRole066);
    failRole066 = false;
    oldRoleRetry066?.click(); oldRoleRetry066?.click();
    await waitFor(() => board066(recovering066)?.dataset.boardFresh === "officer", "CC066 explicit selected-role recovery");
    check("CC066 clicking role retry twice performs one current GET and leaves failed summary independent",
      board066(recovering066)?.dataset.boardFresh === "officer" && alert066(badSummary066)
      && requests066.filter(([path]) => roleRead066(path)).length === 2 && requests066.filter(([path]) => path === "/api/board").length === 1);
    failSummary066 = false;
    const oldCountsRetry066 = retry066(badSummary066);
    oldCountsRetry066?.click(); oldCountsRetry066?.click();
    await waitFor(() => badSummary066.textContent === "", "CC066 explicit counts recovery");
    check("CC066 clicking counts retry twice performs one summary GET without refetching role or writing",
      badSummary066.textContent === "" && requests066.length === 4 && requests066.every(([, method]) => method === "GET"));

    const malformed066 = await openPage(MEMBER);
    malformed066.intercept(path => path === "/api/board" ? Response.json({ roles: [{ key: "officer", applicants: -1, votable: 0, voted: 0 }] })
      : roleRead066(path) ? Response.json({ role: { key: "raid_leader_eu" }, total: 0, votable: 0, voted: 0, matching: 0, offset: 0, pageSize: 20, candidates: [], votingOpen: true }) : null);
    await malformed066.go("#/vote/officer");
    await waitFor(() => alert066(board066(malformed066)) && alert066(counts066(malformed066)), "CC066 malformed success refused");
    check("CC066 malformed summary and a mismatched role200 cannot become an empty or admitted board",
      !!retry066(board066(malformed066)) && !!retry066(counts066(malformed066)) && !board066(malformed066).dataset.boardFresh
      && !malformed066.app.textContent.includes("No historical applications") && !malformed066.app.textContent.includes("Something went wrong"));

    const draft066 = await openPage(MEMBER), filters066 = [];
    let failFilter066 = false;
    draft066.intercept(path => {
      if (!roleRead066(path)) return null;
      filters066.push(path);
      return failFilter066 ? fail066(502) : null;
    });
    await draft066.go("#/vote/officer");
    await waitFor(() => !!board066(draft066)?.querySelector("select"), "CC066 filter board");
    const nomination066 = draft066.app.querySelector('input[placeholder="Why them? (optional)"]');
    nomination066.value = "KEEP_NOMINATION_066"; fire(nomination066, "input");
    failFilter066 = true;
    const classFilter066 = board066(draft066).querySelector("select");
    classFilter066.value = "mage"; fire(classFilter066, "change");
    await waitFor(() => !!retry066(board066(draft066)), "CC066 filter failure");
    failFilter066 = false;
    retry066(board066(draft066))?.click();
    await waitFor(() => board066(draft066)?.dataset.boardFresh === "officer", "CC066 filtered retry admitted");
    check("CC066 retry reuses the failed filter and preserves the exact unsaved nomination node",
      filters066.length === 3 && filters066[1] === filters066[2] && filters066[2].includes("class=mage")
      && draft066.app.querySelector('input[placeholder="Why them? (optional)"]') === nomination066 && nomination066.value === "KEEP_NOMINATION_066");
    await draft066.go("#/roles");
    check("CC066 read recovery leaves the nomination's unsaved-navigation guard in place",
      !!draft066.document.body.querySelector("dialog") && nomination066.isConnected);

    const deadline066 = await openPage(MEMBER);
    let release066, attempts066 = 0;
    deadline066.intercept(path => {
      if (!roleRead066(path) || ++attempts066 !== 1) return null;
      return new Promise(resolve => { release066 = resolve; });
    });
    await deadline066.go("#/vote/officer");
    await waitFor(() => !!retry066(board066(deadline066)), "CC066 board read deadline", 12000);
    check("CC066 an unanswered read becomes a timed-out alert without an automatic second request",
      attempts066 === 1 && board066(deadline066)?.getAttribute("aria-busy") === "false" && alert066(board066(deadline066))?.textContent.endsWith("The read took too long."));
    retry066(board066(deadline066))?.click();
    await waitFor(() => board066(deadline066)?.dataset.boardFresh === "officer", "CC066 manual retry after deadline");
    release066(Response.json({ error: "signed_out" }, { status: 401 }));
    await settle(); await settle();
    check("CC066 a timed-out reply cannot sign out or overwrite the successfully retried role",
      attempts066 === 2 && board066(deadline066)?.dataset.boardFresh === "officer" && !!byText(deadline066.app, "button", "Sign out"));
  }

  // .218: pin the minimal DOM's dataset deletion contract independently of board rendering.
  {
    const fromDataset218 = new Element("div");
    fromDataset218.dataset.boardFresh = "prior-admitted-role";
    fromDataset218.dataset.boardRequest = "7";
    const deletedDataset218 = Reflect.deleteProperty(fromDataset218.dataset, "boardFresh");
    check(".218 minimal DOM dataset-set deletion removes both property and data attribute without touching another key", deletedDataset218 === true && fromDataset218.dataset.boardFresh === undefined && !Object.hasOwn(fromDataset218.dataset, "boardFresh") && fromDataset218.getAttribute("data-board-fresh") === null && !fromDataset218.hasAttribute("data-board-fresh") && fromDataset218.dataset.boardRequest === "7" && fromDataset218.getAttribute("data-board-request") === "7");
    const fromAttribute218 = new Element("div");
    fromAttribute218.setAttribute("data-board-fresh", "attribute-only-role");
    fromAttribute218.setAttribute("data-unrelated", "keep-this-attribute");
    const deletedAttribute218 = Reflect.deleteProperty(fromAttribute218.dataset, "boardFresh");
    check(".218 minimal DOM attribute-set deletion removes the fallback attribute and is repeatable", deletedAttribute218 === true && fromAttribute218.dataset.boardFresh === undefined && !Object.hasOwn(fromAttribute218.dataset, "boardFresh") && fromAttribute218.getAttribute("data-board-fresh") === null && !fromAttribute218.hasAttribute("data-board-fresh") && Reflect.deleteProperty(fromAttribute218.dataset, "boardFresh") === true && fromAttribute218.getAttribute("data-unrelated") === "keep-this-attribute");
  }

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution174 = new Module(__filename, module);
execution174.filename = __filename;
execution174.paths = Module._nodeModulePaths(__dirname);
execution174._compile(fixture174.slice(0, starts174[0].index) + "\n" + body174, __filename);
