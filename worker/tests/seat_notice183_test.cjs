// .183: real page script, original Worker/session fixture and synthetic officer reports only.
// The local seams delay or replace a read response; no production data or network is used.
const fs183 = require("node:fs"), path183 = require("node:path"), { Module } = require("node:module");
let fixture183 = fs183.readFileSync(path183.join(__dirname, "frontend_check.cjs"), "utf8");
const starts183 = [...fixture183.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts183.length !== 1) throw Error("one original fixture boundary required");
fixture183 = fixture183.slice(0, starts183[0].index);
for (const [from, to] of [
  ["{ clockNow, bootTransform } = {}", "{ clockNow, bootTransform, seatInitialDelay183 } = {}"],
  ["__delay: null, // .102", "__delay: seatInitialDelay183 || null, // .102"],
]) {
  if (fixture183.split(from).length !== 2) throw Error("one bounded seat fixture seam required");
  fixture183 = fixture183.replace(from, to);
}
const body183 = String.raw`
const pause183 = ms => new Promise(resolve => setTimeout(resolve, ms));
const seat183 = page => page.app.querySelector(".seats-notice");
const report183 = page => seat183(page)?.querySelector(".notice-box") || null;
const fresh183 = (id, overrides = {}) => ({ signedIn: true, denied: false, user: { id, displayName: "Must not replace identity" }, now,
  seats: { state: "full", source: "roster", members: 1000, cap: 1000, free: 0, asOf: Math.floor((now - 3600) / 3600) * 3600, visitorsUrl: null }, myQueue: [], ...overrides });
(async () => {
  await siteUser(MEMBER, { global_name: "Seat Reader" });
  await siteUser(OTHER, { global_name: "Other Reader" });
  await fixtureRun("INSERT INTO roster_snapshots (exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at) VALUES (?,?,'addon',1000,'seats183',1,1,?)", now - 3600, now - 3600, now - 3600);
  await fixtureRun("INSERT INTO invite_queue (name_key,name,discord_id,status,created_at) VALUES ('local queue','Local Queue',?,'queued',?)", MEMBER, now - 7200);
  let firstRead183 = true;
  const initial = await openPage(MEMBER, {}, { seatInitialDelay183: path => { if (path === "/api/me" && firstRead183) { firstRead183 = false; return 150; } return 0; } });
  check("boot full state is not presented while a fresh officer-report read is pending", initial.boot.seats.state === "full" && !!seat183(initial) && seat183(initial).textContent.includes("Checking the latest Olympus I officer report") && !report183(initial));
  await waitFor(() => !!report183(initial), "fresh original seat report");
  check("fresh original officer report includes its hour, count and only the reader's queue place", report183(initial)?.textContent.includes("Latest officer report: the Olympus I roster export of about") && report183(initial).textContent.includes("counts 1000 of 1000 members") && report183(initial).textContent.includes("Local Queue is #1 in line for a seat.") && !report183(initial).textContent.includes("right now"));

  const reads = [];
  initial.before((path, init) => { if (path === "/api/me") reads.push(init); return false; });
  initial.hold(path => path === "/api/me" ? 150 : 0);
  initial.answer(path => path === "/api/me" ? fresh183(MEMBER, { application: { position: "officer", status: "accepted" }, settings: { applicationsOpen: false } }) : null);
  await initial.go("#/apply");
  const main = initial.app.querySelector("main"), form = main.querySelector("form"), typed = form && (form.querySelector("textarea") || form.querySelector('input[type="text"]'));
  check("Apply opens its own read without displaying cached Home evidence", !!form && !!typed && !!seat183(initial) && !report183(initial) && reads.length === 1, JSON.stringify({form:!!form,typed:!!typed,notice:!!seat183(initial),report:!!report183(initial),reads:reads.length}));
  if (typed) { typed.value = "Unsaved local fixture"; typed.dispatchEvent(new Event("input", { bubbles: true })); }
  await waitFor(() => !!report183(initial), "Apply fresh seat response");
  check("a seat-only read preserves unsaved Apply controls, active main and original identity/settings", initial.app.querySelector("main") === main && main.querySelector("form") === form && typed?.value === "Unsaved local fixture" && initial.app.textContent.includes("Welcome") === false && initial.app.querySelector("header").textContent.includes("Seat Reader") && !initial.app.textContent.includes("Must not replace identity") && !!byText(initial.app, "button", "Submit application") && form.querySelector(".dirty")?.hidden === false, JSON.stringify({main:initial.app.querySelector("main")===main,form:main.querySelector("form")===form,typed:typed?.value==="Unsaved local fixture",identity:initial.app.querySelector("header").textContent.includes("Seat Reader"),submit:!!byText(initial.app,"button","Submit application"),dirty:form?.querySelector(".dirty")?.hidden}));
  check("seat refresh is only an authenticated same-origin GET to the existing endpoint", reads.every(init => init.method === "GET" && init.credentials === "same-origin" && init.headers["X-Olympus"] === "2" && init.body === undefined));

  // Advance only this synthetic page clock; the original server deadline and all application clocks stay unchanged.
  let clock = now * 1000;
  const expires = await openPage(OTHER, {}, { clockNow: () => clock });
  await waitFor(() => !!report183(expires), "expiring original report");
  await expires.go("#/apply");
  await waitFor(() => !!report183(expires), "expiring Apply report");
  const expiringMain = expires.app.querySelector("main"), expiringForm = expiringMain.querySelector("form"), expiringField = expiringForm.querySelector("textarea") || expiringForm.querySelector('input[type="text"]');
  expiringField.value = "Preserve at expiry"; expiringField.dispatchEvent(new Event("input", { bubbles: true }));
  const noPolls = []; expires.before((path, init) => { noPolls.push([path, init.method]); return false; });
  clock = (Math.floor((now - 3600) / 3600) * 3600 + 48 * 3600) * 1000;
  await pause183(1100);
  check("hour-rounded roster evidence expires conservatively in place without refreshing or losing typing", !report183(expires) && seat183(expires).hidden && expires.app.querySelector("main") === expiringMain && expiringMain.querySelector("form") === expiringForm && expiringField.value === "Preserve at expiry" && expiringForm.querySelector(".dirty")?.hidden === false && noPolls.length === 0);

  const refused = await openPage(OTHER);
  await waitFor(() => !!report183(refused), "initial refusal fixture report");
  refused.answer(path => path === "/api/me" ? new Response('{"error":"forbidden"}', { status: 403 }) : null);
  await refused.go("#/apply"); await waitFor(() => seat183(refused)?.textContent.includes("could not be checked"), "fresh refusal");
  check("fresh refusal clears prior seat and queue evidence without claiming a current full guild", !report183(refused) && !refused.app.textContent.includes("Local Queue") && !refused.app.textContent.includes("right now") && seat183(refused).textContent.includes("could not be checked"));
  refused.answer(path => path === "/api/me" ? fresh183(OTHER, { user: { id: MEMBER } }) : null);
  await refused.go("#/"); await waitFor(() => seat183(refused)?.textContent.includes("could not be checked"), "wrong reader refusal");
  check("a readable response for another account cannot populate the current reader's seat or queue notice", !report183(refused) && seat183(refused).textContent.includes("could not be checked"));
  refused.answer(path => path === "/api/me" ? fresh183(OTHER, { seats: { state: "full", source: "refused_invite", asOf: Math.floor((now - 6 * 3600) / 3600) * 3600 }, myQueue: [{ name: "Expired Queue", position: 1 }] }) : null);
  await refused.go("#/apply"); await waitFor(() => seat183(refused)?.hidden, "expired refusal source");
  check("a six-hour invite refusal is not revived from boot or by a fresh response", !report183(refused) && seat183(refused).hidden && !refused.app.textContent.includes("Expired Queue"));
  refused.answer(path => path === "/api/me" ? new Response('{"error":"signed_out"}', { status: 401 }) : null);
  await refused.go("#/"); await waitFor(() => !byText(refused.app, "button", "Sign out"), "current sign-out refusal");
  check("a current original 401 retains the existing sign-out behavior and removes seat information", !byText(refused.app, "button", "Sign out") && !seat183(refused));

  const late = await openPage(MEMBER);
  await waitFor(() => !!report183(late), "late original report");
  late.hold(path => path === "/api/me" ? 150 : 0);
  late.answer(path => path === "/api/me" ? new Response('{"error":"signed_out"}', { status: 401 }) : null);
  await late.go("#/apply"); await late.go("#/roles");
  const rolesMain = late.app.querySelector("main"); await pause183(250);
  check("an old view's late 401 cannot sign out, redraw or populate the newer route", late.app.querySelector("main") === rolesMain && rolesMain.dataset.routeHead === "roles" && !!byText(late.app, "button", "Sign out") && !seat183(late) && !late.document.body.textContent.includes("You were signed out"));
  const visible = await openPage(OTHER); await waitFor(() => !!report183(visible), "visibility fixture initial report");
  await visible.go("#/apply"); await waitFor(() => !!report183(visible), "visibility fixture Apply report");
  const visibleMain = visible.app.querySelector("main"), visibleForm = visibleMain.querySelector("form"), visibleField = visibleForm.querySelector("textarea") || visibleForm.querySelector('input[type="text"]');
  visibleField.value = "Keep typing across visibility"; visibleField.dispatchEvent(new Event("input", { bubbles: true }));
  const oldRequests = new WeakSet(); let resumedReads = 0;
  visible.before((path, init) => { if (path === "/api/me") { resumedReads++; if (resumedReads === 1) oldRequests.add(init); } return false; });
  visible.hold((path, init) => path === "/api/me" && oldRequests.has(init) ? 200 : 0);
  visible.answer((path, init) => path === "/api/me" ? oldRequests.has(init) ? new Response('{"error":"signed_out"}', { status: 401 }) : fresh183(OTHER, { myQueue: [{ name: "Fresh Visible Queue", position: 2 }] }) : null);
  const visibility183 = hidden => { visible.document.hidden = hidden; visible.document.dispatchEvent(new Event("visibilitychange")); };
  visibility183(true);
  check("visibility loss immediately clears seat and own-queue text without changing the form", !report183(visible) && seat183(visible).hidden && visibleField.value === "Keep typing across visibility" && visibleMain.querySelector("form") === visibleForm && resumedReads === 0);
  visibility183(false); await settle(); await settle();
  check("returning to the active view requests a fresh report instead of reviving the old banner", resumedReads === 1 && !report183(visible) && seat183(visible).textContent.includes("Checking the latest Olympus I officer report"));
  visibility183(true); visibility183(false);
  await waitFor(() => report183(visible)?.textContent.includes("Fresh Visible Queue"), "current visible generation"); await pause183(250);
  check("the newest visible read preserves typing and a pre-hide 401 cannot sign out or overwrite it", resumedReads === 2 && !!byText(visible.app, "button", "Sign out") && report183(visible)?.textContent.includes("Fresh Visible Queue is #2 in line for a seat.") && visible.app.querySelector("main") === visibleMain && visibleMain.querySelector("form") === visibleForm && visibleField.value === "Keep typing across visibility" && visibleForm.querySelector(".dirty")?.hidden === false && !visible.document.body.textContent.includes("You were signed out"));
  visible.answer(path => path === "/api/me" ? new Response('{"error":"forbidden"}', { status: 403 }) : null);
  visibility183(true); visibility183(false); await waitFor(() => seat183(visible)?.textContent.includes("could not be checked"), "current visible refusal");
  const refusedReads = resumedReads; visibility183(true); visibility183(false); await settle(); await settle();
  check("a current refusal ends visibility refresh without an automatic retry or stale queue disclosure", resumedReads === refusedReads && !report183(visible) && !visible.app.textContent.includes("Fresh Visible Queue") && visibleField.value === "Keep typing across visibility");
  initial.window.dispatchEvent(new Event("pagehide")); expires.window.dispatchEvent(new Event("pagehide"));
  check("pagehide clears active officer reports and their local expiry observers", !report183(initial) && !report183(expires));
  console.log("\n" + ok + "/" + n + " passed"); process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution183 = new Module(__filename, module);
execution183.filename = __filename; execution183.paths = Module._nodeModulePaths(__dirname);
execution183._compile(fixture183 + "\n" + body183, __filename);
