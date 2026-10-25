// The actual organization module and model, with a small DOM for its pointer/dialog controls.
// No identity, appointment, provider or permission operation is exercised or authorized here.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/static/organization-view.js"), "utf8");
const css = fs.readFileSync(path.join(root, "public/static/organization-view.css"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(root, "public/static/governance/organization.json"), "utf8"));
let passed = 0, failed = 0;
function check(label, ok) { if (ok) { passed++; console.log("PASS " + label); } else { failed++; console.error("FAIL " + label); } }
class Element {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null; this.attributes = {}; this.style = {}; this.listeners = {}; this.hidden = false; this.open = false; this.value = ""; this._text = ""; this.captures = new Set(); }
  append(...nodes) { for (const n of nodes.flat(Infinity).filter(n => n != null)) { n.remove(); n.parentNode = this; this.children.push(n); } }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; } }
  replaceChildren(...nodes) { for (const n of this.children) n.parentNode = null; this.children = []; this._text = ""; this.append(...nodes); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(""); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get id() { return this.attributes.id || ""; } set id(v) { this.setAttribute("id", v); }
  get className() { return this.attributes.class || ""; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  get classList() {
    const el = this, values = () => new Set(el.className.split(/\s+/).filter(Boolean));
    return { contains: v => values().has(v), add(...vs) { const set = values(); for (const v of vs) set.add(v); el.setAttribute("class", [...set].join(" ")); }, remove(...vs) { el.setAttribute("class", [...values()].filter(v => !vs.includes(v)).join(" ")); }, toggle(v, force) { const set = values(), on = force ?? !set.has(v); if (on) set.add(v); else set.delete(v); el.setAttribute("class", [...set].join(" ")); return on; } };
  }
  closest(selector) { for (let n = this; n; n = n.parentNode) if (selector === "button" && n.tagName === "BUTTON") return n; return null; }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  get isConnected() { return this.doc === this || this.doc.contains(this); }
  all(pred) { return this.children.flatMap(n => [...(pred(n) ? [n] : []), ...n.all(pred)]); }
  addEventListener(type, fn, options) { (this.listeners[type] ||= []).push({ fn, capture: options === true || !!options?.capture, once: !!options?.once }); }
  dispatch(type, init = {}) {
    const event = { type, target: this, detail: 1, defaultPrevented: false, stopped: false, ...init, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    const chain = []; for (let n = this; n; n = n.parentNode) chain.push(n);
    const fire = (n, capture) => { for (const item of [...(n.listeners[type] || [])]) if (item.capture === capture) { item.fn(event); if (item.once) n.listeners[type] = n.listeners[type].filter(x => x !== item); } };
    for (const n of chain.slice().reverse()) { fire(n, true); if (event.stopped) return event; }
    for (const n of chain) { fire(n, false); if (event.stopped) break; }
    return event;
  }
  click(detail = 1) { return this.dispatch("click", { detail }); }
  focus() { this.doc.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch("lostpointercapture", { pointerId: id }); }
  get clientWidth() { return this.inDialog() ? this.doc.dialogWidth : this.doc.viewportWidth; }
  get clientHeight() { return this.inDialog() ? 780 : 600; }
  inDialog() { for (let n = this; n; n = n.parentNode) if (n.tagName === "DIALOG" && n.open) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  showModal() { if (this.failModal) throw new Error("modal refused"); this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
}
function open({ mobile = false, width = 800, officeAvailability = undefined } = {}) {
  const doc = new Element("#document"); doc.doc = doc; doc.head = new Element("head", doc); doc.body = new Element("body", doc); doc.append(doc.head, doc.body);
  doc.viewportWidth = width; doc.dialogWidth = mobile ? width : 1100;
  doc.createElement = t => new Element(t, doc); doc.createElementNS = (_ns, t) => new Element(t, doc);
  doc.getElementById = id => doc.all(n => n.id === id)[0] || null;
  const h = (tag, attrs, ...nodes) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...nodes); return el; };
  const main = h("main"); doc.body.append(main); const frames = [];
  const observers = [];
  class ResizeObserver { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } }
  const sandbox = { document: doc, requestAnimationFrame: fn => frames.push(fn), matchMedia: () => ({ matches: mobile }), ResizeObserver, console };
  vm.runInNewContext(source.replace("export function renderOrganization", "function renderOrganization") + ";globalThis.renderOrganization=renderOrganization;", sandbox, { filename: "organization-view.js" });
  const dispose = sandbox.renderOrganization(main, data, { h, add: (el, nodes) => el.append(nodes), clear: el => el.replaceChildren(), posIcon: () => h("img"), parts: [], officeAvailability });
  const flush = () => { while (frames.length) frames.shift()(); }; flush();
  const one = cls => main.all(n => n.classList.contains(cls))[0];
  const button = text => main.all(n => n.tagName === "BUTTON" && n.textContent === text)[0];
  const node = id => main.all(n => n.getAttribute("data-organization-node") === id)[0];
  const pointer = (target, type, x, y, more = {}) => target.dispatch(type, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, ...more });
  const resize = width => { doc.viewportWidth = width; for (const observer of observers) if (!observer.disconnected) observer.fn(); flush(); };
  return { main, doc, flush, one, button, node, pointer, resize, dispose, observers, viewport: one("org-viewport"), stage: one("org-stage"), detail: one("org-inspector"), dialog: one("org-fullscreen") };
}
const p = open();
check(".199 exact ten ranks and individual High Council/Officer Corps cards are visible", p.main.all(n=>!!n.getAttribute('data-native-rank')).map(n=>n.children[0].textContent).join('|') === 'Leader|High Council|Officer|Officer Alt|Raid Leader|Veteran|Raider|Member|Alt|Initiate' && p.main.all(n=>!!n.getAttribute('data-office-key')).length === 95 && p.main.all(n=>n.getAttribute('data-tier-group')==='high_council').length===1 && p.main.all(n=>n.getAttribute('data-tier-group')==='officer_corps').length===1);
check("each eligible office has its exact track and stable key in the application deep link",data.terms.filter(t=>t.applicationEligible).every(t=>p.main.all(n=>n.getAttribute('data-office-application')===t.officeKey).some(n=>n.getAttribute('href')==='#/vote/'+t.applicationTrack+'/'+encodeURIComponent(t.officeKey))));
check("unknown vacancy is never described as an open seat and reserved roles have no application link", !p.main.textContent.includes('Open seat') && ['office_19','office_41','office_43','office_86'].every(key=>!p.main.all(n=>n.getAttribute('data-office-application')===key).length));
const occupied199=open({officeAvailability:{office_03:false,office_62:false,office_74:true}});
check("fresh closed/occupied seats suppress Apply while an explicitly open seat keeps its exact route",!occupied199.main.all(n=>['office_03','office_62'].includes(n.getAttribute('data-office-application'))).length&&occupied199.main.all(n=>n.getAttribute('data-office-application')==='office_74').every(n=>n.textContent==='Apply for this Seat on /#/vote'));
check("historical profiles are collapsed behind the named technical disclosure and the crosswalk is linked",p.main.all(n=>n.tagName==='DETAILS'&&n.classList.contains('org-profile-notes')).some(n=>!n.open&&n.children[0].textContent==='Technical & Historical Profile Notes')&&p.main.all(n=>n.tagName==='A').some(n=>n.getAttribute('href')==='#/roles/rosetta-stone'));
check("all non-classification offices retain chart cards", p.main.all(n => !!n.getAttribute("data-organization-node")).length === data.nodes.filter(n => n.relation !== "classification").length);
check("the Council remains initially selected", p.node("council").getAttribute("aria-pressed") === "true");
const council = p.one("org-council-overview"), offices = p.one("org-council-offices");
check("the current core Council and all retained portfolio offices are shown exactly", JSON.stringify(offices.children.map(n => n.textContent)) === JSON.stringify(["Guild Master", "Co-Guild Master", "Treasurer", "War Head for PvP", "War Head for Raiding", "Minister of Artisanry", "Minister of Heraldry"]) && JSON.stringify(data.councilComposition.historicalDirection.offices)===JSON.stringify(["Co-Guild Master", "War Head for PvP", "War Head for Raiding", "Federal Treasurer", "Minister of Artisanry", "Minister of Heraldry"]));
check("accepted seats are distinguished from a five-seat cap", council.textContent.includes("require an accepted appointment") && council.textContent.includes("not a five-seat limit"));
check("Justice keeps case designation and conflict review", council.textContent.includes("ordinarily serve the Council of Justice, subject to case designation and conflict review"));
check("support, advisers, native rank and the Co-GM direction do not issue votes or permission", council.textContent.includes("shared support") && council.textContent.includes("not automatically voting councillors") && council.textContent.includes("does not itself issue an eligible vote, individual warrant, native rank or permission") && council.textContent.includes("One person still has one vote, subject to recusal"));
check("the current composition direction keeps warrants, votes, permissions and missing signatures separate", council.textContent.includes("Guild Master, Co-Guild Master and Treasurer as the core Council offices") && p.one("org-composition-status").textContent === data.councilComposition.formalStatus && p.one("org-composition-status").textContent.includes("Individual accepted warrants, eligible votes and permissions remain separate") && p.one("org-composition-status").textContent.includes("Constitutional recommendation and Founder ratification are not recorded") && data.councilComposition.founderRatificationRecorded===false && data.councilComposition.eligibleSeatIssued===false && data.councilComposition.permissionsApplied===false && data.councilComposition.historicalDirection.formalStatus.includes("Founder ratification are not recorded"));
check("the separate dated direction is reachable without relabelling R7 as adopted R8", council.all(n => n.tagName === "A").some(n => n.getAttribute("href") === data.councilComposition.sourcePath && n.textContent === "Read the historical Council direction (19–23 October 2026)") && data.revision === "R7" && data.councilComposition.founderRatificationRecorded === false);
const councilRecord199 = fs.readFileSync(path.join(root, "public", data.councilComposition.sourcePath.replace(/^\/+/, "")));
const councilPriorStart199 = councilRecord199.indexOf(Buffer.from("# Current composition clarification — 23 October 2026"));
const councilNotice199 = councilRecord199.subarray(0, councilPriorStart199), councilHistory199 = councilRecord199.subarray(councilPriorStart199);
const councilDigest199 = bytes => require("node:crypto").createHash("sha256").update(bytes).digest("hex");
check("the dated Council record retains its entire original2939-byte historical body exactly after the new notice", councilPriorStart199 > 0 && councilHistory199.length === 2939 && councilDigest199(councilHistory199) === "1e680ab2afba2e40520a140518f9c8322246f51adb33c118ca70fbb791b94627");
check("the owner supersession is one exact prefix and removing it recovers only the preserved historical record", councilNotice199.length === 886 && councilDigest199(councilNotice199) === "272199fde83ac5fa65d41c33711358c7ef8dc53bdd36d73c68b136a4818f5ac2" && Buffer.concat([councilNotice199, councilHistory199]).equals(councilRecord199));
check("the current website notice states exactzero-based slots and appointments without claiming actual game or signing-profile adoption", councilNotice199.toString().includes("current .199 website hierarchy") && councilNotice199.toString().includes("Leader: zero-based slot 0; High Council: zero-based slot 1; Officer: zero-based slot 2") && councilNotice199.toString().includes("Co-Guild Master and Treasurer are High Council appointments, **not additional native ranks**") && councilNotice199.toString().includes("(/#/roles/rosetta-stone)") && councilNotice199.toString().includes("Actual in-game configuration, signing profiles, accepted warrants, Council votes and bank permissions require their separate attended verification and records."));
check("the clarification links the existing operational charter", council.all(n => n.tagName === "A").some(n => n.getAttribute("href") === "#/governance/operational-charter-the-work-of-olympus" && n.textContent.includes("O3")));
check("the static model still issues no appointments", data.appointmentsIssued === false);
const chartNodes = data.nodes.filter(n => n.relation !== "classification"), visibleIds = page => page.main.all(n => n.getAttribute("data-organization-node") && !n.hidden).map(n => n.getAttribute("data-organization-node"));
const scaleOf = page => Number(/scale\(([^)]+)\)/.exec(page.stage.style.transform)?.[1]);
const wholeMapFits = page => { const [, x, y, scale] = /translate\(([^p]+)px, ([^p]+)px\) scale\(([^)]+)\)/.exec(page.stage.style.transform).map(Number); return x >= 0 && y >= 0 && x + parseFloat(page.stage.style.width) * scale <= page.viewport.clientWidth && y + parseFloat(page.stage.style.height) * scale <= page.viewport.clientHeight; };
check("initial desktop view shows every chart office fitted inside the viewport without a branch click", visibleIds(p).length === chartNodes.length && p.button("Full map").getAttribute("aria-pressed") === "true" && p.button("Fit branch").getAttribute("aria-pressed") === "false" && wholeMapFits(p));
p.doc.getElementById("organization-view-style").dispatch("load");p.flush();p.resize(1000);
check("stylesheet completion and viewport resize preserve the full initial overview", visibleIds(p).length === chartNodes.length && p.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(p));
p.button("Fit branch").click();
check("initial branch keeps the selected office, parent and its direct connections", JSON.stringify(visibleIds(p).sort()) === JSON.stringify(chartNodes.filter(n => n.id === "council" || n.id === "founder" || n.parent === "council").map(n => n.id).sort()));
check("branch fit keeps labels at a readable scale rather than shrinking the full map", scaleOf(p) >= .85 && p.button("Fit branch").getAttribute("aria-pressed") === "true" && p.one("org-chart-shell").textContent.includes("drag to see the rest"));
check("the complete reading view retains every group and label", p.one("org-list").children.length === data.nodes.length && p.main.all(n => n.classList.contains("organization-term")).length === data.terms.length);
check("the two composition sources have a separate wrapping link group", p.one("org-composition-links").children.length === 2 && css.includes(".org-composition-links{display:flex;flex-wrap:wrap;gap:"));
const expectedEdges = chartNodes.flatMap(n => [n.parent ? `${n.title} → ${data.nodes.find(p => p.id === n.parent).title}: ${data.legend[n.relation]}` : null, ...n.coordinates.filter(peer => peer !== n.parent).map(peer => `${n.title} → ${data.nodes.find(p => p.id === peer).title}: liaison; no command authority`)]).filter(Boolean).sort();
const renderedEdges = p.main.all(n => n.tagName === "PATH" && n.classList.contains("org-edge"));
check("branch presentation preserves every original directed relationship and explanation", JSON.stringify(renderedEdges.map(n => n.textContent).sort()) === JSON.stringify(expectedEdges));
check("branch connectors never include hidden endpoints or missing geometry", renderedEdges.filter(n => n.style.display !== "none").every(n => n.getAttribute("d")?.startsWith("M ")));
p.button("Full map").click();
check("Full map restores every chart office and relationship without changing the reader model", visibleIds(p).length === chartNodes.length && renderedEdges.every(n => n.style.display !== "none" && n.getAttribute("d")) && p.button("Full map").getAttribute("aria-pressed") === "true");
const boxes = page => chartNodes.map(n => ({ id: n.id, left: parseFloat(page.node(n.id).style.left), top: parseFloat(page.node(n.id).style.top) }));
const mapBoxes = boxes(p), mapWidth = parseFloat(p.stage.style.width), mapHeight = parseFloat(p.stage.style.height);
const oldLeafWidth = Math.max(1100, chartNodes.filter(n => !chartNodes.some(c => c.parent === n.id)).length * 270 + 40);
check("the complete map wraps families into compact levels instead of an office-wide leaf strip", mapWidth <= 1000 && mapWidth < oldLeafWidth / 3 && mapHeight > mapWidth);
check("every compact map card stays inside its canvas with separate readable card geometry", mapBoxes.every(b => b.left >= 0 && b.top >= 0 && b.left + 230 <= mapWidth && b.top + 124 <= mapHeight) && mapBoxes.every((a, i) => mapBoxes.slice(i + 1).every(b => Math.abs(a.left - b.left) >= 230 || Math.abs(a.top - b.top) >= 124)));
check("wrapping never moves a child above its actual parent or invents a new reporting level", chartNodes.filter(n => n.parent).every(n => mapBoxes.find(b => b.id === n.id).top > mapBoxes.find(b => b.id === n.parent).top));
function crossesCard(path, cards) {
  const values = path.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number), points = [];
  for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
  return points.slice(1).some((b, i) => {
    const a = points[i];
    return cards.some(c => a.x === b.x ? a.x > c.left && a.x < c.left + 230 && Math.max(a.y, b.y) > c.top && Math.min(a.y, b.y) < c.top + 124 : a.y === b.y ? a.y > c.top && a.y < c.top + 124 && Math.max(a.x, b.x) > c.left && Math.min(a.x, b.x) < c.left + 230 : true);
  });
}
check("wrapped relationship connectors stay in the gutters and never cross an office label", renderedEdges.every(edge => !crossesCard(edge, mapBoxes)));
check("the small full-map overview is explicitly distinguished from readable branch fit", p.one("org-chart-shell").textContent.includes("Full map overview") && p.one("org-chart-shell").textContent.includes("choose Fit branch to read it"));
const overview183 = open();overview183.button("Full screen").click();overview183.flush();
check("opening full screen preserves all offices in overview rather than zooming to the selected branch", visibleIds(overview183).length === chartNodes.length && overview183.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(overview183));
overview183.button("Close full screen").click();overview183.flush();
check("closing full screen preserves the complete inline overview", visibleIds(overview183).length === chartNodes.length && overview183.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(overview183));
const disposedTransform183=overview183.stage.style.transform;overview183.dispose();overview183.resize(500);
check("leaving the organization disconnects only its own resize observer and prevents late layout work", overview183.observers.every(observer=>observer.disconnected) && overview183.stage.style.transform===disposedTransform183);
p.node("treasury").click(0); p.button("Fit branch").click();
check("a selected branch includes incoming working partners without inventing reporting authority", JSON.stringify(visibleIds(p).sort()) === JSON.stringify(["treasury", "council", "emissary-finance"].sort()) && p.node("treasury").getAttribute("aria-pressed") === "true" && scaleOf(p) >= .85);
p.node("council").click(0);

