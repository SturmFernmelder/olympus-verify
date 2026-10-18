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
  get clientWidth() { return this.inDialog() ? 1100 : 800; }
  get clientHeight() { return this.inDialog() ? 780 : 600; }
  inDialog() { for (let n = this; n; n = n.parentNode) if (n.tagName === "DIALOG" && n.open) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  showModal() { if (this.failModal) throw new Error("modal refused"); this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
}
function open({ mobile = false } = {}) {
  const doc = new Element("#document"); doc.doc = doc; doc.head = new Element("head", doc); doc.body = new Element("body", doc); doc.append(doc.head, doc.body);
  doc.createElement = t => new Element(t, doc); doc.createElementNS = (_ns, t) => new Element(t, doc);
  doc.getElementById = id => doc.all(n => n.id === id)[0] || null;
  const h = (tag, attrs, ...nodes) => { const el = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); } el.append(...nodes); return el; };
  const main = h("main"); doc.body.append(main); const frames = [];
  const sandbox = { document: doc, requestAnimationFrame: fn => frames.push(fn), matchMedia: () => ({ matches: mobile }), console };
  vm.runInNewContext(source.replace("export function renderOrganization", "function renderOrganization") + ";globalThis.renderOrganization=renderOrganization;", sandbox, { filename: "organization-view.js" });
  sandbox.renderOrganization(main, data, { h, add: (el, nodes) => el.append(nodes), clear: el => el.replaceChildren(), posIcon: () => h("img"), parts: [] });
  const flush = () => { while (frames.length) frames.shift()(); }; flush();
  const one = cls => main.all(n => n.classList.contains(cls))[0];
  const button = text => main.all(n => n.tagName === "BUTTON" && n.textContent === text)[0];
  const node = id => main.all(n => n.getAttribute("data-organization-node") === id)[0];
  const pointer = (target, type, x, y, more = {}) => target.dispatch(type, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, ...more });
  return { main, doc, flush, one, button, node, pointer, viewport: one("org-viewport"), stage: one("org-stage"), detail: one("org-inspector"), dialog: one("org-fullscreen") };
}
const p = open();
check("all non-classification offices retain chart cards", p.main.all(n => !!n.getAttribute("data-organization-node")).length === data.nodes.filter(n => n.relation !== "classification").length);
check("the Council remains initially selected", p.node("council").getAttribute("aria-pressed") === "true");
const council = p.one("org-council-overview"), offices = p.one("org-council-offices");
check("the five authoritative portfolio offices are shown explicitly", JSON.stringify(offices.children.map(n => n.textContent)) === JSON.stringify(["War Head for PvP", "War Head for Raiding", "Federal Treasurer", "Minister of Artisanry", "Minister of Heraldry"]));
check("accepted seats are distinguished from a five-seat cap", council.textContent.includes("require an accepted appointment") && council.textContent.includes("not a five-seat limit"));
check("Justice keeps case designation and conflict review", council.textContent.includes("ordinarily serve the Council of Justice, subject to case designation and conflict review"));
check("support, advisers, native rank and Co-GM do not imply votes or permission", council.textContent.includes("shared support") && council.textContent.includes("not automatically voting councillors") && council.textContent.includes("Co-Guild Master title issues a Council appointment or permission"));
check("the clarification links the existing operational charter", council.all(n => n.tagName === "A").some(n => n.getAttribute("href") === "#/governance/operational-charter-the-work-of-olympus" && n.textContent.includes("O3")));
check("the static model still issues no appointments", data.appointmentsIssued === false);

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
check("all controls and the office inspector remain inside full screen", p.dialog.contains(p.button("Fit chart")) && p.dialog.contains(p.detail) && p.dialog.contains(p.one("org-toolbar")));
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
const mobile = open({ mobile: true });
check("small screens retain the initial reading view", mobile.viewport.hidden && !mobile.one("org-list").hidden);
check("text-selection prevention is scoped to the diagram, not the mandate reader", css.includes(".org-viewport,.org-viewport *{-webkit-user-select:none;user-select:none}") && !/\.org-inspector[^}]*user-select/.test(css));
check("expanded layout fills the viewport and accommodates the inspector on narrow screens", css.includes("height:calc(100dvh - 2rem)") && css.includes(".org-fullscreen .org-inspector{position:static") && css.includes("grid-template-rows:minmax(180px,1fr) minmax(0,.7fr)"));
check("the organization renderer remains text-only", !/innerHTML|outerHTML|insertAdjacentHTML/.test(source));
console.log(`\n${passed}/${passed + failed} organization view checks passed`);
if (failed) process.exitCode = 1;
