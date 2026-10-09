// Build .121: real planner source/DOM tests, owner policy, zero allowances and actual .120 export compatibility.
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const root = path.join(__dirname, ".."), repo = path.join(root, "..");
const staticDir = path.join(root, "public", "static"), dir = path.join(staticDir, "rank-planner");
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why.map((w) => (typeof w === "string" ? w : JSON.stringify(w)))); console.log((cond ? "PASS " : "FAIL ") + name); };
const read = (f) => fs.readFileSync(f, "utf8");
const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

console.log("\n== the page scripts parse ==");
const scripts = [...fs.readdirSync(staticDir).filter((f) => f.endsWith(".js")).map((f) => path.join(staticDir, f)), ...fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f))];
const unparsed = [];
for (const f of scripts) { try { new vm.Script(read(f), { filename: f }); } catch (e) { unparsed.push(`${path.relative(root, f)}: ${e.message}`); } }
check("every script under public/static and public/static/rank-planner parses (app.js, the planner's app.js, catalogue.js and model.js)", scripts.length >= 4 && ["app.js", "catalogue.js", "model.js"].every((b) => scripts.some((f) => path.basename(f) === b)) && unparsed.length === 0, unparsed);

console.log("\n== the current preset and preserved historical catalogue ==");
const base = { console };
base.globalThis = base;
vm.runInNewContext(read(path.join(dir, "catalogue.js")), base, { filename: "catalogue.js" });
vm.runInNewContext(read(path.join(dir, "model.js")), base, { filename: "model.js" });
const Model = base.OlympusStaffRankPlanner, catalogue = base.OlympusStaffRankCatalogue;
const RECOMMENDED_CURRENT = ["gm", "highcouncil", "officer", "officeralt", "raidlead", "veteran", "raider", "member", "alt", "initiate"];
check("RECOMMENDED uses High Council; Treasurer and Co-GM remain appointments", JSON.stringify([...Model.RECOMMENDED]) === JSON.stringify(RECOMMENDED_CURRENT));
check("  REFERENCE is unchanged (protectRankIndex stays 5, informational only), so every saved and exported draft still imports", JSON.stringify(Model.REFERENCE) === JSON.stringify({ minRanks: 2, maxRanks: 10, captainRankIndex: 1, protectRankIndex: 5, protectRankIndexInformationalOnly: true }));
check("  27 catalogue options with the original source stamp", catalogue.ranks.length === 27 && catalogue.source.sha256 === Model.SOURCE_SHA256);
const reference = JSON.parse(read(path.join(repo, "scripts", "official_asset_reference.json")));
const pins = [...(reference.assets || []), ...(reference.fixed_art_source_pins || [])];
const frozen = ["worker/public/static/rank-planner/app.js", "worker/public/static/rank-planner/model.js", "worker/public/static/rank-planner/catalogue.js", "worker/public/static/rank-planner/styles.css", "worker/src/site-ranks.ts", "worker/src/site-core.ts"];
const drift = frozen.filter((p) => { const rows = pins.filter((r) => r.path === p); const h = sha256(path.join(repo, p)); return rows.length === 0 || rows.some((r) => r.sha256 !== h); });
check("  the planner's app.js, model.js, catalogue.js and styles.css, site-ranks.ts and site-core.ts are byte-identical to their pins in the official asset reference (current reviewed source pins)", drift.length === 0, drift);