let before = p.stage.style.transform;
const down = p.pointer(p.viewport, "pointerdown", 100, 100);
check("empty-space pan prevents selection and focuses the chart", down.defaultPrevented && p.doc.activeElement === p.viewport && p.viewport.hasPointerCapture(1));
p.pointer(p.viewport, "pointermove", 103, 102);
check("small pointer jitter does not move the chart", p.stage.style.transform === before && !p.viewport.classList.contains("is-dragging"));
p.pointer(p.viewport, "pointermove", 130, 120);
check("primary movement pans and exposes grabbing state", p.stage.style.transform !== before && p.viewport.classList.contains("is-dragging"));
before = p.stage.style.transform; p.pointer(p.viewport, "pointermove", 800, 800, { pointerId: 2 });
check("a second pointer cannot move the active pan", p.stage.style.transform === before);
p.pointer(p.viewport, "pointerup", 800, 800, { pointerId: 2 });
check("a secondary pointer ending cannot cancel the primary pan", p.viewport.hasPointerCapture(1) && p.viewport.classList.contains("is-dragging"));
p.pointer(p.viewport, "pointerup", 130, 120);
check("pan completion releases pointer capture and grabbing state", !p.viewport.hasPointerCapture(1) && !p.viewport.classList.contains("is-dragging"));
check("chart selection is prevented independently of pointer type", p.stage.dispatch("selectstart").defaultPrevented);

