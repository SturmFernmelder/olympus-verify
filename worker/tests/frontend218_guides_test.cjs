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
  const treasuryImport='import("/static/treasury-plan207.js")';
  if(source.split(treasuryImport).length!==2)throw Error('one Treasury module fixture anchor required');
  source=source.replace(treasuryImport,'window.__treasuryModuleFixture218()');
  return source;
}
const fixtureRead218='const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
let fixturePrefix218=fixtureSource218.slice(0,starts218[0].index);
if(fixturePrefix218.split(fixtureRead218).length!==2)throw Error('one actual app read required');
fixturePrefix218=fixturePrefix218.replace(fixtureRead218,'const APP_JS = ('+treasuryClientFixture218.toString()+')(fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8"));');

const treasurySetupAnchor218 = '  sandbox.globalThis = sandbox; sandbox.self = sandbox;';
if(fixturePrefix218.split(treasurySetupAnchor218).length!==2)throw Error("one frontend sandbox boundary required");
fixturePrefix218=fixturePrefix218.replace(treasurySetupAnchor218,'  if (treasurySetup218) treasurySetup218(sandbox,w);\n'+treasurySetupAnchor218);
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


let treasurySetup218 = null;
const treasuryBus218 = (() => {
  const channels = [], messages = [];
  class Channel {
    constructor(name) { this.name = name; channels.push(this); }
    addEventListener(type, listener) { if(type==="message")this.listener=listener; }
    postMessage(data) {
      messages.push(data);
      for (const channel of channels) if (channel !== this && channel.name === this.name) {
        queueMicrotask(() => { channel.listener?.({ data }); channel.onmessage?.({ data }); });
      }
    }
    close() { this.listener=null; this.onmessage=null; }
  }
  return { Channel, messages };
})();
async function timedTreasury218({ grant = true, channel = true } = {}) {
  const clock=Date.now(), scheduled=new Set();
  treasurySetup218=(sandbox,w)=>{
    if(channel)sandbox.BroadcastChannel=w.window.BroadcastChannel=treasuryBus218.Channel;
    const after=sandbox.setTimeout, cancel=sandbox.clearTimeout;
    sandbox.setTimeout=(fn,delay,...args)=>{
      if(delay<60000)return after(fn,delay,...args);
      const ticket={fire(){scheduled.delete(ticket);fn(...args);}};scheduled.add(ticket);return ticket;
    };
    sandbox.clearTimeout=ticket=>scheduled.delete(ticket)||cancel(ticket);
  };
  try {
    const page=await openPage(MEMBER,{}, {clockNow:clock,bootTransform:b=>{b.user.canReadTreasuryPlan=grant;}});
    const rendered={count:0,disposed:0};
    page.window.__treasuryModuleFixture218=async()=>({renderTreasuryPlan207(main,ui){
      rendered.count++; rendered.herald=ui.officeLabel?.('office_102'); ui.clear(main);
      const marker=new Element("p");marker.setAttribute("data-treasury-plan-fixture","true");marker.textContent="Treasury plan fixture";main.appendChild(marker);
      return()=>{rendered.disposed++;};
    }});
    return {page,clock,scheduled,rendered};
  } finally { treasurySetup218=null; }
}
const plan218=p=>!!p.app.querySelector("[data-treasury-plan-fixture]");
const visibility218=(p,hidden=false)=>{
 p.document.hidden=hidden;p.document.visibilityState=hidden?"hidden":"visible";p.document.dispatchEvent(new Event("visibilitychange"));
};