// ---------- a stub DOM: what the planner's app.js uses ----------
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parent = null; this.listeners = {}; this.attributes = {}; this.className = ""; this.value = ""; this.checked = false; this.disabled = false; this.open = false; this.dataset = {}; this.id = ""; this.type = ""; this.title = ""; this.isFragment = false; }
  get textContent() { return this.tagName === "#TEXT" ? this.data : this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = []; if (v !== "" && v !== null && v !== undefined) { const t = new Node("#text"); t.data = String(v); this.adopt(t, 0); } }
  adopt(k, i) {
    if (typeof k === "string") { const t = new Node("#text"); t.data = k; k = t; }
    if (k.isFragment) { const kids = k.children.slice(); k.children = []; for (const c of kids) this.adopt(c, i++); return i; }
    if (k.parent) k.parent.drop(k);
    k.parent = this;
    this.children.splice(i, 0, k);
    return i + 1;
  }
  drop(k) { const i = this.children.indexOf(k); if (i >= 0) this.children.splice(i, 1); k.parent = null; }
  append(...kids) { for (const k of kids) this.adopt(k, this.children.length); }
  appendChild(k) { this.append(k); return k; }
  replaceChildren(...kids) { for (const c of this.children) c.parent = null; this.children = []; this.append(...kids); }
  before(...kids) { const p = this.parent; let i = p.children.indexOf(this); for (const k of kids) i = p.adopt(k, i); }
  remove() { if (this.parent) this.parent.drop(this); }
  get previousElementSibling() { const p = this.parent; const sib = p ? p.children.filter((c) => c.tagName !== "#TEXT") : []; const i = sib.indexOf(this); return i > 0 ? sib[i - 1] : null; }
  get classList() {
    const el = this, list = () => el.className.split(/\s+/).filter(Boolean);
    return { add: (c) => { if (!list().includes(c)) el.className = [...list(), c].join(" "); }, remove: (c) => { el.className = list().filter((x) => x !== c).join(" "); }, contains: (c) => list().includes(c), toggle: (c, on) => { const has = list().includes(c); const want = on === undefined ? !has : !!on; if (want && !has) el.className = [...list(), c].join(" "); if (!want && has) el.className = list().filter((x) => x !== c).join(" "); return want; } };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t) { const ev = { type: t, target: this, preventDefault() {} }; for (const f of this.listeners[t] || []) f.call(this, ev); }
  click() { if (this.disabled) return; this.fire("click"); if (this.tagName === "BUTTON" && this.type === "submit") { let f = this.parent; while (f && f.tagName !== "FORM") f = f.parent; if (f) f.fire("submit"); } }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelector(sel) {
    const want = sel.startsWith("#") ? (e) => e.id === sel.slice(1) : /^\[[\w-]+\]$/.test(sel) ? (e) => sel.slice(1, -1) in e.attributes : null;
    if (!want) throw new Error(`the stub DOM has no selector ${sel}`);
    return this.all(want)[0] || null;
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {} select() {}
}
const PAGE_HTML = (() => { const m = read(path.join(root, "src", "site-ranks.ts")).match(/const HTML = (".*");/); return m ? JSON.parse(m[1]) : ""; })();
const PAGE_IDS = [...PAGE_HTML.matchAll(/<(\w+)[^>]*\sid="([a-z-]+)"/g)].map((m) => [m[1], m[2]]);
const STORAGE_KEY = "olympus-admin-rank-draft-v1:472099715253796864";
/** The planner page as /admin/ranks serves it (its element ids), the three scripts run in a fresh context over `store`. */
function openPlanner(store) {
  const doc = new Node("#document");
  const plannerRoot = new Node("main");
  plannerRoot.setAttribute("data-olympus-rank-planner", "");
  plannerRoot.dataset.draftOwner = "472099715253796864";
  doc.append(plannerRoot);
  for (const [tag, id] of PAGE_IDS) { const el = new Node(tag); el.id = id; plannerRoot.append(el); }
  plannerRoot.querySelector("#category").value = "all";
  plannerRoot.querySelector("#sort").value = "tier";
  const document = { querySelector: (s) => doc.querySelector(s), createElement: (t) => new Node(t), createDocumentFragment: () => { const f = new Node("#fragment"); f.isFragment = true; return f; }, body: doc };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => store.delete(k) };
  const sandbox = { document, localStorage, console, setTimeout: () => 0, clearTimeout: () => {}, navigator: {}, JSON, Object, Array, Map, Set, String, Number, Boolean, Error, Math, RegExp, Promise };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  for (const f of ["catalogue.js", "model.js", "app.js"]) vm.runInNewContext(read(path.join(dir, f)), sandbox, { filename: f });
  const $ = (id) => plannerRoot.querySelector("#" + id);
  const saved = () => (store.has(STORAGE_KEY) ? JSON.parse(store.get(STORAGE_KEY)) : null);
  const notices = () => $("notices").children.map((li) => li.textContent);
  const buttonByText = (text) => plannerRoot.all((e) => e.tagName === "BUTTON" && e.textContent === text)[0] || null;
  const buttonByLabel = (label) => plannerRoot.all((e) => e.tagName === "BUTTON" && e.getAttribute("aria-label") === label)[0] || null;
  return { $, saved, notices, buttonByText, buttonByLabel, root: plannerRoot };
}

console.log("\n== the current default and legacy browser draft ==");
check("the planner page still has every element the script reads", ["recommended", "minimum", "notices", "ladder-list", "feedback", "storage-note", "cards", "editor"].every((id) => PAGE_IDS.some(([, x]) => x === id)));
const store = new Map();
let p = openPlanner(store);
const ids = (d) => (d ? d.ranks.map((r) => r.id) : []);
check("a fresh browser saves the current Olympus recommendation", JSON.stringify(ids(p.saved())) === JSON.stringify(RECOMMENDED_CURRENT) && p.saved().title === "Olympus rank ladder" && p.$("ladder-list").children.length === 10 && p.$("storage-note").textContent === "Saved in this browser.");
check("  its notices are the model's own: the index-5 reference line, and nothing of the withdrawn protectRankIndex 4 note", p.notices().some((t) => t.includes("(index 5)")) && !p.notices().some((t) => t.includes("protectRankIndex 4")), p.notices());
const savedRecommended = store.get(STORAGE_KEY);
p = openPlanner(store);
check("  a saved recommendation restores unchanged and without an error", store.get(STORAGE_KEY) === savedRecommended && p.$("feedback").textContent === "" && JSON.stringify(ids(p.saved())) === JSON.stringify(RECOMMENDED_CURRENT));