const war = p.node("war"), label = war.children[1].children[0];
const cardDown = p.pointer(label, "pointerdown", 50, 50);
p.pointer(label, "pointermove", 52, 51); p.pointer(label, "pointerup", 52, 51); war.click();
check("an ordinary card click still opens and focuses its mandate", !cardDown.defaultPrevented && war.getAttribute("aria-pressed") === "true" && p.doc.activeElement === p.detail && p.detail.textContent.includes("Department of War"));
before = p.stage.style.transform;
p.pointer(label, "pointerdown", 50, 50); p.pointer(label, "pointermove", 85, 70); p.pointer(p.viewport, "pointerup", 85, 70);
const afterPan = p.node("treasury").click();
check("dragging a card pans without selecting another office on release", p.stage.style.transform !== before && afterPan.defaultPrevented && p.node("war").getAttribute("aria-pressed") === "true");
p.node("treasury").click(0);
check("keyboard card activation is not suppressed by a preceding drag", p.node("treasury").getAttribute("aria-pressed") === "true");
before = p.stage.style.transform; p.pointer(p.viewport, "pointerdown", 1, 1, { button: 2 }); p.pointer(p.viewport, "pointermove", 90, 90);
check("right-button gestures do not begin a chart pan", p.stage.style.transform === before);
p.pointer(p.viewport, "pointerdown", 1, 1); p.pointer(p.viewport, "pointermove", 20, 20); p.pointer(p.viewport, "pointercancel", 20, 20);
check("cancelled pointers release pan state", !p.viewport.hasPointerCapture(1) && !p.viewport.classList.contains("is-dragging"));

