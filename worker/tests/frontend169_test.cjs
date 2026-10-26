// .169: the exact page script and real Worker behind the existing minimal-DOM fixture.
// This additive leaf covers navigation, bounded avatar presentation, tool disposal and
// read-only Vote response ordering. Tool mounts and readable response payloads are
// controlled fixtures; this does not qualify third-party data or a production session.
// Run from worker/: node tests/frontend169_test.cjs
const fs169 = require("node:fs"), path169 = require("node:path"), { Module } = require("node:module");
const fixture169 = path169.join(__dirname, "frontend_check.cjs");
const fixtureSource169 = fs169.readFileSync(fixture169, "utf8");
const starts169 = [...fixtureSource169.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts169.length !== 1) throw new Error("one existing frontend fixture boundary required");
const body169 = String.raw`
// Browser OPTION.value is a reflected attribute. The original small fixture's
// input/select property model does not model this, but actual app selectors do.
const value169 = Object.getOwnPropertyDescriptor(Element.prototype, "value");
Object.defineProperty(Element.prototype, "value", { ...value169, set(value) {
  value169.set.call(this, value);
  if (this.tagName === "OPTION") this.setAttribute("value", value);
} });
const pause169 = ms => new Promise(resolve => setTimeout(resolve, ms));
const keyboard169 = (el, key) => { const event = new Event("keydown", { bubbles: true }); event.key = key; el.dispatchEvent(event); };
const event170 = (el, type, props = {}) => { const event = new Event(type, { bubbles: !["pointerenter", "pointerleave", "toggle"].includes(type) }); Object.assign(event, props); el.dispatchEvent(event); return event; };
const focus170 = (page, el) => {
  const previous = page.document.activeElement; page.document.activeElement = el;
  if (previous && previous !== el) event170(previous, "focusout", { relatedTarget: el });
  event170(el, "focusin", { relatedTarget: previous || null });
};
const group169 = (page, label) => page.app.querySelectorAll("details.nav-group").find(el => el.querySelector("summary").textContent === label);
const link169 = (page, href) => page.app.querySelectorAll("nav.nav a").find(el => el.getAttribute("href") === href);
// The original fixture has no browser resource loader. A real head node permits
// observing app.js's same-origin script/link choices; load events below are explicit.
function head169(page) {
  const head = new Element("head");
  page.document.documentElement.insertBefore(head, page.document.body);
  page.document.head = head;
  return head;
}
const recordTool169 = (page, namespace, calls) => {
  page.window[namespace] = { mount: async (box, options) => {
    const marker = new Element("p"); marker.textContent = namespace + ":" + (options.view || options.className); box.appendChild(marker);
    const call = { box, options, destroyed: 0 }; calls.push(call);
    return { destroy: () => { call.destroyed++; } };
  } };
};

(async () => {
  await siteUser(MEMBER, { global_name: "Mia" }); await character(MEMBER, "Mia One", "Player-1-0001");
  await siteUser(OTHER, { global_name: "Oz" }); await character(OTHER, "Oz Two", "Player-1-0002");
  await siteUser(DENIED, { global_name: "Dan", denied: 1 }); await siteUser(STAFF, { global_name: "Vik" });

  console.log("\n== .169: identity display and bounded recommendation avatars ==");
  for (const [label, fields, expected] of [
    ["nickname case", { nick: "MIA", displayName: "Ignored display", username: "mia" }, "MIA"],
    ["display-name case", { nick: "", displayName: "Mia", username: "mIa" }, "Mia"],
    ["trimmed comparison", { nick: " Mia ", displayName: "Ignored display", username: "mia" }, " Mia "],
    ["different username", { nick: "Guild Mia", displayName: "Ignored display", username: "mia.user" }, "Guild Mia (mia.user)"],
  ]) {
    const page = await openPage(MEMBER, {}, { bootTransform: boot => Object.assign(boot.user, fields) });
    check(".169 " + label + " deduplicates only case-insensitive equal names in header and welcome",
      page.app.querySelector(".who .name").textContent === expected && page.app.querySelector(".welcome").textContent.includes("Welcome, " + expected));
  }
  const avatarPage = await openPage(MEMBER);
  const promotion185 = avatarPage.app.querySelector('[data-addon-promotion="olympus-guild"]');
  check(".196 signed-in Home promotes the unified optional addon, keeps verification separate and states that snapshot export awaits publisher adoption", !!promotion185 && promotion185.textContent.includes("No desktop companion") && promotion185.textContent.includes("Verification remains separate.") && promotion185.textContent.includes("website snapshot export still needs publisher adoption"));
  const promotionLink185 = promotion185?.querySelector('a[href="https://www.curseforge.com/wow/addons/olympus-guild"]');
  check(".185 the prominent publisher link opens safely and the catalog stays available", !!promotionLink185 && promotionLink185.getAttribute("target") === "_blank" && promotionLink185.getAttribute("rel") === "noopener noreferrer" && !!promotion185.querySelector('a[href="#/addons"]'));
  const anonymousPromotion185 = await openPage(null);
  check(".185 signed-out Home has no addon promotion", anonymousPromotion185.app === null && !anonymousPromotion185.html.includes('data-addon-promotion="olympus-guild"'));
  const good = [
    "https://cdn.discordapp.com/avatars/300000000000000004/0123456789abcdef0123456789abcdef.png?size=64",
    "https://cdn.discordapp.com/avatars/300000000000000004/a_0123456789abcdef0123456789abcdef.png?size=64",
    "https://cdn.discordapp.com/guilds/236932545793490944/users/300000000000000004/avatars/0123456789abcdef0123456789abcdef.png?size=64",
    "https://cdn.discordapp.com/embed/avatars/3.png",
  ];
  const bad = [
    "https://evil.example/embed/avatars/3.png", "http://cdn.discordapp.com/embed/avatars/3.png",
    "https://cdn.discordapp.com/attachments/1/2/x.png", "https://cdn.discordapp.com/embed/avatars/9.png",
    "https://cdn.discordapp.com.evil.example/embed/avatars/3.png", "//cdn.discordapp.com/embed/avatars/3.png",
    "https://cdn.discordapp.com/avatars/300000000000000004/0123456789abcdef0123456789abcdef.png?size=64&x=1",
  ];
  const avatarResults = [...good, ...bad, null].map((avatarUrl, i) => ({ id: String(300000000000000100n + BigInt(i)), label: "Avatar fixture " + i, shown: "Avatar fixture " + i, avatarUrl, self: false, onSite: true, linked: false }));
  let searches = 0;
  avatarPage.before(pathname => { if (pathname.startsWith("/api/search?")) searches++; return false; });
  avatarPage.answer(pathname => pathname.startsWith("/api/search?") ? { results: avatarResults, limited: false, unavailable: false } : null);
  const friendPicker = avatarPage.app.querySelector("#friends .picker") || avatarPage.app.querySelector(".picker");
  const search = friendPicker.querySelector('input[role="combobox"]'); search.value = "AvatarFixture"; keyboard169(search, "ArrowDown");
  await waitFor(() => friendPicker.querySelectorAll('[role="option"]').length === avatarResults.length + 1, "the authenticated recommendation lookup projection");
  const recommendations = friendPicker.querySelectorAll('[role="option"]');
  check(".169 recommendation picker issues an authenticated same-origin search and keeps its add-by-name option", searches === 1 && recommendations.length === avatarResults.length + 1 && recommendations.at(-1).querySelector("img").getAttribute("src") === "/static/wow/icon-names.png");
  check(".169 all four exact supported Discord avatar forms render only in lookup results", good.every((url, i) => recommendations[i].querySelector("img").getAttribute("src") === url && recommendations[i].querySelector("img").getAttribute("referrerpolicy") === "no-referrer"));
  check(".169 unsupported hosts, schemes, paths, default indexes, suffixes and absent avatars use local fallback", recommendations.slice(good.length, avatarResults.length).every(row => row.querySelector("img").getAttribute("src") === "/static/wow/pos-member.png"));
  recommendations[0].querySelector("img").dispatchEvent(new Event("error"));
  check(".169 failed recommendation pictures fall back without reloading an external address", recommendations[0].querySelector("img").getAttribute("src") === "/static/wow/pos-member.png");
  recommendations[1].dispatchEvent(new Event("mousedown", { bubbles: true }));
  const picked = avatarPage.app.querySelector("#friends .person") || avatarPage.app.querySelector(".person");
  check(".196 a selected Discord recommendation retains its guarded portrait", !!picked && picked.textContent.includes("Avatar fixture 1") && picked.querySelector("img").getAttribute("src") === good[1] && picked.querySelector("img").getAttribute("referrerpolicy") === "no-referrer");
  check(".169 own portraits retain their separately bounded CDN treatment", avatarPage.app.querySelector(".who img").getAttribute("src") === avatarPage.boot.user.avatarUrl && avatarPage.app.querySelector(".welcome img").getAttribute("src") === avatarPage.boot.user.avatarUrl);

  console.log("\n== .175: appointment association eligibility and current-profile lookup ==");
  const appointmentPage = await openPage(STAFF);
  await appointmentPage.go("#/admin/settings");
  await waitFor(() => !!appointmentPage.app.querySelector('[data-appointment-status="co_gm"]'), "appointment settings");
  const coInput175 = appointmentPage.app.querySelector('input[aria-label="Co-Guild Master: appointed to"]');
  const coRow175 = coInput175.closest(".appointed-row"), coPicker175 = coRow175.querySelector(".picker"), coSearch175 = coPicker175.querySelector('[role="combobox"]');
  const publication175 = appointmentPage.app.querySelector("#appointed-characters-ok"), names175 = appointmentPage.app.querySelector("#appointed-names-ok");
  const absent175 = "300000000000000175";
  const eligible175 = { id: OTHER, label: "Eligible officeholder", shown: "Eligible officeholder", onSite: true, appointmentStatus: "eligible", linked: false };
  let searches175 = 0;
  appointmentPage.before(pathname => { if (pathname.startsWith("/api/search?purpose=appointment")) searches175++; return false; });
  appointmentPage.answer(pathname => pathname.startsWith("/api/search?purpose=appointment") ? { results: [
    { id: absent175, label: "Discord-only officeholder", onSite: false, appointmentStatus: "eligible" },
    { id: DENIED, label: "Unavailable officeholder", onSite: true, appointmentStatus: "unavailable" }, eligible175,
  ] } : null);
  coSearch175.value = "Officeholder175"; keyboard169(coSearch175, "ArrowDown");
  await waitFor(() => coPicker175.querySelectorAll('[role="option"]').length === 3, "appointment eligibility search");
  let options175 = coPicker175.querySelectorAll('[role="option"]');
  check(".176 verified Discord members without site profiles are selectable while unavailable standing remains disabled", options175[0].getAttribute("aria-disabled") === "false" && options175[0].textContent.includes("No website sign-in is required") && options175[1].getAttribute("aria-disabled") === "true" && options175[2].getAttribute("aria-disabled") === "false" && !coPicker175.textContent.includes("verified in game") && appointmentPage.app.textContent.includes("A website sign-in, character link or roster confirmation is not required"));
  options175[0].dispatchEvent(new Event("mousedown", { bubbles: true }));
  check(".176 a confirmed Discord-only result selects the exact account pointer without creating a site profile", coInput175.value === "<@" + absent175 + ">" && !one("SELECT discord_id FROM site_users WHERE discord_id=?", absent175) && !names175.checked && !publication175.checked);
  coSearch175.value = "Officeholder175"; keyboard169(coSearch175, "ArrowDown");
  await waitFor(() => coPicker175.querySelectorAll('[role="option"]').length === 3, "reopen after Discord-only selection");
  const profileFilter175 = coPicker175.querySelector('.list-tools input[type="checkbox"]');
  profileFilter175.checked = true; profileFilter175.dispatchEvent(new Event("change", { bubbles: true })); // Native checkbox activation, including Space, emits change.
  options175 = coPicker175.querySelectorAll('[role="option"]');
  check(".175 current-profile filter does not mistake profile existence for publication eligibility", options175.length === 2 && options175[0].getAttribute("aria-disabled") === "true" && options175[1].getAttribute("aria-disabled") === "false");
  names175.checked = true; publication175.checked = true; keyboard169(coSearch175, "Enter");
  check(".175 keyboard selection skips unavailable rows and resets both independent consent checks", coInput175.value === "<@" + OTHER + ">" && !names175.checked && !publication175.checked && coRow175.textContent.includes("Eligible officeholder: eligible for association at the last check"));
  keyboard169(coSearch175, "ArrowDown"); // The same query is entered again explicitly below.
  coSearch175.value = "Officeholder175"; keyboard169(coSearch175, "ArrowDown");
  await waitFor(() => searches175 === 3, "repeat appointment search bypasses name cache");
  check(".175 appointment searches bypass the browser name cache for the same query", searches175 === 3);
  keyboard169(coSearch175, "Escape");
  const appointedBefore175 = one("SELECT value FROM site_settings WHERE key='appointed'")?.value;
  await fixtureRun("UPDATE site_users SET denied=1 WHERE discord_id=?", OTHER);
  names175.checked = true; publication175.checked = true;
  byText(appointmentPage.app, "button", "Save settings").click();
  await waitFor(() => coRow175.querySelector('[data-appointment-status="co_gm"]').textContent.includes("Co-Guild Master: The selected account is not currently eligible"), "role-specific real save refusal");
  check(".175 a changed selected account is named by office at its field and the real Worker refuses the whole save", one("SELECT value FROM site_settings WHERE key='appointed'")?.value === appointedBefore175 && !publication175.checked && coInput175.focusCalls === 1 && !coRow175.querySelector('[data-appointment-status="co_gm"]').textContent.includes(OTHER));
  await fixtureRun("UPDATE site_users SET denied=0 WHERE discord_id=?", OTHER);
  const lookup175 = await openPage(STAFF);
  await lookup175.go("#/admin/lookup/" + absent175);
  await waitFor(() => lookup175.app.textContent.includes("no current site profile"), "current-profile lookup wording");
  check(".175 ordinary lookup describes missing current data without asserting historical sign-ins", !lookup175.app.textContent.includes("never signed in") && lookup175.app.textContent.includes("Historical sign-ins are not established by this lookup"));

  console.log("\n== .169: grouped navigation and explanatory guides ==");
  const member = await openPage(MEMBER);
  check(".169 native Guild and Resources menus contain the actual routes", !!group169(member, "Guild") && !!group169(member, "Resources") && ["#/roles", "#/governance", "#/organization", "#/talents", "#/addons", "#/guides", "#/guide/member", "#/guide/officer"].every(href => !!link169(member, href)));
  check(".169 a member has no Staff menu or Admin route link", !group169(member, "Staff") && !link169(member, "#/admin"));
  check(".196 Community dropdown exposes its hub while News OFF stays hidden and Game updates remain in Resources", !!group169(member, "Community") && !!link169(member, "#/community") && !link169(member, "#/news") && !!group169(member, "Resources").querySelector('a[href="#/updates"]'));
  const newsMember = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.newsOn = true; } });
  await newsMember.go("#/community");
  check(".196 News ON exposes Town Crier in the Community dropdown and preserves the current Community section", !!link169(newsMember, "#/community") && !!group169(newsMember, "Community") && !!link169(newsMember, "#/news") && !!newsMember.app.querySelector('nav[aria-label="Community sections"] a[href="#/community/news"]') && !!link169(newsMember, "#/updates"));
  const heldCommunity = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.newsOn = true; boot.community.capabilities.applicantWrite = false; } });
  check(".170 missing private Community capability removes its menu and Guild news link without removing public Game updates", !group169(heldCommunity, "Community") && !link169(heldCommunity, "#/community") && !link169(heldCommunity, "#/community/news") && !!group169(heldCommunity, "Resources").querySelector('a[href="#/updates"]'));
  const noCommunity = await openPage(MEMBER, { COMMUNITY_FEATURES: "" });
  check(".196 legacy Community features OFF keeps the eligible Army dropdown and signed-in Game updates", !!group169(noCommunity, "Community") && !!link169(noCommunity, "#/community") && !!group169(noCommunity, "Resources").querySelector('a[href="#/updates"]'));
  check(".196 Army remains in the guarded Community dropdown with legacy features OFF without private Census routes", noCommunity.boot.community.capabilities.armyRead === true && !!link169(noCommunity, "#/community/army") && !!link169(noCommunity, "#/community") && !link169(noCommunity, "#/community/news") && !link169(noCommunity, "#/community/census") && !!group169(noCommunity, "Resources").querySelector('a[href="#/updates"]'));
  const staff = await openPage(STAFF);
  check(".169 only the actual staff boot receives the Staff group and Admin link", !!group169(staff, "Staff") && !!link169(staff, "#/admin") && staff.boot.user.isAdmin === true);
  console.log("\n== .170: exclusive fine-pointer, tap and keyboard navigation ==");
  const navigationHeader = member.app.querySelector("header"), navigationFooter = member.app.querySelector("footer");
  const guildMenu = group169(member, "Guild"), resourceMenu = group169(member, "Resources");
  const guildTrigger = guildMenu.querySelector("summary"), resourceTrigger = resourceMenu.querySelector("summary");
  const openMenus = () => member.app.querySelectorAll("nav.nav details.nav-group[open]");
  let finePointer = false; member.window.matchMedia = query => ({ matches: query === "(hover: hover) and (pointer: fine)" && finePointer });
  guildTrigger.click(); resourceTrigger.click();
  check(".170 tap/click opens only one native disclosure and updates both trigger states", openMenus().length === 1 && openMenus()[0] === resourceMenu && guildTrigger.getAttribute("aria-expanded") === "false" && resourceTrigger.getAttribute("aria-expanded") === "true");
  resourceTrigger.click();
  check(".170 a second tap/click closes the active disclosure without a hover requirement", openMenus().length === 0 && resourceTrigger.getAttribute("aria-expanded") === "false");
  guildTrigger.click(); event170(guildTrigger, "focusout", { relatedTarget: null });
  check(".183 an ambiguous touch blur does not hide its pending native navigation target", guildMenu.hasAttribute("open") && guildTrigger.getAttribute("aria-expanded") === "true");
  const touchLink183 = guildMenu.querySelector(".nav-menu a"), touchClick183 = event170(touchLink183, "click", { button: 0 });
  check(".183 ordinary anchor activation remains uncancelled and visible until its native default can run", !touchClick183.defaultPrevented && guildMenu.hasAttribute("open"));
  await pause169(10); check(".183 selected touch menu closes after native anchor activation", !guildMenu.hasAttribute("open"));
  resourceTrigger.click(); const modified183 = event170(resourceMenu.querySelector(".nav-menu a"), "click", { button: 0, ctrlKey: true }); await pause169(10);
  check(".183 modified links retain native new-tab behavior without cancellation or forced menu close", !modified183.defaultPrevented && resourceMenu.hasAttribute("open")); resourceTrigger.click();
  event170(guildMenu, "pointerenter", { pointerType: "mouse" }); finePointer = true; event170(guildMenu, "pointerenter", { pointerType: "touch" });
  check(".170 coarse-pointer and touch entry do not impersonate desktop mouse hover", openMenus().length === 0);
  event170(guildMenu, "pointerenter", { pointerType: "mouse" }); event170(guildMenu, "pointerleave", { pointerType: "mouse" }); event170(resourceMenu, "pointerenter", { pointerType: "mouse" });
  check(".170 fine-mouse hover opens the pointed menu and immediately closes its neighbor", openMenus().length === 1 && openMenus()[0] === resourceMenu && !guildMenu.hasAttribute("open"));
  event170(resourceTrigger, "click", { button: 0, detail: 1 });
  check(".183 the first fine-mouse click keeps its hover-open disclosure available", resourceMenu.hasAttribute("open") && openMenus().length === 1);
  event170(guildMenu, "focusout", { relatedTarget: member.app.querySelector("main.shell") });
  check(".170 a departed neighboring menu cannot close the newly active disclosure", openMenus().length === 1 && openMenus()[0] === resourceMenu);
  event170(resourceMenu, "pointerleave", { pointerType: "mouse" }); await pause169(90); event170(resourceMenu, "pointerenter", { pointerType: "mouse" }); await pause169(130);
  check(".170 crossing the small pointer gap cancels collapse instead of flickering the popup", resourceMenu.hasAttribute("open") && openMenus().length === 1);
  const resourceFirst = resourceMenu.querySelector(".nav-menu a"); focus170(member, resourceFirst);
  event170(resourceMenu, "pointerleave", { pointerType: "mouse" }); await pause169(210);
  check(".170 keyboard focus within a popup keeps it open after the pointer leaves", resourceMenu.hasAttribute("open") && openMenus().length === 1);
  focus170(member, member.app.querySelector("main.shell"));
  check(".170 moving both focus and pointer away collapses the popup", openMenus().length === 0);
  const guildLinks = guildMenu.querySelectorAll(".nav-menu a");
  keyboard169(guildTrigger, "ArrowDown");
  check(".170 ArrowDown opens a disclosure and focuses its first ordinary link", openMenus().length === 1 && openMenus()[0] === guildMenu && guildLinks[0].focusCalls === 1);
  keyboard169(guildTrigger, "ArrowUp");
  check(".170 ArrowUp preserves exclusivity and focuses its last ordinary link", openMenus().length === 1 && guildLinks.at(-1).focusCalls === 1);
  focus170(member, guildLinks[0]); const escaped = event170(guildLinks[0], "keydown", { key: "Escape" });
  check(".170 Escape closes the popup and returns keyboard focus to its disclosure trigger", escaped.defaultPrevented && openMenus().length === 0 && guildTrigger.focusCalls === 1);
  resourceTrigger.click(); member.app.querySelector("main.shell").click();
  check(".170 an outside click closes the active popup", openMenus().length === 0);
  guildMenu.setAttribute("open", ""); event170(guildMenu, "toggle"); resourceMenu.setAttribute("open", ""); event170(resourceMenu, "toggle");
  const nativeExclusive = openMenus().length === 1 && openMenus()[0] === resourceMenu && resourceTrigger.getAttribute("aria-expanded") === "true";
  resourceFirst.click(); await pause169(10);
  check(".170 native disclosure toggles remain exclusive and choosing a link closes them", nativeExclusive && openMenus().length === 0);
  await member.go("#/guide/member");
  const navigationCSS = fs.readFileSync(path.join(root, "public/static/app.css"), "utf8");
  check(".170 navigation retains the same header/footer and popups stay outside header layout flow", member.app.querySelector("header") === navigationHeader && member.app.querySelector("footer") === navigationFooter && /\.nav-menu \{[^}]*position: absolute/.test(navigationCSS) && /\.nav-menu::before \{[^}]*height: 9px/.test(navigationCSS) && openMenus().length === 0);
  check(".169 member guide is a five-step informational route with permission and source caveats", !!byText(member.app, "h2", "Member guide") && member.app.querySelectorAll(".guide-steps section").length === 5 && member.app.textContent.includes("permissions and current server decisions remain authoritative") && member.app.textContent.includes("do not bypass an appointment"));
  await member.go("#/guide/officer");
  check(".169 officer process guide does not grant a non-staff account an Admin control", !!byText(member.app, "h2", "Officer guide") && member.app.querySelectorAll(".guide-steps section").length === 5 && !byText(member.app, "a", "Open Admin") && member.app.textContent.includes("Only controls your account is actually allowed to use"));
  await staff.go("#/guide/officer");
  check(".169 the officer guide links Admin only for the admitted staff fixture", !!byText(staff.app, "a", "Open Admin"));
  const denied = await openPage(DENIED);
  check(".185 denied accounts have no addon promotion", denied.app === null && !denied.html.includes('data-addon-promotion="olympus-guild"'));
  check(".169 denied account keeps the script-free refusal surface without boot or guild/resource/staff navigation", denied.response.status === 200 && denied.boot === null && denied.app === null && denied.html.includes("This account cannot enter the guild site") && /script-src 'none'/.test(denied.response.headers.get("Content-Security-Policy") || "") && !/id="boot"|#\/(?:roles|talents|addons|guides|admin)/.test(denied.html));

  console.log("\n== .169: same-origin tool loading and route lifetime ==");
  const tools = await openPage(MEMBER), head = head169(tools), talentCalls = [];
  const header = tools.app.querySelector("header"), footer = tools.app.querySelector("footer");
  await tools.go("#/talents/mage/shared-code");
  check(".169 a cold talent route mounts its loading message before the script resolves", tools.app.textContent.includes("Opening tool…") && !tools.app.textContent.includes("Something went wrong"));
  const script = head.querySelector('script[src="/static/talents/calculator.js"]');
  check(".169 talent script and stylesheet are exact same-origin resources, loaded once", !!script && head.querySelectorAll("script").length === 1 && head.querySelector('link[data-olympus-tool="OlympusTalents"]').getAttribute("href") === "/static/talents/calculator.css");
  recordTool169(tools, "OlympusTalents", talentCalls); script.dispatchEvent(new Event("load"));
  await waitFor(() => !!head.querySelector('script[src="/static/talents/guide-builds179.js"]'), "talent dependencies after calculator load");
  tools.window.OlympusTalentAnalysis = { synthetic: "analysis" }; tools.window.OlympusTalentGuides = { synthetic: "guides" };
  head.querySelector('script[src="/static/talents/analysis.js"]').dispatchEvent(new Event("load"));
  head.querySelector('script[src="/static/talents/guide-builds179.js"]').dispatchEvent(new Event("load"));
  await waitFor(() => talentCalls.length === 1, "talent mount after load");
  check(".169 talent route hands class and shared allocation to the renderer after load", talentCalls.length === 1 && talentCalls[0].options.className === "mage" && talentCalls[0].options.build === "shared-code" && !tools.app.textContent.includes("Opening tool…"));
  check(".185 the admitted talent mount receives both exact same-origin analysis and guide modules", head.querySelectorAll("script").length === 3 && talentCalls[0].options.analysis === tools.window.OlympusTalentAnalysis && talentCalls[0].options.guideBuilds === tools.window.OlympusTalentGuides);
  talentCalls[0].options.onBuildChange({ className: "priest", build: "allocated/code" });
  check(".169 talent callback encodes the address without remounting or replacing persistent chrome", tools.location.hash === "#/talents/priest/allocated%2Fcode" && talentCalls.length === 1 && tools.app.querySelector("header") === header && tools.app.querySelector("footer") === footer);
  await tools.go("#/guide/member");
  const departedHash = tools.location.hash;
  talentCalls[0].options.onBuildChange({ className: "warlock", build: "late" });
  check(".169 leaving an active tool disposes it once and ignores its late address callback", talentCalls[0].destroyed === 1 && tools.location.hash === departedHash && !!byText(tools.app, "h2", "Member guide"));
  await tools.go("#/talents/warrior"); await waitFor(() => talentCalls.length === 2, "warm talent mount");
  check(".169 reopening talents reuses its loaded script and stylesheet but creates a fresh renderer", talentCalls.length === 2 && head.querySelectorAll("script").length === 3 && head.querySelectorAll('link[data-olympus-tool="OlympusTalents"]').length === 1);
  await tools.go("#/roles");
  check(".169 a second tool instance also disposes exactly once", talentCalls[1].destroyed === 1);
  check(".203 leaving the tool mounts the consolidated role families and ten linked native ranks without changing the original catalogue", tools.app.querySelectorAll("details.role-family203").length === tools.boot.meta.roleDirectory203.families.length && tools.app.querySelectorAll(".role-ranks203 [data-rank-family203]").length === 10 && tools.app.querySelectorAll("[data-role-key201]").length === 134 && new Set(tools.app.querySelectorAll("[data-role-key201]").map(row => row.getAttribute("data-role-key201"))).size === 134);
  const abandoned = await openPage(MEMBER), abandonedHead = head169(abandoned), abandonedCalls = [];
  await abandoned.go("#/talents/rogue"); await abandoned.go("#/guide/member");
  recordTool169(abandoned, "OlympusTalents", abandonedCalls); abandonedHead.querySelector("script").dispatchEvent(new Event("load")); await settle();
  check(".169 a script arriving after navigation never mounts into the replacement page", abandonedCalls.length === 0 && !!byText(abandoned.app, "h2", "Member guide") && !abandoned.app.textContent.includes("OlympusTalents:"));
  check(".185 an abandoned calculator load never starts analysis or guide loading", abandonedHead.querySelectorAll("script").length === 1);
  const lateDependencies = await openPage(MEMBER), lateHead = head169(lateDependencies), lateCalls = [];
  recordTool169(lateDependencies, "OlympusTalents", lateCalls);
  await lateDependencies.go("#/talents");
  await waitFor(() => lateHead.querySelectorAll("script").length === 2, "pending talent dependency pair");
  await lateDependencies.go("#/guide/member");
  lateDependencies.window.OlympusTalentAnalysis = {}; lateDependencies.window.OlympusTalentGuides = {};
  for (const dependency of lateHead.querySelectorAll("script")) dependency.dispatchEvent(new Event("load"));
  await settle();
  check(".185 dependency completion after route exit cannot mount or replace the current page", lateCalls.length === 0 && !!byText(lateDependencies.app, "h2", "Member guide"));
  const pendingMount = await openPage(MEMBER); head169(pendingMount); let releaseMount, lateDisposals = 0;
  pendingMount.window.OlympusTalentAnalysis = {}; pendingMount.window.OlympusTalentGuides = {};
  pendingMount.window.OlympusTalents = { mount: () => new Promise(resolve => { releaseMount = () => resolve({ destroy: () => { lateDisposals++; } }); }) };
  await pendingMount.go("#/talents"); await waitFor(() => !!releaseMount, "pending asynchronous tool mount");
  await pendingMount.go("#/guide/member"); releaseMount(); await settle();
  check(".169 a mount completing after route disposal is itself destroyed instead of becoming current", lateDisposals === 1 && !!byText(pendingMount.app, "h2", "Member guide"));
  // .186: the optional analysis and guide modules settle independently; either failing leaves the calculator mounted without that feature.
  for (const [failed186, kept186] of [["analysis", "guides"], ["guides", "analysis"]]) {
    const partial186 = await openPage(MEMBER), partialHead186 = head169(partial186), partialCalls186 = [];
    const files186 = { analysis: "/static/talents/analysis.js", guides: "/static/talents/guide-builds179.js" }, globals186 = { analysis: "OlympusTalentAnalysis", guides: "OlympusTalentGuides" };
    recordTool169(partial186, "OlympusTalents", partialCalls186);
    await partial186.go("#/talents/druid");
    await waitFor(() => partialHead186.querySelectorAll("script").length === 2, "independent talent dependency pair (" + failed186 + " fails)");
    partialHead186.querySelector('script[src="' + files186[failed186] + '"]').dispatchEvent(new Event("error")); await settle();
    check(".186 a failed optional " + failed186 + " module waits for the other optional module instead of failing the calculator", partialCalls186.length === 0 && !partial186.app.textContent.includes("could not be loaded"));
    partial186.window[globals186[kept186]] = { synthetic: kept186 };
    partialHead186.querySelector('script[src="' + files186[kept186] + '"]').dispatchEvent(new Event("load"));
    await waitFor(() => partialCalls186.length === 1, "calculator mount without the failed " + failed186 + " module");
    const options186 = partialCalls186[0] && partialCalls186[0].options;
    check(".186 the calculator is told which optional module failed, so it can name the missing feature", JSON.stringify(options186.unavailable) === JSON.stringify([failed186 === "analysis" ? "analysis" : "guideBuilds"]));
    check(".186 the calculator still mounts when the optional " + failed186 + " module fails, with only the loaded " + kept186 + " module", partialCalls186.length === 1 && options186.className === "druid" && options186[failed186 === "analysis" ? "analysis" : "guideBuilds"] === undefined && options186[kept186 === "analysis" ? "analysis" : "guideBuilds"] === partial186.window[globals186[kept186]] && !partial186.app.textContent.includes("could not be loaded") && !partial186.app.textContent.includes("Opening tool…") && partial186.app.textContent.includes("OlympusTalents:druid"));
    await partial186.go("#/guide/member"); await partial186.go("#/talents/druid");
    await waitFor(() => partialHead186.querySelectorAll("script").length === 3, "retry of the failed optional " + failed186 + " module");
    check(".186 a later talent visit retries only the failed optional " + failed186 + " module", partialCalls186.length === 1 && partialCalls186[0].destroyed === 1 && partialHead186.querySelectorAll('script[src="' + files186[failed186] + '"]').length === 2 && partialHead186.querySelectorAll('script[src="' + files186[kept186] + '"]').length === 1);
    partial186.window[globals186[failed186]] = { synthetic: failed186 };
    partialHead186.querySelectorAll('script[src="' + files186[failed186] + '"]')[1].dispatchEvent(new Event("load"));
    await waitFor(() => partialCalls186.length === 2, "calculator mount after the retried module loads");
    check(".186 after a successful retry the calculator receives both optional modules", partialCalls186.length === 2 && partialCalls186[1].options.analysis === partial186.window.OlympusTalentAnalysis && partialCalls186[1].options.guideBuilds === partial186.window.OlympusTalentGuides && JSON.stringify(partialCalls186[1].options.unavailable) === "[]");
  }
  // .186: a script that loads but never defines its global (it threw, or is the wrong file) is not cached as a success either.
  {
    const silent186 = await openPage(MEMBER), silentHead186 = head169(silent186), silentCalls186 = [];
    recordTool169(silent186, "OlympusTalents", silentCalls186);
    await silent186.go("#/talents/mage");
    await waitFor(() => silentHead186.querySelectorAll("script").length === 2, "talent dependency pair for a silent analysis script");
    silent186.window.OlympusTalentGuides = { synthetic: "guides" };
    silentHead186.querySelector('script[src="/static/talents/guide-builds179.js"]').dispatchEvent(new Event("load"));
    silentHead186.querySelector('script[src="/static/talents/analysis.js"]').dispatchEvent(new Event("load"));
    await waitFor(() => silentCalls186.length === 1, "calculator mount after an analysis script that defined nothing");
    check(".186 an optional script that loads without defining its global mounts the calculator without it and names it unavailable", silentCalls186.length === 1 && silentCalls186[0].options.analysis === undefined && silentCalls186[0].options.guideBuilds === silent186.window.OlympusTalentGuides && JSON.stringify(silentCalls186[0].options.unavailable) === '["analysis"]');
    await silent186.go("#/guide/member"); await silent186.go("#/talents/mage");
    await waitFor(() => silentHead186.querySelectorAll("script").length === 3, "retry of the analysis script that defined nothing");
    check(".186 the next talent visit requests that script again instead of reusing its settled cache entry", silentCalls186[0].destroyed === 1 && silentHead186.querySelectorAll('script[src="/static/talents/analysis.js"]').length === 2 && silentHead186.querySelectorAll('script[src="/static/talents/guide-builds179.js"]').length === 1);
    silent186.window.OlympusTalentAnalysis = { synthetic: "analysis" };
    silentHead186.querySelectorAll('script[src="/static/talents/analysis.js"]')[1]?.dispatchEvent(new Event("load")); // absent only if the retry never happened, which the previous check reports
    await waitFor(() => silentCalls186.length === 2, "calculator mount after the analysis script loads properly");
    check(".186 once the retried script defines its global the calculator receives it and nothing is named unavailable", silentCalls186.length === 2 && silentCalls186[1].options.analysis === silent186.window.OlympusTalentAnalysis && JSON.stringify(silentCalls186[1].options.unavailable) === "[]");
  }
  // .189 (prepared as .186): the optional level-60 sheet is never requested on route entry; the calculator receives only a lazy loader.
  const sheetPage = await openPage(MEMBER), sheetHead = head169(sheetPage), sheetCalls = [];
  sheetPage.window.OlympusTalentAnalysis = {}; sheetPage.window.OlympusTalentGuides = {}; recordTool169(sheetPage, "OlympusTalents", sheetCalls);
  await sheetPage.go("#/talents/druid"); await waitFor(() => sheetCalls.length === 1, "talent mount with the sheet loader");
  check(".189 talent route entry requests no level-60 sheet script and hands over only a lazy loader", !sheetHead.querySelector('script[src="/static/talents/stats60.js"]') && typeof sheetCalls[0].options.loadStats60 === "function");
  const sheetLoad = sheetCalls[0].options.loadStats60(), sheetScripts = sheetHead.querySelectorAll('script[src="/static/talents/stats60.js"]');
  check(".189 opening the section requests exactly one same-origin stats60.js", sheetScripts.length === 1);
  sheetPage.window.OlympusTalentStats60 = { synthetic: "sheet" }; sheetScripts[0].dispatchEvent(new Event("load"));
  check(".189 the lazy loader resolves to the level-60 sheet namespace", (await sheetLoad) === sheetPage.window.OlympusTalentStats60);
  // .189: the lazy sheet loader follows the .188 settled rule. A failed or silent stats60.js resolves to no module (the calculator
  // names the sheet unavailable inside its section) and is requested again on the next opening instead of reusing a settled entry.
  // Every wait is bounded, so a loader that never settles fails these checks instead of ending the run early.
  {
    const settled189 = promise => Promise.race([promise.then(value => ({ value }), () => ({ rejected: true })), pause169(2000).then(() => ({ pending: true }))]);
    const lostPage = await openPage(MEMBER), lostHead = head169(lostPage), lostCalls = [];
    const sheetScripts189 = () => lostHead.querySelectorAll('script[src="/static/talents/stats60.js"]');
    lostPage.window.OlympusTalentAnalysis = {}; lostPage.window.OlympusTalentGuides = {}; recordTool169(lostPage, "OlympusTalents", lostCalls);
    await lostPage.go("#/talents/rogue"); await waitFor(() => lostCalls.length === 1, "talent mount for a failing sheet script");
    check(".189 the sheet is not part of the optional pair loaded on route entry", sheetScripts189().length === 0 && JSON.stringify(lostCalls[0].options.unavailable) === "[]");
    const failedLoad = settled189(lostCalls[0].options.loadStats60());
    sheetScripts189()[0]?.dispatchEvent(new Event("error"));
    const failed = await failedLoad;
    check(".189 a stats60.js load error settles to no module instead of rejecting", sheetScripts189().length === 1 && "value" in failed && failed.value === undefined);
    const silentLoad = settled189(lostCalls[0].options.loadStats60());
    check(".189 the next opening after a load error requests stats60.js again", sheetScripts189().length === 2);
    sheetScripts189()[1]?.dispatchEvent(new Event("load")); // absent only if the retry never happened, which the previous check reports
    const silent = await silentLoad;
    check(".189 a stats60.js that loads without defining its global also settles to no module", "value" in silent && silent.value === undefined);
    const retryLoad = settled189(lostCalls[0].options.loadStats60());
    check(".189 the next opening requests that silent script again instead of reusing its settled cache entry", sheetScripts189().length === 3);
    lostPage.window.OlympusTalentStats60 = { synthetic: "sheet" }; sheetScripts189()[2]?.dispatchEvent(new Event("load"));
    const retried = await retryLoad;
    check(".189 once the retried stats60.js defines its global the loader resolves to it", "value" in retried && retried.value === lostPage.window.OlympusTalentStats60);
    const cached = await settled189(lostCalls[0].options.loadStats60());
    check(".189 a loaded sheet module is reused without another request", "value" in cached && cached.value === lostPage.window.OlympusTalentStats60 && sheetScripts189().length === 3);
  }
  const resourceCalls = []; recordTool169(tools, "OlympusResources", resourceCalls);
  await tools.go("#/addons"); await waitFor(() => resourceCalls.length === 1, "addon renderer");
  await tools.go("#/guides"); await waitFor(() => resourceCalls.length === 2, "guide directory renderer");
  check(".169 addon and class/profession directories pass distinct views and dispose the previous renderer", resourceCalls[0].options.view === "addons" && resourceCalls[1].options.view === "guides" && resourceCalls[0].destroyed === 1 && head.querySelectorAll('link[data-olympus-tool="OlympusResources"]').length === 1);
  await tools.go("#/updates");
  await waitFor(() => resourceCalls.length === 3, "public game updates with Guild news OFF");
  check(".170 a direct game-updates route with Guild news OFF mounts only its public updates view", resourceCalls.length === 3 && resourceCalls[1].destroyed === 1 && resourceCalls[2].options.view === "updates" && !tools.app.textContent.includes("This view is not available to this session"));
  const updates = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.newsOn = true; } }); head169(updates); const updateCalls = []; recordTool169(updates, "OlympusResources", updateCalls);
  await updates.go("#/updates"); await waitFor(() => updateCalls.length === 1, "admitted game updates");
  check(".169 confirmed News-ON route mounts only the updates view", updateCalls.length === 1 && updateCalls[0].options.view === "updates");
  const unconfirmed = await openPage(STAFF); head169(unconfirmed); const unconfirmedCalls = []; recordTool169(unconfirmed, "OlympusResources", unconfirmedCalls);
  await unconfirmed.go("#/updates");
  await waitFor(() => unconfirmedCalls.length === 1, "public game updates without a verified character");
  check(".170 actual unconfirmed signed-in session can mount public Game updates with Guild news OFF", !unconfirmed.boot.settings.newsOn && unconfirmed.boot.community.capabilities.confirmedGuildData === false && unconfirmedCalls.length === 1 && unconfirmedCalls[0].options.view === "updates");

  console.log("\n== .169: immediate Vote controls and selected-role freshness ==");
  const cold = await openPage(MEMBER); let coldSummary = 0, coldRole = 0;
  cold.before(pathname => { if (pathname === "/api/board") coldSummary++; if (pathname.startsWith("/api/board/")) coldRole++; return false; });
  cold.hold(pathname => pathname === "/api/board" ? 500 : pathname.startsWith("/api/board/") ? 250 : 0);
  await cold.go("#/vote/officer");
  check(".169 uncached Vote mounts its role controls and write-in picker while summary and selected GET are pending", !!cold.app.querySelector(".role-pick") && !!cold.app.querySelector('.role-item[aria-current="page"]') && !!cold.app.querySelector(".picker") && cold.app.textContent.includes("Refreshing role counts…") && cold.app.textContent.includes("Checking applications…"));
  await waitFor(() => !cold.app.querySelector(".board-summary-status").textContent && cold.app.textContent.includes("No historical applications are listed for this role"), "cold board reads");
  check(".169 uncached Vote performs both original read endpoints rather than inferring candidates from counts", coldSummary === 1 && coldRole === 1);
  await cold.go("#/roles"); let cachedSummary = 0, cachedRole = 0;
  cold.before(pathname => { if (pathname === "/api/board") cachedSummary++; if (pathname.startsWith("/api/board/")) cachedRole++; return false; });
  cold.hold(pathname => pathname.startsWith("/api/board/") ? 250 : 0);
  await cold.go("#/vote/raid_leader_na");
  check(".169 known-empty cached counts show a labelled last-check placeholder immediately, alongside a fresh pending read", !!cold.app.querySelector("[data-board-last-empty]") && cold.app.textContent.includes("No applications at the last check") && cold.app.textContent.includes("Checking applications…") && !cold.app.textContent.includes("No historical applications are listed for this role"));
  await waitFor(() => cold.app.textContent.includes("No historical applications are listed for this role"), "cached-summary selected role fresh answer");
  check(".169 an empty summary reuses counts only and still GETs the newly selected role exactly once", cachedSummary === 0 && cachedRole === 1 && !cold.app.querySelector("[data-board-last-empty]"));

  const race = await openPage(MEMBER); let summaryReplies = 0, selectedReplies = 0;
  race.hold(pathname => pathname === "/api/board" ? 500 : 0);
  race.answer(pathname => {
    if (pathname === "/api/board") { summaryReplies++; return { roles: race.boot.meta.ballots.map(ballot => ({ key: ballot.key, applicants: ballot.key === "officer" ? 9 : 4, votable: ballot.key === "officer" ? 8 : 4, voted: 0 })) }; }
    if (pathname.startsWith("/api/board/officer?")) { selectedReplies++; return { role: race.boot.meta.ballots.find(ballot => ballot.key === "officer"), total: 3, votable: 2, voted: 1, matching: 0, offset: 0, pageSize: 20, candidates: [], votingOpen: true }; }
    return null;
  });
  await race.go("#/vote/officer");
  await waitFor(() => race.app.querySelector("#role-applicants").textContent === "3 applicants", "fresh selected role before delayed summary");
  check(".169 fresh selected totals paint all selected-role indicators before delayed summary", selectedReplies === 1 && summaryReplies === 0 && race.app.querySelector('.role-item[aria-current="page"] .n').textContent === "1/2" && race.app.querySelector("#voted-count").textContent === "You have voted on 1 of 2." && race.app.querySelector('.role-pick option[value="officer"]').textContent === "Officer (3)");
  await waitFor(() => summaryReplies === 1 && race.app.querySelector(".board-summary-status").textContent === "", "stale all-role summary after fresh selected answer");
  check(".169 delayed stale summary cannot replace fresh selected applicant, progress or picker counts", race.app.querySelector("#role-applicants").textContent === "3 applicants" && race.app.querySelector('.role-item[aria-current="page"] .n').textContent === "1/2" && race.app.querySelector("#voted-count").textContent === "You have voted on 1 of 2." && race.app.querySelector('.role-pick option[value="officer"]').textContent === "Officer (3)");
  check(".169 summary still refreshes other roles while preserving the selected-role response", race.app.querySelector('.role-pick option[value="raid_leader_na"]').textContent.endsWith("(4)"));
  const late = await openPage(MEMBER); late.hold(pathname => pathname === "/api/board" ? 250 : 0);
  await late.go("#/vote/officer"); await late.go("#/guide/member"); await pause169(300);
  check(".169 departed summary work cannot overwrite an unrelated guide or its active resource link", !!byText(late.app, "h2", "Member guide") && !late.app.querySelector(".board-layout") && !late.app.textContent.includes("Something went wrong") && link169(late, "#/guide/member").getAttribute("aria-current") === "page");

  // This candidate and both vote commands use the real Worker/SQLite. Only the
  // completed summary reply is held; no successful write response is fabricated.
  await fixtureRun("INSERT INTO site_applications (discord_id,position,board_at,answers,status,created_at,updated_at) VALUES (?,'officer',?,'{}','submitted',?,?)", OTHER, now, now, now);
  const voteProgress169 = (page, expected) => page.app.querySelector('.role-item[aria-current="page"] .n').textContent === expected + "/1" && page.app.querySelector("#voted-count").textContent === "You have voted on " + expected + " of 1.";
  const voted = await openPage(MEMBER); let votedSummary = 0, voteCommands = 0;
  voted.hold(pathname => pathname === "/api/board" ? 900 : 0);
  voted.before((pathname, init) => { if (pathname === "/api/board/vote" && init.method === "PUT") voteCommands++; return false; });
  voted.answer(pathname => { if (pathname === "/api/board") votedSummary++; return null; });
  await voted.go("#/vote/officer");
  await waitFor(() => !!voted.app.querySelector(".cand button.vote.for") && !voted.app.querySelector(".cand button.vote.for").disabled, "real selected application before summary");
  voted.app.querySelector(".cand button.vote.for").click();
  await waitFor(() => one("SELECT vote FROM site_board_votes WHERE voter_id=? AND candidate_id=? AND role_key='officer'", MEMBER, OTHER)?.vote === 1 && voted.app.querySelector(".cand button.vote.for").getAttribute("aria-pressed") === "true", "real committed vote before summary");
  check(".169 a real successful vote before the first summary immediately updates selected progress", voteCommands === 1 && votedSummary === 0 && voteProgress169(voted, 1));
  await waitFor(() => votedSummary === 1 && voted.app.querySelector(".board-summary-status").textContent === "", "delayed pre-vote summary");
  check(".169 a delayed pre-vote summary cannot undo the fresh successful vote count", voteCommands === 1 && voteProgress169(voted, 1) && one("SELECT vote FROM site_board_votes WHERE voter_id=? AND candidate_id=? AND role_key='officer'", MEMBER, OTHER)?.vote === 1);
  const untoggled = await openPage(MEMBER); let untoggledSummary = 0, untoggleCommands = 0;
  untoggled.hold(pathname => pathname === "/api/board" ? 900 : 0);
  untoggled.before((pathname, init) => { if (pathname === "/api/board/vote" && init.method === "PUT") untoggleCommands++; return false; });
  untoggled.answer(pathname => { if (pathname === "/api/board") untoggledSummary++; return null; });
  await untoggled.go("#/vote/officer");
  await waitFor(() => untoggled.app.querySelector(".cand button.vote.for")?.getAttribute("aria-pressed") === "true", "existing real vote before new summary");
  untoggled.app.querySelector(".cand button.vote.for").click();
  await waitFor(() => !one("SELECT 1 FROM site_board_votes WHERE voter_id=? AND candidate_id=? AND role_key='officer'", MEMBER, OTHER) && untoggled.app.querySelector(".cand button.vote.for").getAttribute("aria-pressed") === "false", "real vote removal before summary");
  check(".169 a real untoggle before the first summary immediately updates selected progress", untoggleCommands === 1 && untoggledSummary === 0 && voteProgress169(untoggled, 0));
  await waitFor(() => untoggledSummary === 1 && untoggled.app.querySelector(".board-summary-status").textContent === "", "delayed pre-untoggle summary");
  check(".169 delayed pre-untoggle summary cannot restore a removed vote or stale progress", untoggleCommands === 1 && voteProgress169(untoggled, 0) && !one("SELECT 1 FROM site_board_votes WHERE voter_id=? AND candidate_id=? AND role_key='officer'", MEMBER, OTHER));

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution169 = new Module(__filename, module);
execution169.filename = __filename;
execution169.paths = Module._nodeModulePaths(__dirname);
execution169._compile(fixtureSource169.slice(0, starts169[0].index) + "\n" + body169, __filename);