console.log("\n== the planner's own buttons (unchanged since .114) ==");
check("the page's own buttons only: no Use the permission ladder (withdrawn, the owner's answer 6 of 3 Oct 2026); Start with two ranks follows Use Olympus recommendation", !p.buttonByText("Use the permission ladder") && p.$("minimum").previousElementSibling === p.$("recommended"));
p.$("minimum").click();
let d = p.saved();
check("  Start with two ranks saves Guild Master and Initiate and says so", JSON.stringify(ids(d)) === JSON.stringify(["gm", "initiate"]) && p.$("ladder-list").children.length === 2 && p.$("feedback").textContent === "Started with Guild Master and Initiate.", ids(d));
const crafter = catalogue.ranks.find((r) => r.id === "crafter");
p.buttonByLabel(`Add ${crafter.name}`).click();
d = p.saved();
check("  a rank added lands above Initiate, which stays the entry rank", d.ranks.length === 3 && d.ranks[1].id === "crafter" && d.ranks[2].id === "initiate", ids(d));
p.$("export").click();
check("  Export shows the draft, and it imports again unchanged", p.$("export-dialog").open === true && JSON.stringify(Model.importDraft(p.$("export-text").value, catalogue.ranks)) === JSON.stringify(d));
const smallSaved = store.get(STORAGE_KEY);
p = openPlanner(store);
check("  a reload restores the saved draft", store.get(STORAGE_KEY) === smallSaved && JSON.stringify(ids(p.saved())) === JSON.stringify(["gm", "crafter", "initiate"]) && p.$("feedback").textContent === "");
p.$("recommended").click();
d = p.saved();
check("  Use Olympus recommendation explicitly replaces the draft with the current preset", JSON.stringify(ids(d)) === JSON.stringify(RECOMMENDED_CURRENT) && p.$("feedback").textContent === "Olympus recommendation loaded. Bank withdrawals start at zero until you set your allowances.", ids(d));
check("  it is a valid draft with an explicit positional-integration warning, unprotected entry rank and zero bank allowances", Model.validate(d, catalogue.ranks).length === 0 && Model.compatibility(d).captainCompatible === false && d.ranks[1].id === "highcouncil" && Model.notices(d).some(note => note.text.includes("Captain")) && d.ranks[d.ranks.length - 1].id === "initiate" && d.ranks[d.ranks.length - 1].permissions.auth === false && d.ranks.slice(1).every((r) => r.bank.goldPerDay === 0 && r.bank.defaultStacksPerTabPerDay === 0));
check("  the reference block is the model's own (protectRankIndex 5, informational) and the review stays pending", JSON.stringify(d.reference) === JSON.stringify(Model.REFERENCE) && d.review.liveChangesApplied === false && d.source.sha256 === Model.SOURCE_SHA256);

console.log("\n== the planner script ==");
const APP = read(path.join(dir, "app.js"));
const iconKeys = JSON.parse((APP.match(/const rankIconKeys = (\{[^\n]*\});/) || [])[1] || "null");
const provenance = JSON.parse(read(path.join(staticDir, "wow", "asset-provenance.json")));
check("the rank icons are exactly the provenance file's rank_icon_keys (official art, unchanged)", !!iconKeys && JSON.stringify(iconKeys) === JSON.stringify(provenance.rank_icon_keys) && Object.values(iconKeys).every((k) => fs.existsSync(path.join(staticDir, "wow", `${k}.png`))));
check("  the default draft, the storage key and the restore are unchanged", APP.includes("let draft = Model.createDraft(catalogue);") && APP.includes("const storageKey = 'olympus-admin-rank-draft-v1:' + plannerRoot.dataset.draftOwner;"));
check("  the script writes no markup and fetches nothing", !/\.innerHTML\s*[=+]|insertAdjacentHTML|outerHTML\s*=/.test(APP) && !/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(APP));