const expand = p.button("Full screen"), shell = p.one("org-chart-shell"), location = p.one("org-chart-location");
expand.click(); p.flush();
check("full screen uses a labelled modal with the same live chart", p.dialog.open && p.dialog.getAttribute("aria-label") === "Organization chart in full screen" && p.dialog.contains(shell) && p.dialog.contains(p.viewport));
check("all controls and the office inspector remain inside full screen", p.dialog.contains(p.button("Fit branch")) && p.dialog.contains(p.button("Full map")) && p.dialog.contains(p.detail) && p.dialog.contains(p.one("org-toolbar")));
check("expanded state and chart focus are accessible", expand.getAttribute("aria-expanded") === "true" && expand.textContent === "Exit full screen" && p.doc.activeElement === p.viewport);
p.button("List").click();
check("reading view works in full screen and retains a visible close control", p.viewport.hidden && !p.one("org-list").hidden && p.button("Close full screen") && !p.button("Close full screen").hidden);
p.button("Close full screen").click(); p.flush();
check("closing in List restores the shell, selection and visible reading control focus", !p.dialog.open && location.contains(shell) && expand.getAttribute("aria-expanded") === "false" && p.doc.activeElement === p.button("List") && p.node("treasury").getAttribute("aria-pressed") === "true");
p.button("Chart").click(); expand.click(); p.flush();
p.dialog.close(); p.flush(); // The same close event is produced by the browser's native Escape action.
check("native Escape/close returns the chart without losing its reading controls", location.contains(shell) && p.doc.activeElement === expand && !p.viewport.hidden);
check("repeated open and close does not duplicate the chart or toolbar", p.main.all(n => n.classList.contains("org-viewport")).length === 1 && p.main.all(n => n.classList.contains("org-toolbar")).length === 1);
p.dialog.failModal = true; expand.click();
check("a refused modal restores the usable inline chart and reports the failure", !p.dialog.open && location.contains(shell) && p.main.textContent.includes("Full screen could not be opened"));
p.dialog.failModal = false; p.dialog.showModal = undefined; expand.click();
check("unsupported modal browsers keep the inline chart and list", location.contains(shell) && p.main.textContent.includes("Full screen is unavailable") && p.button("List"));

