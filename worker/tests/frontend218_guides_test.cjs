// .218: Olympus guides and tools routes through the exact page script and real Worker behind the existing minimal-DOM fixture.
// Additive leaf (frontend169 pattern): the frontend_check.cjs prefix is reused byte for byte and never edited. Tool mounts are
// recorded fixtures; the attach handoff runs the real Apply form and must never send an application write.
// Run from worker/: node tests/frontend218_guides_test.cjs
const fs218 = require("node:fs"), path218 = require("node:path"), { Module } = require("node:module");
const fixture218 = path218.join(__dirname, "frontend_check.cjs");
const fixtureSource218 = fs218.readFileSync(fixture218, "utf8");
const starts218 = [...fixtureSource218.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts218.length !== 1) throw new Error("one existing frontend fixture boundary required");
const body218 = String.raw`
const head218 = page => { const head = new Element("head"); page.document.documentElement.insertBefore(head, page.document.body); page.document.head = head; return head; };
const record218 = (page, namespace, calls) => {
  page.window[namespace] = { mount: async (box, options) => {
    const marker = new Element("p"); marker.textContent = namespace + ":" + options.view; box.appendChild(marker);
    const call = { box, options, destroyed: 0 }; calls.push(call);
    return { destroy: () => { call.destroyed++; } };
  } };
};
const group218 = (page, label) => page.app.querySelectorAll("details.nav-group").find(el => el.querySelector("summary").textContent === label);
const WARRIOR60 = "ot1.260cf99b52db.warrior.60.0532521303051520105050030000000000000000000000000000";

(async () => {
  await siteUser(MEMBER, { global_name: "Mia" }); await character(MEMBER, "Mia One", "Player-1-0001");

  console.log("\n== .218: Olympus guides and tools ==");
  const p = await openPage(MEMBER); const head = head218(p); const guides = [], library = [];
  record218(p, "OlympusGuides", guides); record218(p, "OlympusResources", library);
  const resources = group218(p, "Resources"), hrefs = resources ? resources.querySelectorAll("a").map(a => a.getAttribute("href")) : [];
  check(".218 the Resources menu opens with Guides & tools and keeps every existing entry", hrefs[0] === "#/resources" && resources.querySelectorAll("a")[0].textContent === "Guides & tools"
    && ["#/guide/member", "#/guide/officer", "#/talents", "#/addons", "#/guides", "#/updates"].every(h => hrefs.filter(x => x === h).length === 1));
  await p.go("#/resources"); await waitFor(() => guides.length === 1, "guides hub");
  check(".218 #/resources mounts the Olympus guides hub with the pinned talent revision", guides[0].options.view === "hub" && guides[0].options.talentRevision === p.boot.meta.talentSnapshotRevision
    && head.querySelectorAll('link[data-olympus-tool="OlympusGuides"]').length === 1 && p.document.title === "Guides & tools — Olympus");
  await p.go("#/guides"); await waitFor(() => library.length === 1, "publisher library");
  check(".218 #/guides itself still mounts the reviewed publisher library, and the hub is disposed", library[0].options.view === "guides" && guides[0].destroyed === 1 && guides.length === 1);
  await p.go("#/guides/class/warrior/arms"); await waitFor(() => guides.length === 2, "class guide");
  check(".218 a class guide route passes the class, the spec and the attach handler", guides[1].options.view === "class" && guides[1].options.classId === "warrior" && guides[1].options.specId === "arms"
    && typeof guides[1].options.onAttach === "function" && guides[1].options.canAttach === true && p.document.title === "Warrior guide · Guides — Olympus");
  await p.go("#/guides/class/mage"); await waitFor(() => guides.length === 3, "class guide without spec");
  check(".218 a class guide without a spec leaves the spec to the module", guides[2].options.classId === "mage" && guides[2].options.specId === undefined);
  await p.go("#/guides/profession/first-aid"); await waitFor(() => guides.length === 4, "profession guide");
  check(".218 a profession guide route passes the profession key", guides[3].options.view === "profession" && guides[3].options.profession === "first-aid");
  await p.go("#/guides/tools/buffs"); await waitFor(() => guides.length === 5, "tool");
  check(".218 a tool route passes the tool and titles the page", guides[4].options.view === "tool" && guides[4].options.tool === "buffs" && p.document.title === "World buffs & consumables · Guides — Olympus");
  await p.go("#/guides/nothing/here/at/all");
  check(".218 an unknown guide route says so without mounting anything", p.app.textContent.includes("There is no such guide.") && guides.length === 5);
  await p.go("#/resources/extra");
  check(".218 the hub has no sub-pages", p.app.textContent.includes("There is no such page.") && guides.length === 5);

  console.log("\n== .218: Attach to my application (prefill only) ==");
  const a = await openPage(MEMBER); head218(a); const calls = []; record218(a, "OlympusGuides", calls); const writes = [];
  a.before((pathname, init) => { if (pathname.startsWith("/api/application") && init && init.method && init.method !== "GET") writes.push(pathname); return false; });
  await a.go("#/apply");
  check(".218 an ordinary Apply visit shows no attach notice and leaves every build empty", !a.app.textContent.includes("Attached \"") && a.app.querySelectorAll(".talent-application-character textarea").every(t => !t.value));
  await a.go("#/guides/class/warrior/arms"); await waitFor(() => calls.length === 1, "class guide for attach");
  calls[0].options.onAttach(Object.freeze({ presetId: "warrior-arms-raid-60", label: "Olympus starting point · raid", classId: "warrior", level: 60, code: WARRIOR60 }));
  await waitFor(() => a.location.hash === "#/apply" && a.app.textContent.includes("Attached \""), "attach handoff");
  const rows = a.app.querySelectorAll(".talent-application-character");
  const at60 = rows[0] ? rows[0].querySelectorAll("textarea")[1] : null;
  check(".218 Attach fills only the main character's level 60 build, sets the class and says nothing was sent", !!at60 && at60.value === WARRIOR60 && rows[0].querySelectorAll("textarea")[0].value === ""
    && a.app.textContent.includes("Your class is now Warrior.") && a.app.textContent.includes("nothing has been sent yet") && writes.length === 0);
  const board = a.app.querySelector("#board-talent-builds-opt-in");
  check(".218 Attach never ticks board sharing", !!board && board.checked === false);
  const dirty = a.app.querySelectorAll("span.dirty").find(el => el.textContent === "Unsaved changes");
  check(".218 the attached build marks the application unsaved, so leaving asks first and saving stays the applicant's choice", !!dirty && dirty.hidden === false && writes.length === 0);

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename;
execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixtureSource218.slice(0, starts218[0].index) + "\n" + body218, __filename);