console.log("\n== owner policy, provenance and compatibility ==");
const current = Model.createDraft(catalogue.ranks);
const rank = id => current.ranks.find(r => r.id === id);
check("the earlier 26 ideas retain their complete original data", crypto.createHash("sha256").update(JSON.stringify(catalogue.ranks.filter(r => r.id !== "highcouncil"))).digest("hex") === "752e85a9ea2e159a2b59b0bb16b9bae63274462d8abc842f35344b8e9da0e2b1");
check("High Council's sensitive draft rights apply to all rank holders and require an authenticator", ["bundle","promote","demote","invite","remove","repair","gold","tabs","auth"].every(key => rank("highcouncil").permissions[key]) && rank("officer").permissions.gold === false);
check("Raid Leader retains authenticator and Veteran has the requested invitations plus repairs", rank("raidlead").permissions.auth && rank("veteran").permissions.invite && rank("veteran").permissions.repair);
check("the rendered planner reference agrees with the Veteran preset and records the actual owner basis", PAGE_HTML.includes("Veteran has Invite Member (owner item 26) and Guild Bank Repair (owner answer of 7 October); no amount is set.") && !PAGE_HTML.includes("without Invite") && !PAGE_HTML.includes("following the owner’s later decision"));
check("new exports distinguish owner policy from the historical attachment and remain unapproved", current.schema === "olympus-rank-draft/v2" && current.source.policy === Model.POLICY && current.review.claudeCode === "pending" && current.review.codex === "pending" && current.review.liveChangesApplied === false);
check("every non-GM numeric allowance remains zero", current.ranks.slice(1).every(r => r.bank.goldPerDay === 0 && r.bank.defaultStacksPerTabPerDay === 0 && !r.bank.unlimited));
const legacyText = read(path.join(__dirname,"fixtures","rank-planner-v1.json"));
const legacyDraft = Model.importDraft(legacyText, catalogue.ranks);
const legacyStore = new Map([[STORAGE_KEY, legacyText]]);
const legacyPage = openPlanner(legacyStore);
check("opening a real .120 exported draft preserves its bytes, order and permission choices", legacyStore.get(STORAGE_KEY) === legacyText && legacyPage.$("ladder-list").children[1].textContent.includes("Officer") && legacyPage.notices().some(t => t.includes("earlier draft is preserved")) && Model.exportDraft(legacyDraft,catalogue.ranks) === legacyText);
legacyPage.$("recommended").click();
check("replacing the legacy draft is an explicit button action with truthful new provenance", legacyPage.saved().schema === Model.SCHEMA && JSON.stringify(ids(legacyPage.saved())) === JSON.stringify(RECOMMENDED_CURRENT));
const smallLegacy = JSON.parse(legacyText); smallLegacy.ranks = [smallLegacy.ranks[0], smallLegacy.ranks.at(-1)];
const extendedLegacy = Model.addRank(smallLegacy,catalogue.ranks,"highcouncil");
check("explicitly adding High Council upgrades only provenance and the selected new rank", extendedLegacy.schema === Model.SCHEMA && extendedLegacy.source.policy === Model.POLICY && extendedLegacy.ranks[1].id === "highcouncil" && JSON.stringify(extendedLegacy.ranks[2]) === JSON.stringify(smallLegacy.ranks[1]) && smallLegacy.schema === Model.LEGACY_SCHEMA);
const legacySmallStore = new Map([[STORAGE_KEY, JSON.stringify(smallLegacy)]]);
const legacySmallPage = openPlanner(legacySmallStore);
legacySmallPage.buttonByLabel("Add High Council").click();
check("the actual Add High Council button preserves legacy entry choices and adopts current provenance", legacySmallPage.saved().schema === Model.SCHEMA && legacySmallPage.saved().source.policy === Model.POLICY && legacySmallPage.saved().ranks[1].id === "highcouncil" && JSON.stringify(legacySmallPage.saved().ranks[2]) === JSON.stringify(smallLegacy.ranks[1]));
const forgedLegacy = JSON.parse(Model.exportDraft(extendedLegacy,catalogue.ranks)); forgedLegacy.schema = Model.LEGACY_SCHEMA; delete forgedLegacy.source.policy;
check("High Council cannot falsely claim only the legacy codex source", Model.validate(forgedLegacy,catalogue.ranks).length > 0);
const forged = JSON.parse(Model.exportDraft(current,catalogue.ranks)); forged.source.policy = "approved";
check("a forged owner-policy stamp is refused", Model.validate(forged,catalogue.ranks).length > 0);
const falselySigned = JSON.parse(Model.exportDraft(current,catalogue.ranks)); falselySigned.review.claudeCode = "approved";
check("imports cannot claim an agent approval or live application", Model.validate(falselySigned,catalogue.ranks).length > 0);
check("rank planner retains the owner-approved crest only as brand and tab icon", PAGE_HTML.split("/static/olympus-icon.png").length === 3 && !PAGE_HTML.includes("/static/wow/pos-guild_master.png"));

console.log(`\n${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