const k = open(), initial = k.stage.style.transform;
check("keyboard arrows still pan and prevent page scrolling", k.viewport.dispatch("keydown", { key: "ArrowRight" }).defaultPrevented && k.stage.style.transform !== initial);
k.viewport.dispatch("keydown", { key: "Home" }); const home = k.stage.style.transform;
k.viewport.dispatch("keydown", { key: "+" });
check("keyboard zoom and fit remain available", k.stage.style.transform !== home && k.viewport.dispatch("keydown", { key: "0" }).defaultPrevented && k.stage.style.transform === home);
before = k.stage.style.transform;
check("ordinary wheel scrolling is left to the page", !k.viewport.dispatch("wheel", { deltaY: -1 }).defaultPrevented && k.stage.style.transform === before);
check("Ctrl-wheel still zooms within the chart", k.viewport.dispatch("wheel", { ctrlKey: true, deltaY: -1, clientX: 100, clientY: 100 }).defaultPrevented && k.stage.style.transform !== before);
const mobile = open({ mobile: true, width: 315 });
check("small screens retain the initial reading view", mobile.viewport.hidden && !mobile.one("org-list").hidden);
mobile.button("Chart").click();
check("opening Chart on mobile starts with all offices in a fitted complete overview", visibleIds(mobile).length === chartNodes.length && mobile.button("Full map").getAttribute("aria-pressed") === "true" && wholeMapFits(mobile));
mobile.button("Fit branch").click();
check("a narrow chart stacks connected offices inside its canvas at readable scale", parseFloat(mobile.stage.style.width) <= 315 && scaleOf(mobile) >= .85 && !mobile.viewport.hidden);
mobile.button("Full map").click();
check("the narrow full map retains every office in a one-column canvas instead of widening the page", visibleIds(mobile).length === chartNodes.length && parseFloat(mobile.stage.style.width) <= 315 && boxes(mobile).every(b => b.left >= 0 && b.left + 230 <= parseFloat(mobile.stage.style.width)));
mobile.button("List").click();
mobile.one("org-list").children.find(row => row.children[0].textContent.includes("Membership, tags and review states")).children[0].click(0);
mobile.button("Chart").click();
check("classification groups never acquire command arrows when returning to Chart", visibleIds(mobile).length === chartNodes.length && !mobile.node("membership") && mobile.one("org-chart-shell").textContent.includes("Rank and membership groupings have no command arrows"));
mobile.node("council").click(0); mobile.button("Full screen").click(); mobile.flush();
const drawer = mobile.one("org-detail-drawer"), help = mobile.one("org-chart-help");
check("narrow fullscreen starts with the optional mandate and chart guide collapsed", mobile.dialog.open && !drawer.open && !help.open && mobile.dialog.contains(mobile.detail));
check("the collapsed mandate has a native keyboard disclosure naming the selected office", drawer.children[0].tagName === "SUMMARY" && drawer.children[0].textContent === "Office details · High Council");
mobile.node("treasury").click(0); mobile.flush();
check("selecting a fullscreen office opens and focuses its complete mandate", drawer.open && mobile.doc.activeElement === mobile.detail && mobile.detail.textContent.includes("Authority and boundaries") && mobile.detail.textContent.includes("Federal Treasury") && drawer.children[0].textContent.includes("Federal Treasury"));
drawer.open = false; drawer.dispatch("toggle"); mobile.flush();
check("closing the optional mandate keeps the live chart and all reading groups", !drawer.open && !mobile.viewport.hidden && mobile.one("org-list").children.length === data.nodes.length && mobile.node("treasury").getAttribute("aria-pressed") === "true");
const mobileSearch = mobile.doc.getElementById("organization-search"); mobileSearch.value = "Treasury"; mobileSearch.dispatch("input");
check("a fullscreen search exposes its result count and retains full chart guidance", help.open && help.textContent.includes("offices or groups match") && help.textContent.includes("arrow keys") && help.textContent.includes("Escape closes full screen") && help.children[0].tagName === "SUMMARY");
mobile.button("List").click(); mobile.button("Close full screen").click(); mobile.flush();
check("leaving narrow fullscreen restores the inline mandate and visible List focus", drawer.open && help.open && mobile.one("org-chart-location").contains(mobile.one("org-chart-shell")) && mobile.doc.activeElement === mobile.button("List"));
check("text-selection prevention is scoped to the diagram, not the mandate reader", css.includes(".org-viewport,.org-viewport *{-webkit-user-select:none;user-select:none}") && !/\.org-inspector[^}]*user-select/.test(css));
check("narrow fullscreen reserves the workspace for the chart with an optional overlaid mandate", css.includes("height:calc(100dvh - 2rem)") && css.includes("grid-template-rows:minmax(0,1fr);padding-bottom:2.5rem") && css.includes(".org-fullscreen .org-detail-drawer{position:absolute;inset:auto 0 0") && css.includes(".org-fullscreen .org-detail-drawer>summary{display:list-item"));
check("compact fullscreen keeps zoom, branch fit, map and search while hiding only duplicate exit and centering controls", css.includes(".org-fullscreen .org-chart-tools{flex-wrap:nowrap}") && css.includes(".org-fullscreen .org-chart-tools>.org-center-selected,.org-fullscreen .org-chart-tools>button[aria-expanded]{display:none}") && !!mobile.button("Close full screen") && !!mobile.button("Fit branch") && !!mobile.button("Full map"));
check("the organization renderer remains text-only", !/innerHTML|outerHTML|insertAdjacentHTML/.test(source));
console.log(`\n${passed}/${passed + failed} organization view checks passed`);
if (failed) process.exitCode = 1;
