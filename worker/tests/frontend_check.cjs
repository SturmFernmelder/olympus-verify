// Build .93 (1 Oct 2026): the page script (public/static/app.js) run for real, against the REAL Worker: a minimal DOM in
// this process, the boot taken from the real "/" page, every fetch answered by index.fetch over the real schema in SQLite
// (Discord's HTTP side stubbed). Covers the shell (navigation by capability, the footer links, the public and identity
// routes), "Your data", the private request form end to end (config, a new case and its receipt, reading, replying), the
// member directory with its profile editor (consent, main, professions, alts, offers; a save through PUT; the listing seen
// by another member; the crafting search), and the standing notices. Run from the worker folder:
// node tests/frontend_check.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript"), vm = require("vm");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

// ---------- a minimal DOM: what app.js uses, nothing more ----------
class Event {
  constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; this.defaultPrevented = false; this.target = null; this.currentTarget = null; this._stop = false; this.returnValue = true; }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
}
class Node {
  constructor() { this.childNodes = []; this.parentNode = null; this.listeners = {}; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  insertBefore(c, ref) { if (!ref) return this.appendChild(c); if (c.parentNode) c.parentNode.removeChild(c); const i = this.childNodes.indexOf(ref); c.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c); return c; }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  replaceWith(n) { if (!this.parentNode) return; this.parentNode.insertBefore(n, this); this.parentNode.removeChild(this); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  dispatchEvent(ev) {
    if (!ev.target) ev.target = this;
    for (let n = this; n; n = n.parentNode) {
      ev.currentTarget = n;
      for (const f of [...(n.listeners[ev.type] || [])]) f.call(n, ev);
      if (!ev.bubbles || ev._stop) break;
    }
    return !ev.defaultPrevented;
  }
}
class Text extends Node {
  constructor(t) { super(); this.data = String(t); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}
const walk = (n, f) => { for (const c of n.childNodes) { f(c); walk(c, f); } };
function parseCompound(s) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m, i = 0;
  while (i < s.length && (m = re.exec(s.slice(i)))) {
    if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.classes.push(m[3]); else out.attrs.push([m[4], m[5] === undefined ? null : m[5]]);
    i += m[0].length; re.lastIndex = 0;
  }
  return out;
}
class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase(); this.attributes = {}; this.style = {}; this._value = ""; this.checked = false; this.selected = false; this.disabled = false; this.hidden = false; this.open = false;
    const el = this;
    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); el.attributes["data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())] = String(v); return true; }, get(t, k) { if (k in t) return t[k]; const a = el.attributes["data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())]; return a === undefined ? undefined : String(a); } }); // data-* attributes, as a browser does (set through the proxy or as an attribute)
  }
  get id() { return this.attributes.id || ""; }
  set id(v) { this.attributes.id = String(v); }
  get className() { return this.attributes.class || ""; }
  set className(v) { this.attributes.class = String(v); }
  get value() { if (this.tagName === "SELECT") { const opts = this.querySelectorAll("option"); const sel = opts.find((o) => o.selected) || opts.find((o) => o._value === this._value); return sel ? sel._value : (opts[0] ? opts[0]._value : ""); } return this._value; }
  set value(v) { this._value = String(v); if (this.tagName === "SELECT") for (const o of this.querySelectorAll("option")) o.selected = o._value === String(v); }
  get classList() {
    const el = this, list = () => el.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { const l = list(); for (const x of c) if (!l.includes(x)) l.push(x); el.className = l.join(" "); },
      remove: (...c) => { el.className = list().filter((x) => !c.includes(x)).join(" "); },
      toggle: (c, force) => { const l = list(); const has = l.includes(c); const on = force === undefined ? !has : !!force; if (on && !has) l.push(c); if (!on && has) l.splice(l.indexOf(c), 1); el.className = l.join(" "); return on; },
      contains: (c) => list().includes(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === "value") this._value = String(v); if (k === "id") this.attributes.id = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(""); }
  set textContent(v) { this.childNodes = []; if (v !== "" && v !== null && v !== undefined) this.appendChild(new Text(v)); }
  matches(sel) {
    return sel.split(",").some((alt) => {
      const parts = (alt.trim().match(/(?:\[[^\]]*\]|[^\s[])+/g) || []).map(parseCompound); // compounds split on spaces outside brackets
      const matchOne = (el, c) => el instanceof Element && (!c.tag || el.tagName === c.tag) && (!c.id || el.id === c.id) && c.classes.every((k) => el.classList.contains(k)) && c.attrs.every(([a, v]) => (v === null ? el.hasAttribute(a) : el.getAttribute(a) === v));
      if (!matchOne(this, parts[parts.length - 1])) return false;
      let anc = this.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) { while (anc && !matchOne(anc, parts[i])) anc = anc.parentNode; if (!anc) return false; anc = anc.parentNode; }
      return true;
    });
  }
  closest(sel) { for (let n = this; n instanceof Element; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; walk(this, (n) => { if (n instanceof Element && n.matches(sel)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  click() {
    const ev = new Event("click", { bubbles: true });
    this.dispatchEvent(ev);
    // as a browser does: a submit button's click submits its form (a button without a type submits too)
    if (!ev.defaultPrevented && !this.disabled && this.tagName === "BUTTON" && (this.getAttribute("type") || "submit") === "submit") {
      const form = this.closest("form");
      if (form) form.dispatchEvent(new Event("submit", { bubbles: true }));
    }
  }
  focus() {} blur() {} select() {} scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
}
function makeWindow(bootJson) {
  const document = new Element("#document");
  const html = document.appendChild(new Element("html"));
  const body = html.appendChild(new Element("body"));
  const bootEl = body.appendChild(new Element("script")); bootEl.setAttribute("id", "boot"); bootEl.textContent = bootJson;
  const app = body.appendChild(new Element("div")); app.setAttribute("id", "app");
  document.body = body;
  document.documentElement = html;
  document.createElement = (t) => new Element(t);
  document.createTextNode = (t) => new Text(t);
  document.getElementById = (id) => html.querySelector(`#${id}`);
  document.fonts = undefined;
  const window = new Node();
  window.scrollY = 0; window.scrollTo = () => {};
  let hash = "";
  const location = {
    get hash() { return hash; },
    set hash(v) { const next = v && !String(v).startsWith("#") ? "#" + v : String(v || ""); if (next === hash) return; hash = next; setTimeout(() => window.dispatchEvent(new Event("hashchange")), 0); },
    get href() { return "https://guild.example/" + hash; },
    set href(v) { location.navigated = v; },
    reload() { location.reloaded = true; },
    navigated: null, reloaded: false,
  };
  const history = { replaceState: (_s, _t, url) => { if (typeof url === "string" && url.startsWith("#")) hash = url; } };
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return { document, window, location, history, sessionStorage, app };
}

// ---------- the real Worker behind fetch (the house harness) ----------
const HOOKS = { afterBatch: null, afterStatement: null }; // .102: a test may act between the Worker's batches of ONE request (the member denied after the write, before the re-read); .106: or between two statements of one batch (the seam between a committed INSERT and the payload read that follows it)
function d1(db) {
  let batches = 0;
  const exec = (sql, params) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
    const r = st.run(...params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql) => {
    let params = [];
    const api = {
      bind: (...p) => { if (p.some((x) => x === undefined)) throw new Error("D1_TYPE_ERROR"); params = p; return api; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => exec(sql, params),
      _exec: () => exec(sql, params),
      _sql: sql,
    };
    return api;
  };
  return { prepare: stmt, batch: async (stmts) => { db.exec("BEGIN"); let out; try { out = stmts.map((s, j) => { const r = s._exec(); HOOKS.afterStatement?.(s._sql, j); return r; }); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } HOOKS.afterBatch?.(++batches, stmts.map((s) => s._sql)); return out; } };
}
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
globalThis.fetch = async (url) => { throw new Error("no network in tests: " + url); };
const stubs = {}, cache = {};
function load(name) {
  const key = name.replace(/^\.\.\//, "./");
  if (stubs[key]) return stubs[key];
  const file = path.join(root, "src", name.replace(/^\.\//, "").replace(/^\.\.\//, "") + ".ts");
  const rel = path.relative(path.join(root, "src"), file).replace(/\\/g, "/");
  if (cache[rel]) return cache[rel].exports;
  const mod = { exports: {} };
  cache[rel] = mod;
  const dir = path.dirname(rel);
  new Function("module", "exports", "require", transpile(file))(mod, mod.exports, (p) => load(dir === "." ? p : p.startsWith("../") ? p.slice(3).replace(/^/, "./") : "./" + dir + "/" + p.replace(/^\.\//, "")));
  return mod.exports;
}
const realDiscord = (() => { const m = { exports: {} }; new Function("module", "exports", "require", transpile(path.join(root, "src", "discord.ts")))(m, m.exports, (p) => load(p)); return m.exports; })();
Object.assign(stubs, {
  "./discord": { ...realDiscord, json: (body, status = 200) => ({ status, body, json: async () => body }), reply: (c) => ({ status: 200, body: { type: 4, data: { content: c } } }), verifyInteraction: async () => true, logLine: async () => {}, postMessage: async () => ({ id: "1" }), staffNotice: async () => {}, addRole: async () => {}, removeRole: async () => {}, guildMember: async () => ({ roles: [] }), setNickname: async () => {}, rest: async () => { throw new Error("no REST in tests"); }, explainDiscordError: (e) => String(e) },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
  "./review": { onVerified: async () => {} },
});
const siteCore = load("./site-core"), indexMod = load("./index");
const MEMBER = "300000000000000003", OTHER = "300000000000000004", DENIED = "300000000000000005", STAFF = "472099715253796864";
const env = (over = {}) => ({ DB: d1(db), COOKIE_SECRET: "cookie-secret-for-tests-only-0123456789", VERIFY_SECRET: "verify-secret-for-tests", WATCHER_TOKEN: "watcher-token-for-tests-only-0123456789", GUILD_ID: "1549537348516188200", DISCORD_APP_ID: "1550176895671341076", DISCORD_CLIENT_SECRET: "client-secret", DISCORD_PUBLIC_KEY: "00", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: "236932545793490944", SITE_ADMINS: STAFF, ROLE_OFFICER: "1549581672272625734", ROLE_GUILD_MEMBER: "1549581282227265566", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROSTER_MIN_MEMBERS: "0", ROSTER_MAX_SHRINK_PCT: "10", CHANNEL_SERVER_LOG: "", CHANNEL_NOTICES: "", CHANNEL_MOD_ALERTS: "", CHANNEL_RECRUITMENT_REVIEW: "", ROLE_MODERATOR: "", ROLE_GUILD_LEADER: "", ROLE_GUILD_MASTER: "", ROLE_RAID_LEADER: "", COMMUNITY_FEATURES: "directory,crafting,privacy_intake,events,attendance,trials,contributions,departures,restrictions", COMMUNITY_ORGANIZERS: OTHER, CONTRIBUTIONS_MODE: "ledger", CONTRIBUTIONS_RETENTION_DAYS: "400", PRIVACY_INTAKE_ENABLED: "true", PRIVACY_INTAKE_MONITORED: "true", PRIVACY_INTAKE_RETENTION_DAYS: "90", ...over });
const ctx = { waitUntil: () => {} };
let ok = 0, n = 0;
const check = (name, cond, ...why) => { n++; if (cond) ok++; else if (why.length) console.log("   ", ...why); console.log((cond ? "PASS " : "FAIL ") + name); };
const now = Math.floor(Date.now() / 1000);
const siteUser = (id, over = {}) => {
  const row = { username: "u" + id.slice(-2), global_name: null, nick: null, in_server: 1, denied: 0, session_version: 1, first_login: now, last_login: now, ...over };
  db.prepare("INSERT INTO site_users (discord_id, username, global_name, nick, first_login, last_login, in_server, denied, session_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, row.username, row.global_name, row.nick, row.first_login, row.last_login, row.in_server, row.denied, row.session_version);
};
const character = (id, name, guid) => {
  db.prepare("INSERT INTO members (discord_id) VALUES (?) ON CONFLICT(discord_id) DO NOTHING").run(id);
  db.prepare("INSERT INTO characters (name_key, name, discord_id, status, bound_at, guid, member_since) VALUES (?, ?, ?, 'member', ?, ?, ?)").run(name.toLowerCase().split("-")[0], name, id, now - 86400, guid, now - 86400);
};
const cookieFor = async (id) => (await siteCore.sessionCookie(env(), id, 1)).split(";")[0];
const one = (sql, ...p) => db.prepare(sql).get(...p);
const settle = () => new Promise((r) => setTimeout(r, 0));
async function waitFor(pred, what, ms = 2000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (pred()) return true; await new Promise((r) => setTimeout(r, 5)); }
  console.log("    timed out waiting for", what);
  return false;
}
const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");
/** The real page: GET / as `who` (or nobody), the boot from its HTML, the script run in a fresh window whose fetch is the real Worker as that person. */
async function openPage(who, over = {}) {
  const cookie = who ? await cookieFor(who) : null;
  const headers = cookie ? { Cookie: cookie } : {};
  const res = await indexMod.default.fetch(new Request("https://guild.example/", { headers }), env(over), ctx);
  const html = await res.text();
  const m = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/);
  const w = makeWindow(m ? m[1] : "{}");
  const sandbox = {
    document: w.document, window: w.window, location: w.location, history: w.history, sessionStorage: w.sessionStorage, navigator: { clipboard: { writeText: async () => {} } },
    Node, Element, Text, Event, Intl, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, Error, TypeError, URL, URLSearchParams, Blob, crypto: globalThis.crypto, btoa, atob, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout, setInterval, clearInterval, console, parseInt, parseFloat, isNaN, isFinite, Symbol,
    __drop: null, // .100: when set, the real answer to a matching request is thrown away after the Worker handled it (a lost answer)
    __delay: null, // .102: when set, a matching request waits this many milliseconds before the Worker sees it (a slow reply)
    __garble: null, // .104: when set, the Worker's answer to a matching request is replaced by an unreadable 200 page
    __answer: null, // .107: when set and it returns a value, the Worker's answer to a matching request is replaced by that value as a 200 JSON body (a readable but wrong receipt)
    __before: null, // .107: when set and true, a matching request fails before the Worker sees it (never sent)
    __hold: null, // .110: when set and it returns a number, the Worker's completed answer to a matching request is held that many ms before the page sees it
    fetch: async (pathname, init = {}) => {
      const ms = sandbox.__delay ? sandbox.__delay(pathname, init) : 0;
      if (ms) await new Promise((r) => setTimeout(r, ms));
      if (sandbox.__before && sandbox.__before(pathname, init)) throw new TypeError("the network dropped the request"); // .107: before the Worker
      const h2 = { Origin: "https://guild.example", ...(init.headers || {}) };
      if (cookie) h2.Cookie = cookie;
      const r = await indexMod.default.fetch(new Request("https://guild.example" + pathname, { method: init.method || "GET", headers: h2, body: init.body }), env(over), ctx);
      if (sandbox.__drop && sandbox.__drop(pathname, init)) throw new TypeError("the network dropped the answer");
      if (sandbox.__garble && sandbox.__garble(pathname, init)) return new Response("<!doctype html><title>an edge page</title>", { status: 200, headers: { "Content-Type": "text/html" } }); // .104: a 2xx the browser cannot read, after the Worker handled it
      { const ms2 = sandbox.__hold ? sandbox.__hold(pathname, init) : 0; if (ms2) await new Promise((res) => setTimeout(res, ms2)); } // .110: the answer is complete; the page sees it later
      if (sandbox.__answer) { const sub = sandbox.__answer(pathname, init); if (sub !== null && sub !== undefined) return new Response(JSON.stringify(sub), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }); } // .107: a readable but wrong 200, after the Worker handled it
      return r;
    },
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(APP_JS, sandbox, { filename: "app.js" });
  await settle();
  return { ...w, boot: m ? JSON.parse(m[1]) : null, html, go: async (hash) => { w.location.hash = hash; await settle(); await settle(); }, drop: (fn) => { sandbox.__drop = fn; }, delay: (fn) => { sandbox.__delay = fn; }, garble: (fn) => { sandbox.__garble = fn; }, answer: (fn) => { sandbox.__answer = fn; }, before: (fn) => { sandbox.__before = fn; }, hold: (fn) => { sandbox.__hold = fn; } };
}
const texts = (root, sel) => root.querySelectorAll(sel).map((e) => e.textContent.trim());
const byText = (root, sel, text) => root.querySelectorAll(sel).find((e) => e.textContent.trim() === text) || null;
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));

(async () => {
  siteUser(MEMBER, { global_name: "Mia" }); character(MEMBER, "Mia One", "Player-1-0001"); siteUser(OTHER, { global_name: "Oz" }); character(OTHER, "Oz Two", "Player-1-0002"); siteUser(DENIED, { global_name: "Dan", denied: 1 }); siteUser(STAFF, { global_name: "Vik" });

  console.log("\n== the shell: signed out ==");
  let page = await openPage(null);
  check("the boot carries the community context (features, no subject)", page.boot && page.boot.community && page.boot.community.subject === null && page.boot.community.features.directory === true && page.boot.community.capabilities.applicantWrite === false);
  check("signed out: Roles only in the top bar, sign-in offered", texts(page.app, "nav.nav a").join(",") === "Roles" && !!byText(page.app, "a", "Sign in with Discord"));
  // .114 (Viktor, 2 Oct 2026): signed out, the footer keeps only the private request form (its people cannot sign in)
  check("signed out, the footer links only the private request form: no policy or data links (.114)", texts(page.app, ".footer-links a").join(",") === "Private request" && !page.app.querySelector('.footer-links a[href="/privacy"]') && !page.app.querySelector('.footer-links a[href="/terms"]') && !page.app.querySelector('.footer-links a[href="#/data"]'));
  check("the footer names the game artwork as Blizzard's and the fonts as their owners' (.92)", page.app.querySelector("footer").textContent.includes("International Typeface Corporation") && page.app.querySelector("footer").textContent.includes("respective owners"));
  await page.go("#/data");
  check("Your data, signed out: the policies linked, sign-in offered for the copy, no download link", !!byText(page.app, "h2", "Your data") && !page.app.querySelector('a[href="/api/me/export"]') && !!byText(page.app, "a", "Sign in with Discord"));
  await page.go("#/request");
  await waitFor(() => !!byText(page.app, "h2", "New case"), "the request form");
  check("the private request page needs no sign-in: the intro, a new-case form (the form is enabled) and the existing-case form", !!byText(page.app, "h2", "Private request") && !!byText(page.app, "h2", "New case") && !!byText(page.app, "h2", "Open an existing case") && !!byText(page.app, "button", "Open the case"));
  check("  the honeypot field is present and empty", !!page.app.querySelector('input[name="website"]') && page.app.querySelector('input[name="website"]').value === "");

  console.log("\n== the private request form, end to end ==");
  const newForm = byText(page.app, "h2", "New case").closest("section");
  newForm.querySelector("select").value = "deletion";
  const details = newForm.querySelector("textarea");
  details.value = "Please delete what you hold about me. I lost my Discord account.";
  fire(details, "input");
  byText(newForm, "button", "Open the case").click();
  await waitFor(() => !!byText(page.app, "h2", "Your case is open"), "the receipt");
  const receipt = byText(page.app, "h2", "Your case is open");
  const values = receipt ? receipt.closest("section").querySelectorAll("code.case-value").map((c) => c.textContent) : ["", ""];
  check("a new case: the receipt shows the number (22) and the code (43) once, with copy buttons and the deadline", !!receipt && values.length === 2 && /^[A-Za-z0-9_-]{22}$/.test(values[0]) && /^[A-Za-z0-9_-]{43}$/.test(values[1]) && !!byText(receipt.closest("section"), "button", "Copy code") && receipt.closest("section").textContent.includes("Kept until"), values, newForm.querySelector(".err") ? newForm.querySelector(".err").textContent : "(no error shown)");
  const stored = one("SELECT case_id, kind, status FROM community_privacy_cases WHERE case_id = ?", values[0] || "-");
  check("  the Worker stored the case (the number plain, the code only as a hash)", !!stored && stored.kind === "deletion" && !one("SELECT 1 FROM community_privacy_cases WHERE code_hash = ?", values[1] || "-"));
  const existing = byText(page.app, "h2", "Open an existing case").closest("section");
  const inputs = existing.querySelectorAll("input");
  inputs[0].value = values[0]; inputs[1].value = values[1];
  byText(existing, "button", "Open the case").click();
  await waitFor(() => !!byText(page.app, "h2", `Case ${values[0]}`), "the conversation");
  const convo = byText(page.app, "h2", `Case ${values[0]}`).closest("section");
  check("reading the case with the number and the code: the status, the deadline, the first message", !!convo && convo.textContent.includes("Received") && convo.textContent.includes("kept until") && convo.querySelectorAll(".message").length === 1 && convo.textContent.includes("I lost my Discord account"));
  const replyBox = convo.querySelector("textarea");
  replyBox.value = "I also used the name Mia Two.";
  fire(replyBox, "input");
  byText(convo, "button", "Send").click();
  await waitFor(() => (byText(page.app, "h2", `Case ${values[0]}`) || { closest: () => ({ querySelectorAll: () => [] }) }).closest("section").querySelectorAll(".message").length === 2, "the reply shown");
  check("  a reply is sent and the conversation re-read: two messages", one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", values[0]).k === 2 && byText(page.app, "h2", `Case ${values[0]}`).closest("section").querySelectorAll(".message").length === 2);
  inputs[1].value = "x".repeat(43);
  byText(existing, "button", "Open the case").click();
  await waitFor(() => existing.querySelector('.err[role="alert"]') && !existing.querySelector('.err[role="alert"]').hidden, "the refusal");
  check("  a wrong code is 'no case with that number and code' (the same answer as a missing case)", existing.querySelector('.err[role="alert"]').textContent.includes("No case with that number and code"));
  const off = await openPage(null, { COMMUNITY_FEATURES: "directory" });
  await off.go("#/request");
  await settle();
  check("with the intake flag off the page says the form is not switched on; the footer drops the link", off.app.textContent.includes("not switched on") && !off.app.querySelector('.footer-links a[href="#/request"]'));
  const paused = await openPage(null, { PRIVACY_INTAKE_ENABLED: "false" });
  await paused.go("#/request");
  await waitFor(() => paused.app.textContent.includes("not being accepted"), "the paused notice");
  check("with new cases paused the existing-case form stays usable", paused.app.textContent.includes("not being accepted") && !!byText(paused.app, "h2", "Open an existing case") && !byText(paused.app, "button", "Open the case").closest("section").textContent.includes("What you ask for"));

  console.log("\n== the shell: a confirmed member, the directory and the profile editor ==");
  page = await openPage(MEMBER);
  check("a confirmed member sees Community in the top bar, and the boot says confirmedGuildData", texts(page.app, "nav.nav a").includes("Community") && page.boot.community.capabilities.confirmedGuildData === true);
  await page.go("#/community");
  await waitFor(() => !!byText(page.app, "h3", "Member directory"), "the overview");
  check("the overview: directory, profile and your-data cards, the member badge", !!byText(page.app, "h3", "Member directory") && !!byText(page.app, "h3", "My profile") && !!byText(page.app, "h3", "Your data") && page.app.textContent.includes("confirmed guild member"));
  await page.go("#/community/directory");
  await waitFor(() => page.app.textContent.includes("Nobody is listed yet"), "the empty directory");
  check("the empty directory says so and invites the member to list themselves", page.app.textContent.includes("Nobody is listed yet"));
  await page.go("#/community/profile");
  await waitFor(() => !!byText(page.app, "button", "Save"), "the profile form");
  let form = byText(page.app, "button", "Save").closest("form");
  check("the profile form: the consent box unticked, the who-sees-this notice, the limits in the labels", !form.querySelector('input[type="checkbox"]').checked && form.textContent.includes("Who sees this") && form.textContent.includes("up to 4") && form.textContent.includes("up to 10") && form.textContent.includes("up to 50"));
  form.querySelector('input[type="checkbox"]').checked = true; fire(form.querySelector('input[type="checkbox"]'), "change");
  const mainInput = form.querySelector('input[placeholder="First Last"]');
  mainInput.value = "Mia One"; fire(mainInput, "input");
  byText(form, "button", "Add a profession").click();
  let row = form.querySelector('.row[data-kind="profession"]');
  row.children[0].value = "alchemy"; row.children[1].value = "300";
  byText(form, "button", "Add an alt").click();
  form.querySelector('.row[data-kind="alt"] input').value = "Mia Three";
  byText(form, "button", "Add an offer").click();
  row = form.querySelector('.row[data-kind="craft"]');
  row.children[0].value = "alchemy"; row.children[1].value = "Flask of the Titans";
  byText(form, "button", "Save").click();
  await waitFor(() => !!one("SELECT 1 FROM community_profiles WHERE discord_id = ? AND listed = 1", MEMBER), "the saved profile");
  const saved = one("SELECT listed, main_name, main_source, raid_role FROM community_profiles WHERE discord_id = ?", MEMBER);
  check("Save goes through PUT /api/community/profile: listed, the main confirmed by the keeper's own binding, the profession, the alt and the offer stored", !!saved && saved.listed === 1 && saved.main_name === "Mia One" && saved.main_source === "keeper" && one("SELECT skill FROM community_professions WHERE discord_id = ?", MEMBER).skill === 300 && one("SELECT name, proof FROM community_alt_claims WHERE discord_id = ?", MEMBER).proof === "self" && one("SELECT recipe_name FROM community_craft_offers WHERE discord_id = ?", MEMBER).recipe_name === "Flask of the Titans", JSON.stringify(saved));
  await waitFor(() => page.app.textContent.includes("listed") && !!byText(page.app, "span", "confirmed"), "the redrawn form");
  check("  the form is redrawn from the saved profile: listed badge, the main marked confirmed", !!byText(page.app, "span", "listed") && !!byText(page.app, "span", "confirmed"));
  const other = await openPage(OTHER);
  await other.go("#/community/directory");
  await waitFor(() => !!byText(other.app, "h3", "Mia"), "the listed member");
  const card = byText(other.app, "h3", "Mia").closest(".card");
  check("another confirmed member sees the listed profile: display name, the main with the confirmed badge, the alt as claimed, the profession with its skill, the offer; never a Discord id", !!card && card.textContent.includes("Mia One") && !!byText(card, "span", "confirmed") && card.textContent.includes("Mia Three") && !!byText(card, "span", "claimed") && card.textContent.includes("Alchemy") && card.textContent.includes("300") && card.textContent.includes("Flask of the Titans") && !other.app.textContent.includes(MEMBER));
  const craft = byText(other.app, "h2", "Crafting offers").closest("section");
  craft.querySelector('input[type="search"]').value = "flask";
  byText(craft, "button", "Search").click();
  await waitFor(() => craft.textContent.includes("offered by Mia"), "the search result");
  check("the crafting search finds the offer by recipe text, naming the crafter by display name", craft.textContent.includes("Flask of the Titans") && craft.textContent.includes("offered by Mia"));

  console.log("\n== slice 2 (.96): the calendar with answers and attendance, the own trial, the own dues ==");
  const apiAs = async (who, method, pathname, body, over = {}) => {
    const headers = { Cookie: await cookieFor(who), Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" };
    const res = await indexMod.default.fetch(new Request("https://guild.example" + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env(over), ctx);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const token22 = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return Buffer.from(a).toString("base64url"); };
  const isoAt = (s) => new Date(s * 1000).toISOString();
  const DAY = 86400;
  let r = await apiAs(OTHER, "POST", "/api/community/events", { opId: token22(), title: "Molten Core", details: "Bring flasks.", startsAt: isoAt(now + 3 * DAY), durationMin: 180, capacity: 40, roleTargets: { tank: 2, healer: 8, damage: 30 } });
  check("(fixture) the organizer schedules an event through the real API", r.status === 200 && !!r.body.event && r.body.event.title === "Molten Core", r.status, JSON.stringify(r.body).slice(0, 200));
  const EVENT = r.body.event.id;
  r = await apiAs(OTHER, "POST", "/api/community/events", { opId: token22(), title: "Raid night", startsAt: isoAt(now + 2 * DAY), durationMin: 120 });
  const PAST = r.body.event.id;
  db.prepare("UPDATE community_events SET starts_at = ?, ends_at = ? WHERE id = ?").run(now - 2 * DAY, now - 2 * DAY + 7200, PAST);
  db.prepare("INSERT INTO community_event_attendance (event_id, discord_id, state, source, reason_code, recorded_by, recorded_at) VALUES (?, ?, 'present', 'officer', 'late', ?, ?)").run(PAST, MEMBER, OTHER, now - DAY);
  r = await apiAs(OTHER, "POST", "/api/community/events", { opId: token22(), title: "Cancelled run", startsAt: isoAt(now + 5 * DAY), durationMin: 60 });
  const GONE = r.body.event.id;
  r = await apiAs(OTHER, "POST", "/api/community/events/cancel", { eventId: GONE, revision: 1 });
  check("(fixture) a second event is cancelled by its organizer", r.status === 200, r.status, JSON.stringify(r.body).slice(0, 160));
  r = await apiAs(STAFF, "POST", "/api/admin/community/trials", { opId: token22(), discordId: MEMBER, reviewDueAt: isoAt(now + 30 * DAY) });
  check("(fixture) a trial for the member", r.status === 200, r.status, JSON.stringify(r.body).slice(0, 160));
  const MONDAY = (() => { const d = new Date((now - 15 * DAY) * 1000); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return Math.floor(d.getTime() / 1000); })();
  r = await apiAs(STAFF, "POST", "/api/admin/community/contributions", { action: "obligation", discordId: MEMBER, periodStart: isoAt(MONDAY) });
  check("(fixture) a due week for the member", r.status === 200 && r.body.result && r.body.result.id, r.status, JSON.stringify(r.body).slice(0, 160));
  const WEEK_ID = r.body.result && r.body.result.id;
  r = await apiAs(STAFF, "POST", "/api/admin/community/contributions", { action: "evidence", periodStart: isoAt(MONDAY), state: "complete" });
  check("(fixture) the officers attest that week's records", r.status === 200, r.status, JSON.stringify(r.body).slice(0, 160));

  const m2 = await openPage(MEMBER);
  await m2.go("#/community");
  await waitFor(() => !!byText(m2.app, "h3", "Calendar"), "the overview with the new cards");
  check("the overview adds Calendar, My trial and My dues cards, and the tabs", !!byText(m2.app, "h3", "Calendar") && !!byText(m2.app, "h3", "My trial") && !!byText(m2.app, "h3", "My dues") && !!byText(m2.app, "a", "My dues"));
  await m2.go("#/community/calendar");
  await waitFor(() => !!byText(m2.app, "a", "Molten Core") && m2.app.textContent.includes("Raid night"), "the calendar and the attendance record");
  const evCard = byText(m2.app, "a", "Molten Core").closest(".card");
  check("the calendar lists the event with its organizer by display name, the places and the wanted roles; the cancelled one is marked; the past one is not in the window", !!evCard && evCard.textContent.includes("Oz") && evCard.textContent.includes("0 yes of 40 places") && evCard.textContent.includes("2 tanks, 8 healers, 30 damage") && !!byText(m2.app, "span", "cancelled") && !byText(evCard.parentNode, "a", "Raid night"), evCard ? evCard.textContent.slice(0, 300) : "no card");
  check("  my attendance record shows the recorded event as present, arrived late", m2.app.textContent.includes("present (arrived late)") && !!byText(m2.app, "h2", "My attendance"));
  await m2.go(`#/community/calendar/${EVENT}`);
  await waitFor(() => !!byText(m2.app, "button", "Answer"), "the event page");
  let rsvp = byText(m2.app, "button", "Answer").closest("form");
  check("the event page: the answer form with status, character and role, and nobody answered yet", rsvp.querySelectorAll("select").length === 2 && !!rsvp.querySelector('input[placeholder="First Last"]') && m2.app.textContent.includes("Nobody has answered yet"));
  rsvp.querySelectorAll("select")[0].value = "yes";
  rsvp.querySelector('input[placeholder="First Last"]').value = "Mia One";
  rsvp.querySelectorAll("select")[1].value = "healer";
  byText(rsvp, "button", "Answer").click();
  await waitFor(() => !!one("SELECT 1 FROM community_event_signups WHERE event_id = ? AND discord_id = ? AND status = 'yes'", EVENT, MEMBER), "the stored answer");
  const signup = one("SELECT status, character_name, raid_role, revision FROM community_event_signups WHERE event_id = ? AND discord_id = ?", EVENT, MEMBER);
  check("Answer goes through PUT /api/community/events/rsvp: yes, the character and the raid role stored", !!signup && signup.status === "yes" && signup.character_name === "Mia One" && signup.raid_role === "healer", JSON.stringify(signup));
  await waitFor(() => !!byText(m2.app, "span", "you: Yes"), "the redrawn event");
  check("  the page redraws from the Worker: the badge, the count, the signups list with the member by display name, character and role", !!byText(m2.app, "span", "you: Yes") && m2.app.textContent.includes("1 yes of 40 places") && !!byText(m2.app, "td", "Mia") && !!byText(m2.app, "td", "Mia One") && m2.app.textContent.includes("Healer"), m2.app.textContent.slice(0, 200));
  db.prepare("UPDATE community_event_signups SET revision = revision + 1 WHERE event_id = ? AND discord_id = ?").run(EVENT, MEMBER);
  rsvp = byText(m2.app, "button", "Change my answer").closest("form");
  rsvp.querySelectorAll("select")[0].value = "tentative";
  byText(rsvp, "button", "Change my answer").click();
  await waitFor(() => m2.app.textContent.includes("out of date"), "the stale refusal");
  check("a change with a stale revision is refused in words and the event redrawn from the Worker's fresh state; the stored answer stands", m2.app.textContent.includes("out of date") && one("SELECT status FROM community_event_signups WHERE event_id = ? AND discord_id = ?", EVENT, MEMBER).status === "yes" && !!byText(m2.app, "span", "you: Yes"));
  await m2.go(`#/community/calendar/${GONE}`);
  await waitFor(() => m2.app.textContent.includes("answers are closed"), "the cancelled event page");
  check("a cancelled event: the badge, answers closed, the form disabled", !!byText(m2.app, "span", "cancelled") && m2.app.textContent.includes("answers are closed") && m2.app.querySelector('button[type="submit"]').disabled === true);
  await m2.go(`#/community/calendar/${"Q".repeat(22)}`);
  await waitFor(() => m2.app.textContent.includes("no such event"), "the missing event page");
  check("an unknown event id says so", m2.app.textContent.includes("no such event"));
  await m2.go("#/community/trial");
  await waitFor(() => !!byText(m2.app, "span", "active"), "the trial page");
  check("the member's own trial: active, the start, the review date, what a trial is", !!byText(m2.app, "span", "active") && m2.app.textContent.includes("Review due") && m2.app.textContent.includes("Nothing on this page changes a role"));
  await m2.go("#/community/dues");
  await waitFor(() => !!byText(m2.app, "button", "Acknowledge"), "the dues page");
  check("the dues page: the due week with its stage and the acknowledge button, the policy in words, the mail reference, no payments yet", m2.app.textContent.includes("due; a notice may be given") && m2.app.textContent.includes("Weekly dues of 1g") && !!m2.app.querySelector("code.case-value") && m2.app.textContent.includes("No payments have been recorded") && m2.app.textContent.includes("records complete"));
  byText(m2.app, "button", "Acknowledge").click();
  await waitFor(() => !!one("SELECT 1 FROM community_contribution_obligations WHERE id = ? AND acknowledged_at IS NOT NULL", WEEK_ID), "the acknowledgement");
  check("Acknowledge goes through POST /api/community/contributions/acknowledge: the dated contact fact and its journal row stored", !!one("SELECT 1 FROM community_contribution_obligations WHERE id = ? AND acknowledged_at IS NOT NULL", WEEK_ID) && !!one("SELECT 1 FROM community_contribution_decisions WHERE obligation_id = ? AND action = 'contact_acknowledged'", WEEK_ID));
  await waitFor(() => m2.app.textContent.includes("acknowledged ") && !byText(m2.app, "button", "Acknowledge"), "the redrawn ledger");
  check("  the row redraws from the returned ledger: acknowledged with its date, the stage acknowledged, no button left", m2.app.textContent.includes("acknowledged ") && !byText(m2.app, "button", "Acknowledge"));
  const noLedger = await openPage(MEMBER, { CONTRIBUTIONS_MODE: "off" });
  await noLedger.go("#/community/dues");
  await waitFor(() => !!byText(noLedger.app, "span", "read-only"), "the ledger off");
  check("with the ledger mode off the dues page is read-only: the badge, the notice, the recorded week still shown, no button (the Worker answers the ledger read-only, not a refusal)", !!byText(noLedger.app, "span", "read-only") && noLedger.app.textContent.includes("acknowledgements are off") && noLedger.app.textContent.includes("acknowledged ") && !byText(noLedger.app, "button", "Acknowledge"), noLedger.app.textContent.slice(0, 300));
  const noCal = await openPage(MEMBER, { COMMUNITY_FEATURES: "directory" });
  await noCal.go("#/community/calendar");
  await settle(); await settle();
  check("with events off: no Calendar card or tab, and the calendar address says it is not switched on", !byText(noCal.app, "a", "Calendar") && noCal.app.textContent.includes("not switched on"));

  console.log("\n== slice 3 (.98): the organizer's event pages and the staff pages ==");
  // the organizer (OTHER, listed in COMMUNITY_ORGANIZERS with a confirmed character)
  const org = await openPage(OTHER);
  await org.go("#/community/calendar");
  await waitFor(() => !!byText(org.app, "a", "Schedule an event"), "the organizer's calendar");
  check("an organizer sees Schedule an event on the calendar", !!byText(org.app, "a", "Schedule an event"));
  await org.go("#/community/calendar/new");
  await waitFor(() => !!byText(org.app, "button", "Schedule"), "the event form");
  let evForm = byText(org.app, "button", "Schedule").closest("form");
  const startLocal = (() => { const d = new Date((now + 4 * DAY) * 1000); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })();
  evForm.querySelector('input[type="text"]').value = "Onyxia";
  evForm.querySelector("textarea").value = "Cloaks on.";
  evForm.querySelector('input[type="datetime-local"]').value = startLocal;
  evForm.querySelectorAll('input[type="number"]')[0].value = "90";
  evForm.querySelectorAll('input[type="number"]')[1].value = "40";
  evForm.querySelector('input[data-role="tank"]').value = "2";
  byText(evForm, "button", "Schedule").click();
  await waitFor(() => !!one("SELECT 1 FROM community_events WHERE title = 'Onyxia'"), "the scheduled event");
  const ony = one("SELECT id, details, duration_min, capacity, role_targets, created_by, revision FROM community_events WHERE title = 'Onyxia'");
  check("Schedule goes through POST /api/community/events: the row with details, duration, capacity, the wanted roles and the organizer as creator", !!ony && ony.details === "Cloaks on." && ony.duration_min === 90 && ony.capacity === 40 && JSON.parse(ony.role_targets).tank === 2 && ony.created_by === OTHER, JSON.stringify(ony));
  await waitFor(() => org.location.hash === `#/community/calendar/${ony.id}` && !!byText(org.app, "a", "Edit"), "the new event's page with organizer links");
  check("  the page moves to the new event, which shows Edit and Attendance to its organizer", !!byText(org.app, "a", "Edit") && !!byText(org.app, "a", "Attendance") && !!byText(org.app, "span", "you organize this"));
  await org.go(`#/community/calendar/${ony.id}/edit`);
  await waitFor(() => !!byText(org.app, "button", "Save changes"), "the edit form");
  evForm = byText(org.app, "button", "Save changes").closest("form");
  evForm.querySelector('input[type="text"]').value = "Onyxia (40)";
  byText(evForm, "button", "Save changes").click();
  await waitFor(() => one("SELECT title FROM community_events WHERE id = ?", ony.id).title === "Onyxia (40)", "the renamed event");
  check("Save changes goes through POST /api/community/events/update with the revision: the title changed, the revision advanced", one("SELECT title, revision FROM community_events WHERE id = ?", ony.id).revision === ony.revision + 1);
  db.prepare("UPDATE community_events SET revision = revision + 1 WHERE id = ?").run(ony.id);
  evForm = byText(org.app, "button", "Save changes").closest("form");
  evForm.querySelector('input[type="text"]').value = "Onyxia (stale)";
  byText(evForm, "button", "Save changes").click();
  await waitFor(() => org.app.textContent.includes("changed since this page loaded") || org.app.textContent.includes("out of date"), "the stale refusal");
  check("  a stale revision is refused in words and the form redrawn from the Worker's fresh event; nothing changed", (org.app.textContent.includes("changed since this page loaded") || org.app.textContent.includes("out of date")) && one("SELECT title FROM community_events WHERE id = ?", ony.id).title === "Onyxia (40)");
  await org.go(`#/community/calendar/${PAST}/attendance`);
  await waitFor(() => !!byText(org.app, "td", "Mia"), "the attendance list");
  let attRow = byText(org.app, "td", "Mia").closest("tr");
  check("the attendance page lists the recorded member with the stored state and note", !!attRow && attRow.textContent.includes("recorded") && !!byText(attRow, "button", "Change") && attRow.querySelectorAll("select").length === 2);
  attRow.querySelectorAll("select")[0].value = "absent";
  byText(attRow, "button", "Change").click();
  await waitFor(() => one("SELECT state FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER).state === "absent", "the changed attendance");
  const att = one("SELECT state, reason_code, revision, recorded_by FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER);
  check("Change goes through POST /api/community/attendance/record with the row's revision: absent, no note, the revision advanced, the organizer as recorder", att.state === "absent" && att.reason_code === null && att.revision === 2 && att.recorded_by === OTHER, JSON.stringify(att));
  await org.go(`#/community/calendar/${EVENT}/attendance`);
  await waitFor(() => org.app.textContent.includes("once the event has started"), "the not-started notice");
  check("attendance for an event that has not started: the notice, the controls disabled", org.app.textContent.includes("once the event has started") && !!org.app.querySelector("tbody select") && org.app.querySelector("tbody select").disabled === true);
  const notOrg = await openPage(MEMBER);
  await notOrg.go("#/community/calendar/new");
  await settle(); await settle();
  check("a member who is not an organizer gets the organizer notice on the scheduling page", notOrg.app.textContent.includes("Only guild organizers"));

  // the staff pages (STAFF is SITE_ADMINS; no character, so a staff member, not an organizer)
  const adm = await openPage(STAFF);
  await adm.go("#/admin/community");
  await waitFor(() => !!byText(adm.app, "h2", "Officer digest"), "the digest page");
  check("Admin → Community: the digest state (off, no channel), the counts with the trial due and the claim waiting", !!byText(adm.app, "span", "switched off") && adm.app.textContent.includes("character claims to review") && !!byText(adm.app, "h2", "Coverage report"));
  byText(adm.app, "button", "Read the coverage report").click();
  await waitFor(() => adm.app.textContent.includes("No roster export yet"), "the coverage answer");
  check("  the coverage report with no export says so (the Worker's unavailableReason), with its limitations", adm.app.textContent.includes("No roster export yet") && adm.app.querySelectorAll("ul li").length >= 4);
  await adm.go("#/admin/community/trials");
  await waitFor(() => !!byText(adm.app, "button", "Extend"), "the trials page");
  const trialRow = byText(adm.app, "button", "Extend").closest("tr");
  check("the trials page lists the member's active trial with its dates", trialRow.textContent.includes("Mia") && trialRow.textContent.includes(MEMBER) && !!byText(trialRow, "span", "active"));
  const dueBefore = one("SELECT review_due_at, revision FROM community_trials WHERE discord_id = ?", MEMBER);
  byText(trialRow, "button", "Extend").click();
  await waitFor(() => one("SELECT review_due_at FROM community_trials WHERE discord_id = ?", MEMBER).review_due_at > dueBefore.review_due_at, "the extended trial");
  const trialAfter = one("SELECT review_due_at, status, revision FROM community_trials WHERE discord_id = ?", MEMBER);
  check("Extend goes through POST /api/admin/community/trials/update with the revision: extended, the review date moved, the revision advanced", trialAfter.status === "extended" && trialAfter.review_due_at > dueBefore.review_due_at && trialAfter.revision === dueBefore.revision + 1, JSON.stringify(trialAfter));
  await waitFor(() => !!byText(adm.app, "span", "extended"), "the redrawn trial list");
  check("  the list redraws with the new status", !!byText(adm.app, "span", "extended"));
  // a departure item, seeded as the intake writes it
  const DEP = "D".repeat(22);
  db.prepare("INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, status, created_at, revision, retain_until) VALUES (?, ?, 'oz two', 'Oz Two', 'oz', 'left', ?, 'open', ?, 1, ?)").run(DEP, OTHER, now - 3600, now - 3000, now + 30 * DAY);
  await adm.go("#/admin/community/departures");
  await waitFor(() => !!byText(adm.app, "button", "Acknowledge"), "the departures page");
  const depRow = byText(adm.app, "button", "Acknowledge").closest("tr");
  check("the departures page lists the open item with the character, what happened and the member", depRow.textContent.includes("Oz Two") && depRow.textContent.includes("left the guild") && !!byText(depRow, "button", "Open a restriction case"));
  byText(depRow, "button", "Acknowledge").click();
  await waitFor(() => one("SELECT status FROM community_departure_reviews WHERE id = ?", DEP).status === "acknowledged", "the acknowledged item");
  check("Acknowledge goes through POST /api/admin/community/departures/update: acknowledged, reviewed by the admin", one("SELECT status, reviewed_by FROM community_departure_reviews WHERE id = ?", DEP).reviewed_by === STAFF);
  byText(adm.app, "button", "Read the return review").click();
  await waitFor(() => adm.app.textContent.includes("Nobody with an active case") || adm.app.textContent.includes("Generated"), "the return review");
  check("  the return review reads (nobody has returned under an active case yet)", adm.app.textContent.includes("Nobody with an active case"));
  await adm.go("#/admin/community/cases");
  await waitFor(() => !!byText(adm.app, "button", "Open a case"), "the cases page");
  let caseForm = byText(adm.app, "button", "Open a case").closest("form");
  caseForm.querySelector('input[type="text"]').value = MEMBER;
  byText(caseForm, "button", "Open a case").click();
  await waitFor(() => !!byText(adm.document.body, "button", "Open the case"), "the confirmation dialog");
  check("  opening a case asks for confirmation first (a dialog naming the member and the category)", byText(adm.document.body, "button", "Open the case").closest("dialog").textContent.includes(MEMBER));
  byText(adm.document.body, "button", "Open the case").click();
  await waitFor(() => !!one("SELECT 1 FROM community_restriction_cases WHERE discord_id = ?", MEMBER), "the opened case");
  const cs = one("SELECT id, category, set_by, review_at, expires_at FROM community_restriction_cases WHERE discord_id = ?", MEMBER);
  check("Open a case goes through POST /api/admin/community/restrictions (action create) after the confirmation: a conduct removal case with the default dates, set by the admin", !!cs && cs.category === "conduct_removal" && cs.set_by === STAFF && cs.review_at > now + 170 * DAY && cs.expires_at > now + 360 * DAY, JSON.stringify(cs));
  await waitFor(() => !!byText(adm.app, "button", "Watch the member's characters"), "the case card");
  byText(adm.app, "button", "Watch the member's characters").click();
  await waitFor(() => !!one("SELECT 1 FROM community_restriction_characters WHERE case_id = ?", cs.id), "the watch-list");
  check("  Watch the member's characters adds the keeper-bound character to the case's watch-list by its proof", one("SELECT character_name, guid FROM community_restriction_characters WHERE case_id = ?", cs.id).character_name === "Mia One");
  await waitFor(() => adm.app.textContent.includes("Mia One (pinned by GUID") , "the redrawn case");
  check("  the card redraws with the watched character pinned by GUID and the Remove button", adm.app.textContent.includes("pinned by GUID") && !!byText(adm.app, "button", "Remove"));
  await adm.go("#/admin/community/ledger");
  await waitFor(() => !!byText(adm.app, "button", "Read the ledger"), "the ledger page");
  adm.app.querySelector('input[placeholder="Discord user ID"]').value = MEMBER;
  byText(adm.app, "button", "Read the ledger").click();
  await waitFor(() => !!byText(adm.app, "button", "Set state"), "the member's ledger");
  check("the staff ledger shows the member's week with its id, the acknowledgement and the actions", adm.app.textContent.includes("acknowledged") && adm.app.textContent.includes(`(#${WEEK_ID})`) && !!byText(adm.app, "button", "Record the payment") && !!byText(adm.app, "span", "ledger open"));
  adm.app.querySelector('input[placeholder="source id"]').value = "mail-ui-1";
  adm.app.querySelector('input[placeholder="copper"]').value = "10000";
  byText(adm.app, "button", "Record the payment").click();
  await waitFor(() => !!one("SELECT 1 FROM community_contribution_receipts WHERE source_id = 'mail-ui-1'"), "the recorded payment");
  const rcpt = one("SELECT amount_copper, matched_discord_id, observer_discord_id, status FROM community_contribution_receipts WHERE source_id = 'mail-ui-1'");
  check("Record the payment goes through the staff action: matched to the member, observed by the admin, 1g", rcpt.amount_copper === 10000 && rcpt.matched_discord_id === MEMBER && rcpt.observer_discord_id === STAFF && rcpt.status === "matched", JSON.stringify(rcpt));
  await waitFor(() => adm.app.textContent.includes("mail-ui-1"), "the redrawn ledger with the payment");
  byText(adm.app, "button", "Allocate credit").click();
  await waitFor(() => !!one("SELECT 1 FROM community_contribution_allocation_events WHERE obligation_id = ? AND amount_copper = 10000", WEEK_ID), "the allocation");
  check("  Allocate credit pays the week from the payment; the ledger redraws paid", !!one("SELECT 1 FROM community_contribution_allocation_events WHERE obligation_id = ? AND amount_copper = 10000", WEEK_ID));
  await waitFor(() => adm.app.textContent.includes("open · paid"), "the paid week");
  check("  the week shows as paid", adm.app.textContent.includes("open · paid"));
  await adm.go("#/admin/community/inbox");
  await waitFor(() => !!byText(adm.app, "button", "Open"), "the inbox");
  check("the private inbox lists the open case from the public form with its kind and the requester's last message", adm.app.textContent.includes("requester wrote last") && adm.app.textContent.includes("deletion"));
  byText(adm.app, "button", "Open").click();
  await waitFor(() => !!byText(adm.app, "button", "Update the case"), "the case detail");
  check("  the case detail shows the conversation and the warning about ownership", adm.app.querySelectorAll(".card.message").length >= 1 && adm.app.textContent.includes("proves nothing about who owns an account"));
  adm.app.querySelectorAll("select").find((sel) => sel.querySelectorAll("option").some((o) => o.value === "in_review")).value = "in_review";
  adm.app.querySelector("textarea").value = "We are looking into it.";
  byText(adm.app, "button", "Update the case").click();
  await waitFor(() => !!one("SELECT 1 FROM community_privacy_messages WHERE author = 'staff' AND text = 'We are looking into it.'"), "the staff reply");
  const pcase = one("SELECT c.status FROM community_privacy_cases c JOIN community_privacy_messages m ON m.case_id = c.case_id WHERE m.text = 'We are looking into it.'");
  check("Update the case goes through POST /api/admin/community/privacy-requests/update: the status in review and the staff reply stored", pcase && pcase.status === "in_review");
  await adm.go("#/admin/community/claims");
  await waitFor(() => !!byText(adm.app, "button", "Confirm"), "the claims page");
  const claimRow = byText(adm.app, "button", "Confirm").closest("tr");
  check("the claims page lists the member's claimed alt", claimRow.textContent.includes("Mia Three") && claimRow.textContent.includes("alt (claimed)"));
  byText(claimRow, "button", "Confirm").click();
  await waitFor(() => one("SELECT status FROM community_alt_claims WHERE name = 'Mia Three'").status === "officer_confirmed", "the confirmed claim");
  check("Confirm goes through POST /api/admin/community/directory/alt: officer_confirmed, reviewed by the admin", one("SELECT status, reviewed_by FROM community_alt_claims WHERE name = 'Mia Three'").reviewed_by === STAFF);
  await waitFor(() => adm.app.textContent.includes("0 claims waiting"), "the redrawn claims");
  check("  the list redraws with nothing waiting", adm.app.textContent.includes("0 claims waiting"));
  const notAdmin = await openPage(MEMBER);
  await notAdmin.go("#/admin/community/ledger");
  await settle(); await settle();
  check("a member who is not a site admin never reaches the admin pages (the home page instead)", !byText(notAdmin.app, "h2", "Community") && !notAdmin.app.textContent.includes("Contribution ledger"));

  console.log("\n== .100: the eight .93 repairs (Codex, 09:23) ==");
  const APP_CSS = fs.readFileSync(path.join(root, "public", "static", "app.css"), "utf8");
  const rq = await openPage(null);
  await rq.go("#/request");
  await waitFor(() => !!byText(rq.app, "h2", "Open an existing case"), "the request page");
  const ex2 = byText(rq.app, "h2", "Open an existing case").closest("section");
  const ins2 = ex2.querySelectorAll("input"); ins2[0].value = values[0]; ins2[1].value = values[1];
  byText(ex2, "button", "Open the case").click();
  await waitFor(() => !!byText(rq.app, "h2", `Case ${values[0]}`), "the conversation");
  let conv = byText(rq.app, "h2", `Case ${values[0]}`).closest("section");
  const msgsBefore = one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", values[0]).k;
  rq.drop((p) => p === "/api/privacy/requests/reply"); // the Worker answers, the browser never sees it
  conv.querySelector("textarea").value = "Did this arrive?"; fire(conv.querySelector("textarea"), "input");
  byText(conv, "button", "Send").click();
  await waitFor(() => !!byText(rq.app, "button", "Retry the same reply"), "the lost-answer notice");
  check("F1: a reply whose answer was lost shows the lost-answer notice (Retry the same reply, Re-read the case); the textarea is locked; the Worker had stored it once", !!byText(rq.app, "button", "Retry the same reply") && conv.querySelector("textarea").disabled === true && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", values[0]).k === msgsBefore + 1);
  rq.drop(null);
  byText(rq.app, "button", "Retry the same reply").click();
  await waitFor(() => ex2.textContent.includes("Your reply to case") && !!byText(rq.app, "h2", `Case ${values[0]}`) && byText(rq.app, "h2", `Case ${values[0]}`).closest("section").querySelectorAll(".message").length === msgsBefore + 1, "the acknowledged, re-read conversation");
  check("  retrying the SAME reply is answered with the original: one message, not two; the textarea cleared; the Sent acknowledgement kept outside the conversation", one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", values[0]).k === msgsBefore + 1 && ex2.textContent.includes("Your reply to case") && byText(rq.app, "h2", `Case ${values[0]}`).closest("section").querySelector("textarea").value === "");
  check("F2: the case_conflict wording is factual: no claim that a new number was made, the check-first path named", APP_JS.includes("A different case already holds this number") && !APP_JS.includes("A new number was made"));
  db.prepare("DELETE FROM community_privacy_messages WHERE case_id = ?").run(values[0]);
  db.prepare("DELETE FROM community_privacy_cases WHERE case_id = ?").run(values[0]);
  byText(ex2, "button", "Open the case").click();
  await waitFor(() => ex2.textContent.includes("no longer available"), "the unavailable notice");
  check("F3: a fresh read that finds nothing clears the old conversation and says the case is no longer available; the Sent acknowledgement stays", ex2.textContent.includes("no longer available") && !byText(rq.app, "h2", `Case ${values[0]}`) && ex2.textContent.includes("Your reply to case"));
  const pf = await openPage(MEMBER);
  await pf.go("#/community/profile");
  await waitFor(() => !!byText(pf.app, "button", "Save"), "the profile form");
  let pform = byText(pf.app, "button", "Save").closest("form");
  check("F8: the profession and offer selects have accessible names, the removals name what they remove", !!pform.querySelector('select[aria-label="Profession"]') && !!pform.querySelector('select[aria-label="Offer profession"]') && !!pform.querySelector('button[aria-label="Remove this profession"]') && !!pform.querySelector('button[aria-label="Remove this alt"]'));
  db.prepare("UPDATE community_profiles SET revision = revision + 1 WHERE discord_id = ?").run(MEMBER);
  pform.querySelectorAll("select")[0].value = "tank";
  byText(pform, "button", "Save").click();
  await waitFor(() => pf.app.textContent.includes("changed elsewhere"), "the stale notice");
  check("F4: a stale revision (409 with the current profile) is explained with the current version; the draft is kept in the form; nothing saved", pf.app.textContent.includes("changed elsewhere") && pform.querySelectorAll("select")[0].value === "tank" && one("SELECT raid_role FROM community_profiles WHERE discord_id = ?", MEMBER).raid_role !== "tank" && !!byText(pf.app, "button", "Reload and discard my draft"));
  byText(pform, "button", "Save").click();
  await waitFor(() => one("SELECT raid_role FROM community_profiles WHERE discord_id = ?", MEMBER).raid_role === "tank", "the deliberate save");
  check("  Save again applies the draft over the current version deliberately", one("SELECT raid_role FROM community_profiles WHERE discord_id = ?", MEMBER).raid_role === "tank");
  db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(MEMBER);
  await pf.go("#/community/directory");
  await waitFor(() => pf.app.textContent.includes("no longer have access"), "the fresh shell");
  check("F5: a 403 re-reads the context once and the shell follows it: the Community tab gone, the page says the access ended", pf.app.textContent.includes("no longer have access") && !texts(pf.app, "nav.nav a").includes("Community"));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(MEMBER);
  check("F6: a crafting continuation is bound to the query that produced it (a changed filter restarts the search)", /cursorFor/.test(APP_JS) && APP_JS.includes("The filters changed; the search starts again"));
  check("F7: the themed field style covers password and date inputs; long headings and case values wrap on narrow screens", APP_CSS.includes('input[type="password"]') && APP_CSS.includes('input[type="date"]') && /\.plaque h2[^}]*overflow-wrap: anywhere/.test(APP_CSS) && /\.case-value[^}]*overflow-wrap: anywhere/.test(APP_CSS));

  console.log("\n== .101: every control of the organizer and staff pages has an accessible name ==");
  // a control is named by an enclosing <label>, a <label for=> pointing at its id (fieldBox), or an aria-label
  const unnamed = (root) => root.querySelectorAll("select, input, textarea").filter((el) => !el.closest("label") && !el.getAttribute("aria-label") && !(el.getAttribute("id") && root.querySelector(`label[for="${el.getAttribute("id")}"]`)) && el.getAttribute("type") !== "hidden" && el.getAttribute("aria-hidden") !== "true").map((el) => `${el.tagName}:${el.getAttribute("placeholder") || el.className || "?"}`);
  const adm3 = await openPage(STAFF);
  const pages = [["#/admin/community/trials", "Extend"], ["#/admin/community/departures", "Read the return review"], ["#/admin/community/cases", "Open a case"], ["#/admin/community/inbox", "Private requests"], ["#/admin/community/claims", "Character claims"]];
  for (const [hash, marker] of pages) {
    await adm3.go(hash);
    await waitFor(() => adm3.app.textContent.includes(marker), hash);
    check(`${hash}: no select, input or textarea without a label or an accessible name`, unnamed(adm3.app).length === 0, JSON.stringify(unnamed(adm3.app)));
  }
  await adm3.go("#/admin/community/ledger");
  await waitFor(() => !!byText(adm3.app, "button", "Read the ledger"), "the ledger page");
  adm3.app.querySelector('input[placeholder="Discord user ID"]').value = MEMBER;
  byText(adm3.app, "button", "Read the ledger").click();
  await waitFor(() => !!byText(adm3.app, "button", "Set state"), "the member's ledger");
  check("#/admin/community/ledger with a member loaded: every per-row control named", unnamed(adm3.app).length === 0, JSON.stringify(unnamed(adm3.app)));
  await org.go(`#/community/calendar/${PAST}/attendance`);
  await waitFor(() => !!byText(org.app, "td", "Mia"), "the attendance list");
  check("the attendance page: the per-row state and note selects named", unnamed(org.app).length === 0, JSON.stringify(unnamed(org.app)));

  console.log("\n== .102: the three .96 repairs (Codex, 10:00) ==");
  const cal = await openPage(MEMBER);
  await cal.go("#/community/calendar");
  await waitFor(() => !!byText(cal.app, "a", "Molten Core"), "the calendar");
  const rangeNow = cal.app.querySelector(".plaque .btn-row span").textContent;
  let slowed = false;
  cal.delay((p) => { if (!slowed && p.startsWith("/api/community/events?from=")) { slowed = true; return 150; } return 0; });
  byText(cal.app, "button", "Earlier").click(); // a slow reply for the earlier window…
  await settle();
  byText(cal.app, "button", "Later").click(); // …then back to the current window before it arrives
  await new Promise((r) => setTimeout(r, 400));
  check("F96-1: a reply for a window the viewer has left is discarded: the current window's rows once each, its range shown, no stale status", cal.app.querySelectorAll("a").filter((a) => a.textContent === "Molten Core").length === 1 && cal.app.querySelector(".plaque .btn-row span").textContent === rangeNow && !cal.app.textContent.includes("Nothing is scheduled in this window"), JSON.stringify(texts(cal.app, ".card h3 a")));
  cal.delay(null);
  const MONDAY2 = MONDAY - 7 * DAY;
  r = await apiAs(STAFF, "POST", "/api/admin/community/contributions", { action: "obligation", discordId: MEMBER, periodStart: isoAt(MONDAY2) });
  const WEEK2_ID = r.body.result && r.body.result.id;
  r = await apiAs(STAFF, "POST", "/api/admin/community/contributions", { action: "evidence", periodStart: isoAt(MONDAY2), state: "complete" });
  check("(fixture) a second due week with complete records for the member", r.status === 200 && !!WEEK2_ID);
  const dues2 = await openPage(MEMBER);
  await dues2.go("#/community/dues");
  await waitFor(() => !!byText(dues2.app, "button", "Acknowledge"), "the dues page with a week to acknowledge");
  HOOKS.afterBatch = (i) => { if (i === 3) { HOOKS.afterBatch = null; db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(MEMBER); } }; // after the write commits, before the Worker's re-read
  byText(dues2.app, "button", "Acknowledge").click();
  const bodyOf2 = () => dues2.document.body;
  await waitFor(() => bodyOf2().textContent.includes("Recorded."), "the durable receipt");
  check("F96-2: the acknowledgement committed and the member denied before the re-read: the Worker answers recorded with the ledger withheld; the page keeps a durable receipt outside the page view", bodyOf2().textContent.includes("Recorded.") && bodyOf2().textContent.includes("could not be re-read") && !!one("SELECT 1 FROM community_contribution_obligations WHERE id = ? AND acknowledged_at IS NOT NULL", WEEK2_ID) && HOOKS.afterBatch === null, bodyOf2().textContent.slice(0, 300));
  await waitFor(() => !byText(dues2.app, "h2", "Weeks"), "the private payload cleared");
  check("  the private weeks and payments are gone (the fresh read was refused and the shell redrawn for the changed context); the receipt bar stays until dismissed", !byText(dues2.app, "h2", "Weeks") && !!bodyOf2().querySelector(".receipt-bar") && !!byText(bodyOf2(), "button", "Dismiss"));
  byText(bodyOf2(), "button", "Dismiss").click();
  check("  Dismiss removes the receipt deliberately", !bodyOf2().querySelector(".receipt-bar"));
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(MEMBER);
  check("F96-3: the stylesheet lets frames, cards and grid children shrink, wraps the plaque controls and bounds tables to their wrapper on narrow screens", /\.frame, \.card, \.stack, \.grid > \*[^{]*\{ min-width: 0; \}/.test(APP_CSS) && APP_CSS.includes(".plaque .btn-row { flex-wrap: wrap; min-width: 0; }") && APP_CSS.includes(".table-wrap { max-width: 100%; }") && /@media \(max-width: 480px\) \{\s*\.plaque \{ flex-direction: column/.test(APP_CSS));

  console.log("\n== .103: the lost-answer rule for every id-keyed operation ==");
  const org2 = await openPage(OTHER);
  await org2.go("#/community/calendar/new");
  await waitFor(() => !!byText(org2.app, "button", "Schedule"), "the event form");
  let f3 = byText(org2.app, "button", "Schedule").closest("form");
  f3.querySelector('input[type="text"]').value = "Blackwing Lair";
  f3.querySelector('input[type="datetime-local"]').value = startLocal;
  org2.drop((p) => p === "/api/community/events");
  byText(f3, "button", "Schedule").click();
  await waitFor(() => !!byText(org2.app, "button", "Retry the same"), "the lost-answer notice");
  check("scheduling an event whose answer was lost: the notice with Retry the same and Check, the form locked, the Worker stored it once", !!byText(org2.app, "button", "Retry the same") && !!byText(org2.app, "button", "Check whether it was stored") && f3.querySelector('input[type="text"]').disabled === true && one("SELECT COUNT(*) AS k FROM community_events WHERE title = 'Blackwing Lair'").k === 1);
  org2.drop(null);
  byText(org2.app, "button", "Retry the same").click();
  await waitFor(() => org2.location.hash.startsWith("#/community/calendar/") && !org2.location.hash.endsWith("/new"), "the event page after the replay");
  const bwl = one("SELECT id FROM community_events WHERE title = 'Blackwing Lair'");
  check("  Retry the same is answered with the original event (one row), and the page moves to it", one("SELECT COUNT(*) AS k FROM community_events WHERE title = 'Blackwing Lair'").k === 1 && org2.location.hash === `#/community/calendar/${bwl.id}`);
  // a private case for the inbox (the slice-1 case is gone), sent as nobody through the real form route
  const pc = { caseId: token22(), caseCode: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url") };
  r = await (async () => { const res = await indexMod.default.fetch(new Request("https://guild.example/api/privacy/requests", { method: "POST", headers: { Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ caseId: pc.caseId, caseCode: pc.caseCode, kind: "access", details: "What do you hold about me?", website: "" }) }), env(), ctx); return { status: res.status, body: await res.json().catch(() => ({})) }; })();
  check("(fixture) a new private case through the public route", r.status === 200 || r.status === 201, r.status, JSON.stringify(r.body).slice(0, 120));
  const adm4 = await openPage(STAFF);
  await adm4.go("#/admin/community/inbox");
  await waitFor(() => !!byText(adm4.app, "button", "Open"), "the inbox");
  byText(adm4.app, "button", "Open").click();
  await waitFor(() => !!byText(adm4.app, "button", "Update the case"), "the case detail");
  adm4.app.querySelectorAll("select").find((sel) => sel.querySelectorAll("option").some((o) => o.value === "in_review")).value = "in_review";
  adm4.app.querySelector("textarea").value = "Received; we are checking.";
  adm4.drop((p) => p === "/api/admin/community/privacy-requests/update");
  byText(adm4.app, "button", "Update the case").click();
  await waitFor(() => !!byText(adm4.app, "button", "Retry the same"), "the lost-answer notice");
  check("updating a private case whose answer was lost: the notice (retry only: a status-only update leaves nothing to check for), the controls locked, the Worker applied it once", !!byText(adm4.app, "button", "Retry the same") && !byText(adm4.app, "button", "Check whether it was stored") && adm4.app.querySelector("textarea").disabled === true && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ? AND author = 'staff'", pc.caseId).k === 1);
  adm4.drop(null);
  byText(adm4.app, "button", "Retry the same").click();
  await waitFor(() => !byText(adm4.app, "button", "Retry the same") && !!byText(adm4.app, "button", "Update the case"), "the case redrawn");
  check("  Retry the same is answered with the original result: one staff message, the status in review", one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ? AND author = 'staff'", pc.caseId).k === 1 && one("SELECT status FROM community_privacy_cases WHERE case_id = ?", pc.caseId).status === "in_review");

  console.log("\n== .104: the three .100 repairs (Codex, 10:37) ==");
  const rq3 = await openPage(null);
  await rq3.go("#/request");
  await waitFor(() => !!byText(rq3.app, "h2", "Open an existing case"), "the request page");
  const ex3 = byText(rq3.app, "h2", "Open an existing case").closest("section");
  const openPc = async () => { const ins = ex3.querySelectorAll("input"); ins[0].value = pc.caseId; ins[1].value = pc.caseCode; byText(ex3, "button", "Open the case").click(); await waitFor(() => !!byText(rq3.app, "h2", `Case ${pc.caseId}`) && !!byText(rq3.app, "h2", `Case ${pc.caseId}`).closest("section").querySelector("textarea"), "the conversation"); return byText(rq3.app, "h2", `Case ${pc.caseId}`).closest("section"); };
  let conv3 = await openPc();
  const before3 = one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", pc.caseId).k;
  rq3.garble((p) => p === "/api/privacy/requests/reply"); // the Worker stores the reply and answers 201; the browser receives an unreadable page
  conv3.querySelector("textarea").value = "Garbled answer?"; fire(conv3.querySelector("textarea"), "input");
  byText(conv3, "button", "Send").click();
  await waitFor(() => !!byText(rq3.app, "button", "Retry the same reply"), "the lost-answer notice");
  check("F100-1: a successful reply whose answer is unreadable is an UNKNOWN outcome: the notice, the text kept and locked, no clearing, the Worker stored it once", !!byText(rq3.app, "button", "Retry the same reply") && conv3.querySelector("textarea").value === "Garbled answer?" && conv3.querySelector("textarea").disabled === true && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", pc.caseId).k === before3 + 1 && !ex3.textContent.includes("Your reply to case"));
  rq3.garble(null);
  // F100-2: the ordinary Open the case for the SAME case keeps the waiting reply as the same locked operation
  byText(ex3, "button", "Open the case").click();
  await waitFor(() => !!byText(rq3.app, "h2", `Case ${pc.caseId}`) && !!byText(rq3.app, "button", "Discard the draft") && byText(rq3.app, "h2", `Case ${pc.caseId}`).closest("section").querySelectorAll(".message").length === before3 + 1, "the re-read conversation with the waiting reply");
  conv3 = byText(rq3.app, "h2", `Case ${pc.caseId}`).closest("section");
  check("F100-2: an ordinary re-read of the same case restores the waiting reply (its text, locked) and, since the messages now show it, says so and offers Discard rather than resend", conv3.querySelector("textarea").value === "Garbled answer?" && conv3.querySelector("textarea").disabled === true && conv3.textContent.includes("already show this reply") && !!byText(conv3, "button", "Discard the draft") && !byText(conv3, "button", "Retry the same reply") && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", pc.caseId).k === before3 + 1, conv3.textContent.slice(0, 200));
  const ins3 = ex3.querySelectorAll("input"); ins3[0].value = "Q".repeat(22); ins3[1].value = "x".repeat(43);
  byText(ex3, "button", "Open the case").click();
  await waitFor(() => ex3.textContent.includes("stays with that case"), "the held notice for another case");
  check("  opening ANOTHER case names the waiting reply as kept for its own case and never carries it over (the other number is not found)", ex3.textContent.includes("stays with that case") && ex3.textContent.includes(pc.caseId) && ex3.querySelector('.err[role="alert"]').textContent.includes("No case with that number") && !byText(rq3.app, "h2", `Case ${"Q".repeat(22)}`));
  conv3 = await openPc();
  check("  back in its own case the waiting reply is still there, locked, with Discard", conv3.querySelector("textarea").value === "Garbled answer?" && !!byText(conv3, "button", "Discard the draft"));
  byText(conv3, "button", "Discard the draft").click();
  check("  Discard clears it deliberately; the one stored message stays", conv3.querySelector("textarea").value === "" && conv3.querySelector("textarea").disabled === false && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", pc.caseId).k === before3 + 1);
  // F100-3: a late crafting reply under a new query
  const cr = await openPage(MEMBER);
  await cr.go("#/community/directory");
  await waitFor(() => !!byText(cr.app, "h2", "Crafting offers"), "the crafting panel");
  const craft3 = byText(cr.app, "h2", "Crafting offers").closest("section");
  let slow3 = false;
  cr.delay((p) => { if (!slow3 && p.includes("/api/community/crafting?q=flask")) { slow3 = true; return 150; } return 0; });
  craft3.querySelector('input[type="search"]').value = "flask";
  byText(craft3, "button", "Search").click();
  await settle();
  craft3.querySelector('input[type="search"]').value = "zzzz";
  byText(craft3, "button", "Search").click();
  await new Promise((r) => setTimeout(r, 400));
  check("F100-3: a reply to a superseded crafting search is discarded: no card from the old query under the new one, the new status shown", craft3.querySelectorAll(".card.craft").length === 0 && craft3.textContent.includes("No offer matches"), JSON.stringify(texts(craft3, ".card.craft h3")));
  cr.delay(null);

  console.log("\n== .105: two inherited wordings (Codex, 10:48) ==");
  check("the application consent names the display name and the game's class icon as the picture, never the Discord picture", APP_JS.includes("Discord display name with the game's class icon as its picture") && APP_JS.includes("never your Discord picture") && !APP_JS.includes("They see your Discord name and picture"));
  check("the admin CSV text names the six core record families and says what is not in them", APP_JS.includes("six core record families: applications, board votes, write-ins, friends, reserved names and accounts") && !APP_JS.includes("Spreadsheet files (CSV) of everything the site holds"));

  console.log("\n== .106: Codex's five .98 repair items (11:26) ==");
  // (1) a committed attendance write whose target may no longer be shown: the Worker's own seam (the INSERT commits, the
  // payload read that follows it in the same batch no longer finds the member) answers ok / entry null / withheld
  const org6 = await openPage(OTHER);
  await org6.go(`#/community/calendar/${PAST}/attendance`);
  await waitFor(() => !!byText(org6.app, "td", "Mia"), "the attendance list");
  let attRow6 = byText(org6.app, "td", "Mia").closest("tr");
  const stateSel6 = attRow6.querySelectorAll("select")[0];
  check("(3) the attendance select: the blank choice reads 'not recorded', the explicit state 'unknown' reads 'unknown' (two different labels)", stateSel6.querySelectorAll("option").some((o) => o._value === "" && o.textContent === "not recorded") && stateSel6.querySelectorAll("option").some((o) => o._value === "unknown" && o.textContent === "unknown") && APP_JS.includes('unknown: "unknown" }'));
  const revBefore6 = one("SELECT revision FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER).revision;
  HOOKS.afterStatement = (sql) => { if (/INSERT INTO community_event_attendance/.test(sql)) { HOOKS.afterStatement = null; db.prepare("UPDATE site_users SET denied = 1 WHERE discord_id = ?").run(MEMBER); } }; // after the organizer's own INSERT, before the payload read
  stateSel6.value = "excused";
  byText(attRow6, "button", "Change").click();
  await waitFor(() => !!org6.document.body.querySelector(".receipt-bar"), "the receipt of the withheld write");
  const att6 = one("SELECT state, revision FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER);
  const bar6 = org6.document.body.querySelector(".receipt-bar");
  check("(1) the write committed (excused, the revision advanced) and the Worker withheld the target: the member's row (name, answer, state) is gone from the page", att6.state === "excused" && att6.revision === revBefore6 + 1 && HOOKS.afterStatement === null && !byText(org6.app, "td", "Mia") && !org6.app.querySelector("tbody tr"), org6.app.textContent.slice(0, 200));
  check("  the organizer keeps a receipt of their own write outside the list, without the member's name, and the empty list says why", !!bar6 && bar6.textContent.includes("Recorded.") && bar6.textContent.includes("no longer qualifies") && !bar6.textContent.includes("Mia") && org6.app.textContent.includes("No member who can be shown"), bar6 && bar6.textContent.slice(0, 200));
  byText(org6.document.body, "button", "Dismiss").click();
  db.prepare("UPDATE site_users SET denied = 0 WHERE discord_id = ?").run(MEMBER);

  // (4) the organizer's stale edit reads as an organizer's refusal, never as RSVP guidance
  await org6.go(`#/community/calendar/${ony.id}/edit`);
  await waitFor(() => !!byText(org6.app, "button", "Save changes"), "the edit form");
  db.prepare("UPDATE community_events SET revision = revision + 1 WHERE id = ?").run(ony.id);
  let evForm6 = byText(org6.app, "button", "Save changes").closest("form");
  evForm6.querySelector('input[type="text"]').value = "Onyxia (stale again)";
  byText(evForm6, "button", "Save changes").click();
  await waitFor(() => org6.app.textContent.includes("changed since this page loaded"), "the stale refusal");
  check("(4) a stale edit is explained in the organizer's words (another organizer edited or cancelled it; apply the change again) and not with the member's 'answer again'", org6.app.textContent.includes("another organizer edited or cancelled it") && org6.app.textContent.includes("apply your change again") && !org6.app.textContent.includes("answer again") && one("SELECT title FROM community_events WHERE id = ?", ony.id).title !== "Onyxia (stale again)");

  // (5) a late reply to a trial filter the staff member has left writes no row
  const adm6 = await openPage(STAFF);
  await adm6.go("#/admin/community/trials");
  await waitFor(() => !!byText(adm6.app, "button", "Extend"), "the trials page");
  const filter6 = adm6.app.querySelectorAll("select").find((sel) => sel.querySelectorAll("option").some((o) => o._value === "extended"));
  let slow6 = false;
  adm6.delay((p) => { if (!slow6 && p.includes("/api/admin/community/trials?status=extended")) { slow6 = true; return 150; } return 0; });
  filter6.value = "extended"; fire(filter6, "change"); // the slow filter (Mia's trial is extended)…
  await settle();
  filter6.value = "passed"; fire(filter6, "change"); // …then another before it answers (nothing is passed)
  await new Promise((r) => setTimeout(r, 400));
  check("(5) the trials list discards the late reply of a filter that was left: no row from it, the current filter's empty status, Show more hidden", !adm6.app.querySelector("tbody tr") && adm6.app.textContent.includes("No trial matches.") && byText(adm6.app, "button", "Show more").hidden === true, adm6.app.querySelectorAll("tbody tr").length);
  adm6.delay(null);
  check("  the same guard is on every staff list loader (trials, departures, cases, claims): four generation checks", (APP_JS.slice(APP_JS.indexOf("async function adminTrials")).match(/if \(gen !== generation\) return;/g) || []).length >= 8);

  // (2) a committed staff ledger write whose re-read was refused keeps a durable, dismissible receipt outside the cleared view
  await adm6.go("#/admin/community/ledger");
  await waitFor(() => !!byText(adm6.app, "button", "Read the ledger"), "the ledger page");
  adm6.app.querySelector('input[placeholder="Discord user ID"]').value = MEMBER;
  byText(adm6.app, "button", "Read the ledger").click();
  await waitFor(() => !!byText(adm6.app, "button", "Set state"), "the member's ledger");
  adm6.app.querySelector('input[placeholder="source id"]').value = "mail-ui-6";
  adm6.app.querySelector('input[placeholder="copper"]').value = "5000";
  HOOKS.afterBatch = (i, sqls) => { if (sqls.some((q) => /INSERT INTO community_contribution_receipts/.test(q))) { HOOKS.afterBatch = null; db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(STAFF); } }; // the write commits; the staff reader's session no longer admits the re-read
  byText(adm6.app, "button", "Record the payment").click();
  await waitFor(() => !!adm6.document.body.querySelector(".receipt-bar"), "the durable staff receipt");
  const bar6b = adm6.document.body.querySelector(".receipt-bar");
  const rcpt6 = one("SELECT amount_copper, matched_discord_id FROM community_contribution_receipts WHERE source_id = 'mail-ui-6'");
  check("(2) the payment committed (5000c to the member) and the re-read was refused: a durable receipt outside the view names the recorded action and why the ledger is not shown, with Dismiss and no undo", !!rcpt6 && rcpt6.amount_copper === 5000 && rcpt6.matched_discord_id === MEMBER && HOOKS.afterBatch === null && !!bar6b && bar6b.textContent.includes("Payment recorded.") && bar6b.textContent.includes("could not be re-read") && !!byText(bar6b, "button", "Dismiss") && !byText(bar6b, "button", "Undo"), bar6b && bar6b.textContent.slice(0, 240));
  await waitFor(() => !byText(adm6.app, "button", "Set state"), "the protected ledger cleared");
  check("  the protected weeks and payments are cleared from the view (the fresh read is refused), the receipt stays until dismissed", !byText(adm6.app, "button", "Set state") && !adm6.app.textContent.includes("mail-ui-6") && !!adm6.document.body.querySelector(".receipt-bar"));
  byText(bar6b, "button", "Dismiss").click();
  check("  Dismiss removes it deliberately", !adm6.document.body.querySelector(".receipt-bar"));
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(STAFF);

  console.log("\n== .107: Codex's five .104 groups (11:32) ==");
  const newCase = async (details) => { const c = { caseId: token22(), caseCode: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url") }; const res = await indexMod.default.fetch(new Request("https://guild.example/api/privacy/requests", { method: "POST", headers: { Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ caseId: c.caseId, caseCode: c.caseCode, kind: "access", details, website: "" }) }), env(), ctx); c.status = res.status; return c; };
  const caseA = await newCase("Case A for the .107 checks."), caseB = await newCase("Case B for the .107 checks.");
  check("(fixture) two private cases through the public route", (caseA.status === 200 || caseA.status === 201) && (caseB.status === 200 || caseB.status === 201));
  const rq7 = await openPage(null);
  await rq7.go("#/request");
  await waitFor(() => !!byText(rq7.app, "h2", "Open an existing case"), "the request page");
  const ex7 = byText(rq7.app, "h2", "Open an existing case").closest("section");
  const openCase7 = async (c) => { const ins = ex7.querySelectorAll("input"); ins[0].value = c.caseId; ins[1].value = c.caseCode; byText(ex7, "button", "Open the case").click(); await waitFor(() => !!byText(rq7.app, "h2", `Case ${c.caseId}`) && !!byText(rq7.app, "h2", `Case ${c.caseId}`).closest("section").querySelector("textarea"), `case ${c.caseId.slice(0, 4)}`); return byText(rq7.app, "h2", `Case ${c.caseId}`).closest("section"); };
  const msgs = (c) => one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ?", c.caseId).k;
  // group 2: a reply with the SAME words as an older stored message, lost before the Worker saw it: not "arrived"
  let convA = await openCase7(caseA);
  convA.querySelector("textarea").value = "Same words."; fire(convA.querySelector("textarea"), "input");
  byText(convA, "button", "Send").click();
  await waitFor(() => msgs(caseA) === 2 && !!byText(rq7.app, "h2", `Case ${caseA.caseId}`) && byText(rq7.app, "h2", `Case ${caseA.caseId}`).closest("section").querySelectorAll(".message").length === 2, "the first reply stored and re-read");
  convA = byText(rq7.app, "h2", `Case ${caseA.caseId}`).closest("section");
  rq7.before((p) => p === "/api/privacy/requests/reply"); // the second, identical reply never reaches the Worker
  convA.querySelector("textarea").value = "Same words."; fire(convA.querySelector("textarea"), "input");
  byText(convA, "button", "Send").click();
  await waitFor(() => convA.textContent.includes("The answer was lost."), "the lost-answer notice");
  check("(2) a lost reply whose words equal an older stored message is NOT taken as arrived: the notice offers Retry the same reply (the stored list is matched by this reply's id, not by its text); nothing stored", !!byText(convA, "button", "Retry the same reply") && convA.textContent.includes("may have been stored") && !convA.textContent.includes("already show this reply") && msgs(caseA) === 2);
  rq7.before(null);
  byText(convA, "button", "Retry the same reply").click();
  await waitFor(() => msgs(caseA) === 3, "the retried reply stored");
  check("  Retry the same reply sends it: three messages, two with the same words", msgs(caseA) === 3);
  await waitFor(() => !!byText(rq7.app, "h2", `Case ${caseA.caseId}`) && byText(rq7.app, "h2", `Case ${caseA.caseId}`).closest("section").querySelectorAll(".message").length === 3, "the re-read conversation");
  // group 3: a reply to A waits for a lost answer; a write to B is refused, and A's waiting reply is not cleared by anything B does
  convA = byText(rq7.app, "h2", `Case ${caseA.caseId}`).closest("section");
  rq7.drop((p) => p === "/api/privacy/requests/reply");
  convA.querySelector("textarea").value = "Lost in A."; fire(convA.querySelector("textarea"), "input");
  byText(convA, "button", "Send").click();
  await waitFor(() => !!byText(convA, "button", "Re-read the case"), "A's lost-answer notice");
  rq7.drop(null);
  check("(fixture) A's reply waits for a lost answer (the Worker stored it once)", !!byText(convA, "button", "Re-read the case") && msgs(caseA) === 4);
  // group 4: A's slow re-read against a newer read of B: the inputs name B, B's thread must stay
  rq7.delay((p, init) => (p === "/api/privacy/requests/read" && typeof init.body === "string" && init.body.includes(caseA.caseId) ? 200 : 0));
  byText(convA, "button", "Re-read the case").click(); // A, slow
  await settle();
  const ins7 = ex7.querySelectorAll("input"); ins7[0].value = caseB.caseId; ins7[1].value = caseB.caseCode;
  fire(ex7.querySelector("form"), "submit"); // B, fast (Enter in the field submits while the button is disabled)
  await waitFor(() => !!byText(rq7.app, "h2", `Case ${caseB.caseId}`), "B's thread");
  await new Promise((r) => setTimeout(r, 450));
  check("(4) the late answer to A's re-read is discarded: the thread shows case B (the case the inputs name), not A; Open the case enabled again", !!byText(rq7.app, "h2", `Case ${caseB.caseId}`) && !byText(rq7.app, "h2", `Case ${caseA.caseId}`) && byText(ex7, "button", "Open the case").disabled === false);
  rq7.delay(null);
  let convB = byText(rq7.app, "h2", `Case ${caseB.caseId}`).closest("section");
  check("  A's waiting reply is named as held for its own case while B is open", ex7.textContent.includes("stays with that case") && ex7.textContent.includes(caseA.caseId));
  convB.querySelector("textarea").value = "Hello from B."; fire(convB.querySelector("textarea"), "input");
  byText(convB, "button", "Send").click();
  await settle(); await settle();
  check("(3) a write to B while A's reply waits is refused in words, nothing is sent to B, and A's waiting reply is still held (not cleared by B)", convB.textContent.includes("still waiting for a lost answer") && msgs(caseB) === 1 && ex7.textContent.includes("stays with that case") && ex7.textContent.includes(caseA.caseId) && convB.querySelector("textarea").disabled === false);
  byText(ex7, "button", "Discard that reply").click();
  byText(convB, "button", "Send").click();
  await waitFor(() => msgs(caseB) === 2, "B's reply stored after the discard");
  check("  after Discard that reply, B's reply is sent; nothing was ever added to A by it", msgs(caseB) === 2 && msgs(caseA) === 4 && !ex7.textContent.includes("stays with that case"));
  // group 1a: the requester's stored-check with a wrong readable answer manufactures no receipt
  const nc7 = byText(rq7.app, "h2", "New case").closest("section");
  nc7.querySelector("select").value = "access";
  nc7.querySelector("textarea").value = "Check me before you trust me."; fire(nc7.querySelector("textarea"), "input");
  rq7.drop((p) => p === "/api/privacy/requests");
  byText(nc7, "button", "Open the case").click();
  await waitFor(() => !!byText(nc7, "button", "Check whether it was stored"), "the new case's lost-answer notice");
  rq7.drop(null);
  rq7.answer((p) => (p === "/api/privacy/requests/read" ? {} : null)); // a readable 200 that is not this case
  byText(nc7, "button", "Check whether it was stored").click();
  await new Promise((r) => setTimeout(r, 150));
  check("(1) the stored-check answered with an empty object makes no receipt: the notice stays with Retry and Check, the request frozen", !byText(rq7.app, "h2", "Your case is open") && !!byText(nc7, "button", "Retry the same request") && !!byText(nc7, "button", "Check whether it was stored") && nc7.querySelector("textarea").disabled === true && !!one("SELECT 1 FROM community_privacy_messages WHERE text = 'Check me before you trust me.'"));
  rq7.answer((p) => (p === "/api/privacy/requests/read" ? { caseId: "Q".repeat(22), status: "received", createdAt: new Date().toISOString(), retentionDeadline: new Date().toISOString(), messages: [] } : null)); // another case's shape
  byText(nc7, "button", "Check whether it was stored").click();
  await new Promise((r) => setTimeout(r, 150));
  check("  a well-formed read of ANOTHER case number makes no receipt either", !byText(rq7.app, "h2", "Your case is open") && !!byText(nc7, "button", "Check whether it was stored"));
  rq7.answer(null);
  byText(nc7, "button", "Check whether it was stored").click();
  await waitFor(() => !!byText(rq7.app, "h2", "Your case is open"), "the receipt from the real read");
  check("  the real read makes the receipt, with the stored case's number", !!byText(rq7.app, "h2", "Your case is open") && byText(rq7.app, "h2", "Your case is open").closest("section").textContent.includes(one("SELECT case_id FROM community_privacy_messages WHERE text = 'Check me before you trust me.'").case_id));
  // group 1b: the keyed staff creates: an empty object or an array is no receipt; the frozen operation and Retry stay
  const adm7 = await openPage(STAFF);
  await adm7.go("#/admin/community/trials");
  await waitFor(() => !!byText(adm7.app, "button", "Open a trial"), "the trials page");
  adm7.app.querySelector('input[placeholder="Discord user ID"]').value = OTHER;
  adm7.drop((p) => p === "/api/admin/community/trials");
  byText(adm7.app, "button", "Open a trial").click();
  await waitFor(() => !!byText(adm7.app, "button", "Retry the same"), "the trial's lost-answer notice");
  adm7.drop(null);
  adm7.answer((p, init) => (p === "/api/admin/community/trials" && init.method === "POST" ? {} : null));
  byText(adm7.app, "button", "Retry the same").click();
  await new Promise((r) => setTimeout(r, 150));
  check("(1) a trial creation retried into an empty-object 200: no success, the notice and Retry stay, the form stays locked (the Worker holds the one trial)", !!byText(adm7.app, "button", "Retry the same") && adm7.app.querySelector('input[placeholder="Discord user ID"]').disabled === true && one("SELECT COUNT(*) AS k FROM community_trials WHERE discord_id = ?", OTHER).k === 1);
  adm7.answer((p, init) => (p === "/api/admin/community/trials" && init.method === "POST" ? [] : null));
  byText(adm7.app, "button", "Retry the same").click();
  await new Promise((r) => setTimeout(r, 150));
  check("  an array 200 is no receipt either", !!byText(adm7.app, "button", "Retry the same"));
  adm7.answer(null);
  byText(adm7.app, "button", "Retry the same").click();
  await waitFor(() => !byText(adm7.app, "button", "Retry the same") && adm7.app.textContent.includes("Oz"), "the real replay");
  check("  the real retry is answered with the original trial (one row) and the form unlocks", one("SELECT COUNT(*) AS k FROM community_trials WHERE discord_id = ?", OTHER).k === 1 && adm7.app.querySelector('input[placeholder="Discord user ID"]').disabled === false);
  await adm7.go("#/admin/community/cases");
  await waitFor(() => !!byText(adm7.app, "button", "Open a case"), "the cases page");
  const caseForm7 = byText(adm7.app, "button", "Open a case").closest("form");
  caseForm7.querySelector('input[type="text"]').value = DENIED;
  adm7.drop((p, init) => p === "/api/admin/community/restrictions" && init.method === "POST");
  byText(caseForm7, "button", "Open a case").click();
  await waitFor(() => !!byText(adm7.document.body, "button", "Open the case"), "the confirmation dialog");
  byText(adm7.document.body, "button", "Open the case").click();
  await waitFor(() => !!byText(adm7.app, "button", "Retry the same"), "the case's lost-answer notice");
  adm7.drop(null);
  adm7.answer((p, init) => (p === "/api/admin/community/restrictions" && init.method === "POST" ? [] : null));
  byText(adm7.app, "button", "Retry the same").click();
  await new Promise((r) => setTimeout(r, 150));
  check("(1) a restriction case retried into an array 200: no success, the notice and Retry stay (the Worker holds the one case)", !!byText(adm7.app, "button", "Retry the same") && one("SELECT COUNT(*) AS k FROM community_restriction_cases WHERE discord_id = ?", DENIED).k === 1);
  adm7.answer(null);
  byText(adm7.app, "button", "Retry the same").click();
  await waitFor(() => !byText(adm7.app, "button", "Retry the same"), "the real replay");
  check("  the real retry is answered with the original case (one row)", one("SELECT COUNT(*) AS k FROM community_restriction_cases WHERE discord_id = ?", DENIED).k === 1);
  check("  the event creation and the staff case update validate their identity too (the event's id is the form's operation; the status applied is the one asked for)", APP_JS.includes("out.event.id !== payload.opId") && APP_JS.includes("out.status !== payload.status"));
  // group 5: the crafting generation advances before the empty-query return
  const cr7 = await openPage(OTHER);
  await cr7.go("#/community/directory");
  await waitFor(() => !!byText(cr7.app, "h2", "Crafting offers"), "the directory");
  const craft7 = byText(cr7.app, "h2", "Crafting offers").closest("section");
  let slow7 = false;
  cr7.delay((p) => { if (!slow7 && p.includes("/api/community/crafting?q=flask")) { slow7 = true; return 150; } return 0; });
  craft7.querySelector('input[type="search"]').value = "flask";
  byText(craft7, "button", "Search").click(); // slow…
  await settle();
  craft7.querySelector('input[type="search"]').value = "";
  byText(craft7, "button", "Search").click(); // …then an empty query before it answers
  await new Promise((r) => setTimeout(r, 400));
  check("(5) an empty query after a slow search: the late reply writes no card, the status says what to type, Show more hidden", !craft7.querySelector(".card.craft") && craft7.textContent.includes("Type a recipe name or choose a profession") && byText(craft7, "button", "Show more").hidden === true);
  cr7.delay(null);

  console.log("\n== .108: Codex's .105 handoff as refined at 12:11 (six items) and the receipt siblings ==");
  const U6 = "300000000000000006", U7 = "300000000000000007", U8 = "300000000000000008";
  siteUser(U6, { global_name: "Pia" }); siteUser(U7, { global_name: "Quin" }); siteUser(U8, { global_name: "Rex" });
  const adm8 = await openPage(STAFF);
  // the completed id lifecycle, trials: two trials from one page visit
  await adm8.go("#/admin/community/trials");
  await waitFor(() => !!byText(adm8.app, "button", "Open a trial"), "the trials page");
  const tWho = () => adm8.app.querySelector('input[placeholder="Discord user ID"]');
  tWho().value = U6; byText(adm8.app, "button", "Open a trial").click();
  await waitFor(() => !!one("SELECT 1 FROM community_trials WHERE discord_id = ?", U6) && tWho().value === "", "the first trial");
  tWho().value = U7; byText(adm8.app, "button", "Open a trial").click();
  await waitFor(() => !!one("SELECT 1 FROM community_trials WHERE discord_id = ?", U7) || adm8.app.textContent.includes("already opened under"), "the second trial");
  const t6 = one("SELECT id FROM community_trials WHERE discord_id = ?", U6), t7 = one("SELECT id FROM community_trials WHERE discord_id = ?", U7);
  check("(lifecycle) a second trial opened from the same page visit is stored under a fresh id (the completed operation's id is retired after its receipt): two trials, two ids, no conflict", !!t6 && !!t7 && t6.id !== t7.id && !adm8.app.textContent.includes("already opened under"));
  check("  a trial op_conflict on a staff page reads as a trial, never as an event", APP_JS.includes('op_conflict: "A different trial was already opened under this form'));
  // the partial page: 100 open trials due sooner fill the first page; a lost trial lands on the second
  const seeded = [];
  for (let i = 0; i < 100; i++) {
    const uid = "4" + String(i).padStart(17, "0"), tid = "S" + String(i).padStart(21, "0");
    siteUser(uid, { global_name: `Seed ${i}` });
    db.prepare("INSERT INTO community_trials (id, op_id, op_hash, discord_id, sponsor_discord_id, started_at, review_due_at, status, created_by, created_at, updated_at, incarnation, revision, retain_until) VALUES (?, ?, NULL, ?, NULL, ?, ?, 'active', ?, ?, ?, ?, 1, ?)").run(tid, tid, uid, now - 100, now + DAY, STAFF, now, now, "inc-" + i, now + 90 * DAY);
    seeded.push([uid, tid]);
  }
  tWho().value = U8;
  adm8.drop((p, init) => p === "/api/admin/community/trials" && init.method === "POST");
  byText(adm8.app, "button", "Open a trial").click();
  await waitFor(() => !!byText(adm8.app, "button", "Check whether it was stored"), "the trial's lost-answer notice");
  adm8.drop(null);
  check("(fixture) the lost trial is stored, behind 100 open trials that are due sooner", !!one("SELECT 1 FROM community_trials WHERE discord_id = ?", U8) && one("SELECT COUNT(*) AS k FROM community_trials WHERE status IN ('active', 'extended')").k > 100);
  adm8.before((p) => p.startsWith("/api/admin/community/trials?cursor="));
  byText(adm8.app, "button", "Check whether it was stored").click();
  await new Promise((r) => setTimeout(r, 200));
  check("(partial page) a first page without the trial whose continuation cannot be read proves nothing: the outcome stays unknown, Retry and Check stay, the form stays locked", !!byText(adm8.app, "button", "Retry the same") && !!byText(adm8.app, "button", "Check whether it was stored") && tWho().disabled === true);
  adm8.before(null);
  byText(adm8.app, "button", "Check whether it was stored").click();
  await waitFor(() => !byText(adm8.app, "button", "Retry the same"), "the stored trial found on the second page");
  check("  the check follows the continuation and finds the trial on the second page: stored, the form unlocked and cleared", tWho().disabled === false && tWho().value === "" && adm8.document.body.textContent.includes("It was stored."));
  for (const [uid, tid] of seeded) { db.prepare("DELETE FROM community_trials WHERE id = ?").run(tid); db.prepare("DELETE FROM site_users WHERE discord_id = ?").run(uid); }
  // the completed id lifecycle, restriction cases: two cases from one page visit
  await adm8.go("#/admin/community/cases");
  await waitFor(() => !!byText(adm8.app, "button", "Open a case"), "the cases page");
  const caseForm8 = () => byText(adm8.app, "button", "Open a case").closest("form");
  const openCaseFor = async (uid) => {
    caseForm8().querySelector('input[type="text"]').value = uid;
    byText(caseForm8(), "button", "Open a case").click();
    await waitFor(() => !!byText(adm8.document.body, "button", "Open the case"), "the confirmation dialog");
    byText(adm8.document.body, "button", "Open the case").click();
    await waitFor(() => !!one("SELECT 1 FROM community_restriction_cases WHERE discord_id = ?", uid) || adm8.app.textContent.includes("already holds that id"), `the case for ${uid.slice(-2)}`);
  };
  await openCaseFor(U6);
  await waitFor(() => caseForm8().querySelector('input[type="text"]').value === "", "the cleared form");
  await openCaseFor(U7);
  const c6 = one("SELECT id FROM community_restriction_cases WHERE discord_id = ?", U6), c7 = one("SELECT id FROM community_restriction_cases WHERE discord_id = ?", U7);
  check("(lifecycle) a second restriction case opened from the same page visit is stored under a fresh id: two cases, two ids, no conflict", !!c6 && !!c7 && c6.id !== c7.id && !adm8.app.textContent.includes("already holds that id"));
  // a restriction action whose 200 is not a receipt for its case: reconciled by re-reading, applied once
  await waitFor(() => adm8.app.querySelectorAll(".card").some((c) => c.textContent.includes(`${U6} · case`) && !!byText(c, "button", "Review: continue")), "U6's case card");
  const rev6 = one("SELECT revision FROM community_restriction_cases WHERE discord_id = ?", U6).revision;
  adm8.answer((p, init) => (p === "/api/admin/community/restrictions" && init.method === "POST" && String(init.body).includes('"review"') ? {} : null));
  byText(adm8.app.querySelectorAll(".card").find((c) => c.textContent.includes(`${U6} · case`)), "button", "Review: continue").click();
  await waitFor(() => adm8.document.body.textContent.includes("The answer was lost, so the list was re-read"), "the re-read after an unreadable action answer");
  adm8.answer(null);
  check("(receipt siblings) a restriction action answered with an object that is not its case's receipt is an unknown outcome: no success toast, the list re-read, the Worker applied it once", one("SELECT revision FROM community_restriction_cases WHERE discord_id = ?", U6).revision === rev6 + 1 && !adm8.document.body.textContent.includes("Continued;"));
  check("  the other sibling receipts check their identity: the claims decision names its claim, the trial and departure updates their record, the organizer check its event", APP_JS.includes("out.claim.ref !== e.ref") && APP_JS.includes("out.trial.id !== t.id") && APP_JS.includes("out.departure.id !== d.id") && APP_JS.includes("d.event.id === opId") && (APP_JS.match(/out\.case\.caseId !== payload\.caseId/g) || []).length >= 2);
  // the inbox: the selected detail and the refreshed list
  const in8 = await openPage(STAFF);
  await in8.go("#/admin/community/inbox");
  const cardFor = (c) => in8.app.querySelectorAll(".card").find((x) => x.querySelector("h3") && x.querySelector("h3").textContent.endsWith(c.caseId));
  await waitFor(() => !!cardFor(caseA) && !!cardFor(caseB), "the inbox with both cases");
  const caseFrames = () => in8.app.querySelectorAll("h2").filter((x) => x.textContent.startsWith("Case ")).map((x) => x.textContent);
  let slowA = false;
  in8.delay((p) => { if (!slowA && p.includes(`/privacy-requests/case?caseId=${caseA.caseId}`)) { slowA = true; return 150; } return 0; });
  byText(cardFor(caseA), "button", "Open").click(); // A, slow…
  await settle();
  byText(cardFor(caseB), "button", "Open").click(); // …then B
  await new Promise((r) => setTimeout(r, 400));
  check("(inbox detail) the late detail of the case opened first is discarded: only case B's detail is shown, with one update form", JSON.stringify(caseFrames()) === JSON.stringify([`Case ${caseB.caseId}`]) && in8.app.querySelectorAll("button").filter((b) => b.textContent === "Update the case").length === 1, JSON.stringify(caseFrames()));
  let slowA2 = false;
  in8.delay((p) => { if (!slowA2 && p.includes(`/privacy-requests/case?caseId=${caseA.caseId}`)) { slowA2 = true; return 150; } return 0; });
  byText(cardFor(caseA), "button", "Open").click(); // A, slow…
  await settle();
  const stateSel8 = in8.app.querySelectorAll("select").find((x) => x.querySelectorAll("option").some((o) => o._value === "closed"));
  stateSel8.value = "closed"; fire(stateSel8, "change"); // …then the closed list
  await new Promise((r) => setTimeout(r, 400));
  check("(inbox list) a refreshed list (closed) retires the case detail still being read: no case detail repopulates under it", caseFrames().length === 0, JSON.stringify(caseFrames()));
  in8.delay(null);
  stateSel8.value = "open"; fire(stateSel8, "change");
  await waitFor(() => !!cardFor(caseA) && !!cardFor(caseB), "the open list again");
  // (self-review, same function) the staff inbox's waiting update stays with its case
  byText(cardFor(caseB), "button", "Open").click();
  await waitFor(() => caseFrames().includes(`Case ${caseB.caseId}`), "case B's detail");
  const staffB = () => one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ? AND author = 'staff'", caseB.caseId).k;
  const staffB0 = staffB();
  in8.app.querySelector("textarea").value = "Held for B.";
  in8.drop((p) => p === "/api/admin/community/privacy-requests/update");
  byText(in8.app, "button", "Update the case").click();
  await waitFor(() => !!byText(in8.app, "button", "Retry the same"), "B's lost-answer notice");
  in8.drop(null);
  byText(cardFor(caseA), "button", "Open").click();
  await waitFor(() => caseFrames().includes(`Case ${caseA.caseId}`), "case A's detail");
  check("(self-review) opening another case keeps B's waiting update: A's detail names it as held for case B", in8.app.textContent.includes(`An update to case ${caseB.caseId} is still waiting`));
  in8.app.querySelector("textarea").value = "Should not go.";
  byText(in8.app, "button", "Update the case").click();
  await settle(); await settle();
  check("  an update to A while B's waits is refused in words; nothing is written to A", in8.document.body.textContent.includes("Nothing was sent for this case.") && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ? AND text = 'Should not go.'", caseA.caseId).k === 0);
  byText(cardFor(caseB), "button", "Open").click();
  await waitFor(() => caseFrames().includes(`Case ${caseB.caseId}`) && !!byText(in8.app, "button", "Retry the same"), "B restored with its waiting update");
  check("  re-opening B restores the same locked operation (its text, Retry the same)", in8.app.querySelector("textarea").value === "Held for B." && in8.app.querySelector("textarea").disabled === true);
  byText(in8.app, "button", "Retry the same").click();
  await waitFor(() => !byText(in8.app, "button", "Retry the same"), "the retried update");
  check("  Retry the same is answered with the original result: the reply stored once", staffB() === staffB0 + 1 && one("SELECT COUNT(*) AS k FROM community_privacy_messages WHERE case_id = ? AND text = 'Held for B.'", caseB.caseId).k === 1);
  // the ledger: the late read of a member the page has left
  const led8 = await openPage(STAFF);
  await led8.go("#/admin/community/ledger");
  await waitFor(() => !!byText(led8.app, "button", "Read the ledger"), "the ledger page");
  const ledWho = led8.app.querySelector('input[placeholder="Discord user ID"]');
  let slowL = false;
  led8.delay((p) => { if (!slowL && p.includes(`/api/admin/community/contributions?discordId=${MEMBER}`)) { slowL = true; return 150; } return 0; });
  ledWho.value = MEMBER; byText(led8.app, "button", "Read the ledger").click(); // MEMBER, slow…
  await settle();
  ledWho.value = OTHER; byText(led8.app, "button", "Read the ledger").click(); // …then OTHER (no weeks)
  await new Promise((r) => setTimeout(r, 400));
  check("(ledger) the late read of the member the page has left is discarded: the view shows OTHER's empty ledger, never MEMBER's weeks under OTHER's name", led8.app.textContent.includes("No week recorded.") && !led8.app.textContent.includes(`(#${WEEK_ID})`));
  led8.delay(null);
  check("  the ledger's actions carry the member the view was drawn for, never the mutable input", APP_JS.includes("const drawLedger = (sub) => {") && APP_JS.includes("drawnFor = sub;") && APP_JS.includes("matchedDiscordId: sub"));
  // the organizer: a committed event whose re-read is withheld is a valid receipt; a lost change re-reads
  const org8 = await openPage(OTHER);
  await org8.go("#/community/calendar/new");
  await waitFor(() => !!byText(org8.app, "button", "Schedule"), "the event form");
  const f8 = byText(org8.app, "button", "Schedule").closest("form");
  f8.querySelector('input[type="text"]').value = "ZG run";
  f8.querySelector('input[type="datetime-local"]').value = startLocal;
  HOOKS.afterBatch = (i, sqls) => { if (sqls.some((q) => /INSERT INTO community_events/.test(q))) { HOOKS.afterBatch = null; db.prepare("UPDATE site_users SET session_version = 2 WHERE discord_id = ?").run(OTHER); } };
  byText(f8, "button", "Schedule").click();
  await waitFor(() => !!org8.document.body.querySelector(".receipt-bar"), "the withheld receipt");
  const bar8 = org8.document.body.querySelector(".receipt-bar");
  check("(withheld receipt) a committed event whose re-read is withheld (event null, hydration refused) is a receipt, not a lost answer: one row, the receipt says it is stored, the form spent, no Retry", one("SELECT COUNT(*) AS k FROM community_events WHERE title = 'ZG run'").k === 1 && HOOKS.afterBatch === null && !!bar8 && bar8.textContent.includes("The event was stored") && !byText(org8.app, "button", "Retry the same") && !!byText(org8.app, "a", "Open the event") && f8.querySelector('input[type="text"]').disabled === true);
  db.prepare("UPDATE site_users SET session_version = 1 WHERE discord_id = ?").run(OTHER);
  const org8b = await openPage(OTHER);
  await org8b.go(`#/community/calendar/${ony.id}/edit`);
  await waitFor(() => !!byText(org8b.app, "button", "Save changes"), "the edit form");
  const e8 = byText(org8b.app, "button", "Save changes").closest("form");
  e8.querySelector('input[type="text"]').value = "Onyxia (lost answer)";
  org8b.drop((p) => p === "/api/community/events/update");
  byText(e8, "button", "Save changes").click();
  await waitFor(() => org8b.app.textContent.includes("The answer was lost, so the event was re-read"), "the re-read after the lost answer");
  org8b.drop(null);
  const onyNow = one("SELECT title, revision FROM community_events WHERE id = ?", ony.id);
  check("(organizer receipts) a lost answer to an event change re-reads the event and says so: the change stored once, the form redrawn from the fresh event (its new revision), the message shown", onyNow.title === "Onyxia (lost answer)" && org8b.app.textContent.includes("The answer was lost, so the event was re-read") && org8b.app.textContent.includes(`Revision ${onyNow.revision}.`) && byText(org8b.app, "button", "Save changes").closest("form").querySelector('input[type="text"]').value === "Onyxia (lost answer)");

  console.log("\n== .109: Codex's acknowledgement item (12:25) and the rest of my self-review ==");
  // Codex 12:25: the requester's acknowledgement names the case it belongs to
  { const ins = ex7.querySelectorAll("input"); ins[0].value = caseA.caseId; ins[1].value = caseA.caseCode; byText(ex7, "button", "Open the case").click(); }
  await waitFor(() => !!byText(rq7.app, "h2", `Case ${caseA.caseId}`), "case A on the requester's page");
  check("(Codex 12:25) the reply acknowledgement names its case: B's stays, labelled as B's, while case A is open", ex7.textContent.includes(`Your reply to case ${caseB.caseId} was sent at`) && !!byText(rq7.app, "h2", `Case ${caseA.caseId}`) && !/Your reply was sent/.test(ex7.textContent));
  // names: a dialog by its heading; the trials member field by its visible label; the inbox filter without an empty choice
  const adm9 = await openPage(STAFF);
  await adm9.go("#/admin/community/cases");
  await waitFor(() => !!byText(adm9.app, "button", "Open a case"), "the cases page");
  const cf9 = byText(adm9.app, "button", "Open a case").closest("form");
  cf9.querySelector('input[type="text"]').value = U8;
  byText(cf9, "button", "Open a case").click();
  await waitFor(() => !!adm9.document.body.querySelector("dialog"), "the confirmation dialog");
  const dlg9 = adm9.document.body.querySelector("dialog"), h9 = dlg9.querySelector("h2");
  check("(self-review, names) a dialog is named by its own heading (aria-labelledby)", !!h9 && !!h9.id && dlg9.getAttribute("aria-labelledby") === h9.id);
  byText(dlg9, "button", "Cancel").click();
  await adm9.go("#/admin/community/trials");
  await waitFor(() => !!byText(adm9.app, "button", "Open a trial"), "the trials page");
  const who9 = adm9.app.querySelector('input[placeholder="Discord user ID"]');
  const lab9 = who9 && adm9.app.querySelector(`label[for="${who9.id}"]`);
  check("(self-review, names) the trials form's member field is named by its visible label, Member, and by nothing else", !!who9 && !who9.hasAttribute("aria-label") && !!lab9 && lab9.textContent.includes("Member"));
  who9.value = MEMBER;
  byText(adm9.app, "button", "Open a trial").click();
  await waitFor(() => adm9.app.textContent.includes("already has an open trial"), "the refusal in words");
  check("(self-review, wording) opening a trial for a member with an open one is refused in words, not as a bare status", adm9.app.textContent.includes("This member already has an open trial. Extend or conclude it instead.") && !adm9.app.textContent.includes("Request failed"));
  check("  the other staff refusals a normal path reaches have words: an erased account, a case gone, the watch-list's five refusals, a vanished claim or profile", ["account_deleted", "case_not_found", "renewal_required", "too_many_characters", "no_period", "character_not_found", "binding_changed", "claim_not_found", "profile_not_found"].every((k) => APP_JS.slice(APP_JS.indexOf("const ADMIN_COMMUNITY_ERRORS = {"), APP_JS.indexOf("const explainAdmin")).includes(`\n    ${k}: "`)));
  await adm9.go("#/admin/community/inbox");
  await waitFor(() => adm9.app.querySelectorAll("select").some((x) => x.querySelectorAll("option").some((o) => o._value === "closed")), "the inbox");
  const st9 = adm9.app.querySelectorAll("select").find((x) => x.querySelectorAll("option").some((o) => o._value === "closed"));
  check("(self-review, names) the inbox filter offers open and closed only: no empty choice to submit", st9.querySelectorAll("option").map((o) => o._value).join(",") === "open,closed");
  // the member's profile editor: a duplicate is refused in words
  const pf9 = await openPage(MEMBER);
  await pf9.go("#/community/profile");
  await waitFor(() => !!byText(pf9.app, "button", "Save"), "the profile form");
  const pform9 = byText(pf9.app, "button", "Save").closest("form");
  const alt9 = pform9.querySelector('.row[data-kind="alt"] input');
  alt9.value = "Mia One"; fire(alt9, "input"); // the main again, as an alt
  byText(pform9, "button", "Save").click();
  await waitFor(() => pf9.app.textContent.includes("or is also your main"), "the refusal in words");
  check("(self-review, wording) the profile editor words a duplicate (the main listed as an alt) instead of a bare status", pf9.app.textContent.includes("An alt is listed twice, is not a valid") && !pf9.app.textContent.includes("Request failed"));
  // the ledger: no impossible option; a lost payment keeps what was sent and the same payment replays
  const led9 = await openPage(STAFF);
  await led9.go("#/admin/community/ledger");
  await waitFor(() => !!byText(led9.app, "button", "Read the ledger"), "the ledger page");
  led9.app.querySelector('input[placeholder="Discord user ID"]').value = MEMBER;
  byText(led9.app, "button", "Read the ledger").click();
  await waitFor(() => !!byText(led9.app, "button", "Record the payment"), "MEMBER's ledger");
  const rs9 = led9.app.querySelectorAll("select").find((x) => x.querySelectorAll("option").some((o) => o._value === "matched"));
  check("(self-review) the payment form offers matched, disputed and rejected only: the ledger refuses an unmatched payment with a member, and this form always names the member", !!rs9 && rs9.querySelectorAll("option").map((o) => o._value).join(",") === "matched,disputed,rejected");
  led9.app.querySelector('input[placeholder="source id"]').value = "mail-ui-9";
  led9.app.querySelector('input[placeholder="copper"]').value = "2500";
  led9.drop((p, init) => p === "/api/admin/community/contributions" && init.method === "POST");
  byText(led9.app, "button", "Record the payment").click();
  await waitFor(() => led9.document.body.textContent.includes("The answer was lost, so the ledger was re-read") && !!led9.app.querySelector('input[placeholder="source id"]'), "the re-read ledger after the lost answer");
  led9.drop(null);
  await waitFor(() => led9.app.querySelector('input[placeholder="source id"]').value === "mail-ui-9", "the kept draft");
  check("(self-review) a payment whose answer was lost: the ledger is re-read and says so, the form keeps what was sent (source id, amount), the Worker holds it once", led9.document.body.textContent.includes("The answer was lost, so the ledger was re-read") && led9.app.querySelector('input[placeholder="source id"]').value === "mail-ui-9" && led9.app.querySelector('input[placeholder="copper"]').value === "2500" && one("SELECT COUNT(*) AS k FROM community_contribution_receipts WHERE source_id = 'mail-ui-9'").k === 1);
  byText(led9.app, "button", "Record the payment").click();
  await waitFor(() => !!led9.app.querySelector('input[placeholder="source id"]') && led9.app.querySelector('input[placeholder="source id"]').value === "", "the cleared form after the replay");
  check("  sending the same payment again is answered as the stored one (one row) and the form clears", one("SELECT COUNT(*) AS k FROM community_contribution_receipts WHERE source_id = 'mail-ui-9'").k === 1 && led9.app.querySelector('input[placeholder="source id"]').value === "");
  // the new-event form: unsaved while the lost answer waits; Check answers absent; the resend stores it once
  const org9 = await openPage(OTHER);
  await org9.go("#/community/calendar/new");
  await waitFor(() => !!byText(org9.app, "button", "Schedule"), "the event form");
  const f9 = byText(org9.app, "button", "Schedule").closest("form");
  f9.querySelector('input[type="text"]').value = "Absent check"; fire(f9.querySelector('input[type="text"]'), "input");
  f9.querySelector('input[type="datetime-local"]').value = startLocal;
  org9.before((p, init) => p === "/api/community/events" && init.method === "POST");
  byText(f9, "button", "Schedule").click();
  await waitFor(() => !!byText(org9.app, "button", "Check whether it was stored"), "the lost-answer notice");
  check("(self-review) while a lost answer waits, the event form stays marked unsaved (the leave guard holds)", !!byText(f9, "span", "unsaved") && byText(f9, "span", "unsaved").hidden === false);
  org9.before(null);
  byText(org9.app, "button", "Check whether it was stored").click();
  await waitFor(() => f9.querySelector('input[type="text"]').disabled === false, "the form unlocked after the check");
  check("(coverage) Check answers absent when nothing was stored: the form unlocks with what was typed; nothing stored", f9.querySelector('input[type="text"]').value === "Absent check" && one("SELECT COUNT(*) AS k FROM community_events WHERE title = 'Absent check'").k === 0);
  byText(f9, "button", "Schedule").click();
  await waitFor(() => org9.location.hash.startsWith("#/community/calendar/") && !org9.location.hash.endsWith("/new"), "the stored event's page");
  const absent9 = one("SELECT id FROM community_events WHERE title = 'Absent check'");
  check("  sending again stores it once and moves to it, with no leave prompt", one("SELECT COUNT(*) AS k FROM community_events WHERE title = 'Absent check'").k === 1 && org9.location.hash === `#/community/calendar/${absent9.id}` && !org9.document.body.querySelector("dialog"));
  // attendance: a row changed meanwhile
  await org9.go(`#/community/calendar/${PAST}/attendance`);
  await waitFor(() => !!byText(org9.app, "td", "Mia"), "the attendance list");
  db.prepare("UPDATE community_event_attendance SET revision = revision + 1 WHERE event_id = ? AND discord_id = ?").run(PAST, MEMBER);
  const before9 = one("SELECT state, revision FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER);
  const row9 = byText(org9.app, "td", "Mia").closest("tr");
  row9.querySelectorAll("select")[0].value = before9.state === "present" ? "absent" : "present";
  byText(row9, "button", "Change").click();
  await waitFor(() => org9.document.body.textContent.includes("This row changed meanwhile"), "the stale refusal");
  const after9 = one("SELECT state, revision FROM community_event_attendance WHERE event_id = ? AND discord_id = ?", PAST, MEMBER);
  check("(coverage) attendance: a row changed meanwhile is refused as stale and the list re-read; nothing written", after9.state === before9.state && after9.revision === before9.revision);
  // layout
  check("(self-review, layout) the receipt bar and the reload notice stack instead of covering each other; a card head wraps on a narrow screen", APP_JS.includes("function stackBars()") && (APP_JS.match(/stackBars\(\)/g) || []).length >= 5 && APP_CSS.includes(".card-head { flex-wrap: wrap; min-width: 0; }"));

  console.log("\n== .110: Codex's draft-state item (12:57) ==");
  const led10 = await openPage(STAFF);
  await led10.go("#/admin/community/ledger");
  await waitFor(() => !!byText(led10.app, "button", "Read the ledger"), "the ledger page");
  const ledWho10 = () => led10.app.querySelector('input[placeholder="Discord user ID"]');
  ledWho10().value = MEMBER; byText(led10.app, "button", "Read the ledger").click();
  await waitFor(() => !!byText(led10.app, "button", "Record the payment") && led10.app.textContent.includes(`(#${WEEK_ID})`), "MEMBER's ledger");
  led10.app.querySelector('input[placeholder="source id"]').value = "mail-a-10";
  led10.app.querySelector('input[placeholder="copper"]').value = "1000";
  let held10 = false;
  led10.hold((p, init) => { if (!held10 && p === "/api/admin/community/contributions" && init.method === "POST") { held10 = true; return 300; } return 0; });
  byText(led10.app, "button", "Record the payment").click(); // A's payment: the Worker completes it, the page sees the answer 300 ms later
  await waitFor(() => !!one("SELECT 1 FROM community_contribution_receipts WHERE source_id = 'mail-a-10'"), "A's payment stored");
  ledWho10().value = OTHER; byText(led10.app, "button", "Read the ledger").click(); // meanwhile the page moves to B…
  await waitFor(() => !!byText(led10.app, "button", "Record the payment") && led10.app.textContent.includes("No week recorded."), "OTHER's ledger");
  const srcB = led10.app.querySelector('input[placeholder="source id"]');
  srcB.value = "mail-b-draft"; fire(srcB, "input"); // …and B's form is typed into
  await new Promise((r) => setTimeout(r, 450)); // A's held answer arrives
  led10.hold(null);
  byText(led10.app, "button", "Read the ledger").click(); // B redrawn
  await waitFor(() => !!byText(led10.app, "button", "Record the payment") && led10.app.textContent.includes("No week recorded."), "OTHER's ledger again");
  check("(Codex 12:57) a ledger action's late answer for member A never clears the drafts of member B the page moved to: B's typed source id survives B's redraw; A's payment is stored once", led10.app.querySelector('input[placeholder="source id"]').value === "mail-b-draft" && one("SELECT COUNT(*) AS k FROM community_contribution_receipts WHERE source_id = 'mail-a-10'").k === 1 && one("SELECT COUNT(*) AS k FROM community_contribution_receipts WHERE source_id = 'mail-b-draft'").k === 0);

  console.log("\n== .112: the official-assets audit (Viktor: official World of Warcraft assets only, the crest the one exception) ==");
  {
    const RANKS_JS = fs.readFileSync(path.join(root, "public", "static", "rank-planner", "app.js"), "utf8");
    const RANKS_TS = fs.readFileSync(path.join(root, "src", "site-ranks.ts"), "utf8");
    const CORE_TS = fs.readFileSync(path.join(root, "src", "site-core.ts"), "utf8");
    const glyphs = (txt) => [...txt.matchAll(/["'`>]\s*([\u2190-\u21ff\u2300-\u27bf\u00d7\u2022\u2605\u2606\u2713\u2714\u2717\u2718])\s*[<"'`]/g)].map((m) => m[1]);
    check("(audit) no pictograph is the whole face of a control or a badge: the page script, the rank planner script and its page carry none", glyphs(APP_JS).length === 0 && glyphs(RANKS_JS).length === 0 && glyphs(RANKS_TS).length === 0, JSON.stringify([glyphs(APP_JS), glyphs(RANKS_JS), glyphs(RANKS_TS)]));
    check("  the rank planner's remove and close buttons wear the client's close button; its move buttons say Up and Down", RANKS_JS.includes("button('', 'close-button remove'") && RANKS_JS.includes("[['Up', -1, 'up'], ['Down', 1, 'down']]") && RANKS_TS.includes('class=\\"close-button\\" aria-label=\\"Close rank review\\"') && fs.readFileSync(path.join(root, "public", "static", "rank-planner", "styles.css"), "utf8").includes('url("/static/wow/close-up.png")'));
    check("  the site's CSP takes images from this site and, since .114, Discord's picture host only (no data:, no other host)", CORE_TS.includes(`"img-src 'self' https://cdn.discordapp.com"`) && !CORE_TS.includes("img-src 'self' data:"));
    // behaviour: a typed friend and the picker's add-by-name row show the official scroll icon; an image from another host is never set
    const typedPage = await openPage(MEMBER);
    await typedPage.go("#/");
    await waitFor(() => !!typedPage.app.querySelector("h2"), "the member's home");
    const own = typedPage.app.querySelector(".who img");
    const imgs = typedPage.document.body.querySelectorAll("img").filter((im) => im !== own); // .114: the top bar's own Discord picture is the one exception, checked below
    check("  every image the member's home draws comes from this site: the official wow/ set or the crest (the top bar's own picture aside)", imgs.length > 0 && imgs.every((im) => /^\/static\/(wow\/[a-z0-9_-]+\.(png|jpg)|olympus-icon\.png)$/.test(im.getAttribute("src") || "")), JSON.stringify(imgs.map((im) => im.getAttribute("src")).filter((x) => !/^\/static\//.test(x || ""))));
    check("  the image helper refuses another host for an img (the typed-name icon is the official scroll)", APP_JS.includes('k === "src" ? /^\\/(?!\\/)/.test(s)') && APP_JS.includes('src: art("icon-names"), alt: "", width: "32"') && !APP_JS.includes('text: "✎"'));
  }

  console.log("\n== .114: the owner's requests (2 Oct 2026) ==");
  {
    const p114 = await openPage(MEMBER);
    await p114.go("#/");
    await waitFor(() => !!p114.app.querySelector(".who img"), "the top bar");
    const own = p114.app.querySelector(".who img");
    const avatar = p114.boot.user && p114.boot.user.avatarUrl;
    check("(.114) the top bar shows the member's own Discord picture: the address the Worker gave, on Discord's picture host", /^https:\/\/cdn\.discordapp\.com\//.test(avatar || "") && own.getAttribute("src") === avatar, avatar, own && own.getAttribute("src"));
    own.dispatchEvent(new Event("error"));
    check("  a picture that fails to load falls back to the official Member icon", own.getAttribute("src") === "/static/wow/pos-member.png");
    check("  the footer says whose picture it is; signed in, it links the policies, Your data and the private request form", p114.app.querySelector("footer").textContent.includes("your own Discord picture") && texts(p114.app, ".footer-links a").join(",") === "Privacy Policy,Terms of Service,Your data,Private request");
    const AV = new Function("return " + APP_JS.match(/const DISCORD_AVATAR = (\/.*\/);/)[1])();
    const good = ["https://cdn.discordapp.com/avatars/300000000000000003/0123456789abcdef0123456789abcdef.png?size=64", "https://cdn.discordapp.com/avatars/300000000000000003/a_0123456789abcdef0123456789abcdef.png?size=64", "https://cdn.discordapp.com/guilds/236932545793490944/users/300000000000000003/avatars/0123456789abcdef0123456789abcdef.png?size=64", "https://cdn.discordapp.com/embed/avatars/3.png"];
    const bad = ["https://evil.example/avatars/300000000000000003/0123456789abcdef0123456789abcdef.png?size=64", "http://cdn.discordapp.com/embed/avatars/3.png", "https://cdn.discordapp.com/attachments/1/2/x.png", "https://cdn.discordapp.com/embed/avatars/9.png", "https://cdn.discordapp.com.evil.example/embed/avatars/3.png", "//cdn.discordapp.com/embed/avatars/3.png", "https://cdn.discordapp.com/avatars/300000000000000003/0123456789abcdef0123456789abcdef.png?size=64&x=1"];
    check("  the picture rule admits only Discord's avatar addresses (profile, server, default) and nothing else", good.every((u) => AV.test(u)) && bad.every((u) => !AV.test(u)));
    check("  the other eight account pictures stay game icons (accountArt), the top bar alone uses ownAvatar", (APP_JS.match(/ownAvatar\(/g) || []).length === 2 && (APP_JS.match(/accountArt\(/g) || []).length >= 9);

    // the I-X leadership directory
    await p114.go("#/community/leadership");
    await waitFor(() => !!byText(p114.app, "h2", "Leadership of the Olympus guilds"), "the leadership page");
    check("(.114) Community → Leadership for a confirmed member: ten guilds, none listed yet, and the Council's link", texts(p114.app, ".leadership-card h3").length === 10 && texts(p114.app, ".leadership-card h3")[0] === "Olympus I" && texts(p114.app, ".leadership-card h3")[9] === "Olympus X" && p114.app.textContent.includes("No guild leadership is listed yet") && !!p114.app.querySelector('a[href="https://discord.com/channels/236932545793490944/1555636857621188669"]'));
    check("  the Community tabs offer it, and the page says a listing grants nothing", texts(p114.app, 'nav[aria-label="Community sections"] a').includes("Leadership") && p114.app.textContent.includes("A listing is a record only"));
    const unconf114 = await openPage(STAFF);
    await unconf114.go("#/community/leadership");
    await settle();
    check("  a member without a roster-confirmed character gets the standing notice, not the directory", unconf114.app.textContent.includes("roster export has confirmed") && !byText(unconf114.app, "h2", "Leadership of the Olympus guilds"));

    // Admin → Settings: the Battle.net switch, the directory editor, the end of the beta
    const adm = await openPage(STAFF);
    await adm.go("#/admin/settings");
    await waitFor(() => !!adm.app.querySelector("#bnet-switch") && !!adm.app.querySelector("#lead-gm-0") && !!adm.app.querySelector("#beta-closed-at"), "the .114 settings blocks");
    const bx = adm.app.querySelector("#bnet-switch");
    check("(.114) Admin → Settings: Battle.net sign-in is off, its box locked, with the reason (no policy section, no credentials here)", bx.checked === false && bx.disabled === true && /no Battle\.net client credentials|does not describe Battle\.net sign-in/.test(adm.app.textContent) && !!byText(adm.app, "h2", "Battle.net sign-in"));
    const namesOk = adm.app.querySelector("#appointed-names-ok"), leadOk = adm.app.querySelector("#lead-names-ok");
    check("(.115) both name editors carry an unticked consent box and say how to remove a name on request", !!namesOk && namesOk.checked === false && !!leadOk && leadOk.checked === false &&
      adm.app.textContent.includes("Each person named here agreed to be named. Appointed names are public on the open web, signed in or not.") && adm.app.textContent.includes("Each person listed here agreed to be listed. Confirmed members can read the directory.") &&
      adm.app.textContent.includes("type Name withheld (the role stays appointed) or clear it (the role reopens)"));
    adm.app.querySelector("#lead-gm-0").value = "Fern Melder";
    adm.app.querySelector("#lead-off-0").value = "Ana\nBo";
    byText(adm.app, "button", "Save the directory").click();
    await waitFor(() => adm.document.body.textContent.includes("Confirm that each person you list agreed to be listed."), "the consent refusal");
    check("  (.115) without the tick the directory save is refused, shown in words, and nothing is stored", !one("SELECT 1 FROM site_settings WHERE key = 'leadership'"));
    leadOk.checked = true;
    byText(adm.app, "button", "Save the directory").click();
    await waitFor(() => !!one("SELECT 1 FROM site_settings WHERE key = 'leadership'"), "the directory save");
    const saved = JSON.parse(one("SELECT value FROM site_settings WHERE key = 'leadership'").value);
    check("  the directory editor saves the Guild Master and the officers, one per line", saved[0].gm === "Fern Melder" && saved[0].officers.join(",") === "Ana,Bo" && saved.length === 10);
    check("  (.115) the save carried the tick (the log records it, with a count and no names), and the box is cleared for the next save", (() => { const d = JSON.parse(one("SELECT details FROM audit WHERE action = 'site.leadership' ORDER BY id DESC LIMIT 1").details); return d.namesConfirmed === true && d.names === 3; })() && leadOk.checked === false);
    await p114.go("#/community"); // the same address again would not re-render
    await p114.go("#/community/leadership");
    await waitFor(() => p114.app.textContent.includes("Fern Melder"), "the listing on the member's page");
    check("  and a confirmed member sees it", p114.app.textContent.includes("Ana, Bo") && !p114.app.textContent.includes("No guild leadership is listed yet"));
    check("  the end-of-beta reset is locked until the closing moment is recorded", byText(adm.app, "button", "Reset guild leadership").disabled === true && adm.app.textContent.includes("locked"));
    const past = new Date(Date.now() - 3600 * 1000), pad = (x) => String(x).padStart(2, "0");
    adm.app.querySelector("#beta-closed-at").value = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
    byText(adm.app, "button", "Record the closing moment").click();
    await waitFor(() => { const b = byText(adm.app, "button", "Reset guild leadership"); return !!b && b.disabled === false; }, "the reset unlocked");
    check("  recording a past closing moment unlocks it", !!one("SELECT 1 FROM site_settings WHERE key = 'betaClosedAt'") && byText(adm.app, "button", "Reset guild leadership").disabled === false);
    byText(adm.app, "button", "Reset guild leadership").click();
    await waitFor(() => !!adm.document.body.querySelector("dialog input"), "the RESET confirmation");
    const dlgR = adm.document.body.querySelector("dialog"), inR = dlgR.querySelector("input");
    check("  the reset asks for the typed word and names what it clears", dlgR.textContent.includes("Type RESET to confirm") && dlgR.textContent.includes("3 names"));
    inR.value = "RESET"; fire(inR, "input");
    byText(dlgR, "button", "Reset").click();
    await waitFor(() => !!one("SELECT 1 FROM site_settings WHERE key = 'betaResetAt'"), "the reset");
    check("  typed RESET: the appointed roles become an explicit empty list and the directory empties", one("SELECT value FROM site_settings WHERE key = 'appointed'").value === "{}" && JSON.parse(one("SELECT value FROM site_settings WHERE key = 'leadership'").value).every((g) => !g.gm && !g.officers.length));

    // Admin → Renames
    db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'system', 'roster.renamed', 'Oz Three', ?)").run(now - 600, JSON.stringify({ from: "Oz Two", discordId: OTHER, guid: "Player-1-0002" }));
    db.prepare("UPDATE characters SET name_key = 'oz three', name = 'Oz Three' WHERE discord_id = ? AND name = 'Oz Two'").run(OTHER);
    await adm.go("#/admin/renames");
    await waitFor(() => !!byText(adm.app, "button", "Blizzard required this rename"), "the renames list");
    check("(.114) Admin → Renames lists the roster's rename with the account and a button, nobody waiting yet", adm.app.textContent.includes("Oz Two") && adm.app.textContent.includes("Oz Three") && adm.app.textContent.includes("Nobody is waiting."));
    byText(adm.app, "button", "Blizzard required this rename").click();
    await waitFor(() => !!adm.document.body.querySelector("dialog input"), "the REAPPLY confirmation");
    const dlgN = adm.document.body.querySelector("dialog"), inN = dlgN.querySelector("input");
    check("  marking asks for the typed word and says an ordinary rename needs nothing", dlgN.textContent.includes("Type REAPPLY to confirm") && dlgN.textContent.includes("an ordinary rename keeps the link"));
    inN.value = "REAPPLY"; fire(inN, "input");
    byText(dlgN, "button", "Ask them to apply again").click();
    await waitFor(() => !!one("SELECT 1 FROM rename_holds WHERE discord_id = ? AND state = 'reapply'", OTHER), "the hold");
    await waitFor(() => !!byText(adm.app, "button", "New application approved"), "the waiting list");
    check("  the member appears under 'Members applying again' and the character is unbound", !!byText(adm.app, "button", "New application approved") && one("SELECT status FROM characters WHERE discord_id = ? AND name = 'Oz Three'", OTHER).status === "unbound");
    const oz = await openPage(OTHER);
    await oz.go("#/");
    await waitFor(() => !!oz.app.querySelector("h1"), "OTHER's home");
    check("  the member's Home says to apply again, with both names", oz.app.textContent.includes("Apply again.") && oz.app.textContent.includes("Oz Two") && oz.app.textContent.includes("Oz Three") && !!oz.app.querySelector('a[href="#/apply"]'));
    byText(adm.app, "button", "New application approved").click();
    await waitFor(() => !!adm.document.body.querySelector("dialog"), "the approve confirmation");
    byText(adm.document.body.querySelector("dialog"), "button", "Approve").click();
    await waitFor(() => !adm.document.body.querySelector("dialog") && !!byText(adm.app, "button", "New application approved"), "the list after the refused approval");
    check("  approving before the new application and the fresh verification is refused: the hold stays open (Codex 19:17)", !!one("SELECT 1 FROM rename_holds WHERE discord_id = ? AND state = 'reapply'", OTHER));
    byText(adm.app, "button", "Withdraw the decision").click();
    await waitFor(() => !!adm.document.body.querySelector("dialog"), "the withdraw confirmation");
    byText(adm.document.body.querySelector("dialog"), "button", "Withdraw").click();
    await waitFor(() => !!one("SELECT 1 FROM rename_holds WHERE discord_id = ? AND state = 'cancelled'", OTHER), "the withdrawal");
    check("  withdrawing a mistaken decision closes the hold", !one("SELECT 1 FROM rename_holds WHERE discord_id = ? AND state = 'reapply'", OTHER));
    db.prepare("UPDATE characters SET status = 'member', guid = 'Player-1-0002' WHERE discord_id = ? AND name = 'Oz Three'").run(OTHER); // the later checks need OTHER confirmed again
  }

  console.log("\n== .115: Olympus I's seats, News and the role copy (Viktor's items A, B and D, 2 Oct 2026) ==");
  {
    const NEWBIE = "300000000000000115", READER = "300000000000000116";
    siteUser(NEWBIE, { global_name: "Nia" }); // signed in, no roster-confirmed character
    siteUser(READER, { global_name: "Rae" }); character(READER, "Rae Five", "Player-1-0007");
    const VISITORS = { CHANNEL_VISITOR_CHAT: "1554265065509756989" };
    const nowS = () => Math.floor(Date.now() / 1000);
    const frameOf = (pg, title) => { const t = byText(pg.app, "h2", title); return t ? t.closest("section") : null; };
    const seatBox = (pg) => pg.app.querySelectorAll(".notice-box").find((b) => b.textContent.includes("Olympus I is full right now")) || null;
    const home = async (who, over) => { const pg = await openPage(who, over); await pg.go("#/"); await waitFor(() => !!pg.app.querySelector("h1"), "the home page"); return pg; };

    // ---- B: the seat state (a complete, trusted export of 1000 an hour ago; MEMBER's second character waits in the queue)
    const snap = Number(db.prepare("INSERT INTO roster_snapshots (exported_at, received_at, source, member_count, content_hash, trusted, complete, first_received_at) VALUES (?, ?, 'addon', 1000, 'fe115', 1, 1, ?)").run(now - 3600, now - 3600, now - 3600).lastInsertRowid);
    const queueRow = Number(db.prepare("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('mia alt', 'Mia Alt', ?, 'queued', ?)").run(MEMBER, now - 7200).lastInsertRowid);
    const queued = await home(MEMBER, VISITORS);
    const qb = seatBox(queued);
    check("(.115) a confirmed member with a character in the invite queue: Home says Olympus I is full, gives their own place and links the visitors channel", !!qb && qb.textContent.includes("Mia Alt is #1 in line for a seat.") && qb.textContent.includes("officers may remove inactive characters") && qb.textContent.includes("reserved names from the site go first") && qb.textContent.includes("never costs you an invite attempt") && !!qb.querySelector('a[href="https://discord.com/channels/1549537348516188200/1554265065509756989"]') && !!qb.querySelector('img[src="/static/wow/icon-clock.png"]'), qb && qb.textContent);
    check("  the boot carries the member's own places and the member view of the seats (the hour only, no reason or exact time)", JSON.stringify(queued.boot.myQueue) === JSON.stringify([{ name: "Mia Alt", position: 1 }]) && queued.boot.seats.asOf % 3600 === 0 && !("reason" in queued.boot.seats) && !("rosterAt" in queued.boot.seats));
    const newbie = await home(NEWBIE);
    const nb = seatBox(newbie);
    check("  an account without a confirmed character and no queue rows: the export's hour and count, verifying still works; without the channel id the channel name is plain text", !!nb && nb.textContent.includes("the officers' roster export of about") && nb.textContent.includes("counts 1000 of 1000 members") && nb.textContent.includes("Verifying in Discord still works") && nb.textContent.includes("#olympus-visitors in Asmongold's Discord") && !nb.querySelector("a"), nb && nb.textContent);
    await newbie.go("#/apply");
    await waitFor(() => !!newbie.app.querySelector("h2"), "the Apply page");
    check("  the Apply page shows the same notice above everything else", !!seatBox(newbie) && seatBox(newbie).textContent.includes("counts 1000 of 1000 members") && newbie.app.querySelector("main").firstChild.textContent.includes("Olympus I is full right now"));
    check("  a confirmed member without queue rows sees no seat notice", !seatBox(await home(OTHER)));
    const adm5 = await openPage(STAFF);
    const overviewLine = async () => {
      await adm5.go("#/admin/lookup");
      await adm5.go("#/admin");
      await waitFor(() => !!adm5.app.querySelector("#overview-seats"), "the overview's seat line");
      return adm5.app.querySelector("#overview-seats").textContent;
    };
    let line = await overviewLine();
    check("  Admin overview: one staff line above the tiles, full by the roster export, with the count and the queue", line.startsWith("Olympus I: full, 1000 of 1000 on the latest roster export of ") && line.endsWith(" · 1 waiting in the invite queue.") && adm5.app.querySelector("#overview-seats").className === "muted small", line);
    db.prepare("UPDATE roster_snapshots SET member_count = 995 WHERE id = ?").run(snap);
    line = await overviewLine();
    check("  open: the free seats", line.startsWith("5 seats free on Olympus I (995 of 1000, latest roster export of "), line);
    check("  while there is room nobody sees the notice", !seatBox(await home(NEWBIE)));
    db.prepare("UPDATE roster_snapshots SET exported_at = ?, received_at = ? WHERE id = ?").run(now - 7200, now - 7200, snap);
    const refusal = Number(db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'guild.full', 'Nia Six', '{}')").run(now - 600).lastInsertRowid);
    line = await overviewLine();
    check("  full by an invite refused for space after that export", line.startsWith("Olympus I: full (an invite was refused for space "), line);
    const rb = seatBox(await home(NEWBIE));
    check("  the member's notice gives the refusal and no count", !!rb && rb.textContent.includes("the last invite was refused for lack of space (about ") && !rb.textContent.includes("of 1000"), rb && rb.textContent);
    db.prepare("UPDATE roster_snapshots SET trusted = 0 WHERE id = ?").run(snap);
    db.prepare("DELETE FROM audit WHERE id = ?").run(refusal);
    line = await overviewLine();
    check("  unknown: the reason in words", line.startsWith("Olympus I room: unknown (the latest export is not trusted: run /olympus-admin sync if the guild really shrank)"), line);
    db.prepare("UPDATE roster_snapshots SET trusted = NULL, complete = 0, first_received_at = ? WHERE id = ?").run(now - 3600, snap);
    line = await overviewLine();
    check("  left unfinished (still complete 0 an hour after it arrived; review of 3 Oct 2026): the reason in words", line.startsWith("Olympus I room: unknown (the latest export was left unfinished; the addon's next export writes it again)"), line);
    db.prepare("UPDATE roster_snapshots SET complete = 1 WHERE id = ?").run(snap);
    db.prepare("UPDATE roster_snapshots SET trusted = 1, member_count = 1000, exported_at = ?, received_at = ? WHERE id = ?").run(now - 3600, now - 3600, snap); // full again for News

    // ---- A: News, off until an administrator switches it on
    const calls = [];
    const off5 = await openPage(MEMBER);
    off5.delay((p) => { calls.push(p); return 0; });
    await off5.go("#/community");
    await waitFor(() => !!byText(off5.app, "h3", "Leadership"), "the community overview");
    check("(.115) News is off by default: no News tab and no News card for a confirmed member", !texts(off5.app, 'nav[aria-label="Community sections"] a').includes("News") && !byText(off5.app, "h3", "News"));
    await off5.go("#/community/news");
    await settle();
    check("  and #/community/news is no page while it is off: the page asks the Worker nothing", off5.app.textContent.includes("There is no such community page") && !calls.some((p) => p.startsWith("/api/news")));
    const adm6 = await openPage(STAFF);
    await adm6.go("#/admin/news");
    await waitFor(() => !!byText(adm6.app, "h2", "New notice"), "Admin → News");
    check("  Admin → News while off: the tab, the switch's state, that nothing can be posted, the form locked", texts(adm6.app, 'nav[aria-label="Admin sections"] a').includes("News") && adm6.app.textContent.includes("News is switched off (Admin → Settings); notices cannot be posted while it is off.") && byText(adm6.app, "button", "Post notice").disabled === true && adm6.app.querySelector("#f-news-title").disabled === true);
    await adm6.go("#/admin/settings");
    await waitFor(() => !!adm6.app.querySelector("#news-on"), "the News switch");
    check("  Admin → Settings has the News switch beside the others, unticked", adm6.app.querySelector("#news-on").checked === false && adm6.app.textContent.includes("News page: confirmed members can read Community → News"));
    adm6.app.querySelector("#news-on").checked = true;
    byText(adm6.app, "button", "Save settings").click();
    await waitFor(() => (one("SELECT value FROM site_settings WHERE key = 'newsOn'") || {}).value === "1", "the switch saved");
    check("  ticking it and saving stores newsOn '1'; the log records the switch", JSON.parse(one("SELECT details FROM audit WHERE action = 'site.settings' ORDER BY id DESC LIMIT 1").details).newsOn === "1");
    // ---- C: a typed name needs the consent tick (review of 3 Oct 2026: the page's refusal and the box cleared after a save)
    const appointedNow = () => (one("SELECT value FROM site_settings WHERE key = 'appointed'") || {}).value || "";
    const apInput = adm6.app.querySelectorAll('input[placeholder="Open"]')[0];
    const apBefore = appointedNow();
    apInput.value = "Tess Appointee";
    byText(adm6.app, "button", "Save settings").click();
    await waitFor(() => adm6.document.body.textContent.includes("Confirm that each person you name agreed to be named."), "the confirm_names refusal");
    check("(.115) an appointed name saved without the consent tick: the Worker's 400 confirm_names is shown in words and nothing is stored", adm6.document.body.textContent.includes("Confirm that each person you name agreed to be named. Appointed names are public on the open web.") && appointedNow() === apBefore && !appointedNow().includes("Tess Appointee") && adm6.app.querySelector("#appointed-names-ok").checked === false);
    adm6.app.querySelector("#appointed-names-ok").checked = true;
    byText(adm6.app, "button", "Save settings").click();
    await waitFor(() => appointedNow().includes("Tess Appointee") && adm6.app.querySelector("#appointed-names-ok").checked === false, "the saved name and the cleared box");
    const apAudit = JSON.parse(one("SELECT details FROM audit WHERE action = 'site.settings' ORDER BY id DESC LIMIT 1").details);
    check("  with the tick it saves, the box is unticked again for the next save, and the log keeps a count and the tick, never the name", appointedNow().includes("Tess Appointee") && adm6.app.querySelector("#appointed-names-ok").checked === false && apAudit.appointedNames >= 1 && apAudit.namesConfirmed === true && !JSON.stringify(apAudit).includes("Tess"));
    apInput.value = "";
    byText(adm6.app, "button", "Save settings").click();
    await waitFor(() => !appointedNow().includes("Tess Appointee"), "the name cleared again");
    check("  clearing the name again needs no tick", !appointedNow().includes("Tess Appointee"));
    const unc = await openPage(NEWBIE);
    const ucalls = [];
    unc.delay((p) => { ucalls.push(p); return 0; });
    await unc.go("#/community/news");
    await settle();
    check("  a member without a confirmed character gets the standing notice and no News request", unc.app.textContent.includes("roster export has confirmed") && !ucalls.some((p) => p.startsWith("/api/news")));
    const EV = "news115upcomingEventAA";
    db.prepare("INSERT INTO community_events (id, op_id, title, starts_at, duration_min, ends_at, created_by, created_at, updated_at, retain_until) VALUES (?, ?, ?, ?, 120, ?, ?, ?, ?, ?)").run(EV, EV, "Zul'Gurub", now + 900, now + 900 + 7200, OTHER, now, now, now + 900 + 7200 + 30 * 86400);
    const news = await openPage(MEMBER);
    await news.go("#/community");
    await waitFor(() => !!byText(news.app, "h3", "News"), "the News card");
    const card = byText(news.app, "h3", "News").closest("a");
    check("  switched on: the News tab and the overview card with the official launch icon", texts(news.app, 'nav[aria-label="Community sections"] a').includes("News") && card.getAttribute("href") === "#/community/news" && !!card.querySelector('img[src="/static/wow/icon-launch.png"]'));
    await news.go("#/community/news");
    await waitFor(() => !!byText(news.app, "h2", "Site updates"), "the News page");
    check("  the News page: no notices yet; Olympus I full by the export of about the hour; no figures yet; the directory link; the beta's last day and the launch", frameOf(news, "Notices").textContent.includes("No notices right now.") && frameOf(news, "Olympus I").textContent.includes("Olympus I is full: the officers' roster export of about") && frameOf(news, "Olympus I").textContent.includes("counts 1000 of 1000 members") && frameOf(news, "The guild in figures").textContent.includes("No figures yet") && !!frameOf(news, "Leadership directory").querySelector('a[href="#/community/leadership"]') && /October/.test(frameOf(news, "The road to launch").textContent) && frameOf(news, "The road to launch").textContent.includes("21") && !!frameOf(news, "The road to launch").querySelector('[role="timer"]'));
    const rel = load("./site-news").RELEASE_NOTES[0];
    check("  the newest release note from the Worker, line by line", texts(frameOf(news, "Site updates"), "li").includes(rel.lines[0]) && frameOf(news, "Site updates").textContent.includes(`build ${rel.build}`));
    const want = db.prepare("SELECT id FROM community_events WHERE status = 'scheduled' AND starts_at > ? AND starts_at < ? ORDER BY starts_at, id LIMIT 5").all(nowS(), nowS() + 14 * 86400).map((r) => `#/community/calendar/${r.id}`);
    const upcoming = frameOf(news, "Coming up");
    check("  Coming up: the next scheduled events in 14 days, each a link to its calendar page, title and time only", !!upcoming && upcoming.querySelectorAll("a").map((a) => a.getAttribute("href")).join() === want.join() && want[0] === `#/community/calendar/${EV}` && upcoming.textContent.includes("Zul'Gurub · ") && upcoming.textContent.includes("120 minutes"), want);
    const noEv = await openPage(MEMBER, { COMMUNITY_FEATURES: "directory" });
    await noEv.go("#/community/news");
    await waitFor(() => !!byText(noEv.app, "h2", "Site updates"), "News without the calendar");
    check("  with the events feature off there is no Coming up frame", !frameOf(noEv, "Coming up") && !!frameOf(noEv, "Notices"));
    const lateOff = await openPage(MEMBER);
    db.prepare("UPDATE site_settings SET value = '0' WHERE key = 'newsOn'").run(); // switched off after the page loaded
    await lateOff.go("#/community/news");
    await waitFor(() => lateOff.app.textContent.includes("The News page is switched off."), "the news_off refusal");
    check("  switched off after the page loaded: the Worker's 404 news_off is said in words and nothing is shown", lateOff.app.textContent.includes("The News page is switched off.") && !frameOf(lateOff, "Notices"));
    db.prepare("UPDATE site_settings SET value = '1' WHERE key = 'newsOn'").run();
    // review of 3 Oct 2026: the member's other seat words, an empty calendar window and a directory never changed
    const newsFrameText = async (title) => { const pg = await openPage(MEMBER); await pg.go("#/community/news"); await waitFor(() => !!byText(pg.app, "h2", "Site updates"), "News"); const f = frameOf(pg, title); return f ? f.textContent : ""; };
    db.prepare("UPDATE roster_snapshots SET member_count = 995 WHERE id = ?").run(snap);
    let seatWords = await newsFrameText("Olympus I");
    check("(.115) News, Olympus I open: the free seats and the export's hour and count", seatWords.includes("Olympus I has 5 free seats: the officers' roster export of about") && seatWords.includes("counts 995 of 1000 members."), seatWords);
    db.prepare("UPDATE roster_snapshots SET trusted = 0 WHERE id = ?").run(snap);
    seatWords = await newsFrameText("Olympus I");
    check("  not trusted: 'not known right now', no count", seatWords.includes("Whether Olympus I has room is not known right now") && !seatWords.includes("of 1000"), seatWords);
    db.prepare("UPDATE roster_snapshots SET trusted = 1, exported_at = ?, received_at = ? WHERE id = ?").run(now - 7200, now - 7200, snap);
    const newsRefusal = Number(db.prepare("INSERT INTO audit (ts, actor, action, subject, details) VALUES (?, 'watcher', 'guild.full', 'Nia Six', '{}')").run(nowS() - 600).lastInsertRowid);
    seatWords = await newsFrameText("Olympus I");
    check("  an invite refused for space after that export: full by the refusal, with its hour and no count", seatWords.includes("Olympus I is full: the last invite was refused for lack of space (about ") && !seatWords.includes("of 1000"), seatWords);
    db.prepare("DELETE FROM audit WHERE id = ?").run(newsRefusal);
    db.prepare("UPDATE roster_snapshots SET member_count = 1000, exported_at = ?, received_at = ? WHERE id = ?").run(now - 3600, now - 3600, snap);
    const soon = db.prepare("SELECT id FROM community_events WHERE status = 'scheduled' AND starts_at > ? AND starts_at < ?").all(nowS() - 60, nowS() + 15 * 86400).map((r) => r.id);
    for (const id of soon) db.prepare("UPDATE community_events SET status = 'cancelled' WHERE id = ?").run(id);
    const leadRow = one("SELECT key FROM site_settings WHERE key = 'leadership'");
    if (leadRow) db.prepare("UPDATE site_settings SET key = 'leadership-kept-aside' WHERE key = 'leadership'").run();
    const emptyNews = await openPage(MEMBER);
    await emptyNews.go("#/community/news");
    await waitFor(() => !!byText(emptyNews.app, "h2", "Site updates"), "News with nothing coming up");
    check("  no scheduled event in the next 14 days: 'No events in the next 14 days.'; a directory never saved: 'Not changed yet.' and the link", frameOf(emptyNews, "Coming up").textContent.includes("No events in the next 14 days.") && frameOf(emptyNews, "Leadership directory").textContent.includes("Not changed yet.") && !!frameOf(emptyNews, "Leadership directory").querySelector('a[href="#/community/leadership"]'));
    for (const id of soon) db.prepare("UPDATE community_events SET status = 'scheduled' WHERE id = ?").run(id);
    if (leadRow) db.prepare("UPDATE site_settings SET key = 'leadership' WHERE key = 'leadership-kept-aside'").run();

    // the administrators' notices
    const issuedOf = (id) => Buffer.from(String(id).slice(0, 8), "base64url").readUIntBE(0, 6); // Codex's finding 5 (3 Oct 2026): the id's first eight characters are the time the Worker handed it out
    const newsOpened = nowS();
    await adm6.go("#/admin/news");
    await waitFor(() => !!byText(adm6.app, "button", "Post notice") && byText(adm6.app, "button", "Post notice").disabled === false, "the unlocked form");
    const fill = (t, b, d) => { adm6.app.querySelector("#f-news-title").value = t; adm6.app.querySelector("#f-news-body").value = b; if (d) adm6.app.querySelector("#f-news-days").value = String(d); };
    const count = (title) => one("SELECT COUNT(*) AS k FROM site_news_notices WHERE title = ?", title).k;
    const listed = (title) => { const t = byText(adm6.app, "h3", title); return t ? t.closest(".card") : null; };
    const dialogOf = () => adm6.document.body.querySelector("dialog");
    const kvOf = (root, label) => { const dt = root.querySelectorAll("dt").find((x) => x.textContent === label); if (!dt) return null; const kids = dt.parentNode.children; return kids[kids.indexOf(dt) + 1].textContent; };
    check("  the form: title, text, Show for (30 days by default), and the line not to name members", adm6.app.querySelector("#f-news-days").value === "30" && byText(adm6.app, "h2", "New notice").closest("section").textContent.includes("Write for the whole guild; do not name members. A notice is deleted when its time is up, at most 90 days after posting."));
    fill("Raid night moves", "First line\nsecond line\n\n<img src=x onerror=alert(1)>", 7);
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!listed("Raid night moves"), "the posted notice listed");
    const n1 = one("SELECT id, body, revision, retain_until - created_at AS life FROM site_news_notices WHERE title = 'Raid night moves'");
    check("  Post notice stores it through POST /api/admin/news: the text as typed, shown for 7 days; the list shows it and the form is fresh", !!n1 && n1.body === "First line\nsecond line\n\n<img src=x onerror=alert(1)>" && n1.life === 7 * 86400 && n1.revision === 1 && adm6.app.querySelector("#f-news-title").value === "" && !!byText(listed("Raid night moves"), "button", "Edit") && !!byText(listed("Raid night moves"), "button", "Delete"));
    check("  (.115, Codex's finding 5) the page posts under the id the Worker handed out when Admin → News opened: its time is that moment's", !!n1 && issuedOf(n1.id) >= newsOpened && issuedOf(n1.id) <= nowS(), n1 && issuedOf(n1.id), newsOpened);
    await news.go("#/community");
    await news.go("#/community/news");
    await waitFor(() => !!byText(news.app, "h3", "Raid night moves"), "the notice on News");
    const nCard = byText(news.app, "h3", "Raid night moves").closest(".card");
    check("  a confirmed member reads it: two paragraphs, the single line break kept, the markup as plain text, no image made", nCard.querySelectorAll("p").length === 3 && nCard.querySelectorAll("br").length === 1 && nCard.textContent.includes("<img src=x onerror=alert(1)>") && nCard.textContent.includes("Posted ") && frameOf(news, "Notices").querySelectorAll("img").length === 0);
    byText(listed("Raid night moves"), "button", "Edit").click();
    check("  Edit fills the form with the notice and its period", byText(adm6.app, "h2", "Change a notice") && adm6.app.querySelector("#f-news-title").value === "Raid night moves" && adm6.app.querySelector("#f-news-days").value === "7" && !!byText(adm6.app, "button", "Save changes") && !!byText(adm6.app, "button", "Cancel editing"));
    adm6.app.querySelector("#f-news-title").value = "Raid night moved";
    byText(adm6.app, "button", "Save changes").click();
    await waitFor(() => !!dialogOf(), "the save confirmation");
    check("  Save changes asks first, naming the time it will be shown until", dialogOf().textContent.includes("Save the changes to this notice?") && dialogOf().textContent.includes("counted from when it was first posted"));
    byText(dialogOf(), "button", "Save changes").click();
    await waitFor(() => !!listed("Raid night moved"), "the changed notice listed");
    const n1b = one("SELECT revision, retain_until - created_at AS life FROM site_news_notices WHERE id = ?", n1.id);
    check("  then POST /api/admin/news/update with the revision: revision 2, the period kept", n1b.revision === 2 && n1b.life === 7 * 86400 && listed("Raid night moved").textContent.includes("revision 2"));
    byText(listed("Raid night moved"), "button", "Edit").click();
    db.prepare("UPDATE site_news_notices SET revision = revision + 1 WHERE id = ?").run(n1.id); // another administrator changed it meanwhile
    adm6.app.querySelector("#f-news-body").value = "Changed text";
    byText(adm6.app, "button", "Save changes").click();
    await waitFor(() => !!dialogOf(), "the save confirmation");
    byText(dialogOf(), "button", "Save changes").click();
    await waitFor(() => adm6.app.textContent.includes("Someone changed this notice first"), "the stale refusal");
    check("  a stale revision is refused in words (409 stale_revision), the list reloaded, the other change intact", adm6.app.textContent.includes("Someone changed this notice first: reload it. The list below has been reloaded.") && one("SELECT body FROM site_news_notices WHERE id = ?", n1.id).body !== "Changed text" && listed("Raid night moved").textContent.includes("revision 3"));
    db.prepare("UPDATE site_news_notices SET created_at = created_at - 3 * 86400, updated_at = updated_at - 3 * 86400 WHERE id = ?").run(n1.id); // posted three days ago
    byText(listed("Raid night moved"), "button", "Edit").click();
    adm6.app.querySelector("#f-news-days").value = "1";
    byText(adm6.app, "button", "Save changes").click();
    await waitFor(() => !!dialogOf(), "the save confirmation");
    byText(dialogOf(), "button", "Save changes").click();
    await waitFor(() => adm6.app.textContent.includes("That period has already passed"), "the period refusal");
    check("  a period that has already passed since posting is refused in words (400 period_passed); nothing changed", adm6.app.querySelectorAll('[role="alert"]').some((e) => !e.hidden && e.textContent.includes("That period has already passed since the notice was posted.")) && one("SELECT revision FROM site_news_notices WHERE id = ?", n1.id).revision === 3);
    byText(adm6.app, "button", "Cancel editing").click();
    await waitFor(() => !!byText(adm6.app, "h2", "New notice"), "the fresh form");
    fill("x".repeat(81), "Too long a title", 3);
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => adm6.app.textContent.includes("The title needs 1 to 80 characters."), "the title refusal");
    check("  an 81-character title is refused in words (400), nothing cut and nothing stored", count("x".repeat(81)) === 0 && count("x".repeat(80)) === 0 && adm6.app.querySelector("#f-news-title").disabled === false);
    fill("Delete me", "Soon gone", 3);
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!listed("Delete me"), "the second notice");
    const del = one("SELECT id FROM site_news_notices WHERE title = 'Delete me'");
    byText(listed("Delete me"), "button", "Delete").click();
    await waitFor(() => !!dialogOf(), "the delete confirmation");
    check("  Delete asks first and states the real boundary (Codex's finding 5, 3 Oct 2026): a page opened earlier cannot post it again, a page posts only within 30 days of being opened, the id is kept 120 days from its first posting", dialogOf().textContent.includes("Delete this notice?") && dialogOf().textContent.includes("A page opened earlier cannot post it again: a page posts only within 30 days of being opened, and this notice's id is kept for 120 days from its first posting.") && !dialogOf().textContent.includes("cannot come back") && load("./site-news").NEWS_LIMITS.opIssueMaxAgeS === 30 * 86400 && load("./site-news").NEWS_LIMITS.opsKeepS === 120 * 86400);
    byText(dialogOf(), "button", "Delete").click();
    await waitFor(() => !listed("Delete me"), "the deletion");
    check("  then POST /api/admin/news/delete: the notice is gone, its operation record stays as the tombstone", count("Delete me") === 0 && !!one("SELECT 1 FROM site_news_ops WHERE id = ?", del.id));
    db.prepare("UPDATE site_news_notices SET retain_until = ? WHERE id = ?").run(nowS() - 1, n1.id); // its time is up; the cron has not run
    await adm6.go("#/admin/settings");
    await adm6.go("#/admin/news");
    await waitFor(() => !!byText(adm6.app, "h2", "New notice"), "Admin → News again");
    check("  a notice past its time leaves the list at once and is counted as awaiting the cleanup", !listed("Raid night moved") && kvOf(frameOf(adm6, "News"), "Past their time, awaiting the cleanup") === "1");

    // lost answers: the operation is frozen; Retry the same or Check, never a second notice
    fill("Lost answer", "Body", 3);
    adm6.drop((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm6.app, "button", "Retry the same"), "the lost-answer notice");
    check("  a lost answer to Post notice: Retry the same and Check, the form locked, the Worker stored it once", !!byText(adm6.app, "button", "Check whether it was stored") && adm6.app.querySelector("#f-news-title").disabled === true && count("Lost answer") === 1);
    adm6.drop(null);
    byText(adm6.app, "button", "Check whether it was stored").click();
    await waitFor(() => !byText(adm6.app, "button", "Retry the same") && !!listed("Lost answer"), "the check");
    check("  Check whether it was stored reports it, and the page moves on with one row", adm6.document.body.textContent.includes("It was stored.") && count("Lost answer") === 1);
    fill("Retried", "Body", 3);
    adm6.drop((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm6.app, "button", "Retry the same"), "the second lost answer");
    adm6.drop(null);
    byText(adm6.app, "button", "Retry the same").click();
    await waitFor(() => !byText(adm6.app, "button", "Retry the same") && !!listed("Retried"), "the retry");
    check("  Retry the same is answered with the stored notice (a replay), never a second one", adm6.document.body.textContent.includes("This notice was already posted from this page.") && count("Retried") === 1);
    fill("Gone meanwhile", "Body", 3);
    adm6.drop((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm6.app, "button", "Retry the same"), "the third lost answer");
    adm6.drop(null);
    db.prepare("DELETE FROM site_news_notices WHERE title = 'Gone meanwhile'").run(); // another administrator deleted it; its operation record stays
    byText(adm6.app, "button", "Check whether it was stored").click();
    await waitFor(() => adm6.document.body.textContent.includes("No live notice is shown under this form's id"), "the deleted notice absent from the live list");
    check("  a deleted notice absent from the live list proves no historical absence: the exact retry and locked payload stay", !!byText(adm6.app, "button", "Retry the same") && adm6.app.querySelector("#f-news-title").disabled === true && adm6.app.querySelector("#f-news-title").value === "Gone meanwhile" && !adm6.document.body.textContent.includes("Nothing was stored under this form's id"));
    byText(adm6.app, "button", "Retry the same").click();
    await waitFor(() => adm6.app.textContent.includes("it is not posted again"), "the deleted refusal");
    check("  a retry after the notice was deleted is refused in words (409 deleted) and posts nothing; a fresh form follows", adm6.app.textContent.includes("That notice was deleted or its time ran out; it is not posted again.") && count("Gone meanwhile") === 0 && adm6.app.querySelector("#f-news-title").value === "" && !byText(adm6.app, "button", "Retry the same"));
    fill("Conflicted", "Body", 3);
    adm6.drop((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm6.app, "button", "Retry the same"), "the fourth lost answer");
    adm6.drop(null);
    db.prepare("UPDATE site_news_notices SET op_hash = 'another' WHERE title = 'Conflicted'").run(); // the id now holds a different notice
    byText(adm6.app, "button", "Retry the same").click();
    await waitFor(() => adm6.app.textContent.includes("A different notice was already posted under this operation"), "the conflict refusal");
    check("  a retry whose id holds a different notice is refused in words (409 op_conflict); still one row", count("Conflicted") === 1);
    // review of 3 Oct 2026: the change and delete paths when an answer is lost or refused, a create lost BEFORE the Worker,
    // and a retry after the notice's time ran out; from a second administrator's page, so the first one's write limit (20 a
    // minute, on the real clock here) is left for the checks below
    const ADMIN2 = "472099715253796866";
    siteUser(ADMIN2, { global_name: "Ada" });
    const adm7 = await openPage(ADMIN2, { SITE_ADMINS: `${STAFF},${ADMIN2}` });
    const listed7 = (title) => { const t = byText(adm7.app, "h3", title); return t ? t.closest(".card") : null; };
    const dialog7 = () => adm7.document.body.querySelector("dialog");
    const fill7 = (t, b, d) => { adm7.app.querySelector("#f-news-title").value = t; adm7.app.querySelector("#f-news-body").value = b; if (d) adm7.app.querySelector("#f-news-days").value = String(d); };
    const reopenNews = async () => { await adm7.go("#/admin/settings"); await adm7.go("#/admin/news"); await waitFor(() => !!byText(adm7.app, "h2", "New notice"), "Admin → News again"); };
    const confirmSave = async () => { byText(adm7.app, "button", "Save changes").click(); await waitFor(() => !!dialog7(), "the save confirmation"); byText(dialog7(), "button", "Save changes").click(); };
    await reopenNews();
    byText(listed7("Retried"), "button", "Edit").click();
    adm7.app.querySelector("#f-news-body").value = "Retried, then changed";
    adm7.drop((p) => p === "/api/admin/news/update");
    await confirmSave();
    await waitFor(() => adm7.app.textContent.includes("The answer was lost, so the notices were re-read"), "the lost change");
    adm7.drop(null);
    const retried = one("SELECT revision, body FROM site_news_notices WHERE title = 'Retried'");
    check("  a lost answer to Save changes: the notices are re-read, the page says to check before changing again, the form is fresh; the Worker saved it once", retried.revision === 2 && retried.body === "Retried, then changed" && listed7("Retried").textContent.includes("revision 2") && adm7.app.querySelector("#f-news-title").value === "" && !!byText(adm7.app, "h2", "New notice"));
    await reopenNews();
    byText(listed7("Retried"), "button", "Delete").click();
    await waitFor(() => !!dialog7(), "the delete confirmation");
    adm7.drop((p) => p === "/api/admin/news/delete");
    byText(dialog7(), "button", "Delete").click();
    await waitFor(() => adm7.app.textContent.includes("The answer was lost, so the notices were re-read") && !listed7("Retried"), "the lost delete");
    adm7.drop(null);
    check("  a lost answer to Delete: the same words, and the re-read list shows it gone (the Worker deleted it once)", count("Retried") === 0);
    await reopenNews();
    db.prepare("UPDATE site_news_notices SET revision = revision + 1 WHERE title = 'Lost answer'").run(); // another administrator changed it
    byText(listed7("Lost answer"), "button", "Delete").click();
    await waitFor(() => !!dialog7(), "the delete confirmation");
    byText(dialog7(), "button", "Delete").click();
    await waitFor(() => adm7.app.textContent.includes("Someone changed this notice first: reload it. The list below has been reloaded."), "the refused delete");
    check("  a refused delete (409 stale_revision) is said in words, the list reloaded with the current revision, the notice kept", count("Lost answer") === 1 && listed7("Lost answer").textContent.includes("revision 2"));
    byText(listed7("Lost answer"), "button", "Edit").click();
    db.prepare("DELETE FROM site_news_notices WHERE title = 'Lost answer'").run(); // another administrator deleted it meanwhile
    adm7.app.querySelector("#f-news-body").value = "Too late";
    await confirmSave();
    await waitFor(() => adm7.app.textContent.includes("That notice no longer exists. The list below has been reloaded."), "the not_found refusal");
    check("  saving a notice deleted meanwhile (404 not_found) is said in words and the list reloaded without it", !listed7("Lost answer") && count("Lost answer") === 0);
    fill7("Never sent", "Body", 3);
    adm7.before((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm7.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm7.app, "button", "Retry the same"), "the create lost before the Worker");
    adm7.before(null);
    byText(adm7.app, "button", "Check whether it was stored").click();
    await waitFor(() => adm7.document.body.textContent.includes("No live notice is shown under this form's id"), "the live-list check without historical proof");
    check("  a create lost before it reached the Worker: the live-list check preserves uncertainty and the locked exact retry", count("Never sent") === 0 && !!byText(adm7.app, "button", "Retry the same") && adm7.app.querySelector("#f-news-title").disabled === true && adm7.app.querySelector("#f-news-title").value === "Never sent");
    byText(adm7.app, "button", "Retry the same").click();
    await waitFor(() => !!listed7("Never sent"), "the notice sent again");
    check("  sent again from the same form, it is posted once", count("Never sent") === 1);
    fill7("Expiring", "Body", 1);
    adm7.drop((p, init) => p === "/api/admin/news" && init.method === "POST");
    byText(adm7.app, "button", "Post notice").click();
    await waitFor(() => !!byText(adm7.app, "button", "Retry the same"), "the lost answer before the expiry");
    adm7.drop(null);
    db.prepare("UPDATE site_news_notices SET created_at = created_at - 86400, updated_at = updated_at - 86400, retain_until = ? WHERE title = 'Expiring'").run(nowS() - 1); // its time ran out before the retry
    byText(adm7.app, "button", "Retry the same").click();
    await waitFor(() => adm7.app.textContent.includes("That notice's time is up; it is no longer shown."), "the expired refusal");
    check("  a retry after the notice's time ran out is refused in words (409 expired): the page reloads for a new notice and nothing is posted again", adm7.app.textContent.includes("The page has been reloaded for a new notice.") && count("Expiring") === 1 && adm7.app.querySelector("#f-news-title").value === "" && !byText(adm7.app, "button", "Retry the same"));
    // Codex's finding 5 (3 Oct 2026): a form whose id the Worker handed out 31 days ago. The request is rewritten on its way
    // to the Worker into exactly what such a page sends (its id's time 31 days back); the Worker stores nothing and the
    // page starts again with a fresh id.
    fill7("From an old form", "Body", 3);
    const oldStamp = (() => { const b = Buffer.alloc(6); b.writeUIntBE(nowS() - 31 * 86400, 0, 6); return b.toString("base64url"); })();
    let sentId = null;
    adm7.before((p, init) => { if (p === "/api/admin/news" && init.method === "POST") { const b = JSON.parse(init.body); b.id = oldStamp + b.id.slice(8); sentId = b.id; init.body = JSON.stringify(b); } return false; });
    byText(adm7.app, "button", "Post notice").click();
    await waitFor(() => adm7.app.textContent.includes("This form can no longer post"), "the stale_page refusal");
    adm7.before(null);
    check("  (.115) a form older than 30 days is refused in words (409 stale_page): nothing stored under its id, and the page reloads for a new notice", adm7.app.textContent.includes("This form can no longer post: a form posts only within 30 days of being opened. Nothing was posted. The page has been reloaded for a new notice.") && !!sentId && count("From an old form") === 0 && !one("SELECT 1 FROM site_news_ops WHERE id = ?", sentId) && adm7.app.querySelector("#f-news-title").value === "" && !byText(adm7.app, "button", "Retry the same"));
    fill7("From the fresh form", "Body", 3);
    byText(adm7.app, "button", "Post notice").click();
    await waitFor(() => !!listed7("From the fresh form"), "the post from the reloaded form");
    const freshRow = one("SELECT id FROM site_news_notices WHERE title = 'From the fresh form'");
    check("  the reloaded form posts once, under a new id handed out just now", count("From the fresh form") === 1 && !!freshRow && freshRow.id.slice(8) !== sentId.slice(8) && nowS() - issuedOf(freshRow.id) <= 5 && issuedOf(freshRow.id) <= nowS());
    const filler = [];
    for (let i = one("SELECT COUNT(*) AS k FROM site_news_notices WHERE retain_until > ?", nowS()).k; i < 20; i++) {
      const id = `filler${i}`.padEnd(22, "x");
      filler.push(id);
      db.prepare("INSERT INTO site_news_notices (id, op_hash, title, body, revision, created_at, updated_at, retain_until) VALUES (?, 'h', ?, 'b', 1, ?, ?, ?)").run(id, `Filler ${i}`, now, now, now + 86400);
    }
    fill("One too many", "Body", 3);
    byText(adm6.app, "button", "Post notice").click();
    await waitFor(() => adm6.app.textContent.includes("At most 20 notices can be shown at once"), "the too_many refusal");
    check("  a 21st live notice is refused in words (409 too_many); nothing stored", count("One too many") === 0);
    for (const id of filler) db.prepare("DELETE FROM site_news_notices WHERE id = ?").run(id);

    // the figures, the countdown's end, a lapsed standing and the read limit
    const figures = (roster, since) => db.prepare("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('newsFigures', ?, ?, NULL) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ v: 1, asOf: now - 600, latestId: snap, dayBaseId: null, weekBaseId: null, countingSince: since, roster, applications: { day: { firstSaved: "few", decided: 0 }, week: { firstSaved: 6, decided: "few" } } }), now);
    figures({ day: null, week: null }, now - 5000);
    const fig1 = await openPage(MEMBER);
    await fig1.go("#/community/news");
    await waitFor(() => !!byText(fig1.app, "h2", "The guild in figures"), "the figures");
    const fBox = frameOf(fig1, "The guild in figures");
    check("  the figures before a day of roster history: 'Not enough roster history yet; counting began', applications with 'fewer than 5' for 1 to 4", fBox.textContent.includes("Not enough roster history yet; counting began") && kvOf(fBox, "Last day") === "fewer than 5" && fBox.textContent.includes("New applications (first saved)") && fBox.textContent.includes("Decisions saved") && fBox.querySelectorAll("dd").map((x) => x.textContent).join() === "fewer than 5,6,0,fewer than 5" && fBox.textContent.includes("As of "));
    figures({ day: { joined: 2, left: 1 }, week: null }, now - 90000);
    const fig2 = await openPage(MEMBER);
    await fig2.go("#/community/news");
    await waitFor(() => !!byText(fig2.app, "h2", "The guild in figures"), "the figures again");
    check("  with a day of history: joined and left for the last day; the week says it has not enough history yet", kvOf(frameOf(fig2, "The guild in figures"), "Last day") === "2 joined, 1 left" && kvOf(frameOf(fig2, "The guild in figures"), "Last 7 days") === "not enough history yet");
    const launchRow = one("SELECT value FROM site_settings WHERE key = 'launchAt'");
    db.prepare("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('launchAt', ?, ?, NULL) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(now - 60), now);
    const live5 = await openPage(MEMBER);
    await live5.go("#/community/news");
    await waitFor(() => !!byText(live5.app, "h2", "The road to launch"), "the road to launch");
    check("  after the launch the countdown shows its done text", frameOf(live5, "The road to launch").textContent.includes("Live now"));
    if (launchRow) db.prepare("UPDATE site_settings SET value = ? WHERE key = 'launchAt'").run(launchRow.value); else db.prepare("DELETE FROM site_settings WHERE key = 'launchAt'").run();
    const lapse = await openPage(READER);
    db.prepare("UPDATE characters SET status = 'unbound' WHERE discord_id = ?").run(READER); // the roster no longer confirms the character after the page loaded
    await lapse.go("#/community/news");
    await waitFor(() => lapse.app.textContent.includes("roster export has confirmed"), "the standing notice after the refusal");
    check("  a confirmation lost after the page loaded: the 403 re-reads the community context and the page shows the standing notice, no News", lapse.app.textContent.includes("roster export has confirmed") && !byText(lapse.app, "h2", "Notices"));
    db.prepare("UPDATE characters SET status = 'member' WHERE discord_id = ?").run(READER);
    const readerCookie = await cookieFor(READER);
    for (let i = 0; i < 30; i++) await indexMod.default.fetch(new Request("https://guild.example/api/news", { headers: { Cookie: readerCookie, Origin: "https://guild.example", "X-Olympus": "2" } }), env(), ctx);
    const slow = await openPage(READER);
    await slow.go("#/community/news");
    await waitFor(() => slow.app.textContent.includes("Too many pages in one minute"), "the read limit");
    check("  too many reads in a minute (429) are said in words", slow.app.textContent.includes("Too many pages in one minute. Wait a moment, then carry on.") && !byText(slow.app, "h2", "Notices"));

    // ---- the role copy, as the Roles page shows it. .115's rewrite of the lines was withdrawn on 3 Oct 2026 (the owner's
    // answer 6: the in-game ladder is the ten ranks the .46 lines describe); the check of the page path stays.
    const roles5 = await openPage(null);
    await roles5.go("#/roles");
    await waitFor(() => !!roles5.app.querySelector("#role-treasurer"), "the Roles page");
    const fact = (key) => { const dl = roles5.app.querySelector(`#role-${key} dl`); return dl ? kvOf(dl, "In game") || "" : ""; };
    const gameLine = (key) => load("./site-data").POSITIONS.find((x) => x.key === key).info.game;
    check("(.115) the Roles page shows each role's In game fact as site-data.ts has it: the Treasurer and Raider ranks; Class Lead has no rank of its own", ["treasurer", "raider", "class_lead"].every((k) => fact(k) === gameLine(k)) && fact("treasurer").startsWith("The Treasurer rank") && fact("raider").startsWith("The Raider rank") && fact("class_lead").startsWith("No rank of its own"), fact("treasurer"), fact("raider"));

    db.prepare("DELETE FROM invite_queue WHERE id = ?").run(queueRow);
    db.prepare("DELETE FROM roster_snapshots WHERE id = ?").run(snap);
    db.prepare("DELETE FROM community_events WHERE id = ?").run(EV);
  }

  console.log("\n== standing and identity ==");
  const unconfirmed = await openPage(STAFF);
  await unconfirmed.go("#/community/directory");
  await settle();
  check("a signed-in member without a roster-confirmed character gets the standing notice instead of the directory", unconfirmed.app.textContent.includes("roster export has confirmed") && !byText(unconfirmed.app, "h2", "Member directory"));
  const denied = await openPage(DENIED);
  await denied.go("#/data");
  await settle();
  check("a denied identity still reaches Your data: the download link and the private request form are theirs", !!denied.app.querySelector('a[href="/api/me/export"]') && denied.app.textContent.includes("Your registration is denied") && !!denied.app.querySelector('a[href="#/request"]'));
  await denied.go("#/community");
  await settle();
  check("  but the community pages stay the denied view", denied.app.textContent.includes("Registration denied") && !byText(denied.app, "h2", "Community"));
  const nothing = await openPage(MEMBER, { COMMUNITY_FEATURES: "" });
  check("with every community flag off: no Community in the top bar, no private-request link", !texts(nothing.app, "nav.nav a").includes("Community") && !nothing.app.querySelector('.footer-links a[href="#/request"]'));
  await nothing.go("#/community");
  await settle();
  check("  and the Community page says it is not switched on", nothing.app.textContent.includes("not switched on yet"));
  check("the page script writes no markup: every text goes through textContent (no innerHTML, outerHTML or insertAdjacentHTML assignment anywhere)", !/\.innerHTML\s*[=+]|\.outerHTML\s*=|insertAdjacentHTML/.test(APP_JS));

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
