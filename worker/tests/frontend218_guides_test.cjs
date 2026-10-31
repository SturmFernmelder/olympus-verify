// .218: Olympus guides and tools routes through the exact page script and real Worker behind the existing minimal-DOM fixture.
// Additive leaf (frontend169 pattern): frontend_check.cjs stays unchanged on disk. Its in-memory app read adds explicit
// Treasury identity/module fixture seams only. Tool mounts are recorded; Attach runs the real Apply form without a write.
// Run from worker/: node tests/frontend218_guides_test.cjs
const fs218 = require("node:fs"), path218 = require("node:path"), { Module } = require("node:module");
const fixture218 = path218.join(__dirname, "frontend_check.cjs");
const fixtureSource218 = fs218.readFileSync(fixture218, "utf8");
const starts218 = [...fixtureSource218.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts218.length !== 1) throw new Error("one existing frontend fixture boundary required");

// VM-only seams: no identity control or renderer stub is shipped in app.js.
function treasuryClientFixture218(source) {
  const anchor='  ROUTES.organization = async (main, parts) => {';
  const hooks='  window.__treasuryClientFixture218=Object.freeze({owner:()=>S.user,refresh:options=>refreshTreasuryAccess218(options),state:()=>({signedIn:S.signedIn,revision:decisionActorRevision}),setGrant:value=>{S.user.canReadTreasuryPlan=value;},replaceIdentity:id=>{S.user={...S.user,id,canReadTreasuryPlan:false};render();}});\n';
  if(source.split(anchor).length!==2)throw Error('one organization fixture anchor required');
  source=source.replace(anchor,hooks+anchor);
  for(const[before,after]of [['import("/static/organization-view.js")','Promise.resolve(window.__treasuryOrganizationFixture218)'],['import("/static/organization-overview205.js")','Promise.resolve({renderAllianceOverview205(){}})']]){
    if(source.split(before).length!==2)throw Error('one organization module fixture anchor required');
    source=source.replace(before,after);
  }
  return source;
}
const fixtureRead218='const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
let fixturePrefix218=fixtureSource218.slice(0,starts218[0].index);
if(fixturePrefix218.split(fixtureRead218).length!==2)throw Error('one actual app read required');
fixturePrefix218=fixturePrefix218.replace(fixtureRead218,'const APP_JS = ('+treasuryClientFixture218.toString()+')(fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8"));');

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


  console.log("\n== .218: Treasury reply owns its original client identity ==");
  const deferred218=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
  const nav218=p=>!!p.app.querySelector('a[href="#/treasury-plan"]');
  const reply218=value=>new Response(JSON.stringify({format:"olympus-treasury-access-v1",canRead:value}),{status:200,headers:{"Content-Type":"application/json"}});
  const treasuryPage218=()=>openPage(MEMBER,{}, {bootTransform:b=>{b.user.canReadTreasuryPlan=true;}});
  const pause218=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  const o218=await treasuryPage218(),mg218=deferred218(),tg218=deferred218();let models218=0,grants218=0,renders218=0;
  o218.window.__treasuryOrganizationFixture218={renderOrganization(main,data,ui){renders218++;ui.clear(main);const marker=new Element("p");marker.setAttribute("data-treasury-organization-ready","true");marker.textContent="Organization "+data.terms.length;main.appendChild(marker);return()=>{};}};
  o218.intercept(async path=>{if(path==="/api/treasury-plan/access"){grants218++;await tg218.promise;return reply218(true);}if(path==="/static/governance/organization.json"){models218++;await mg218.promise;}});
  o218.window.__treasuryClientFixture218.setGrant(false);const owner218=o218.window.__treasuryClientFixture218.owner();
  await o218.go("#/organization");await waitFor(()=>models218===1&&grants218===1,"held real model/background Treasury");
  check(".218 real organization model waits without a premature Treasury grant",renders218===0&&o218.app.textContent.includes("Opening the organization")&&!nav218(o218));
  tg218.resolve();await waitFor(()=>nav218(o218),"current Treasury grant");
  check(".218 Treasury navigation grant preserves the active reader user pointer",nav218(o218)&&o218.window.__treasuryClientFixture218.owner()===owner218&&owner218.canReadTreasuryPlan===true);
  mg218.resolve();const ready218=await waitFor(()=>renders218===1,"organization continuation after Treasury");
  check(".218 Treasury reply cannot strand the real organization model continuation",ready218&&models218===1&&renders218===1&&!!o218.app.querySelector('[data-treasury-organization-ready]')&&!o218.app.textContent.includes("Opening the organization"));

  // Actual logout INTENT; synthetic held transport avoids destroying other fixture sessions.
  const l218=await treasuryPage218(),lg218=deferred218(),lt218=deferred218();let logout218=false,lr218=0;
  l218.intercept(async path=>{if(path==="/api/treasury-plan/access"){lr218++;await lt218.promise;return reply218(true);}if(path==="/auth/logout"){logout218=true;await lg218.promise;return new Response("{}",{status:200});}});
  l218.window.__treasuryClientFixture218.setGrant(false);await l218.go("#/guide/member");await waitFor(()=>lr218===1,"Treasury before logout");
  const lo218=l218.window.__treasuryClientFixture218.owner();byText(l218.app,"button","Sign out").click();await waitFor(()=>logout218,"logout intent");
  lt218.resolve();await pause218(20);
  check(".218 late Treasury grant after logout intent cannot restore flag or navigation",l218.window.__treasuryClientFixture218.owner()===lo218&&lo218.canReadTreasuryPlan===false&&!nav218(l218));
  lg218.resolve();await settle();

  // Adversarial VM identity seams, NOT claimed reachable same-page OAuth login transitions.
  for(const same218 of [false,true]){
    const q218=await treasuryPage218(),old218=deferred218(),next218=deferred218();let reads218=0;
    q218.intercept(async path=>{if(path==="/api/treasury-plan/access"){const n218=++reads218;await(n218===1?old218.promise:next218.promise);return reply218(n218===1);}});
    q218.window.__treasuryClientFixture218.setGrant(false);await q218.go("#/guide/member");await waitFor(()=>reads218===1,"old Treasury owner");
    const oldOwner218=q218.window.__treasuryClientFixture218.owner();q218.window.__treasuryClientFixture218.replaceIdentity(same218?oldOwner218.id:"300000000000218199");
    const newOwner218=q218.window.__treasuryClientFixture218.owner(),answer218=q218.window.__treasuryClientFixture218.refresh({fresh:true});
    await pause218(20);old218.resolve();await pause218(20);const joined218=q218.window.__treasuryClientFixture218.refresh({fresh:true});await pause218(20);next218.resolve();await Promise.all([answer218,joined218]);await settle();
    check(".218 old Treasury response cannot be shared with "+(same218?"same-ID replacement":"different identity"),reads218===2&&newOwner218!==oldOwner218&&q218.window.__treasuryClientFixture218.owner()===newOwner218&&newOwner218.canReadTreasuryPlan===false&&!nav218(q218)&&q218.window.__treasuryClientFixture218.state().signedIn);
  }

  const s218=await treasuryPage218(),sg218=deferred218();let sr218=0;
  s218.intercept(async path=>{if(path==="/api/treasury-plan/access"){if(++sr218===1){await sg218.promise;return new Response('{"error":"signed_out"}',{status:401});}return reply218(false);}});
  s218.window.__treasuryClientFixture218.setGrant(false);await s218.go("#/guide/member");await waitFor(()=>sr218===1,"old held Treasury401");
  s218.window.__treasuryClientFixture218.replaceIdentity("300000000000218198");const replacement218=s218.window.__treasuryClientFixture218.owner(),sa218=s218.window.__treasuryClientFixture218.refresh({fresh:true});
  await settle();sg218.resolve();await sa218;await pause218(20);
  check(".218 stale Treasury401 cannot sign out replacement identity",s218.window.__treasuryClientFixture218.state().signedIn&&s218.window.__treasuryClientFixture218.owner()===replacement218&&!nav218(s218));

  const f218=await treasuryPage218();let fr218=0;
  f218.intercept(path=>{if(path==="/api/treasury-plan/access"){fr218++;return reply218(false);}});
  const fo218=f218.window.__treasuryClientFixture218.owner();await f218.window.__treasuryClientFixture218.refresh({fresh:true});await settle();
  check(".218 fresh refusal clears prior Treasury presentation grant in place without retry loop",fr218===1&&f218.window.__treasuryClientFixture218.owner()===fo218&&fo218.canReadTreasuryPlan===false&&!nav218(f218));

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename;
execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixturePrefix218 + "\n" + body218, __filename);