(async () => {
  await siteUser(MEMBER, { global_name: "Mia" }); await character(MEMBER, "Mia One", "Player-1-0001");

  console.log("\n== .218: Olympus guides and tools ==");
  const p = await openPage(MEMBER); const head = head218(p); const guides = [], library = [];
  record218(p, "OlympusGuides", guides); record218(p, "OlympusResources", library);
  const resources = group218(p, "Resources"), hrefs = resources ? resources.querySelectorAll("a").map(a => a.getAttribute("href")) : [];
  check(".228 the Resources menu distinguishes Olympus guides from the publisher library and keeps every entry", hrefs[0] === "#/resources"
    && resources.querySelectorAll("a")[0].textContent === "Class & profession guides"
    && resources.querySelector('a[href="#/guides"]').textContent === "Publisher library"
    && ["#/guide/member", "#/guide/officer", "#/talents", "#/addons", "#/guides", "#/updates"].every(h => hrefs.filter(x => x === h).length === 1));
  await p.go("#/resources"); await waitFor(() => guides.length === 1, "guides hub");
  check(".218 #/resources mounts the Olympus guides hub with the pinned talent revision", guides[0].options.view === "hub" && guides[0].options.talentRevision === p.boot.meta.talentSnapshotRevision
    && head.querySelectorAll('link[data-olympus-tool="OlympusGuides"]').length === 1 && p.document.title === "Class & profession guides — Olympus");
  await p.go("#/guides"); await waitFor(() => library.length === 1, "publisher library");
  check(".218 #/guides itself still mounts the reviewed publisher library, and the hub is disposed", library[0].options.view === "guides"
    && guides[0].destroyed === 1 && guides.length === 1 && p.document.title === "Publisher library — Olympus");
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
  await p.go("#/guides/tools/raid-structure"); await waitFor(() => guides.length === 6, "raid structure guide");
  check("the raid structure guide opens through the normal member tool route with its page title", guides[5].options.view === "tool"
    && guides[5].options.tool === "raid-structure" && p.document.title === "Raid team structure & leadership · Guides — Olympus");

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
    && a.app.textContent.includes("Your class is now Warrior.") && a.app.textContent.includes("Nothing has been sent yet.") && writes.length === 0);
  // Evergreen 12 Nov 2026 (CL2-173): the attach notice says "talent build", not "beta build".
  check(".228 Attach identifies the talent build and asks the applicant to verify it in game", a.app.textContent.includes("level 60 talent build")
    && a.app.textContent.includes("Review it against the current in-game talents."));
  const board = a.app.querySelector("#board-talent-builds-opt-in");
  check(".218 Attach never ticks board sharing", !!board && board.checked === false);
  const dirty = a.app.querySelectorAll("span.dirty").find(el => el.textContent === "Unsaved changes");
  check(".218 the attached build marks the application unsaved, so leaving asks first and saving stays the applicant's choice", !!dirty && dirty.hidden === false && writes.length === 0);

  const classKeys041 = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
  const professionGroups041 = [
    ["Primary Crafting", ["alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring"]],
    ["Gathering", ["herbalism", "mining", "skinning"]],
    ["Secondary", ["cooking", "first_aid", "fishing"]],
  ];
  const professionLayout041 = s => s.querySelectorAll("optgroup").map(group =>
    [group.getAttribute("label"), group.querySelectorAll("option").map(option => option.value)]);
  const same041 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const apply041 = await openPage(MEMBER);
  await apply041.go("#/apply");
  await waitFor(() => !!apply041.app.querySelector('[data-field="class"] select'), ".228 Apply pickers");
  const applyClass041 = apply041.app.querySelector('[data-field="class"] select');
  const leadClass041 = apply041.app.querySelector('[data-field="classLead"] select');
  const altClass041 = apply041.app.querySelector('.talent-application-character select');
  check(".228 Apply class, class-lead and build selectors sort labels without changing the blank and Undecided choices",
    applyClass041.value === "" && same041(applyClass041.options.map(o => o.value), ["", ...classKeys041, "undecided"])
    && [leadClass041, altClass041].every(s => same041(s.options.map(o => o.value), ["", ...classKeys041]))
    && leadClass041.options.slice(1).every(o => o.textContent.toLowerCase().startsWith(o.value)));
  const prof041 = apply041.app.querySelector('[data-field="professions"]');
  const profLabels041 = prof041.querySelectorAll(".profs").map(group => [
    prof041.querySelector("#" + group.getAttribute("aria-labelledby")).textContent,
    group.querySelectorAll("button").map(button => button.textContent),
  ]);
  check(".228 Apply separates crafting, gathering and secondary professions and alphabetizes each group",
    same041(profLabels041, [
      ["Primary Crafting", ["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring"]],
      ["Gathering", ["Herbalism", "Mining", "Skinning"]],
      ["Secondary", ["Cooking", "First Aid", "Fishing"]],
    ]));
  const pick041 = name => byText(prof041, "button", name);
  for (const name of ["Mining", "Herbalism", "Alchemy", "First Aid"]) pick041(name).click();
  check(".228 two gathering choices exhaust the primary limit while First Aid stays selectable",
    prof041.querySelector("#prof-count").textContent === "2 of 2 chosen"
    && ["Mining", "Herbalism", "First Aid"].every(name => pick041(name).getAttribute("aria-pressed") === "true")
    && pick041("Alchemy").getAttribute("aria-pressed") === "false" && pick041("Alchemy").getAttribute("aria-disabled") === "true");
  pick041("Mining").click(); pick041("Alchemy").click();
  check(".228 a freed gathering slot can be used for a crafting choice", pick041("Mining").getAttribute("aria-pressed") === "false"
    && pick041("Alchemy").getAttribute("aria-pressed") === "true" && prof041.querySelector("#prof-count").textContent === "2 of 2 chosen");
  await p.go("#/vote/officer");
  await waitFor(() => !!p.app.querySelector("select.role-pick"), ".228 Board role picker");
  const boardClass041 = p.app.querySelector('select.role-pick optgroup[label="Class leads"]');
  check(".228 the Board's class-lead choices use the same alphabetical display order",
    !!boardClass041 && same041(boardClass041.querySelectorAll("option").map(o => o.value), classKeys041.map(key => "class_lead:" + key)));

  const workshop041 = await openPage(MEMBER), queries041 = [];
  workshop041.intercept((pathname) => {
    if (!pathname.startsWith("/api/community/crafting?")) return null;
    const query = new URL("https://guild.example" + pathname).searchParams;
    queries041.push(query);
    return Response.json({ workshop: { version: 1, mode: "recipes" }, results: [], nextCursor: query.has("profession") && !query.has("cursor") ? "page-2" : null });
  });
  await workshop041.go("#/community/workshop");
  await waitFor(() => !!workshop041.app.querySelector("#f-craft-prof"), ".228 Workshop picker");
  const workshopProfession041 = workshop041.app.querySelector("#f-craft-prof");
  check(".228 Workshop keeps the empty filter and groups the original profession keys",
    workshopProfession041.value === "" && workshopProfession041.options[0].textContent === "Any profession"
    && same041(professionLayout041(workshopProfession041), professionGroups041));
  workshopProfession041.value = "first_aid";
  fire(workshopProfession041.closest("form"), "submit");
  const more041 = byText(workshop041.app, "button", "Show more");
  await waitFor(() => !more041.hidden && !more041.disabled, ".228 Workshop filtered continuation");
  more041.click();
  await waitFor(() => queries041.some(query => query.has("cursor")), ".228 Workshop second page");
  check(".228 a grouped Workshop choice preserves the exact profession filter on continuation",
    queries041.some(query => query.get("profession") === "first_aid" && !query.has("cursor"))
    && queries041.some(query => query.get("profession") === "first_aid" && query.get("cursor") === "page-2"));
  await workshop041.go("#/community/profile");
  await waitFor(() => !!byText(workshop041.app, "button", "Add an offer"), ".228 Profile pickers");
  byText(workshop041.app, "button", "Add a profession").click();
  byText(workshop041.app, "button", "Add an offer").click();
  const profile041 = workshop041.app.querySelector('select[aria-label="Profession"]');
  const offer041 = workshop041.app.querySelector('select[aria-label="Offer profession"]');
  check(".228 Profile and Offer use the same groups and preserve empty defaults",
    [profile041, offer041].every(s => s.value === "" && same041(professionLayout041(s), professionGroups041)));
  await siteUser(STAFF, { global_name: "Staff" });
  const admin041 = await openPage(STAFF), adminQueries041 = [];
  admin041.before((pathname) => { if (pathname.startsWith("/api/admin/applications?")) adminQueries041.push(pathname); return false; });
  await admin041.go("#/admin/applications");
  await waitFor(() => !!admin041.app.querySelector("#application-filter-profession"), ".228 Admin profession filter");
  const adminProfession041 = admin041.app.querySelector("#application-filter-profession");
  check(".228 Admin profession filter shares the same groups and keeps Any profession as its default",
    adminProfession041.value === "" && same041(professionLayout041(adminProfession041), professionGroups041));
  adminProfession041.value = "mining"; fire(adminProfession041, "change");
  await waitFor(() => adminQueries041.some(path => path.includes("profession=mining")), ".228 Admin profession key");
  await waitFor(() => admin041.app.querySelector("#application-filter-profession") !== adminProfession041, ".228 Admin selected filter");
  check(".228 Admin re-render preserves the selected gathering key",
    adminQueries041.some(path => path.includes("profession=mining")) && admin041.app.querySelector("#application-filter-profession").value === "mining");


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

  console.log("\n== .218: Treasury temporary failures stay recoverable ==");
  const slow218=seconds=>new Response('{"error":"slow_down"}',{status:429,headers:{"Content-Type":"application/json","Retry-After":String(seconds)}});
  for(const kind218 of ["rate", "network", "unreadable"]){
    const q218=await treasuryPage218();let requests218=0,caught218=null;
    q218.intercept(path=>{if(path==="/api/treasury-plan/access"){
      requests218++;if(requests218>1)return reply218(true);
      if(kind218==="network")throw new TypeError("synthetic held transport failure");
      if(kind218==="unreadable")return new Response('{"format":"olympus-treasury-access-v1","canRead":"yes"}',{status:200});
      return slow218(17);
    }});
    q218.window.__treasuryClientFixture218.setGrant(false);const original218=q218.window.__treasuryClientFixture218.owner();
    try{await q218.window.__treasuryClientFixture218.refresh({fresh:true});}catch(error){caught218=error;}
    await pause218(30);
    check(".218 "+kind218+" access failure remains a failure, not a cached officer refusal or automatic retry",!!caught218&&caught218.status===(kind218==="rate"?429:kind218==="network"?0:200)&&requests218===1&&q218.window.__treasuryClientFixture218.owner()===original218&&original218.canReadTreasuryPlan===false&&(kind218!=="rate"||caught218.retryAfterSeconds===17));
    const recovered218=await q218.window.__treasuryClientFixture218.refresh({});
    check(".218 a later explicit "+kind218+" refresh reads again and can recover without a stale false cache",recovered218===true&&requests218===2&&original218.canReadTreasuryPlan===true);
  }

  const ratePage218=await treasuryPage218();let accessRequests218=0,rateModules218=0;
  ratePage218.window.__treasuryModuleFixture218=()=>{rateModules218++;throw Error("a rate-limited access check must not import the plan");};
  ratePage218.intercept(path=>{if(path==="/api/treasury-plan/access"){accessRequests218++;return slow218(17);}});
  ratePage218.window.__treasuryClientFixture218.setGrant(false);await ratePage218.go("#/treasury-plan");
  await waitFor(()=>!!byText(ratePage218.app,"button","Reload Treasury plan"),"Treasury rate recovery panel");await pause218(30);
  const staleReload218=byText(ratePage218.app,"button","Reload Treasury plan");
  check(".218 a known429 shows its bounded wait, no raw transport text, no officer denial and no queued nav retry",ratePage218.app.textContent.includes("Wait at least 17 seconds")&&ratePage218.app.textContent.includes("does not confirm or deny your officer role")&&!ratePage218.app.textContent.includes("Failed to fetch")&&!ratePage218.app.textContent.includes("Access follows your in-game rank")&&accessRequests218===1&&rateModules218===0&&!ratePage218.location.reloaded);
  await ratePage218.go("#/guide/member");staleReload218.click();
  check(".218 a detached Treasury reload action cannot reload a different route",!ratePage218.location.reloaded&&accessRequests218===1);

  const modulePage218=await treasuryPage218();let moduleRequests218=0,moduleAccess218=0;
  modulePage218.intercept(path=>{if(path==="/api/treasury-plan/access"){moduleAccess218++;return reply218(true);}});
  modulePage218.window.__treasuryModuleFixture218=()=>{moduleRequests218++;return Promise.reject(new TypeError("Failed to fetch"));};
  await modulePage218.go("#/treasury-plan");await waitFor(()=>!!byText(modulePage218.app,"button","Reload Treasury plan"),"Treasury module recovery panel");await pause218(30);
  check(".218 a module failure gets honest recovery text without claiming a known429 or retrying",modulePage218.app.textContent.includes("The Treasury plan could not be loaded")&&modulePage218.app.textContent.includes("wait a minute before reloading")&&!modulePage218.app.textContent.includes("Failed to fetch")&&!modulePage218.app.textContent.includes("Too many Treasury checks were made")&&moduleRequests218===1&&moduleAccess218===0&&!modulePage218.location.reloaded);
  byText(modulePage218.app,"button","Reload Treasury plan").click();
  check(".218 reloading the failed module is an explicit current-view action, not an automatic import retry",modulePage218.location.reloaded===true&&moduleRequests218===1&&moduleAccess218===0);

  for(const leave218 of ["route", "identity"]){
    const q218=await treasuryPage218();let fail218=null,entered218=0;
    q218.intercept(path=>{if(path==="/api/treasury-plan/access")return reply218(false);});
    q218.window.__treasuryModuleFixture218=()=>{entered218++;return new Promise((resolve,reject)=>{fail218=reject;});};
    await q218.go("#/treasury-plan");await waitFor(()=>entered218===1&&typeof fail218==="function","held Treasury module");
    if(leave218==="route")await q218.go("#/guide/member");else q218.window.__treasuryClientFixture218.replaceIdentity("300000000000218197");
    await settle();const survivingText218=q218.app.textContent;fail218(new TypeError("Failed to fetch"));await pause218(30);
    check(".218 a late failed module cannot overwrite a changed "+leave218,q218.app.textContent===survivingText218&&!q218.app.textContent.includes("Treasury plan temporarily unavailable")&&!q218.app.textContent.includes("Failed to fetch"));
  }

  // Real signOut intent increments the actor revision BEFORE the held logout request completes.
  const logoutLate218=await treasuryPage218(),logoutGate218=deferred218();let logoutStarted218=false,lateModuleReject218=null,logoutModules218=0;
  logoutLate218.intercept(async path=>{if(path==="/auth/logout"){logoutStarted218=true;await logoutGate218.promise;return new Response("{}",{status:200});}});
  logoutLate218.window.__treasuryModuleFixture218=()=>{logoutModules218++;return new Promise((resolve,reject)=>{lateModuleReject218=reject;});};
  await logoutLate218.go("#/treasury-plan");await waitFor(()=>typeof lateModuleReject218==="function","Treasury module before held logout");
  const logoutOwner218=logoutLate218.window.__treasuryClientFixture218.owner(),logoutRevision218=logoutLate218.window.__treasuryClientFixture218.state().revision;
  byText(logoutLate218.app,"button","Sign out").click();await waitFor(()=>logoutStarted218,"actual signOut held transport");
  const logoutWaitingText218=logoutLate218.app.textContent;
  lateModuleReject218(new TypeError("Failed to fetch"));await pause218(30);
  check(".218 a late module rejection after real logout intent cannot paint recovery while the original view still exists",logoutLate218.window.__treasuryClientFixture218.state().revision===logoutRevision218+1&&logoutLate218.window.__treasuryClientFixture218.state().signedIn&&logoutLate218.window.__treasuryClientFixture218.owner()===logoutOwner218&&logoutLate218.location.hash==="#/treasury-plan"&&logoutLate218.app.textContent===logoutWaitingText218&&!logoutLate218.app.textContent.includes("Treasury plan temporarily unavailable")&&!byText(logoutLate218.app,"button","Reload Treasury plan")&&logoutModules218===1&&!logoutLate218.location.reloaded);
  logoutGate218.resolve();await settle();

  const logoutButton218=await treasuryPage218(),buttonLogoutGate218=deferred218();let buttonLogoutStarted218=false;
  logoutButton218.intercept(async path=>{if(path==="/auth/logout"){buttonLogoutStarted218=true;await buttonLogoutGate218.promise;return new Response("{}",{status:200});}});
  logoutButton218.window.__treasuryModuleFixture218=()=>Promise.reject(new TypeError("Failed to fetch"));
  await logoutButton218.go("#/treasury-plan");await waitFor(()=>!!byText(logoutButton218.app,"button","Reload Treasury plan"),"Treasury reload button before held logout");
  const oldReload218=byText(logoutButton218.app,"button","Reload Treasury plan"),buttonOwner218=logoutButton218.window.__treasuryClientFixture218.owner(),buttonRevision218=logoutButton218.window.__treasuryClientFixture218.state().revision;
  byText(logoutButton218.app,"button","Sign out").click();await waitFor(()=>buttonLogoutStarted218,"reload-button actual signOut held transport");oldReload218.click();await pause218(30);
  check(".218 a Treasury reload button created before logout intent is inert while logout transport waits",logoutButton218.window.__treasuryClientFixture218.state().revision===buttonRevision218+1&&logoutButton218.window.__treasuryClientFixture218.state().signedIn&&logoutButton218.window.__treasuryClientFixture218.owner()===buttonOwner218&&logoutButton218.location.hash==="#/treasury-plan"&&logoutButton218.app.contains(oldReload218)&&!logoutButton218.location.reloaded);
  buttonLogoutGate218.resolve();await settle();

  const validFalse218=await treasuryPage218();let validFalseReads218=0;
  validFalse218.intercept(path=>{if(path==="/api/treasury-plan/access"){validFalseReads218++;return reply218(false);}});
  await validFalse218.window.__treasuryClientFixture218.refresh({fresh:true});await validFalse218.window.__treasuryClientFixture218.refresh({});
  check(".218 a real boolean refusal still has the existing scoped presentation cache",validFalseReads218===1&&validFalse218.window.__treasuryClientFixture218.owner().canReadTreasuryPlan===false);


  console.log("\n== CC160: mounted Treasury grants are dated ==");
  const ttl160=15*60000;
  const bounded160=await timedTreasury218(),allow160=deferred218(),deny160=deferred218();
  let read160=0;
  bounded160.page.intercept(async path=>{
    if(path!=="/api/treasury-plan/access")return;
    const attempt=++read160;await (attempt===1?allow160:deny160).promise;
    return reply218(attempt===1);
  });
  await bounded160.page.go("#/treasury-plan");await waitFor(()=>plan218(bounded160.page),"fresh boot Treasury plan");
  const originalPlan160=bounded160.page.app.querySelector("[data-treasury-plan-fixture]");
  const originalBar160=bounded160.page.app.querySelector("header.topbar");
  bounded160.page.clock(bounded160.clock+ttl160-1);visibility218(bounded160.page);
  check("CC160 fresh boot presentation remains usable inside its original bound without a read",plan218(bounded160.page)&&read160===0&&bounded160.rendered.count===1);
  check("CC081 the authorized Treasury mount receives the canonical office label from real metadata",
    bounded160.rendered.herald==="Lord High Herald · Minister of Propaganda"&&read160===0);
  bounded160.page.clock(bounded160.clock+ttl160);
  const expiry160=[...bounded160.scheduled].at(-1);
  expiry160?.fire();
  await settle();
  check("CC160 mounted expiry detaches the plan before the stale check responds",!plan218(bounded160.page)&&bounded160.rendered.disposed===0&&read160===1);
  visibility218(bounded160.page);visibility218(bounded160.page);await settle();
  check("CC160 repeated visible events share the pending current Treasury check",read160===1);
  allow160.resolve();await settle();await settle();
  check("CC160 a current positive reply restores the same dated plan without remounting",
    bounded160.page.app.querySelector("[data-treasury-plan-fixture]")===originalPlan160
    && bounded160.page.app.querySelector("header.topbar")===originalBar160
    && bounded160.rendered.count===1 && bounded160.rendered.disposed===0 && read160===1);
  bounded160.page.clock(bounded160.clock+ttl160*2);
  visibility218(bounded160.page);await settle();
  check("CC160 visibility restore also removes an expired plan before the response",!plan218(bounded160.page)&&read160===2);
  deny160.resolve();await settle();await settle();
  check("CC160 fresh revocation shows the officer gate and never remounts the expired plan",!plan218(bounded160.page)&&bounded160.page.app.textContent.includes("Officers and above")&&bounded160.rendered.count===1&&bounded160.rendered.disposed===1);

  const fail160=await timedTreasury218();let failedReads160=0;
  fail160.page.intercept(path=>{if(path==="/api/treasury-plan/access"){failedReads160++;return slow218(17);}});
  await fail160.page.go("#/treasury-plan");await waitFor(()=>plan218(fail160.page),"Treasury before stale 429");
  fail160.page.clock(fail160.clock+ttl160);fail160.page.window.dispatchEvent(new Event("pageshow"));
  await settle();visibility218(fail160.page);await settle();
  check("CC160 stale 429 keeps the old plan off screen, tells the original wait and does not retry",!plan218(fail160.page)&&failedReads160===1&&fail160.page.app.textContent.includes("Wait at least 17 seconds")&&!fail160.page.app.textContent.includes("Access follows your in-game rank"));

  const depart160=await timedTreasury218(),late401160=deferred218();let departureReads160=0;
  depart160.page.intercept(async path=>{if(path==="/api/treasury-plan/access"){
    departureReads160++;await late401160.promise;
    return new Response('{"error":"signed_out"}',{status:401});
  }});
  await depart160.page.go("#/treasury-plan");await waitFor(()=>plan218(depart160.page),"Treasury before leaving stale route");
  depart160.page.clock(depart160.clock+ttl160);visibility218(depart160.page);await settle();
  await depart160.page.go("#/guide/member");late401160.resolve();await settle();await settle();
  check("CC160 departed stale Treasury 401 neither paints plan nor signs out the current other route",departureReads160===1&&!plan218(depart160.page)&&depart160.page.location.hash==="#/guide/member"&&depart160.page.window.__treasuryClientFixture218.state().signedIn);


  const hidden160=await timedTreasury218({ channel: false });let hiddenReads160=0;
  hidden160.page.intercept(path=>{if(path==="/api/treasury-plan/access"){hiddenReads160++;return reply218(false);}});
  await hidden160.page.go("#/treasury-plan");await waitFor(()=>plan218(hidden160.page),"Treasury before hidden expiry");
  visibility218(hidden160.page,true);
  hidden160.page.clock(hidden160.clock+ttl160);[...hidden160.scheduled].at(-1)?.fire();await settle();
  check("CC160 hidden expiry clears the plan without a background check even without BroadcastChannel",!plan218(hidden160.page)&&hiddenReads160===0);
  visibility218(hidden160.page);await settle();await settle();
  check("CC160 visible restore after hidden expiry reads once and keeps an officer refusal",!plan218(hidden160.page)&&hiddenReads160===1&&hidden160.page.app.textContent.includes("Officers and above"));

  const restored160=await timedTreasury218(),beforeFreeze160=deferred218(),afterFreeze160=deferred218();let restoreReads160=0;
  restored160.page.intercept(async path=>{if(path==="/api/treasury-plan/access"){
    const n=++restoreReads160;await(n===1?beforeFreeze160.promise:afterFreeze160.promise);return reply218(n===1);
  }});
  await restored160.page.go("#/treasury-plan");await waitFor(()=>plan218(restored160.page),"Treasury before simulated bfcache");
  const original160=restored160.page.window.__treasuryClientFixture218.refresh({fresh:true});
  await waitFor(()=>restoreReads160===1,"older Treasury request before freeze");
  const restoreEvent160=new Event("pageshow");restoreEvent160.persisted=true;restored160.page.window.dispatchEvent(restoreEvent160);
  await settle();beforeFreeze160.resolve();await original160;await settle();
  check("CC160 bfcache restore rechecks even a dated grant and discards the pre-restore reply",!plan218(restored160.page)&&restoreReads160===2&&restored160.rendered.count===1);
  afterFreeze160.resolve();await settle();await settle();
  check("CC160 only the post-restore refusal settles the current Treasury display",!plan218(restored160.page)&&restored160.page.app.textContent.includes("Officers and above")&&restored160.rendered.count===1);

  const aging160=await timedTreasury218(),agingReply160=deferred218();let agingReads160=0;
  aging160.page.intercept(async path=>{if(path==="/api/treasury-plan/access"){
    agingReads160++;await agingReply160.promise;return reply218(true);
  }});
  aging160.page.clock(aging160.clock+ttl160);
  await aging160.page.go("#/treasury-plan");await waitFor(()=>agingReads160===1,"dated Treasury direct entry");
  check("CC160 an expired boot grant cannot mount a direct route while it waits",!plan218(aging160.page)&&aging160.rendered.count===0);
  aging160.page.clock(aging160.clock+ttl160*2);agingReply160.resolve();await settle();await settle();
  check("CC160 a positive reply held through another entire TTL cannot start a new display grant",!plan218(aging160.page)&&agingReads160===1&&aging160.page.app.textContent.includes("Treasury plan temporarily unavailable"));

  const sender160=await timedTreasury218(), receiver160=await timedTreasury218(), draft160=await timedTreasury218(), held160=await timedTreasury218();
  const logout160=deferred218(), replyHeld160=deferred218();let senderReads160=0,heldReads160=0;
  sender160.page.intercept(async path=>{if(path==="/auth/logout"){senderReads160++;await logout160.promise;return new Response('{"ok":true}',{status:200});}});
  held160.page.intercept(async path=>{if(path==="/api/treasury-plan/access"){heldReads160++;await replyHeld160.promise;return reply218(true);}});
  await receiver160.page.go("#/treasury-plan");await waitFor(()=>plan218(receiver160.page),"receiver's mounted Treasury");
  held160.page.window.__treasuryClientFixture218.setGrant(false);
  await held160.page.go("#/treasury-plan");await settle();
  await draft160.page.go("#/apply");const draftNode160=draft160.page.app.querySelector(".talent-application-character textarea");
  if(draftNode160)draftNode160.value="unsaved draft fixture";
  const msgs160=treasuryBus218.messages.length,rev160=draft160.page.window.__treasuryClientFixture218.state().revision;
  byText(sender160.page.app,"button","Sign out").click();await settle();
  check("CC160 sign-out intent alone sends nothing to the receiving tabs",senderReads160===1&&treasuryBus218.messages.length===msgs160&&plan218(receiver160.page));
  logout160.resolve();await settle();await settle();
  check("CC160 confirmed sign-out sends only the fixed identity-free notice and clears the mounted plan in its tab",treasuryBus218.messages.length===msgs160+1&&treasuryBus218.messages.at(-1)==="signed-out"&&!plan218(receiver160.page)&&receiver160.rendered.disposed===1&&receiver160.page.location.hash==="#/treasury-plan");
  replyHeld160.resolve();await settle();await settle();
  check("CC160 old positive replies after another tab signs out cannot display Treasury",heldReads160===1&&!plan218(held160.page)&&held160.rendered.count===0);
  check("CC160 a receiving tab keeps its unrelated draft, route, and actor revision",!!draftNode160&&draft160.page.app.contains(draftNode160)&&draftNode160.value==="unsaved draft fixture"&&draft160.page.location.hash==="#/apply"&&draft160.page.window.__treasuryClientFixture218.state().revision===rev160);

  const reject160=await timedTreasury218();let rejection160=0;
  reject160.page.intercept(path=>{if(path==="/auth/logout"){rejection160++;return new Response('{"error":"unconfirmed"}',{status:503});}});
  const notified160=treasuryBus218.messages.length;
  byText(reject160.page.app,"button","Sign out").click();await settle();await settle();
  check("CC160 a failed original sign-out does not broadcast success",rejection160===1&&treasuryBus218.messages.length===notified160);

  console.log("\n" + ok + "/" + n + " passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename;
execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixturePrefix218 + "\n" + body218, __filename);
