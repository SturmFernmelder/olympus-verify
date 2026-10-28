/* Olympus guild site: the page script (build .46). Plain JavaScript, no libraries, nothing loaded from elsewhere.
   Everything a person typed is put on the page with textContent (the h() helper below); there is no innerHTML.
   The Worker validates every save again, so nothing here is trusted. */
(() => {
  "use strict";

  const BOOT = (() => {
    try { return JSON.parse(document.getElementById("boot").textContent || "{}"); } catch { return {}; }
  })();
  const S = Object.assign({ signedIn: false, meta: null, settings: null }, BOOT);
  const skew = BOOT.now ? BOOT.now * 1000 - Date.now() : 0; // the server's clock drives every countdown
  const nowMs = () => Date.now() + skew;
  const nowSec = () => Math.floor(nowMs() / 1000);
  const app = document.getElementById("app");
  let timers = [];
  let disposeTool = null;
  let navigationGuard = null;
  let disposeGovernancePrint = null;
  let disposeOrganization = null;
  let disposeSeatsNotice = null;
  let disposeArmyCapacity = null;
  const appointmentReaders = new Set(); // View disposers only; never a cross-route identity cache.
  let appointmentPendingRead = null; // Same-view in-flight collection only; no resolved identity cache.
  const dirtyKeys = new Set(); // forms on the page with unsaved changes
  const PICK_KEY = "olympus.pick"; // sessionStorage: the role "Sign in to apply" was pressed for (see the end)
  let gameCursor = true;
  try { gameCursor = sessionStorage.getItem("olympus.gameCursor") !== "off"; } catch { /* A blocked preference store keeps native CSS fallbacks. */ }
  document.documentElement.setAttribute("data-game-cursor", gameCursor ? "on" : "off");

  // ---------------------------------------------------------------- DOM
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else if (k === "checked") el.checked = !!v;
        else if (k === "selected") el.selected = !!v;
        else if (k === "disabled") el.disabled = !!v;
        else if (k === "hidden") el.hidden = !!v;
        else if (k === "href" || k === "src") {
          const s = String(v);
          // Links point here, at a fragment, or at https. .112: images load from this site only (the official game art and
          // the crest), never from another host: an img src must be a root-relative path.
          if (k === "src" ? /^\/(?!\/)/.test(s) : /^(#|\/(?!\/)|https:\/\/)/.test(s)) el.setAttribute(k, s);
        } else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    for (const k of Array.isArray(kids) ? kids.flat(9) : [kids]) {
      if (k === null || k === undefined || k === false || k === "") continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  // ---------------------------------------------------------------- the game's art
  const art = (name) => `/static/wow/${name}.png`;
  const icon = (name, cls = "", alt = "") => h("img", { class: "ico" + (cls ? " " + cls : ""), src: art(name), alt, width: "32", height: "32" });
  const classIcon = (key, cls = "s") => (M().classes.some((c) => c.key === key) ? icon("class-" + key, cls) : null);
  const roleIcon = (key) => h("img", { class: "role-ico", src: art("role-" + ({ tank: "tank", healer: "healer", dps: "dps" }[key] || "flex")), alt: "", width: "24", height: "24" });
  /** Display official client imagery for an account; identity/session/API avatar data is unchanged. */
  const accountArt = (person = {}) => {
    const key = person.class || person.classKey || person.mainClass;
    return art(M().classes.some((c) => c.key === key) ? "class-" + key : "pos-member");
  };
  const discordIdentity = (person = {}) => {
    const display = person.nick || person.displayName || person.username || "";
    return person.username && person.username.trim().toLowerCase() !== display.trim().toLowerCase() ? `${display} (${person.username})` : display;
  };
  // Owner directive, 23 Oct 2026: authenticated applicant, directory and account-search portraits use the
  // same closed Discord CDN guard as one's own chrome. Keep class art beside applicant portraits and never
  // accept an arbitrary image host. Missing, failed or unrecognised pictures retain the local fallback.
  // .114 (Viktor, 2 Oct 2026): the original exception to "images from this site only": the signed-in member's own Discord picture
  // in their own header and welcome panel. Only an avatar address on Discord's picture host passes (the Worker's avatarUrl: a profile picture, a
  // server picture or Discord's default one; the page's CSP allows that host and no other). Anything else, or a picture that
  // fails to load, shows the official Member icon. Set with setAttribute here on purpose: h() keeps its root-relative rule for
  // other image attributes on the site; recommendation results now use the same closed CDN guard.
  const DISCORD_AVATAR = /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d{17,20}\/(?:a_)?[0-9a-f]{32}\.png\?size=64|guilds\/\d{17,20}\/users\/\d{17,20}\/avatars\/(?:a_)?[0-9a-f]{32}\.png\?size=64|embed\/avatars\/[0-5]\.png)$/;
  function discordAvatar(user, attributes = {}) {
    const fallback = accountArt(user || {});
    const img = h("img", { ...attributes, src: fallback, alt: "", referrerpolicy: "no-referrer" });
    const url = user && typeof user.avatarUrl === "string" ? user.avatarUrl : "";
    if (DISCORD_AVATAR.test(url)) {
      img.addEventListener("error", () => { if (img.getAttribute("src") !== fallback) img.setAttribute("src", fallback); });
      img.setAttribute("src", url);
    }
    return img;
  }
  function ownAvatar(user) { return discordAvatar(user); }
  /** The icon for a position or role key: Class Lead shows its class, NA and EU raid roles share one. */
  function posIcon(key, cls = "") {
    if (key.startsWith("class_lead:")) return M().classes.some((c) => c.key === key.slice(11)) ? icon("class-" + key.slice(11), cls) : icon("pos-unknown", cls);
    const office = (M().appointments || []).find(item => item.key === key);
    if (office && /^office_[0-9]{2}$/.test(key)) return icon("pos-" + (office.tier === "leader" ? "guild_master" : office.tier === "high_council" ? "co_gm" : office.tier === "officer_corps" ? "officer" : "community"), cls);
    if (office && /^rank_[a-z_]+$/.test(key)) { const rank = key.slice(5); return icon("pos-" + ({guild_master:"guild_master",high_council:"co_gm",treasurer:"treasurer",officer:"officer",officer_alt:"officer",raid_leader:"raid_leader",veteran:"raider",raider:"raider",member:"member",alt:"member",initiate:"member"}[rank] || "unknown"), cls); }
    const base = key.replace(/_(na|eu)$/, "");
    return icon("pos-" + (["co_gm", "guild_master", "officer", "raid_leader", "raid_assist", "class_lead", "recruitment", "community", "leveling", "pvp_leader", "liaison", "loot_council", "treasurer", "professions", "moderator", "raider", "pvp_team", "member"].includes(base) ? base : "unknown"), cls);
  }

  // ---------------------------------------------------------------- formatting
  const DT = (opts) => new Intl.DateTimeFormat(undefined, opts);
  const fmtDateTime = (t) => (t ? DT({ weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(t * 1000)) : "—");
  const fmtDay = (t) => (t ? DT({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(t * 1000)) : "—");
  const fmtShort = (t) => (t ? DT({ day: "numeric", month: "short", year: "numeric" }).format(new Date(t * 1000)) : "—");
  const fmtPacific = (t, withTime = true) =>
    new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric" }, withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {})).format(new Date(t * 1000));
  function ago(t) {
    if (!t) return "never";
    const d = nowSec() - t;
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + " min ago";
    if (d < 86400) return Math.floor(d / 3600) + " h ago";
    if (d < 86400 * 60) return plural(Math.floor(d / 86400), "day") + " ago";
    return fmtShort(t);
  }
  const days = (t) => (t ? Math.floor((nowSec() - t) / 86400) : null);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const listText = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const M = () => S.meta || { positions: [], classes: [], roles: [], regions: [], hours: [], voice: [], questions: [], professions: [], ballots: [], limits: {}, avail: { reference: 0, prime: { na: [], eu: [], min: 3 } } };

  // .199: one statutory bridge, served by the same catalogue as server validation.
  const ranks199 = () => M().rankHierarchy || [];
  const tracks199 = () => M().applicationTracks || [];
  const offices199 = () => M().appointments || [];
  const office199 = key => offices199().find(row => row.key === key);
  const track199 = id => tracks199().find(row => row.id === id);
  // .200: presentation and new Patron requests are paused unless an admin explicitly enables them.
  const royalWritsVisible200 = () => S.settings?.royalWritsOn === true;
  // Membership-form adapters never turn separate artisan offices into one seat.
  const applicationLeadershipSeat199 = row => (row?.historicalApplicationEligible === true || !!row?.applicationEligible) && ["officer", "high_council"].includes(row.applicationTrack);
  const applicationSeatKeys199 = key => { const row = office199(key); return applicationLeadershipSeat199(row) ? row.applicationRoleKeys || [] : []; };
  const applicationParent199 = key => offices199().find(row => /^office_\d{2}$/.test(row.key) && applicationLeadershipSeat199(row) && (row.applicationRoleKeys || []).includes(key));
  function displayHolder(key) {
    const assignments = S.settings?.appointed || {};
    const read = k => Object.prototype.hasOwnProperty.call(assignments, k) ? assignments[k] : "";
    const parent = applicationParent199(key), keys = applicationSeatKeys199(key);
    const value = read(key) || (parent && parent.key !== key ? read(parent.key) : "") || (keys.length && !keys.includes(key) && keys.every(k => read(k)) ? (keys.length === 1 ? read(keys[0]) : "All related seats filled") : "") || (key === "treasurer" ? read("office_86") : key === "office_86" ? read("treasurer") : "");
    if (!value) return "";
    if (!S.signedIn || S.denied || !communityReader()) return "Filled; identity unavailable";
    if (appointmentPointer(value)) return "Appointed member";
    return typeof value === "string" && value.length <= 40 && !/[\u0000-\u001f\u007f<>]/.test(value) && !/^[0-9]{17,20}$/.test(value.trim()) ? value : "Name withheld";
  }
  function officeBadge199(row) {
    return row?.nativeRankOrdinal ? h("span", { class: "badge rank-office199", text: `${row.tierLabel} · Rank ${row.nativeRankOrdinal} ${row.nativeRankName} · Title ${(row.codexTitles || []).join(" / ")}` }) : null;
  }
  function applicationBadges199(intent) {
    const t = track199(intent?.applicationTrack), o = office199(intent?.targetOffice);
    if (!t || (intent.targetOffice && (!o || o.applicationTrack !== t.id))) return null;
    return h("div", { class: "role-tags application-intent199", "data-application-track": t.id }, h("span", { class: "badge blue", text: t.label }), o ? h("span", { class: "badge", "data-target-office": o.key, text: o.applicationLabel || o.label }) : null);
  }
  function goldBanner199() {
    const policy = M().royalWritPolicy || {};
    return noticeBox("info", "pos-treasurer", h("p", { class: "gold-policy199", text: policy.banner || "100% World of Warcraft: Forever in-game gold only, via in-game mail/trade to Fernmelder. Zero real-world money, USD, Twitch subscriptions or crypto; all addons remain free with no paid addon gating. Officer review and Discord Trust & Safety rules apply." }));
  }
  function writsPanel199(page, { checklist = false, keys = null } = {}) {
    if (!royalWritsVisible200()) return null;
    const policy = M().royalWritPolicy || {}, rows = (M().royalWrits || []).filter(row => keys ? keys.includes(row.key) : ["roles", "governance", "community/workshop", "vote", "news", "admin"].includes(page) || (row.pages || []).includes(page));
    return h("section", { class: "royal-writs199", "data-royal-writ-page": page }, goldBanner199(),
      h("details", { class: "card", open: checklist }, h("summary", { text: checklist ? "Stockades Appeals & Royal Pardons — operator reference" : "Schedule of Royal Writs, Indulgences & Guild Services" }),
        h("p", { class: "muted small", text: policy.review }),
        h("div", { class: "roles-grid" }, rows.map(row => h("article", { class: "card writ199", "data-writ-key": row.key }, h("h3", { text: row.label }), h("p", null, h("strong", { text: `${row.goldMin}${row.goldMax === row.goldMin ? "" : "–" + row.goldMax}g` }), " · ", row.term), h("p", { text: row.outcome }), h("p", { class: "muted small", text: row.limits })))),
        h("p", { class: "muted small", text: policy.dispatch }), h("p", { class: "muted small", text: policy.consent }),
        checklist ? h("div", { class: "stockades-checklist199" }, h("h3", { text: "Manual case checklist" }), h("p", { text: policy.stockadesStatus }), h("ol", null, (M().stockadesChecklist || []).map(step => h("li", { text: typeof step === "string" ? step : step.text || step.label || step.action })))) : null,
        h("a", { href: "#/governance", text: "Read Titles II–V and the governing review procedure" })));
  }
  function hierarchyPanel199() {
    const directory = roleDirectory203();
    return frame("The exact 10-rank Olympus In-Game Hierarchy", h("a", { class: "btn small", href: "#/roles/rosetta-stone", text: "Open the Rosetta Stone" }),
      h("a", { class: "btn small", href: "#/organization/alliance-overview", text: "Explore the Alliance organization" }),
      h("p", { text: "Leader and High Council govern; the Officer Corps administers; members and specialists build the guild. Co-Guild Master and Treasurer are appointments, not extra native ranks. Actual game permissions are set separately by the Guild Master." }),
      directory ? h("ol", { class: "role-ranks203" }, directory.ranks.map(rank => {
        const source = offices199().find(row => row.group === "native" && row.nativeSlot === rank.nativeSlot);
        return h("li", null, h("a", { href: "#/roles/" + encodeURIComponent(source?.key || rank.familyKey), "data-rank-family203": rank.familyKey, "data-native-slot": String(rank.nativeSlot) },
          posIcon(source?.key || familyPrimary203(directory,rank.familyKey),"s"), h("span", { class: "role-rank-number203", text: String(rank.nativeRankOrdinal) }), h("span", { text: rank.label })), h("span", { class: "muted small", text: `slot ${rank.nativeSlot}` }));
      })) : h("p", { class: "muted", text: "The linked rank directory is unavailable. No rank or appointment has been changed." }));
  }
  function rosettaPanel199(open = false) {
    const headings = ["In-Game Rank Number & Name", "Tier & Statutory Codex Title", "Organization Department & Branch Offices", "Discord Role & Portal Access", "How to Attain It"];
    return h("details", { class: "card rosetta199", id: "role-rosetta-stone", tabindex: "-1", open }, h("summary", { text: "Olympus Role & Rank Rosetta Stone" }),
      h("p", { text: "96 stable offices and 132 assignable keys share this bridge, including the dedicated High Council Head of Trading & Markets. Display classification and an application do not confer an office, game rank, Discord role or portal access. Olympus Link remains OFF; /oly discord is a future qualified verification path, not a currently active admission shortcut." }),
      h("table", { class: "rosetta-table199" }, h("thead", null, h("tr", null, headings.map(text => h("th", { scope: "col", text })))), h("tbody", null, ranks199().map(rank => {
        const rows = offices199().filter(row => row.nativeSlot === rank.nativeSlot), tiers = [...new Set(rows.map(row => row.tierLabel))], titles = [...new Set(rows.flatMap(row => row.codexTitles || []))];
        const cells = [h("strong", { text: `Rank ${rank.nativeRankOrdinal} ${rank.name}` }), h("div", null, tiers.join(" / "), h("br"), h("a", { href: "#/governance", text: `Title ${titles.join(" / ") || "I–V"}` })),
          h("details", null, h("summary", { text: `${rows.length} mapped office / assignment keys` }), h("ul", null, rows.map(row => h("li", null, h("a", { href: "#/organization/" + encodeURIComponent(row.key), text: row.applicationLabel || row.label }), " · ", row.department)))),
          h("p", { text: [...new Set(rows.map(row => row.discordPortal))].join(" ") || "Olympus Guild Member; cosmetic tithe tiers and Broadcaster / Stream Shield are separate consented labels and capabilities." }),
          h("p", null, rank.nativeSlot < 5 ? "Reserved appointment — no applications for Leader, High Council or Officer Corps seats." : "Membership, raiding and artisan work use the role directory; other standing and titles require their own review. ", rank.nativeSlot >= 5 ? h("a", {href:"#/vote",text:"Explore the role directory"}) : null, " In-game verification via /oly discord remains subject to separate Link activation.")];
        return h("tr", { "data-rank-crosswalk": String(rank.nativeRankOrdinal) }, cells.map((cell, i) => h("td", { "data-column": headings[i] }, cell)));
      }))));
  }
  function officeTierPanels199() {
    return [["leader", "Leader & Royal Appointments"], ["high_council", "High Council Roles"], ["officer_corps", "Officer Corps Roles"], ["member_specialist", "Member & Specialist Roles"]].map(([tier, label]) => frame(label, null,
      h("div", { class: "roles-grid" }, offices199().filter(row => row.tier === tier).map(row => {
        const holder = displayHolder(row.key), available = row.applicationEligible && !row.reservedSeat201 && !holder && S.settings?.applicationsOpen !== false;
        return h("article", { class: "card office-seat199", "data-office-key": row.key }, h("h3", { text: row.applicationLabel || row.label }), officeBadge199(row),
          h("p", { class: "muted small", text: row.department }), holder ? h("p", null, appointmentLabelNode(row.key, holder, false, true)) : h("p", { class: "muted small", text: "No appointment recorded here; availability requires current leadership review." }),
          row.aliasOf ? h("p", { class: "muted small", text: `Assignment alias of ${row.aliasOf}; no additional native-rank slot.` }) : null,
          row.reservedSeat201 ? h("p", { class: "reserved-explanation201", text: "Reserved appointment — applications are not accepted, including when no holder is recorded." }) : available && ["member", "raider", "artisan"].includes(row.applicationTrack) ? h("a", { class: "btn small", href: `#/vote/${row.applicationTrack}/${encodeURIComponent(row.key)}`, text: "Apply for this role" }) : null);
      }))));
  }
  // Owner decision, 26 Oct 2026: browse the whole directory; leadership seats are reserved.
  const reservedKey201 = key => {
    const row = office199(key), position = positionOf(key);
    return !!row?.reservedSeat201 || ["leader", "high_council", "officer_corps"].includes(row?.tier)
      || !!position?.reservedSeat201 || position?.group === "leadership" || String(key || "").startsWith("class_lead:");
  };
  const reservedIntent201 = intent => !!intent && (["officer", "high_council"].includes(intent.applicationTrack) || reservedKey201(intent.targetOffice));
  const reservedNotice201 = "Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed.";
  const familyPrimary203 = (directory, key) => directory.families.find(family => family.key === key)?.primaryKey || "member";
  // .203 groups presentation only: original application, appointment and history keys stay exact.
  function roleDirectory203() {
    const directory = M().roleDirectory203, guides = M().roleGuides201 || {};
    if (!directory || directory.version !== 1 || directory.sourceKeyCount !== 135 || !Array.isArray(directory.families)
      || !directory.families.length || !Array.isArray(directory.ranks) || directory.ranks.length !== 10
      || !directory.keyToFamily || typeof directory.keyToFamily !== "object") return null;
    const registry = M().appointments;
    if (!Array.isArray(registry) || registry.length !== 132) return null;
    const registeredKeys = registry.map(row => row?.key);
    if (new Set(registeredKeys).size !== 132 || registeredKeys.some(key => typeof key !== "string"
      || ["member", "raider", "pvp_team"].includes(key) || !Object.prototype.hasOwnProperty.call(directory.keyToFamily, key))) return null;
    const keys = [], familyKeys = new Set();
    for (const family of directory.families) {
      if (!family || typeof family.key !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(family.key) || familyKeys.has(family.key)
        || typeof family.label !== "string" || !family.label || !["role", "activity", "status", "institution"].includes(family.kind)
        || !["leader", "high_council", "officer_corps", "member_specialist"].includes(family.tier)
        || !Array.isArray(family.sourceKeys) || !family.sourceKeys.includes(family.primaryKey) || !Array.isArray(family.alternateTitles)
        || family.alternateTitles.some(title => typeof title !== "string") || !Array.isArray(family.variants)
        || family.variants.some(variant => !variant || typeof variant.key !== "string" || typeof variant.label !== "string"
          || !["region", "class", "subrole", "historical"].includes(variant.kind))) return null;
      familyKeys.add(family.key);
      for (const key of family.sourceKeys) {
        if (typeof key !== "string" || !guides[key] || directory.keyToFamily[key] !== family.key) return null;
        keys.push(key);
      }
      const variants = family.variants.map(variant => variant?.key);
      if (variants.length !== family.sourceKeys.length - 1 || new Set(variants).size !== variants.length
        || family.sourceKeys.some(key => key !== family.primaryKey && !variants.includes(key))) return null;
    }
    if (keys.length !== directory.sourceKeyCount || new Set(keys).size !== keys.length
      || Object.keys(directory.keyToFamily).length !== keys.length
      || directory.ranks.some((rank, slot) => rank.nativeSlot !== slot || rank.nativeRankOrdinal !== slot + 1
        || typeof rank.label !== "string" || !familyKeys.has(rank.familyKey))) return null;
    return directory;
  }
  function guideBody201(guide, fallback) {
    if (!guide) return fallback ? roleInfo(fallback) : h("p", {class:"muted",text:"The detailed guide is unavailable. Ask leadership for the current remit before taking on this duty."});
    const list = rows => h("ul", null, (rows || []).map(text => h("li", {text})));
    return h("div", {class:"parchment role-info role-guide201"},
      h("p", {class:"about",text:guide.definition}),
      h("h4", {text:"Responsibilities"}), list(guide.responsibilities),
      h("h4", {text:"Expectations"}), list(guide.expectations),
      h("dl", {class:"role-facts"}, h("dt", {text:"Time & commitment"}), h("dd", {text:guide.commitment}),
        h("dt", {text:"Works with"}), h("dd", {text:guide.worksWith})),
      h("p", {class:"small",text:guide.boundaries}),
      guide.eligibilityNote ? h("p", {class:"small muted",text:guide.eligibilityNote}) : null);
  }
  function applicationRoleDirectory201(onChoose = null, initial = {}, options = {}) {
    const directory = roleDirectory203(), guides = M().roleGuides201 || {}, sections = [], entries = [];
    if (!directory) {
      const unavailable = frame("Explore Olympus roles, ranks and titles", null,
        h("p", {class:"muted",text:"The role-family directory is unavailable. Your saved application, original choices and appointment records have not changed. Please try again later or ask leadership for the current role guide."}));
      unavailable.id = "application-directory201";
      unavailable.classList.add("application-directory201");
      unavailable.setAttribute("data-role-directory-unavailable203", "true");
      return unavailable;
    }
    const currentKey = initial.targetOffice || ({member:"member",raider:"raider",artisan:"office_07"}[initial.applicationTrack] || "");
    const currentFamily = directory.keyToFamily[currentKey] || (directory.families.some(family => family.key === currentKey) ? currentKey : "");
    const search = h("input", {type:"search",id:"application-role-search201",maxlength:"160",placeholder:"Find a role, rank or title…","aria-label":"Search all roles, ranks and titles"});
    const count = h("p", {class:"small muted","aria-live":"polite"});
    const groups = [["members", "Member & specialist roles", family => family.kind === "role" && !["leader","high_council","officer_corps"].includes(family.tier)],
      ["activities", "Optional member activities", family => family.kind === "activity"],
      ["officers", "Officer Corps — reserved seats", family => family.kind === "role" && family.tier === "officer_corps"],
      ["council", "High Council — reserved seats", family => family.kind === "role" && family.tier === "high_council"],
      ["royal", "Leader & Royal Appointments — reserved seats", family => family.kind === "role" && family.tier === "leader"],
      ["standing", "Standing, recognition & disciplinary labels", family => family.kind === "status"],
      ["institutions", "Governance institutions", family => family.kind === "institution"]];
    const sourceLabel = key => office199(key)?.applicationLabel || office199(key)?.label || positionOf(key)?.label || guides[key]?.label || key;
    const ownHolder = key => {
      const assignments = S.settings?.appointed || {};
      if (!Object.prototype.hasOwnProperty.call(assignments,key) || !assignments[key]) return null;
      const value = assignments[key];
      const text = !S.signedIn || S.denied || !communityReader() ? "Filled; identity unavailable" : appointmentPointer(value) ? "Appointed member"
        : typeof value !== "string" || value.length > 40 || /[\u0000-\u001f\u007f<>]/.test(value) || /^[0-9]{17,20}$/.test(value.trim()) ? "Name withheld" : value;
      return h("div", {class:"role-holder203","data-appointment-scope203":key,"data-office-assignment":key},
        h("p", {class:"small"}, h("strong", {text:sourceLabel(key) + " — "}), appointmentLabelNode(key,text,false,true)),
        options.showCharacters === true && S.signedIn && !S.denied && communityReader() ? h("div", {"data-appointment-characters":key}) : null);
    };
    for (const [id, label, includes] of groups) {
      const families = directory.families.filter(includes);
      if (!families.length) continue;
      const grid = h("div", {class:"role-directory-grid201 role-family-grid203"});
      const section = h("details", {class:"role-section201","data-role-section201":id,open:id === "members" || families.some(family => family.key === currentFamily)},
        h("summary", null, h("span", {text:label}), h("span", {class:"badge muted",text:String(families.length)})), grid);
      section.open = id === "members" || families.some(family => family.key === currentFamily);
      for (const family of families) {
        const row = office199(family.primaryKey), reserved = ["leader","high_council","officer_corps"].includes(family.tier) || family.sourceKeys.some(reservedKey201);
        const intent = family.application, eligible = !!intent && !reserved && family.kind === "role" && ["member","raider","artisan"].includes(intent.applicationTrack)
          && (!intent.targetOffice || !reservedKey201(intent.targetOffice));
        const chosen = family.key === currentFamily;
        const badge = family.kind === "status" ? "Standing or recognition — not an application" : family.kind === "institution" ? "Governance body — not an application"
          : reserved ? "Reserved seat — no applications" : eligible ? "Applications accepted" : family.kind === "activity" ? "Optional Member activity" : "Standing or recognition — not an application";
        const variants = family.variants.map(variant => {
          const source = office199(variant.key), native = source?.group === "native";
          const disclosure = h("details", {class:"role-variant203",id:"role-"+variant.key,"data-role-key201":variant.key,"data-role-variant-kind203":variant.kind,open:variant.key === currentKey},
            h("summary", {text:variant.label}),
            h("div", {class:"role-variant-body203"}, native ? h("p", {class:"small muted",text:"Native-rank standing and its separate display record; this is not another job, application or grant of permissions."}) : null,
              officeBadge199(source), source?.department ? h("p", {class:"small muted",text:source.department}) : null,
              guideBody201(guides[variant.key],positionOf(variant.key)), ownHolder(variant.key)));
          disclosure.open = variant.key === currentKey;
          return disclosure;
        });
        const variantHint = h("p", {class:"small role-search-match203",hidden:true});
        const iconKey = ({artisan:"professions",raid_leader:"raid_leader",raid_assist:"raid_assist",class_leadership:"class_lead",treasurer:"treasurer"})[family.key]
          || family.sourceKeys.find(key => !!positionOf(key)) || family.primaryKey;
        const detail = h("details", {class:"role-entry201 role-family203" + (chosen ? " chosen" : ""),id:"role-family-"+family.key,"data-role-family203":family.key,"data-role-kind203":family.kind,open:chosen},
          h("summary", null, posIcon(iconKey,"s"), h("span", {class:"role-entry-name201",text:family.label}), h("span", {class:"badge"+(reserved ? " reserved-seat201" : " blue"),text:badge})),
          h("div", {class:"role-entry-body201"},
            family.alternateTitles.length ? h("p", {class:"small role-aliases203"},h("strong",{text:"Also known as: "}),family.alternateTitles.join(" · ")) : null,
            reserved ? h("p", {class:"reserved-explanation201",text:reservedNotice201}) : null,
            variantHint,
            h("section", {class:"role-primary203",id:"role-"+family.primaryKey,"data-role-key201":family.primaryKey},
              officeBadge199(row), row?.department ? h("p", {class:"small muted",text:row.department}) : null,
              guideBody201(guides[family.primaryKey],positionOf(family.primaryKey)), ownHolder(family.primaryKey)),
            eligible && onChoose ? h("button", {type:"button",class:"btn small","data-apply-role201":intent.targetOffice || family.primaryKey,"data-family-apply203":family.key,disabled:!!appointedTo(intent.targetOffice || family.primaryKey) || S.settings?.applicationsOpen === false,
              text:appointedTo(intent.targetOffice || family.primaryKey) ? "Appointment recorded" : S.settings?.applicationsOpen === false ? "Applications closed" : "Apply for this role",
              onclick:() => onChoose({applicationTrack:intent.applicationTrack,targetOffice:intent.targetOffice})}) : null,
            family.kind === "activity" ? h("p", {class:"small",text:family.sourceKeys.includes("pvp_team")
              ? "PvP Team is an optional Member activity, not an Officer seat or a separate native rank. Choose a Member application explicitly and describe your interests; an existing PvP Team choice or backup stays a separate historical application record."
              : "This is an optional Member activity, not an open Officer seat or a separate native rank. Its specific duties, consent requirements and any separately checked website capabilities remain those described in the original guides."}) : null,
            family.kind === "activity" && family.sourceKeys.includes("pvp_team") && onChoose ? h("button", {type:"button",class:"btn small","data-activity-member203":family.key,disabled:!!appointedTo("member") || S.settings?.applicationsOpen === false,
              text:appointedTo("member") ? "Member appointment recorded" : "Choose Member and mention PvP interests",onclick:() => onChoose({applicationTrack:"member",targetOffice:null})}) : null,
            variants.length ? h("div", {class:"role-variants203"},h("h4",{text:"Specific duties, regions & original titles"}),
              h("p", {class:"small muted",text:"These details belong to the same role family. Each original scope and holder record stays separate; grouping grants no shared authority or permissions."}),...variants) : null));
        detail.open = chosen;
        add(grid,detail);
        const labels = [family.label,...family.alternateTitles,...family.sourceKeys.filter(key => office199(key)?.group !== "native").map(sourceLabel)].map(text => text.toLowerCase());
        const contexts = family.sourceKeys.map(key => office199(key)?.department).filter(Boolean);
        entries.push({detail,section,grid,family,variantHint,labels,index:[...labels,...family.variants.map(variant => variant.label),...contexts].join(" ").toLowerCase(),
          variants:family.variants.map(variant => ({label:variant.label,key:variant.key,index:[variant.label,sourceLabel(variant.key)].join(" ").toLowerCase()}))});
      }
      sections.push(section);
    }
    if (royalWritsVisible200() && onChoose) sections.push(h("details", {class:"role-section201","data-role-section201":"patron"},
      h("summary", {text:"Royal Patron & Flagship charter requests"}), h("p", {text:track199("patron")?.description || "Reviewed voluntary charter requests; no purchased authority."}),
      h("button", {type:"button",class:"btn small",text:"Review the Patron application",disabled:S.settings?.applicationsOpen === false,onclick:() => onChoose({applicationTrack:"patron",targetOffice:null})})));
    const matchesText203 = (text,value) => value.length <= 2 && /^[a-z0-9]+$/.test(value)
      ? text.split(/[^\p{L}\p{N}]+/u).includes(value) : text.includes(value);
    function filter() {
      const value = search.value.trim().toLowerCase(); let matches = 0;
      for (const entry of entries) {
        const show = !value || matchesText203(entry.index,value); entry.detail.hidden = !show; if (show) matches++;
        const variantMatches = value ? entry.variants.filter(variant => matchesText203(variant.index,value)) : [];
        const nameMatch = value && entry.labels.some(label => matchesText203(label,value));
        entry.variantHint.textContent = variantMatches.length ? "Matching detail: " + variantMatches.map(variant => variant.label).join(" · ")
          : value && show && !nameMatch ? "Matches the department context. The role itself remains " + entry.family.label + "." : "";
        entry.variantHint.hidden = !entry.variantHint.textContent;
        entry.score = !value || entry.labels.includes(value) ? 0 : nameMatch ? 1 : 2;
        entry.detail.style.order = String(entry.score);
      }
      for (const section of sections) {
        const own = entries.filter(entry => entry.section === section);
        if (!own.length) { section.hidden = !!value; continue; }
        section.hidden = !own.some(entry => !entry.detail.hidden);
        section.style.order = String(Math.min(...own.filter(entry => !entry.detail.hidden).map(entry => entry.score),2));
      }
      count.textContent = value ? `${matches} matching role families. Sections with an exact role or title match come first; matching regional, class and rank details remain inside their family. Open a section and role to read them.`
        : `${entries.length} role families, with all ${directory.sourceKeyCount} original role, rank and title guides retained inside them. Regional duties, class portfolios and aliases are details of a role, not additional jobs.`;
    }
    // .202: directory browsing changes no application answers, even inside Apply.
    search.addEventListener("input",event => { event.stopPropagation(); filter(); });
    search.addEventListener("change",event => event.stopPropagation());
    search.addEventListener("keydown",event => { if (event.key === "Enter") event.preventDefault(); });
    filter();
    const chooser = frame("Explore Olympus roles, ranks and titles", h("a", {href:"#/roles/rosetta-stone",text:"Role & Rank Rosetta Stone"}),
      h("p", {text:"Choose a role by the work it involves. Each family has one illustrated guide, with its original titles and detailed regional or class duties nested inside. Rank standing, recognition and governance bodies are listed separately from job opportunities."}),
      noticeBox("info","pos-officer",h("p",{text:reservedNotice201}),h("p",{text:"Membership, Raider and Artisan applications remain available. A rank, title or unfilled listing never grants access, promotion or an appointment."})),
      h("label", {class:"field"},h("span", {class:"lab",text:"Find a role"}),search),count,h("div",{class:"role-sections203"},...sections));
    chooser.id = "application-directory201"; chooser.classList.add("application-directory201");
    chooser.setAttribute("data-role-directory-version", "203");
    if (currentKey) chooser.setAttribute("data-initial-role203", currentKey);
    return chooser;
  }
  // The boot carries the RESOLVED identity (item 7, 14 Oct 2026): the exact public beta, or an activated full-release profile
  // whose opaque revision has the server's shape. A held identity, or anything else, renders as unavailable; boot data never
  // selects a phase on its own.
  function identityOf(p) {
    const keys = ["schema", "revision", "phase", "game", "guild", "realm", "ruleset", "faction"];
    if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).length !== keys.length
      || !keys.every((k) => Object.prototype.hasOwnProperty.call(p, k) && typeof p[k] === "string")
      || p.schema !== "olympus-ruleset-profile-v1" || !["beta", "public_direction", "full_release"].includes(p.phase)
      || p.game !== "World of Warcraft: Forever" || p.guild !== "Olympus" || !["Normal", "PvE", "PvP", "Roleplaying", "Roleplay-PvP", "Hardcore"].includes(p.ruleset) || !["Alliance", "Horde"].includes(p.faction)
      || !/^[\p{L}\p{N} .:'()-]{1,80}$/u.test(p.realm) || p.realm !== p.realm.trim() || p.realm !== p.realm.normalize("NFC")
      || (p.phase === "beta" && (p.revision !== "forever-beta-pvp2-v1" || p.realm !== "Classic Beta PvP 2" || p.ruleset !== "PvP" || p.faction !== "Alliance"))
      || (p.phase === "public_direction" && (p.revision !== "forever-public-pve-alliance-20261023-v1" || !["Realmless (ruleset-based)", "Realm not announced"].includes(p.realm) || p.ruleset !== "PvE" || p.faction !== "Alliance"))
      || (p.phase === "full_release" && !/^forever-release-[a-z0-9][a-z0-9.-]{0,31}$/.test(p.revision))) return "Game identity unavailable";
    // .204: display-only translation of the exact legacy direction; no stored identity or game setup changes.
    return p.phase === "public_direction" ? `${p.game} · PVE - Alliance · public guild direction · Realmless (ruleset-based)` : `${p.game} · ${p.phase === "beta" ? "Beta" : "Full release"} · ${p.realm} · ${p.ruleset} · ${p.faction}`;
  }
  function rulesetIdentity() { return M().rulesetHeld ? "Game identity unavailable" : identityOf(M().ruleset); }
  // .93: the community context from the boot (community-context.ts contextDto): flags for everyone, capabilities for the viewer
  const COM = () => S.community || { subject: null, capabilities: {}, features: {} };
  const feat = (f) => !!COM().features[f];
  const can = (c) => !!COM().capabilities[c];
  // .176: viewing Community does not confer roster confirmation or any write capability.
  const communityReader = () => can("communityRead") || can("confirmedGuildData");
  const anyCommunity = () => Object.values(COM().features).some(Boolean);
  const byKey = (list, key) => list.find((x) => x.key === key);
  const labelOf = (list, key, fallback) => (byKey(list, key) || {}).label || fallback || key || "—";
  const classColor = (key) => (byKey(M().classes, key) || {}).color || "";
  /** A role key as people read it: a position, or "Class Lead (Mage)". */
  function roleName(key) {
    if (!key) return "—";
    if (key.startsWith("class_lead:")) return `Class Lead (${labelOf(M().classes, key.slice(11))})`;
    if (key === "raid_leader" || key === "raid_assist") return labelOf(M().positions, key + "_na").replace("(NA raids)", "(before the NA/EU split)");
    return labelOf(M().positions, key);
  }
  const firstChoiceKey = (a) => (a.position === "class_lead" && a.classLead ? `class_lead:${a.classLead}` : a.position);
  const choicesOf = (a) => (a ? [firstChoiceKey(a), ...(a.backups || [])] : []);
  /** Leadership roles (Class Lead included): the ones with a voting board, unless appointed or chosen without a public vote. */
  const isLeadershipKey = (k) => k.startsWith("class_lead:") || (byKey(M().positions, k) || {}).group === "leadership";
  /** Who holds a role filled by appointment (Admin → Settings), or "": such a role takes no applications, votes or write-ins. */
  const appointmentPointer = (value) => typeof value === "string" && /^<@[0-9]{17,20}>$/.test(value);
  const appointedTo = (key) => {
    const a = S.settings?.appointed || {}, read = k => Object.prototype.hasOwnProperty.call(a, k) ? a[k] : "";
    const parent = applicationParent199(key), keys = applicationSeatKeys199(key);
    const value = read(key) || (parent && parent.key !== key ? read(parent.key) : "") || (keys.length && !keys.includes(key) && keys.every(k => read(k)) ? (keys.length === 1 ? read(keys[0]) : "All related seats filled") : "") || (key === "treasurer" ? read("office_86") : key === "office_86" ? read("treasurer") : "");
    return appointmentPointer(value) ? "Appointed member" : value;
  };
  const appointmentLabel = (holder) => holder === "Appointed member" ? "Filled by appointment" : `Appointed: ${holder}`;
  const sentenceEnd = (text) => /[.!?]$/.test(text) ? text : text + ".";
  const appointmentLabelText = (holder, bare, sentence) => { const text = bare ? holder : appointmentLabel(holder); return sentence ? sentenceEnd(text) : text; };
  function appointmentSourceKey199(key) {
    const a = S.settings?.appointed || {}, has = k => Object.prototype.hasOwnProperty.call(a,k);
    if (has(key)) return key;
    const parent = applicationParent199(key);
    if (parent && has(parent.key)) return parent.key;
    const children = applicationSeatKeys199(key);
    if (children.length === 1 && has(children[0])) return children[0];
    if (key === "office_86" && has("treasurer")) return "treasurer";
    if (key === "treasurer" && has("office_86")) return "office_86";
    return key;
  }
  const appointmentLabelNode = (key, holder = appointedTo(key), bare = false, sentence = false) => h("span", { "data-appointment-label": appointmentSourceKey199(key), "data-appointment-bare": bare ? "true" : "false", "data-appointment-sentence": sentence ? "true" : "false", text: appointmentLabelText(holder, bare, sentence) });
  /** An appointed holder is projected only through the current qualified identity path. */
  const appointedText = (keys) => [...keys.flatMap((key, i) => [i ? i === keys.length - 1 ? " and " : ", " : "", appointmentLabelNode(key, appointedTo(key), true), i ? " " : " has been appointed ", roleName(key)]), `, so ${keys.length === 1 ? "the role is" : "those roles are"} no longer open to applications or votes.`];
  /** The complete website display catalogue; it never applies a native rank or publishes a raw account pointer. */
  function officeAssignmentPanel() {
    const offices = M().appointments;
    const groups = [["native", "Native-rank display records"], ["leadership", "Leadership display records"], ["class", "Class display records"], ["office", "Extended offices and display aliases"]];
    const valid = Array.isArray(offices) && offices.length > 0 && offices.length <= 132 && new Set(offices.map(office => office?.key)).size === offices.length && offices.every(office =>
      office && typeof office.key === "string" && /^[a-z][a-z0-9_:]{0,79}$/.test(office.key) && typeof office.label === "string" && office.label.length > 0 && office.label.length <= 160 && groups.some(([group]) => group === office.group));
    if (!valid) return frame("Office and rank display records", null, h("p", { class: "muted", text: "The display catalogue is unavailable. No holder identities were loaded." }));
    if (!S.signedIn || S.denied || !communityReader()) return frame("Office and rank display records", null, h("p", { class: "muted", text: "A qualified current guild reader can view the separately consented website holder records." }));
    const assignments = (S.settings && S.settings.appointed) || {};
    const displayHolder = key => {
      if (!Object.prototype.hasOwnProperty.call(assignments, key) || assignments[key] === "") return "";
      const value = assignments[key];
      if (appointmentPointer(value)) return "Appointed member";
      // Old staff-confirmed display text remains text; malformed/ID-like legacy values cannot become a disclosure.
      if (typeof value !== "string" || value.length > 40 || /[\u0000-\u001f\u007f<>]/.test(value) || /^[0-9]{17,20}$/.test(value.trim())) return "Name withheld";
      return value;
    };
    const panel = frame("Office and rank display records", null,
      h("p", { text: "All supported website office, class and native-rank display records are listed here. An unfilled record is not an appointment. Display aliases do not add an eleventh native rank." }),
      h("p", { class: "muted small", text: "Current account names and verified characters appear only through the separately admitted publication reader. Name withheld and unavailable identities remain opaque. Staff-confirmed plain text is not current account or character proof. These display records do not assign in-game or Discord ranks, bank access, votes or signing authority; the separately disclosed Broadcaster and Lead Correspondent website actions keep their own checks." }),
      groups.map(([group, title]) => {
        const rows = offices.filter(office => office.group === group);
        return !rows.length ? null : h("details", { class: "mt", open: group === "native" },
          h("summary", { text: `${title} (${rows.length})` }),
          h("div", { class: "roles-grid mt-s" }, rows.map(office => {
            const holder = displayHolder(office.key);
            return h("article", { class: "card", "data-office-assignment": office.key },
              h("h3", null, posIcon(office.key, "s"), h("span", { text: office.label })), officeBadge199(office),
              holder ? h("p", null, appointmentLabelNode(office.key, holder, false, true)) : h("p", { class: "muted", text: "No website appointment recorded." }),
              holder ? h("div", { "data-appointment-characters": office.key }) : null,
              office.aliasOf ? h("p", { class: "muted small", text: "Display alias; does not create another native-rank slot or transfer an appointment automatically." }) : null);
          })));
      }));
    panel.setAttribute("data-office-assignment-catalogue", "true");
    return panel;
  }
  /** Fresh, qualified-reader projection for this mounted view only. The server's
   * separate site/Discord publication proofs remain the only identity authority. */
  function hydrateAppointmentNames(root, ownsView = () => root.isConnected) {
    const labels = [...root.querySelectorAll("[data-appointment-label]")], titles = [...root.querySelectorAll("[data-appointment-title]")], characterSlots = [...root.querySelectorAll("[data-appointment-characters]")];
    if (!labels.length && !titles.length) return () => {};
    const user = S.user, settings = S.settings, context = COM(), route = currentRoute();
    const offices = M().appointments;
    if (!Array.isArray(offices) || offices.length < 1 || offices.length > 132 || offices.some(office => !office || typeof office.key !== "string")) return () => {};
    const appointmentKeys = new Set(offices.map(office => office.key));
    if (appointmentKeys.size !== offices.length) return () => {};
    const referencedKeys = new Set([...labels.map(node => node.getAttribute("data-appointment-label")), ...titles.map(node => node.getAttribute("data-appointment-title"))].filter(key => appointmentKeys.has(key) && Object.prototype.hasOwnProperty.call(settings?.appointed || {}, key)));
    const requestedRole = referencedKeys.size === 1 ? [...referencedKeys][0] : null;
    const originals = labels.map(node => [node, node.textContent]), originalTitles = titles.map(node => [node, node.getAttribute("title")]);
    let disposed = false, generation = 0, hidden = !!document.hidden;
    const owned = () => !disposed && ownsView() && S.signedIn && !S.denied && S.user === user && S.settings === settings && COM() === context && currentRoute() === route && communityReader();
    const live = () => owned() && !document.hidden;
    const clearProjection = () => {
      for (const [node, text] of originals) node.textContent = text;
      for (const [node, title] of originalTitles) { if (title === null) node.removeAttribute("title"); else node.setAttribute("title", title); }
      for (const node of characterSlots) clear(node);
    };
    const dispose = () => {
      if (disposed) return; disposed = true; generation++; clearProjection();
      document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", dispose); appointmentReaders.delete(dispose);
    };
    const onVisibility = () => {
      const nextHidden = !!document.hidden;
      if (hidden === nextHidden) return;
      hidden = nextHidden;
      if (hidden) { appointmentPendingRead = null; generation++; clearProjection(); }
      else if (owned()) read();
      else dispose();
    };
    const read = async () => {
      if (!live()) return;
      const requestedGeneration = ++generation, current = () => requestedGeneration === generation && live();
      const seen = new Set(), people = [], pageSize = 32, maxPages = requestedRole === null ? Math.ceil(appointmentKeys.size / pageSize) : 1;
      let after = null, revision = null, complete = false;
      clearProjection();
      try {
        const pendingMatches = appointmentPendingRead && appointmentPendingRead.ownerCurrent() && appointmentPendingRead.user===user && appointmentPendingRead.settings===settings && appointmentPendingRead.context===context && appointmentPendingRead.route===route && appointmentPendingRead.appointments===JSON.stringify(settings?.appointed || {}) && (appointmentPendingRead.role===null || appointmentPendingRead.role===requestedRole);
        let shared = pendingMatches ? appointmentPendingRead : null;
        if(!shared){
          shared={user,settings,context,route,appointments:JSON.stringify(settings?.appointed || {}),role:requestedRole,ownerCurrent:current,promise:null};
          shared.promise=(async()=>{
        for (let page = 0; page < maxPages; page++) {
          const path = '/api/appointed-identities' + (requestedRole !== null ? '?' + qs({ role: requestedRole }) : after === null ? '' : '?' + qs({ after, revision }));
          const data = await api('GET', path, undefined, { live: current });
          if (!current()) return;
          if (data?.scope !== 'qualified_community_readers' || !Array.isArray(data.identities) || data.identities.length > (requestedRole === null ? pageSize : 1) ||
              requestedRole !== null && (!data.complete || data.nextCursor !== null) ||
              !/^[A-Za-z0-9_-]{43}$/.test(data.revision || '') || revision !== null && data.revision !== revision ||
              typeof data.complete !== 'boolean' || data.complete !== (data.nextCursor === null) ||
              data.nextCursor !== null && (!appointmentKeys.has(data.nextCursor) || after !== null && data.nextCursor <= after)) throw Error('appointment_page_unconfirmed');
          for (const person of data.identities) {
            if (!person || !appointmentKeys.has(person.role) || requestedRole !== null && person.role !== requestedRole || !Object.prototype.hasOwnProperty.call(settings?.appointed || {}, person.role) || seen.has(person.role) ||
                after !== null && person.role <= after || data.nextCursor !== null && person.role > data.nextCursor ||
                !appointmentPointer(person.appointment) || typeof person.displayName !== 'string' || typeof person.username !== 'string' ||
                !Array.isArray(person.characters) || person.characters.length > 50 || person.characters.some(c => !c || typeof c.name !== 'string' || !['verified', 'queued', 'member'].includes(c.status) || typeof c.verifiedAt !== 'string')) throw Error('appointment_page_unconfirmed');
            seen.add(person.role); people.push(person);
          }
          revision = data.revision; after = data.nextCursor; complete = data.complete;
          if (complete) break;
        }
        if (!current()) return;
        if (!complete || people.length > appointmentKeys.size) throw Error('appointment_page_unconfirmed');
            return people;
          })();
          appointmentPendingRead=shared;
        }
        let qualifiedPeople;
        try{qualifiedPeople=await shared.promise;}finally{if(appointmentPendingRead===shared)appointmentPendingRead=null;}
        if(!current() || !Array.isArray(qualifiedPeople))return;
        for (const person of qualifiedPeople) {
          const name = discordIdentity(person);
          for (const node of labels) if (node.getAttribute("data-appointment-label") === person.role) node.textContent = appointmentLabelText(name, node.getAttribute("data-appointment-bare") === "true", node.getAttribute("data-appointment-sentence") === "true");
          for (const node of titles) if (node.getAttribute("data-appointment-title") === person.role) node.setAttribute("title", appointmentLabel(name));
          for (const node of characterSlots) if (node.getAttribute("data-appointment-characters") === person.role) {
            clear(node); add(node, h("p", { class: "muted small", text: person.characters.length ? `Verified characters: ${person.characters.map(c => c.name).join(", ")}${person.charactersTruncated ? " (first 50)" : ""}.` : "No current verified characters are available." }));
          }
        }
      } catch (error) {
        // No partial/mixed collection survives an admission, cursor, rate or
        // transport refusal. Visibility does not automatically retry a failure.
        if (current()) dispose();
      }
    };
    appointmentReaders.add(dispose); document.addEventListener("visibilitychange", onVisibility); window.addEventListener("pagehide", dispose);
    if (!owned()) dispose();
    else if (!hidden) read();
    return dispose;
  }
  const tick = () => h("img", { class: "tick", src: art("ready"), alt: "", width: "16", height: "16" });
  /**
   * A role that takes applications but is chosen by the guild's leadership without a public vote (.45, Admin → Settings):
   * no voting board and no write-ins. Appointed comes first: an appointed role is closed altogether.
   */
  const noVoteFor = (key) => {
    const quiet = S.settings?.noVote || [], parent = applicationParent199(key);
    return !appointedTo(key) && (quiet.includes(key) || !!parent && quiet.includes(parent.key));
  };
  /** A leadership role members vote on: what puts an application on the voting board. */
  const votedKey = (k) => isLeadershipKey(k) && !appointedTo(k) && !noVoteFor(k);
  /** The game's party-leader crown: the mark of a role the leadership chooses itself. */
  const crown = (alt = "") => h("img", { class: "tick", src: art("leader"), alt, width: "16", height: "16" });
  const NO_VOTE_TEXT = "No public vote: the guild's leadership reads the applications and chooses.";

  // ---------------------------------------------------------------- what each role involves (.44)
  /** A position from the page's list, for a position or role key ("class_lead:mage" is the Class Lead). */
  const positionOf = (key) => byKey(M().positions, String(key || "").startsWith("class_lead:") ? "class_lead" : key);
  /** Who holds a position by appointment, as its card shows it: Class Lead only once every class is appointed. */
  const holderOf = (p) => (p.key === "class_lead" ? (M().classes.length && M().classes.every((c) => appointedTo(`class_lead:${c.key}`)) ? "every class" : "") : appointedTo(p.key));
  /** A position chosen without a public vote, as its card shows it: Class Lead only when no open class is voted on. */
  const noVoteOf = (p) => (p.key === "class_lead"
    ? M().classes.some((c) => noVoteFor(`class_lead:${c.key}`)) && M().classes.every((c) => appointedTo(`class_lead:${c.key}`) || noVoteFor(`class_lead:${c.key}`))
    : noVoteFor(p.key));
  /**
   * A role's description on the quest parchment: what it is, how long it takes, who it works with, what it comes with in
   * game (.46: the guild rank and the Olympus addon's title), its responsibilities and what the guild expects. The Roles
   * page, a choice's Details on the application form and the voting board show it.
   */
  function roleInfo(p, { about = true } = {}) {
    const info = p && p.info;
    if (!info) return null;
    const list = (items) => h("ul", null, (items || []).map((t) => h("li", { text: t })));
    return h("div", { class: "parchment role-info" },
      about ? h("p", { class: "about", text: info.about }) : null,
      h("dl", { class: "role-facts" },
        h("dt", { text: "Time" }), h("dd", { text: info.time }),
        info.works ? [h("dt", { text: "Works with" }), h("dd", { text: info.works })] : null,
        info.game ? [h("dt", { text: "In game" }), h("dd", { text: info.game })] : null),
      h("h4", { text: "Responsibilities" }), list(info.duties),
      h("h4", { text: "Expectations" }), list(info.expect));
  }
  /** A role's description in a dialog; with onChoose it also offers to make the role the first choice. */
  function roleDialog(p, { onChoose = null, current = false } = {}) {
    if (!p) return;
    const holder = holderOf(p);
    const id = "rd" + Math.random().toString(36).slice(2, 8);
    const close = h("button", { class: "btn", type: "button", text: "Close" });
    const choose = onChoose && !reservedKey201(p.key) && !holder && !current ? h("button", { class: "btn", type: "button", text: "Choose as my first choice" }) : null;
    const d = dialog(h("div", { class: "role-dialog" },
      h("h2", { id }, posIcon(p.key, "s"), " ", p.label),
      holder ? h("p", { class: "appointed-line" }, tick(), h("span", null, appointmentLabelNode(p.key, holder, false, true), " This role takes no applications.")) : null,
      reservedKey201(p.key) ? h("p", {class:"reserved-explanation201",text:reservedNotice201}) : !holder && noVoteOf(p) ? h("p", { class: "novote-line" }, crown(), NO_VOTE_TEXT) : null,
      current ? h("p", { class: "appointed-line" }, tick(), "Your first choice.") : null,
      roleInfo(p),
      h("div", { class: "btn-row mt" }, choose, close)));
    d.setAttribute("aria-labelledby", id);
    close.addEventListener("click", () => d.close());
    if (choose) choose.addEventListener("click", () => { d.close(); onChoose(); });
    const dispose = hydrateAppointmentNames(d, () => d.open && d.isConnected);
    d.addEventListener("close", dispose);
    return d;
  }

  function clsLabel(key) {
    if (key === "undecided") return h("span", { class: "cls muted", text: "Class undecided" });
    const c = byKey(M().classes, key);
    if (!c) return null;
    const s = h("span", { class: "cls" }, classIcon(key), c.label);
    s.style.color = c.color;
    return s;
  }

  // ---------------------------------------------------------------- API
  class ApiError extends Error {
    constructor(status, data) {
      super((data && data.message) || (data && data.error === "site_access_unavailable" ? "Your current access could not be checked. Please wait a moment and try again." : `Request failed (${status}).`));
      this.status = status;
      this.data = data || {};
    }
  }
  // This page's version, sent with every call. The Worker refuses saves from a page older than itself (a page opened
  // before an update would send an old shape), so it must match PAGE_VERSION in src/site-core.ts.
  const PAGE_VERSION = "2";
  let boardSummaryRead = null; // Session-memory counts only, never candidate records or write authority.
  // `options.live`: the view-liveness of the operation (F4b.1, 15 Oct 2026). When it is given and false at reply time, the shell is
  // left alone (no sign-out, toast, render or reload notice from an operation whose view is gone); the error is still thrown.
  async function api(method, path, body, options = {}) {
    if (method !== "GET") boardSummaryRead = null; // A lost write answer must invalidate the read cache too.
    const init = { method, headers: { "X-Olympus": PAGE_VERSION }, credentials: "same-origin" };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch {
      throw new ApiError(0, { message: "The site could not be reached. Check your connection and try again." });
    }
    let data = null;
    const raw = await res.text().catch(() => null);
    if (raw) { try { data = JSON.parse(raw); } catch { data = null; } }
    // .104 (F100-1): a 2xx whose body is present but not readable JSON is an UNKNOWN outcome, never a success: the caller treats it as
    // a lost answer (nothing cleared, renumbered or re-sent on its own). An empty 2xx body (204) stays null for the endpoints that mean it.
    if (res.ok && raw && data === null) throw new ApiError(res.status, { error: "unreadable_answer" });
    const current = typeof options.live !== "function" || options.live();
    if (res.status === 401) {
      boardSummaryRead = null;
      if (current) {
        S.signedIn = false;
        toast("You were signed out. Sign in with Discord again.", "bad");
        dirtyKeys.clear();
        render();
      }
      throw new ApiError(401, data);
    }
    if (res.status === 409 && data && data.error === "reload") {
      // The site was updated while this page was open: nothing was saved. Offer the reload rather than a dead end.
      if (current) reloadNotice(data.message);
      throw new ApiError(409, Object.assign({}, data, { message: "Nothing was saved: reload the page first (your typing is still on this page)." }));
    }
    if (!res.ok) { const error = new ApiError(res.status, data); if(res.status===429){const seconds=Number(res.headers.get("Retry-After"));error.retryAfterSeconds=Number.isFinite(seconds)&&seconds>0?Math.min(900,Math.ceil(seconds)):60;} throw error; }
    return data;
  }
  // Optional census previews keep their raw lexical JSON and never use api() reserialization.
  const CENSUS_INPUT_BYTES = 327680, CENSUS_RESPONSE_BYTES = 524288, CENSUS_ATTEMPT_MS = 15000, CENSUS_VISIBLE_MS = 900000;
  let disposeCensusPreview = null;
  function censusBytes(value, limit) {
    if (typeof value !== "string" || value.length > limit) return false;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
      else if (c >= 0xdc00 && c <= 0xdfff) return false;
    }
    return new TextEncoder().encode(value).byteLength <= limit;
  }
  function censusReceipt(value) {
    const keys = (v, expected) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === expected.length && Object.keys(v).every(key => expected.includes(key));
    const integer = (v, max = 253402300799) => Number.isSafeInteger(v) && v >= 0 && v <= max;
    const text = (v, max) => typeof v === "string" && v.length > 0 && !/[\x00-\x1f\x7f]/.test(v) && censusBytes(v, max);
    if (!keys(value, ["format", "persisted", "sourceVerified", "membershipProof", "receiptNow", "snapshot", "atReceipt"]) || value.format !== "olympus-census-preview-v1" || value.persisted !== false || value.sourceVerified !== false || value.membershipProof !== false || !integer(value.receiptNow)) return false;
    const s = value.snapshot, a = value.atReceipt;
    if (!keys(s, ["format", "addonVersion", "realmGroup", "faction", "observedAt", "source", "membershipProof", "guilds"]) || s.format !== "olympus-census-v1" || s.source !== "community-observation" || s.membershipProof !== false || !text(s.addonVersion, 32) || !text(s.realmGroup, 128) || !["Alliance", "Horde"].includes(s.faction) || !integer(s.observedAt, value.receiptNow) || !Array.isArray(s.guilds) || s.guilds.length > 300) return false;
    if (!keys(a, ["receiptNow", "snapshotAgeSeconds", "guilds"]) || a.receiptNow !== value.receiptNow || a.snapshotAgeSeconds !== value.receiptNow - s.observedAt || !Array.isArray(a.guilds) || a.guilds.length !== s.guilds.length) return false;
    const names = new Set();
    return s.guilds.every((row, i) => {
      if (!row || !text(row.name, 128) || !integer(row.reportedCharacters, 1000) || !integer(row.receivedAt, s.observedAt)) return false;
      const folded = row.name.replace(/[A-Z]/g, c => c.toLowerCase()), age = s.observedAt - row.receivedAt, receiptAge = value.receiptNow - row.receivedAt, fresh = age <= 900, counted = age <= 86400;
      if (names.has(folded) || age > 604800 || row.fresh !== fresh || row.counted !== counted || !keys(row, fresh ? ["name", "reportedCharacters", "receivedAt", "fresh", "counted", "online"] : ["name", "reportedCharacters", "receivedAt", "fresh", "counted"]) || fresh && !integer(row.online, row.reportedCharacters)) return false;
      names.add(folded);
      const received = a.guilds[i];
      return keys(received, ["name", "ageSeconds", "fresh", "counted", "retained"]) && received.name === row.name && received.ageSeconds === receiptAge && received.fresh === (receiptAge <= 900) && received.counted === (receiptAge <= 86400) && received.retained === (receiptAge <= 604800);
    });
  }
  async function censusRawPreview(raw, controller, current, started, deadline) {
    const cancelled = () => new ApiError(0, { error: "preview_cancelled" });
    const ensure = () => { const t = Date.now(); if (controller.signal.aborted || t < started || t >= deadline || !current()) throw cancelled(); };
    let reader = null, rejectAbort = null, finished = false;
    try {
      ensure();
      const interrupted = new Promise((_, reject) => { rejectAbort = () => reject(cancelled()); controller.signal.addEventListener("abort", rejectAbort, { once: true }); });
      interrupted.catch(() => {}); // also handled if fetch throws synchronously before the race is installed
      const pending = Promise.resolve(fetch("/api/community/census/preview", { method: "POST", credentials: "same-origin", headers: { "X-Olympus": PAGE_VERSION, "Content-Type": "application/json" }, body: raw, signal: controller.signal })).then(response => {
        try { ensure(); } catch (error) {
          try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* a late response has no adoption authority */ }
          throw error;
        }
        return response;
      });
      const response = await Promise.race([pending, interrupted]);
      ensure();
      if (!response.body || typeof response.body.getReader !== "function") throw new ApiError(response.status, { error: "unreadable_answer" });
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
      let size = 0, answer = "";
      for (;;) {
        ensure();
        const packet = await Promise.race([reader.read(), interrupted]);
        ensure();
        if (!packet || typeof packet.done !== "boolean") throw new ApiError(response.status, { error: "unreadable_answer" });
        if (packet.done) { finished = true; answer += decoder.decode(); break; }
        if (!(packet.value instanceof Uint8Array) || packet.value.byteLength > CENSUS_RESPONSE_BYTES - size) throw new ApiError(response.status, { error: "unreadable_answer" });
        size += packet.value.byteLength;
        answer += decoder.decode(packet.value, { stream: true });
      }
      ensure();
      let value;
      try { value = JSON.parse(answer); } catch { throw new ApiError(response.status, { error: "unreadable_answer" }); }
      if (!response.ok) throw new ApiError(response.status, { error: typeof value?.error === "string" ? value.error : "preview_failed" });
      if (!censusReceipt(value)) throw new ApiError(response.status, { error: "unreadable_answer" });
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, { error: controller.signal.aborted ? "preview_cancelled" : "preview_failed" });
    } finally {
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
      if (!finished) controller.abort();
      if (reader) {
        if (!finished) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* no response adoption */ } }
        try { reader.releaseLock(); } catch { /* pending cancellation retains no preview authority */ }
      }
    }
  }
  function censusFailure(error) {
    const messages = {
      invalid_census: "This export is not valid census JSON. No rows were accepted.",
      body_too_large: "The export exceeds 320 KiB. Paste a smaller addon export.",
      slow_down: "The preview is busy. Wait a minute before submitting again.",
      body_timeout: "The upload did not finish in time. No preview was accepted.",
      reload: "The site changed. Reload before starting a new preview.",
      not_found: "Census preview is not switched on.",
      guild_unconfirmed: "Your guild membership is not currently confirmed.",
      guild_access_changed: "Your access changed. The preview was cleared.",
      signed_out: "You were signed out. Sign in again before a new preview.",
      preview_cancelled: "The preview was cancelled or timed out. Nothing is displayed.",
      unreadable_answer: "The answer could not be verified. No preview was accepted."
    };
    return messages[codeOf(error)] || "The preview could not be completed. No data is displayed; submit again only when you choose.";
  }

  let reloadShown = false;
  function reloadNotice(message) {
    if (reloadShown) return;
    reloadShown = true;
    const bar = h("div", { class: "notice reload-bar" }, noticeBox("warn", "icon-warning",
      h("p", { text: message || "The site has been updated since this page was opened." }),
      h("p", { class: "small", text: "Copy anything long you typed first: reloading starts the page again." }),
      h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Reload now", onclick: () => { dirtyKeys.clear(); location.reload(); } }))));
    document.body.appendChild(bar);
    stackBars();
  }
  /** .109: the reload notice and the receipt bar both sit over the page under the top bar; when both show they stack (in document order) instead of covering each other. */
  function stackBars() {
    const top = document.querySelector(".topbar");
    let y = (top ? top.getBoundingClientRect().height : 0) + 8;
    for (const b of document.querySelectorAll(".reload-bar, .receipt-bar")) { if (b.style) b.style.top = `${y}px`; y += b.getBoundingClientRect().height + 8; }
  }

  // ---------------------------------------------------------------- toasts and dialogs
  const toastBox = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
  document.body.appendChild(toastBox);
  function toast(msg, kind = "") {
    const t = h("div", { class: "toast " + kind, text: msg });
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), kind === "bad" ? 9000 : 4500);
  }
  let dialogSeq = 0;
  function dialog(content, { wide = false } = {}) {
    const d = h("dialog", { class: wide ? "wide" : "" });
    add(d, [h("button", { class: "x", type: "button", "aria-label": "Close", title: "Close", onclick: () => d.close() }), content]);
    // .109: the dialog is named by its own heading
    const head = content && content.querySelector ? content.querySelector("h2, h3") : null;
    if (head) { if (!head.id) head.id = `dialog-title-${++dialogSeq}`; d.setAttribute("aria-labelledby", head.id); }
    d.addEventListener("close", () => d.remove());
    if (streamShield) { toast("Stream Shield is on. Turn it off to open private dialogs; no action was confirmed."); setTimeout(() => d.dispatchEvent(new Event("close")), 0); return d; }
    document.body.appendChild(d);
    d.showModal();
    return d;
  }
  function confirmBox(title, body, okText, { danger = false, typeToConfirm = "", extra = null } = {}) {
    return new Promise((resolve) => {
      const input = typeToConfirm ? h("input", { type: "text", "aria-label": `Type ${typeToConfirm} to confirm`, autocomplete: "off" }) : null;
      const ok = h("button", { class: "btn" + (danger ? " danger" : ""), type: "button", text: okText });
      const cancel = h("button", { class: "btn", type: "button", text: "Cancel" });
      if (input) {
        ok.disabled = true;
        input.addEventListener("input", () => { ok.disabled = input.value.trim() !== typeToConfirm; });
      }
      let done = false;
      const d = dialog(h("div", null, h("h2", { text: title }), h("p", { text: body }), extra, input ? h("label", { class: "field" }, h("span", { class: "lab", text: `Type ${typeToConfirm} to confirm` }), input) : null, h("div", { class: "btn-row" }, ok, cancel)));
      ok.addEventListener("click", () => { done = true; d.close(); resolve(true); });
      cancel.addEventListener("click", () => d.close());
      d.addEventListener("close", () => { if (!done) resolve(false); });
    });
  }
  function promptBox(title, body, label, okText, { max = 300, danger = false } = {}) {
    return new Promise((resolve) => {
      const input = h("textarea", { maxlength: String(max), rows: "3" });
      const ok = h("button", { class: "btn" + (danger ? " danger" : ""), type: "button", text: okText });
      let done = false;
      const d = dialog(h("div", null, h("h2", { text: title }), h("p", { text: body }), h("label", { class: "field" }, h("span", { class: "lab", text: label }), input), h("div", { class: "btn-row" }, ok, h("button", { class: "btn", type: "button", text: "Cancel", onclick: () => d.close() }))));
      ok.addEventListener("click", () => { done = true; d.close(); resolve(input.value); });
      d.addEventListener("close", () => { if (!done) resolve(null); });
    });
  }
  /** A frame with its title on the header plaque. */
  const frame = (title, aside, ...body) => h("section", { class: "frame" }, h("div", { class: "plaque" }, typeof title === "string" ? h("h2", { text: title }) : title, aside || null), ...body);
  const noticeBox = (kind, iconName, ...body) => h("div", { class: "notice-box " + kind }, iconName ? icon(iconName, "l") : null, h("div", null, ...body));

  // ---------------------------------------------------------------- countdowns
  function countdown(target, { onDone, doneText = "Open now" } = {}) {
    const box = h("div", { class: "count", role: "timer" });
    const nums = {};
    for (const [k, lab] of [["d", "Days"], ["h", "Hours"], ["m", "Minutes"], ["s", "Seconds"]]) {
      nums[k] = h("span", { class: "num", text: "0" });
      box.appendChild(h("div", { class: "unit" }, nums[k], h("span", { class: "lab", text: lab })));
    }
    let fired = false;
    const tick = () => {
      const left = Math.max(0, Math.floor(target - nowMs() / 1000));
      if (left <= 0) {
        clear(box).appendChild(h("div", { class: "unit" }, h("span", { class: "num", text: doneText })));
        if (!fired) { fired = true; if (onDone) setTimeout(onDone, 50); }
        return false;
      }
      nums.d.textContent = String(Math.floor(left / 86400));
      nums.h.textContent = String(Math.floor((left % 86400) / 3600)).padStart(2, "0");
      nums.m.textContent = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
      nums.s.textContent = String(left % 60).padStart(2, "0");
      return true;
    };
    if (tick()) {
      const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000);
      timers.push(id);
    }
    return box;
  }

  // ---------------------------------------------------------------- the weekly grid
  // When someone can play is 168 hours of a week in UTC (Monday 00:00 UTC = hour 0); the grid shows it in the viewer's
  // own time zone, as seven days of eight three-hour blocks. Every conversion uses the zone's offset in the week the
  // server names (after launch, winter time), so an evening means the same hours whenever it was filled in.
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const myZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  function zoneOffset(tz) {
    // Minutes to add to UTC for local time in `tz`, in the reference week.
    const at = new Date((M().avail.reference || 1794398400) * 1000);
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map((p) => [p.type, p.value]));
      return Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute) - at.getTime()) / 60000);
    } catch {
      return 0;
    }
  }
  const zoneOk = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
  const mod = (n, m) => ((n % m) + m) % m;
  const utcHour = (localHour, off) => mod(Math.floor((localHour * 60 - off) / 60), 168);
  function bitsFromHex(hex) {
    const out = new Array(168).fill(0);
    if (!/^[0-9a-f]{42}$/.test(hex || "")) return out;
    for (let i = 0; i < 42; i++) { const v = parseInt(hex[i], 16); out[i * 4] = (v >> 3) & 1; out[i * 4 + 1] = (v >> 2) & 1; out[i * 4 + 2] = (v >> 1) & 1; out[i * 4 + 3] = v & 1; }
    return out;
  }
  function hexFromBits(bits) {
    let s = "";
    for (let i = 0; i < 168; i += 4) s += ((bits[i] ? 8 : 0) | (bits[i + 1] ? 4 : 0) | (bits[i + 2] ? 2 : 0) | (bits[i + 3] ? 1 : 0)).toString(16);
    return s;
  }
  /** Blocks [day][block] on/off in `tz`: a block is on when at least two of its three hours are. */
  function blocksFromBits(bits, tz) {
    const off = zoneOffset(tz);
    return DAYS.map((_, d) => Array.from({ length: 8 }, (_, b) => [0, 1, 2].filter((i) => bits[utcHour(d * 24 + b * 3 + i, off)]).length >= 2));
  }
  function bitsFromBlocks(blocks, tz) {
    const off = zoneOffset(tz);
    const bits = new Array(168).fill(0);
    blocks.forEach((row, d) => row.forEach((on, b) => { if (on) for (let i = 0; i < 3; i++) bits[utcHour(d * 24 + b * 3 + i, off)] = 1; }));
    return bits;
  }
  /** Raid evenings: the same count the Worker makes (its windows come in meta.avail.prime). */
  function fitOf(bits) {
    const p = M().avail.prime;
    const count = (ev) => ev.filter((hours) => hours.filter((x) => bits[x]).length >= p.min).length;
    return { na: count(p.na || []), eu: count(p.eu || []) };
  }
  const blockLabel = (b) => `${String(b * 3).padStart(2, "0")}\u2013${String(b * 3 + 3).padStart(2, "0")}`;
  function fitView(fit, { compact = false } = {}) {
    if (!fit) return h("span", { class: "fit muted", text: "No times given" });
    if (compact) return h("span", { class: "fit-compact", title: "Raid evenings a week this person can make (at least three of the five evening hours)" }, "NA ", h("b", { text: String(fit.na) }), " · EU ", h("b", { text: String(fit.eu) }));
    const pips = (n) => h("span", { class: "pips", "aria-hidden": "true" }, Array.from({ length: 7 }, (_, i) => h("i", { class: i < n ? "on" : "" })));
    return h("span", { class: "fit", title: "Raid evenings a week this person can make (at least three of the five evening hours)" },
      h("span", null, "NA ", h("b", { text: `${fit.na}/7` }), pips(fit.na)),
      h("span", null, "EU ", h("b", { text: `${fit.eu}/7` }), pips(fit.eu)));
  }
  /** The grid itself. With onChange it can be edited (click or drag across blocks); without, it only shows. */
  let painting = null; // true or false while a drag across the grid is marking or clearing blocks
  window.addEventListener("pointerup", () => { painting = null; });
  window.addEventListener("pointercancel", () => { painting = null; });
  function availGrid(blocks, { onChange, label = "When you can play" } = {}) {
    const table = h("table", { class: "grid-avail" + (onChange ? "" : " readonly"), "aria-label": label });
    const head = h("tr", null, h("th", { class: "t", scope: "col", text: "" }), DAYS.map((d, i) => h("th", { scope: "col", title: DAY_NAMES[i], text: d })));
    const body = h("tbody");
    const set = (btn, d, b, on) => {
      if (blocks[d][b] === on) return;
      blocks[d][b] = on;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (onChange) onChange();
    };
    for (let b = 0; b < 8; b++) {
      const tr = h("tr", null, h("th", { class: "t", scope: "row", text: blockLabel(b) }));
      for (let d = 0; d < 7; d++) {
        const btn = h("button", { type: "button", "aria-pressed": blocks[d][b] ? "true" : "false", "aria-label": `${DAY_NAMES[d]} ${blockLabel(b)}`, title: `${DAY_NAMES[d]} ${blockLabel(b)}`, tabindex: onChange ? "0" : "-1" });
        if (onChange) {
          btn.addEventListener("pointerdown", (e) => { e.preventDefault(); painting = !blocks[d][b]; set(btn, d, b, painting); });
          btn.addEventListener("pointerenter", () => { if (painting !== null) set(btn, d, b, painting); });
          btn.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); set(btn, d, b, !blocks[d][b]); } });
        }
        tr.appendChild(h("td", null, btn));
      }
      body.appendChild(tr);
    }
    add(table, [h("thead", null, head), body]);
    return h("div", { class: "avail-wrap" }, table);
  }
  const zoneName = (tz) => {
    const off = zoneOffset(tz);
    const sign = off < 0 ? "−" : "+";
    const a = Math.abs(off);
    return `${tz.replace(/_/g, " ")} (UTC${sign}${Math.floor(a / 60)}${a % 60 ? ":" + String(a % 60).padStart(2, "0") : ""} in November)`;
  };
  const LATAM = /^America\/(Mexico_City|Monterrey|Merida|Cancun|Tijuana|Chihuahua|Hermosillo|Mazatlan|Bogota|Lima|Santiago|Argentina\/.*|Buenos_Aires|Sao_Paulo|Caracas|La_Paz|Montevideo|Asuncion|Guayaquil|Panama|Costa_Rica|Guatemala|El_Salvador|Tegucigalpa|Managua|Havana|Santo_Domingo|Belem|Fortaleza|Recife|Manaus|Bahia|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Maceio|Araguaina|Belize|Paramaribo|Cayenne)$/;
  function regionFromZone(tz) {
    if (/^Europe\//.test(tz) || /^Atlantic\/(Reykjavik|Canary|Madeira|Faroe|Azores)$/.test(tz)) return "eu";
    if (/^(Australia\/|Pacific\/(Auckland|Chatham|Fiji))/.test(tz)) return "oce";
    if (/^Asia\//.test(tz)) return "asia";
    if (LATAM.test(tz)) return "latam";
    if (/^(America\/|Pacific\/Honolulu|US\/|Canada\/)/.test(tz)) {
      const off = zoneOffset(tz);
      return off <= -480 ? "na_west" : off === -420 ? "na_mountain" : off === -360 ? "na_central" : "na_east";
    }
    return "";
  }

  // ---------------------------------------------------------------- people: pick from Discord or type a name
  const TYPED_RE = /^[\p{L}\p{N}][\p{L}\p{N} '._-]*$/u;
  function typedProblem(s) {
    if ([...s].length < 2) return "Type at least two characters.";
    if ([...s].length > 40) return "At most 40 characters.";
    if (/[<>@#]|https?:|www\.|discord\.gg|\.com\b/i.test(s)) return "Just the name, please: no links, mentions or tags.";
    if (!TYPED_RE.test(s)) return "Letters, digits, spaces, apostrophes, dots, dashes and underscores only.";
    return "";
  }
  function avatarEl(p) {
    if (p.kind === "discord") return discordAvatar(p, { width: "32", height: "32", loading: "lazy" });
    return h("img", { class: "typed-icon", src: art("icon-names"), alt: "", width: "32", height: "32" }); // .112: a typed name shows the official scroll icon (INV_Scroll_03), not a letter badge
  }
  function personRow(p, { onRemove, extra, note } = {}) {
    return h("div", { class: "person" },
      avatarEl(p),
      h("div", { class: "nm" },
        h("b", { text: p.label }),
        h("small", { text: p.kind === "name" ? "typed by hand (not picked from Discord)" : "Discord member" }),
        note || null),
      extra || null,
      onRemove ? h("button", { class: "x", type: "button", title: "Remove", "aria-label": `Remove ${p.label}`, onclick: onRemove }) : null);
  }
  // Answers already fetched on this page, by query, for five minutes: the same letters are never asked for twice.
  const searchCache = new Map();
  async function searchPeople(q, appointmentOnly = false, live) {
    // Appointment standing is a current admin hint. Do not reuse the ordinary five-minute name cache.
    if (appointmentOnly) return api("GET", "/api/search?purpose=appointment&q=" + encodeURIComponent(q), undefined, { live });
    const key = q.toLowerCase();
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.at < 300000) return hit.res;
    const res = await api("GET", "/api/search?q=" + encodeURIComponent(q), undefined, { live });
    if (!res.limited && !res.unavailable) searchCache.set(key, { at: Date.now(), res });
    return res;
  }

  /** A search box over Asmongold's Discord (via the Worker) with a "type the name instead" fallback. */
  function picker({ placeholder = "Search Discord by name…", onPick, allowTyped = true, allowSelf = false, appointmentOnly = false, exclude = () => false, label = "Find someone", isCurrent = () => true }) {
    const id = "pk" + Math.random().toString(36).slice(2, 8);
    const input = h("input", { type: "search", id, placeholder, autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "false", "aria-controls": id + "-list", "aria-autocomplete": "list" });
    const onlySite = h("input", { type: "checkbox" });
    // Keep the native checkbox in the tab order. The popup stays open while focus
    // moves inside this picker, rather than hiding its filter when the input blurs.
    const tools = h("label", { class: "list-tools" }, onlySite, h("span", { text: "Only people with a current site profile" }));
    onlySite.addEventListener("change", () => { if (last) build(last.res, last.q); });
    const rowsBox = h("div", { role: "listbox", id: id + "-list" });
    const list = h("div", { class: "list", hidden: true }, tools, rowsBox);
    const root = h("div", { class: "picker" }, h("label", { class: "sr", for: id, text: label }), input, list);
    let items = [];
    let active = -1;
    let timer = 0;
    let seq = 0;
    let last = null;
    const selectable = it => (allowSelf || !it.self) && !exclude(it) && (!appointmentOnly || it.appointmentStatus === "eligible");
    const appointmentHint = it => it.appointmentStatus === "eligible" ? "Discord membership confirmed. No website sign-in is required; Save checks again."
      : "Currently unavailable for publication. Check current Discord membership and account standing, then search again.";
    const close = () => { clearTimeout(timer); timer = 0; seq++; list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
    const open = () => { list.hidden = false; input.setAttribute("aria-expanded", "true"); };
    const state = (msg, withTools = false) => { tools.hidden = !withTools; clear(rowsBox).appendChild(h("div", { class: "state", text: msg })); open(); };
    function draw(notes = []) {
      clear(rowsBox);
      tools.hidden = !(last && (last.res.results || []).length);
      items.forEach((it, i) => {
        const disabled = !selectable(it);
        const row = h("div", { class: "row", role: "option", "aria-selected": i === active ? "true" : "false", "aria-disabled": disabled ? "true" : "false", id: `${id}-o${i}` },
          it.typed ? h("img", { class: "typed-icon", src: art("icon-names"), alt: "" }) : discordAvatar(it), // Only authenticated Discord lookup results may use this bounded avatar.
          h("div", { class: "nm" }, h("div", { text: it.typed ? `Add “${it.label}” by name` : it.shown || it.label }), it.typed ? h("div", { class: "sub", text: "For someone who is not on Discord, or could not be found" }) : appointmentOnly ? h("div", { class: "sub", text: appointmentHint(it) }) : null),
          it.self ? h("span", { class: "badge muted", text: "you" }) : null,
          !it.typed && it.onSite ? h("span", { class: "badge", text: "site profile" }) : null,
          !it.typed && it.linked ? h("span", { class: "badge green", text: "verified in game" }) : null,
          disabled && !it.self ? h("span", { class: "badge muted", text: appointmentOnly && it.appointmentStatus !== "eligible" ? "unavailable" : "added" }) : null);
        row.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
        rowsBox.appendChild(row);
      });
      for (const n of notes) rowsBox.appendChild(h("div", { class: "state", text: n }));
      if (active >= 0) input.setAttribute("aria-activedescendant", `${id}-o${active}`);
      open();
    }
    function build(res, q) {
      items = (res.results || [])
        .filter((r) => !onlySite.checked || r.onSite)
        .map((r) => ({ kind: "discord", key: r.id, label: r.label, shown: r.shown, avatarUrl: r.avatarUrl, self: r.self, onSite: r.onSite, linked: r.linked, appointmentStatus: r.appointmentStatus })); // .114: shown = every differing name; label = what a pick stores
      const problem = typedProblem(q);
      if (allowTyped && !problem) items.push({ kind: "name", key: q.toLowerCase().replace(/\s+/g, " "), label: q.replace(/\s+/g, " "), typed: true });
      active = items.findIndex(selectable);
      const notes = [];
      if (res.limited) notes.push("Discord is limiting searches right now; results may be missing. Try again in a few seconds.");
      if (res.unavailable) notes.push(allowTyped ? "Discord search is unavailable right now. You can still add the name by hand." : "Discord search is unavailable right now. Try again shortly.");
      if (!items.length) return state(notes[0] || (onlySite.checked && (res.results || []).length ? "None of these accounts has a current site profile." : allowTyped ? problem || "Nobody found." : "Nobody found."), (res.results || []).length > 0);
      draw(notes);
    }
    async function run() {
      if (!isCurrent()) { close(); return; }
      const q = input.value.trim().replace(/^@/, "");
      if ([...q].length < 2) { close(); return; }
      const my = ++seq;
      state("Searching…");
      let res;
      try { res = await searchPeople(q, appointmentOnly, isCurrent); } catch (e) { res = { results: [], unavailable: e.status !== 429, limited: e.status === 429 }; }
      if (my !== seq || !isCurrent()) return;
      last = { res, q };
      build(res, q);
    }
    function choose(i) {
      if (!isCurrent()) { close(); return; }
      const it = items[i];
      if (!it || !selectable(it)) return;
      onPick({ kind: it.kind, key: it.key, label: it.label, avatarUrl: it.avatarUrl || null });
      input.value = "";
      items = [];
      last = null;
      close();
      input.focus();
    }
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 450); });
    input.addEventListener("keydown", (e) => {
      if (list.hidden && e.key === "ArrowDown") { run(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        let i = active;
        for (let n = 0; n < items.length; n++) {
          i = (i + step + items.length) % items.length;
          if (selectable(items[i])) break;
        }
        active = selectable(items[i]) ? i : -1;
        draw();
      } else if (e.key === "Enter") {
        if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); }
      } else if (e.key === "Escape") close();
    });
    root.addEventListener("focusout", () => setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 120));
    root.addEventListener("keydown", e => { if (e.key === "Escape" && e.target === onlySite) { close(); input.focus(); } });
    return root;
  }

  // ---------------------------------------------------------------- page chrome
  const signInIcon = () => icon("pos-community", "discord-mark");
  const signInButton = (big = true) => h("a", { class: "btn" + (big ? " big" : " small"), href: "/auth/login" }, signInIcon(), "Sign in with Discord");
  // .111: the Olympus crest (the guild's own logo, as on guild.roachcouncil.com) is the website's one exception to the official game art (Viktor, 1 Oct 2026)
  const brand = () => h("a", { class: "brand", href: "#/" }, h("img", { src: "/static/olympus-icon.png", alt: "", width: "44", height: "44" }), h("span", null, h("b", { text: "Olympus" }), h("small", { text: "FOREVER" })));

  // .170: ordinary navigation disclosures, not ARIA application menus. Only one
  // is open; fine-mouse hover has a small bridge, while tap and keyboard stay explicit.
  let navCloseTimer = 0;
  const cancelNavClose = () => { clearTimeout(navCloseTimer); navCloseTimer = 0; };
  function closeNavMenus(except = null) {
    cancelNavClose();
    for (const menu of app.querySelectorAll("nav.nav details.nav-group")) {
      if (menu === except) continue;
      menu.removeAttribute("open");
      menu.querySelector("summary").setAttribute("aria-expanded", "false");
    }
  }
  function openNavMenu(menu, open) {
    if (open) closeNavMenus(menu);
    if (open) menu.setAttribute("open", "");
    else menu.removeAttribute("open");
    menu.querySelector("summary").setAttribute("aria-expanded", String(open));
  }
  const fineNavMouse = event => event.pointerType === "mouse" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest("nav.nav details.nav-group")) closeNavMenus();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const open = app.querySelector("nav.nav details.nav-group[open]");
    if (!open) return;
    event.preventDefault();
    closeNavMenus();
    open.querySelector("summary").focus();
  });
  function topbar(route) {
    const head = route.split("/")[0];
    const nav = h("nav", { class: "nav", "aria-label": "Sections" });
    const link = ([href, text]) => h("a", { class: "btn small", href, text, "aria-current": (href === "#/" ? head === "" : route === href.slice(2) || route.startsWith(href.slice(2) + "/")) ? "page" : false });
    const group = (label, links) => {
      const id = "nav-menu-" + label.toLowerCase();
      const summary = h("summary", { class: "btn small", text: label, "aria-expanded": "false", "aria-controls": id });
      const menu = h("details", { class: "nav-group", name: "olympus-sections" }, summary,
        h("div", { class: "nav-menu", id }, links.map(link)));
      let pointerInside = false;
      summary.addEventListener("click", event => { event.preventDefault(); openNavMenu(menu, pointerInside && event.detail > 0 ? true : !menu.hasAttribute("open")); });
      summary.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault(); openNavMenu(menu, true);
        const targets = menu.querySelectorAll(".nav-menu a");
        const target = event.key === "ArrowUp" ? targets[targets.length - 1] : targets[0];
        if (target) target.focus();
      });
      menu.addEventListener("toggle", () => {
        if (menu.hasAttribute("open")) openNavMenu(menu, true);
        else summary.setAttribute("aria-expanded", "false");
      });
      menu.addEventListener("pointerenter", event => {
        if (!fineNavMouse(event)) return;
        pointerInside = true; openNavMenu(menu, true);
      });
      menu.addEventListener("pointerleave", event => {
        if (!fineNavMouse(event)) return;
        pointerInside = false;
        if (!menu.hasAttribute("open")) return;
        cancelNavClose();
        navCloseTimer = setTimeout(() => {
          navCloseTimer = 0;
          const focused = document.activeElement;
          if (!pointerInside && !(focused && focused !== summary && menu.contains(focused))) openNavMenu(menu, false);
        }, 180);
      });
      menu.addEventListener("focusin", event => { cancelNavClose(); if (event.target !== summary) openNavMenu(menu, true); });
      menu.addEventListener("focusout", event => { if (!pointerInside && event.relatedTarget && !menu.contains(event.relatedTarget)) openNavMenu(menu, false); });
      menu.addEventListener("click", event => {
        if (event.defaultPrevented || event.button && event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !event.target.closest || !event.target.closest("a")) return;
        cancelNavClose(); navCloseTimer = setTimeout(() => { navCloseTimer = 0; openNavMenu(menu, false); }, 0);
      });
      return menu;
    };
    if (S.signedIn && !S.denied) {
      add(nav, [["#/", "Home"], ["#/apply", "Apply"], ["#/vote", "Vote"]].map(link));
      add(nav, group("Guild", [["#/roles", "Roles"], ["#/governance", "Governance"], ["#/organization", "Organization"], ["#/treasury-plan", "Treasury plan"]]));
      if (can("applicantWrite") && (anyCommunity() || can("armyRead"))) {
        const sections = [["#/community", "Community overview"]];
        if (can("armyRead")) sections.push(["#/community/army", "Army"]);
        if (feat("directory")) sections.push(["#/community/directory", "Member directory"], ["#/community/profile", "My profile"]);
        if (feat("crafting")) sections.push(["#/community/workshop", "Crafters & Artisans"]);
        if (feat("events")) sections.push(["#/community/calendar", "Calendar"]);
        if (feat("trials")) sections.push(["#/community/trial", "My trial"]);
        if (feat("contributions")) sections.push(["#/community/dues", "Treasury & tithes"]);
        if (newsOn()) sections.push(["#/news", "Town Crier"]);
        if (anyCommunity()) sections.push(["#/community/leadership", "Leadership"]);
        if (feat("census") && can("confirmedGuildData")) sections.push(["#/community/census", "Census preview"]);
        add(nav, group("Community", sections));
      }
      const resources = [["#/guide/member", "Member guide"], ["#/guide/officer", "Officer guide"], ["#/talents", "Talent calculator"], ["#/addons", "Addons"], ["#/guides", "Class and profession guides"], ["#/updates", "Game updates"]];
      if (S.qrVerification && S.qrVerification.enabled === true) resources.push(["/static/qr-phase1.html", "Verify in game"]);
      add(nav, group("Resources", resources));
    }
    if (S.user && S.user.isAdmin) add(nav, group("Staff", [["#/admin", "Admin"], ["#/guide/officer", "Officer guide"]]));
    let shield = null;
    if (S.user && (S.user.isAdmin || S.user.canUseStreamShield === true)) {
      // Owner .198: compact, named icon control; the preference remains presentation-only.
      shield = h("button", { class: "btn small stream-shield-toggle", type: "button", "aria-label": "Stream Shield", "aria-pressed": String(streamShield), title: "Stream Shield" }, icon("icon-shield"));
      shield.addEventListener("click", () => {
        streamShield = !streamShield;
        try { sessionStorage.setItem("olympus.streamShield", streamShield ? "on" : "off"); } catch { /* Presentation still changes for this page. */ }
        if (streamShield) { const dialogs = [...document.querySelectorAll("dialog")].filter(open => open.open); for (const open of dialogs) open.close(); if (dialogs.length) toast("Stream Shield closed the private dialog. No pending action was confirmed."); }
        document.documentElement.setAttribute("data-stream-shield", streamShield ? "on" : "off");
        shield.setAttribute("aria-pressed", String(streamShield));
      });
    }
    const who = S.signedIn && S.user
      ? h("div", { class: "who" },
          ownAvatar(S.user), // .114: the member's own Discord picture (header only)
          h("span", { class: "name", text: discordIdentity(S.user), title: discordIdentity(S.user) }),
          h("button", { class: "btn small", type: "button", text: "Sign out", onclick: signOut }))
      : h("div", { class: "who" }, signInButton(false));
    return h("header", { class: "topbar" }, h("div", { class: "topbar-in" }, brand(), nav, h("div", { class: "topbar-actions" }, shield, who)));
  }
  function footer() {
    const cursor = h("button", { class: "btn small", type: "button", text: "Game cursor", "aria-pressed": String(gameCursor), title: "Use the World of Warcraft cursor with a mouse" });
    cursor.addEventListener("click", () => {
      gameCursor = !gameCursor;
      document.documentElement.setAttribute("data-game-cursor", gameCursor ? "on" : "off");
      cursor.setAttribute("aria-pressed", String(gameCursor));
      try { sessionStorage.setItem("olympus.gameCursor", gameCursor ? "on" : "off"); } catch { /* The preference still works for this page. */ }
    });
    return h("footer", { class: "footer" },
      h("div", { class: "footer-in" },
        h("div", null, brand(), cursor),
        h("div", null,
          h("p", null, "A free, fan-made, non-commercial site for Olympus, a player guild in World of Warcraft: Forever. Not affiliated with or endorsed by Blizzard Entertainment or Discord."),
          h("p", null, "World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries. The Olympus crest is the guild's own logo. The login portal animation is a guild-rendered derivative of the original World of Warcraft client model and textures, with a static reduced-motion poster; it is not a publisher-issued movie or endorsement. The remaining game interface artwork and icons come from the World of Warcraft game client and are the property of Blizzard Entertainment, Inc. The two interface fonts come from the same client and keep their embedded notices (Friz Quadrata: International Typeface Corporation, 1997; Morpheus: Kiwi Media/Design, Eric Oehler, 1996); they remain their respective owners' property, and the site's code licence does not extend to any of this."))));
  }
  async function signOut() {
    if (disposeCensusPreview) disposeCensusPreview();
    if (dirtyKeys.size && !(await confirmBox("Leave without saving?", "You have changes that are not saved yet.", "Sign out anyway"))) return;
    if (disposeArmyCapacity) disposeArmyCapacity(); // Clear dated capacity before logout transport; preserve publisher custody.
    try { await api("POST", "/auth/logout"); } catch { /* signed out either way */ }
    location.href = "/";
  }

  const FLASH = {
    not_member: ["You are not in Asmongold's Discord server", "Only members of Asmongold's Discord server can register. Join it, then sign in again."],
    pending: ["Finish joining Asmongold's server first", "You are in the server but have not accepted its rules yet (membership screening). Accept them in Discord, then sign in again."],
    cancelled: ["Sign-in cancelled", "Nothing was saved. Sign in again whenever you are ready."],
    expired: ["That sign-in expired", "The link was already used or took too long. Start again with the button below."],
    discord_error: ["Discord did not answer as expected", "Try again in a moment. If it keeps happening, tell an officer."],
    busy: ["Discord is busy", "Discord is limiting sign-ins right now. Wait a minute, then try again."],
    not_configured: ["Sign-in is not set up yet", "The site is missing a setting on the server. Tell an officer."],
    updating: ["The site is updating", "Try again in a minute."],
  };
  function flashBox() {
    const f = S.flash;
    if (!f || !FLASH[f.kind]) return null;
    const [title, body] = FLASH[f.kind];
    return frame(title, null,
      h("p", { text: body }),
      f.kind === "not_member" && S.joinUrl ? h("p", null, h("a", { class: "btn", href: S.joinUrl, rel: "noopener", target: "_blank", text: "Join Asmongold's Discord" })) : null,
      f.detail ? h("p", { class: "faint tiny", text: `Detail: ${f.detail}` }) : null);
  }

  // ---------------------------------------------------------------- router
  const ROUTES = {};
  const OLD = { nominate: "vote", friends: "", names: "", me: "" }; // pages merged in .43: names and friends are on Home
  // Only a table's own keys are routes: "#/constructor" or "#/toString" is an unknown page, not Object's machinery.
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  /** An address part, decoded; a malformed one (say "%E0") is simply no match. */
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return ""; } };
  function currentRoute() { return (location.hash || "#/").replace(/^#\/?/, ""); }
  const pageTitle = label => { document.title = `${label} — Olympus`; };
  // Titles identify the section, never a private account, event or case from an address.
  function routeTitle(route) {
    const [head, sub, detail, action] = route.split("/");
    const community = { "": "Overview", directory: "Member directory", profile: "My profile", workshop: "Crafters & Artisans", calendar: "Calendar", census: "Census preview", trial: "My trial", dues: "My dues", news: "Guild news", army: "Army", leadership: "Leadership" };
    const staff = { "": "Overview", applications: detail ? "Application details" : "Applications", votes: "Votes", names: "Reserved names", friends: "Friends", lookup: "Lookup", settings: "Settings", ranks: "Rank planner", treasury: "Treasury", "approved-guilds": "Signed guild list", renames: "Renames", news: "News", audit: "Audit log", "ruleset-publication": "Ruleset publication", community: "Community" };
    const staffCommunity = { trials: "Trials", departures: "Departures", cases: "Restriction cases", ledger: "Contribution ledger", inbox: "Private requests", claims: "Character claims" };
    if (head === "admin") return `Admin · ${sub === "community" && own(staffCommunity, detail) ? staffCommunity[detail] : own(staff, sub || "") ? staff[sub || ""] : "Overview"}`;
    if (head === "community") {
      const eventActions = { edit: "Edit event", attendance: "Attendance", discord: "Discord announcement" };
      const event = sub === "calendar" && detail ? (detail === "new" ? "New event" : own(eventActions, action) ? eventActions[action] : "Event details") : "";
      return `Community · ${event || (own(community, sub || "") ? community[sub || ""] : "Not here")}`;
    }
    if (head === "talents") { const cls = M().classes.find(c => c.key === dec(sub || "warrior")); return cls ? `${cls.label} talents` : "Talents"; }
    if (head === "vote") { const ballot = M().ballots.find(b => b.key === dec(sub || "")); return ballot ? `${ballot.label} · Vote` : "Vote"; }
    if (head === "roles" && sub) { const role = M().positions.find(p => p.key === dec(sub)); if (role) return `${role.label} · Roles`; }
    if (head === "guide") return sub === "officer" ? "Officer guide" : "Member guide";
    if (head === "legal") return sub === "privacy" ? "Privacy Policy" : sub === "terms" ? "Terms of Service" : "Legal";
    return ({ "": "Home", apply: "Apply", vote: "Vote", roles: "Roles", governance: "Governance", organization: "Organization", "treasury-plan": "Treasury plan", addons: "Addons", guides: "Guides", updates: "Game updates", news: "Town Crier", army: sub === "report" ? "Army reporter" : "Army", data: "Account data", request: "Private request" })[head] || "Home";
  }
  let lastHash = location.hash;
  let ignoreHash = false;
  document.addEventListener("click", event => {
    if (!S.signedIn || S.denied || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button && event.button !== 0) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || !app.contains(anchor) || anchor.getAttribute("target") === "_blank") return;
    const href = anchor.getAttribute("href");
    const legal = /^\/legal\/(privacy|terms)$/.exec(href || "") || /^https:\/\/olympus\.roachcouncil\.com\/legal\/(privacy|terms)$/.exec(href || "");
    if (legal) { event.preventDefault(); location.hash = "#/legal/" + legal[1]; }
  });
  window.addEventListener("hashchange", async () => {
    if (disposeCensusPreview) disposeCensusPreview();
    if (ignoreHash) { ignoreHash = false; return; }
    if ((navigationGuard && !navigationGuard.canLeave() || window.OlympusArmyReportTool?.isNavigationHeld()) && currentRoute() !== "army/report") {
      ignoreHash = true; location.hash = lastHash;
      toast("The Army publication is awaiting an answer. Check its original outcome before leaving this workspace.", "bad");
      return;
    }
    if (dirtyKeys.size) {
      const target = location.hash;
      ignoreHash = true;
      location.hash = lastHash;
      if (!(await confirmBox("Leave without saving?", "You have changes on this page that are not saved yet.", "Leave anyway"))) return;
      dirtyKeys.clear();
      ignoreHash = true;
      location.hash = target;
    }
    lastHash = location.hash;
    render();
  });
  window.addEventListener("beforeunload", (e) => { if (dirtyKeys.size || navigationGuard && !navigationGuard.canLeave() || window.OlympusArmyReportTool?.isNavigationHeld()) { e.preventDefault(); e.returnValue = ""; } });
  // "#/names" and "#/friends" are sections of Home. Clicked on Home itself, they only scroll there: no new page, so
  // nothing typed elsewhere on Home is lost or questioned. From any other page the router takes them (old links too).
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target instanceof Element ? e.target.closest('a[href="#/names"], a[href="#/friends"]') : null;
    const section = link && document.getElementById(link.getAttribute("href").slice(2));
    if (!section) return;
    e.preventDefault();
    scrollToSection(section, true);
  });
  /** Scrolls so `el` starts just below the sticky top bar (which would otherwise cover its heading). */
  function scrollToSection(el, smooth = false) {
    const bar = document.querySelector(".topbar");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.getBoundingClientRect().height : 0) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  }
  const setDirty = (key, on, el) => { if (on) dirtyKeys.add(key); else dirtyKeys.delete(key); if (el) el.hidden = !on; };

  let chromeKey = "";
  let streamShield = false;
  try { streamShield = S.signedIn && !S.denied && !!S.user && (S.user.isAdmin || S.user.canUseStreamShield === true) && sessionStorage.getItem("olympus.streamShield") === "on"; } catch { /* The current page still has an attended toggle. */ }
  document.documentElement.setAttribute("data-stream-shield", streamShield ? "on" : "off");
  function render() {
    if (!S.signedIn || S.denied || !S.user || !(S.user.isAdmin || S.user.canUseStreamShield === true)) {
      streamShield = false;
      document.documentElement.setAttribute("data-stream-shield", "off");
    }
    closeNavMenus();
    if (disposeSeatsNotice) disposeSeatsNotice();
    appointmentPendingRead = null;
    for (const dispose of [...appointmentReaders]) dispose();
    if (disposeTool) disposeTool();
    if (disposeGovernancePrint) disposeGovernancePrint();
    if (disposeOrganization) { disposeOrganization(); disposeOrganization = null; }
    if (disposeCensusPreview) disposeCensusPreview();
    for (const t of timers) clearInterval(t);
    timers = [];
    dirtyKeys.clear();
    let route = currentRoute();
    const first = route.split("/")[0];
    let scrollTo = "";
    if (own(OLD, first)) {
      route = OLD[first];
      if (first === "names" || first === "friends") scrollTo = first;
      history.replaceState(null, "", "#/" + route);
      lastHash = location.hash;
    }
    const [head] = route.split("/");
    // Keep the loaded avatar and navigation mounted between routes. Rebuild when identity or admission changes.
    const nextChromeKey = JSON.stringify([S.signedIn, S.denied, S.user, COM().features, anyCommunity(), can("applicantWrite"), can("armyRead"), can("confirmedGuildData"), communityReader(), S.qrVerification, S.settings && S.settings.newsOn, S.settings && S.settings.notice]);
    const previousMain = app.querySelector("main.shell");
    const reuseChrome = chromeKey === nextChromeKey && previousMain;
    if (!reuseChrome) {
      clear(app);
      app.appendChild(topbar(route));
      app.appendChild(h("div", { class: "stream-shield-curtain", role: "status", text: "Stream Shield is on. Private guild content is hidden in this window. Use the header toggle to show it again." }));
      if (S.settings && S.settings.notice) app.appendChild(h("div", { class: "notice" }, noticeBox("info", "icon-apply", h("p", { text: S.settings.notice }))));
      chromeKey = nextChromeKey;
    } else {
      for (const link of app.querySelectorAll("nav.nav a")) {
        const target = link.getAttribute("href");
        if (target === "#/" ? head === "" : target.startsWith("#/") && (route === target.slice(2) || route.startsWith(target.slice(2) + "/"))) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      }
    }
    const keepBoard = reuseChrome && head === "vote" && previousMain.dataset.routeHead === "vote" && S.signedIn && !S.denied;
    const main = keepBoard ? previousMain : h("main", { class: "shell", id: "main" });
    main.dataset.routeHead = head;
    if (reuseChrome && !keepBoard) previousMain.replaceWith(main);
    else if (!reuseChrome) app.appendChild(main);
    let view = own(ROUTES, head) ? ROUTES[head] : ROUTES[""];
    if (!S.signedIn) { if (!PUBLIC_ROUTES.has(head)) view = ROUTES[""]; } // client fallback only; the server requires current membership for this shell and Roles data
    else if (S.denied) view = IDENTITY_ROUTES.has(head) ? ROUTES[head] : deniedView;
    if (head === "admin" && !(S.user && S.user.isAdmin)) view = ROUTES[""];
    pageTitle(view === deniedView ? "Access restricted" : view === ROUTES[""] ? "Home" : routeTitle(route));
    const viewRequest = String(Number(main.dataset.viewRequest || 0) + 1);
    main.dataset.viewRequest = viewRequest;
    try {
      const out = view(main, route.split("/").slice(1));
      const names = () => { if (main.parentNode === app && main.dataset.viewRequest === viewRequest) hydrateAppointmentNames(main, () => main.parentNode === app && main.dataset.viewRequest === viewRequest); };
      if (out && typeof out.then === "function") out.then(names).catch(error => { if (main.dataset.viewRequest === viewRequest) showError(main)(error); });
      else names();
    } catch (e) {
      showError(main)(e);
    }
    if (!reuseChrome) app.appendChild(footer());
    const target = scrollTo && document.getElementById(scrollTo);
    if (target) scrollToSection(target);
    else if (!keepBoard) window.scrollTo(0, 0);
  }
  const showError = (main) => (e) => {
    if (e && e.status === 401 || main.parentNode !== app) return;
    main.appendChild(frame("Something went wrong", null, h("p", { text: (e && e.message) || String(e) })));
  };

  // Tools are original, same-origin renderers. Script promises hold no account data;
  // route disposal ends their observers/requests before another view can use the shell.
  const toolScripts = new Map();
  async function loadMemberScript(namespace, file) {
    if (window[namespace]) return;
    if (!toolScripts.has(namespace)) toolScripts.set(namespace, new Promise((resolve, reject) => {
      const script = h("script", { src: file });
      script.addEventListener("load", resolve);
      script.addEventListener("error", () => { toolScripts.delete(namespace); reject(new Error("The tool could not be loaded. Try opening it again.")); });
      document.head.appendChild(script);
    }));
    await toolScripts.get(namespace);
  }
  async function memberTool(main, namespace, file, stylesheet, options) {
    const live = () => main.parentNode === app;
    const box = h("div", { class: "member-tool" }, h("p", { role: "status", class: "muted", text: "Opening tool…" }));
    add(main, box);
    if (!document.querySelector(`link[data-olympus-tool="${namespace}"]`)) document.head.appendChild(h("link", { rel: "stylesheet", href: stylesheet, "data-olympus-tool": namespace }));
    await loadMemberScript(namespace, file);
    if (!live()) return;
    const settings = typeof options === "function" ? await options() : options;
    if (!live()) return;
    clear(box);
    const instance = await window[namespace].mount(box, settings);
    if (!live()) { if (instance && instance.destroy) instance.destroy(); return; }
    disposeTool = () => { if (instance && instance.destroy) instance.destroy(); disposeTool = null; };
  }
  ROUTES.talents = (main, parts) => memberTool(main, "OlympusTalents", "/static/talents/calculator.js", "/static/talents/calculator.css", async () => {
    // .186: both modules are optional. allSettled lets a failed load leave the calculator working without that feature, and the
    // calculator names what is missing. Any module whose global is still absent (a load error, or a script that loaded but threw or
    // never defined it) loses its cache entry, so the next visit requests it again. A script that never answers still holds the route.
    const optional = [["analysis", "OlympusTalentAnalysis", "/static/talents/analysis.js"], ["guideBuilds", "OlympusTalentGuides", "/static/talents/guide-builds179.js"]];
    await Promise.allSettled(optional.map(([, namespace, file]) => loadMemberScript(namespace, file)));
    const unavailable = optional.filter(([, namespace]) => !window[namespace]);
    for (const [, namespace] of unavailable) toolScripts.delete(namespace);
    return {
      analysis: window.OlympusTalentAnalysis, guideBuilds: window.OlympusTalentGuides, unavailable: unavailable.map(([key]) => key),
      // .189 (prepared as .186): the level-60 sheet is optional and independent; it loads only when its section is opened, never on
      // route entry. It follows the same settled rule as the pair above: a load error, or a script that loaded without defining its
      // global, resolves to undefined (the calculator names the sheet unavailable inside its section) and loses its cache entry, so
      // the next opening requests stats60.js again. A script that never answers still holds only that section.
      loadStats60: () => Promise.allSettled([loadMemberScript("OlympusTalentStats60", "/static/talents/stats60.js")]).then(() => {
        if (!window.OlympusTalentStats60) toolScripts.delete("OlympusTalentStats60");
        return window.OlympusTalentStats60;
      }),
      className: dec(parts[0] || "warrior"), build: dec(parts[1] || ""),
      onBuildChange: value => {
        if (main.parentNode !== app) return;
        history.replaceState(null, "", "#/talents/" + encodeURIComponent(value.className) + "/" + encodeURIComponent(value.build));
        lastHash = location.hash;
        pageTitle(routeTitle(currentRoute()));
      },
    };
  });
  const resourcesView = view => main => {
    return memberTool(main, "OlympusResources", "/static/resources169.js", "/static/resources169.css", { view,
      onRefused: status => { if (main.parentNode !== app) return; if (status === 401) { S.signedIn = false; render(); } else if (status === 403 || status === 503) refreshCommunity(); },
    });
  };
  ROUTES.legal = async (main, parts) => {
    const kind = parts[0];
    if (parts.length !== 1 || !["privacy", "terms"].includes(kind)) { add(main, frame("Legal", null, h("p", {text:"There is no such legal document."}))); return; }
    const owner = S.user, route = currentRoute(); let disposed = false, instance = null;
    const live = () => !disposed && S.user === owner && S.signedIn && !S.denied && currentRoute() === route && main.parentNode === app;
    const dispose = () => { disposed = true; instance?.destroy(); if (disposeTool === dispose) disposeTool = null; };
    disposeTool = dispose;
    const box = h("div", {class:"legal-view196"}); add(main, box);
    await loadMemberScript("OlympusLegalView", "/static/legal-view196.js"); if (!live()) return;
    instance = window.OlympusLegalView.mount(box, {kind, isCurrent:live});
    if (!live()) instance.destroy();
  };
  ROUTES.addons = resourcesView("addons");
  ROUTES.guides = resourcesView("guides");
  ROUTES.updates = resourcesView("updates");
  ROUTES.guide = (main, parts) => {
    const officer = parts[0] === "officer";
    const steps = officer ? [
      ["Review the current charter", "Use Governance and Organization to distinguish appointments, Council eligibility, native game ranks and actual site permissions. The Co-GM composition direction does not itself issue a warrant or grant a new vote.", "#/governance", "Open governance"],
      ["Review an application fairly", "Read the applicant's answers and current role choices. Follow the recorded decision and reasons; a recommendation or board vote is not an invitation or permission grant.", "#/vote", "Open voting board"],
      ["Verify in game", "Use the guild's verification workflow and the current officer-exported roster. A Discord nickname, third-party census or talent plan does not establish character ownership or membership.", "#/roles", "Review role responsibilities"],
      ["Keep information current", "Use source dates on guild figures and roster records. Correct a reported error through the normal officer process. Do not turn a stale export or an unsigned Census preview into a membership decision.", "#/community", "Open community hub"],
      ["Respect access and privacy", "Only controls your account is actually allowed to use can perform an action. Use normal consent checks for named officeholders; do not publish someone else's private information or assume an appointment changes site access.", "#/guide/member", "Read member guidance"],
    ] : [
      ["Enter the guild hall", "Sign in with Discord and complete membership screening in Asmongold's server. If the site cannot confirm membership, follow its explanation and try again after the Discord state is corrected.", "#/", "Go home"],
      ["Choose how to help", "Read a role's responsibilities, apply with accurate answers and keep your availability current. Applying and voting do not bypass an appointment, eligibility rule or launch gate.", "#/roles", "Explore roles"],
      ["Verify your character", "Follow the guild's in-game verification instructions. A character label you type is different from a roster-confirmed character. Directory listing is optional.", "#/community", "Open community hub"],
      ["Prepare for Forever", "Use the talent calculator, source-labelled class guides and addon directory. Check the client build and whether advice is tested beta material, Classic-derived or provisional.", "#/guides", "Browse guides"],
      ["Keep control of your data", "Use your own account and privacy controls. Withdrawing an application removes it from the voting board; the privacy pages explain erasure and its remaining copy limitations.", "/privacy/account", "Open my account"],
    ];
    add(main, frame(officer ? "Officer guide" : "Member guide", h("a", { class: "btn small", href: officer ? "#/guide/member" : "#/guide/officer", text: officer ? "Member guide" : "Officer guide" }),
      h("p", { class: "muted small", text: "Source: Olympus's current charter and site workflows. This guide explains the process; permissions and current server decisions remain authoritative." }),
      h("div", { class: "guide-steps" }, steps.map(([title, text, href, label], index) => h("section", { class: "card" }, h("h2", { text: `${index + 1}. ${title}` }), h("p", { text }), h("a", { href, text: label })))),
      officer && S.user && S.user.isAdmin ? h("p", null, h("a", { class: "btn", href: "#/admin", text: "Open Admin" })) : null));
  };

  // ---------------------------------------------------------------- current R7 governance and organization (.154)
  // Fixed public assets only: this reader never asks a member/leadership API for identities or permissions.
  const GOVERNANCE_BOOK = "/static/governance/reconciled-book.md";
  const GOVERNANCE_MODEL = "/static/governance/organization.json";
  const GOVERNANCE_SHA256 = "e0800f5eacba0151d31df57412ea47a0e28920a4e1995cb7273a8236ca9dc924";
  let governanceBookPromise = null, governanceModelPromise = null;
  async function publicGovernanceBytes(path, cap) {
    const res = await fetch(path, { credentials: "same-origin", redirect: "error" });
    if (!res.ok) throw new Error("The public governance file could not be read. Reload this page to try again.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > cap) throw new Error("The public governance file has an unexpected size.");
    return bytes;
  }
  function governanceBook() {
    if (!governanceBookPromise) governanceBookPromise = (async () => {
      const bytes = await publicGovernanceBytes(GOVERNANCE_BOOK, 262144);
      if (bytes.length !== 262067) throw new Error("The R7 book has an unexpected size.");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
      if (digest !== GOVERNANCE_SHA256) throw new Error("The R7 book does not match the reviewed text.");
      return parseGovernanceBook(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    })().catch((e) => { governanceBookPromise = null; throw e; });
    return governanceBookPromise;
  }
  function governanceModel() {
    if (!governanceModelPromise) governanceModelPromise = (async () => {
      const bytes = await publicGovernanceBytes(GOVERNANCE_MODEL, 524288);
      const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (data.schema !== "olympus-public-organization-v1" || data.revision !== "R7" || data.draft !== false || data.ratified !== true || data.appointmentsIssued !== false ||
          !data.book || data.book.path !== GOVERNANCE_BOOK || data.book.bytes !== 262067 || data.book.sha256 !== GOVERNANCE_SHA256 ||
          !Array.isArray(data.nodes) || data.nodes.length > 64 || !Array.isArray(data.terms) || data.terms.length !== 96 ||
          !Array.isArray(data.nativeRanks) || data.nativeRanks.length !== 10 || !Array.isArray(data.guildPlaceholders) || data.guildPlaceholders.length !== 10 ||
          !Array.isArray(data.termGroups) || data.directoryRoute !== "#/community/leadership") throw new Error("The organization model has an unexpected shape.");
      const ids = new Set(data.nodes.map((n) => n.id));
      if (ids.size !== data.nodes.length || data.nodes.some((n) => !/^[a-z][a-z0-9-]*$/.test(n.id) || (n.parent !== null && !ids.has(n.parent)) ||
          !own(data.legend, n.relation) || !Array.isArray(n.coordinates) || n.coordinates.some((id) => !ids.has(id))) ||
          data.terms.some((t, i) => t.ordinal !== i + 1 || typeof t.label !== "string" || !ids.has(t.nodeId)) || new Set(data.terms.map((t) => t.label)).size !== 96) throw new Error("The organization model has an invalid relation.");
      // A corrupt static file must not turn recursive rendering into a loop.
      for (const n of data.nodes) {
        const seen = new Set(); let current = n;
        while (current) { if (seen.has(current.id)) throw new Error("The organization model contains a cycle."); seen.add(current.id); current = data.nodes.find((p) => p.id === current.parent); }
      }
      return data;
    })().catch((e) => { governanceModelPromise = null; throw e; });
    return governanceModelPromise;
  }
  const governanceSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function parseGovernanceBook(text) {
    const chapters = [], used = new Set(); let chapter = null;
    for (const line of text.split(/\r?\n/)) {
      const heading = /^# (.+)$/.exec(line);
      if (heading) {
        const stem = governanceSlug(heading[1]); let id = stem, n = 2;
        while (used.has(id)) id = stem + "-" + n++;
        used.add(id); chapter = { id, title: heading[1], lines: [] }; chapters.push(chapter);
      } else if (chapter) chapter.lines.push(line);
    }
    if (!chapters.length || chapters[0].title !== "Reading and Adopting This Book") throw new Error("The R7 book has no reading guide.");
    return { chapters, text };
  }
  // A small text-only Markdown reader. It creates DOM nodes; arbitrary HTML and Markdown URLs never execute.
  function governanceInline(text) {
    return String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part) =>
      part.startsWith("**") && part.endsWith("**") ? h("strong", { text: part.slice(2, -2) }) :
      part.startsWith("`") && part.endsWith("`") ? h("code", { text: part.slice(1, -1) }) : document.createTextNode(part));
  }
  function governanceBlocks(lines) {
    const out = []; let i = 0;
    const special = (line) => !line.trim() || /^(#{2,6} |\|.*\||[-*] |\d+[.)] |---+$)/.test(line) || line.trim() === "[[OVERVIEW]]";
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.trim() === "[[OVERVIEW]]") {
        out.push(h("div", { class: "governance-overview" }, posIcon("guild_master"), h("div", null,
          h("h3", { text: "Explore the organization" }), h("p", { text: "Open reporting lines, inspect an office’s remit and explore the offices and groups in the interactive chart." }),
          h("a", { class: "btn", href: "#/organization", text: "Open the interactive organization chart" })))); i++; continue;
      }
      const heading = /^(#{2,6}) (.+)$/.exec(line);
      if (heading) { out.push(h(heading[1].length < 4 ? "h3" : "h4", null, governanceInline(heading[2]))); i++; continue; }
      if (/^---+$/.test(line.trim())) { out.push(h("hr")); i++; continue; }
      if (/^\|.*\|$/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
          const cells = lines[i++].slice(1, -1).split("|").map((s) => s.trim());
          if (!cells.every((s) => /^:?-{3,}:?$/.test(s))) rows.push(cells);
        }
        const tableHead = h("thead", null, h("tr", null, (rows[0] || []).map((cell) => h("th", { scope: "col" }, governanceInline(cell)))));
        const tableBody = h("tbody", null, rows.slice(1).map((row) => h("tr", null, row.map((cell) => h("td", null, governanceInline(cell))))));
        out.push(h("div", { class: "table-wrap" }, h("table", { class: "governance-table" }, tableHead, tableBody))); continue;
      }
      const list = /^([-*] |\d+[.)] )/.exec(line);
      if (list) {
        const ordered = /^\d/.test(list[0]), items = [];
        while (i < lines.length && (ordered ? /^\d+[.)] / : /^[-*] /).test(lines[i])) items.push(h("li", null, governanceInline(lines[i++].replace(/^([-*] |\d+[.)] )/, ""))));
        out.push(h(ordered ? "ol" : "ul", null, items)); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && !special(lines[i])) paragraph.push(lines[i++]);
      out.push(h("p", null, governanceInline(paragraph.join(" "))));
    }
    return out;
  }
  function governanceDraftNotice() {
    return h("details", { class: "governance-draft" }, h("summary", null, h("strong", { text: "R7 • Guild rules adopted 13 October 2026" }), " — scope of adoption"),
      h("p", { text: "Adopted by the authorized guild administration. Adoption issues no individual appointment or named signature and changes no native rank, bank limit or platform permission. Dated archives retain their historical status; actual appointments and implementation are separately recorded." }));
  }
  ROUTES.governance = async (main, parts) => {
    const loading = h("p", { role: "status", text: "Opening the R7 governance book…" }); add(main, loading);
    const book = await governanceBook();
    if (!app.contains(main)) return;
    clear(main);
    const chapters = book.chapters, details = new Map(), searchBlocks = new Map(), toc = new Map();
    const target = dec(parts[0] || ""), selected = chapters.findIndex((c) => c.id === target);
    let index = selected < 0 ? 0 : selected;
    const search = h("input", { type: "search", id: "governance-search", placeholder: "Search the whole book", "aria-label": "Search the whole governance book", maxlength: "160" });
    const result = h("p", { class: "small muted", role: "status", "aria-live": "polite" });
    const matchStatus = h("p", { class: "small", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    const matchPrev = h("button", { class: "btn small", type: "button", text: "Previous match", disabled: true, onclick: () => moveMatch(-1) });
    const matchNext = h("button", { class: "btn small", type: "button", text: "Next match", disabled: true, onclick: () => moveMatch(1) });
    const matchNav = h("nav", { class: "governance-match-nav", "aria-label": "Search matches", hidden: true },
      h("div", { class: "governance-match-heading" }, matchStatus,
        h("button", { class: "btn small", type: "button", text: "Edit search", onclick: () => { search.focus({ preventScroll: true }); scrollToSection(search); } })),
      h("div", { class: "governance-match-buttons" }, matchPrev, matchNext));
    const highlightWindowSize = 200;
    // revealPending: typing selects match 1 without scrolling the page, so the
    // first Next (button or Enter) reveals that match instead of skipping it.
    let matches = [], activeMatch = -1, replacements = [], renderedMatches = [], revealPending = false;
    const prev = h("a", { class: "btn small", text: "Previous chapter" }), next = h("a", { class: "btn small", text: "Next chapter" });
    const current = h("span", { class: "small" });
    let printState = null;
    // Browser-menu/Ctrl+P printing must carry the same full current text and
    // adoption qualifications as the page's Print button, only for this live view.
    function preparePrint() {
      if (main.parentNode !== app || currentRoute().split("/")[0] !== "governance") return;
      const scope = main.querySelector("details.governance-draft");
      // The page button prepares before the browser emits beforeprint. Keep the
      // first snapshot, so that second preparation cannot overwrite the reader.
      if (!printState) printState = { chapters: [...details.values()].map(section => ({ section, hidden: section.hidden, open: section.open })), scope, scopeOpen: scope && scope.open };
      for (const section of details.values()) { section.hidden = false; section.open = true; }
      if (scope) scope.open = true;
    }
    function restorePrint() {
      if (!printState) return;
      const saved = printState; printState = null;
      for (const { section, hidden, open } of saved.chapters) { section.hidden = hidden; section.open = open; }
      if (saved.scope) saved.scope.open = saved.scopeOpen;
    }
    function selection(i, focus = false, open = true) {
      index = i; const chapter = chapters[index];
      if (main.parentNode === app) pageTitle(`${chapter.title} · Governance`);
      if (open) details.get(chapter.id).open = true;
      current.textContent = `${index + 1} / ${chapters.length} • ${chapter.title}`;
      prev.hidden = index === 0; next.hidden = index === chapters.length - 1;
      if (index > 0) prev.setAttribute("href", "#/governance/" + chapters[index - 1].id);
      if (index < chapters.length - 1) next.setAttribute("href", "#/governance/" + chapters[index + 1].id);
      for (const [id, link] of toc) { if (id === chapter.id) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current"); }
      if (focus) { const summary = details.get(chapter.id).querySelector("summary"); summary.focus(); scrollToSection(details.get(chapter.id)); }
    }
    const chapterNodes = chapters.map((chapter, i) => {
      const summary = h("summary", { onclick: () => selection(i, false, false), "data-chapter-summary": chapter.id }, h("h2", { text: chapter.title }));
      // The hash-verified book fixes these instrument chapters at these ordinals.
      const executionFields = (i === 2 || i === 3 || ["adoption-and-office-registers","daily-news-template"].includes(chapter.id))
        ? h("p", { class: "governance-instrument-note", role: "note", text: "About the blank fields: ceremonial and reusable instruments retain their unexecuted signature, witness and register fields. The adopted book does not supply an individual's signature or issue an appointment. A blank field is not a completed record." }) : null;
      const blocks = governanceBlocks(chapter.lines);
      const content = h("div", { class: "governance-prose" }, executionFields, blocks);
      const section = h("details", { class: "governance-chapter", id: "chapter-" + chapter.id, "data-chapter": chapter.id }, summary, content);
      // Search rendered book text, including phrases spanning strong/code, without
      // counting generated notes, chart invitations or duplicate contents links.
      const prose = [];
      function collectBlocks(node) {
        if (node.className === "governance-overview") return;
        if (["P", "H3", "H4", "LI", "TH", "TD"].includes(node.tagName)) { prose.push(node); return; }
        for (const child of node.children) collectBlocks(child);
      }
      blocks.forEach(collectBlocks);
      details.set(chapter.id, section); searchBlocks.set(chapter.id, [summary.querySelector("h2"), ...prose]);
      return section;
    });
    const tocList = chapters.map((chapter) => { const link = h("a", { href: "#/governance/" + chapter.id, text: chapter.title }); const item = h("li", null, link); toc.set(chapter.id, link); return item; });
    function selectMatch(i, scroll = false, reveal = false) {
      if (activeMatch >= 0) for (const mark of matches[activeMatch].marks) mark.removeAttribute("aria-current");
      activeMatch = i;
      const match = matches[i];
      matchPrev.disabled = matchNext.disabled = !match;
      if (!match) { matchStatus.textContent = "No matches"; return; }
      if (!match.marks.length) renderMatchWindow(i);
      for (const mark of match.marks) mark.setAttribute("aria-current", "true");
      // The first Next after typing reveals the match already announced. Distinct
      // wording makes the atomic live region speak again on that key press.
      matchStatus.textContent = `${reveal ? "Showing match" : "Match"} ${i + 1} of ${matches.length} · ${match.chapter.title}`;
      if (scroll) {
        selection(chapters.indexOf(match.chapter));
        // Native overflow containers (notably tables) reveal their match too.
        // A block rewritten by another script after indexing may yield no mark.
        const mark = match.marks[0];
        if (!mark) return;
        mark.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        const bar = document.querySelector(".topbar");
        const top = bar ? bar.getBoundingClientRect().bottom : 0;
        if (mark.getBoundingClientRect().top < top + 16) window.scrollTo({ top: Math.max(0, window.scrollY + mark.getBoundingClientRect().top - top - 16), behavior: "auto" });
      }
    }
    function moveMatch(delta) {
      if (!matches.length) return;
      // The first Next after typing shows the selected match 1; Previous still
      // steps back from it, wrapping to the last match.
      const reveal = revealPending && delta > 0;
      revealPending = false;
      selectMatch(reveal ? activeMatch : (activeMatch + delta + matches.length) % matches.length, true, reveal);
    }
    function restoreHighlights() {
      // Snapshot and reset first: another script (a page translator, say) may
      // have replaced an inserted node, and a stale list must not make every
      // later search throw. Restore original nodes rather than innerHTML,
      // preserving inline markup, only where the insertion is still intact.
      const pending = replacements, painted = renderedMatches;
      replacements = []; renderedMatches = [];
      for (const match of painted) match.marks = [];
      for (const { parent, node, inserted } of pending) {
        try {
          if (!node.parentNode && inserted.length && inserted.every(item => item.parentNode === parent)) {
            parent.insertBefore(node, inserted[0]);
            for (const item of inserted) parent.removeChild(item);
          }
        } catch (error) { /* one rewritten block must not stop the others */ }
      }
      // A rewritten entry keeps its new text where it is. Unwrap every search mark
      // still in the page, its children kept in place: a mark the list still holds
      // and one another script copied (a deep clone of an ancestor, say), which the
      // list never held. No stale highlight remains, and the next search cannot nest.
      for (const mark of main.querySelectorAll("mark.governance-search-match")) {
        const host = mark.parentNode;
        for (const child of [...mark.childNodes]) host.insertBefore(child, mark);
        host.removeChild(mark);
      }
    }
    function renderMatchWindow(i) {
      restoreHighlights();
      const start = Math.max(0, Math.min(matches.length - highlightWindowSize, i - Math.floor(highlightWindowSize / 2)));
      renderedMatches = matches.slice(start, start + highlightWindowSize);
      const blocks = new Map();
      for (const match of renderedMatches) {
        if (!blocks.has(match.block)) blocks.set(match.block, []);
        blocks.get(match.block).push(match);
      }
      for (const [block, ranges] of blocks) highlightBlock(block, ranges);
    }
    function searchPattern(query) {
      // Literal words: any whitespace run in the query matches any run in the
      // source, since the browser collapses the book's repeated spaces on screen.
      const words = query.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      return new RegExp(words.join("\\s+"), "giu");
    }
    function indexBlock(block, pattern, chapter) {
      // Count every occurrence without creating a DOM node for every result.
      // A common one-letter query must remain navigable on a mobile device.
      for (const hit of block.textContent.matchAll(pattern)) matches.push({ chapter, block, start: hit.index, end: hit.index + hit[0].length, marks: [], ordinal: matches.length });
    }
    function highlightBlock(block, ranges) {
      const nodes = [];
      function textNodes(node) {
        if (node.nodeType === 3) nodes.push(node);
        else for (const child of node.childNodes) textNodes(child);
      }
      textNodes(block);
      let offset = 0;
      for (const node of nodes) {
        const original = node.textContent, end = offset + original.length;
        const overlaps = ranges.filter(range => range.start < end && range.end > offset);
        if (overlaps.length) {
          const parent = node.parentNode, inserted = []; let cursor = 0;
          const insert = item => { parent.insertBefore(item, node); inserted.push(item); };
          for (const range of overlaps) {
            const start = Math.max(0, range.start - offset), stop = Math.min(original.length, range.end - offset);
            if (start > cursor) insert(document.createTextNode(original.slice(cursor, start)));
            const mark = h("mark", { class: "governance-search-match", "data-governance-match": range.ordinal, text: original.slice(start, stop) });
            insert(mark); range.marks.push(mark); cursor = stop;
          }
          if (cursor < original.length) insert(document.createTextNode(original.slice(cursor)));
          parent.removeChild(node); replacements.push({ parent, node, inserted });
        }
        offset = end;
      }
    }
    function filter() {
      restoreHighlights(); matches = []; activeMatch = -1;
      const query = search.value.trim().toLowerCase(), pattern = query ? searchPattern(search.value) : null; let count = 0;
      for (const chapter of chapters) {
        const before = matches.length;
        if (query) for (const block of searchBlocks.get(chapter.id)) indexBlock(block, pattern, chapter);
        const found = !query || matches.length > before;
        const section = details.get(chapter.id); section.hidden = !found; toc.get(chapter.id).parentNode.hidden = !found;
        if (query) section.open = found;
        if (found) count++;
      }
      result.textContent = query ? `${count} of ${chapters.length} chapters match “${search.value.trim()}”.` : `The complete book • ${chapters.length} chapters. Select a chapter or search its full text.`;
      if (matches.length > highlightWindowSize) result.textContent += ` Showing up to ${highlightWindowSize} highlights at a time; match navigation reaches every result.`;
      matchNav.hidden = !query;
      main.classList.toggle("governance-searching", !!query);
      selectMatch(matches.length ? 0 : -1);
      revealPending = matches.length > 0;
    }
    search.addEventListener("input", filter);
    // Enter moves to the next match and Shift+Enter to the previous one, as the
    // match buttons do; focus stays in the field so typing can continue.
    search.addEventListener("keydown", event => {
      // An IME commit (isComposing, or keyCode 229 in Safari) is not a search command.
      if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
    });
    add(main, [h("section", { class: "governance-hero" }, posIcon("guild_master"), h("div", null,
      h("h1", { text: "The Governance of Olympus" }), h("p", { text: "The adopted R7 book and its 25 October five-Title expansion: sovereign decrees, Council and Court procedure, Treasury stewardship, the Grand Alliance Concordat, and the Artisans' and Heralds' accords." }))), governanceDraftNotice(),
      noticeBox("info", "pos-officer", h("p", { text: reservedNotice201 }), h("p", null, "The adopted book retains its constitutional and historical procedures. For current eligibility and the individual duties of every office, see the ", h("a", { href: "#/roles", text: "complete role directory" }), ".")),
      h("section", { class: "card", id: "trading-portfolio208", "aria-label": "Current High Council trading portfolio" },
        h("h2", { text: "Head of Trading & Markets · High Council" }),
        h("p", { text: "Owner direction recorded 28 October 2026: a dedicated reserved Council portfolio for auction-house trading, direct item trades and the guild's market strategy. This is a current office clarification alongside the adopted R7 book, not a newly ratified charter or a named appointment." }),
        h("p", { text: "Its sole remit is trading performance: research actual prices and demand, choose funded buy/sell opportunities, negotiate direct trades and manage inventory and execution. Measure realised net profit after item costs, auction fees, lost deposits and agreed costs; turnover and unsold stock are not guild profit." }),
        h("p", { text: "The Treasurer retains custody, authorised budgets, payment controls and reconciliation. Independent audit remains separate. Trading capital, position limits and stop rules need separate approval; this title grants no withdrawal, signing, Discord, website or provider permission. Donations, dues, appeals, discipline and Workshop commission administration are outside this portfolio." }),
        h("p", { class: "small muted", text: "The current catalogue has 96 offices and 132 assignment keys. The adopted R7 book retains its historical 95-office register and ten native ranks. The new portfolio is associated with High Council, native slot 1; it does not add a rank or open an application route." }),
        h("a", { class: "btn", href: "#/roles/head_trading", text: "Read the complete trading responsibilities & expectations" }), " ",
        h("a", { class: "btn small", href: "/static/governance/council-composition-2026-10-28.md", text: "Current Council clarification" })),
      h("nav", { class: "governance-quicklinks", "aria-label": "Start reading" },
        h("a", { class: "btn", href: "#/governance/reading-and-adopting-this-book", text: "Start here" }),
        h("a", { class: "btn", href: "#/governance/adoption-and-office-registers", text: "Adoption checklist" }),
        h("a", { class: "btn", href: "#/governance/3-letters-patent-and-warrants", text: "Appointment templates" }),
        h("a", { class: "btn", href: "#/organization", text: "Interactive organization" }),
        h("a", { class: "btn", href: "#/roles/rosetta-stone", text: "Role & Rank Rosetta Stone" }),
        h("a", { class: "btn", href: "#/governance/operational-charter-the-work-of-olympus", text: "Operational charter" }),
        h("a", { class: "btn", href: "#/governance/title-i-the-sovereign-royal-decrees", text: "Title I · Sovereign" }),
        h("a", { class: "btn", href: "#/governance/title-ii-the-high-council-co-guild-master-privy-court", text: "Title II · Council & Court" }),
        h("a", { class: "btn", href: "#/governance/title-iii-the-imperial-treasury-guild-bank-tithe-ledger", text: "Title III · Treasury" }),
        h("a", { class: "btn", href: "#/treasury-plan", text: "Treasury programme & 90-day plan" }),
        h("a", { class: "btn", href: "#/governance/title-iv-the-grand-alliance-concordat", text: "Title IV · Grand Alliance" }),
        h("a", { class: "btn", href: "#/governance/title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord", text: "Title V · Artisans & Heralds" }),
        h("button", { class: "btn small", type: "button", text: "Print current R7 book", onclick: () => { preparePrint(); window.print(); } }),
        h("a", { class: "btn small", href: GOVERNANCE_BOOK, download: "Olympus Governance R7.md", text: "Download current R7 source" })),
      h("details", { class: "governance-archive" }, h("summary", { text: "Archive and release records" }),
        h("p", { class: "small muted", text: "Historical R6 drafts and preparation documents retain their dated status. For current guild rules, use the R7 reader above." }),
        h("div", { class: "btn-row" },
        h("a", { class: "btn small", href: "/static/governance/olympus-governance-r6.pdf", download: "Olympus Guild Governance - Successor Draft.pdf", text: "Historical R6 PDF" }),
        h("a", { class: "btn small", href: "/static/governance/olympus-governance-r6.zip", download: "Olympus Governance - Successor Draft.zip", text: "Historical R6 package" }),
        h("a", { class: "btn small", href: "/static/governance/olympus-guide-r6.pdf", download: "Olympus Guild Guide - Draft R6.pdf", text: "Historical R6 guide" }),
        h("a", { class: "btn small", href: "/static/governance/olympus-adoption-checklist-r6.pdf", download: "Olympus Adoption Checklist - Draft R6.pdf", text: "Historical R6 checklist" }),
        h("a", { class: "btn small", href: "/static/governance/olympus-templates-r6.pdf", download: "Olympus Appointment and News Templates - Draft R6.pdf", text: "Historical R6 templates" }),
        h("a", { class: "btn small", href: "/static/governance/olympus-release-preparation.pdf", download: "Olympus Release Preparation Checklist.pdf", text: "Release preparation PDF" }))),
      h("div", { class: "governance-controls" }, h("label", { for: "governance-search", text: "Find a rule or office" }), search,
        h("button", { class: "btn small", type: "button", text: "Clear search", onclick: () => { search.value = ""; filter(); } }),
        h("button", { class: "btn small", type: "button", text: "Expand all chapters", onclick: () => { for (const section of details.values()) if (!section.hidden) section.open = true; } }),
        h("button", { class: "btn small", type: "button", text: "Collapse all chapters", onclick: () => { for (const section of details.values()) section.open = false; } }), result),
      h("div", { class: "governance-layout" }, h("aside", { class: "governance-toc" }, h("nav", { "aria-label": "Book chapters" }, h("h2", { text: "Contents" }), h("ol", null, tocList))),
        h("div", { class: "governance-reader" }, h("nav", { class: "governance-page-nav", "aria-label": "Chapter navigation" }, prev, current, next), chapterNodes)), matchNav]);
    add(main, royalWritsVisible200() ? writsPanel199("governance") : h("p", {class:"muted small writs-paused200",text:"Royal Writs and new Patron applications are currently paused. The constitutional book and its downloads retain the adopted policy text for reference; they are not an offer of an available service."}));
    selection(index); filter();
    if (selected >= 0) selection(index, true);
    window.addEventListener("beforeprint", preparePrint);
    window.addEventListener("afterprint", restorePrint);
    disposeGovernancePrint = () => { restorePrint(); window.removeEventListener("beforeprint", preparePrint); window.removeEventListener("afterprint", restorePrint); disposeGovernancePrint = null; };
  };
  // Owner request, 28 October 2026: publish a planning programme without any bank, payment or settings writer.
  ROUTES["treasury-plan"] = async (main, parts) => {
    const user = S.user, settings = S.settings, route = currentRoute(), view = main.dataset.viewRequest;
    const current = () => app.contains(main) && main.dataset.viewRequest === view && S.user === user && S.settings === settings && currentRoute() === route && S.signedIn && !S.denied;
    add(main, h("p", { role: "status", text: "Opening the treasury programme…" }));
    const { renderTreasuryPlan207 } = await import("/static/treasury-plan207.js");
    if (!current()) return;
    const dispose = renderTreasuryPlan207(main, { h, add, clear, posIcon, parts, scrollToSection, isCurrent: current });
    if (typeof dispose === "function") disposeTool = dispose;
  };
  ROUTES.organization = async (main, parts) => {
    const user = S.user, settings = S.settings, context = COM(), route = currentRoute(), view = main.dataset.viewRequest;
    const current = () => app.contains(main) && main.dataset.viewRequest === view && S.user === user && S.settings === settings && COM() === context && currentRoute() === route;
    add(main, h("p", { role: "status", text: "Opening the organization…" }));
    const data = await governanceModel();
    if (!current()) return;
    const { renderOrganization } = await import("/static/organization-view.js");
    const { renderAllianceOverview205 } = await import("/static/organization-overview205.js");
    if (!current()) return;
    const currentData201 = {...data, terms:data.terms.map(term => {
      const row = office199(term.officeKey);
      return row ? {...term,applicationEligible:row.applicationEligible,reservedSeat201:row.reservedSeat201,acquisition:row.acquisition} : term;
    })};
    disposeOrganization = renderOrganization(main, currentData201, { h, add, clear, posIcon, parts, scrollToSection,
      roleGuide201:key => guideBody201((M().roleGuides201 || {})[key],positionOf(key)),
      roleGuides201:M().roleGuides201,
      allianceOverview205:renderAllianceOverview205,
      roleDirectory203:M().roleDirectory203,
      roleFamilyDirectory203:() => applicationRoleDirectory201(next => { location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`; }, {}, {showCharacters:true}),
      officeAvailability: Object.fromEntries(offices199().map(row => [row.key, reservedKey201(row.key) || S.settings?.applicationsOpen === false || displayHolder(row.key) ? false : true])) });
    add(main, writsPanel199("organization")); // The family directory keeps every original holder scope for the router's qualified reader.
  };

  // ---------------------------------------------------------------- home
  function statusText(st) {
    return { submitted: "Submitted", reviewing: "Under review", accepted: "Accepted", declined: "Not accepted", withdrawn: "Withdrawn" }[st] || st;
  }
  /** When a countdown ends, the page is drawn again to show what opened, unless something typed is not saved yet. */
  function refreshWhenClean() {
    if (!dirtyKeys.size) return render();
    toast("The countdown has ended. Save your changes, then reload the page to see what opened.");
  }
  function datesPanel() {
    const s = S.settings;
    if (!s) return null;
    const namesOpen = nowSec() >= s.namesOpenAt;
    const live = nowSec() >= s.launchAt;
    return frame("The road to launch", null,
      h("div", { class: "grid two" },
        h("div", { class: "date-card" },
          icon("icon-names", "l"),
          h("div", null,
            h("h3", { text: namesOpen ? "Name reservation is open" : "Early name reservation opens in" }),
            namesOpen ? h("p", null, "Reserve up to three names in game, then ", S.signedIn ? h("a", { href: "#/names", text: "enter them below" }) : "enter them here after signing in", ".") : countdown(s.namesOpenAt, { onDone: refreshWhenClean }),
            h("p", { class: "muted small" },
              s.namesTimeConfirmed
                ? `${namesOpen ? "Opened" : "Opens"} ${fmtDateTime(s.namesOpenAt)} (${fmtPacific(s.namesOpenAt)}).`
                : `Opens ${fmtPacific(s.namesOpenAt, false)}. Blizzard has not announced the hour yet, so this counts down to the start of that day, Pacific time; it will be corrected when the hour is known.`))),
        h("div", { class: "date-card" },
          icon("icon-launch", "l"),
          h("div", null,
            h("h3", { text: live ? "World of Warcraft: Forever is live" : "Launch in" }),
            live ? null : countdown(s.launchAt, { onDone: refreshWhenClean }),
            h("p", { class: "muted small", text: `${fmtDateTime(s.launchAt)} (${fmtPacific(s.launchAt)}).` })))));
  }
  const warningBox = () => noticeBox("warn", "icon-warning", h("p", null, h("strong", { text: "Joke, troll or abusive applications are permanently denied." }), " That covers the account's votes, nominations and reserved names too, and it is not reconsidered."));
  // .115 (Viktor's item B, 2 Oct 2026): whether Olympus I has room, as the Worker judges it (guild-seats.ts memberSeats: the latest
  // complete and trusted roster export, or an invite just refused for space; the time rounded down to the hour). Shown only while
  // the guild is full, and only to someone it concerns: an account with characters waiting in the invite queue (its own places,
  // never anyone else's) or one without a roster-confirmed character. It promises nothing the bot does not do, and changes nothing.
  const VISITORS_URL = /^https:\/\/discord\.com\/channels\/[0-9]{17,20}\/[0-9]{17,20}$/; // the Worker's visitorsUrl; anything else is plain text
  function visitorsLine(seats) {
    const url = seats && typeof seats.visitorsUrl === "string" && VISITORS_URL.test(seats.visitorsUrl) ? seats.visitorsUrl : "";
    return h("p", null, "Olympus 2 and the later Olympus guilds are welcome in ",
      url ? h("a", { href: url, rel: "noopener", target: "_blank", text: "#olympus-visitors" }) : "#olympus-visitors",
      " in Asmongold's Discord; this flow verifies the main Olympus guild.");
  }
  function seatsNotice(main) {
    // Seat reports are informational, not admission or Army observations. Never keep a boot-time full banner alive.
    const user = S.user, route = currentRoute(), view = main.dataset.viewRequest;
    const box = h("div", { class: "mt seats-notice", "aria-live": "polite" }, h("p", { class: "muted small", role: "status", text: "Checking the latest Olympus I officer report…" }));
    let disposed = false, generation = 0, expiryTimer = null, clockTimer = null;
    const live = () => !disposed && main.parentNode === app && main.dataset.viewRequest === view && currentRoute() === route && S.signedIn && !S.denied && S.user === user && !document.hidden;
    const forget = () => { S.seats = null; S.myQueue = []; };
    const stopTimers = () => { if (expiryTimer !== null) clearTimeout(expiryTimer); if (clockTimer !== null) clearInterval(clockTimer); expiryTimer = clockTimer = null; };
    const dispose = () => {
      if (disposed) return; disposed = true; generation++; stopTimers();
      document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", dispose);
      clear(box); box.hidden = true;
      if (disposeSeatsNotice === dispose) { forget(); disposeSeatsNotice = null; }
    };
    const onVisibility = () => {
      if (disposed) return;
      if (document.hidden) { generation++; stopTimers(); forget(); clear(box); box.hidden = true; }
      else if (live()) refresh();
    };
    disposeSeatsNotice = dispose; forget();
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("pagehide", dispose);
    const unavailable = () => { dispose(); box.hidden = false; add(box, h("p", { class: "muted small", role: "status", text: "Current seat information could not be checked. Reopen Home or Apply to try again." })); };
    function refresh() {
      if (!live()) return;
      const requestGeneration = ++generation, requestLive = () => live() && generation === requestGeneration;
      stopTimers(); forget(); clear(box); box.hidden = false;
      add(box, h("p", { class: "muted small", role: "status", text: "Checking the latest Olympus I officer report…" }));
      api("GET", "/api/me", undefined, { live: requestLive }).then(data => {
        if (!requestLive()) return;
        if (!data || data.signedIn !== true || data.denied !== false || !data.user || data.user.id !== user.id || !Number.isSafeInteger(data.now)) throw new Error("seat reader refused");
        // Only these two fields are refreshed. Never replace account, settings, capabilities, application or form state.
        const s = data.seats, queue = data.myQueue;
        if (!s || s.state !== "full") { clear(box); box.hidden = true; return; }
        const lifetime = s.source === "roster" ? 48 * 3600 : s.source === "refused_invite" ? 6 * 3600 : 0;
        if (!lifetime || !Number.isSafeInteger(s.asOf) || s.asOf <= 0 || s.asOf > data.now || !Array.isArray(queue) || !queue.every(q => q && typeof q.name === "string" && q.name.length <= 80 && Number.isSafeInteger(q.position) && q.position > 0) || (s.source === "roster" && (!Number.isSafeInteger(s.members) || !Number.isSafeInteger(s.cap) || s.cap < 900 || s.cap > 1000 || s.members < s.cap))) throw new Error("invalid seat report");
        // asOf is rounded DOWN to an hour, so this expires up to an hour before the server's original 48h/6h limit.
        const expiresAt = s.asOf + lifetime, remaining = expiresAt - Math.max(data.now, nowSec());
        if (remaining <= 0 || !(queue.length || !can("confirmedGuildData"))) { clear(box); box.hidden = true; return; }
        S.seats = s; S.myQueue = queue;
        const when = `about ${fmtDateTime(s.asOf)}`;
        const report = s.source === "roster"
          ? `Latest officer report: the Olympus I roster export of ${when} counts ${s.members} of ${s.cap} members.`
          : `Latest invite report: an Olympus I invite was refused for lack of space (${when}).`;
        const body = [h("p", null, h("strong", { text: report })),
          ...queue.map(q => h("p", { text: `${q.name} is #${q.position} in line for a seat.` })),
          h("p", { text: queue.length ? "Verified applicants wait in queue order (reserved names from the site go first). A full guild never costs you an invite attempt; the bot removes nobody, and officers may remove inactive characters to free seats." : "Verifying in Discord still works and puts you in the invite queue. This dated report does not promise the current number of free seats." })];
        clear(box); add(box, noticeBox("warn", "icon-clock", body, visitorsLine(s)));
        const expire = () => { if (!requestLive()) return; forget(); clear(box); box.hidden = true; stopTimers(); };
        expiryTimer = setTimeout(expire, remaining * 1000);
        clockTimer = setInterval(() => { if (nowSec() >= expiresAt) expire(); }, 1000);
      }).catch(() => { if (requestLive()) unavailable(); });
    }
    refresh();
    return box;
  }

  ROUTES[""] = function home(main) {
    const flash = flashBox();
    if (S.signedIn) add(main, h("p", { class: "muted small", "data-ruleset-identity": "current", text: rulesetIdentity() }));
    if (!S.signedIn) {
      add(main, [
        h("section", { class: "frame" },
          h("div", { class: "hero" },
            h("img", { class: "art", src: "/static/wow/molten-core.jpg", alt: "Molten Core, from the game's loading screen", width: "500", height: "284" }),
            h("div", null,
              h("div", { class: "title", text: "Olympus" }),
              h("div", { class: "tag" }, h("span", { text: "Asmongold's guild" }), h("span", { "data-ruleset-identity": "current", text: rulesetIdentity() })),
              h("p", { class: "lead", text: "Explore Olympus membership, raiding and artisan roles, list the friends you are bringing, and enter your reserved names when name reservation opens. Leader, High Council and Officer Corps seats are reserved appointments." }),
              signInButton(true),
              h("p", { class: "muted small", text: "For members of Asmongold's Discord server. The site checks that one membership and nothing else: it never sees your password, email, other servers or messages." })))),
        flash,
        h("section", { class: "grid three" },
          h("div", { class: "card" }, h("div", { class: "card-head" }, icon("icon-apply"), h("h3", { text: "Apply" })), h("p", { class: "muted", text: "Browse illustrated, collapsible guides for every rank, title and office. Eligible membership, Raider and Artisan roles have application choices; reserved leadership seats have detailed duties and expectations without application buttons." }), h("p", { class: "small" }, h("a", { href: "#/roles", text: "What each role involves" }))),
          h("div", { class: "card" }, h("div", { class: "card-head" }, icon("icon-vote"), h("h3", { text: "Vote" })), h("p", { class: "muted", text: "Historical applications and nominations remain on record. A nomination is a recommendation for leadership review; it does not open a reserved seat to applications. Only the guild's leadership sees vote counts." })),
          h("div", { class: "card" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Your seat" })), h("p", { class: "muted", text: "Add the friends joining with you, and once name reservation opens, the character names you reserved." }))),
        datesPanel(),
        warningBox(),
      ]);
      return;
    }
    const a = S.application;
    const st = a ? a.status : null;
    const mine = choicesOf(a && a.status !== "withdrawn" ? a : null);
    const put = (S.nominatedFor || []).filter((k) => !mine.includes(k) && votedKey(k));
    const namesOpen = S.settings && nowSec() >= S.settings.namesOpenAt;
    // Applications saved before .43 have no weekly grid, and a leadership one is kept off the board until its applicant
    // agrees: both are fixed by opening the application and saving it again. (So is one naming only roles without a
    // public vote, once one of them is opened to the vote.)
    const isOpen = a && (a.status === "submitted" || a.status === "reviewing");
    const needsBoard = isOpen && !a.boardAt && mine.some(votedKey);
    const needsGrid = isOpen && !a.avail;
    const lost = isOpen ? mine.filter(appointedTo) : [];
    const lostNote = lost.length
      ? noticeBox("info", "icon-shield",
          h("p", null, h("strong", null, appointedText(lost), " "), appointedTo(firstChoiceKey(a)) ? "Your application still counts for your other choices." : "Your other choices still stand; there is nothing you need to do."),
          appointedTo(firstChoiceKey(a)) ? h("p", null, h("a", { href: "#/apply", text: "Open your application" }), " and choose another first choice when you next change it.") : null)
      : null;
    const historicalReserved201 = !!a && (mine.some(reservedKey201) || reservedIntent201(a.answers));
    const catchUp = historicalReserved201 && (needsBoard || needsGrid)
      ? noticeBox("info", "icon-shield",
          h("p", { text: "Your historical application remains on record. Leader, High Council and Officer Corps seats are now reserved appointments, so the old board-consent and schedule prompts do not reopen them." }),
          h("p", null, h("a", { href: "#/apply", text: "Read your application" }), ", withdraw it, or explicitly choose an eligible membership, Raider or Artisan role before saving a replacement."))
      : needsBoard
      ? noticeBox("warn", "icon-vote",
          h("p", null, h("strong", { text: "Your application is not on the voting board yet. " }), "It was saved before the voting board covered a role you chose, so it stays private until you agree to show it."),
          h("p", null, h("a", { href: "#/apply", text: "Open your application" }), needsGrid ? ", fill in when you play, tick the box to show it on the voting board, and save." : ", tick the box to show it on the voting board, and save."))
      : needsGrid
        ? noticeBox("info", "icon-clock",
            h("p", null, h("strong", { text: "Add when you play. " }), "Your application was saved before the site asked for a weekly schedule, and the leadership plans the NA and EU raids with it."),
            h("p", null, h("a", { href: "#/apply", text: "Open your application" }), ", fill in the grid and save."))
        : null;
    const seats = seatsNotice(main);
    add(main, [
      h("section", { class: "welcome mt" }, ownAvatar(S.user), h("h1", { text: `Welcome, ${discordIdentity(S.user)}` })),
      flash,
      S.reapply ? h("div", { class: "mt" }, noticeBox("warn", "icon-warning", // .114: a rename Blizzard required (the Worker's rename_holds)
        h("p", null, h("strong", { text: "Apply again. " }), `Blizzard required your character ${S.reapply.from} to be renamed (now ${S.reapply.to}), so Olympus asks you to apply again.`),
        h("p", null, "Open ", h("a", { href: "#/apply", text: "Apply" }), ` and save your application once more, and verify ${S.reapply.to} again in Discord with Get my code in #join-olympus. Unless another of your characters is in the guild, your Guild Member role is on hold until the leadership approves the new application.`))) : null,
      seats,
      h("section", { class: "frame mt", "data-addon-promotion": "olympus-guild" },
        h("h2", { text: "Olympus in game" }),
        h("p", { text: "See Olympus guilds, their leaders and the in-game army census with Olympus Guild." }),
        h("div", { class: "btn-row" },
          h("a", { class: "btn", href: "https://www.curseforge.com/wow/addons/olympus-guild", target: "_blank", rel: "noopener noreferrer", text: "Get Olympus Guild" }),
          h("a", { class: "btn small", href: "#/addons", text: "Browse all addons" })),
        h("p", { class: "muted small", text: "No desktop companion is needed to use this website. Olympus Guild is the optional unified guild addon for census and Army reporting; website snapshot export still needs publisher adoption. Verification remains separate." })),
      put.length
        ? h("div", { class: "mt" }, noticeBox("info", "icon-vote",
            h("p", null, h("strong", { text: "You were nominated. " }), `Other members put you forward for ${listText(put.map(roleName))}. They are not told who you are, and you are not told who they are.`),
            h("p", null, "A nomination does not open a reserved seat or appoint anyone. Leader, High Council and Officer Corps applications are closed. ", h("a", {href:"#/roles",text:"Read each role's responsibilities and appointment status"}))))
        : null,
      lostNote ? h("div", { class: "mt" }, lostNote) : null,
      catchUp ? h("div", { class: "mt" }, catchUp) : null,
      h("section", { class: "grid three mt" },
        h("a", { class: "card", href: "#/apply" },
          h("div", { class: "card-head" }, icon("icon-apply"), h("h3", { text: "Application" })),
          h("div", { class: "big" }, st ? h("span", { class: "status " + st, text: statusText(st) }) : "Not yet"),
          h("p", { class: "muted small", text: a ? `${roleName(firstChoiceKey(a))}${a.backups && a.backups.length ? ` (+${a.backups.length} backup${a.backups.length === 1 ? "" : "s"})` : ""}. Updated ${ago(a.updatedAt)}.` : "Tell us what you want to do in Olympus." })),
        h("a", { class: "card", href: "#/vote" },
          h("div", { class: "card-head" }, icon("icon-vote"), h("h3", { text: "Votes" })),
          h("div", { class: "big", text: String(S.boardVotes || 0) }),
          h("p", { class: "muted small", text: `${plural(S.boardVotes || 0, "applicant")} voted on, ${plural((S.votes || []).length, "write-in")}. Only the guild's leadership sees counts.` })),
        h("a", { class: "card", href: "#/names" },
          h("div", { class: "card-head" }, icon("icon-names"), h("h3", { text: "Reserved names" })),
          h("div", { class: "big", id: "names-count", text: namesOpen ? `${(S.reserved || []).length} of ${M().limits.reserved}` : "Soon" }),
          h("p", { class: "muted small", text: namesOpen ? "entered below." : "Opens with Blizzard's name reservation." }))),
      frame("Beta Epoch Archive", h("span", { class: "badge", text: "Guild history" }),
        h("p", null, "Blizzard's 20 October update scheduled the final beta shutdown for 23 October 2026 at 10:00 AM PDT (17:00 UTC). ", h("a", {href:"https://us.forums.blizzard.com/en/wow/t/heads-up-wow-forever-stress-test-on-october-21/2387920",target:"_blank",rel:"noopener noreferrer",text:"Read the announced schedule"}), ". Its guild work continues into the announced PvE · Alliance direction."),
        h("p", { class: "muted small", text: "This archive records the guild's published rules, release history and aggregate milestones. It contains no former-member roster, private account copies or erased member records. The shutdown time is Blizzard's announced plan, not a server closure observed by this site; the guild's separate reset-policy cutoff is unchanged." }),
        h("div", { class: "btn-row" }, h("a", { class: "btn small", href: "#/governance", text: "Guild charter and adoption record" }), h("a", { class: "btn small", href: "#/news", text: "Town Crier and release history" }))),
      datesPanel(),
      h("div", { class: "grid two" }, namesPanel(), friendsPanel()),
    ]);
  };
  function deniedView(main) {
    add(main, frame("Registration denied", null,
      h("p", { text: S.deniedText || "Your registration with Olympus has been permanently denied." }),
      h("p", { class: "muted", text: "If you want what this site holds about you removed, ask an Olympus officer, or contact the privacy inbox for manually reviewed help." }),
      h("p", null, h("a", { href: "/privacy/account", text: "Account data controls" }), ": download your curated copy or contact the privacy inbox.")));
  }

  // ---------- reserved names (on Home) ----------
  const NAME_PART = /^\p{L}{2,12}$/u;
  function nameProblem(s) {
    const t = s.trim().replace(/\s+/g, " ");
    if (!t) return "";
    const parts = t.split(" ");
    if (parts.length !== 2) return "Two parts, a first and a last name, like Fern Melder.";
    if (!parts.every((p) => NAME_PART.test(p))) return "This guild form accepts 2 to 12 letters per part, with no digits or symbols; check the game's current naming rules separately.";
    return "";
  }
  function namesPanel() {
    const meta = M();
    const s = S.settings || {};
    const open = s.namesOpen && nowSec() >= s.namesOpenAt;
    const saved = S.reserved || [];
    const SHOWN = { saved: ["Saved", ""], queued: ["In the invite queue", "green"], in_guild: ["In the guild", "blue"], ended: ["Invite ended", "muted"] };
    const badgeOf = (r) => h("span", { class: "badge " + (SHOWN[r.status] || SHOWN.saved)[1], text: (SHOWN[r.status] || SHOWN.saved)[0] });
    const intro = h("div", { class: "parchment" },
      h("h3", { text: "What happens to them" }),
      h("p", null, "Blizzard's early name reservation lets the WoW account that purchased a Skyborne Heroic Pack, Skyborne Epic Pack or Warcraft Forever Collection reserve up to three characters total across all rulesets from 27 October to 3 November. Names are first come, first served and are not guaranteed. Once you have reserved yours in game, enter them here."),
      h("p", {class:"muted small",text:"This guild form uses its own two-part, 2–12-letter input limits. These local limits are not a claim to reproduce every current Blizzard naming rule. The countdown and form opening use North America's start; the notice identifies Europe's earlier opening."}),
      h("p", null, "The guild's leadership keeps this list privately and picks who has been promised a seat. At launch those names go to the top of the invite queue. An officer still sends each invite by hand, so be online on that character."),
      h("p", null, "To link your Discord account to the character, you still whisper your verification code to an officer in game, like everyone else. Entering a name here does not link or reserve anything by itself."));
    const section = h("section", { class: "frame", id: "names" }, h("div", { class: "plaque" }, h("h2", { text: "Your reserved names" })));
    if (!open) {
      add(section, [
        intro,
        h("div", { class: "rule" }),
        h("p", { class: "muted", text: s.namesOpen ? "Entering names opens with Blizzard's name reservation (the countdown above)." : "Entering names is closed right now." }),
        saved.length ? h("div", { class: "stack" }, saved.map((r) => h("div", { class: "person" }, h("div", { class: "nm" }, h("b", { text: r.name })), badgeOf(r)))) : null,
      ]);
      return section;
    }
    const unsaved = h("span", { class: "dirty", hidden: true, text: "Unsaved changes" });
    const inputs = [];
    const rows = h("div", { class: "stack" });
    for (let i = 0; i < meta.limits.reserved; i++) {
      const r = saved[i];
      const input = h("input", { type: "text", maxlength: "30", placeholder: "First Last", value: r ? r.name : "", autocomplete: "off", spellcheck: "false", disabled: r && r.status === "queued", "aria-label": `Reserved name ${i + 1}` });
      const err = h("span", { class: "err", hidden: true });
      input.addEventListener("input", () => { setDirty("names", true, unsaved); const p = nameProblem(input.value); err.textContent = p; err.hidden = !p; });
      inputs.push(input);
      const hint = !r ? null
        : r.status === "queued" ? "Already in the invite queue, so it cannot be changed here."
        : r.status === "ended" ? "The invite for this name ended without you joining (declined, or no answer after several tries). Ask an officer if you still want it, or remove it."
        : null;
      rows.appendChild(h("div", { class: "field" }, h("div", { class: "inline" }, input, h("span", { class: "badge-slot" }, r ? badgeOf(r) : null)), err, hint ? h("span", { class: "hint", text: hint }) : null));
    }
    const save = h("button", { class: "btn", type: "button", text: "Save names" });
    save.addEventListener("click", async () => {
      const values = inputs.map((x) => x.value);
      const bad = values.map(nameProblem).find(Boolean);
      if (bad) return toast(bad, "bad");
      save.disabled = true;
      try {
        const out = await api("PUT", "/api/reserved", { names: values });
        S.reserved = out.reserved;
        setDirty("names", false, unsaved);
        toast("Reserved names saved.", "good");
        // Only this section is drawn again (with the saved names and their badges): the friends list beside it may
        // have unsaved changes of its own.
        section.replaceWith(namesPanel());
        const count = document.getElementById("names-count");
        if (count) count.textContent = `${S.reserved.length} of ${meta.limits.reserved}`;
      } catch (err) { toast(err.message, "bad"); } finally { save.disabled = false; }
    });
    add(section, [
      intro,
      h("div", { class: "rule" }),
      rows,
      h("div", { class: "btn-row" }, save, h("span", { class: "muted small", text: `Up to ${meta.limits.reserved}. Leave a box empty to remove a name.` }), unsaved),
    ]);
    return section;
  }

  // ---------- friends (on Home) ----------
  function friendsPanel() {
    const meta = M();
    const list = (S.friends || []).map((f) => Object.assign({}, f, { note: f.note || "" }));
    const unsaved = h("span", { class: "dirty", hidden: true, text: "Unsaved changes" });
    const stack = h("div", { class: "stack" });
    const count = h("span", { class: "muted small" });
    const pk = picker({
      label: "Add a friend",
      onPick: (p) => { if (list.length < meta.limits.friends && !list.some((f) => f.kind === p.kind && f.key === p.key)) list.push(Object.assign({ note: "" }, p)); draw(); setDirty("friends", true, unsaved); },
      exclude: (it) => list.some((f) => f.kind === it.kind && f.key === it.key),
    });
    function draw() {
      clear(stack);
      if (!list.length) stack.appendChild(h("p", { class: "muted", text: "Nobody on your list yet." }));
      list.forEach((f, i) => {
        const note = h("input", { type: "text", maxlength: String(meta.limits.friendNote), placeholder: "Note: how you know them, their character…", value: f.note, "aria-label": `Note about ${f.label}` });
        note.addEventListener("input", () => { f.note = note.value; setDirty("friends", true, unsaved); });
        stack.appendChild(personRow(f, { note, onRemove: () => { list.splice(i, 1); draw(); setDirty("friends", true, unsaved); } }));
      });
      pk.hidden = list.length >= meta.limits.friends;
      count.textContent = `${list.length} of ${meta.limits.friends}`;
    }
    const save = h("button", { class: "btn", type: "button", text: "Save friends" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const out = await api("PUT", "/api/friends", { friends: list.map((f) => ({ kind: f.kind, key: f.key, label: f.label, note: f.note })) });
        S.friends = out.friends;
        setDirty("friends", false, unsaved);
        toast("Friends saved.", "good");
      } catch (err) { toast(err.message, "bad"); } finally { save.disabled = false; }
    });
    draw();
    return h("section", { class: "frame", id: "friends" },
      h("div", { class: "plaque" }, h("h2", { text: "Friends joining with you" })),
      h("p", { text: "The people you want to play alongside: pick them from Asmongold's Discord, or type their name if they are not on Discord. The leadership sees who asked to be placed together; it is a request, not a promised invite." }),
      h("p", { class: "muted small", text: "Your friends still register themselves: whoever wants a place signs in here too, or links their character in game." }),
      stack, h("div", { class: "field mt-s" }, pk),
      h("div", { class: "btn-row" }, save, count, unsaved));
  }

  // ---------------------------------------------------------------- apply
  function fieldBox(key, labelText, control, { hint, required, counter, hintBelow = false } = {}) {
    const err = h("span", { class: "err", hidden: true, id: `err-${key}` });
    const hintEl = hint ? h("span", { class: "hint" + (hintBelow ? " below" : ""), text: hint }) : null;
    const box = h("div", { class: "field", "data-field": key },
      h("label", { class: "lab", for: `f-${key}` }, labelText, required ? h("span", { class: "req", "aria-hidden": "true", text: "*" }) : null),
      hintBelow ? null : hintEl,
      control, hintBelow ? hintEl : null, counter || null, err);
    if (!control.id) control.id = `f-${key}`;
    box.querySelector("label").setAttribute("for", control.id);
    control.setAttribute("aria-describedby", `err-${key}`);
    return box;
  }
  function withCounter(el, max) {
    const c = h("div", { class: "counter", text: `0 / ${max}` });
    const upd = () => { c.textContent = `${[...el.value].length} / ${max}`; };
    el.addEventListener("input", upd);
    setTimeout(upd, 0);
    return c;
  }
  function selectOf(list, value, { placeholder = "Choose…", extra = [] } = {}) {
    // .109: `placeholder: null` for a select that must always hold a value (no empty choice to submit)
    return h("select", null, placeholder === null ? null : h("option", { value: "", text: placeholder }), [...list, ...extra].map((o) => h("option", { value: o.key, text: o.label, selected: o.key === value })));
  }
  function showFieldError(form, field, message) {
    const ownError = box => [...box.children].find(child => child.classList.contains("err"));
    for (const f of form.querySelectorAll(".invalid")) { f.classList.remove("invalid"); const e = ownError(f); if (e) { e.hidden = true; e.textContent = ""; } }
    const box = field && form.querySelector(`[data-field="${CSS.escape(field)}"]`);
    if (box) {
      box.classList.add("invalid");
      const e = ownError(box);
      if (e) { e.textContent = message; e.hidden = false; }
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      const c = box.querySelector("input, select, textarea, button");
      if (c) c.focus({ preventScroll: true });
    }
    toast(message, "bad");
  }
  /** Every role an application can name as a backup: the positions (Class Lead per class), plain Member left out. */
  function backupSelect(value) {
    const meta = M();
    // An appointed role cannot be a backup: its option is greyed, and a stored one comes off (the form says why).
    const opt = (key, label) => { const who = appointedTo(key); return h("option", { value: key, text: who ? `${label} (appointed)` : label, selected: key === value && !who, disabled: !!who }); };
    return h("select", null,
      h("option", { value: "", text: "No backup" }),
      h("optgroup", { label: "Membership" }, meta.positions.filter((p) => p.group === "membership" && p.key !== "member" && !reservedKey201(p.key)).map((p) => opt(p.key, p.label))));
  }

  ROUTES.apply = function apply(main) {
    const meta = M();
    const a = S.application;
    const s = S.settings || {};
    const locked = a && (a.status === "accepted" || a.status === "declined");
    const status = a ? h("span", { class: "aside" }, "Status: ", h("span", { class: "status " + a.status, text: statusText(a.status) }), ` · updated ${ago(a.updatedAt)}`) : null;
    add(main, seatsNotice(main)); // Above every branch, including a closed or decided application; refreshes only dated seat information.
    if (locked) {
      add(main, frame("Your application", status,
        h("p", { text: a.status === "accepted" ? "Your application was accepted. The guild's leadership will be in touch in Discord." : "Your application was not accepted this time. It can no longer be changed." }),
        applicationSummary(a)));
      return;
    }
    if (!s.applicationsOpen && !a) {
      add(main, frame("Your application", status, h("p", { text: "Applications are closed right now." })));
      return;
    }
    const ans = (a && a.answers) || {};
    const pendingIntent199 = S.applicationIntent199;
    const rememberedOffice199 = S.pick && office199(S.pick);
    const rememberedIntent199 = rememberedOffice199?.applicationEligible && ["officer","high_council"].includes(rememberedOffice199.applicationTrack) ? {applicationTrack:rememberedOffice199.applicationTrack,targetOffice:rememberedOffice199.key} : null;
    const intent199 = pendingIntent199 || (S.pick ? rememberedIntent199 : track199(ans.applicationTrack) ? {applicationTrack:ans.applicationTrack,targetOffice:ans.targetOffice || null} : !a ? {applicationTrack:"member",targetOffice:null} : null);
    S.applicationIntent199 = null;
    const oldReserved201 = !!a && (choicesOf(a).some(reservedKey201) || reservedIntent201(ans));
    const explicitOrdinary201 = !!pendingIntent199 && !reservedIntent201(pendingIntent199);
    if (reservedIntent201(intent199) || reservedKey201(S.pick) || oldReserved201 && !explicitOrdinary201) {
      S.pick = "";
      add(main, [frame("Reserved seats — applications are closed", null,
        h("p", {text:reservedNotice201}),
        a ? h("p", {text:"Your original application and choices remain on record. You may withdraw it, or explicitly choose an eligible ordinary role below. Nothing changes until you save a replacement application."}) : null,
        a ? applicationSummary(a) : null,
        a && a.status !== "withdrawn" ? h("button", {class:"btn small",type:"button",text:"Withdraw my application",onclick:withdraw}) : null),
        applicationRoleDirectory201(next => { location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`; },intent199 || {})]);
      return;
    }
    if (intent199?.applicationTrack === "patron" && !royalWritsVisible200()) {
      add(main, [frame("Patron applications are paused", null,
        h("p", {text:"Royal Writs are currently switched off. You can explore the other application paths below. Any existing application and its original track remain recorded; choosing another path is a new, explicit edit."}),
        a ? applicationSummary(a) : null,
        a && a.status !== "withdrawn" ? h("button", {class:"btn small",type:"button",text:"Withdraw my application",onclick:withdraw}) : null),
        applicationRoleDirectory201(next => { location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`; })]);
      return;
    }
    const form = h("form", { novalidate: true });
    const unsaved = h("span", { class: "dirty", hidden: true, text: "Unsaved changes" });
    const touch = () => setDirty("apply", true, unsaved);
    form.addEventListener("input", touch);
    form.addEventListener("change", touch);

    // 1. first choice
    let position = a ? a.position : "";
    // Arriving from "Apply for this role" on the Roles page: that role is the first choice of a new application.
    // ("#/roles/class_lead:mage" names the class too.) A backup that is the same role comes off.
    const pick = String(S.pick || "");
    S.pick = "";
    let picked = "";
    let pickClass = "";
    if (pick && (!a || a.status === "withdrawn")) {
      const base = pick.startsWith("class_lead:") ? "class_lead" : pick;
      const pp = byKey(meta.positions, base);
      if (pp && !reservedKey201(pick) && !holderOf(pp)) {
        position = picked = base;
        const cls = pick.slice("class_lead:".length);
        if (base === "class_lead" && pick !== base && meta.classes.some((c) => c.key === cls) && !appointedTo(pick)) pickClass = cls;
      }
    }
    if (intent199) {
      const target199 = office199(intent199.targetOffice);
      if (target199 && ["officer","high_council"].includes(intent199.applicationTrack)) {
        const keys199 = target199.applicationRoleKeys || [target199.key];
        const oldFirst199 = a && firstChoiceKey(a);
        const actual199 = keys199.includes(oldFirst199) ? oldFirst199 : keys199.find(key => !appointedTo(key)) || keys199[0] || target199.key;
        position = actual199.startsWith("class_lead:") ? "class_lead" : actual199;
        if (position === "class_lead") { picked = "class_lead"; pickClass = target199.key.startsWith("class_lead:") ? target199.key.slice(11) : a?.classLead || ""; }
      } else if (!["officer","high_council"].includes(intent199.applicationTrack)) position = intent199.applicationTrack === "raider" ? "raider" : "member";
    }
    const targetRoleKeys199 = office199(intent199?.targetOffice)?.applicationRoleKeys || [];
    const regionalRole199 = targetRoleKeys199.length > 1 && targetRoleKeys199.every(key => /^(raid_leader|raid_assist)_(na|eu)$/.test(key)) ? h("select", {"aria-label":"Specific raid region"}, targetRoleKeys199.map(key => h("option", {value:key,text:roleName(key),selected:key === position,disabled:!!appointedTo(key)}))) : null;
    if (regionalRole199) regionalRole199.addEventListener("change", () => {position = regionalRole199.value; sync(); touch();});
    const pickedKey = position === "class_lead" ? ((pickClass || a?.classLead) ? `class_lead:${pickClass || a.classLead}` : "") : position;
    const positionBoxes = [];
    const classText = (c) => { const who = appointedTo(`class_lead:${c.key}`); return who ? `${c.label} (appointed: ${who})` : noVoteFor(`class_lead:${c.key}`) ? `${c.label} (no public vote)` : c.label; };
    const classLeadSel = h("select", null, h("option", { value: "", text: "Choose…" }),
      meta.classes.map((c) => h("option", { value: c.key, text: classText(c), selected: picked === "class_lead" ? pickClass === c.key : !!a && a.classLead === c.key, disabled: !!appointedTo(`class_lead:${c.key}`) || !!intent199 && targetRoleKeys199.length > 0 && !targetRoleKeys199.includes(`class_lead:${c.key}`) })));
    const quietMarks = []; // [position, its "no public vote" line, its radio]: sync() keeps them to the current list
    const classLeadBox = fieldBox("classLead", "Which class would you lead?", classLeadSel, { required: true });
    const leaderBlock = h("div");
    const optionFor = (p) => {
      // An appointed role cannot be chosen (Class Lead only once every class is), and its card says who holds it.
      const holder = holderOf(p);
      const radio = h("input", { type: "radio", name: "position", value: p.key, checked: p.key === position, disabled: !!holder || reservedKey201(p.key), "aria-label": p.label });
      const quietLine = holder ? null : h("span", { class: "novote-by", id: `nv-${p.key}` }, crown(), "Chosen by the leadership: no public vote");
      if (quietLine) quietMarks.push([p, quietLine, radio]);
      const card = h("label", { class: "option" + (p.key === position ? " on" : "") + (holder ? " appointed" : "") }, posIcon(p.key), radio, h("b", { text: p.label }), h("span", { text: p.blurb }),
        holder ? h("span", { class: "appointed-by" }, tick(), appointmentLabelNode(p.key, holder)) : null,
        quietLine);
      radio.addEventListener("change", () => { position = p.key; sync(); });
      positionBoxes.push(card);
      // What the role involves, in a dialog that can also pick it; the button sits beside the card's label, not inside it
      // (a button inside the label would be a second control for one label).
      const pickThis = () => {
        radio.checked = true;
        position = p.key;
        sync();
        touch();
        if (p.key === "class_lead") classLeadSel.focus();
      };
      const more = h("button", { class: "link small more", type: "button", text: "Details", "aria-label": `Details: ${p.label}`, onclick: () => roleDialog(p, { onChoose: pickThis, current: radio.checked }) });
      return h("div", { class: "option-cell" }, card, more);
    };
    // 2. backups
    const keptBackups = (a && a.backups ? a.backups : []).filter((k) => (!pickedKey || k !== pickedKey) && !reservedKey201(k));
    const backupSels = [0, 1].map((i) => backupSelect(keptBackups[i] || ""));
    const isLeading = () => {
      const p = byKey(meta.positions, position);
      return (p && p.group === "leadership") || backupSels.some((sel) => sel.value && (sel.value.startsWith("class_lead:") || (byKey(meta.positions, sel.value) || {}).group === "leadership"));
    };
    // .45: only a leadership role that is voted on puts the application on the board; one chosen without a public vote
    // still asks the leadership questions, but its application stays with the leadership.
    /** The role keys chosen so far: the first choice (Class Lead with its class, once one is picked), then the backups. */
    const chosenKeys = () => [position === "class_lead" && classLeadSel.value ? `class_lead:${classLeadSel.value}` : position, ...backupSels.map((sel) => sel.value)].filter(Boolean);
    // Class Lead before a class is picked counts as voted unless no class is, so the box is there when one is picked.
    const isVoted = () => chosenKeys().some((k) => (k === "class_lead" ? meta.classes.some((c) => votedKey(`class_lead:${c.key}`)) : votedKey(k)));
    const noVoteChosen = () => chosenKeys().filter((k) => k !== "class_lead" && noVoteFor(k));
    const sync = () => {
      const first199 = position === "class_lead" && classLeadSel.value ? `class_lead:${classLeadSel.value}` : position;
      for (const backup of backupSels) if (backup.value === first199) backup.value = "";
      for (const c of positionBoxes) c.classList.toggle("on", c.querySelector("input").checked);
      for (const [p, line, radio] of quietMarks) {
        line.hidden = !noVoteOf(p);
        if (line.hidden) radio.removeAttribute("aria-describedby"); else radio.setAttribute("aria-describedby", line.id);
      }
      meta.classes.forEach((c, i) => { const o = classLeadSel.options[i + 1]; if (o) o.textContent = classText(c); });
      classLeadBox.hidden = position !== "class_lead";
      leaderBlock.hidden = !isLeading();
      const voted = isVoted();
      const quiet = noVoteChosen();
      const names = listText(quiet.map(roleName));
      boardNote.hidden = !voted;
      boardPortraitOk.disabled = !voted || !boardOk.checked;
      boardIntentOk199.disabled = !voted || !boardOk.checked || !intent199;
      boardWhere.textContent = voted && quiet.length
        ? `${names} ${quiet.length === 1 ? "has" : "have"} no public vote, so your application is not listed under ${quiet.length === 1 ? "it" : "them"} there. If the leadership puts ${quiet.length === 1 ? "it" : "them"} to the vote later, it will be.`
        : "";
      boardWhere.hidden = !boardWhere.textContent;
      privateNote.hidden = voted || !quiet.length;
      privateText.textContent = quiet.length ? `${names} ${quiet.length === 1 ? "is" : "are"} chosen by the guild's leadership without a public vote, so your application is not on the voting board: only the leadership reads it.` : "";
    };
    for (const sel of backupSels) sel.addEventListener("change", sync);
    classLeadSel.addEventListener("change", sync);
    const posField = h("fieldset", { class: "field", "data-field": "position" },
      h("legend", { class: "sr", text: "Your first choice" }),
      h("p", { class: "muted small" }, "Not sure what a role involves? Open its ", h("b", { text: "Details" }), ", or read ",
        h("a", { href: "#/roles", target: "_blank", rel: "noopener", text: "every role on one page" }), " (it opens in a new tab, so nothing you typed here is lost)."),
      h("div", { class: "group-label", text: "Membership" }),
      h("div", { class: "options" }, meta.positions.filter((p) => p.group === "membership" && !reservedKey201(p.key)).map(optionFor)),
      h("span", { class: "err", hidden: true }));
    if (intent199) posField.hidden = true;
    const trackPicker199 = applicationRoleDirectory201(next => {
      S.applicationIntent199 = next;
      location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`;

    }, intent199 || {});
    // Voted leadership roles put the application on the board, and only with the applicant's own tick (an application
    // saved before the board covered one of its roles stays off it until then). The Worker checks the same.
    const boardOk = h("input", { type: "checkbox", checked: !!(a && a.boardAt && (a.status === "submitted" || a.status === "reviewing")) });
    const boardIntentOk199 = h("input", {type:"checkbox",id:"board-application-intent199",checked:false});
    const boardPortraitOk = h("input", { type: "checkbox", id: "board-portrait-opt-in", checked: boardOk.checked && ans.boardPortraitOptIn === true });
    boardOk.addEventListener("change", sync);
    const boardWhere = h("p", { class: "small", hidden: true });
    const boardNote = h("div", { class: "field", "data-field": "board" },
      noticeBox("info", "icon-vote",
        h("p", null, h("strong", { text: "Your application goes on the voting board. " }), "Leadership roles are voted on: everyone signed in here can read your application there and vote for or against. They see your Discord display name and class icon, your class, role, where you play from, which raid evenings you can make, and your answers to the four questions about your experience, why Olympus, leading people, and the loot argument. Your Discord picture is shown only if you choose the separate optional box below."),
        boardWhere,
        h("p", { class: "small", text: "Your main character, professions, logs, references, voice, hours and the last box stay with the guild's leadership unless you separately share declared character names and talent builds below. Nobody but the leadership sees how anyone voted or any counts." }),
        h("label", { class: "check" }, boardOk, h("span", { text: "Show my application on the voting board." })),
        intent199 ? h("label", {class:"check"}, boardIntentOk199, h("span", {text:"Also show my selected application track and specific office / portfolio as badges on the voting board (optional; choose again on each save)."})) : null,
        h("div", { class: "field", "data-field": "boardPortrait" },
          h("label", { class: "check" }, boardPortraitOk, h("span", { text: "Also show my Discord profile picture on the voting board (optional)." })),
          h("p", { class: "muted small", text: "Earlier board consent did not include a Discord picture. Leave this unticked to keep it hidden on the board; you can change this choice by saving your application." }),
          h("span", { class: "err", hidden: true }))),
      h("span", { class: "err", hidden: true }));
    // Leadership roles chosen without a public vote, and nothing voted: nothing to agree to, only this to know.
    const privateText = h("span");
    const privateNote = h("div", { class: "field", hidden: true }, noticeBox("ok", "icon-shield", h("p", null, h("strong", { text: "No public vote. " }), privateText)));

    // 3. about you
    const character = h("input", { type: "text", value: (a && a.character) || "", maxlength: "40", placeholder: "First Last", autocomplete: "off", spellcheck: "false" });
    const cls = selectOf(meta.classes, a ? a.class : "", { extra: [{ key: "undecided", label: "Undecided" }] });
    const role = selectOf(meta.roles, a ? a.role : "");
    // .197: declared application characters and their optional 30/60 builds, separate from verified roster identity.
    const talentRows = [], talentList = h("div", {class:"stack"}), talentAdd = h("button", {type:"button",class:"btn small",text:"Add declared alt build"});
    const talentSharing = h("input", {type:"checkbox",id:"board-talent-builds-opt-in",checked:!!(a && a.boardAt && ans.boardTalentBuildsOptIn === true)});
    let talentRowSequence = 0;
    const addTalentRow = (stored = {}, primary = false) => {
      if (talentRows.length >= 3) return;
      const id = ++talentRowSequence;
      const name = h("input", {type:"text",maxlength:"40",value:primary ? character.value : stored.character || "",readonly:primary});
      const classPick = selectOf(meta.classes, primary ? cls.value : stored.class || "", {placeholder:"Choose class…"}); classPick.disabled = primary;
      const at30 = h("textarea", {rows:"2",maxlength:"768",value:stored.build30 || "",spellcheck:"false",autocomplete:"off"});
      const at60 = h("textarea", {rows:"2",maxlength:"768",value:stored.build60 || "",spellcheck:"false",autocomplete:"off"});
      const row = {name,classPick,at30,at60,primary};
      const remove = h("button", {type:"button",class:"btn small",text:primary ? "Clear main builds" : "Remove declared alt"});
      row.node = h("fieldset", {class:"card talent-application-character"}, h("legend", {text:primary ? "Main application character" : "Declared alt (self-reported)"}),
        fieldBox("talent-name-"+id,"Character name",name),fieldBox("talent-class-"+id,"Class",classPick),
        fieldBox("talent-30-"+id,"Level 30 build code (optional)",at30),fieldBox("talent-60-"+id,"Level 60 build code (optional)",at60),remove);
      remove.addEventListener("click", () => { if(primary){at30.value=at60.value="";}else{talentRows.splice(talentRows.indexOf(row),1);row.node.remove();talentAdd.disabled=false;} touch(); });
      for(const control of [name,classPick,at30,at60]) control.addEventListener("input",touch);
      talentRows.push(row);talentList.appendChild(row.node);talentAdd.disabled=talentRows.length>=3;
    };
    const savedTalentCharacters = ans.talentBuilds && ans.talentBuilds.version === 1 && Array.isArray(ans.talentBuilds.characters) ? ans.talentBuilds.characters.slice(0,3) : [];
    addTalentRow(savedTalentCharacters[0],true);for(const saved of savedTalentCharacters.slice(1)) addTalentRow(saved);
    talentAdd.addEventListener("click", () => {addTalentRow();touch();});
    const syncPrimaryBuild = () => {talentRows[0].name.value=character.value;talentRows[0].classPick.value=cls.value;};
    character.addEventListener("input",syncPrimaryBuild);cls.addEventListener("change",syncPrimaryBuild);
    const talentBuildBox = h("section", {class:"field", "data-field":"talentBuilds"},h("h3",{text:"Character talent builds (optional)"}),
      h("p",{class:"muted small",text:"Attach level 30 and level 60 builds from the current talent calculator for your main and up to two declared alts. These names are self-reported application details, not roster verification. Builds remain with the leadership unless you make the separate board-sharing choice below."}),
      h("a",{href:"#/talents",target:"_blank",rel:"noopener",text:"Open the talent calculator"}),talentList,talentAdd,
      h("div",{class:"field", "data-field":"boardTalentBuilds"},h("label",{class:"check"},talentSharing,h("span",{text:"Also share these declared character names, classes and builds on my voting-board application (optional)."})),h("span",{class:"err",hidden:true})),h("span",{class:"err",hidden:true}));
    const updateTalentSharing = () => {talentSharing.disabled=!isVoted() || !boardOk.checked;};
    boardOk.addEventListener("change",updateTalentSharing);for(const control of [...backupSels,classLeadSel]) control.addEventListener("change",updateTalentSharing);
    for(const card of positionBoxes) card.querySelector("input").addEventListener("change",updateTalentSharing);updateTalentSharing();

    let zone = (a && a.availTz && zoneOk(a.availTz)) ? a.availTz : myZone;
    const region = selectOf(meta.regions, a ? a.region : regionFromZone(zone));
    // The professions they plan to take on their main (.45, optional): the game's icons as toggles, two primary at most.
    const professions = meta.professions || [];
    const primaryMax = meta.limits.primaryProfessions || 2;
    const profs = new Set((Array.isArray(ans.professions) ? ans.professions : []).filter((k) => byKey(professions, k)));
    const profButtons = [];
    const primaryWord = ({ 1: "one", 2: "two", 3: "three" })[primaryMax] || String(primaryMax);
    const profCount = h("span", { class: "muted small", id: "prof-count", "aria-live": "polite" });
    const primariesChosen = () => professions.filter((p) => p.kind === "primary" && profs.has(p.key)).length;
    // A primary profession past the limit stays in the tab order (aria-disabled, not disabled) and says why when pressed.
    const drawProfs = () => {
      const full = primariesChosen() >= primaryMax;
      for (const [p, b] of profButtons) {
        const on = profs.has(p.key);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.setAttribute("aria-disabled", !on && p.kind === "primary" && full ? "true" : "false");
      }
      const text = `${primariesChosen()} of ${primaryMax} chosen`;
      if (profCount.textContent !== text) profCount.textContent = text; // aria-live: said again only when it changes
    };
    let blockedAt = 0;
    const profButton = (p) => {
      const b = h("button", { class: "prof", type: "button", "aria-pressed": "false", "aria-describedby": p.kind === "primary" ? "prof-count" : null },
        h("img", { src: art(p.icon), alt: "", width: "28", height: "28" }), h("span", { text: p.label }),
        h("img", { class: "tick on-mark", src: art("ready"), alt: "", width: "16", height: "16" }));
      b.addEventListener("click", () => {
        if (profs.has(p.key)) profs.delete(p.key);
        else if (p.kind === "primary" && primariesChosen() >= primaryMax) {
          if (Date.now() - blockedAt > 4000) toast(`A character learns at most ${primaryWord} primary professions: take one off first.`, "bad");
          blockedAt = Date.now();
          return;
        }
        else profs.add(p.key);
        drawProfs();
        touch();
      });
      profButtons.push([p, b]);
      return b;
    };
    const profField = professions.length
      ? h("fieldset", { class: "field", "data-field": "professions" },
          h("legend", { class: "lab", text: "Professions you plan to take (optional)" }),
          h("span", { class: "hint", text: `On your main character: up to ${primaryWord} primary professions, plus any of Cooking, First Aid and Fishing. The Profession Coordinator plans the guild's crafting with this; only the guild's leadership sees it.` }),
          h("div", { class: "prof-group" }, h("span", { class: "prof-kind", id: "prof-primary", text: "Primary" }), profCount),
          h("div", { class: "profs", role: "group", "aria-labelledby": "prof-primary" }, professions.filter((p) => p.kind === "primary").map(profButton)),
          h("div", { class: "prof-group" }, h("span", { class: "prof-kind", id: "prof-secondary", text: "Secondary" })),
          h("div", { class: "profs", role: "group", "aria-labelledby": "prof-secondary" }, professions.filter((p) => p.kind === "secondary").map(profButton)),
          h("span", { class: "err", hidden: true }))
      : null;
    drawProfs();

    // 4. when you can play
    let bits = bitsFromHex(a && a.avail);
    let blocks = blocksFromBits(bits, zone);
    const fitBox = h("div");
    const onGrid = () => { bits = bitsFromBlocks(blocks, zone); clear(fitBox).appendChild(fitView(fitOf(bits))); touch(); };
    const gridBox = h("div");
    const drawGrid = () => { clear(gridBox).appendChild(availGrid(blocks, { onChange: onGrid })); clear(fitBox).appendChild(fitView(fitOf(bitsFromBlocks(blocks, zone)))); };
    let zones = [];
    try { zones = Intl.supportedValuesOf("timeZone"); } catch { zones = []; }
    if (!zones.includes(zone)) zones = [zone, ...zones];
    const zoneSel = h("select", { "aria-label": "Your time zone" }, zones.map((z) => h("option", { value: z, text: z.replace(/_/g, " "), selected: z === zone })));
    const zoneText = h("span", { class: "hint", text: `Shown in your time zone: ${zoneName(zone)}.` });
    zoneSel.addEventListener("change", () => {
      // The blocks stay where they are on the grid (the same local evenings), now meaning that zone's hours.
      zone = zoneSel.value;
      zoneText.textContent = `Shown in your time zone: ${zoneName(zone)}.`;
      bits = bitsFromBlocks(blocks, zone);
      clear(fitBox).appendChild(fitView(fitOf(bits)));
      if (!region.value) region.value = regionFromZone(zone);
    });
    const quick = (text, fn) => h("button", { class: "btn small", type: "button", text, onclick: () => { fn(); onGrid(); drawGrid(); } });
    const setAll = (pred) => { for (let d = 0; d < 7; d++) for (let b = 0; b < 8; b++) if (pred(d, b)) blocks[d][b] = true; };
    const availField = h("div", { class: "field", "data-field": "avail" },
      h("span", { class: "lab" }, "When can you usually play?", h("span", { class: "req", "aria-hidden": "true", text: "*" })),
      h("span", { class: "hint", text: "Tap the blocks you are usually online, or drag across them. Rough is fine." }),
      zoneText,
      gridBox,
      h("div", { class: "avail-tools" },
        quick("Every evening", () => setAll((d, b) => b === 6 || b === 7)),
        quick("Weekend days", () => setAll((d, b) => d >= 5 && b >= 3)),
        quick("Clear", () => { blocks = DAYS.map(() => new Array(8).fill(false)); })),
      h("div", { class: "avail-tools" }, h("span", { class: "muted small", text: "Raid evenings you can make:" }), fitBox),
      h("details", { class: "zone small" }, h("summary", { class: "muted", text: "Not your time zone?" }), zoneSel),
      h("span", { class: "hint", text: "NA raid evenings: about 7 pm to midnight Eastern (4 to 9 pm Pacific). EU raid evenings: about 7 pm to midnight Central European (6 to 11 pm UK)." }),
      h("span", { class: "err", hidden: true }));
    drawGrid();

    const q = Object.fromEntries(meta.questions.map((x) => [x.key, x]));
    const textFor = (key, opts = {}) => {
      const def = q[key];
      const el = def.long ? h("textarea", { maxlength: String(def.max), rows: "5" }) : h("input", { type: key === "logs" ? "url" : "text", maxlength: String(def.max), value: ans[key] || "", placeholder: key === "logs" ? "https://" : "" });
      if (def.long) el.value = ans[key] || "";
      return fieldBox(key, def.label, el, Object.assign({ hint: def.hint, required: def.required, counter: def.long ? withCounter(el, def.max) : null }, opts));
    };
    const hours = selectOf(meta.hours, ans.hours || "");
    const voice = selectOf(meta.voice, ans.voice || "");
    const refs = (ans.references || []).slice();
    const refList = h("div", { class: "stack" });
    const drawRefs = () => {
      clear(refList);
      refs.forEach((p, i) => refList.appendChild(personRow(p, { onRemove: () => { refs.splice(i, 1); drawRefs(); touch(); } })));
      refPicker.hidden = refs.length >= meta.limits.references;
    };
    const refPicker = picker({
      label: "Add a reference",
      onPick: (p) => { if (!refs.some((r) => r.kind === p.kind && r.key === p.key)) refs.push(p); drawRefs(); touch(); },
      exclude: (it) => refs.some((r) => r.kind === it.kind && r.key === it.key),
    });
    const fallback = h("input", { type: "checkbox", checked: a ? a.fallback : true });
    const ack = h("input", { type: "checkbox", checked: false });
    const submit = h("button", { class: "btn big", type: "submit", text: a ? "Save changes" : "Submit application" });
    add(leaderBlock, [
      h("div", { class: "rule" }),
      h("div", { class: "section-title" }, icon("pos-officer"), h("h3", { text: "Leading people" })),
      textFor("leadership"),
      fieldBox("hours", "How many hours a week can you give the role?", hours, { required: true }),
      textFor("scenario"),
    ]);
    add(form, [
      h("nav", { class: "btn-row application-sections", "aria-label": "Application sections" }, [["application-choices", "Role choices"], ["application-about", "About you"], ["application-availability", "When you play"], ["application-submit", "Review and submit"]].map(([id, text]) =>
        h("button", { class: "btn small", type: "button", text, onclick: () => { const target = document.getElementById(id); if (target) scrollToSection(target); } }))),
      h("div", { class: "section-title", id: "application-choices" }, icon("icon-apply"), h("h3", { text: "Your first choice" })),
      intent199 ? applicationBadges199(intent199) : h("p", {class:"muted small",text:"This older application has no track recorded. Choose a track below to add one; its existing role choices remain until then."}),
      trackPicker199,
      regionalRole199 ? fieldBox("applicationRaidRegion199", "Choose the specific raid-region seat", regionalRole199, {required:true}) : null,
      posField,
      classLeadBox,
      h("div", { class: "section-title" }, icon("icon-shield"), h("h3", { text: "Backup choices (optional)" })),
      h("p", { class: "muted small", text: "Other ordinary roles or activities you would take, in order. Leader, High Council and Officer Corps seats cannot be selected as first choices or backups. Historical board records are separate." }),
      h("div", { class: "field", "data-field": "backups" },
        h("div", { class: "backups" },
          h("label", { class: "field" }, h("span", { class: "lab", text: "Second choice" }), backupSels[0]),
          h("label", { class: "field" }, h("span", { class: "lab", text: "Third choice" }), backupSels[1])),
        h("span", { class: "err", hidden: true })),
      h("label", { class: "check field" }, fallback, h("span", { text: "If none of these work out, I still want a place in Olympus as a member." })),
      boardNote,
      privateNote,
      h("div", { class: "rule" }),
      h("div", { class: "section-title", id: "application-about" }, icon("icon-heal"), h("h3", { text: "About you" })),
      h("div", { class: "grid two" },
        fieldBox("character", "Main character", character, { hint: "Optional for now. First and last name, like Fern Melder.", hintBelow: true }),
        fieldBox("class", "Class", cls, { required: true }),
        fieldBox("role", "Role", role, { required: true }),
        fieldBox("region", "Where you play from", region, { required: true })),
      profField,
      h("div", { class: "rule" }),
      h("div", { class: "section-title", id: "application-availability" }, icon("icon-clock"), h("h3", { text: "When you play" })),
      availField,
      h("div", { class: "rule" }),
      h("div", { class: "section-title" }, icon("icon-names"), h("h3", { text: "In your own words" })),
      textFor("experience"),
      textFor("why"),
      leaderBlock,
      h("div", { class: "rule" }),
      h("div", { class: "section-title" }, icon("icon-pvp"), h("h3", { text: "Extras" })),
      h("div", { class: "grid two" }, textFor("logs", { hintBelow: true }), fieldBox("voice", "Can you use voice chat in raids?", voice, { required: true })),
      textFor("talentBuild", { hintBelow: true }),
      talentBuildBox,
      h("div", { class: "field", "data-field": "references" },
        h("span", { class: "lab", text: "References (optional)" }),
        h("span", { class: "hint", text: `Up to ${meta.limits.references} people in the community who can vouch for you.` }),
        refList, h("div", { class: "mt-s" }, refPicker), h("span", { class: "err", hidden: true })),
      textFor("extra"),
      h("div", { class: "rule" }),
      h("div", { class: "field", "data-field": "ack" },
        noticeBox("warn", "icon-warning",
          h("p", null, h("strong", { text: "Read this before you submit. " }), "Joke, troll or abusive applications are permanently denied, and the denial covers everything this account does here: its votes, nominations and reserved names. It is not reconsidered. So is registering several accounts to vote more than once."),
          h("label", { class: "check" }, ack, h("span", { text: "I understand, and everything above is true." }))),
        h("span", { class: "err", hidden: true })),
      h("div", { class: "savebar apply-savebar", id: "application-submit" }, h("div", { class: "btn-row" }, submit, h("button", { class: "btn small", type: "button", text: "Back to role choices", onclick: () => scrollToSection(document.getElementById("application-choices")) })), unsaved),
      a && (a.status === "submitted" || a.status === "reviewing")
        ? h("div", { class: "btn-row mt" }, h("button", { class: "btn small", type: "button", text: "Withdraw my application", onclick: withdraw }), h("span", { class: "muted small", text: a.boardAt ? "It comes off the voting board; you can apply again while applications are open." : "You can apply again while applications are open." }))
        : null,
    ]);
    drawRefs();
    sync();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ack.checked) return showFieldError(form, "ack", "Tick the box to confirm you read the warning.");
      const answers = {};
      for (const def of meta.questions) {
        const box = form.querySelector(`[data-field="${def.key}"]`);
        const el = box && box.querySelector("input, textarea");
        if (el && !box.closest("[hidden]")) answers[def.key] = el.value;
      }
      answers.hours = hours.value;
      answers.voice = voice.value;
      const filledTalentRows = talentRows.filter(row => row.at30.value.trim() || row.at60.value.trim());
      if (filledTalentRows.length && !filledTalentRows[0].primary) filledTalentRows.unshift(talentRows[0]);
      answers.talentBuilds = {version:1,characters:filledTalentRows.map(row => ({character:row.primary ? character.value : row.name.value,class:row.primary ? cls.value : row.classPick.value,build30:row.at30.value.trim(),build60:row.at60.value.trim()}))};
      answers.references = refs.map((r) => ({ kind: r.kind, key: r.key, label: r.label }));
      answers.professions = professions.filter((p) => profs.has(p.key)).map((p) => p.key);
      const backups = backupSels.map((x) => x.value).filter(Boolean);
      const body = { ...(intent199 ? {applicationTrack:intent199.applicationTrack,targetOffice:intent199.targetOffice,boardApplicationIntent:isVoted() && boardOk.checked && boardIntentOk199.checked} : {}), position, classLead: position === "class_lead" ? classLeadSel.value : null, backups, character: character.value, class: cls.value, role: role.value, region: region.value, avail: hexFromBits(bitsFromBlocks(blocks, zone)), availTz: zone, fallback: fallback.checked, board: isVoted() && boardOk.checked, boardPortrait: isVoted() && boardOk.checked && boardPortraitOk.checked, boardTalentBuilds:isVoted() && boardOk.checked && talentSharing.checked, answers, ack: true };
      submit.disabled = true;
      try {
        const out = await api("PUT", "/api/application", body);
        S.application = out.application;
        S.applicationIntent199 = null;
        setDirty("apply", false, unsaved);
        toast(a ? "Application updated." : "Application submitted. Good luck!", "good");
        render();
      } catch (err) {
        // Put to the vote since this page was opened: the refusal brings the current list, and the box appears to tick.
        if (err.data && Array.isArray(err.data.noVote) && S.settings) { S.settings.noVote = err.data.noVote; sync(); }
        showFieldError(form, err.data && err.data.field, err.message);
      } finally {
        submit.disabled = false;
      }
    });
    async function withdraw() {
      if (!(await confirmBox("Withdraw your application?", `It stays on record as withdrawn${a && a.boardAt ? " and comes off the voting board" : ""}. You can apply again later while applications are open.`, "Withdraw"))) return;
      try {
        const out = await api("DELETE", "/api/application");
        S.application = out.application;
        toast("Application withdrawn.");
        render();
      } catch (err) { toast(err.message, "bad"); }
    }
    const lost = a ? choicesOf(a).filter(appointedTo) : [];
    const lostNote = lost.length
      ? noticeBox("info", "icon-shield", h("p", null, h("strong", null, appointedText(lost), " "),
          appointedTo(firstChoiceKey(a))
            ? "Choose another first choice below to save your application again; until then it still counts for your other choices."
            : "It is off your backup choices below; saving keeps that, and your other choices stand either way."))
      : null;
    add(main, frame("Your application", status,
      h("p", { class: "muted", text: "Fields marked * are required. You can come back and change your answers until the leadership decides." }),
      oldReserved201 && explicitOrdinary201 ? noticeBox("info","pos-member",h("p",{text:"You explicitly chose an ordinary role. Saving will replace the reserved first/backup choices in your old application; the original record stays unchanged until then."})) : null,
      lostNote,
      form));
    // Picked on the Roles page: show that card (the page would otherwise open at the top, the pick out of sight).
    const pickedCard = picked && positionBoxes.find((c) => c.querySelector("input").value === picked);
    if (pickedCard) setTimeout(() => { pickedCard.scrollIntoView({ block: "center" }); pickedCard.querySelector("input").focus({ preventScroll: true }); }, 0);
  };
  /** Professions with their icons, as a line: "Alchemy, Herbalism, Cooking". */
  const profList = (list) => h("span", { class: "prof-list" }, list.map((p, i) => [i ? ", " : null, h("span", { class: "prof-tag" }, h("img", { src: art(p.icon), alt: "", width: "20", height: "20" }), p.label)]));
  /** The application as a reader sees it: the admin page, and your own once it is decided. */
  function applicationSummary(a, { zone = myZone } = {}) {
    const meta = M();
    const ans = a.answers || {};
    const dl = h("dl", { class: "kv" });
    const row = (k, v) => { if (v) add(dl, [h("dt", { text: k }), h("dd", null, v)]); };
    row("First choice", h("span", null, posIcon(firstChoiceKey(a), "s"), " ", roleName(firstChoiceKey(a))));
    (a.backups || []).forEach((k, i) => row(i ? "Third choice" : "Second choice", h("span", null, posIcon(k, "s"), " ", roleName(k))));
    row("Otherwise", a.fallback ? "Still wants a place as a member" : "");
    row("Main character", a.character);
    row("Class", clsLabel(a.class));
    row("Role", h("span", { class: "cls" }, roleIcon(a.role), " ", labelOf(meta.roles, a.role)));
    row("From", labelOf(meta.regions, a.region));
    const profs = (Array.isArray(ans.professions) ? ans.professions : []).map((k) => byKey(meta.professions || [], k)).filter(Boolean);
    row("Professions", profs.length ? profList(profs) : "");
    row("Voice", labelOf(meta.voice, ans.voice));
    row("Hours a week", ans.hours ? labelOf(meta.hours, ans.hours) : "");
    const out = h("div", null, applicationBadges199(ans), dl);
    if (a.avail) {
      add(out, [
        h("h3", { class: "mt", text: "When they play" }),
        h("p", { class: "muted small", text: `Shown in ${zone === myZone ? "your" : "this"} time zone, ${zoneName(zone)}${a.availTz && a.availTz !== zone ? `; they filled it in as ${a.availTz.replace(/_/g, " ")}` : ""}.` }),
        availGrid(blocksFromBits(bitsFromHex(a.avail), zone), { label: "When they play" }),
        h("p", null, fitView(a.fit || fitOf(bitsFromHex(a.avail)))),
      ]);
    }
    const paper = h("div", { class: "parchment answers" });
    if (ans.availability) add(paper, [h("h4", { text: "When can you play? (before the grid)" }), h("div", { class: "text", text: ans.availability })]);
    for (const q of meta.questions) {
      if (!ans[q.key]) continue;
      if (q.key === "talentBuild") {
        const code = String(ans[q.key]);
        const match = /^ot1\.([a-f0-9]{12})\.(warrior|paladin|hunter|rogue|priest|shaman|mage|warlock|druid)\.(?:[1-5][0-9]|60)\.[0-5]+$/.exec(code);
        const currentBuild = match && match[1] === meta.talentSnapshotRevision && match[2] === a.class;
        add(paper, [h("h4", { text: q.label }), currentBuild ? h("a", { href: `#/talents/${match[2]}/${encodeURIComponent(code)}`, text: "Open the attached talent build" }) : h("p", { class: "muted small", text: "This attachment is unavailable in the current calculator." })]);
        continue;
      }
      add(paper, [h("h4", { text: q.label }), h("div", { class: "text", text: ans[q.key] })]);
    }
    const declaredBuilds = ans.talentBuilds && ans.talentBuilds.version === 1 && Array.isArray(ans.talentBuilds.characters) ? ans.talentBuilds.characters.slice(0,3).flatMap(item => [30,60].filter(level => item["build"+level]).map(level => ({character:item.character,class:item.class,level,code:item["build"+level]}))) : [];
    if(declaredBuilds.length) add(paper,[h("h4",{text:"Declared character talent builds"}),talentBuildLinks(declaredBuilds),h("p",{class:"muted small",text:ans.boardTalentBuildsOptIn === true ? "Separate board sharing was selected; the board shows only currently valid attachments while its consent remains active." : "Private application attachments; not shared on the voting board."})]);
    if (paper.firstChild) { paper.classList.add("mt"); out.appendChild(paper); }
    if ((ans.references || []).length) add(out, [h("h3", { class: "mt", text: "References" }), h("div", { class: "stack" }, ans.references.map((p) => personRow(p)))]);
    return out;
  }

  function talentBuildLinks(items) {
    return h("ul", {class:"talent-build-links"}, items.slice(0,6).map(item => {
      const code = typeof item.code === "string" ? item.code : "", match = /^ot1\.([a-f0-9]{12})\.(warrior|paladin|hunter|rogue|priest|shaman|mage|warlock|druid)\.(30|60)\.[0-5]+$/.exec(code);
      const current = match && match[1] === M().talentSnapshotRevision && match[2] === item.class && Number(match[3]) === item.level;
      return h("li",null,h("span",{text:String(item.character || "Declared character")+" · "+labelOf(M().classes || [],item.class)+" · level "+item.level+" — "}),current ? h("a",{href:`#/talents/${match[2]}/${encodeURIComponent(code)}`,text:"Open build"}) : h("span",{class:"muted",text:"Unavailable in the current calculator"}));
    }));
  }

  // ---------------------------------------------------------------- vote: the board, and write-ins
  const V = { role: "", offset: 0, cls: "", fit: "", todo: false, summary: null };
  const boardRoleCounts = new WeakMap(); // Counts only, scoped to the displayed role; never candidate data.
  const boardShells = new WeakMap(); // Mounted navigation only; each selected role still gets a fresh admitted read.
  ROUTES.vote = async function vote(main, parts) {
    const selectedTrack199 = track199(dec(parts[0] || ""));
    if (parts.length > 1 && selectedTrack199 && (reservedIntent201({applicationTrack:selectedTrack199.id,targetOffice:dec(parts[1] || "")}))) {
      clear(main); boardShells.delete(main); main.dataset.applicationTrack199 = "true";
      S.applicationIntent199 = null; S.pick = "";
      add(main, [frame("Reserved seat — no applications",null,h("p",{text:reservedNotice201})),
        applicationRoleDirectory201(next => {location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`;},{targetOffice:dec(parts[1] || "")})]);
      return;
    }
    if (parts.length > 1) {
      clear(main); boardShells.delete(main); main.dataset.applicationTrack199 = "true";
      if (!selectedTrack199 || parts.length !== 2) {add(main, frame("Application track unavailable", null, h("a", {href:"#/vote",text:"Choose a supported application track"}))); return;}
      const selectedOffice199 = dec(parts[1]), needsOffice199 = ["officer","high_council"].includes(selectedTrack199.id), exactOffice199 = selectedOffice199 !== "new", office = office199(selectedOffice199);
      if ((needsOffice199 || exactOffice199) && (!office || !office.applicationEligible || office.applicationTrack !== selectedTrack199.id)) {
        add(main, frame("Application track unavailable", null, h("p", {text:"Choose a currently supported office and its matching application track."}), h("a", {href:"#/vote",text:"Choose your application track"}))); return;
      }
      S.applicationIntent199 = {applicationTrack:selectedTrack199.id,targetOffice:exactOffice199 ? selectedOffice199 : null};
      ROUTES.apply(main); return;
    }
    const meta = M();
    const s = S.settings || {};
    const closed = !s.votingOpen;
    if (main.dataset.applicationTrack199) { clear(main); delete main.dataset.applicationTrack199; boardShells.delete(main); }
    const settingsKey = JSON.stringify([s.votingOpen, s.noVote, s.appointed, s.royalWritsOn === true]);
    let shell = boardShells.get(main);
    if (shell && shell.settingsKey !== settingsKey) { clear(main); shell = null; boardShells.delete(main); }
    if (!main.querySelector("#application-directory201")) {
      add(main, [applicationRoleDirectory201(next => { location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`; }), writsPanel199("vote")]);
    }
    // The Worker already caches these counts for 30 seconds. Reuse them while moving between roles, but always
    // read the selected role afresh: a changed appointment, membership or voting switch still refuses at the server.
    const cached = boardSummaryRead && nowMs() >= boardSummaryRead.at && nowMs() - boardSummaryRead.at < 30000;
    const summary = cached ? boardSummaryRead.data : V.summary || { roles: [] };
    V.summary = summary;
    const counts = Object.fromEntries(summary.roles.map((r) => [r.key, r]));
    const progressRows = new Map();
    const wanted = dec(parts[0] || "");
    if (wanted && meta.ballots.some((b) => b.key === wanted)) { if (wanted !== V.role) { V.offset = 0; } V.role = wanted; }
    if (!V.role || !meta.ballots.some((b) => b.key === V.role)) {
      // Only roles this page knows: a board added after it was opened has no ballot here.
      const busiest = summary.roles.filter((r) => votedKey(r.key) && meta.ballots.some((b) => b.key === r.key)).sort((x, y) => y.applicants - x.applicants)[0];
      V.role = busiest && busiest.applicants ? busiest.key : "officer";
      V.offset = 0;
    }
    const role = V.role; // the role this page shows: everything below uses it, never V.role again
    const ballot = meta.ballots.find((b) => b.key === role);
    // Another role is another address, so "Leave without saving?" can still keep this page as it is; the route sets
    // V.role (and starts at the first page) only once the address has changed.
    const go = (key) => { location.hash = "#/vote/" + encodeURIComponent(key); };
    const item = (b) => {
      const c = counts[b.key] || { applicants: 0, votable: 0, voted: 0 };
      const who = appointedTo(b.key);
      const quiet = noVoteFor(b.key);
      // votable: the applicants this voter can vote on (not themself); "3/5" is their progress through those. An
      // appointed role shows the game's ready tick instead, and one without a public vote the party leader's crown.
      const a = h("a", { class: "role-item" + (who ? " appointed" : quiet ? " novote" : ""), href: "#/vote/" + encodeURIComponent(b.key), "aria-current": b.key === role ? "page" : false },
        posIcon(b.key), h("span", { text: b.group === "class" ? b.label.replace(" Class Lead", "") : b.label }),
        who
          ? h("span", { class: "n", title: appointmentLabel(who), "data-appointment-title": b.key }, h("img", { class: "tick", src: art("ready"), alt: "appointed", width: "16", height: "16" }))
          : quiet
            ? h("span", { class: "n", title: "No public vote: the leadership chooses" }, crown("no public vote"))
            : h("span", { class: "n" + (c.votable && c.voted >= c.votable ? " done" : ""), text: c.votable ? `${c.voted}/${c.votable}` : "—", title: progressTitle(c) }));
      progressRows.set(b.key, a);
      return a;
    };
    const lead = meta.ballots.filter((b) => b.group === "leadership");
    const classes = meta.ballots.filter((b) => b.group === "class");
    const roleList = shell ? shell.roleList : h("nav", { class: "role-list", "aria-label": "Roles" },
      h("p", { class: "role-list-hint small muted", text: "Scroll this list for every role." }),
      h("div", { class: "group-label", text: "Leadership" }), lead.map(item),
      h("div", { class: "group-label", text: "Class leads" }), classes.map(item));
    if (shell) for (const b of meta.ballots) {
      const link = roleList.querySelector(`a[href="#/vote/${encodeURIComponent(b.key)}"]`);
      if (b.key === role) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
      progressRows.set(b.key, link);
    }
    const pickText = (b) => (appointedTo(b.key) ? `${b.label} (appointed)` : noVoteFor(b.key) ? `${b.label} (no public vote)` : `${b.label} (${(counts[b.key] || {}).applicants || 0})`);
    const rolePick = shell ? shell.rolePick : h("select", { class: "role-pick", "aria-label": "Role" },
      h("optgroup", { label: "Leadership" }, lead.map((b) => h("option", { value: b.key, text: pickText(b), selected: b.key === role }))),
      h("optgroup", { label: "Class leads" }, classes.map((b) => h("option", { value: b.key, text: pickText(b), selected: b.key === role }))));
    if (!shell) rolePick.addEventListener("change", () => { const key = rolePick.value; rolePick.value = V.role; go(key); });
    rolePick.value = role;
    const boardBox = h("div", { class: "board-results", "aria-busy": "true" },
      counts[role] && counts[role].applicants === 0 ? h("p", { class: "muted", "data-board-last-empty": true, text: "No applications at the last check." }) : null,
      h("p", { class: "muted small", role: "status", text: "Checking applications…" }));
    const summaryStatus = shell ? shell.summaryStatus : h("p", { class: "muted tiny board-summary-status", role: "status" });
    summaryStatus.textContent = cached ? "" : "Refreshing role counts…";
    const holder = appointedTo(role);
    const quiet = !holder && noVoteFor(role);
    const content = h("div", { class: "board-role-content" },
      rolePick,
      h("section", { class: "frame" },
        h("div", { class: "plaque" }, h("h2", null, posIcon(role, "s"), " ", ballot.label),
          holder ? h("span", { class: "aside", text: "Appointed" })
            : quiet ? h("span", { class: "aside", text: "No public vote" })
            : h("span", { class: "aside", id: "role-applicants", text: `${plural((counts[role] || {}).applicants || 0, "applicant")}` })),
        roleAbout(role),
        holder
          ? appointedNote(ballot, holder)
          : quiet
            ? noVoteNote(ballot)
            : [closed ? noticeBox("warn", "icon-warning", h("p", { text: "Voting is closed right now. Your votes are kept as they are." })) : null, boardBox]),
      holder || quiet ? null : writeIns(ballot, closed));
    const anyQuiet = meta.ballots.some((b) => noVoteFor(b.key));
    if (shell) shell.content.replaceWith(content);
    else add(main, [
      h("section", { class: "frame" },
        h("div", { class: "plaque" }, h("h2", { text: "Vote on who leads Olympus" })),
        h("p", { text: "Choose a role, read its applications and vote for or against a candidate." }),
        h("details", { class: "voting-help" }, h("summary", { text: "How the board works" }),
          h("p", null, "Leadership applicants are on this board under each voted role they chose, first choice or backup, with their answers. Vote ", h("b", { text: "for" }), " the people you want in a role and ", h("b", { text: "against" }), " the ones you do not; click again to take a vote back. You can change your mind until voting closes."),
          anyQuiet ? h("p", { class: "muted small" }, "Roles marked with the crown ", crown(), " are chosen by the guild's leadership without a public vote: they have no board and no write-ins.") : null),
        summaryStatus,
        noticeBox("ok", "icon-shield", h("p", null, h("strong", { text: "Your votes are private. " }), "Nobody sees how anyone voted or how many votes anyone has, except the guild's leadership. Every voter sees the applicants in a different order, so nobody is first for everyone."))),
      h("div", { class: "board-layout" }, roleList, content),
    ]);
    boardShells.set(main, { settingsKey, roleList, rolePick, summaryStatus, content });
    // A prior role's response must be inert even though its surrounding page remains mounted.
    const live = () => main.parentNode === app && boardShells.get(main)?.content === content;
    const summaryRequest = cached ? null : api("GET", "/api/board", undefined, { live });
    const countRead = summaryRequest && summaryRequest.then(next => {
      if (!live()) return;
      // A selected-role response is authoritative for that role; a cached summary
      // arriving later must never overwrite its fresh totals.
      const freshRole = boardBox.dataset.boardFresh === role && boardRoleCounts.get(boardBox);
      if (freshRole) {
        const row = next.roles.find(value => value.key === role);
        if (row) Object.assign(row, { applicants: freshRole.applicants, votable: freshRole.votable, voted: freshRole.voted });
      }
      V.summary = next;
      boardSummaryRead = { data: next, at: nowMs() };
      for (const row of next.roles) counts[row.key] = row;
      for (const b of meta.ballots) {
        const n = progressRows.get(b.key).querySelector(".n"), c = counts[b.key] || { applicants: 0, votable: 0, voted: 0 };
        if (n && !appointedTo(b.key) && !noVoteFor(b.key)) { n.textContent = c.votable ? `${c.voted}/${c.votable}` : "—"; n.title = progressTitle(c); n.classList.toggle("done", !!c.votable && c.voted >= c.votable); }
      }
      for (const option of rolePick.querySelectorAll("option")) {
        const b = meta.ballots.find(value => value.key === option.getAttribute("value"));
        if (b) option.textContent = pickText(b);
      }
      if (counts[role]) showRoleProgress(counts[role]);
      summaryStatus.textContent = "";
    }).catch(error => {
      if (!live()) return;
      summaryStatus.textContent = "Role counts could not be refreshed. " + error.message;
      if (error.status === 401 || error.status === 403) {
        boardBox.dataset.boardRequest = "refused";
        boardBox.setAttribute("aria-busy", "false");
        clear(boardBox);
        boardBox.appendChild(errorLine(explain(error)));
        // Keep a person's unsaved text while refusing further actions after a
        // current admission failure. The dirty-navigation guard remains active.
        for (const control of content.querySelectorAll("button,input,select,textarea")) control.disabled = true;
      }
    });
    await Promise.all([countRead, !holder && !quiet ? drawBoard(boardBox, closed, role) : null]);
  };
  /** Above a role's board: what the role is, with its time, responsibilities and expectations one click away. */
  function roleAbout(key) {
    const p = positionOf(key);
    if (!p || !p.info) return null;
    return h("div", { class: "role-about" },
      h("p", { class: "muted", text: p.info.about }),
      h("details", null, h("summary", { text: "Time, responsibilities and expectations" }), roleInfo(p, { about: false })));
  }
  const appointedNote = (ballot, holder) => noticeBox("ok", "icon-shield",
    h("p", null, h("strong", null, appointmentLabelNode(ballot.key, holder, false, true), " "), `${ballot.label} is filled by appointment rather than by the board, so there is nothing to vote on or write in here.`));
  /** Historical no-vote records remain readable; current reserved seats accept no applications. */
  function noVoteNote(ballot) {
    const a = S.application;
    const mine = a && a.status !== "withdrawn" && choicesOf(a).includes(ballot.key);
    return noticeBox("info", "icon-shield",
      h("p", null, h("strong", { text: "No public vote. " }), reservedKey201(ballot.key) ? `${ballot.label} is a reserved appointment. Historical applications remain readable by leadership; there is no current application, public ballot or write-in invitation here.` : `${ballot.label} is reviewed by the guild's leadership without a public ballot or write-in.`),
      h("p", null, reservedKey201(ballot.key) ? reservedNotice201 + (mine ? " Your historical application remains on record." : "") : mine ? "It is one of your choices: the leadership has your application." : S.settings && S.settings.applicationsOpen === false ? "Applications are closed right now." : ["Interested? ", h("a", { href: "#/apply", onclick: () => { S.pick = ballot.key; }, text: "Apply for it" }), ", as your first choice or a backup."]));
  }
  const progressTitle = (c) => (c.votable ? `${plural(c.votable, "applicant")} to vote on, ${c.voted} done` : c.applicants ? "Only you so far" : "Nobody yet");
  /** The role's numbers wherever the page shows them: its row in the role list, the plaque, the picker, the line. */
  function showRoleProgress(r) {
    // Closed roles keep their appointment tick or no-vote crown and dedicated picker label.
    if (appointedTo(r.key) || noVoteFor(r.key)) return;
    const n = document.querySelector('.role-item[aria-current="page"] .n');
    if (n) { n.textContent = r.votable ? `${r.voted}/${r.votable}` : "—"; n.title = progressTitle(r); n.classList.toggle("done", !!r.votable && r.voted >= r.votable); }
    const line = document.getElementById("voted-count");
    if (line) line.textContent = r.votable ? `You have voted on ${r.voted} of ${r.votable}.` : "You are the only applicant for this role so far.";
    const aside = document.getElementById("role-applicants");
    if (aside) aside.textContent = plural(r.applicants, "applicant");
    const opt = document.querySelector(`.role-pick option[value="${CSS.escape(r.key)}"]`);
    if (opt) opt.textContent = `${labelOf(M().ballots, r.key)} (${r.applicants})`;
  }
  async function drawBoard(box, closed, role) {
    const meta = M();
    const request = String(Number(box.dataset.boardRequest || 0) + 1);
    box.dataset.boardRequest = request;
    const live = () => box.isConnected && box.dataset.boardRequest === request;
    let data;
    try {
      data = await api("GET", `/api/board/${encodeURIComponent(role)}?` + qs({ offset: V.offset, class: V.cls, fit: V.fit, todo: V.todo }), undefined, { live });
    } catch (err) {
      if (!live()) return;
      const why = err.data && err.data.error;
      if ((why !== "no_vote" && why !== "appointed") || !S.settings) throw err;
      // Appointed, or taken off the public vote, since this page was opened: the whole page is drawn again, without the
      // board and the write-ins (what was written in for it could not be saved anyway). Only if it is still the page on
      // screen: the answer may come after the member has moved on (and started typing somewhere else).
      if (why === "no_vote") S.settings.noVote = [...new Set([...(S.settings.noVote || []), role])];
      else S.settings.appointed = Object.assign({}, S.settings.appointed, { [role]: err.data.appointed || "the leadership" });
      if (box.isConnected) render();
      return;
    }
    if (!live()) return;
    box.setAttribute("aria-busy", "false");
    // A prior counts refusal can disable the persistent mobile chooser. Only a
    // fresh admitted role response restores that navigation control; it grants
    // no authority to a previously refused write form.
    const rolePick = box.closest(".board-role-content")?.querySelector(".role-pick");
    if (rolePick) rolePick.disabled = false;
    box.dataset.boardFresh = role;
    boardRoleCounts.set(box, { applicants: data.total, votable: data.votable, voted: data.voted });
    // The Worker keeps the all-roles summary for half a minute; this role's own numbers are fresh, so they win.
    const sum = V.summary && V.summary.roles.find((x) => x.key === role);
    if (sum) Object.assign(sum, boardRoleCounts.get(box));
    showRoleProgress({ key: role, ...boardRoleCounts.get(box) });
    const clsSel = h("select", null, h("option", { value: "", text: "Any class" }), meta.classes.map((c) => h("option", { value: c.key, text: c.label, selected: V.cls === c.key })));
    const fitSel = h("select", null, [["", "Any raid evenings"], ["na", "NA raid evenings (3+ a week)"], ["eu", "EU raid evenings (3+ a week)"]].map(([k, t]) => h("option", { value: k, text: t, selected: V.fit === k })));
    const todo = h("input", { type: "checkbox", checked: V.todo });
    const refilter = () => { V.cls = clsSel.value; V.fit = fitSel.value; V.todo = todo.checked; V.offset = 0; drawBoard(box, closed, role); };
    clsSel.addEventListener("change", refilter);
    fitSel.addEventListener("change", refilter);
    todo.addEventListener("change", refilter);
    const filters = h("div", { class: "board-filters" },
      h("label", { class: "field" }, h("span", { class: "sr", text: "Class" }), clsSel),
      h("label", { class: "field" }, h("span", { class: "sr", text: "Raid evenings" }), fitSel),
      h("label", { class: "check" }, todo, h("span", { text: "Only ones I have not voted on" })));
    const cards = data.candidates.map((c) => candidateCard(c, data.role, closed || !data.votingOpen, box));
    const empty = !data.total
      ? h("p", { class: "muted", text: "No historical applications are listed for this role. Nominations do not open a reserved seat or appoint anyone; current Officer Corps and High Council applications are closed." })
      : !data.matching ? h("p", { class: "muted", text: V.todo ? "You have voted on everyone here who matches. Nice." : "Nobody matches these filters." }) : null;
    const pager = data.matching > data.pageSize
      ? h("div", { class: "pager" },
          h("span", { class: "muted small", text: `${data.offset + 1}–${data.offset + data.candidates.length} of ${data.matching}` }),
          h("div", { class: "btn-row" },
            h("button", { class: "btn small", type: "button", text: "Previous", disabled: data.offset === 0, onclick: () => { V.offset = Math.max(0, data.offset - data.pageSize); drawBoard(box, closed, role).then(() => scrollToSection(box)); } }),
            h("button", { class: "btn small", type: "button", text: "Next", disabled: data.offset + data.candidates.length >= data.matching, onclick: () => {
              // With "only ones I have not voted on", whoever was voted on here has left that list: the next page starts
              // right after the ones on this page still without a vote, or it would skip as many people.
              V.offset = V.todo ? data.offset + data.candidates.filter((x) => !x.myVote).length : data.offset + data.pageSize;
              drawBoard(box, closed, role).then(() => scrollToSection(box));
            } })))
      : null;
    clear(box);
    add(box, [
      data.total ? filters : null,
      data.total ? h("p", { class: "muted small", id: "voted-count", text: data.votable ? `You have voted on ${data.voted} of ${data.votable}.` : "You are the only applicant for this role so far." }) : null,
      empty,
      h("div", { class: "stack" }, cards),
      pager,
    ]);
  }
  function candidateCard(c, role, closed, box) {
    const meta = M();
    let mine = c.myVote || 0;
    const forBtn = h("button", { class: "vote for", type: "button", "aria-pressed": mine === 1 ? "true" : "false", disabled: c.self || closed, title: c.self ? "This is you" : "Vote for" }, h("img", { src: art("vote-for"), alt: "" }), h("span", { text: "For" }));
    const againstBtn = h("button", { class: "vote against", type: "button", "aria-pressed": mine === -1 ? "true" : "false", disabled: c.self || closed, title: c.self ? "This is you" : "Vote against" }, h("img", { src: art("vote-against"), alt: "" }), h("span", { text: "Against" }));
    const cast = async (want) => {
      const next = mine === want ? 0 : want;
      forBtn.disabled = againstBtn.disabled = true;
      try {
        await api("PUT", "/api/board/vote", { candidate: c.id, role: role.key, vote: next });
        const before = mine;
        mine = next;
        c.myVote = next; // read by the pager (see drawBoard)
        forBtn.setAttribute("aria-pressed", mine === 1 ? "true" : "false");
        againstBtn.setAttribute("aria-pressed", mine === -1 ? "true" : "false");
        if (!before && next) S.boardVotes = (S.boardVotes || 0) + 1;
        if (before && !next) S.boardVotes = Math.max(0, (S.boardVotes || 0) - 1);
        const counts = boardRoleCounts.get(box);
        if (counts && box.isConnected) {
          counts.voted += (!before && next ? 1 : 0) - (before && !next ? 1 : 0);
          const summary = V.summary && V.summary.roles.find((x) => x.key === role.key);
          if (summary) Object.assign(summary, counts);
          showRoleProgress({ key: role.key, ...counts });
        }
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        forBtn.disabled = againstBtn.disabled = false;
      }
    };
    forBtn.addEventListener("click", () => cast(1));
    againstBtn.addEventListener("click", () => cast(-1));
    const answers = h("div", { class: "parchment answers clamped" });
    for (const q of meta.questions.filter((x) => x.board)) {
      if (!c.answers[q.key]) continue;
      add(answers, [h("h4", { text: q.label }), h("div", { class: "text", text: c.answers[q.key] })]);
    }
    if(Array.isArray(c.talentBuilds) && c.talentBuilds.length) add(answers,[h("h4",{text:"Shared declared character builds"}),talentBuildLinks(c.talentBuilds),h("p",{class:"muted small",text:"Self-reported character names; shared separately by this applicant. Not roster verification."})]);
    const more = h("button", { class: "link small", type: "button", text: "Read the whole application" });
    more.addEventListener("click", () => { const open = answers.classList.toggle("clamped"); more.textContent = open ? "Read the whole application" : "Show less"; });
    return h("article", { class: "card cand" },
      h("div", { class: "cand-head" },
        discordAvatar(c, { class: "avatar", width: "44", height: "44", loading: "lazy" }),
        h("div", null,
          h("div", { class: "cand-name" }, c.label, " ", c.self ? h("span", { class: "badge", text: "you" }) : null, " ", h("span", { class: "badge " + (c.choice === 1 ? "green" : "muted"), text: c.choice === 1 ? "First choice" : "Backup choice" })),
          h("div", { class: "cand-meta" },
            c.class ? h("span", null, icon("class-" + c.class, "s"), " ", clsLabel(c.class)) : null,
            c.role ? h("span", null, roleIcon(c.role), labelOf(meta.roles, c.role)) : null,
            c.region ? h("span", { text: labelOf(meta.regions, c.region) }) : null,
            fitView(c.fit))),
        h("div", { class: "votes" }, forBtn, againstBtn)),
      applicationBadges199(c.applicationIntent),
      answers.firstChild ? answers : null,
      answers.firstChild ? h("div", null, more) : null);
  }
  /** Write-in nominations for one role: people who should be considered, applied or not. */
  function writeIns(ballot, closed) {
    const meta = M();
    const picks = new Map(); // `${ballot}|${slot}` -> pick, for every role: the whole set is saved at once
    for (const v of S.votes || []) picks.set(`${v.ballot}|${v.slot}`, { kind: v.kind, key: v.key, label: v.label, reason: v.reason || "", avatarUrl: null });
    const unsaved = h("span", { class: "dirty", hidden: true, text: "Unsaved changes" });
    const save = h("button", { class: "btn", type: "button", text: "Save nominations", disabled: closed });
    const box = h("div");
    const compact = () => {
      const kept = [];
      for (let slot = 1; slot <= ballot.seats; slot++) { const p = picks.get(`${ballot.key}|${slot}`); if (p) kept.push(p); picks.delete(`${ballot.key}|${slot}`); }
      kept.forEach((p, i) => picks.set(`${ballot.key}|${i + 1}`, p));
    };
    const draw = () => {
      clear(box);
      for (let slot = 1; slot <= ballot.seats; slot++) {
        const key = `${ballot.key}|${slot}`;
        const p = picks.get(key);
        const slotBox = h("div", { class: "slot" }, ballot.seats > 1 ? h("div", { class: "slot-n", text: slot === 1 ? "First choice" : `Choice ${slot}` }) : null);
        if (p) {
          const reason = h("input", { type: "text", maxlength: String(meta.limits.reason), placeholder: "Why them? (optional)", value: p.reason || "", disabled: closed, "aria-label": `Why ${p.label}` });
          reason.addEventListener("input", () => { p.reason = reason.value; setDirty("writeins", true, unsaved); });
          slotBox.appendChild(personRow(p, { note: reason, onRemove: closed ? null : () => { picks.delete(key); compact(); draw(); setDirty("writeins", true, unsaved); } }));
        } else if (!closed) {
          const firstFree = [...Array(ballot.seats).keys()].map((i) => i + 1).find((n) => !picks.has(`${ballot.key}|${n}`));
          if (slot !== firstFree) continue;
          slotBox.appendChild(picker({
            label: `Nominate for ${ballot.label}`,
            onPick: (np) => { picks.set(key, Object.assign({ reason: "" }, np)); draw(); setDirty("writeins", true, unsaved); },
            exclude: (it) => [...picks.entries()].some(([k, v]) => k.startsWith(ballot.key + "|") && v.kind === it.kind && v.key === it.key),
          }));
        } else if (slot === 1) slotBox.appendChild(h("p", { class: "muted small", text: "No write-in." }));
        box.appendChild(slotBox);
      }
    };
    save.addEventListener("click", async () => {
      const votes = [...picks.entries()].map(([k, p]) => { const [b, slot] = k.split("|"); return { ballot: b, slot: Number(slot), kind: p.kind, key: p.key, label: p.label, reason: p.reason || "" }; });
      save.disabled = true;
      try {
        const out = await api("PUT", "/api/votes", { votes });
        S.votes = out.votes;
        setDirty("writeins", false, unsaved);
        // The Worker ignores write-ins for a role appointed or taken off the vote since this page was opened.
        const mine = (list) => list.filter((v) => v.ballot === ballot.key).map((v) => `${v.slot}|${v.kind}|${v.key}`).sort().join();
        if (mine(votes) !== mine(out.votes)) {
          toast(`${ballot.label} is no longer voted on, so your write-ins for it were not saved.`, "bad");
          try { S.settings = (await api("GET", "/api/public")).settings; } catch { /* the page is drawn again either way */ }
          return render();
        }
        toast("Nominations saved. Only the guild's leadership sees them.", "good");
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        save.disabled = closed;
      }
    });
    draw();
    return h("section", { class: "frame" },
      h("div", { class: "plaque" }, h("h3", { text: `Write someone in for ${ballot.label}` }), h("span", { class: "aside", text: ballot.seats > 1 ? `up to ${ballot.seats}` : "one pick" })),
      h("p", { class: "muted small", text: "A nomination is a recommendation for leadership review, not an application or appointment. Reserved seats remain closed to applications. Pick a person from Asmongold's Discord, or type their name if they are not on Discord; an eligible member sees the nomination next time they sign in, never its author. You cannot nominate yourself." }),
      box,
      h("div", { class: "btn-row mt" }, save, unsaved));
  }

  // ---------------------------------------------------------------- roles: what each one involves (.44; member-site gate since .154)
  ROUTES.roles = function roles(main, parts) {
    const want = dec(parts[0] || "");
    const target = want === "class_lead" ? offices199().find(row => row.group === "class")?.key || want : want;
    const directory = applicationRoleDirectory201(next => {
      location.hash = `#/vote/${next.applicationTrack}/${encodeURIComponent(next.targetOffice || "new")}`;
    }, {targetOffice:target}, {showCharacters:true});
    add(main, [hierarchyPanel199(), rosettaPanel199(target === "rosetta-stone"), directory, writsPanel199("roles"),
      h("details", {class:"card technical-profile199"}, h("summary", {text:"Technical & Historical Profile Notes"}),
        h("p", {class:"muted small",text:"The ten-rank guide is the current website classification. Historical beta-five, signing profiles, applications and ballots remain separate records. Reserved seats do not become open because a name is absent. Each original scoped display record remains inside its role family; grouping does not combine appointments or permissions. Publication installs no addon, activates no Link service, and applies no game rank or permission."}))]);
    if (target) {
      const node = document.getElementById(target === "rosetta-stone" ? "role-rosetta-stone" : "role-"+target) || document.getElementById("role-family-"+target);
      if (node) setTimeout(() => { scrollToSection(node); node.setAttribute("tabindex","-1"); node.focus({preventScroll:true}); },0);
    }
  };

  // ---------------------------------------------------------------- admin (SITE_ADMINS only; the Worker checks every call)
  const A = {
    votes: { minAccountDays: 0, minServerDays: 0, includeDenied: false, includeLeft: false, onlyApplicants: false },
    apps: { position: "", backups: true, profession: "", status: "open", q: "", offset: 0, sort: "new" },
    names: { status: "active", q: "", contested: false, applicants: "", offset: 0 },
    audit: { family: "", actor: "", subject: "", window: "7d", before: 0 },
    heat: "",
  };
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== "" && v !== false && v !== 0 && v !== null && v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === true ? "1" : v)}`).join("&");
  // Capture at replacement time, not before the GET: a user who closed the
  // filters or moved focus while waiting must not have that choice reversed.
  function adminFilterState(body, initialOpen) {
    const panel = body.querySelector("details.admin-filter-panel"), active = document.activeElement;
    const field = panel && panel.open && panel.contains(active) ? active : null;
    return { open: panel ? panel.open : initialOpen, id: field && field.id,
      value: field && field.tagName === "INPUT" && ["text", "search"].includes(field.getAttribute("type")) ? field.value : null,
      start: field && Number.isInteger(field.selectionStart) ? field.selectionStart : null,
      end: field && Number.isInteger(field.selectionEnd) ? field.selectionEnd : null,
      direction: field && field.selectionDirection };
  }
  function restoreAdminFilterFocus(body, saved) {
    if (!saved.open || !saved.id) return;
    const field = body.querySelector("#" + saved.id);
    if (!field) return;
    if (saved.value !== null) field.value = saved.value;
    field.focus({ preventScroll: true });
    if (saved.start !== null && saved.end !== null && typeof field.setSelectionRange === "function") field.setSelectionRange(saved.start, saved.end, saved.direction || "none");
  }
  const userCell = (u) => h("span", { class: "nowrap" }, discordAvatar(u, { class: "av", width: "32", height: "32", loading: "lazy" }), discordIdentity(u) || u.label || u.id, u.denied ? h("span", { class: "badge red", text: " denied" }) : null, u.inServer === false ? h("span", { class: "badge muted", text: " left" }) : null);
  const ageText = (t) => (t ? `${plural(days(t), "day")} (${fmtShort(t)})` : "unknown");
  const splitBar = (yes, no) => {
    const t = yes + no || 1;
    const bar = h("div", { class: "split", title: `${yes} for, ${no} against` }, h("i", { class: "y" }), h("i", { class: "n" }));
    bar.children[0].style.width = `${(yes / t) * 100}%`;
    bar.children[1].style.width = `${(no / t) * 100}%`;
    return bar;
  };

  function adminTabs(sub) {
    const tabs = [["", "Overview"], ["applications", "Applications"], ["votes", "Votes"], ["names", "Reserved names"], ["friends", "Friends"], ["lookup", "Lookup"], ["settings", "Settings"], ["renames", "Renames"], ["news", "News"], ["audit", "Audit log"], ["ruleset-publication", "Ruleset publication"]]; // .114: Renames; .115: News; .125: Audit log
    if (anyCommunity()) tabs.push(["community", "Community"]); // .98: the staff surfaces of the community modules
    const choices = tabs.map(([k, t]) => ["#/admin" + (k ? "/" + k : ""), t, sub === k]);
    choices.push(["#/admin/ranks", "Rank planner", sub === "ranks"], ["#/admin/treasury", "Treasury", sub === "treasury"], ["#/admin/directory-visibility", "Directory preferences", sub === "directory-visibility"], ["#/admin/approved-guilds", "Signed guild list", sub === "approved-guilds"]);
    if (S.user?.id === "472099715253796864") choices.push(["/admin/qr/beta-window", "Named beta verification", false]);
    const select = h("select", { id: "admin-section-select", "aria-label": "Admin section" }, choices.map(([href, text, selected]) => h("option", { value: href, text, selected })));
    select.addEventListener("change", () => { location.href = select.value; });
    return h("div", { class: "admin-section-nav" }, h("label", { class: "admin-section-picker", for: "admin-section-select" }, "Admin section", select),
      h("nav", { class: "btn-row admin-section-links", "aria-label": "Admin sections" }, choices.map(([href, text, selected]) => h("a", { class: "btn small", href, text, "aria-current": selected ? "page" : false }))));
  }
  ROUTES.admin = async function admin(main, parts) {
    const sub = parts[0] || "";
    add(main, frame("Admin", h("span", { class: "badge warn", text: "Visible to site admins only" }), adminTabs(sub)));
    if (sub === "" || sub === "treasury") add(main, writsPanel199("admin", {checklist:true}));
    if (sub === "" || sub === "treasury") add(main, frame("Treasury programme · officer operating plan", null,
      h("p", { text: "The shared plan contains the 30-day pilot, 90-day stretch target, long-term roadmap and financial assumptions. It is a planning reference, not a live bank balance, payment instruction or authority to change existing controls." }),
      h("a", { class: "btn", href: "#/treasury-plan", text: "Open the treasury programme & financial model" })));
    const body = h("div");
    main.appendChild(body);
    body.appendChild(h("p", { class: "muted", text: "Loading…" }));
    const views = {
      "": adminOverview,
      applications: parts[1] ? (b) => adminApplication(b, parts[1]) : adminApplications,
      votes: parts[1] ? (b) => adminRole(b, dec(parts[1])) : adminVotes,
      names: adminNames,
      friends: adminFriends,
      lookup: (b) => adminLookup(b, dec(parts[1] || "")),
      settings: adminSettings,
      treasury: adminTreasury,
      "directory-visibility": adminDirectoryVisibility,
      'approved-guilds': adminApprovedGuilds,
      ranks: adminRankPlanner,
      renames: adminRenames, // .114
      news: (b) => adminNews(b), // .115
      audit: adminAudit, // .125: the safe projection of the dated staff log
      'ruleset-publication': adminRulesetPublication,
      community: (b) => adminCommunity(b, parts.slice(1)), // .98
    };
    await (own(views, sub) ? views[sub] : adminOverview)(body);
  };

  /** Fixed server-authored fragments only. The response has already passed its own live authority check. */
  async function authoredFragment(path, selector, controller) {
    if (!["/admin/ranks/fragment", "/army/report/fragment"].includes(path)) throw Error("Unknown guild workspace.");
    const response = await fetch(path, {method:"GET", credentials:"same-origin", cache:"no-store", redirect:"error", signal:controller.signal, headers:{Accept:"text/html"}});
    if (!response.ok) throw new ApiError(response.status, {error:response.status === 401 ? "signed_out" : "forbidden"});
    if (!/^text\/html\b/i.test(response.headers.get("Content-Type") || "")) throw Error("The workspace response is unavailable.");
    const text = await response.text();
    if (text.length > 150000) throw Error("The workspace response is too large.");
    const parsed = new DOMParser().parseFromString(text, "text/html");
    if (parsed.querySelector("script,style,link,iframe,object,embed,base,meta") || parsed.body.children.length !== 1) throw Error("The workspace markup is unavailable.");
    const node = parsed.body.firstElementChild;
    if (!node || !node.matches(selector)) throw Error("The workspace markup is unavailable.");
    for (const element of [node, ...node.querySelectorAll("*")]) for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || attribute.name === "srcdoc" || /^(?:href|src|action|formaction)$/i.test(attribute.name) && /^\s*(?:javascript|data|vbscript):/i.test(attribute.value)) throw Error("The workspace markup is unavailable.");
    }
    return document.importNode(node, true);
  }
  async function adminRankPlanner(body) {
    const owner = S.user, context = COM(), route = currentRoute(), controller = new AbortController();
    let instance = null, disposed = false;
    const live = () => !disposed && S.user === owner && owner && owner.isAdmin && COM() === context && currentRoute() === route && app.contains(body);
    const dispose = () => { if (disposed) return; disposed = true; controller.abort(); instance?.destroy(); if (disposeTool === dispose) disposeTool = null; };
    disposeTool = dispose;
    clear(body); add(body, h("p", {role:"status", text:"Opening the rank planner…"}));
    try {
      const node = await authoredFragment("/admin/ranks/fragment", ".olympus-rank-planner[data-olympus-rank-planner]", controller);
      if (!live()) return;
      if (node.getAttribute("data-draft-owner") !== owner.id) throw Error("The rank planner belongs to a different account. Reload to check your session.");
      if (!document.querySelector('link[data-olympus-tool="OlympusRankPlanner"]')) document.head.appendChild(h("link", {rel:"stylesheet", href:"/static/rank-planner/styles.css", "data-olympus-tool":"OlympusRankPlanner"}));
      await loadMemberScript("OlympusStaffRankCatalogue", "/static/rank-planner/catalogue.js"); if (!live()) return;
      await loadMemberScript("OlympusStaffRankPlanner", "/static/rank-planner/model.js"); if (!live()) return;
      await loadMemberScript("OlympusRankPlanner", "/static/rank-planner/app.js"); if (!live()) return;
      clear(body); add(body, node);
      instance = window.OlympusRankPlanner.mount(node, {owner:owner.id, isCurrent:live});
      if (!live()) instance?.destroy();
    } catch (error) { if (live()) { clear(body); add(body, noticeBox("warn", "icon-warning", h("p", {text:explain(error,"The rank planner could not be opened.")}))); } }
  }

  async function adminApprovedGuilds(body) {
    const owner = S.user, route = currentRoute(); let disposed = false, instance = null;
    const live = () => !disposed && S.signedIn && !S.denied && S.user === owner && owner?.isAdmin && currentRoute() === route && app.contains(body);
    const dispose = () => { if (disposed) return; disposed = true; instance?.destroy(); if (disposeTool === dispose) disposeTool = null; };
    disposeTool = dispose;
    const host = h("div"); clear(body); add(body, frame("Author-signed approved guild list", null, host));
    try { await loadMemberScript("OlympusApprovedGuildHelper", "/static/approved-guild-helper196.js"); if (!live()) return;
      instance = window.OlympusApprovedGuildHelper.mount(host, {isCurrent:live}); if (!live()) instance?.destroy();
    } catch (error) { if (live()) { clear(host); add(host, errorLine(explain(error,"The local signed-list helper could not be opened."))); } }
  }

  // ---------- overview ----------
  // .115 (item B): the staff's seat line, worded like the bot's (guild-seats.ts seatsStaffLine and its reasons), with exact times
  const SEAT_REASONS = {
    none: "no roster export has arrived yet",
    writing: "the latest export is still being written",
    stuck: "the latest export was left unfinished; the addon's next export writes it again",
    unchecked: "the latest export has not been checked yet; the next export from the addon, or /olympus-admin sync, checks it",
    distrusted: "the latest export is not trusted: run /olympus-admin sync if the guild really shrank",
    before_links: "the latest export is from before LINKS_NOT_BEFORE",
    stale: "the latest export is more than 48 hours old",
    error: "the seat state could not be read",
  };
  function seatsStaffText(s, waiting) {
    let line;
    if (!s) line = `Olympus I room: unknown (${SEAT_REASONS.error})`;
    else if (s.full && s.source === "roster") line = `Olympus I: full, ${s.members} of ${s.cap} on the latest roster export of ${fmtDateTime(s.rosterAt)}`;
    else if (s.full) line = `Olympus I: full (an invite was refused for space ${fmtDateTime(s.refusedAt)})`;
    else if (s.state === "open") line = `${plural(s.free, "seat")} free on Olympus I (${s.members} of ${s.cap}, latest roster export of ${fmtDateTime(s.rosterAt)})`;
    else line = `Olympus I room: unknown (${SEAT_REASONS[s.reason] || SEAT_REASONS.error})`;
    return `${line} · ${waiting} waiting in the invite queue.`;
  }
  async function adminOverview(body) {
    const owner = S.user, route = currentRoute();
    const overviewLive = () => S.user === owner && S.signedIn && !S.denied && S.user?.isAdmin && currentRoute() === route && app.contains(body);
    const o = await api("GET", "/api/admin/overview", undefined, { live: overviewLive });
    if (!overviewLive()) return;
    S.settings = o.settings;
    const c = o.counts || {};
    const byStatus = {};
    const byPos = {};
    for (const r of o.applications) {
      byStatus[r.status] = (byStatus[r.status] || 0) + r.n;
      (byPos[r.position] = byPos[r.position] || {})[r.status] = r.n;
    }
    const totalApps = Object.values(byStatus).reduce((x, y) => x + y, 0);
    const res = Object.fromEntries(o.reserved.map((r) => [r.status, r.n]));
    const tile = (ic, title, big, sub) => h("div", { class: "card" }, h("div", { class: "card-head" }, icon(ic), h("h3", { text: title })), h("div", { class: "big", text: String(big) }), sub ? h("p", { class: "muted small", text: sub }) : null);
    const statuses = ["submitted", "reviewing", "accepted", "declined", "withdrawn"];
    const posTable = h("table", { class: "data" },
      h("thead", null, h("tr", null, h("th", { text: "First choice" }), statuses.map((s) => h("th", { class: "num", text: statusText(s) })), h("th", { class: "num", text: "All" }))),
      h("tbody", null, M().positions.map((p) => {
        const row = byPos[p.key] || {};
        const all = statuses.reduce((n, s) => n + (row[s] || 0), 0);
        const pick = () => { Object.assign(A.apps, { position: p.key, profession: "", q: "", status: "", offset: 0 }); };
        const tr = h("tr", { class: "clickable" }, h("td", null, h("a", { class: "summary-role-open", href: "#/admin/applications", onclick: pick, "aria-label": `Open ${p.label} applications` }, posIcon(p.key, "s"), " ", p.label)), statuses.map((s) => h("td", { class: "num", text: String(row[s] || 0) })), h("td", { class: "num", text: String(all) }));
        tr.addEventListener("click", e => { if (e.target instanceof Element && e.target.closest("a")) return; pick(); location.hash = "#/admin/applications"; });
        return tr;
      })));
    const exportLink = (kind, text) => {
      const b = h("button", { class: "btn small", type: "button", text });
      b.addEventListener("click", () => downloadCsv(kind, b, text));
      return b;
    };
    const activity = h("div");
    const showActivity = h("button", { class: "btn small", type: "button", text: "Show recent activity" });
    showActivity.addEventListener("click", async () => {
      showActivity.disabled = true;
      try {
        const a = await api("GET", "/api/admin/audit");
        clear(activity).appendChild(h("div", { class: "table-wrap" }, h("table", { class: "data" },
          h("thead", null, h("tr", null, h("th", { text: "When" }), h("th", { text: "Who" }), h("th", { text: "What" }), h("th", { text: "Detail" }))),
          h("tbody", null, a.audit.map((r) => h("tr", null, h("td", { class: "nowrap", text: ago(r.ts) }), h("td", { text: r.actor }), h("td", { text: r.action.replace(/^site\./, "") }), h("td", { class: "small wrap", text: [r.subject, r.details].filter(Boolean).join(" ").slice(0, 160) })))))));
      } catch (err) {
        clear(activity).appendChild(errorLine(explain(err, "Recent activity could not be read.")));
      } finally {
        showActivity.disabled = false;
      }
    });
    // .45: who plans to take which profession (open applications, denied accounts left out); a row lists them.
    const profCount = Object.fromEntries((o.professions || []).map((r) => [r.profession, r.n]));
    const profMax = Math.max(1, ...Object.values(profCount));
    const profTable = h("table", { class: "data" },
      h("thead", null, h("tr", null, h("th", { text: "Profession" }), h("th", { class: "num", text: "Applicants" }), h("th", { text: "" }))),
      h("tbody", null, (M().professions || []).map((p) => {
        const n = profCount[p.key] || 0;
        const bar = h("div", { class: "bar" }, h("i"));
        bar.firstChild.style.width = `${Math.round((n / profMax) * 100)}%`;
        const pick = () => { Object.assign(A.apps, { position: "", profession: p.key, status: "open", q: "", offset: 0 }); };
        const tr = h("tr", { class: "clickable" },
          h("td", null, h("a", { class: "prof-tag", href: "#/admin/applications", onclick: pick }, h("img", { src: art(p.icon), alt: "", width: "20", height: "20" }), p.label), p.kind === "secondary" ? h("span", { class: "faint small", text: " (secondary)" }) : null),
          h("td", { class: "num", text: String(n) }),
          h("td", null, bar));
        tr.addEventListener("click", (e) => { if (e.target instanceof Element && e.target.closest("a")) return; pick(); location.hash = "#/admin/applications"; });
        return tr;
      })));
    const heatBox = h("div");
    const heatRole = h("select", { class: "narrow-select", "aria-label": "Which applications" }, h("option", { value: "", text: "Every open application" }), M().ballots.map((b) => h("option", { value: b.key, text: b.label, selected: A.heat === b.key })));
    heatRole.addEventListener("change", () => { A.heat = heatRole.value; drawHeat(heatBox); });
    clear(body);
    add(body, [
      h("p", { class: "muted small", id: "overview-seats", text: seatsStaffText(o.seats, (o.queue && o.queue.waiting) || 0) }), // .115 (item B)
      h("section", { class: "grid four" },
        tile("pos-member", "Signed up", c.users || 0, `${c.left || 0} left the server · ${c.denied || 0} denied`),
        tile("icon-apply", "Applications", totalApps, `${(byStatus.submitted || 0) + (byStatus.reviewing || 0)} open · ${byStatus.accepted || 0} accepted`),
        tile("icon-vote", "Voters", c.boardVoters || 0, `${c.boardVotes || 0} board votes · ${c.votes || 0} write-ins from ${plural(c.voters || 0, "person", "people")}`),
        tile("icon-names", "Reserved names", (res.claimed || 0) + (res.approved || 0) + (res.queued || 0) + (res.in_guild || 0), `${res.approved || 0} approved · ${res.queued || 0} queued · ${o.queue.reserved || 0} of ${o.queue.waiting || 0} waiting invites`)),
      frame("Applications by first choice", null, h("p", { class: "muted small", text: "Open a role to see that list. Denied accounts are counted here under their application status." }), h("div", { class: "table-wrap" }, posTable)),
      frame("Professions", null, h("p", { class: "muted small", text: "What the open applications plan to take on their main (optional on the form, so not everyone answered). Denied accounts are left out. Click a row to list those applications." }), h("div", { class: "table-wrap" }, profTable)),
      frame("When the applicants play", null,
        h("p", { class: "muted small", text: `Open applications, hour by hour, in your time zone (${zoneName(myZone)}). Brighter = more people online.` }),
        h("div", { class: "filters" }, h("label", { class: "field" }, h("span", { class: "sr", text: "Which applications" }), heatRole)),
        heatBox),
      frame("Downloads", null,
        h("p", { class: "muted small", text: "Spreadsheet files (CSV) of the site's six core record families: applications, board votes, write-ins, friends, reserved names and accounts. They contain people's answers and Discord ids: keep them private. The community modules, a member's curated copy (Account data controls) and the private request cases are not in these files; they have their own pages and routes." }), // .105: what the six files are, not "everything"
        h("div", { class: "btn-row" }, exportLink("applications", "Applications"), exportLink("board", "Board votes"), exportLink("votes", "Write-ins"), exportLink("friends", "Friends"), exportLink("reserved", "Reserved names"), exportLink("users", "Accounts"))),
      frame("Recent activity", null, showActivity, activity),
    ]);
    await drawHeat(heatBox);
  }
  async function drawHeat(box) {
    const role = A.heat, user = S.user, request = String(Number(box.dataset.heatRequest || 0) + 1);
    box.dataset.heatRequest = request;
    const live = () => box.isConnected && box.dataset.heatRequest === request && A.heat === role && S.user === user && S.signedIn && !S.denied;
    clear(box).appendChild(h("p", { class: "muted small", role: "status", text: "Reading availability…" }));
    let d;
    try { d = await api("GET", "/api/admin/availability?" + qs({ role }), undefined, { live }); }
    catch (error) {
      if (!live()) return;
      clear(box).appendChild(errorLine(explain(error, "Availability could not be read.")));
      // This is a user-invoked read only. It asks the server to admit the account
      // again; it never retries a save, reuses a private answer or loops on failure.
      if (error.status !== 401 && error.status !== 403) box.appendChild(h("button", { class: "btn small", type: "button", text: "Try reading availability again", onclick: () => { if (live()) drawHeat(box); } }));
      return;
    }
    if (!live()) return;
    const off = zoneOffset(myZone);
    const local = (dd, hh) => d.hours[utcHour(dd * 24 + hh, off)];
    const max = Math.max(1, ...d.hours);
    const hh2 = (x) => String(x).padStart(2, "0");
    const table = h("table", { class: "heat" },
      h("thead", null, h("tr", null, h("th", { text: "" }), Array.from({ length: 24 }, (_, hh) => h("th", { text: hh2(hh) })))),
      h("tbody", null, DAYS.map((day, dd) => h("tr", null,
        h("th", { scope: "row", title: DAY_NAMES[dd], text: day }),
        Array.from({ length: 24 }, (_, hh) => {
          const n = local(dd, hh);
          const td = h("td", { title: `${DAY_NAMES[dd]} ${hh2(hh)}:00–${hh2(hh + 1)}:00: ${n} of ${d.applications}`, text: n ? String(n) : "" });
          const f = n / max;
          td.style.background = n ? `rgba(255, ${Math.round(150 + 59 * f)}, 0, ${0.15 + 0.85 * f})` : "rgba(0, 0, 0, 0.45)";
          if (f < 0.45) td.style.color = "#e8dcc0";
          return td;
        })))));
    clear(box);
    add(box, [
      h("p", { class: "small" }, `${plural(d.applications, "application")}. Can make at least three raid evenings a week: `, h("b", { text: `NA ${d.fits.na}` }), " · ", h("b", { text: `EU ${d.fits.eu}` }), "."),
      h("div", { class: "avail-wrap" }, table),
    ]);
  }

  // ---------- CSV downloads ----------
  // The Worker hands the rows over a page at a time; the file is put together here. A cell starting with = + - @ (or a
  // tab or CR) gets a leading quote, so a spreadsheet shows it as text instead of running it as a formula.
  function csvCell(v) {
    let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  async function downloadCsv(kind, button, label) {
    button.disabled = true;
    const lines = [];
    let offset = 0;
    let columns = null;
    try {
      for (;;) {
        const page = await api("GET", `/api/admin/export/${kind}?offset=${offset}`);
        if (!columns) { columns = page.columns; lines.push(columns.map(csvCell).join(",")); }
        for (const r of page.rows) lines.push(r.map(csvCell).join(","));
        button.textContent = `${label}: ${lines.length - 1} rows…`;
        if (page.next === null || page.next === undefined) break;
        offset = page.next;
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); // a blob: link made here, so it bypasses h()'s link filter on purpose
      a.download = `olympus-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(`${label}: ${lines.length - 1} rows downloaded.`, "good");
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  // ---------- settings ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  const toLocalInput = (t) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const fromLocalInput = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
  async function adminSettings(body) {
    const owner = S.user, route = currentRoute();
    const settingsLive = () => S.user === owner && S.signedIn && !S.denied && S.user?.isAdmin && currentRoute() === route && app.contains(body);
    const o = await api("GET", "/api/admin/overview", undefined, { live: settingsLive });
    if (!settingsLive()) return;
    const s = o.settings;
    const namesAt = h("input", { type: "datetime-local", value: toLocalInput(s.namesOpenAt) });
    const namesPt = h("span", { class: "hint" });
    const launchAt = h("input", { type: "datetime-local", value: toLocalInput(s.launchAt) });
    const launchPt = h("span", { class: "hint" });
    const sync = () => {
      const a = fromLocalInput(namesAt.value), b = fromLocalInput(launchAt.value);
      namesPt.textContent = a ? `That is ${fmtPacific(a)} (your time: ${fmtDateTime(a)}).` : "";
      launchPt.textContent = b ? `That is ${fmtPacific(b)} (your time: ${fmtDateTime(b)}).` : "";
    };
    namesAt.addEventListener("input", sync);
    launchAt.addEventListener("input", sync);
    sync();
    const box = (checked, text, hint) => { const i = h("input", { type: "checkbox", checked }); return [i, h("label", { class: "check field" }, i, h("span", null, text, hint ? h("span", { class: "hint", text: hint }) : null))]; };
    const [confirmed, confirmedRow] = box(s.namesTimeConfirmed, "Blizzard has announced the hour", "Off: the site shows only the date and says the hour is not known. On: it shows the exact time.");
    const [namesOpen, namesOpenRow] = box(s.namesOpen, "People may enter reserved names (from the time above)");
    const [autoQueue, autoQueueRow] = box(s.autoQueue, "From launch, put approved reserved names at the top of the invite queue by themselves", "Checked every half hour. Off: use Queue on the Reserved names tab when you are ready.");
    const [appsOpen, appsOpenRow] = box(s.applicationsOpen, "Applications are open");
    const [votingOpen, votingOpenRow] = box(s.votingOpen, "Voting is open (the board and write-in nominations)");
    // .115 (Viktor's item A, 2 Oct 2026): the members' News page is off until an administrator switches it on here (site-news.ts)
    const [newsBox, newsRow] = box(!!s.newsOn, "News page: guild members and site administrators can read Community → News", "Off: the page is hidden, no notice can be posted or changed and the figures stop; notices already posted keep their time and can still be deleted under Admin → News.");
    newsBox.id = "news-on";
    const [loginAnimation, loginAnimationRow] = box(s.loginAnimation === true, "Use the optional animated login background", "Off by default: keeps the previously approved still image. On: uses the existing client-model render, not publisher video; reduced-motion and data-saving fallbacks still apply.");
    loginAnimation.id = "login-animation";
    const [royalWrits, royalWritsRow] = box(s.royalWritsOn === true, "Show the Schedule of Royal Writs, Indulgences & Guild Services", "Off by default: hides the schedule across the site and pauses new Patron-track applications. Existing applications, receipts and constitutional reference text are preserved. Turning this on does not enable payments, Discord role dispatch, Olympus Link or any other provider action.");
    royalWrits.id = "royal-writs-on";
    const notice = h("input", { type: "text", maxlength: "300", value: s.notice || "", placeholder: "Shown at the top of every page (optional)" });
    const was = s.appointed || {};
    const appointed = (M().appointments || M().ballots).map((b) => [b, h("input", { type: "text", maxlength: "40", value: Object.prototype.hasOwnProperty.call(was, b.key) ? was[b.key] : "", placeholder: "Open", autocomplete: "off", "aria-label": `${b.label}: appointed to` })]);
    const associationStatus = new Map(appointed.map(([office]) => [office.key, h("span", { class: "hint", role: "status", "data-appointment-status": office.key })]));
    for (const [b, input] of appointed) {
      const status = associationStatus.get(b.key);
      if (!status) continue;
      const edit = () => { status.textContent = appointmentPointer(input.value.trim()) ? "Use account search to check current association eligibility. Save checks the selected account again." : ""; };
      input.addEventListener("input", edit); edit();
    }
    const appointedRow = ([b, input]) =>
      h("div", { class: "field appointed-row", "data-appointment-field203": b.key }, h("label", null, h("span", { class: "lab small" }, posIcon(b.key, "s"), h("span", { text: b.label }), officeBadge199(b)), input),
        picker({ label: `${b.label}: associate Discord account`, placeholder: "Search Discord by name or user ID…", allowTyped: false, allowSelf: true, appointmentOnly: true,
          onPick: person => { input.value = `<@${person.key}>`; namesOk.checked = false; characterPublication.checked = false; associationStatus.get(b.key).textContent = `${person.label}: eligible for association at the last check. Save checks again; review both consent boxes.`; } }),
        associationStatus.get(b.key));
    const appointedGrid = group => h("div", { class: "appointed-grid" }, appointed.filter(([b]) => b.group === group).map(appointedRow));
    const appointmentDirectory203 = roleDirectory203();
    const appointmentControls203 = appointmentDirectory203 ? appointmentDirectory203.families.map(family => {
      const rows = appointed.filter(([office]) => family.sourceKeys.includes(office.key));
      return rows.length ? h("details", {class:"appointment-family203", "data-appointment-family203":family.key},
        h("summary", null,h("span",{text:family.label}),h("span",{class:"badge muted",text:`${rows.length} separate display ${rows.length === 1 ? "record" : "records"}`})),
        h("p",{class:"small muted",text:"Each field below retains its original scope. Changing one display record does not change another alias, region, class or rank record, and never grants shared permissions."}),
        h("div",{class:"appointed-grid"},rows.map(appointedRow))) : null;
    }) : [h("p",{class:"muted small",text:"Family grouping is unavailable. The original scoped controls below remain unchanged."}),
      h("div",{class:"group-label",text:"Leadership"}),appointedGrid("leadership"),h("div",{class:"group-label",text:"Class leads"}),appointedGrid("class"),
      h("details",{class:"mt"},h("summary",{text:"Ten native rank display assignments"}),appointedGrid("native")),
      h("details",{class:"mt"},h("summary",{text:"All 96 extended offices and historical aliases"}),appointedGrid("office"))];
    // .115 (Viktor's item C, 2 Oct 2026): a name is typed only after that person agreed; the Worker refuses a new or changed
    // name without this tick (400 confirm_names, shown in words). Each save asks again: the box is cleared after it.
    const [namesOk, namesOkRow] = box(false, "Each person I name has agreed to be named on the signed-in guild site and in account settings. A valid existing account session can still view settings after leaving the server or being denied.");
    namesOk.id = "appointed-names-ok";
    const [characterPublication, characterPublicationRow] = box(false, "Each associated officeholder agreed to show their Discord name, username and current verified characters to guild members and site administrators", "This includes verified characters not listed in the directory. An account without a current website profile publishes its Discord name only. A current Broadcaster association permits Stream Shield; a current Lead Correspondent association permits Town Crier editing. These actions require their separate account and privacy checks. Other display associations grant no action authority; none changes native ranks, Discord roles, bank access or signing authority.");
    characterPublication.id = "appointed-characters-ok";
    const quietWas = new Set(s.noVote || []);
    const quiet = M().ballots.map((b) => [b, h("input", { type: "checkbox", checked: quietWas.has(b.key), "aria-label": `${b.label}: no public vote` })]);
    const quietGrid = (group) => h("div", { class: "appointed-grid" }, quiet.filter(([b]) => b.group === group).map(([b, input]) =>
      h("label", { class: "check field quiet-row" }, input, h("span", { class: "small" }, posIcon(b.key, "s"), " ", b.label))));
    const save = h("button", { class: "btn", type: "button", text: "Save settings" });
    save.addEventListener("click", async () => {
      if (!settingsLive()) return;
      const a = fromLocalInput(namesAt.value), b = fromLocalInput(launchAt.value);
      if (!a || !b) return toast("Both times are needed.", "bad");
      save.disabled = true;
      try {
        const out = await api("PUT", "/api/admin/settings", { namesOpenAt: a, launchAt: b, namesTimeConfirmed: confirmed.checked, namesOpen: namesOpen.checked, autoQueue: autoQueue.checked, applicationsOpen: appsOpen.checked, votingOpen: votingOpen.checked, newsOn: newsBox.checked, loginAnimation: loginAnimation.checked === true, royalWritsOn: royalWrits.checked === true, notice: notice.value,
          appointed: Object.fromEntries(appointed.map(([bb, input]) => [bb.key, input.value.trim()]).filter(([, who]) => who)),
          noVote: quiet.filter(([, input]) => input.checked).map(([bb]) => bb.key), namesConfirmed: namesOk.checked, appointedCharactersConfirmed: characterPublication.checked }, { live: settingsLive });
        if (!settingsLive()) return;
        S.settings = out.settings;
        namesOk.checked = false;
        characterPublication.checked = false;
        toast("Settings saved.", "good");
      } catch (err) {
        if (!settingsLive()) return;
        const role = err.data && err.data.error === "appointed_account_unavailable" && err.data.role;
        if (associationStatus.has(role)) {
          associationStatus.get(role).textContent = err.message;
          characterPublication.checked = false;
          appointed.find(([bb]) => bb.key === role)[1].focus();
        }
        toast(err.message, "bad");
      } finally { save.disabled = false; }
    });
    clear(body);
    add(body, frame("Settings", null,
      h("label", {class:"field"}, h("span", {class:"lab", text:"Public server ruleset"}),
        h("input", {id:"public-ruleset", type:"text", value:M().ruleset?.phase === "public_direction" ? "PVE - Alliance" : rulesetIdentity(), readonly:true})),
      h("p", {class:"muted small"}, "The announced default is PvE · Alliance. Public copy does not activate native roles or change launch guards. ", h("a", {href:"#/admin/ruleset-publication", text:"Review ruleset publication"})),
      h("div", { class: "grid two" },
        h("label", { class: "field" }, h("span", { class: "lab", text: "Name reservation opens" }), namesAt, namesPt),
        h("label", { class: "field" }, h("span", { class: "lab", text: "Launch" }), launchAt, launchPt)),
      h("p", { class: "muted small", text: "Times are entered in your own time zone; the line under each shows the Pacific time Blizzard announces in." }),
      confirmedRow, namesOpenRow, autoQueueRow, appsOpenRow, votingOpenRow, newsRow, loginAnimationRow, royalWritsRow,
      h("label", { class: "field" }, h("span", { class: "lab", text: "Notice" }), notice),
      h("div", { class: "rule" }),
      h("h3", { text: "Appointed roles" }),
      h("p", { class: "muted small", text: "A role with a name here has an appointment display record. Its historical voting board and write-ins close while the appointment is recorded; prior votes and nominations are preserved. Clearing the holder can restore historical board visibility, but Leader, High Council and Officer Corps applications remain closed. An empty field is not an application vacancy." }),
      h("p", { class: "muted small", text: "Every office and rank below has a Discord name or exact user ID selector. Search and Save check current server membership and account standing. A website sign-in, character link or roster confirmation is not required to associate a current Discord member. These website records do not change Discord roles, native ranks, bank access or signing authority. Existing ballot roles remain closed while appointed; extended offices are separate records." }),
      appointmentControls203,
      namesOkRow,
      characterPublicationRow,
      h("p", { class: "muted small", text: "To remove a name on request, type Name withheld to keep an anonymous appointment marker, or clear the display record. Reserved applications remain closed in either case." }),
      h("div", { class: "rule" }),
      h("h3", { text: "Roles without a public vote" }),
      h("p", { class: "muted small", text: "These controls govern visibility and voting on historical records; they do not reopen reserved applications. Leader, High Council and Officer Corps seats remain appointment-only, with no first-choice or backup applications. Existing applications, votes, nominations and their original consent restrictions are preserved. A ticked role has no public board or write-ins; any retained application stays with leadership. Changing this setting never appoints a holder or supplies new publication consent." }),
      h("div", { class: "group-label", text: "Leadership" }), quietGrid("leadership"),
      h("div", { class: "group-label", text: "Class leads" }), quietGrid("class"),
      h("div", { class: "btn-row mt" }, save)));
    const intents = o.discordIntentOperations;
    if (intents && intents.applicationId === "1550176895671341076") add(body, frame("Discord member access & annual renewal", null,
      kv([["Application", intents.applicationId], ["Support request", "#" + intents.supportTicket], ["Required intent", intents.requiredIntent], ["Renewal review before", intents.reviewBefore], ["Responsible owner", "Application owner / guild administrators"]]),
      h("p", { text: intents.permittedUse }),
      h("p", { class: "muted small", text: "Server Members was observed enabled after a portal reload on 23 October 2026. This operational record is not a live entitlement check. Presence, message content, a Gateway connection and a persistent member mirror are not required. Reapply annually and review before 23 October 2027." }),
      h("a", { class: "btn small", href: "https://discord.com/developers/applications/1550176895671341076/bot", target: "_blank", rel: "noopener noreferrer", text: "Review application intent settings" })));
    const bnetPanel = await bnetSwitchFrame(settingsLive);
    if (!settingsLive()) return;
    const leadershipPanel = await leadershipFrame(settingsLive);
    if (!settingsLive()) return;
    add(body, [bnetPanel, leadershipPanel, await betaResetFrame(body)]); // .114
  }
  const kv = (pairs) => h("dl", { class: "kv" }, pairs.map(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]));
  /** .114: the Battle.net sign-in switch (the Worker's bnet-switch.ts). It cannot be switched on before the policy describes the login. */
  async function bnetSwitchFrame(settingsCurrent) {
    const owner = S.user, route = currentRoute();
    const current = () => settingsCurrent() && S.user === owner && S.signedIn && !S.denied && S.user?.isAdmin && currentRoute() === route;
    let st;
    try { st = await api("GET", "/api/admin/bnet-switch", undefined, { live: current }); } catch (e) { return current() ? frame("Battle.net sign-in", null, h("p", { class: "err small", text: explain(e, "The switch could not be read.") })) : null; }
    if (!current()) return null;
    if (!st.effective) {
      if (st.enableRequested !== true) return null;
      const status = h("p", { class: "small", role: "status", text: "A future enable request is recorded. Collection stays OFF in this release." });
      const withdraw = h("button", { class: "btn small", type: "button", text: "Withdraw recorded request" });
      const panel = frame("Battle.net request", h("span", { class: "badge muted", text: "collection off" }), status, withdraw);
      const live = () => current() && app.contains(panel);
      withdraw.addEventListener("click", async () => {
        if (!live() || withdraw.disabled) return;
        withdraw.disabled = true;
        try { const out = await api("PUT", "/api/admin/bnet-switch", { on: false }, { live }); if (out?.ok !== true || out.state?.enableRequested !== false || out.state?.effective !== false) throw new ApiError(200, { error: "unreadable_answer" }); if (live()) status.textContent = "The recorded request was withdrawn. Collection remains OFF."; }
        catch (error) { if (live()) { status.textContent = explain(error, "Withdrawal is unconfirmed; read the current status before acting again."); withdraw.disabled = false; } }
      });
      return panel;
    } // No dormant enable control is exposed.
    const reason = "Enable records a request only. Collection stays OFF until a reviewed same-version ON policy, suitable Forever API and recovery plan are released.";
    const locked = false; // a switch that is somehow on can always be turned off
    const box = h("input", { type: "checkbox", checked: st.enableRequested, disabled: locked, id: "bnet-switch" });
    const save = h("button", { class: "btn small", type: "button", text: "Save", disabled: locked });
    save.addEventListener("click", async () => {
      if (!current()) return;
      const on = box.checked;
      if (on && !(await confirmBox("Request future Battle.net enablement?", "This records an enable request only. It cannot turn collection on in the current OFF release.", "Record request", { typeToConfirm: "ENABLE" }))) { box.checked = st.enableRequested; return; }
      save.disabled = true;
      try {
        await api("PUT", "/api/admin/bnet-switch", on ? { on, confirm: "ENABLE" } : { on }, { live: current });
        if (!current()) return;
        st.enableRequested = on;
        toast(on ? "Enable request recorded; collection remains off." : "Battle.net sign-in paused.", "good");
      } catch (err) { if (current()) { box.checked = st.enableRequested; toast(explain(err), "bad"); } } finally { save.disabled = locked; }
    });
    return frame("Battle.net sign-in", h("span", { class: "badge " + (st.effective ? "green" : "muted"), text: st.effective ? "on" : "off" }),
      h("p", { class: "muted small", text: "The optional connector stays in its released OFF profile. Pausing is immediate; a reviewed policy release is needed to change the static OFF/ON profile. Legacy-data cleanup continues while off. Local unlink is separate from removing a connection in Discord." }),
      kv([["Client credentials", st.configured ? "present" : "missing"], ["Privacy policy describes it", st.policyReady ? "yes" : "no"], ["Last changed", st.changedAt ? fmtDateTime(st.changedAt) : "never"]]),
      h("label", { class: "check field", for: "bnet-switch" }, box, h("span", null, "Request future enablement (uncheck to pause)", reason ? h("span", { class: "hint", text: reason }) : null)),
      h("div", { class: "btn-row" }, save));
  }
  /** .114: the Olympus I-X leadership directory (the Worker's site-leadership.ts). Names only; a listing grants nothing. */
  async function leadershipFrame(settingsCurrent = () => true) {
    const owner = S.user, route = currentRoute();
    const current = () => settingsCurrent() && S.user === owner && S.signedIn && !S.denied && !!S.user?.isAdmin && currentRoute() === route;
    let data;
    try { data = await api("GET", "/api/admin/leadership", undefined, { live: current }); }
    catch (e) { return current() ? frame("Olympus I–X leadership", null, h("p", { class: "err small", text: explain(e, "The directory could not be read.") })) : null; }
    if (!current()) return null;
    if (!data || !Array.isArray(data.guilds) || data.guilds.length !== 10 || data.guilds.some(g => !g || typeof g.name !== "string" || typeof g.gm !== "string" || !Array.isArray(g.officers) || g.officers.length > 12 || g.officers.some(name => typeof name !== "string"))) return frame("Olympus I–X leadership", null, h("p", { class: "err small", text: "The directory answer could not be read. No names were changed." }));
    const rows = data.guilds.map((g, i) => ({
      g,
      gm: h("input", { type: "text", maxlength: "40", value: g.gm, placeholder: "Not listed", autocomplete: "off", id: `lead-gm-${i}`, "aria-label": `${g.name}: Guild Master` }),
      officers: h("textarea", { rows: "3", maxlength: "600", value: g.officers.join("\n"), id: `lead-off-${i}`, "aria-label": `${g.name}: officers, one per line` }),
    }));
    // .197: exact account pointers use separate publication consent and a session-bound row revision; typed labels remain unverified.
    const namesOk = h("input", { type: "checkbox", id: "lead-names-ok" });
    const identitiesOk = h("input", {type:"checkbox",id:"lead-identities-ok"});
    const save = h("button", { class: "btn", type: "button", text: "Save the directory" });
    let panel = null, busy = false;
    const live = () => current() && !!panel && app.contains(panel);
    const sync = () => { if (panel) for (const input of panel.querySelectorAll("input, textarea, button")) input.disabled = busy; };
    const invalidate = () => { namesOk.checked = identitiesOk.checked = false; };
    const selectedName = person => {
      if (!person || person.kind !== "discord" || typeof person.key !== "string" || !/^[1-9][0-9]{16,19}$/.test(person.key)) return null;
      return `<@${person.key}>`;
    };
    const chooseName = (row, officer) => picker({ label: `${row.g.name}: ${officer ? "associate officer account" : "associate Guild Master account"}`, placeholder: "Find a Discord display name…", allowTyped: false, allowSelf: true, appointmentOnly: true, isCurrent: () => live() && !busy,
      onPick: person => {
        if (!live() || busy) return;
        const name = selectedName(person);
        if (!name) { toast("That result has no eligible account reference. Use a current qualified Discord result, or enter an agreed legacy label.", "bad"); return; }
        if (officer) {
          const names = row.officers.value.split("\n").map(value => value.trim()).filter(Boolean);
          if (names.includes(name)) { invalidate(); return; }
          if (names.length >= 12) { toast("This guild already lists twelve officers. Remove a name before adding another.", "bad"); return; }
          row.officers.value = [...names, name].join("\n");
        } else row.gm.value = name;
        invalidate();
      } });
    for (const row of rows) { row.gm.addEventListener("input", invalidate); row.officers.addEventListener("input", invalidate); }
    save.addEventListener("click", async () => {
      if (!live() || busy) return;
      const sent = { guilds: rows.map(r => ({ gm: r.gm.value.trim(), officers: r.officers.value.split("\n").map(x => x.trim()).filter(Boolean) })), namesConfirmed: namesOk.checked, expectedRevision:data.revision,leadershipIdentitiesConfirmed:identitiesOk.checked };
      busy = true; sync();
      try {
        const out = await api("PUT", "/api/admin/leadership", sent, { live });
        if (!live()) return;
        if (!out || out.ok !== true || !Array.isArray(out.guilds) || out.guilds.length !== 10) throw new ApiError(200, { error: "unreadable_answer" });
        data = out; namesOk.checked = identitiesOk.checked = false;
        toast("Directory saved. Account associations are rechecked when members read them.", "good");
      } catch (err) { if (live()) toast(explain(err), "bad"); }
      finally { busy = false; if (live()) sync(); }
    });
    panel = frame("Olympus I–X leadership", null,
      h("p", { class: "muted small", text: "The Guild Master and officers of each Olympus guild, as guild members and site administrators see them under Community → Leadership. Separate from the Olympus I staff channels and from the appointed roles above. A listing is a record only: it gives no powers in the bot, on this site or in Discord (the Council roles in Discord are given by hand). Up to twelve officers per guild, one per line." }),
      h("p", { class: "muted small", text: "Discord search associates an eligible account with this exact guild and seat. Saving and later display recheck its current account and standing. A typed name remains a staff-entered, unverified label. Neither form proves a game character or grants any permission." }),
      h("div", { class: "grid two" }, rows.map(r => h("div", { class: "card" },
        h("h3", { text: r.g.name }),
        h("label", { class: "field" }, h("span", { class: "lab", text: "Guild Master" }), r.gm), chooseName(r, false),
        h("label", { class: "field" }, h("span", { class: "lab", text: "Officers" }), r.officers), chooseName(r, true)))),
      h("label", { class: "check field", for: "lead-names-ok" }, namesOk, h("span", { text: "Each person listed here agreed to be listed. Guild members and site administrators can read the directory." })),
      h("label",{class:"check field",for:"lead-identities-ok"},identitiesOk,h("span",{text:"Each associated account holder agreed to publication of their current Discord label in this exact guild and seat. This listing gives no authority."})),
      h("p", { class: "muted small", text: "To remove a name on request, clear it or type Name withheld in its place." }),
      h("div", { class: "btn-row mt" }, save));
    return panel;
  }
  /** Fixed owner-approved member/rank reset. Only a fresh private preview can arm its immutable policy. */
  async function betaResetFrame(settingsBody) {
    let st;
    try { st = await api("GET", "/api/admin/beta-role-reset"); } catch (e) { return frame("Beta member and rank reset", null, h("p", { class: "err small", text: explain(e, "The reset status could not be read.") })); }
    const roleIds = ["1552077551839617104","1558657538960916490","1557496182966587453","1557495772453281853","1557496796949909575","1557496812196208640","1557498239656136764","1557498252994285568","1557498673926242385","1557498969310101576","1557499139099590747","1557499286965719050"];
    const exactRoles = ids => Array.isArray(ids) && ids.length === roleIds.length && ids.every((id,i) => id === roleIds[i]);
    const states = { before_cutoff: "Before the cutoff", inactive: "Removals inactive", discovering: "Discovering assignments", draining: "Removing known assignments", held: "Needs review", awaiting_new_source: "Awaiting new source", retired_awaiting_drain: "Policy retired; unresolved work retained" };
    if (st && st.inventoryKnown === false && st.phase === "held" && st.cutoff === 1792688400 && st.epoch === "olympus-beta-2026-10-22" && exactRoles(st.roleIds) &&
      st.canArm === false && st.canRetire === false && st.removalsActive === false && st.finalCompletion === false && st.roleReuseReady === false && st.discovery && st.removals &&
      [st.discovery.currentPassScanned,st.discovery.completedPasses,st.removals.pending,st.removals.held,st.removals.unknown,st.removals.settledOperations].every(v => v === null) &&
      [st.removals.unresolvedGrantCustody,st.removals.unresolvedOtherRoleCustody].every(n => Number.isSafeInteger(n) && n >= 0)) {
      const refreshHeld = h("button", { class: "btn small", type: "button", text: "Refresh reset status" });
      const heldPanel = frame("Beta member and rank reset", h("span", { class: "badge", text: "Needs review" }),
        h("p", { text: "Reset progress is unavailable: configuration or policy reads may be unavailable, or the retained policy may be malformed or not yet applicable. Existing work is held; unavailable counts do not mean there is no unresolved work." }),
        h("p", { text: "Cutoff: 22 October 2026, 17:00 UTC (noon CDT). This is the start of the reset, not an instant finish." }),
        h("p", { class: "muted small", text: "After the cutoff, old beta verification cannot grant these roles, even while removals are inactive. A reviewed full-release source and fresh verification are required before reusing them." }),
        h("p", { text: "Scope: both Guild Member roles and all ten Olympus Rank roles, including empty roles. Manual leadership, Council, Developer, server moderators, website appointments and the leadership directory stay." }),
        h("p", { class: "muted small", text: "Known progress is not the full server total. A clean pass means awaiting the new source, not permanent completion." }),
        kv([["Unresolved earlier grants", String(st.removals.unresolvedGrantCustody)], ["Unresolved role removal custody", String(st.removals.unresolvedOtherRoleCustody)]]),
        h("p", { class: "muted small", text: "Arming and retirement are unavailable. Refresh status or have an owner review the retained policy. Role reuse remains held." }),
        h("div", { class: "btn-row" }, h("button", { class: "btn", type: "button", text: "Arm member and rank reset", disabled: true }), h("button", { class: "btn small", type: "button", text: "Retire reset policy", disabled: true }), refreshHeld));
      refreshHeld.addEventListener("click", () => { if (document.body.contains(heldPanel) && settingsBody.contains(heldPanel) && currentRoute() === "admin/settings" && S.signedIn && !S.denied && S.user?.isAdmin) adminSettings(settingsBody); });
      return heldPanel;
    }
    const valid = st && typeof st === "object" && st.cutoff === 1792688400 && st.epoch === "olympus-beta-2026-10-22" && Object.hasOwn(states, st.phase) &&
      exactRoles(st.roleIds) && [st.canArm,st.policyArmed,st.removalsActive].every(v => typeof v === "boolean") &&
      st.discovery && st.removals && (st.discoveryKnown === false ? st.discovery.currentPassScanned === null && st.discovery.completedPasses === null : [st.discovery.currentPassScanned,st.discovery.completedPasses].every(n => Number.isSafeInteger(n) && n >= 0)) &&
      [st.removals.pending, st.removals.held, st.removals.unknown, st.removals.settledOperations,st.removals.unresolvedGrantCustody,st.removals.unresolvedOtherRoleCustody].every(n => Number.isSafeInteger(n) && n >= 0);
    if (!valid) return frame("Beta member and rank reset", null, h("p", { class: "err", text: "The reset preview could not be verified. Refresh the page before continuing." }));
    const f = st.form, validForm = f && typeof f === "object" && Object.keys(f).sort().join(',') === "expiresAt,formNonce,token" &&
      Number.isSafeInteger(f.expiresAt) && f.expiresAt > nowSec() && f.expiresAt <= nowSec()+300 && f.expiresAt <= st.cutoff &&
      typeof f.formNonce === "string" && /^[0-9a-f]{32}$/.test(f.formNonce) && typeof f.token === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(f.token);
    const arm = h("button", { class: "btn", type: "button", text: "Arm member and rank reset", disabled: !st.canArm || !validForm });
    const refresh = h("button", { class: "btn small", type: "button", text: "Refresh reset status" });
    const retention = st.retention, rf = st.retentionForm;
    const retentionValid = retention && retention.cutoff === st.cutoff && typeof retention.confirmed === "boolean" && typeof retention.canConfirm === "boolean" && retention.removalCompletion === false &&
      ["absent","held","legacy","cutoff_anchor"].includes(retention.evidence) && (retention.confirmedCutoff === null || Number.isSafeInteger(retention.confirmedCutoff) && retention.confirmedCutoff > 0) && retention.confirmed === (retention.confirmedCutoff !== null) &&
      (["legacy","cutoff_anchor"].includes(retention.evidence) === retention.confirmed) && (retention.evidence !== "cutoff_anchor" || retention.confirmedCutoff === st.cutoff) &&
      (!retention.canConfirm || nowSec() >= st.cutoff && (retention.evidence === "absent" || retention.evidence === "legacy" && retention.confirmedCutoff === st.cutoff));
    const retentionFormValid = rf && Object.keys(rf).sort().join(',') === "expiresAt,formNonce,token" && Number.isSafeInteger(rf.expiresAt) && rf.expiresAt > nowSec() && rf.expiresAt <= nowSec()+300 &&
      typeof rf.formNonce === "string" && /^[0-9a-f]{32}$/.test(rf.formNonce) && typeof rf.token === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(rf.token);
    const confirmCutoff = h("button", { class: "btn small", type: "button", text: "Confirm cutoff for retention", disabled: !retentionValid || !retention.canConfirm || !retentionFormValid });
    const tf = st.retireForm, retirementValid = typeof st.policyRetired === "boolean" && typeof st.canRetire === "boolean" &&
      (st.policyRetired ? st.phase === "retired_awaiting_drain" && !st.policyArmed && !st.removalsActive && !st.canArm && !st.canRetire && Number.isSafeInteger(st.retiredAt) && st.retiredAt >= st.cutoff && st.retiredAt <= nowSec()+5 : st.retiredAt === null && st.phase !== "retired_awaiting_drain") && st.finalCompletion === false && st.roleReuseReady === false;
    const retireFormValid = retirementValid && st.canRetire && st.policyArmed && !st.policyRetired && nowSec() >= st.cutoff && tf &&
      Object.keys(tf).sort().join(',') === "expiresAt,formNonce,token" && Number.isSafeInteger(tf.expiresAt) && tf.expiresAt > nowSec() && tf.expiresAt <= nowSec()+300 &&
      typeof tf.formNonce === "string" && /^[0-9a-f]{32}$/.test(tf.formNonce) && typeof tf.token === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(tf.token);
    const retire = h("button", { class: "btn small danger", type: "button", text: "Retire reset policy", disabled: !retireFormValid });
    let panel, busy = false;
    const attached = () => panel && document.body.contains(panel) && settingsBody.contains(panel) && currentRoute() === "admin/settings" && S.signedIn && !S.denied && S.user?.isAdmin;
    refresh.addEventListener("click", () => { if (attached() && !busy) adminSettings(settingsBody); });
    arm.addEventListener("click", async () => {
      if (!attached() || busy || arm.disabled || !validForm || f.expiresAt <= nowSec()) return;
      busy = true; arm.disabled = true;
      const accepted = await confirmBox("Arm the member and rank reset?", "At 22 October 2026, 17:00 UTC (noon CDT), the reset will remove the two Guild Member roles and all ten Olympus Rank roles when removals are active. Manual leadership, Council, Developer, moderators and website appointments stay. Discovery and removals take time.", "Arm reset");
      if (!attached()) return;
      if (f.expiresAt <= nowSec()) { busy = false; return; }
      if (!accepted) { busy = false; arm.disabled = false; return; }
      try {
        const out = await api("POST", "/api/admin/beta-role-reset/arm", { form: f });
        if (!out || out.ok !== true || out.policyArmed !== true || typeof out.removalsEnabled !== "boolean" || out.cutoff !== st.cutoff || !exactRoles(out.roleIds)) throw new Error("The arming outcome is unconfirmed. Refresh status before any further action.");
        if (attached()) toast("Reset policy armed. Check the removal state below.", "good");
      }
      catch (err) { if (attached()) toast(explain(err, "The arming outcome is unconfirmed. Refresh status before any further action."), "bad"); }
      if (attached()) adminSettings(settingsBody);
    });
    confirmCutoff.addEventListener("click", async () => {
      if (!attached() || busy || confirmCutoff.disabled || !retentionFormValid || rf.expiresAt <= nowSec()) return;
      busy = true; confirmCutoff.disabled = true;
      const accepted = await confirmBox("Confirm that the beta cutoff has passed?", "This records the 22 October 2026, 17:00 UTC cutoff for the retention clocks of beta requests and first-seen records. It does not confirm role removals are complete, enable removals, or change appointments.", "Confirm cutoff");
      if (!attached()) return;
      if (rf.expiresAt <= nowSec()) { busy = false; return; }
      if (!accepted) { busy = false; confirmCutoff.disabled = false; return; }
      try {
        const out = await api("POST", "/api/admin/beta-role-reset/confirm-cutoff", { form: rf });
        if (!out || out.ok !== true || out.cutoff !== st.cutoff || out.removalCompletion !== false || !Number.isSafeInteger(out.confirmedAt) || out.confirmedAt < st.cutoff || out.confirmedAt > nowSec()+5) throw new Error("The cutoff confirmation is unconfirmed. Refresh status before continuing.");
        if (attached()) toast("Cutoff recorded for retention. Role removal status is separate.", "good");
      } catch (err) { if (attached()) toast(explain(err, "The cutoff confirmation is unconfirmed. Refresh status before continuing."), "bad"); }
      if (attached()) adminSettings(settingsBody);
    });
    retire.addEventListener("click", async () => {
      if (!attached() || busy || retire.disabled || !retireFormValid || tf.expiresAt <= nowSec()) return;
      busy = true; retire.disabled = true;
      const accepted = await confirmBox("Retire this reset policy permanently?", "This stops new reset scans and removal admissions. A removal that already passed its final check may still complete. Unresolved work remains recorded; retirement does not certify a drain or make these roles ready for reuse. This policy cannot be rearmed.", "Retire policy", { danger: true, typeToConfirm: "RETIRE" });
      if (!attached()) return;
      if (tf.expiresAt <= nowSec()) { busy = false; return; }
      if (!accepted) { busy = false; retire.disabled = false; return; }
      try {
        const out = await api("POST", "/api/admin/beta-role-reset/retire", { confirm: "RETIRE", form: tf });
        if (!out || out.ok !== true || out.policyRetired !== true || out.cutoff !== st.cutoff || out.phase !== "retired_awaiting_drain" || out.finalCompletion !== false || out.roleReuseReady !== false || !Number.isSafeInteger(out.retiredAt) || out.retiredAt < st.cutoff || out.retiredAt > nowSec()+5) throw new Error("The retirement outcome is unconfirmed. Refresh status before continuing.");
        if (attached()) toast("Reset policy retired. Unresolved work remains; role reuse is still held.", "good");
      } catch (err) { if (attached()) toast(explain(err, "The retirement outcome is unconfirmed. Refresh status before continuing."), "bad"); }
      if (attached()) adminSettings(settingsBody);
    });
    const d = st.discovery, r = st.removals;
    panel = frame("Beta member and rank reset", h("span", { class: "badge", text: states[st.phase] }),
      h("p", { text: "Cutoff: 22 October 2026, 17:00 UTC (noon CDT). This is the start of the reset, not an instant finish." }),
      h("p", { class: "muted small", text: "After the cutoff, old beta verification cannot grant these roles, even while removals are inactive. A reviewed full-release source and fresh verification are required before reusing them." }),
      h("p", { text: "Scope: both Guild Member roles and all ten Olympus Rank roles, including empty roles. Manual leadership, Council, Developer, server moderators, website appointments and the leadership directory stay." }),
      kv([["Policy", retirementValid && st.policyRetired ? "Retired permanently" : st.policyArmed ? "Armed" : "Not armed"], ["Removals", st.removalsActive ? "Active" : "Inactive"], ["Discovery", st.discoveryKnown === false ? "Unavailable; retained scan needs review" : `${d.currentPassScanned} members scanned in this pass; ${d.completedPasses} complete passes`], ["Known removals", `${r.pending} pending; ${r.held} held; ${r.unknown} unresolved`], ["Unresolved earlier grants", String(r.unresolvedGrantCustody)], ["Other unresolved role removals", String(r.unresolvedOtherRoleCustody)], ["Settled operations", String(r.settledOperations)]]),
      h("p", { class: "muted small", text: "Discovery reads up to 1,000 server members per minute. Each minute handles up to six role assignments. A 100,000-member server needs about 100 minutes for one full scan. Known progress is not the full server total. Later assignments are discovered on repeated passes." }),
      h("p", { class: "muted small", text: "A clean pass means awaiting the new source, not permanent completion. Removal stays inactive until the reviewed release enables it." }),
      h("p", { class: "muted small", text: "After the cutoff, an owner can permanently retire the policy to stop new reset work. Already admitted removals may still finish. Retained progress and unresolved work do not prove a drain; a separate reviewed source is still required for role reuse." }),
      h("p", { class: "muted small", text: retentionValid && retention.confirmed ? "The retention cutoff is recorded. This does not certify that role removals are complete." : "After the cutoff, an owner must separately confirm it for retention clocks. Original record dates remain preserved; confirmation does not change roles or appointments." }),
      h("details", {}, h("summary", { text: "Exact twelve role IDs" }), h("ul", {}, ...st.roleIds.map(id => h("li", { text: id })))),
      h("div", { class: "btn-row" }, arm, refresh, confirmCutoff, retire));
    return panel;
  }

  // ---------- renames (.114) ----------
  async function adminRenames(body) {
    const data = await api("GET", "/api/admin/renames");
    const who = (r) => r.displayName || (r.username ? "@" + r.username : r.discordId);
    const STATE = { reapply: "applying again", approved: "approved", cancelled: "withdrawn" };
    const mark = (r) => async () => {
      if (!(await confirmBox(`Mark ${r.from} → ${r.to} as required by Blizzard?`, "The character is unbound, the account's site application is set back to withdrawn, its Guild Member role is removed and held unless another of their characters is in the guild, and the member is told privately to apply again and to verify the renamed character again. Only do this for a rename Blizzard required: an ordinary rename keeps the link and needs nothing.", "Ask them to apply again", { danger: true, typeToConfirm: "REAPPLY" }))) return;
      try {
        const out = await api("POST", "/api/admin/renames/forced", { auditId: r.auditId, confirm: "REAPPLY" });
        toast(out.role === "failed" ? "Marked. The Guild Member role could not be removed: remove it by hand in Discord." : "Marked: the member applies again.", out.role === "failed" ? "bad" : "good");
      } catch (err) { toast(explain(err), "bad"); }
      adminRenames(body);
    };
    const close = (hold, what) => async () => {
      const approve = what === "approve";
      if (!(await confirmBox(approve ? "Approve the new application?" : "Withdraw the decision?", approve ? "The hold on Guild Member ends. The role comes back through the roster once the renamed character is verified again and in the guild." : "The hold ends. The character stays unbound and is verified again with a new code; the application stays withdrawn until the member saves it.", approve ? "Approve" : "Withdraw"))) return;
      try { await api("POST", `/api/admin/renames/${hold.id}/${what}`); toast("Done.", "good"); } catch (err) { toast(explain(err), "bad"); }
      adminRenames(body);
    };
    const holdsTable = h("div", { class: "table-wrap" }, h("table", { class: "data" },
      h("thead", null, h("tr", null, ["Marked", "Rename", "Discord account", ""].map((t) => h("th", { text: t })))),
      h("tbody", null, data.openHolds.map((hh) => h("tr", null,
        h("td", { text: fmtShort(hh.decidedAt) }), h("td", { text: `${hh.from} → ${hh.to}` }), h("td", { text: hh.discordId }),
        h("td", null, h("div", { class: "btn-row" },
          h("button", { class: "btn small", type: "button", text: "New application approved", onclick: close(hh, "approve") }),
          h("button", { class: "btn small", type: "button", text: "Withdraw the decision", onclick: close(hh, "cancel") }))))))));
    const renamesTable = h("div", { class: "table-wrap" }, h("table", { class: "data" },
      h("thead", null, h("tr", null, ["Seen", "Old name", "New name", "Account", ""].map((t) => h("th", { text: t })))),
      h("tbody", null, data.renames.map((r) => h("tr", null,
        h("td", { text: fmtShort(r.at) }), h("td", { text: r.from }), h("td", { text: r.to }), h("td", { text: who(r) }),
        h("td", null, r.hold
          ? h("span", { class: "badge " + (r.hold.state === "reapply" ? "warn" : "muted"), text: STATE[r.hold.state] || r.hold.state })
          : h("button", { class: "btn small danger", type: "button", text: "Blizzard required this rename", onclick: mark(r) })))))));
    clear(body);
    add(body, [
      frame("Members applying again", null,
        h("p", { class: "muted small", text: "Accounts asked to apply again after a rename Blizzard required. Unless another of their characters is in the guild, their Guild Member role is held. Approve once the member has submitted the application again, you accepted it (Applications tab) and the character was verified again in game; or withdraw a mistaken decision." }),
        data.openHolds.length ? holdsTable : h("p", { class: "muted small", text: "Nobody is waiting." })),
      frame("Renames on the roster", null,
        h("p", { class: "muted small", text: "Characters the officers' roster shows under a new name: the same character, followed by its in-game identifier, from the last 120 days. An ordinary rename keeps the link and needs nothing. The roster cannot tell why a character was renamed, so mark only a rename Blizzard required: that member applies again, with a new application and a fresh in-game verification." }),
        data.renames.length ? renamesTable : h("p", { class: "muted small", text: "No renames recorded." })),
    ]);
  }

  const AUDIT_FAMILIES = ["site", "role", "roles", "verify", "roster", "invite", "community", "admin", "link", "notice", "note", "staff_notice", "guild", "review", "rename", "rank", "queue", "nick", "intros", "bnet"];
  const AUDIT_WINDOWS = [["1d", "Last day"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["all", "All time"]];
  // Codex's review of the candidate (7 Oct 2026, 20:34 UTC): a slower answer to an earlier Show, Older, Newest or visit must
  // never replace a newer one. Every read takes the next number; an answer, or a failure, whose number is no longer the
  // latest is dropped, and each read keeps the filters it was sent with rather than reading A.audit again after its await.
  let auditReads = 0;
  async function adminAudit(body) {
    const f = A.audit;
    const read = ++auditReads;
    const sent = { family: f.family, actor: f.actor, subject: f.subject, window: f.window, before: f.before };
    const family = h("select", { id: "audit-family" }, h("option", { value: "", text: "All" }), AUDIT_FAMILIES.map((k) => h("option", { value: k, text: k, selected: f.family === k })));
    const actor = h("input", { type: "text", id: "audit-actor", value: f.actor, placeholder: "Discord ID, or watcher, system, cron, site, auto", autocomplete: "off", spellcheck: "false" });
    const subject = h("input", { type: "text", id: "audit-subject", value: f.subject, placeholder: "Exact subject", maxlength: "80", autocomplete: "off", spellcheck: "false" });
    const win = h("select", { id: "audit-window" }, AUDIT_WINDOWS.map(([k, t]) => h("option", { value: k, text: t, selected: f.window === k })));
    const show = h("button", { class: "btn small", id: "audit-show", type: "button", text: "Show" });
    // Show reads the boxes and starts at the newest entry; Older and Newest keep the filters this page was read with
    const showNew = () => { Object.assign(f, { family: family.value, actor: actor.value.trim(), subject: subject.value.trim(), window: win.value, before: 0 }); adminAudit(body); };
    const page = (before) => { f.before = before; adminAudit(body); };
    show.addEventListener("click", showNew);
    for (const box of [actor, subject]) box.addEventListener("keydown", (e) => { if (e.key === "Enter") showNew(); });
    const filterSummary = [AUDIT_WINDOWS.find(([key]) => key === sent.window)?.[1], sent.family ? "Family: " + sent.family : "All families", sent.actor ? "Actor: " + sent.actor : "", sent.subject ? "Subject: " + sent.subject : ""].filter(Boolean).join(" · ");
    const filters = h("details", { class: "admin-filter-panel" }, h("summary", { text: "Filter the audit log — " + filterSummary }), h("div", { class: "filters" },
      h("label", { class: "field" }, h("span", { class: "lab small", text: "Family" }), family),
      h("label", { class: "field" }, h("span", { class: "lab small", text: "Actor" }), actor),
      h("label", { class: "field" }, h("span", { class: "lab small", text: "Subject" }), subject),
      h("label", { class: "field" }, h("span", { class: "lab small", text: "Window" }), win),
      show));
    const intro = h("details", { class: "audit-help" }, h("summary", { text: "About the log and its read limits" }), h("p", { class: "muted small", text: "What the bot, the officers' roster, the role writer and this site recorded in the dated log, newest first: who acted, what they did and to whom. The entries carry Discord IDs, so this page is for site admins only; reading it is not recorded. Only approved summaries are shown; private details and unrecognized records are withheld. Each request searches up to 2,000 record IDs back, so a rare filter can take Older more than once." }));
    let d;
    try {
      d = await api("GET", "/api/admin/audit-log?" + qs(sent));
    } catch (err) {
      if (read !== auditReads || currentRoute() !== "admin/audit" || !S.signedIn || S.denied || !(S.user && S.user.isAdmin)) return; // a newer read owns the page now
      const filterState = adminFilterState(body, !!(sent.family || sent.actor || sent.subject || sent.window !== "7d")); filters.open = filterState.open;
      clear(body);
      add(body, frame("Audit log", null, intro, filters, errorLine(explain(err, "The audit log could not be read."))));
      restoreAdminFilterFocus(body, filterState);
      return;
    }
    if (read !== auditReads || currentRoute() !== "admin/audit" || !S.signedIn || S.denied || !(S.user && S.user.isAdmin)) return; // a newer read owns the page now
    const entries = Array.isArray(d.entries) ? d.entries : [];
    const who = (id, name) => (name ? [h("span", { text: name }), h("br"), h("span", { class: "faint small", text: id })] : h("span", { text: id }));
    const detail = (r) => {
      const summary = r.details && typeof r.details === "object" && !Array.isArray(r.details)
        ? Object.entries(r.details).map(([key, value]) => key + ": " + String(value)).join("; ") : "";
      return summary || r.detailsWithheld ? h("details", { class: "audit-detail" }, h("summary", { text: "View details" }), h("div", null,
        summary ? h("span", { text: summary }) : null,
        r.detailsWithheld ? h("span", { class: "faint small", text: (summary ? " · " : "") + "Private or unrecognized details withheld" }) : null)) : h("span", { text: "—" });
    };
    const table = h("div", null, h("p", { class: "table-scroll-hint small muted", text: "Scroll sideways to see every column." }), h("div", { class: "table-wrap" }, h("table", { class: "data admin-audit" },
      h("thead", null, h("tr", null, ["When", "Who", "What", "Subject", "Detail"].map((t) => h("th", { text: t })))),
      h("tbody", null, entries.map((r) => h("tr", { "data-audit-id": String(r.id) },
        h("td", { class: "audit-time", title: ago(r.ts) }, (() => { const stamp = new Date(r.ts * 1000).toISOString(); return h("time", { datetime: stamp, title: fmtDateTime(r.ts) + " · " + ago(r.ts) }, stamp.slice(0, 10), h("br"), stamp.slice(11, 19) + " UTC"); })()),
        h("td", null, who(r.actor, r.actorName)),
        h("td", { text: r.action }),
        h("td", r.subjectName ? { title: r.subject } : null, r.subjectName ? h("span", { text: r.subjectName }) : h("span", { text: r.subject || (r.subjectWithheld ? "Withheld" : "—") })),
        (() => { const td = h("td", { class: "small wrap" }, detail(r)); td.style.overflowWrap = "anywhere"; return td; })()))))));
    const span = d.scanned ? `#${d.scanned.lo} and #${d.scanned.hi}` : "";
    const status = entries.length
      ? `${plural(entries.length, "entry", "entries")}, newest first${d.exhausted ? ", to the start of this window." : "."}`
      : d.exhausted || !span
        ? (sent.before ? "No older matching entries in this window." : "No matching entries in this window.")
        : d.likelyEnd
          ? `No matching entries between ${span}. The rest of the log was stamped before this window, so more are unlikely; Older still checks it, for any entry stamped out of order.`
          : `No matching entries between ${span}; Older keeps looking further back.`;
    const filterState = adminFilterState(body, !!(sent.family || sent.actor || sent.subject || sent.window !== "7d")); filters.open = filterState.open;
    // .175: remember the still-focused pager only after the read; a reader who moved away keeps their focus.
    const pagerFocus = body.contains(document.activeElement) && ["audit-page-newest", "audit-page-older"].includes(document.activeElement.id) ? document.activeElement.id : "";
    clear(body);
    add(body, frame("Audit log", null, intro, filters,
      entries.length ? table : null,
      h("div", { class: "pager" },
        h("span", { class: "muted small", id: "audit-status", role: "status", "aria-live": "polite", text: status }),
        h("div", { class: "btn-row" },
          h("button", { class: "btn small", id: "audit-page-newest", type: "button", text: "Newest", disabled: !sent.before, onclick: () => page(0) }),
          h("button", { class: "btn small", id: "audit-page-older", type: "button", text: "Older", disabled: !Number.isInteger(d.next), onclick: () => page(d.next) })))));
    restoreAdminFilterFocus(body, filterState);
    if (pagerFocus) {
      const preferred = body.querySelector("#" + pagerFocus);
      const alternate = body.querySelector(pagerFocus === "audit-page-older" ? "#audit-page-newest" : "#audit-page-older");
      const target = preferred && !preferred.disabled ? preferred : alternate && !alternate.disabled ? alternate : null;
      // The replacement page may be much taller; normal focus scrolls its pager into view when needed.
      if (target) target.focus();
    }
  }

  async function adminTreasury(body) {
    const owner = S.user, path = "/api/admin/treasury/", markerKey = "olympus.treasuryAttempt";
    let target = "", targetLabel = "", targetGeneration = 0, busy = false, preview = null, spent = null, storageHeld = false;
    const panel = h("div", { class: "stack" }), notice = h("p", { role: "status", "aria-live": "polite", class: "small muted" });
    const live = () => S.user === owner && owner?.isAdmin && S.signedIn && !S.denied && currentRoute() === "admin/treasury" && document.body.contains(panel);
    const reference = h("input", { id: "treasury-reference", type: "text", maxlength: "60", autocomplete: "off" });
    const amount = h("input", { id: "treasury-gold", type: "number", min: "0.0001", max: "214748.3647", step: "0.0001" });
    const observed = h("input", { id: "treasury-observed", type: "datetime-local" });
    const mail = h("input", { id: "treasury-mail", type: "text", maxlength: "40", autocomplete: "off", placeholder: "TITHE- reference from the ledger" });
    const selected = h("p", { class: "small", text: "Choose a current Olympus member." });
    const targetReference = h("button", { type: "button", class: "btn small", text: "Read member's TITHE reference" });
    const evidence = h("input", { id: "treasury-gold-verified", type: "checkbox" });
    const consent = h("input", { id: "treasury-recognition", type: "checkbox" });
    const decline = h("input", { id: "treasury-decline-recognition", type: "checkbox" });
    const record = h("button", { type: "button", class: "btn", text: "Record verified extra gold" });
    const review = h("button", { type: "button", class: "btn", text: "Preview cosmetic role changes" });
    const changes = h("div", { class: "stack" });
    const operation = h("input", { id: "treasury-operation", type: "text", maxlength: "32", autocomplete: "off", placeholder: "Original operation ID" });
    const status = h("button", { type: "button", class: "btn small", text: "Read original operation status" });
    try { const raw = sessionStorage.getItem(markerKey); if (raw) { const v = JSON.parse(raw); if (!v || v.owner !== owner?.id || !/^[0-9a-f]{32}$/.test(v.operationId)) throw Error("unreadable original attempt"); spent = v.operationId; operation.value = spent; } }
    catch { storageHeld = true; notice.textContent = "The original attempt marker could not be read. Role dispatch is held; inspect the original operation before making another change."; }
    const currentRecognition = () => consent.checked && !decline.checked ? true : decline.checked && !consent.checked ? false : null;
    const sync = () => { consent.disabled = decline.disabled = busy || !!spent || storageHeld; targetReference.disabled = busy || !target; record.disabled = busy || !target || !evidence.checked || !!spent || storageHeld; review.disabled = busy || !target || currentRecognition() === null || !!spent || storageHeld; status.disabled = busy || !/^[0-9a-f]{32}$/.test(operation.value.trim()); };
    const field = (text, input) => h("label", { class: "field" }, h("span", { class: "lab small", text }), input);
    add(panel, frame("Treasury · cosmetic recognition", null,
      h("p", { text: royalWritsVisible200() ? "Tithe Payer 25g+, Patron of the Treasury 100g+, Benefactor of Olympus 500g+. Additional in-game gold is mailed to the designated Treasurer recipient shown through the qualified appointment listing. Only the highest qualifying tier applies, for the configured 90-day season. These colours grant no channel access, votes, office or immunity." : "The Royal Writs schedule and new Patron applications are paused. Existing receipt and operation records remain available for staff review. Provider dispatch has its own separate OFF gate; this display switch does not enable it." }),
      h("p", { class: "muted small", text: "Ordinary dues do not count. A TITHE- reference identifies a ledger account; it does not prove that gold was received. Verify the in-game mail before recording a receipt. Each role change requires its own reviewed confirmation." }),
      picker({ label: "Treasury member", placeholder: "Search Discord by name or user ID…", allowTyped: false, allowSelf: true, appointmentOnly: true, onPick: person => { target = person.key; targetLabel = person.label; targetGeneration++; selected.textContent = person.label + " · " + person.key; mail.value = ""; preview = null; clear(changes); notice.textContent = ""; evidence.checked = false; consent.checked = false; decline.checked = false; sync(); } }), selected, targetReference,
      field("Immutable receipt reference", reference), field("Additional gold received", amount), field("Received at (your local time)", observed), field("Member's TITHE- reference", mail),
      h("label", null, evidence, " I verified this additional gold in the in-game mail; it is not ordinary dues."), record,
      h("label", null, consent, " The member agreed to this cosmetic recognition."),
      h("label", null, decline, " The member declined public recognition. Preview removal only; keep their gold credit."), review, notice, changes,
      field("Original role operation", operation), status));
    clear(body); add(body, panel);
    evidence.addEventListener("change", sync); operation.addEventListener("input", sync);
    const recognitionChanged = (selected, other) => { if (selected.checked) other.checked = false; targetGeneration++; preview = null; clear(changes); notice.textContent = ""; sync(); };
    consent.addEventListener("change", () => recognitionChanged(consent, decline));
    decline.addEventListener("change", () => recognitionChanged(decline, consent));
    targetReference.addEventListener("click", async () => {
      if (!live() || targetReference.disabled) return; const originalTarget = target, generation = targetGeneration; busy = true; sync();
      try { const d = await api("POST", path + "target", { discordId: originalTarget }, { live }); if (live() && generation === targetGeneration && target === originalTarget) { if (d?.discordId !== originalTarget || typeof d.mailReference !== "string" || !/^TITHE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(d.mailReference)) throw Error("Unreadable target reference"); mail.value = d.mailReference; notice.textContent = "Reference read from the member's ledger. This is not proof of payment."; } }
      catch (e) { if (live() && generation === targetGeneration) notice.textContent = explain(e, "The current member's reference could not be read."); }
      finally { busy = false; if (live()) sync(); }
    });
    const drawPreview = (d, originalTarget, originalLabel, generation) => {
      clear(changes);
      add(changes, h("p", { class: "small", text: "Member: " + originalLabel + " · " + originalTarget + ". Qualifying extra gold: " + d.qualifyingGold + "g · season ends " + fmtDateTime(d.seasonEndsAt) + " · preview expires " + fmtDateTime(d.expiresAt) + "." }));
      if (d.recognitionConsent === false) add(changes, h("p", { text: "Removal-only decline of recognition. The recorded extra-gold credit is kept. An unresolved original role attempt remains held." }));
      if (!d.dispatchEnabled) add(changes, h("p", { class: "muted small", text: "New role dispatch is disabled in the server configuration." }));
      if (!d.changes.length) add(changes, h("p", { text: "No cosmetic role change is needed." }));
      const removals = d.changes.some(c => c.desired === 0);
      for (const c of d.changes) {
        const checked = h("input", { type: "checkbox" });
        const button = h("button", { type: "button", class: "btn small", text: (c.desired ? "Grant " : "Remove ") + c.label, disabled: true });
        checked.addEventListener("change", () => { button.disabled = busy || !!spent || storageHeld || !checked.checked || !d.dispatchEnabled || (c.desired === 1 && removals); });
        button.addEventListener("click", async () => {
          if (!live() || busy || spent || storageHeld || button.disabled || preview !== d || generation !== targetGeneration || target !== originalTarget || d.expiresAt <= nowSec()) return;
          try { sessionStorage.setItem(markerKey, JSON.stringify({ owner: owner.id, operationId: c.operationId })); }
          catch { storageHeld = true; notice.textContent = "The original attempt could not be retained. No role command was sent."; sync(); return; }
          spent = c.operationId; operation.value = spent; busy = true; button.disabled = true; sync();
          try { const out = await api("POST", path + "confirm", { token: d.token, operationId: c.operationId, confirmed: true }, { live }); if (live()) notice.textContent = out.state === "settled" ? "The original role operation for " + originalLabel + " · " + originalTarget + " settled. Read its status before preparing another change." : "The original role operation for " + originalLabel + " · " + originalTarget + " is held or unknown. Read its status; do not send it again."; }
          catch { if (live()) notice.textContent = "The original role operation is unconfirmed. Read its status; do not send it again."; }
          finally { busy = false; if (live()) { clear(changes); preview = null; sync(); } }
        });
        add(changes, h("div", { class: "field" }, h("p", { text: (c.desired ? "Grant " : "Remove ") + c.label + " · role " + c.roleId }), h("label", null, checked, " I reviewed this exact cosmetic change."), button,
          c.desired === 1 && removals ? h("p", { class: "small muted", text: "Remove the previous tier first, read its settled status, then request a fresh preview." }) : null));
      }
    };
    record.addEventListener("click", async () => {
      if (!live() || record.disabled) return;
      const gold = Number(amount.value), copper = Math.round(gold * 10000), at = fromLocalInput(observed.value), ref = reference.value.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(ref) || !amount.value || !Number.isFinite(gold) || !Number.isSafeInteger(copper) || copper < 1 || copper > 2147483647 || Math.abs(gold * 10000 - copper) > 0.000001 || !at) { notice.textContent = "Enter the receipt reference, exact gold amount and receipt time."; return; }
      const originalTarget = target, generation = targetGeneration;
      busy = true; sync();
      try { const out = await api("POST", path + "record", { reference: ref, discordId: originalTarget, amountCopper: copper, observedAt: at, mailReference: mail.value.trim(), verifiedAdditionalGold: true }, { live }); if (live() && generation === targetGeneration) { notice.textContent = out.recorded ? "Verified extra gold recorded" + (out.replay ? " (the identical original receipt)." : ".") : "Receipt outcome unconfirmed; preserve the same reference and amount."; evidence.checked = false; clear(changes); preview = null; } }
      catch (e) { if (live() && generation === targetGeneration) notice.textContent = explain(e, "The receipt outcome is unconfirmed. Preserve its exact original reference and amount; do not create another receipt for the same gold."); }
      finally { busy = false; if (live()) sync(); }
    });
    review.addEventListener("click", async () => {
      if (!live() || review.disabled) return; const recognitionConsent = currentRecognition(); if (recognitionConsent === null) return; const originalTarget = target, originalLabel = targetLabel, generation = targetGeneration; busy = true; sync(); clear(changes); preview = null;
      try { const d = await api("POST", path + "preview", { discordId: originalTarget, recognitionConsent }, { live }); if (!live() || generation !== targetGeneration || target !== originalTarget) return;
        if (!d || d.recognitionConsent !== recognitionConsent || d.recognitionMode !== (recognitionConsent ? "recognize" : "decline") || typeof d.token !== "string" || !Number.isSafeInteger(d.expiresAt) || d.expiresAt <= nowSec() || !Number.isSafeInteger(d.seasonEndsAt) || typeof d.qualifyingGold !== "number" || !Number.isFinite(d.qualifyingGold) || typeof d.dispatchEnabled !== "boolean" || !Array.isArray(d.changes) || d.changes.length > 3 || d.recognitionConsent === false && d.changes.some(c => c?.desired !== 0) || d.changes.some(c => !c || !/^[0-9a-f]{32}$/.test(c.operationId) || !/^[0-9]{17,20}$/.test(c.roleId) || ![0, 1].includes(c.desired) || typeof c.label !== "string")) throw Error("Unreadable preview");
        preview = d; notice.textContent = "Preview only. No role command was sent."; drawPreview(d, originalTarget, originalLabel, generation);
      } catch (e) { if (live() && generation === targetGeneration) notice.textContent = explain(e, "The cosmetic preview is unavailable."); }
      finally { busy = false; if (live()) sync(); }
    });
    status.addEventListener("click", async () => {
      if (!live() || status.disabled) return; busy = true; sync(); const id = operation.value.trim();
      try { const d = await api("POST", path + "status", { operationId: id }, { live }); if (!live()) return; const o = d?.operation;
        notice.textContent = o ? "Original operation: " + o.state + " · " + o.reason + " · attempts " + o.attempts + "." : "No recorded operation was returned. This does not establish that an unconfirmed provider command did not apply.";
        // Only a fresh persisted original status can prove nonapplication. The confirm
        // reply alone may outlive a failed receipt; unknown/spent custody stays held.
        const definiteNoSend = o?.state === "held" && o.attempts === 1 && Number.isSafeInteger(o.checked_at) && o.checked_at > 0 && o.checked_at <= nowSec() && ["treasury_pre_dispatch_refused", "treasury_provider_definite_refusal"].includes(o.reason);
        if (o?.id === spent && (o.state === "settled" || definiteNoSend)) { sessionStorage.removeItem(markerKey); spent = null; preview = null; clear(changes); consent.checked = false; decline.checked = false; if (definiteNoSend) notice.textContent += " The original stored receipt records definitive nonapplication. A new change still requires a fresh preview and explicit confirmation; the old operation is never replayed."; }
      } catch (e) { if (live()) notice.textContent = explain(e, "The original status could not be read; no role command was sent."); }
      finally { busy = false; if (live()) sync(); }
    });
    sync();
  }

  async function adminDirectoryVisibility(body) {
    const owner = S.user, route = currentRoute(), panel = h("div", { class: "stack" }); let busy = false, selectedTarget = "", generation = 0, confirmedPreference = "", restoreAllowed = false;
    const live = () => S.user === owner && owner?.isAdmin && S.signedIn && !S.denied && currentRoute() === route && app.contains(panel);
    const target = h("input", {type:"text", inputmode:"numeric", maxlength:"20", autocomplete:"off", id:"attended-directory-id"});
    const listed = h("input", {type:"checkbox", id:"attended-directory-listed"}), confirmed = h("input", {type:"checkbox", id:"attended-directory-confirmed"});
    const read = h("button", {type:"button", class:"btn small", text:"Read this member’s preference"}), save = h("button", {type:"button", class:"btn", text:"Save requested listing preference", disabled:true});
    const notice = h("p", {class:"muted small", role:"status"});
    const preferenceKey = () => JSON.stringify([selectedTarget, listed.checked]);
    const invalidateConfirmation = () => { confirmed.checked = false; confirmedPreference = ""; };
    const sync = () => { read.disabled = target.disabled = listed.disabled = confirmed.disabled = busy; listed.disabled = confirmed.disabled = busy || !restoreAllowed; save.disabled = busy || !restoreAllowed || !selectedTarget || selectedTarget !== target.value.trim() || !confirmed.checked || confirmedPreference !== preferenceKey(); };
    target.addEventListener("input", () => { generation++; selectedTarget = ""; restoreAllowed = false; invalidateConfirmation(); notice.textContent = "Read the exact member ID before changing it."; sync(); });
    listed.addEventListener("change", () => { generation++; invalidateConfirmation(); sync(); });
    confirmed.addEventListener("change", () => { confirmedPreference = confirmed.checked ? preferenceKey() : ""; sync(); });
    read.addEventListener("click", async () => {
      const id = target.value.trim(); if (!live() || busy || !/^[1-9][0-9]{16,19}$/.test(id)) return;
      const requestedGeneration = ++generation, current = () => live() && generation === requestedGeneration && target.value.trim() === id;
      busy = true; selectedTarget = ""; invalidateConfirmation(); sync();
      try { const d = await api("POST", "/api/admin/discord-directory/status", {discordId:id}, {live:current}); if (!current()) return; if (d?.discordId !== id || typeof d.listed !== "boolean") throw Error("Unreadable directory preference"); invalidateConfirmation(); selectedTarget = id; listed.checked = d.listed; restoreAllowed = d.restoreAllowed === true; notice.textContent = (d.listed ? "The eligible Olympus row can be listed. " : "The entire directory row is hidden. ") + "Preference origin: " + String(d.visibilityOrigin || "unconfirmed") + ". " + (restoreAllowed ? "" : "Only this member can change their self-service preference. ") + (d.erasureNotice || ""); }
      catch (error) { if (current()) notice.textContent = explain(error,"The preference could not be confirmed; no change was sent."); }
      finally { busy = false; if (live()) sync(); }
    });
    save.addEventListener("click", async () => {
      const id = selectedTarget, requested = listed.checked; if (!live() || save.disabled || id !== target.value.trim() || confirmedPreference !== preferenceKey()) return;
      const requestedGeneration = ++generation, current = () => live() && generation === requestedGeneration && target.value.trim() === id;
      busy = true; sync();
      try { const d = await api("POST", "/api/admin/discord-directory/visibility", {discordId:id,listed:requested,requestConfirmed:true}, {live:current}); if (!current()) return; if (d?.discordId !== id || d.listed !== requested) throw Error("Preference outcome unconfirmed"); notice.textContent = d.listed ? "Default eligibility restored at this member’s request." : "The member’s whole directory row is hidden; no website account was created."; }
      catch (error) { if (current()) notice.textContent = explain(error,"Outcome unconfirmed. Read the same member’s preference before any further change."); }
      finally { busy = false; selectedTarget = ""; invalidateConfirmation(); if (live()) sync(); }
    });
    clear(body); add(body, panel); add(panel, frame("Attended directory preference", null,
      h("p", {text:"Use only for a person’s explicit listing request, including Olympus role holders who never registered on this website. This hides or restores an attended preference for the whole directory row; it cannot override a member’s self-service choice and changes no Discord role, account or optional profile."}),
      fieldBox("attended-directory-id", "Exact Discord account ID supplied by the requester", target), read,
      h("label", null, listed, " List the eligible Olympus row"), h("label", null, confirmed, " I verified this exact account holder requested this preference"), save, notice));
  }

  // Explicit publication: request-driven steps, durable original operations, no future selector or automatic sends.
  async function adminRulesetPublication(body) {
    const owner = S.user, route = currentRoute();
    const path = "/api/admin/ruleset-publication", key = "olympus.rulesetSelection";
    const token = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{22}$/.test(v);
    const id = (v) => typeof v === "string" && /^[0-9]{17,20}$/.test(v);
    const obj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    const revisionValid = (v) => typeof v === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(v);
    const states = ["unselected", "pending", "claimed", "unknown", "known", "applied", "refused", "held"];
    const targets = ["guide", "olympus-info", "guild-announcements"];
    const formValid = (v) => obj(v) && token(v.operationId) && Number.isSafeInteger(v.expectedRevision) && v.expectedRevision >= 0 && Number.isSafeInteger(v.expiresAt) && v.expiresAt > nowSec() && typeof v.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(v.token);
    const operationValid = (v) => obj(v) && token(v.publicationId) && targets.includes(v.target) && Number.isSafeInteger(v.revision) && v.revision > 0 && ["claimed", "unknown"].includes(v.state) && ["create", "edit", "pin"].includes(v.stage) && id(v.channelId) && (v.messageId === null || id(v.messageId));
    // v2: the authenticated staff status is authoritative for this page; a shape-valid current profile replaces a stale boot copy (a lost switch answer) instead of being refused.
    const profileValid = (v) => obj(v) && identityOf(v) !== "Game identity unavailable";
    let current = null, busy = false, pending = null, storageFailed = false;
    try { const raw = sessionStorage.getItem(key); if (raw) { pending = JSON.parse(raw); if (!obj(pending) || !revisionValid(pending.profileRevision) || !formValid(pending.form)) throw Error("unconfirmed original selection"); } }
    catch { storageFailed = true; }
    const panel = h("div", { class: "stack" }); clear(body); add(body, panel);
    const live = () => document.body.contains(panel) && currentRoute() === route && route === "admin/ruleset-publication" && S.user === owner && S.signedIn && !S.denied && S.user?.isAdmin;
    const notice = h("p", { class: "muted small", role: "status", "aria-live": "polite" });
    const review = h("input", { type: "checkbox", id: "ruleset-publication-reviewed" });
    const select = h("button", { class: "btn", type: "button", text: "Record current PvE Alliance plan" });
    const refresh = h("button", { class: "btn small", type: "button", text: "Refresh publication status" });
    const rows = h("div", { class: "stack" }), blockers = h("div", { class: "stack" }), switchBox = h("div", { class: "stack" });
    const historicalPending = () => !!pending && revisionValid(pending.profileRevision) && !!current && profileValid(current.currentProfile) && pending.profileRevision !== current.currentProfile.revision;
    add(panel, frame("Ruleset publication", null,
      h("p", { text: "Review the approved current PvE Alliance copy and destinations below. Recording the plan sends nothing. Each Apply next step sends at most one post, edit or pin; inspect its status before continuing. No future profile or automatic publication is available." }),
      h("p", { class: "muted small", text: "Guide wording remains owner-approved. Erasing a publishing account removes its authorization metadata; the independent guild guide and original message custody remain. An unknown outcome is checked without sending again." }),
      notice, h("label", null, review, " I reviewed these approved payloads and destinations."), h("div", { class: "btn-row" }, select, refresh), switchBox, blockers, rows));
    const buttons = () => {
      select.textContent = historicalPending() ? "Original selection needs review" : pending ? "Retry original selection" : (M().ruleset?.phase === "full_release" ? "Record current release plan" : "Record current PvE Alliance plan");
      select.disabled = busy || storageFailed || !current || !profileValid(current.currentProfile) || historicalPending() || (!pending && (!review.checked || !formValid(current.form)));
      refresh.disabled = busy; review.disabled = busy;
      for (const b of rows.querySelectorAll("button")) b.disabled = busy || !current || b.dataset.allowed !== "yes" || (historicalPending() && b.dataset.effect === "yes");
      for (const b of blockers.querySelectorAll("button")) b.disabled = busy || !current;
    };
    const messageId = (text, channel) => { const v = text.trim(); if (id(v)) return v; const m = /^https:\/\/discord\.com\/channels\/[0-9]{17,20}\/([0-9]{17,20})\/([0-9]{17,20})$/.exec(v); return m && m[1] === channel ? m[2] : null; };
    const action = async (kind, operation, input) => {
      if (busy || !current || !live() || (kind === "publish" && (historicalPending() || current.selected?.profileRevision !== current.currentProfile?.revision))) return;
      const payload = { publicationId: operation.publicationId, target: operation.target };
      if (kind === "reconcile") { const pointer = messageId(input.value || operation.messageId || "", operation.channelId); if (!pointer) { notice.textContent = "Enter the bot's message ID or its link in the displayed destination."; return; } payload.messageId = pointer; }
      busy = true; buttons();
      try { const r = await api("POST", path + "/" + kind, payload, { live }); if (!obj(r) || !["applied", "known", "held", "unknown", "refused", "known_response_unrecorded"].includes(r.state)) throw new ApiError(200, { error: "unreadable_answer" }); }
      catch { if (live()) notice.textContent = "The operation is unconfirmed. Refresh its original status or check the existing message; do not create another copy."; }
      finally { busy = false; }
      if (live()) await load();
    };
    const operationControls = (operation, canApply) => {
      const pointer = h("input", { type: "text", autocomplete: "off", "aria-label": "Message ID for " + operation.target, placeholder: "Existing bot message ID or link", value: operation.messageId || "" });
      const apply = h("button", { class: "btn small", type: "button", text: "Apply next step", "data-allowed": canApply ? "yes" : "no", "data-effect": "yes", onclick: () => { if (!apply.disabled) action("publish", operation); } });
      const check = h("button", { class: "btn small", type: "button", text: "Check existing message", "data-allowed": ["claimed", "unknown", "held"].includes(operation.state) ? "yes" : "no", onclick: () => { if (!check.disabled) action("reconcile", operation, pointer); } });
      return [h("div", { class: "btn-row" }, apply, check), pointer];
    };
    // Item 7 (14 Oct 2026): the owner-only identity switch. Booleans from the staff status; one confirmed click posts to the
    // Worker, which does everything in one batch or nothing. The page never holds or shows the future identity before activation.
    const switchValid = (v) => obj(v) && ["beta", "full_release"].includes(v.mode) && (v.held === null || typeof v.held === "string") && typeof v.futureProfileConfigured === "boolean" && typeof v.ownerEligibilityQualified === "boolean" && typeof v.projectionSyncQualified === "boolean" && typeof v.activateAvailable === "boolean" && typeof v.returnAvailable === "boolean";
    const drawSwitch = (sw) => {
      clear(switchBox);
      const confirm = h("input", { type: "checkbox", id: "ruleset-switch-confirmed" });
      const activate = h("button", { class: "btn small", type: "button", text: "Activate the full-release identity" });
      const revert = h("button", { class: "btn small", type: "button", text: "Return to the current PvE Alliance identity" });
      const sync = () => { activate.disabled = busy || historicalPending() || !confirm.checked || !sw.activateAvailable; revert.disabled = busy || historicalPending() || !confirm.checked || !sw.returnAvailable; };
      const flip = async (kind) => {
        if (busy || !current || !live() || historicalPending() || !confirm.checked) return;
        busy = true; buttons(); sync();
        try {
          const r = await api("POST", path + "/" + kind, { form: current.form, confirm: true }, { live });
          if (!live()) return;
          if (!obj(r) || !["beta", "full_release"].includes(r.mode) || !obj(r.profile)) throw new ApiError(200, { error: "unreadable_answer" });
          if (S.meta) { S.meta.ruleset = r.profile; S.meta.rulesetHeld = null; }
          notice.textContent = kind === "activate" ? "Full-release identity activated and its publication selected. Apply each target below." : "Current PvE Alliance identity restored and its publication selected. Apply each target below.";
        } catch (e) { if (live()) notice.textContent = "The switch was refused or unconfirmed (" + ((e && e.data && e.data.error) || "unconfirmed") + "). Nothing was published; refresh the status."; }
        finally { busy = false; }
        if (live()) await load();
      };
      activate.addEventListener("click", () => { if (!activate.disabled) flip("activate"); });
      revert.addEventListener("click", () => { if (!revert.disabled) flip("deactivate"); });
      confirm.addEventListener("change", sync);
      add(switchBox, frame("Game identity switch", h("span", { class: "badge", text: sw.held ? "held: " + sw.held : sw.mode === "full_release" ? "full release" : "PvE Alliance" }),
        h("p", { class: "small", text: "Mode " + sw.mode + (sw.revision ? " · revision " + sw.revision : "") + " · future profile configured: " + (sw.futureProfileConfigured ? "yes" : "no") + " · you may switch: " + (sw.ownerEligibilityQualified ? "yes" : "no") + " · publications settled: " + (sw.projectionSyncQualified ? "yes" : "no") }),
        h("p", { class: "muted small", text: "The future identity is read from a private server value the owner sets on the day; it is shown nowhere before activation. The switch records the identity and selects its publication in one step; the three Discord messages still change only through Apply next step." }),
        h("label", null, confirm, " I confirm the owner's condition is met and I intend to switch now."), h("div", { class: "btn-row" }, activate, revert)));
      sync();
    };
    const draw = (d) => {
      if (obj(d) && switchValid(d.rulesetSwitch) && d.rulesetSwitch.held) {
        current = d; clear(rows); clear(blockers); review.checked = false;
        if (S.meta) { S.meta.ruleset = null; S.meta.rulesetHeld = d.rulesetSwitch.held; }
        notice.textContent = "The game identity is held (" + d.rulesetSwitch.held + "). Restore the configured future profile or explicitly return to the current PvE Alliance identity; nothing can be published meanwhile. Stored selection custody is retained; a Return is available only when the server qualifies it.";
        drawSwitch(d.rulesetSwitch); buttons(); return;
      }
      if (!obj(d) || !switchValid(d.rulesetSwitch) || !profileValid(d.currentProfile) || d.futureSwitchAvailable !== false || d.automaticPublication !== false || !formValid(d.form) || !Array.isArray(d.targets) || d.targets.length !== 3 || !Array.isArray(d.blockingOperations) || d.blockingOperations.length > 3 || !d.blockingOperations.every(operationValid) ||
        !(d.selected === null || obj(d.selected) && token(d.selected.publicationId) && Number.isSafeInteger(d.selected.revision) && d.selected.revision > 0 && revisionValid(d.selected.profileRevision)) ||
        d.targets.some((t,i) => !obj(t) || t.target !== targets[i] || !id(t.channelId) || t.parentId !== t.channelId || !states.includes(t.state) || !(t.stage === null || ["pending", "create", "edit", "pin"].includes(t.stage)) || !(t.messageId === null || id(t.messageId)) || !obj(t.payload) || !Array.isArray(t.payload.embeds) || !obj(t.payload.allowed_mentions) || !Array.isArray(t.payload.allowed_mentions.parse) || t.payload.allowed_mentions.parse.length !== 0 || JSON.stringify(t.payload).length > 16000)) throw new ApiError(200, { error: "unreadable_answer" });
      if (S.meta && (M().rulesetHeld || !obj(M().ruleset) || M().ruleset.revision !== d.currentProfile.revision)) { S.meta.ruleset = d.currentProfile; S.meta.rulesetHeld = null; } // reconcile a lost switch answer through the authenticated status
      current = d; drawSwitch(d.rulesetSwitch);
      const selectedCurrent = d.selected?.profileRevision === d.currentProfile.revision, historical = !!d.selected && !selectedCurrent;
      if (pending && selectedCurrent && pending.profileRevision === d.currentProfile.revision && d.selected?.publicationId === pending.form.operationId) { sessionStorage.removeItem(key); pending = null; }
      review.checked = false; clear(rows); clear(blockers);
      notice.textContent = historicalPending() ? "Original selection for " + pending.profileRevision + " is retained and unconfirmed. The current profile differs; recording or applying a plan is blocked. Use an attended original-status check." : storageFailed ? "Original operation storage is unavailable or expired. Publication is held; use an attended status check." : pending ? "An original selection is unconfirmed. Retry that exact selection or refresh its status." : historical ? "Historical selection revision " + d.selected.revision + " · " + d.selected.profileRevision + ". The previews show current source " + d.currentProfile.revision + "; review and record its new plan before applying. Original message custody remains separate." : d.selected ? "Selected revision " + d.selected.revision + " · " + d.currentProfile.revision : "No publication revision selected. " + d.currentProfile.realm + " · " + d.currentProfile.ruleset + " · " + d.currentProfile.faction;
      for (const b of d.blockingOperations) {
        const input = h("input", { type: "text", "aria-label": "Held message ID for " + b.target, placeholder: "Original bot message ID or link", value: b.messageId || "" });
        add(blockers, frame("Original held operation: " + b.target, null, h("p", { text: "Revision " + b.revision + " · " + b.publicationId + " · " + b.state + " · channel " + b.channelId }), input,
          h("button", { class: "btn small", type: "button", text: "Check original held message", onclick: () => action("reconcile", b, input) })));
      }
      for (const t of d.targets) {
        const operation = { ...t, publicationId: d.selected?.publicationId }, blocked = d.blockingOperations.some(b => b.target === t.target);
        add(rows, frame(t.target, h("span", { class: "badge", text: historical ? "Historical state: " + t.state : t.state }), h("p", { class: "small", text: "Destination channel " + t.channelId + (d.selected ? " · operation " + d.selected.publicationId : "") }),
          h("details", null, h("summary", { text: historical ? "Current source preview · historical state is separate" : "Exact approved Discord payload" }), h("pre", { class: "details ruleset-payload-preview", text: JSON.stringify(t.payload, null, 2) })),
          t.messageId ? h("p", { text: (historical ? "Historical message " : "Known message ") + t.messageId }) : null,
          operationControls(operation, selectedCurrent && !blocked && ["pending", "known", "refused"].includes(t.state))));
      }
      buttons();
    };
    const load = async () => {
      if (busy || !live()) return; busy = true; buttons();
      try { const d = await api("GET", path, undefined, { live }); if (live()) draw(d); }
      catch { if (live()) { current = null; clear(rows); clear(blockers); notice.textContent = "Publication status is unavailable or unqualified. No action is enabled."; } }
      finally { busy = false; if (live()) buttons(); }
    };
    select.addEventListener("click", async () => {
      if (select.disabled || busy || !current || !live()) return;
      const exact = pending || { profileRevision: current.currentProfile.revision, form: current.form };
      try { sessionStorage.setItem(key, JSON.stringify(exact)); pending = exact; } catch { storageFailed = true; buttons(); notice.textContent = "The original selection could not be preserved. Nothing was sent."; return; }
      busy = true; buttons();
      try { const r = await api("POST", path + "/select", exact, { live }); if (!live()) return; if (!obj(r) || r.publicationId !== exact.form.operationId || !Number.isSafeInteger(r.revision)) throw new ApiError(200, { error: "unreadable_answer" }); sessionStorage.removeItem(key); pending = null; }
      catch { if (live()) notice.textContent = "The original selection remains unconfirmed. Refresh or retry only that exact operation."; }
      finally { busy = false; }
      if (live()) await load();
    });
    review.addEventListener("change", buttons); refresh.addEventListener("click", load); buttons(); await load();
  }

  // ---------- news (.115) ----------
  /**
   * .115 (Viktor's item A, 2 Oct 2026): the administrators' notices for Community → News (the Worker's site-news.ts). Plain
   * text for the whole guild, shown 1 to 90 days and then deleted; the switch itself is in Settings. A new notice is an
   * operation with an id this page made once: its lost answer freezes the exact payload and offers only "retry the same" or a
   * check (.100/.103), and the Worker never posts a deleted or expired notice again. A change or a deletion carries the
   * notice's revision, so a repeat after a lost answer is refused, never doubled; the page then re-reads the list.
   */
  const NEWS_LOST_CHANGE = "The answer was lost, so the notices were re-read: check the notice before changing it again (a repeated change with the old revision is refused, never doubled).";
  function newsWebhookControls(notice, retainedOnly = false) {
    const owner=S.user, route=currentRoute(), path="/api/news/editor/webhook/";
    let busy=false, snapshot=null, attempted=false;
    const root=h("div",{class:"stack mt-s news-webhook196"}), content=h("div",{class:"stack"}), state=h("p",{class:"small muted",role:"status","aria-live":"polite"});
    const read=h("button",{type:"button",class:"btn small",text:retainedOnly?"Review retained Discord cross-post":"Review optional Discord cross-post"});
    const live=()=>S.user===owner&&S.signedIn&&!S.denied&&currentRoute()===route&&app.contains(root);
    const draw=d=>{
      clear(content); snapshot=d;
      const destination=v=>v&&typeof v.guild==="string"&&typeof v.channel==="string"&&/^\d{17,20}$/.test(v.guild)&&/^\d{17,20}$/.test(v.channel);
      const revision=v=>Number.isSafeInteger(v)&&v>0;
      const payload=d?.payload, payloadValid=payload&&Array.isArray(payload.embeds)&&payload.embeds.length===1&&typeof payload.embeds[0].title==="string"&&typeof payload.embeds[0].description==="string"&&Array.isArray(payload.allowed_mentions?.parse)&&payload.allowed_mentions.parse.length===0;
      if(!d||d.id!==notice.id||d.revision!==notice.revision||typeof d.canPublish!=="boolean"||typeof d.enabled!=="boolean"||typeof d.cleanupOnly!=="boolean"||typeof d.removalPending!=="boolean"||!["not_published","claimed","unknown","known","cleaning","removed","refused"].includes(d.state)||!(d.destination===null||destination(d.destination))||!(d.cleanupRevision===null&&d.cleanupDestination===null||revision(d.cleanupRevision)&&destination(d.cleanupDestination))||!(payload===null||payloadValid)||d.canPublish&&(!d.enabled||d.cleanupOnly||!destination(d.destination)||!payloadValid||typeof d.confirmation!=="string"||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=nowSec()))throw Error("Unreadable cross-post preview");
      add(content,h("p",{class:"small",text:(d.destination?"Fixed Discord destination: server "+d.destination.guild+" · channel "+d.destination.channel+". ":"")+"Outcome: "+d.state+(d.removalPending?" · removal pending":"")+"."}));
      if(payloadValid)add(content,h("details",null,h("summary",{text:"Current saved notice · revision "+notice.revision}),h("h4",{text:payload.embeds[0].title}),h("p",{class:"prewrap small",text:payload.embeds[0].description})));
      if(d.cleanupRevision!==null)add(content,h("p",{class:"small",text:"Original cross-post revision "+d.cleanupRevision+" · removal destination: server "+d.cleanupDestination.guild+" · channel "+d.cleanupDestination.channel+"."}));
      add(content,h("p",{class:"small muted",text:d.cleanupOnly||retainedOnly?"This view permits original-copy cleanup only. It authorizes no new send.":"No mentions are sent. Publishing is optional and sends one copy of this saved revision. An unknown send remains spent; editing requires old-copy cleanup and a new explicit preview."}));
      const confirm=h("input",{type:"checkbox"}),publish=h("button",{type:"button",class:"btn small",text:"Publish this exact Discord cross-post",disabled:true});
      confirm.addEventListener("change",()=>{publish.disabled=busy||attempted||!confirm.checked||!d.enabled||!d.canPublish||typeof d.confirmation!=="string"||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=nowSec();});
      publish.addEventListener("click",async()=>{
        if(!live()||retainedOnly||busy||publish.disabled||snapshot!==d||d.expiresAt<=nowSec())return;
        attempted=true;busy=true;publish.disabled=true;read.disabled=true;
        try{const out=await api("POST",path+"publish",{confirmation:d.confirmation,confirm:true},{live});if(live())state.textContent="Original cross-post outcome: "+String(out.state||"unconfirmed")+". Review its status before another action.";}
        catch(error){if(live()){
          const code=codeOf(error),outcome=error?.data?.state;
          if(outcome==="refused")state.textContent="Discord refused this send. This revision remains spent; review its original status and edit the notice before a new publication.";
          else if(outcome==="known")state.textContent="A Discord copy was recorded but was not accepted as current. Removal was requested; review the original cleanup state.";
          else if(["explicit_confirmation_required","news_webhook_confirmation_invalid","news_webhook_confirmation_spent_or_changed","news_webhook_destination_unconfirmed","news_webhook_claim_refused","slow_down"].includes(code))state.textContent="This request was refused before a new send. Review the original status or open a fresh preview; any earlier uncertain copy remains held.";
          else state.textContent="The original send is unconfirmed and must not be repeated. Review the original status; an absent pointer does not prove no message was sent.";
        }}
        finally{busy=false;if(live()){read.disabled=false;clear(content);snapshot=null;}}
      });
      if(!retainedOnly&&d.canPublish&&!attempted)add(content,[h("label",null,confirm," I reviewed this saved notice and exact destination."),publish]);
      const removeConfirmed=h("input",{type:"checkbox"}),remove=h("button",{type:"button",class:"btn small",text:"Request cross-post removal",disabled:true});
      removeConfirmed.addEventListener("change",()=>{remove.disabled=busy||!removeConfirmed.checked;});
      const removal=async sub=>{
        if(!live()||busy||snapshot!==d||!revision(d.cleanupRevision)||!destination(d.cleanupDestination))return;busy=true;read.disabled=true;remove.disabled=true;
        try{const out=await api("POST",path+sub,{id:notice.id,revision:d.cleanupRevision},{live});if(live())state.textContent="Original cleanup state: "+String(out.state||"unconfirmed")+". Unknown outcomes remain held; no copy is resent.";}
        catch{if(live())state.textContent="Cleanup is unconfirmed. Review the original state; no copy was resent.";}
        finally{busy=false;if(live()){read.disabled=false;clear(content);snapshot=null;}}
      };
      remove.addEventListener("click",()=>{if(!remove.disabled)removal("revoke");});
      if(d.cleanupRevision!==null&&!["not_published","removed","refused"].includes(d.state))add(content,[h("label",null,removeConfirmed," I intend to remove the original Discord cross-post."),remove]);
      if(d.removalPending&&d.cleanupRevision!==null)add(content,h("button",{type:"button",class:"btn small",text:"Continue requested removal",onclick:()=>removal("reconcile")}));
    };
    read.addEventListener("click",async()=>{
      if(!live()||busy)return;busy=true;read.disabled=true;clear(content);snapshot=null;
      try{const d=await api("GET",path+"preview?id="+encodeURIComponent(notice.id)+"&revision="+notice.revision,undefined,{live});if(live()){draw(d);state.textContent="Preview and original status only. No cross-post was sent.";}}
      catch(error){if(live())state.textContent=explain(error,"Optional cross-posting is unavailable. No message was sent.");}
      finally{busy=false;if(live())read.disabled=false;}
    });
    add(root,[read,state,content]);return root;
  }
  function retainedNewsWebhookControls() {
    const owner=S.user,route=currentRoute(),root=h("div",{class:"stack news-webhook-retained196"}),list=h("div",{class:"stack"});
    const status=h("p",{class:"small muted",role:"status","aria-live":"polite",text:"Read original Discord cross-post custody, including notices no longer shown. No message is sent by this read."});
    const read=h("button",{type:"button",class:"btn small",text:"Read retained cross-posts"}),next=h("button",{type:"button",class:"btn small",text:"Next retained cross-posts",disabled:true});
    let busy=false,cursor=null,invalidTotal=0;
    const live=()=>S.user===owner&&S.signedIn&&!S.denied&&currentRoute()===route&&app.contains(root);
    const validId=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{22}$/.test(v);
    const load=async after=>{
      if(!live()||busy)return;busy=true;read.disabled=true;next.disabled=true;clear(list);
      try{
        const d=await api("GET","/api/news/editor/webhook/retained"+(after?"?after="+encodeURIComponent(after):""),undefined,{live});
        if(!live())return;
        const destination=v=>v&&typeof v.guild==="string"&&typeof v.channel==="string"&&/^\d{17,20}$/.test(v.guild)&&/^\d{17,20}$/.test(v.channel);
        if(!d||d.readOnly!==true||d.limit!==50||!Array.isArray(d.records)||d.records.length>50||d.returnedCount!==d.records.length||!Number.isSafeInteger(d.inspectedCount)||d.inspectedCount<d.records.length||d.inspectedCount>50||!Number.isSafeInteger(d.invalidCount)||d.invalidCount<0||d.invalidCount>d.inspectedCount||typeof d.complete!=="boolean"||typeof d.exhausted!=="boolean"||typeof d.truncated!=="boolean"||!(d.nextCursor===null||validId(d.nextCursor))||d.exhausted!==(d.nextCursor===null)||d.complete!==(d.exhausted&&d.invalidCount===0)||d.truncated!==!d.exhausted||after&&d.nextCursor!==null&&d.nextCursor<=after||new Set(d.records.map(x=>x?.id)).size!==d.records.length||d.records.some(x=>!x||!validId(x.id)||after&&x.id<=after||!Number.isSafeInteger(x.cleanupRevision)||x.cleanupRevision<1||!destination(x.cleanupDestination)||!["claimed","unknown","known","cleaning"].includes(x.state)||typeof x.removalPending!=="boolean"||typeof x.uncertain!=="boolean"))throw Error("Unreadable retained cross-post list");
        invalidTotal=(after?invalidTotal:0)+d.invalidCount;
        cursor=d.nextCursor;
        for(const n of d.records)add(list,h("div",{class:"card"},h("h3",{text:"Original cross-post · "+n.id}),h("p",{class:"small",text:"Revision "+n.cleanupRevision+" · "+n.state+(n.removalPending?" · removal pending":"")+" · server "+n.cleanupDestination.guild+" · channel "+n.cleanupDestination.channel}),newsWebhookControls({id:n.id,revision:n.cleanupRevision},true)));
        status.textContent=d.records.length+" original cross-posts on this page. "+(d.exhausted?"End of this traversal.":"More retained entries remain; use Next.")+(invalidTotal?" "+invalidTotal+" unreadable entries were refused during this traversal; it is incomplete and requires attended review.":"")+" This is current retained custody, not complete publication history.";
      }catch(e){if(live()){cursor=null;status.textContent=explain(e,"Retained cross-posts could not be read. No message was sent.");}}
      finally{busy=false;if(live()){read.disabled=false;next.disabled=cursor===null;}}
    };
    read.addEventListener("click",()=>load(null));next.addEventListener("click",()=>{if(cursor!==null)load(cursor);});
    add(root,[status,h("div",{class:"btn-row"},read,next),list]);return root;
  }
  async function adminNews(body, message = "", endpoint = "/api/admin/news") {
    let d;
    try {
      d = await api("GET", endpoint);
    } catch (e) {
      clear(body);
      add(body, frame("News", null, h("p", { class: "err small", role: "alert", text: explain(e, "The notices could not be read.") })));
      if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
      return;
    }
    const limits = d.limits || {};
    const dayList = Array.isArray(limits.days) ? limits.days : [1, 3, 7, 14, 30, 60, 90];
    const notices = Array.isArray(d.notices) ? d.notices : [];
    const opId = d.opId; // fixed for this page's new notice: a retry after a lost answer replays the same creation. The Worker hands it out with its time in it and takes it for 30 days (Codex's finding 5, 3 Oct 2026)
    let frozen = null; // .103: the exact payload whose answer was lost
    let editing = null; // the notice being changed, or null for a new one
    const title = h("input", { type: "text", maxlength: String(limits.titleMax || 80), autocomplete: "off" });
    const text = h("textarea", { rows: "6", maxlength: String(limits.bodyMax || 2000) });
    const daysSel = h("select", null, dayList.map((n) => h("option", { value: String(n), text: plural(n, "day"), selected: n === (limits.defaultDays || 30) })));
    const formTitle = h("h2", { text: "New notice" });
    const submit = h("button", { class: "btn", type: "button", text: "Post notice" });
    const stopEdit = h("button", { class: "btn small", type: "button", text: "Cancel editing", hidden: true });
    const err = errorLine(""); err.hidden = true;
    const pending = h("div");
    // Item 29: an attended writing aid only; it cannot replace a draft or change a pending operation.
    const brief = h("button", { class: "btn small", type: "button", text: "Start a Daily Brief" });
    let locked = false;
    const updateBrief = () => { brief.disabled = locked || !d.newsOn || !!editing || !!frozen || title.value !== "" || text.value !== ""; };
    const touched = () => { setDirty("admin-news", true); updateBrief(); };
    title.addEventListener("input", touched);
    text.addEventListener("input", touched);
    brief.addEventListener("click", () => {
      updateBrief();
      if (brief.disabled) return;
      title.value = "Daily Brief — " + new Date(nowMs()).toISOString().slice(0, 10) + " (UTC)";
      text.value = "Summary\n[The main update in your own words.]\n\nGuild updates\n[Confirmed decisions and practical details.]\n\nComing up\n[Event, date, time and time zone.]\n\nSources\n[Original source, date and full URL for each report.]\n\nCorrections\n[Any correction to an earlier brief, or None.]";
      touched();
      text.focus();
      text.setSelectionRange?.(0, 0);
      text.scrollTop = 0;
    });
    const lock = (on) => { locked = on; for (const el of [title, text, daysSel, submit, stopEdit]) el.disabled = on || !d.newsOn; updateBrief(); };
    const fail = (ex, fallback) => {
      err.textContent = explain(ex, fallback);
      err.hidden = false;
      if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
    };
    const again = (note) => { setDirty("admin-news", false); return adminNews(body, note, endpoint); };
    const send = async (payload) => {
      const out = await api("POST", endpoint, payload);
      if (!out || !out.notice || out.notice.id !== payload.id) throw new ApiError(200, { error: "unreadable_answer" }); // the answer is THIS operation's notice before anything is shown as posted
      toast(out.replay ? "This notice was already posted from this page." : "Posted.", "good");
      await again();
    };
    const refusedCreate = async (ex) => {
      // this page's operation is spent (its notice was deleted or ran out, another notice holds the id, or the id is too old to
      // post): a fresh page gets a fresh id, and the old text is not left in the form to be posted again by a second click
      if (["deleted", "expired", "op_conflict", "stale_page"].includes(codeOf(ex))) { await again(`${explain(ex)} The page has been reloaded for a new notice.`); return; }
      lock(false);
      fail(ex, "The notice could not be posted.");
    };
    const create = async () => {
      const payload = { id: opId, title: title.value.trim(), body: text.value, days: Number(daysSel.value) };
      lock(true);
      try { await send(payload); } catch (ex) {
        if (!uncertain(ex)) { await refusedCreate(ex); return; }
        frozen = payload;
        lostAnswer({ pending, lock, what: "The notice",
          unprovenMessage: "No live notice is shown under this form's id. It may never have been stored, or it may have been deleted or expired. Retry the same operation to check its status.",
          retry: async () => { try { await send(frozen); return "done"; } catch (ex2) { if (uncertain(ex2)) return "lost"; frozen = null; clear(pending); await refusedCreate(ex2); return "done"; } },
          check: async () => {
            try {
              const l = await api("GET", endpoint);
              if (l && Array.isArray(l.notices) && l.notices.some((x) => x.id === opId)) { toast("It was stored.", "good"); await again(); return "found"; }
              // This list contains live notices only. Absence does not prove that the operation was never stored:
              // its deleted/expired notice may still have a tombstone. Keep the frozen operation and its retry.
              return "unproven";
            } catch { return "lost"; }
          } });
      }
    };
    const change = async () => {
      const n = editing, days = Number(daysSel.value);
      if (!(await confirmBox("Save the changes to this notice?", `"${title.value.trim() || n.title}" changes on News at once. It is shown until ${fmtDay(n.postedAt + days * 86400)}, counted from when it was first posted.`, "Save changes"))) return;
      lock(true);
      try {
        const out = await api("POST", endpoint + "/update", { id: n.id, revision: n.revision, title: title.value.trim(), body: text.value, days });
        if (!out || !out.notice || out.notice.id !== n.id) throw new ApiError(200, { error: "unreadable_answer" });
        toast("Saved.", "good");
        await again();
      } catch (ex) {
        if (uncertain(ex)) { await again(NEWS_LOST_CHANGE); return; }
        if (codeOf(ex) === "stale_revision" || codeOf(ex) === "not_found") { await again(`${explain(ex)} The list below has been reloaded.`); return; }
        lock(false);
        fail(ex, "The notice could not be changed.");
      }
    };
    const remove = (n) => async () => {
      if (!(await confirmBox("Delete this notice?", `"${n.title}" disappears from News at once. A page opened earlier cannot post it again: a page posts only within 30 days of being opened, and this notice's id is kept for 120 days from its first posting.`, "Delete", { danger: true }))) return;
      try {
        await api("POST", endpoint + "/delete", { id: n.id, revision: n.revision });
        toast("Deleted.", "good");
        await again();
      } catch (ex) {
        await again(uncertain(ex) ? NEWS_LOST_CHANGE : `${explain(ex, "The notice could not be deleted.")} The list below has been reloaded.`);
        if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
      }
    };
    const edit = (n) => () => {
      editing = n;
      formTitle.textContent = "Change a notice";
      title.value = n.title;
      text.value = n.body;
      const was = Math.round((n.until - n.postedAt) / 86400);
      daysSel.value = String(dayList.includes(was) ? was : limits.defaultDays || 30);
      submit.textContent = "Save changes";
      stopEdit.hidden = false;
      err.hidden = true;
      updateBrief();
    };
    submit.addEventListener("click", () => { if (frozen) return; err.hidden = true; return editing ? change() : create(); });
    stopEdit.addEventListener("click", () => again());
    lock(false);
    const list = notices.map((n) => h("div", { class: "card" },
      h("h3", { text: n.title }),
      h("p", { class: "small", text: n.body.length > 200 ? `${n.body.slice(0, 200)}…` : n.body }),
      h("p", { class: "muted small", text: `Posted ${fmtDateTime(n.postedAt)}${n.editedAt ? ` · changed ${fmtDateTime(n.editedAt)}` : ""} · shown until ${fmtDateTime(n.until)} · revision ${n.revision}` }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn small", type: "button", text: "Edit", disabled: !d.newsOn, onclick: edit(n) }),
        h("button", { class: "btn small danger", type: "button", text: "Delete", onclick: remove(n) })), newsWebhookControls(n)));
    clear(body);
    add(body, [
      message ? noticeBox("warn", "icon-warning", h("p", { text: message })) : null,
      frame("News", h("span", { class: "badge " + (d.newsOn ? "green" : "muted"), text: d.newsOn ? "on" : "off" }),
        h("p", { class: "muted small", text: "Community → News for guild members and site administrators: your notices, whether Olympus I has room, the guild in figures (counts only), the next events, when the leadership directory changed, the road to launch and the site's updates. Switch it in Admin → Settings." }),
        d.newsOn ? null : noticeBox("info", "icon-clock", h("p", { text: "News is switched off (Admin → Settings); notices cannot be posted while it is off." })),
        kv([["Shown now", `${notices.length} of ${limits.liveMax || 20}`], ["Past their time, awaiting the cleanup", String(d.awaitingCleanup || 0)], ["Operation records kept (120 days each)", String(d.operationRecords || 0)]])),
      frame("Notices shown now", null, list.length ? list : h("p", { class: "muted small", text: "No notice is shown right now." })),
      frame("Retained Discord cross-posts", null, retainedNewsWebhookControls()),
      frame(formTitle, null,
        h("p", { class: "muted small", text: "Write for the whole guild; do not name members. A notice is deleted when its time is up, at most 90 days after posting." }),
        h("div", { class: "btn-row" }, brief),
        h("p", { class: "muted small", text: "The Daily Brief starter fills a blank new notice. Replace its prompts with your own text and check dates and sources before posting." }),
        fieldBox("news-title", "Title", title, { required: true, hint: `Up to ${limits.titleMax || 80} characters.` }),
        fieldBox("news-body", "Text", text, { required: true, hint: `Up to ${limits.bodyMax || 2000} characters. A blank line starts a new paragraph.` }),
        fieldBox("news-days", "Show for", daysSel),
        err, h("div", { class: "btn-row" }, submit, stopEdit), pending),
    ]);
  }

  // ---------- applications ----------
  const applicationListReads = new WeakMap();
  async function adminApplications(body) {
    const f = A.apps;
    const sent = { ...f }, read = {};
    applicationListReads.set(body, read);
    const data = await api("GET", "/api/admin/applications?" + qs({ position: sent.position, backups: sent.position ? sent.backups : false, profession: sent.profession, status: sent.status, q: sent.q, offset: sent.offset, sort: sent.sort === "old" ? "old" : "" }));
    if (applicationListReads.get(body) !== read || !app.contains(body)) return;
    const position = h("select", { id: "application-filter-position" }, h("option", { value: "", text: "All positions" }), M().positions.map((p) => h("option", { value: p.key, text: p.label, selected: sent.position === p.key })));
    const profession = h("select", { id: "application-filter-profession" }, h("option", { value: "", text: "Any profession" }), (M().professions || []).map((p) => h("option", { value: p.key, text: p.label, selected: sent.profession === p.key })));
    const withBackups = h("input", { id: "application-filter-backups", type: "checkbox", checked: sent.backups });
    const status = h("select", { id: "application-filter-status" }, [["open", "Open (not decided yet)"], ["", "All"], ["submitted", "Submitted"], ["reviewing", "Under review"], ["accepted", "Accepted"], ["declined", "Not accepted"], ["withdrawn", "Withdrawn"], ["denied", "Denied accounts"]].map(([k, t]) => h("option", { value: k, text: t, selected: sent.status === k })));
    const search = h("input", { id: "application-filter-search", type: "search", value: sent.q, placeholder: "Name or character" });
    const sort = h("select", { id: "application-filter-sort" }, h("option", { value: "new", text: "Recently updated", selected: sent.sort !== "old" }), h("option", { value: "old", text: "Oldest first", selected: sent.sort === "old" }));
    const apply = () => { f.position = position.value; f.backups = withBackups.checked; f.profession = profession.value; f.status = status.value; f.q = search.value.trim(); f.sort = sort.value; f.offset = 0; adminApplications(body); };
    position.addEventListener("change", apply);
    profession.addEventListener("change", apply);
    withBackups.addEventListener("change", apply);
    status.addEventListener("change", apply);
    sort.addEventListener("change", apply);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    const rows = data.items.map((it) => {
      const tr = h("tr", { class: "clickable" },
        h("td", { class: "wrap" }, h("a", { class: "application-open", href: `#/admin/applications/${it.user.id}`, title: "Open application" }, userCell(it.user))),
        h("td", { class: "wrap" }, applicationBadges199(it.answers), h("span", { class: "nowrap" }, posIcon(firstChoiceKey(it), "s"), " ", roleName(firstChoiceKey(it))), (it.backups || []).length ? h("div", { class: "faint small", text: "then " + it.backups.map(roleName).join(", ") }) : null),
        h("td", null, it.class ? clsLabel(it.class) : null, h("div", { class: "small muted" }, roleIcon(it.role), " ", labelOf(M().roles, it.role))),
        h("td", null, fitView(it.fit, { compact: true })),
        h("td", null, h("span", { class: "status " + (it.user.denied ? "denied" : it.status), text: it.user.denied ? "Denied" : statusText(it.status) })),
        h("td", { class: "nowrap", text: it.user.accountCreated ? plural(days(it.user.accountCreated), "day") : "?" }),
        h("td", { class: "nowrap", text: it.user.serverJoined ? plural(days(it.user.serverJoined), "day") : "?" }),
        h("td", { class: "nowrap", text: ago(it.updatedAt) }));
      tr.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("a")) return; location.hash = `#/admin/applications/${it.user.id}`; });
      return tr;
    });
    const pager = h("div", { class: "pager" },
      h("span", { class: "muted small", text: data.total ? `${data.offset + 1}–${data.offset + data.items.length} of ${data.total}` : "Nothing matches." }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn small", type: "button", text: "Previous", disabled: data.offset === 0, onclick: () => { f.offset = Math.max(0, f.offset - data.pageSize); adminApplications(body); } }),
        h("button", { class: "btn small", type: "button", text: "Next", disabled: data.offset + data.items.length >= data.total, onclick: () => { f.offset += data.pageSize; adminApplications(body); } })));
    const filterSummary = [sent.position ? roleName(sent.position) + (sent.backups ? " (including backups)" : " (first choice)") : "", sent.profession ? labelOf(M().professions || [], sent.profession) : "", sent.status === "open" ? "Open applications" : sent.status ? statusText(sent.status) : "All statuses", sent.q ? "Search: “" + sent.q + "”" : "", sent.sort === "old" ? "Oldest first" : "Recently updated"].filter(Boolean).join(" · ");
    const filterState = adminFilterState(body, !!(sent.position || sent.profession || sent.q || sent.status !== "open" || sent.sort === "old"));
    const filters = h("details", { class: "admin-filter-panel" }, h("summary", { text: "Filter and sort applications — " + filterSummary }), h("div", { class: "filters" },
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Position" }), position),
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Profession" }), profession),
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Status" }), status),
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Search (Enter)" }), search),
        h("label", { class: "field narrow" }, h("span", { class: "lab small", text: "Order" }), sort),
        h("label", { class: "check", hidden: !sent.position }, withBackups, h("span", { class: "small", text: "Backup choices count too" }))));
    filters.open = filterState.open;
    clear(body);
    add(body, frame("Applications", null, filters,
      h("p", { class: "table-scroll-hint small muted", text: "Scroll sideways to see every column." }),
      h("div", { class: "table-wrap" }, h("table", { class: "data admin-applications" },
        h("thead", null, h("tr", null, ["Applicant", "Applied for", "Class · role", "Raid evenings", "Status", "Account age", "In the server", "Updated"].map((t) => h("th", { text: t })))),
        h("tbody", null, rows))),
      pager));
    restoreAdminFilterFocus(body, filterState);
  }

  async function adminApplication(body, id) {
    let d;
    try { d = await api("GET", `/api/admin/applications/${encodeURIComponent(id)}`); }
    catch (err) {
      if (!app.contains(body) || err && err.status === 401) return;
      const held = err && err.status === 409 && codeOf(err) === "original_membership_decision_held";
      clear(body);
      add(body, frame(held ? "Application temporarily held" : "Application could not be opened", h("a", { class: "btn small", href: "#/admin/applications", text: "Back to all applications" }),
        noticeBox("warn", "icon-warning", h("p", { text: held
          ? "The original membership decision for this account could not be safely confirmed. Its application details remain withheld. Return to the list and ask the site administrator to review the existing decision; no access or decision has been changed."
          : "This application could not be read. Return to the list and try again. No changes were made." }))));
      return;
    }
    if (!app.contains(body)) return;
    const u = d.user;
    const a = d.application;
    const acct = d.account;
    const note = h("textarea", { rows: "3", maxlength: "1000" });
    if (a) note.value = a.adminNote || "";
    const setStatus = async (status) => {
      try {
        await api("POST", `/api/admin/applications/${id}/status`, { status, note: note.value });
        toast(`Marked ${statusText(status).toLowerCase()}.`, "good");
        adminApplication(body, id);
      } catch (err) { toast(err.message, "bad"); }
    };
    const denyBtn = u.denied
      ? h("button", { class: "btn", type: "button", text: "Lift the denial", onclick: async () => {
          if (!(await confirmBox("Lift the denial?", "They can use the site again. Reserved names released by the denial stay released.", "Lift it"))) return;
          try { await api("POST", `/api/admin/users/${id}/undeny`); toast("Denial lifted."); adminApplication(body, id); } catch (err) { toast(err.message, "bad"); }
        } })
      : h("button", { class: "btn danger", type: "button", text: "Deny permanently", onclick: async () => {
          const reason = await promptBox("Deny permanently", "For joke, troll or abusive applications. They are signed out, cannot save anything again, their votes stop counting, their application leaves the board, and their reserved names are released.", "Reason (only site admins see it; an officer's lookup shows only that the account was denied)", "Deny permanently", { danger: true });
          if (reason === null) return;
          try { await api("POST", `/api/admin/users/${id}/deny`, { reason }); toast("Denied."); adminApplication(body, id); } catch (err) { toast(err.message, "bad"); }
        } });
    const deleteBtn = h("button", { class: "btn danger", type: "button", text: "Delete their site data", onclick: async () => {
      const mentions = h("input", { type: "checkbox", checked: true });
      const extra = h("label", { class: "check field" }, mentions, h("span", null, "Also remove other members' write-ins, friends-list entries and references that name this account", h("span", { class: "hint", text: "Their Discord name, with any reason or note written about them. Leave it ticked for a request to be forgotten." })));
      if (!(await confirmBox("Delete everything the site holds about this account?", "For a request to be forgotten. Their application, votes, write-ins, friends list and reserved names are removed, votes others cast on their application too, and they are signed out. Names already in the invite queue are taken out of it. A permanent denial is kept (only the id and the decision). This cannot be undone.", "Delete their data", { danger: true, typeToConfirm: "DELETE", extra }))) return;
      try { await api("POST", `/api/admin/users/${id}/delete`, { mentions: mentions.checked }); toast("Their site data is deleted.", "good"); location.hash = "#/admin/applications"; } catch (err) { toast(err.message, "bad"); }
    } });
    const list = (items, fn, empty) => (items && items.length ? h("div", { class: "stack" }, items.map(fn)) : h("p", { class: "muted small", text: empty }));
    // A role without a public vote has no board: listed only with votes from before it was taken off the vote.
    const boardRows = (d.board || []).filter((b) => !noVoteFor(b.role) || b.yes || b.no);
    clear(body);
    add(body, [
      h("p", null, h("a", { href: "#/admin/applications", text: "Back to all applications" })),
      frame(h("h2", null, discordAvatar(u, { class: "av", width: "32", height: "32" }), discordIdentity(u) || u.label),
        h("span", null, u.denied ? h("span", { class: "badge red", text: "Denied" }) : a ? h("span", { class: "status " + a.status, text: statusText(a.status) }) : h("span", { class: "badge muted", text: "No application" })),
        h("dl", { class: "kv" },
          h("dt", { text: "Discord id" }), h("dd", { text: u.id }),
          h("dt", { text: "Account age" }), h("dd", { text: ageText(u.accountCreated) }),
          h("dt", { text: "In Asmongold's server" }), h("dd", { text: u.inServer ? ageText(u.serverJoined) : "left the server" }),
          u.denied ? h("dt", { text: "Denied because" }) : null, u.denied ? h("dd", { text: u.deniedReason || "(no reason given)" }) : null,
          h("dt", { text: "Linked characters" }), h("dd", { text: acct.characters.length ? acct.characters.map((c) => `${c.name} (${c.status})`).join(", ") : "none" }),
          acct.member && acct.member.banned ? h("dt", { text: "Bot" }) : null, acct.member && acct.member.banned ? h("dd", { text: `banned from verifying${acct.member.banReason ? ": " + acct.member.banReason : ""}` }) : null),
        h("div", { class: "rule" }),
        a ? applicationSummary(a) : h("p", { class: "muted", text: "Signed in, no application." }),
        h("div", { class: "rule" }),
        h("label", { class: "field" }, h("span", { class: "lab", text: "Admin note (private)" }), note),
        h("div", { class: "btn-row" },
          a ? h("button", { class: "btn", type: "button", text: "Under review", onclick: () => setStatus("reviewing") }) : null,
          a ? h("button", { class: "btn", type: "button", text: "Accept", onclick: () => setStatus("accepted") }) : null,
          a ? h("button", { class: "btn", type: "button", text: "Not accepted", onclick: () => setStatus("declined") }) : null,
          a && a.status !== "submitted" ? h("button", { class: "btn", type: "button", text: "Back to submitted", onclick: () => setStatus("submitted") }) : null,
          a ? h("button", { class: "btn", type: "button", text: "Save note", onclick: () => setStatus(a.status) }) : null),
        h("div", { class: "rule" }),
        h("div", { class: "btn-row" }, denyBtn, deleteBtn)),
      frame("On the voting board", h("span", { class: "aside", text: `They voted on ${plural(d.boardVotesCast || 0, "applicant")}` }),
        boardRows.length
          ? h("div", null, h("p", { class: "table-scroll-hint small muted", text: "Scroll sideways to see every voting column." }), h("div", { class: "table-wrap" }, h("table", { class: "data admin-application-board" },
              h("thead", null, h("tr", null, h("th", { text: "Role" }), h("th", { text: "Their choice" }), h("th", { class: "num", text: "For" }), h("th", { class: "num", text: "Against" }), h("th", { text: "" }))),
              h("tbody", null, boardRows.map((b) => {
                const tr = h("tr", { class: "clickable" },
                  h("td", null, h("a", { class: "admin-board-role", href: `#/admin/votes/${encodeURIComponent(b.role)}`, "aria-label": `Open ${b.label} voting details` }, posIcon(b.role, "s"), h("span", { class: "admin-board-role-label", text: b.label }), noVoteFor(b.role) ? h("span", { class: "badge muted", text: "no public vote" }) : null)),
                  h("td", { text: b.choice === 1 ? "First" : b.choice === 2 ? "Second" : b.choice === 3 ? "Third" : "no longer chosen" }),
                  h("td", { class: "num yes", text: String(b.yes) }), h("td", { class: "num no", text: String(b.no) }),
                  h("td", null, splitBar(b.yes, b.no)));
                tr.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("a")) return; location.hash = `#/admin/votes/${encodeURIComponent(b.role)}`; });
                return tr;
              })))))
          : h("p", { class: "muted small", text: a && choicesOf(a).some(noVoteFor) ? "Not on the board: the leadership roles chosen have no public vote." : "Not on the board: no leadership role chosen." }),
        a && !a.boardAt && (a.status === "submitted" || a.status === "reviewing") && choicesOf(a).some(votedKey)
          ? h("p", { class: "muted small", text: "Their application is not on the board: they have not agreed to it (it was saved before the board covered one of its roles)." }) : null,
        h("p", { class: "muted small", text: "Counts from voters who are not denied and still in the server." })),
      h("section", { class: "grid two" },
        frame("Their friends list", null, list(d.friends, (p) => personRow(p, { note: p.note ? h("small", { text: " — " + p.note }) : null }), "Nobody listed.")),
        frame("Listed as a friend by", null, list(d.listedBy, (p) => h("div", { class: "person" }, h("div", { class: "nm" }, h("a", { href: `#/admin/applications/${p.id}`, text: p.label }), p.note ? h("small", { text: " — " + p.note }) : null)), "Nobody."))),
      h("section", { class: "grid two" },
        frame("Written in for", null, list(d.nominated, (n) => h("div", { class: "person" }, h("div", { class: "nm" }, h("a", { href: `#/admin/votes/${encodeURIComponent(n.ballot)}`, text: n.label })), h("span", { class: "badge", text: plural(n.n, "write-in") })), "No write-ins (counting accounts that are not denied).")),
        frame("Their own write-ins", null, list(d.votesCast, (v) => h("div", { class: "person" }, h("div", { class: "nm" }, h("b", { text: v.label }), h("small", { text: `${roleName(v.ballot)}${v.slot > 1 ? `, choice ${v.slot}` : ""}${v.reason ? " — " + v.reason : ""}` }))), "None."))),
      frame("Reserved names", null, list(acct.site.reserved, (r) => h("div", { class: "person" }, h("div", { class: "nm" }, h("b", { text: r.name })), h("span", { class: "badge", text: r.status })), "None entered.")),
    ]);
  }

  // ---------- votes: the board and write-ins, per role ----------
  function voteFilters(onChange) {
    const f = A.votes;
    const num = (key, label) => {
      const i = h("input", { type: "number", min: "0", max: "3650", step: "1", value: String(f[key] || 0) });
      i.addEventListener("change", () => { f[key] = Math.max(0, parseInt(i.value, 10) || 0); onChange(); });
      return h("label", { class: "field narrow" }, h("span", { class: "lab small", text: label }), i);
    };
    const chk = (key, label) => {
      const i = h("input", { type: "checkbox", checked: f[key] });
      i.addEventListener("change", () => { f[key] = i.checked; onChange(); });
      return h("label", { class: "check" }, i, h("span", { class: "small", text: label }));
    };
    return h("div", null,
      h("div", { class: "filters" }, num("minAccountDays", "Account at least (days)"), num("minServerDays", "In the server at least (days)")),
      h("div", { class: "btn-row" }, chk("includeDenied", "Count denied accounts"), chk("includeLeft", "Count people who left the server"), chk("onlyApplicants", "Only voters who applied")));
  }
  async function adminVotes(body) {
    const [board, writeIn] = await Promise.all([api("GET", "/api/admin/board?" + qs(A.votes)), api("GET", "/api/admin/votes?" + qs(A.votes))]);
    const wi = Object.fromEntries(writeIn.ballots.map((b) => [b.key, b]));
    const card = (b) => {
      const w = wi[b.key] || { top: [], voters: 0 };
      const quiet = noVoteFor(b.key);
      return h("a", { class: "card", href: `#/admin/votes/${encodeURIComponent(b.key)}` },
        h("div", { class: "card-head" }, posIcon(b.key), h("h3", { text: b.label })),
        // A role without a public vote has no board: how many are "on" it would only count those who agreed for other roles.
        quiet ? null : h("p", { class: "muted small", text: `${plural(b.applicants, "applicant")} on the board · ${plural(b.voters, "voter")}` }),
        appointedTo(b.key) ? h("p", { class: "small appointed-line" }, tick(), appointmentLabelNode(b.key)) : null,
        quiet ? h("p", { class: "small novote-line" }, crown(), "No public vote: its applicants are on the Applications tab") : null,
        b.top.length ? h("div", { class: "tally-top" }, b.top.map((t) => h("div", null, h("span", { text: t.label }), h("span", { class: "nowrap" }, h("span", { class: "yes", text: `+${t.yes}` }), " ", h("span", { class: "no", text: `−${t.no}` }))))) : h("p", { class: "faint small", text: "No board votes yet." }),
        w.top.length ? h("p", { class: "faint small mt-s", text: `Written in most: ${w.top.map((t) => `${t.label} (${t.votes})`).join(", ")}` }) : null);
    };
    clear(body);
    add(body, frame("Votes", null,
      h("p", { class: "muted small", text: "The voting board (for and against each applicant, per role) and the write-in nominations. Counts use the filters below: new accounts and people who joined the server recently can be set aside, which is how a wave of throwaway accounts shows up." }),
      voteFilters(() => adminVotes(body)),
      h("div", { class: "rule" }),
      h("div", { class: "grid three" }, board.roles.filter((b) => !b.key.startsWith("class_lead:")).map(card)),
      h("div", { class: "group-label", text: "Class leads" }),
      h("div", { class: "grid three" }, board.roles.filter((b) => b.key.startsWith("class_lead:")).map(card))));
  }
  async function adminRole(body, role) {
    const [data, wi] = await Promise.all([api("GET", "/api/admin/board?" + qs(Object.assign({ role }, A.votes))), api("GET", "/api/admin/votes?" + qs(Object.assign({ ballot: role }, A.votes)))]);
    // Without a public vote there is no board: only votes cast before it was taken off the vote are worth listing.
    const quiet = noVoteFor(role);
    const shown = quiet ? data.candidates.filter((c) => c.yes || c.no) : data.candidates;
    const boardRows = shown.map((c, i) => {
      const tr = h("tr", { class: "clickable" },
        h("td", { class: "num", text: String(i + 1) }),
        h("td", null, h("button", { class: "row-detail-open", type: "button", "aria-label": `Show votes for ${c.label}: ${data.role.label}`, onclick: () => showBoardVoters(data.role, c) }, discordAvatar(c, { class: "av", width: "32", height: "32" }), c.label), " ",
          c.denied ? h("span", { class: "badge red", text: "denied" }) : !c.onBoard ? h("span", { class: "badge muted", text: c.status ? `off the board: ${statusText(c.status).toLowerCase()}` : "off the board" }) : null),
        h("td", { text: c.choice === 1 ? "First" : c.choice === 2 ? "Second" : c.choice === 3 ? "Third" : "—" }),
        h("td", null, c.class ? clsLabel(c.class) : null),
        h("td", null, fitView(c.fit, { compact: true })),
        h("td", { class: "num yes", text: String(c.yes) }),
        h("td", { class: "num no", text: String(c.no) }),
        h("td", { class: "num", text: (c.yes - c.no > 0 ? "+" : "") + String(c.yes - c.no) }),
        h("td", null, splitBar(c.yes, c.no)));
      tr.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("a, button")) return; showBoardVoters(data.role, c); });
      return tr;
    });
    const max = wi.nominees && wi.nominees.length ? wi.nominees[0].votes : 1;
    const wiRows = (wi.nominees || []).map((n, i) => {
      const bar = h("div", { class: "bar" }, (() => { const x = h("i"); x.style.width = `${Math.round((n.votes / max) * 100)}%`; return x; })());
      const tr = h("tr", { class: "clickable" },
        h("td", { class: "num", text: String(i + 1) }),
        h("td", null,
          h("button", { class: "row-detail-open", type: "button", "aria-label": `Show write-ins for ${n.label}: ${wi.ballot.label}`, onclick: () => showVoters(wi.ballot, n) }, discordAvatar(n, { class: "av", width: "32", height: "32" }), n.label), " ",
          n.kind === "name" ? h("span", { class: "badge muted", text: "typed name" }) : n.signedUp ? h("span", { class: "badge", text: "signed up" }) : null, " ",
          // Not signed up here: the label is what voters' pages sent, so the id (and a lookup) is the check.
          n.kind === "discord" && !n.signedUp ? h("a", { class: "id", href: `#/admin/lookup/${n.key}`, title: "Look this account up", text: n.key, onclick: (e) => e.stopPropagation() }) : null, " ",
          n.appliedFor ? h("span", { class: "badge green", text: "applied: " + roleName(n.appliedFor) }) : null),
        h("td", { class: "num", text: String(n.votes) }),
        h("td", { class: "num", text: String(n.first) }),
        h("td", null, bar));
      tr.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("a, button")) return; showVoters(wi.ballot, n); });
      return tr;
    });
    clear(body);
    add(body, [
      h("p", null, h("a", { href: "#/admin/votes", text: "Back to all roles" })),
      frame(h("h2", null, posIcon(role, "s"), " ", data.role.label), h("span", { class: "aside", text: `${plural(data.voters, "voter")} on the board` }),
        appointedTo(role) ? noticeBox("ok", "icon-shield", h("p", null, h("strong", null, appointmentLabelNode(role, appointedTo(role), false, true), " "), "Members cannot choose this role, vote on it or write anyone in for it. The counts below are from before; they count again if you open the role in Settings.")) : null,
        noVoteFor(role) ? noticeBox("info", "icon-shield", h("p", null, h("strong", { text: "No public vote. " }), reservedKey201(role) ? "This reserved seat takes no new applications. Historical applicants remain on the " : "Members can apply for this role but cannot vote on it or write anyone in. Its applicants are on the ",
          h("a", { href: "#/admin/applications", text: "Applications tab", onclick: () => { Object.assign(A.apps, { position: role.startsWith("class_lead:") ? "class_lead" : role, backups: true, profession: "", status: "open", q: "", offset: 0 }); } }),
          ". Any counts below are from before; they count again if you untick the role in Settings.")) : null,
        voteFilters(() => adminRole(body, role)),
        h("div", { class: "rule" }),
        h("h3", { text: "The board" }),
        shown.length
          ? h("div", { class: "table-wrap" }, h("table", { class: "data" },
              h("thead", null, h("tr", null, h("th", { class: "num", text: "#" }), h("th", { text: "Applicant" }), h("th", { text: "Choice" }), h("th", { text: "Class" }), h("th", { text: "Raid evenings" }), h("th", { class: "num", text: "For" }), h("th", { class: "num", text: "Against" }), h("th", { class: "num", text: "Balance" }), h("th", { text: "" }))),
              h("tbody", null, boardRows)))
          : h("p", { class: "muted", text: quiet ? "No board votes from before it was taken off the vote." : "Nobody on the board for this role, and no votes with these filters." }),
        h("p", { class: "muted small", text: "Select an applicant to see who voted how. Applicants who left the board (withdrawn, decided, denied) stay listed with the votes they had." }),
        h("div", { class: "rule" }),
        h("h3", { text: "Write-in nominations" }),
        wiRows.length
          ? h("div", { class: "table-wrap" }, h("table", { class: "data" },
              h("thead", null, h("tr", null, h("th", { class: "num", text: "#" }), h("th", { text: "Written in" }), h("th", { class: "num", text: "Write-ins" }), h("th", { class: "num", text: "First choice" }), h("th", { text: "" }))),
              h("tbody", null, wiRows)))
          : h("p", { class: "muted", text: "No write-ins with these filters." }),
        h("p", { class: "muted small", text: "Select someone to see who wrote them in. A person typed by hand and the same person picked from Discord are counted separately." })),
    ]);
  }
  async function showBoardVoters(role, c) {
    const data = await api("GET", "/api/admin/board/voters?" + qs(Object.assign({ role: role.key, candidate: c.id }, A.votes)));
    dialog(h("div", null,
      h("h2", { text: `${c.label}: ${role.label}` }),
      h("p", { class: "small" }, h("span", { class: "yes", text: `${c.yes} for` }), " · ", h("span", { class: "no", text: `${c.no} against` })),
      h("div", { class: "table-wrap" }, h("table", { class: "data" },
        h("thead", null, h("tr", null, ["Voter", "Vote", "Account age", "In the server", "When"].map((t) => h("th", { text: t })))),
        h("tbody", null, data.voters.map((v) => h("tr", null,
          h("td", null, h("a", { href: `#/admin/applications/${v.id}`, onclick: () => { const d = document.querySelector("dialog"); if (d) d.close(); } }, userCell(v))),
          h("td", { class: v.vote > 0 ? "yes" : "no", text: v.vote > 0 ? "For" : "Against" }),
          h("td", { class: "nowrap", text: v.accountCreated ? plural(days(v.accountCreated), "day") : "?" }),
          h("td", { class: "nowrap", text: v.serverJoined ? plural(days(v.serverJoined), "day") : "?" }),
          h("td", { class: "nowrap", text: ago(v.votedAt) }))))))), { wide: true });
  }
  async function showVoters(ballot, n) {
    const data = await api("GET", "/api/admin/votes/voters?" + qs(Object.assign({ ballot: ballot.key, kind: n.kind, key: n.key }, A.votes)));
    dialog(h("div", null,
      h("h2", { text: `${n.label}: ${ballot.label}` }),
      h("div", { class: "table-wrap" }, h("table", { class: "data" },
        h("thead", null, h("tr", null, ["Voter", "Choice", "Account age", "In the server", "Why"].map((t) => h("th", { text: t })))),
        h("tbody", null, data.voters.map((v) => h("tr", null,
          h("td", null, h("a", { href: `#/admin/applications/${v.id}`, onclick: () => { const d = document.querySelector("dialog"); if (d) d.close(); } }, userCell(v))),
          h("td", { class: "num", text: String(v.slot) }),
          h("td", { class: "nowrap", text: v.accountCreated ? plural(days(v.accountCreated), "day") : "?" }),
          h("td", { class: "nowrap", text: v.serverJoined ? plural(days(v.serverJoined), "day") : "?" }),
          h("td", { class: "small wrap", text: v.reason || "" }))))))), { wide: true });
  }

  // ---------- reserved names ----------
  async function adminNames(body) {
    const f = A.names;
    const data = await api("GET", "/api/admin/reserved?" + qs({ status: f.status, q: f.q, contested: f.contested, applicants: f.applicants, offset: f.offset }));
    const s = S.settings || {};
    const selected = new Set();
    const status = h("select", null, [["active", "All but released"], ["claimed", "Entered, not approved"], ["approved", "Approved, waiting for launch"], ["queued", "In the invite queue"], ["in_guild", "Already in the guild"], ["released", "Released"], ["all", "Everything"]].map(([k, t]) => h("option", { value: k, text: t, selected: f.status === k })));
    const search = h("input", { type: "search", value: f.q, placeholder: "Name or Discord name" });
    const contested = h("input", { type: "checkbox", checked: f.contested });
    const accepted = h("input", { type: "checkbox", checked: f.applicants === "accepted" });
    const apply = () => { f.status = status.value; f.q = search.value.trim(); f.contested = contested.checked; f.applicants = accepted.checked ? "accepted" : ""; f.offset = 0; adminNames(body); };
    status.addEventListener("change", apply);
    contested.addEventListener("change", apply);
    accepted.addEventListener("change", apply);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    const act = async (action, ids, confirmText) => {
      if (confirmText && !(await confirmBox(confirmText[0], confirmText[1], confirmText[2]))) return;
      try {
        const out = await api("POST", `/api/admin/reserved/${action}`, { ids });
        if (action === "queue") {
          toast(`Queued ${out.queued}, moved to the front ${out.bumped}, already in the guild ${out.inGuild}${out.contested ? `, contested (skipped) ${out.contested}` : ""}${out.blocked ? `, banned owner (skipped) ${out.blocked}` : ""}${out.more ? ". More waiting: press again." : "."}`, "good");
        } else toast(`${out.changed} changed.`, "good");
        adminNames(body);
      } catch (err) { toast(err.message, "bad"); }
    };
    const beforeLaunch = nowSec() < (s.launchAt || 0);
    const queueWarn = beforeLaunch ? ["Queue before launch?", "The names do not exist in game until launch, so invites sent now fail and use up attempts. Approved names are queued by themselves at launch when that setting is on.", "Queue anyway"] : null;
    const bulk = h("div", { class: "btn-row" },
      h("button", { class: "btn small", type: "button", text: "Approve selected", onclick: () => act("approve", [...selected]) }),
      h("button", { class: "btn small", type: "button", text: "Unapprove selected", onclick: () => act("unapprove", [...selected]) }),
      h("button", { class: "btn small danger", type: "button", text: "Release selected", onclick: () => act("release", [...selected], ["Release these names?", "They come off the list; queued ones the site added leave the invite queue.", "Release"]) }),
      h("button", { class: "btn small", type: "button", text: "Queue selected now", onclick: () => act("queue", [...selected], queueWarn) }),
      h("button", { class: "btn small", type: "button", text: "Queue every approved name now", onclick: () => act("queue", [], queueWarn || ["Queue every approved name?", "They go to the top of the invite queue.", "Queue them"]) }));
    const all = h("input", { type: "checkbox", "aria-label": "Select all on this page" });
    const boxes = [];
    all.addEventListener("change", () => { for (const b of boxes) { b.checked = all.checked; b.dispatchEvent(new Event("change")); } });
    const QS = { queued: "waiting", written: "in the officer's list", invited: "invited", joined: "joined", cancelled: "cancelled", expired: "gave up", declined: "declined" };
    const rows = data.items.map((r) => {
      const cb = h("input", { type: "checkbox", "aria-label": `Select ${r.name}` });
      cb.addEventListener("change", () => { if (cb.checked) selected.add(r.id); else selected.delete(r.id); });
      boxes.push(cb);
      return h("tr", null,
        h("td", null, cb),
        h("td", null, h("b", { text: r.name }), r.contested ? h("span", { class: "badge warn", text: ` also entered by ${plural(r.contested, "other account")}` }) : null),
        h("td", null, h("a", { href: `#/admin/applications/${r.owner.id}` }, userCell(r.owner))),
        h("td", { text: r.application ? `${roleName(r.application.position)} · ${statusText(r.application.status)}` : "—" }),
        h("td", null, h("span", { class: "badge " + ({ approved: "green", queued: "blue", in_guild: "blue", released: "muted" }[r.status] || ""), text: r.status.replace("_", " ") })),
        h("td", { class: "small", text: r.queueStatus ? QS[r.queueStatus] || r.queueStatus : "" }),
        h("td", { class: "nowrap small", text: fmtShort(r.createdAt) }));
    });
    clear(body);
    add(body, frame("Reserved names", null,
      h("p", { class: "muted small" }, `Approved names go to the top of the invite queue ${s.autoQueue ? "by themselves at launch" : "when you press Queue (automatic queueing is off in Settings)"}: ${s.launchAt ? fmtDateTime(s.launchAt) : "—"}. An officer still sends each invite, and the player still whispers their code to link Discord. A name entered by more than one account is not queued while more than one of those claims is approved. A queued name whose invite ended without them joining can be approved again and queued again.`),
      h("div", { class: "filters" },
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Status" }), status),
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Search (Enter)" }), search)),
      h("div", { class: "btn-row" }, h("label", { class: "check" }, contested, h("span", { class: "small", text: "Only names entered by more than one account" })), h("label", { class: "check" }, accepted, h("span", { class: "small", text: "Only people whose application was accepted" }))),
      h("div", { class: "rule" }),
      bulk,
      h("div", { class: "table-wrap mt-s" }, h("table", { class: "data" },
        h("thead", null, h("tr", null, h("th", null, all), ["Name", "Entered by", "Application", "Status", "Queue", "Entered"].map((t) => h("th", { text: t })))),
        h("tbody", null, rows))),
      h("div", { class: "pager" },
        h("span", { class: "muted small", text: data.total ? `${data.offset + 1}–${data.offset + data.items.length} of ${data.total}` : "Nothing matches." }),
        h("div", { class: "btn-row" },
          h("button", { class: "btn small", type: "button", text: "Previous", disabled: data.offset === 0, onclick: () => { f.offset = Math.max(0, f.offset - data.pageSize); adminNames(body); } }),
          h("button", { class: "btn small", type: "button", text: "Next", disabled: data.offset + data.items.length >= data.total, onclick: () => { f.offset += data.pageSize; adminNames(body); } })))));
  }

  // ---------- friends ----------
  async function adminFriends(body, q = "") {
    const data = await api("GET", "/api/admin/friends?" + qs({ q }));
    const search = h("input", { type: "search", value: q, placeholder: "Friend's name" });
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") adminFriends(body, search.value.trim()); });
    clear(body);
    add(body, frame("Friends lists", null,
      h("p", { class: "muted small", text: "Who people asked to play alongside, most requested first. “Signed up” means that friend has signed in here too." }),
      h("div", { class: "filters" }, h("label", { class: "field" }, h("span", { class: "lab small", text: "Search (Enter)" }), search)),
      h("div", { class: "table-wrap" }, h("table", { class: "data" },
        h("thead", null, h("tr", null, h("th", { text: "Friend" }), h("th", { class: "num", text: "Listed by" }), h("th", { text: "Listed by whom" }))),
        h("tbody", null, data.friends.map((f) => h("tr", null,
          h("td", null, f.kind === "discord" && f.signedUp ? h("a", { href: `#/admin/applications/${f.key}`, text: f.label }) : h("span", { text: f.label }), " ", f.kind === "name" ? h("span", { class: "badge muted", text: "typed name" }) : f.signedUp ? h("span", { class: "badge", text: "signed up" }) : null),
          h("td", { class: "num", text: String(f.n) }),
          h("td", { class: "small wrap", text: f.owners }))))))));
  }

  // ---------- lookup ----------
  async function adminLookup(body, q = "") {
    const search = h("input", { type: "search", value: q, placeholder: "Discord name, character name (First Last) or Discord id" });
    const go = h("button", { class: "btn", type: "button", text: "Look up" });
    const out = h("div");
    const run = async () => {
      const text = search.value.trim();
      if ([...text].length < 2) return;
      clear(out).appendChild(h("p", { class: "muted", text: "Looking…" }));
      let data;
      try { data = await api("GET", "/api/admin/lookup?" + qs({ q: text })); } catch (err) { clear(out).appendChild(noticeBox("warn", null, h("p", { text: err.message }))); return; }
      clear(out);
      if (data.account) { out.appendChild(accountPanel(data.account)); return; }
      const resultLink = (id, label, row) => h("a", { class: "lookup-result", href: `#/admin/lookup/${encodeURIComponent(id)}`, "aria-label": `Look up ${label}` }, row);
      const section = (title, items, fn) => frame(title, null, items.length ? h("div", { class: "stack" }, items.map(fn)) : h("p", { class: "muted small", text: "Nothing." }));
      add(out, [
        data.limited ? noticeBox("warn", null, h("p", { text: "Discord rate-limited the search; try again in a few seconds." })) : null,
        h("div", { class: "grid three" },
          section("In Asmongold's Discord", data.discord, (m) => resultLink(m.id, m.label, personRow({ kind: "discord", key: m.id, label: m.label, avatarUrl: m.avatarUrl }))),
          section("Characters", data.characters, (c) => resultLink(c.id, c.name, h("div", { class: "person" }, h("div", { class: "nm" }, h("b", { text: c.name }), h("small", { text: c.status.startsWith("reserved:") ? `reserved name (${c.status.slice(9)})` : `linked (${c.status})` }))))),
          section("Signed up here", data.site, (u) => resultLink(u.id, u.shown || u.label, personRow({ kind: "discord", key: u.id, label: u.shown || u.label /* .114: every differing name */, avatarUrl: u.avatarUrl })))),
      ]);
    };
    go.addEventListener("click", run);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    clear(body);
    add(body, frame("Lookup", null,
      h("p", { class: "muted small", text: "Anyone in Asmongold's Discord, or a character: which characters an account has linked in game, and what it did on this site. Officers get the same answer in Discord with /olympus-lookup or by right-clicking a member → Apps → Olympus linked characters." }),
      h("div", { class: "filters" }, h("label", { class: "field" }, h("span", { class: "sr", text: "Search" }), search), go),
      out));
    if (q) run();
  }
  const CHAR_STATUS = { member: "in the guild", verified: "verified, not on the roster yet", queued: "invite queued", left: "left the guild", left_pending: "missing from the last roster", denied: "denied", unbound: "unbound" };
  function accountPanel(a) {
    const n = a.names;
    const s = a.site;
    const label = n.username ? `@${n.username}${n.displayName && n.displayName !== n.username ? ` (${n.displayName})` : ""}` : a.id;
    const appText = s.application ? `applied for ${roleName(s.application.position === "class_lead" && s.application.classLead ? `class_lead:${s.application.classLead}` : s.application.position)}${(s.application.backups || []).length ? `, then ${s.application.backups.map(roleName).join(", ")}` : ""} (${statusText(s.application.status)})` : "no application";
    const named = [s.writtenIn ? `written in ${plural(s.writtenIn, "time")}` : "", s.listedBy ? `on ${plural(s.listedBy, "friends list")}` : "", s.referencedBy ? `a reference in ${plural(s.referencedBy, "application")}` : ""].filter(Boolean);
    // A missing current profile does not prove historical sign-ins; other members may still name the account.
    const forget = !s.signedUp && named.length
      ? h("div", { class: "btn-row mt" }, h("button", { class: "btn small danger", type: "button", text: "Remove these mentions", onclick: async (e) => {
          const panel = e.currentTarget.closest(".frame");
          if (!(await confirmBox("Remove every mention of this account?", "For a request to be forgotten from someone with no current site profile: other members' write-ins, friends-list entries and references that name this account are deleted, with any reason or note written about them. This cannot be undone.", "Remove them", { danger: true }))) return;
          try {
            await api("POST", `/api/admin/users/${a.id}/mentions`);
            toast("Mentions removed.", "good");
          } catch (err) { toast(err.message, "bad"); }
          // Drawn again either way: a 409 may mean a current profile appeared while the action was pending.
          try { panel.replaceWith(accountPanel(await api("GET", `/api/admin/account/${a.id}`))); } catch { /* the toast said enough */ }
        } }))
      : null;
    return frame(label, s.signedUp ? h("a", { class: "btn small", href: `#/admin/applications/${a.id}`, text: "Open on this site" }) : h("span", { class: "badge muted", text: "no current site profile" }),
      h("dl", { class: "kv" },
        h("dt", { text: "Discord id" }), h("dd", { text: a.id }),
        h("dt", { text: "Account created" }), h("dd", { text: fmtDay(a.accountCreated) }),
        n.nick ? h("dt", { text: "Nickname in Asmongold's server" }) : null, n.nick ? h("dd", { text: n.nick }) : null,
        h("dt", { text: "Linked characters" }), h("dd", null, a.characters.length ? h("div", { class: "stack" }, a.characters.map((c) => h("div", null, h("b", { text: c.name }), ` — ${CHAR_STATUS[c.status] || c.status}${c.memberSince ? `, since ${fmtShort(c.memberSince)}` : ""}`))) : "none"),
        a.queue.length ? h("dt", { text: "Invite queue" }) : null, a.queue.length ? h("dd", { text: a.queue.map((q) => `${q.name} (${q.status}${q.priority ? ", reserved name" : ""})`).join(", ") }) : null,
        a.openCodes.length ? h("dt", { text: "Open codes" }) : null, a.openCodes.length ? h("dd", { text: a.openCodes.map((p) => p.name || "(any character)").join(", ") }) : null,
        a.member && a.member.battletag ? h("dt", { text: "Battle.net" }) : null, a.member && a.member.battletag ? h("dd", { text: a.member.battletag }) : null,
        a.member && a.member.banned ? h("dt", { text: "Bot" }) : null, a.member && a.member.banned ? h("dd", { text: "banned from verifying" + (a.member.banReason ? `: ${a.member.banReason}` : "") }) : null,
        h("dt", { text: "On this site" }), h("dd", { text: s.signedUp ? [appText, s.reserved.length ? `reserved: ${s.reserved.map((r) => r.name).join(", ")}` : "", `${plural(s.friends, "friend")} listed`, s.listedBy ? `listed by ${s.listedBy}` : "", s.writtenIn ? `written in ${plural(s.writtenIn, "time")}` : "", `${plural(s.votesCast, "write-in")} made`, s.denied ? "DENIED" : "", s.inServer ? "" : "left the server"].filter(Boolean).join(" · ") : ["no current site profile", named.length ? `named by others: ${named.join(", ")}` : "", "Historical sign-ins are not established by this lookup."].filter(Boolean).join(" · ") })),
      forget);
  }

  // ---------------------------------------------------------------- community (.93, .96, .98, .100, .101, .102, .103, .104, .105, .106, .107, .108, .109, .110, .111, .112): the shell, saved account/contact redirects, the directory
  // Every community call is the real keeper API (community-routes.ts); capabilities and flags come from the boot's
  // `community` (community-context.ts contextDto) and are re-read after a refusal. Nothing here changes a role or a
  // membership: the pages show what the Worker admits and say so when it does not.
  const PROFESSION_LABELS = { alchemy: "Alchemy", blacksmithing: "Blacksmithing", enchanting: "Enchanting", engineering: "Engineering", herbalism: "Herbalism", leatherworking: "Leatherworking", mining: "Mining", skinning: "Skinning", tailoring: "Tailoring", cooking: "Cooking", fishing: "Fishing", first_aid: "First Aid" };
  const PROFESSION_KEYS = Object.keys(PROFESSION_LABELS);
  const RAID_ROLE_LABELS = { tank: "Tank", healer: "Healer", damage: "Damage" };
  const profLabel = (k) => PROFESSION_LABELS[k] || k;
  const profIcon = (k) => h("img", { class: "ico s", src: art("prof-" + k), alt: "", width: "20", height: "20" });
  const rrIcon = (k) => h("img", { class: "role-ico", src: art("role-" + (k === "damage" ? "dps" : k)), alt: "", width: "20", height: "20" });
  const COMMUNITY_ERRORS = {
    feature_disabled: "This part of the site is not switched on.",
    guild_unconfirmed: "This is for members whose character the officers' roster export has confirmed. Verify a character first; the roster then confirms it.",
    community_unconfirmed: "Sign in with the linked Discord account that has the Guild Member role, or confirm a character through the current roster. Site administrators can also view the Community.",
    denied: "Your registration with Olympus has been permanently denied.",
    not_member: "You are no longer in Asmongold's Discord server. Rejoin it, then sign in again.",
    signed_out: "You are signed out. Sign in with Discord again.",
    conflict: "Someone else saved this first, or the page is out of date. Reload and try again.",
    cursor_stale: "The list changed while you were reading it; it starts again from the top.",
    directory_too_large: "The directory is too large to show safely right now. Tell an officer.",
    directory_full: "The directory is full: everything was saved, but your profile stays unlisted until a place frees up.",
    name_conflict: "One of these names belongs to another account's verified character, or clashes with one. Nothing was saved; check the names.",
    slow_down: "Too many requests in one minute. Wait a moment, then try again.",
    invalid_q: "Type at least two characters of a recipe name.",
    invalid_query: "Type a recipe name or choose a profession.",
    invalid_request: "Something in the form is not valid.",
    intake_unavailable: "The privacy inbox is not accepting new cases right now.",
    intake_busy: "The form is busy: too many new cases in the last hour. Try again later.",
    case_not_found: "No case with that number and code. Check both; a case past its deadline is gone too.",
    case_closed: "This case is closed; nothing more can be added to it.",
    message_conflict: "That message was already sent with different text. Reload and try again.",
    message_limit: "This case has reached its message limit.",
    case_conflict: "A different case already holds this number. If you just sent this request and the answer was lost, check it with your number and code under Open an existing case; otherwise reload the page for a fresh number.",
    rate_limited: "Too many requests from your network in one minute. Wait, then try again.",
    body_too_large: "That is too long for one message.",
    invalid_text: "That text has characters the form does not accept.",
    // .109: the profile editor's refusals, in words
    invalid_main: "The main character's name is not a valid \"First Last\", or it is also listed as one of your alts.",
    invalid_alts: "An alt is listed twice, is not a valid \"First Last\", or is also your main.",
    invalid_professions: "A profession is listed twice, or its skill is out of range.",
    invalid_crafts: "An offer is listed twice, or its recipe name is too short, too long or has characters the form does not accept.",
    invalid_listed: "The listing choice could not be read; reload the page.",
    // .96: the calendar, the trial and the dues
    event_not_found: "There is no such event, or it was removed.",
    event_cancelled: "This event was cancelled; answers are closed.",
    event_started: "This event has started; answers are closed.",
    stale_revision: "Your answer is out of date: the event or your answer changed since this page loaded. The page now shows the current state; answer again if you still want to.",
    event_full: "Every place is taken. You can still answer tentative or no.",
    calendar_full: "The calendar has no room for another member right now. Tell an organizer.",
    events_too_large: "This event has more answers than the page can show safely right now. Tell an organizer.",
    invalid_character: "Give the character as \"First Last\", or leave it empty.",
    invalid_raid_role: "Choose tank, healer or damage, or leave it empty.",
    invalid_status: "Choose yes, tentative or no.",
    contributions_disabled: "The contribution ledger is not switched on.",
    contribution_overflow: "An amount in this ledger is outside the range the site represents exactly; an officer must repair it before it can be shown.",
    past_retention: "That week is past its retention period; nothing can be recorded on it any more.",
    not_organizer: "Only guild organizers can do that.",
    unreadable_answer: "The answer could not be read, so the outcome is unknown.",
  };
  const codeOf = (e) => (e && e.data && e.data.error) || (e && e.code) || "";
  const uncertain = (ex) => !!ex && (ex.status === 0 || codeOf(ex) === "unreadable_answer" || (ex.status >= 500 && !codeOf(ex)));
  const explain = (e, fallback) => (e && e.data && e.data.message) || COMMUNITY_ERRORS[codeOf(e)] || (e && e.message) || fallback || "Something went wrong.";
  const PUBLIC_ROUTES = new Set(["request", "data"]); // only privacy identity redirects survive sign-out
  const IDENTITY_ROUTES = new Set(["data", "request"]); // pages a denied or departed identity may still use
  /** Fetch the community context again (after a refusal or a sign-in), so the shell reflects what the Worker admits now. */
  // `options.live` (F4b.1 follow-up, 15 Oct 2026): the ownership of the operation that asked for the refresh. The generic api() effects are gated by it,
  // and after the awaited context returns nothing is adopted and nothing is redrawn unless the operation still owns its view. Callers without it behave as before.
  async function refreshCommunity(options = {}) {
    const live = typeof options.live === "function" ? options.live : null, current = () => !live || live();
    try {
      const fresh = await api("GET", "/api/community/context", undefined, live ? { live } : {});
      if (!current()) return; // the operation's view is gone or its rows were replaced: the context it asked for is not its to adopt
      // .186: a context JSON-equal to the current one (ignoring `now`, the server's read time, which every reply changes and the page never reads)
      // keeps the existing object, so the three owners that check COM() === context (appointment-name hydration, the Army reader and the
      // census preview) stay current. Nothing is adopted or redrawn.
      if (S.community && JSON.stringify({ ...S.community, now: null }) === JSON.stringify({ ...fresh, now: null })) return;
      // A different subject, capabilities or features redraws once, so those owners are rebuilt for the new context instead of ending quietly.
      const changed = JSON.stringify([COM().subject, COM().capabilities, COM().features]) !== JSON.stringify([fresh.subject, fresh.capabilities, fresh.features]);
      S.community = fresh;
      if (changed) render(); // .100 (F5): the shell and the page follow what the Worker admits NOW, once; an unchanged context redraws nothing, so a refusal cannot loop
    } catch (ex) {
      if (!current()) return;
      // The delivery gate also refuses context once membership ends. A confirmed refusal may only remove UI access;
      // retaining the old boot here would leave member navigation and forms visible until a full reload.
      if (ex && ex.status === 403 && ["denied", "not_member"].includes(codeOf(ex))) {
        const previous = COM();
        const capabilities = { ...previous.capabilities, applicantWrite: false, armyRead: false, confirmedGuildData: false, communityRead: false, communityStaff: false, organizer: false };
        const changed = JSON.stringify(previous.capabilities) !== JSON.stringify(capabilities);
        S.community = { ...previous, capabilities };
        if (changed) render();
      }
    }
  }
  const b64url = (bytes) => { const a = new Uint8Array(bytes); crypto.getRandomValues(a); let s = ""; for (const b of a) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const errorLine = (text) => h("p", { class: "err small", role: "alert", text });

  // .116 (6 Oct 2026): account controls belong to the bottom policy surface; retain saved fragment compatibility.
  ROUTES.data = function data() { location.replace("/privacy/account"); };

  // Saved request links continue to the policy contact surface.
  ROUTES.request = async function request() { location.replace("/privacy/contact"); };

  // ---------- the community pages ----------
  const newsOn = () => !!(S.settings && S.settings.newsOn); // .115: SiteSettings.newsOn, off unless an administrator switched it on
  function communityTabs(sub) {
    const tabs = anyCommunity() || can("armyRead") ? [["", "Overview"]] : [];
    if (feat("directory")) tabs.push(["directory", "Directory"], ["profile", "My profile"]);
    if (feat("crafting")) tabs.push(["workshop", "Crafters & Artisans"]);
    if (feat("events")) tabs.push(["calendar", "Calendar"]);
    if (feat("census") && can("confirmedGuildData")) tabs.push(["census", "Census preview"]);
    if (feat("trials")) tabs.push(["trial", "My trial"]);
    if (feat("contributions")) tabs.push(["dues", "My dues"]);
    if (newsOn()) tabs.push(["news", "News"]); // .115: only while an administrator has News switched on
    if (can("armyRead")) tabs.push(["army", "Army"]);
    if (anyCommunity()) tabs.push(["leadership", "Leadership"]); // .114: the Olympus I-X directory (confirmed members)
    return h("nav", { class: "btn-row", "aria-label": "Community sections" }, tabs.map(([k, t]) => h("a", { class: "btn small", href: "#/community" + (k ? "/" + k : ""), text: t, "aria-current": sub === k ? "page" : false })));
  }
  const sourceStrip = (source, freshness) => h("div", { class: "source-strip", "data-source-strip": true },
    h("span", { class: "badge", text: source }), h("span", { class: "small muted", text: freshness }));
  function standingNotice() {
    const c = COM().capabilities;
    if (!c.applicantWrite) return noticeBox("warn", "icon-warning", h("p", { text: `You no longer have access to the community pages: ${c.authenticatedIdentity ? "your account is not a member in good standing here (departed from the server, denied, or signed in elsewhere since this page loaded)" : "you are signed out"}. Reload the page to see your current state.` })); // .100 (F5)
    return noticeBox("info", "icon-shield", h("p", { text: COMMUNITY_ERRORS.community_unconfirmed }),
      h("p", { text: "Community viewing is available to site administrators and current guild members. Sign in with the linked Discord account that has the Guild Member role, or confirm a character through the current roster." }),
      h("details", { class: "membership-help" }, h("summary", { text: "How to confirm your character" }),
        h("ol", null,
          h("li", { text: "In Discord, open #join-olympus and choose Get my code, or use /verify. Follow the bot's current instructions." }),
          h("li", { text: "Send the displayed verification line from the character you want linked. The officer's checked addon verifies that character; the current roster export must then confirm its guild membership." }),
          h("li", { text: "Use My status or /verify-status in the bot to check progress. If the character is already verified but these pages remain locked, ask an Olympus officer to check the current roster record. Keep the code private." })),
        h("a", { href: "#/guide/member", text: "Read the member guide" })),
      h("p", { class: "muted small", text: "Until access is confirmed the community pages show nothing of other members, and nothing you enter here is listed." }));
  }
  const memberActionNotice = () => noticeBox("info", "icon-shield", h("p", { text: "You can view the Community. Updating a member profile, responding to an event or using the Census preview still requires a verified character on the current guild roster." }), h("a", { href: "#/guide/member", text: "Read the member guide" }));
  ROUTES.army = async function army(main, parts) {
    if (!can("armyRead") || !S.signedIn || S.denied) { add(main, standingNotice()); return; }
    if (!parts.length) return communityArmyReview(main);
    if (parts.length !== 1 || parts[0] !== "report") { add(main, frame("Army", null, h("p", {text:"There is no such Army workspace."}))); return; }
    if (!S.user?.isAdmin) { add(main, frame("Army reporter", null, h("p", {text:"Publishing a snapshot requires current site administrator authority."}))); return; }
    return armyReporterWorkspace(main);
  };
  async function armyReporterWorkspace(body) {
    const owner = S.user, context = COM(), route = currentRoute(), controller = new AbortController();
    let instance = null, disposed = false;
    const ownCurrent = () => S.user === owner && owner && owner.isAdmin && S.signedIn && !S.denied && COM() === context && can("armyRead");
    const live = () => !disposed && ownCurrent() && currentRoute() === route && app.contains(body);
    const dispose = () => { if (disposed) return; disposed = true; capacity.destroy(); controller.abort(); instance?.destroy(); if (navigationGuard === instance) navigationGuard = null; if (disposeTool === dispose) disposeTool = null; };
    const capacity = armyCapacityPanel(live);
    disposeTool = dispose;
    add(body, [capacity.element, h("p", {role:"status", text:"Opening the Army reporter…"})]);
    try {
      const node = await authoredFragment("/army/report/fragment", ".army-site[data-army-reporter-fragment]", controller); if (!live()) return;
      if (!document.querySelector('link[data-olympus-tool="OlympusArmyReader"]')) document.head.appendChild(h("link", {rel:"stylesheet", href:"/static/army-live/army.css", "data-olympus-tool":"OlympusArmyReader"}));
      for (const [namespace, file] of [["OlympusGuildQRProtocol","protocol.js"],["OlympusSanitizedExport","sanitized-export.js"],["OlympusArmyReader","army.js"],["OlympusArmyReportTool","report.js"],["OlympusArmyLocalImportTool","savedvariables-import.js"]]) {
        await loadMemberScript(namespace, "/static/army-live/" + file); if (!live()) return;
      }
      clear(body); add(body, [capacity.element, node]);
      instance = window.OlympusArmyReportTool.mount(node, {owner, isCurrent:live, isOwnerCurrent:ownCurrent});
      navigationGuard = instance;
      window.OlympusArmyLocalImportTool.mount(node, {report:instance, isCurrent:live});
      if (!live()) dispose();
    } catch (error) { if (live()) { clear(body); add(body, [capacity.element, frame("Army reporter", null, noticeBox("warn", "icon-warning", h("p", {text:explain(error,"The reporter could not be opened.")})))]); } }
  }
  ROUTES.news = async function townCrier(main, parts) {
    if (!S.signedIn || S.denied || !can("applicantWrite")) { add(main, standingNotice()); return; }
    const editing = parts[0] === "edit";
    add(main, writsPanel199("news"));
    add(main, frame("Town Crier", null,
      h("p", { text: "Guild announcements and the Lead Correspondent's dispatches." }),
      h("div", { class: "btn-row" }, h("a", { class: "btn small", href: "#/news", text: "Read dispatches" }),
        S.user && S.user.canEditTownCrier ? h("a", { class: "btn small", href: "#/news/edit", text: "Edit dispatches" }) : null)));
    const body = h("div", { class: "stack mt" }); main.appendChild(body);
    if (editing) {
      if (!S.user || !S.user.canEditTownCrier) { add(body, noticeBox("warn", "icon-shield", h("p", { text: "Editing requires the current Lead Correspondent appointment or site administrator authority." }))); return; }
      return adminNews(body, "", "/api/news/editor");
    }
    if (parts.length) { add(body, h("p", { text: "There is no such Town Crier page." })); return; }
    if (!communityReader()) { add(body, standingNotice()); return; }
    if (!newsOn()) { add(body, h("p", { text: "Town Crier dispatches are switched off." })); return; }
    return communityNews(body);
  };
  ROUTES.community = async function community(main, parts) {
    const sub = parts[0] || "";
    if (!anyCommunity() && sub !== "army" && !(sub === "" && can("armyRead"))) {
      add(main, frame("Community", null, noticeBox("info", "icon-clock", h("p", { text: "The community pages are not switched on yet." }))));
      return;
    }
    const armyReaderOnly = (sub === "army" || !anyCommunity() && sub === "") && can("armyRead");
    const accessLabel = !communityReader() ? armyReaderOnly ? "Signed-in Olympus member" : "Membership check needed" : S.user && S.user.isAdmin ? "Site administrator" : can("confirmedGuildData") ? "confirmed guild member" : "Guild Member role";
    add(main, frame("Community", h("span", { class: "badge " + (communityReader() || armyReaderOnly ? "green" : "muted"), text: accessLabel }), communityTabs(sub)));
    const body = h("div", { class: "stack mt" });
    main.appendChild(body);
    if (sub === "") return communityOverview(body);
    if (!can("applicantWrite")) { add(body, standingNotice()); return; }
    // .96: the own trial and the own dues are the account's (applicantWrite), not a confirmed character's: the API's rule
    if (sub === "trial" && feat("trials")) return communityTrial(body);
    if (sub === "dues" && feat("contributions")) return communityDues(body);
    // .181: aggregate Army reads use ordinary account standing; all other Community gates remain below.
    if (sub === "army") { if (!can("armyRead")) { add(body, noticeBox("warn", "icon-warning", h("p", { text: "Army access is not available for this account’s current standing. Reload the page to check your current access." }))); return; } return communityArmyReview(body); }
    if (!communityReader()) { add(body, standingNotice()); return; }
    if (sub === "news" && newsOn()) return communityNews(body); // .115
    if (sub === "leadership") return communityLeadership(body); // .114
    if (sub === "census" && feat("census")) { if (!can("confirmedGuildData")) { add(body, memberActionNotice()); return; } return communityCensus(body); }
    if (sub === "directory" && feat("directory")) return communityDirectory(body);
    if (sub === "workshop" && feat("crafting")) {
      add(body, [frame("Crafters & Artisans Workshop", h("a", { class: "btn small", href: "#/community/profile", text: "List my recipes" }),
        h("p", { text: "Find members offering rare recipes, consumables and specialist crafts. Search by recipe or profession, then arrange materials and payment directly with the crafter." }),
        h("p", { class: "muted small", text: "Opt in through My profile: list your profile, professions and any recipes you wish to offer. Untick the listing box to withdraw from both directories, or remove individual offers there. Recipe ownership, rarity and skill are self-reported; confirm them before trading." })), writsPanel199("community/workshop"), craftingPanel(true)]); return;
    }
    if (sub === "profile" && feat("directory")) { if (!can("confirmedGuildData")) { add(body, memberActionNotice()); return; } return communityProfile(body); }
    if (sub === "calendar" && feat("events")) {
      // .98: the organizer's pages live beside the member's (the Worker decides who may write; the page shows the refusal)
      if (parts[1] === "new") return organizerNewEvent(body);
      if (parts[1] && parts[2] === "edit") return organizerEditEvent(body, parts[1]);
      if (parts[1] && parts[2] === "attendance" && feat("attendance")) return organizerAttendance(body, parts[1]);
      if (parts[1] && parts[2] === "discord") return organizerEventDiscord(body, parts[1]);
      return parts[1] ? communityEvent(body, parts[1]) : communityCalendar(body);
    }
    add(body, frame("Not here", null, h("p", { text: "There is no such community page, or it is not switched on." })));
  };
  async function communityOverview(body) {
    const cards = [];
    if (can("armyRead")) cards.push(h("a", { class: "card", href: "#/community/army" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Army" })), h("p", { class: "muted small", text: "Read guild snapshots shared for signed-in Olympus members by authorized reporters. These unverified figures count characters, not people." })));
    if (feat("census") && can("confirmedGuildData")) cards.push(h("a", { class: "card", href: "#/community/census" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Census preview" })), h("p", { class: "muted small", text: "Paste an optional addon export to inspect unsigned guild observations. Private preview only; nothing is saved." })));
    if (feat("directory")) {
      cards.push(h("a", { class: "card", href: "#/community/directory" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Member directory" })), h("p", { class: "muted small", text: "Current Discord members, their portraits and permitted public roles, with verified characters only for eligible website accounts." })));
      cards.push(h("a", { class: "card", href: "#/community/profile" }, h("div", { class: "card-head" }, icon("pos-member"), h("h3", { text: "My profile" })), h("p", { class: "muted small", text: "Opt in to a detailed profile and crafting offers. Those extra details stay unlisted until you tick the box. Your separate default Discord directory row has its own visibility control." })));
    }
    if (feat("crafting")) cards.push(h("a", { class: "card", href: "#/community/workshop" }, h("div", { class: "card-head" }, icon("pos-professions"), h("h3", { text: "Crafters & Artisans" })), h("p", { class: "muted small", text: "Search members' rare-recipe and profession offers, and list your own crafts through My profile." })));
    if (feat("events")) cards.push(h("a", { class: "card", href: "#/community/calendar" }, h("div", { class: "card-head" }, icon("icon-clock"), h("h3", { text: "Calendar" })), h("p", { class: "muted small", text: `Guild events, your answers${feat("attendance") ? " and what the organizers recorded afterwards" : ""}. For guild members and site administrators.` })));
    if (feat("trials")) cards.push(h("a", { class: "card", href: "#/community/trial" }, h("div", { class: "card-head" }, icon("icon-shield"), h("h3", { text: "My trial" })), h("p", { class: "muted small", text: "Your trial period as the officers recorded it: the review date and the outcome." })));
    if (feat("contributions")) cards.push(h("a", { class: "card", href: "#/community/dues" }, h("div", { class: "card-head" }, icon("pos-treasurer"), h("h3", { text: "My dues" })), h("p", { class: "muted small", text: "The weeks the policy counts for you, what was applied, and the mail reference for paying." })));
    if (newsOn()) cards.push(h("a", { class: "card", href: "#/community/news" }, h("div", { class: "card-head" }, icon("icon-launch"), h("h3", { text: "News" })), h("p", { class: "muted small", text: "Notices from the site's administrators, whether Olympus I has room, the guild in figures and what is coming up. For guild members and site administrators." }))); // .115
    if (anyCommunity()) cards.push(h("a", { class: "card", href: "#/community/leadership" }, h("div", { class: "card-head" }, icon("pos-guild_master"), h("h3", { text: "Leadership" })), h("p", { class: "muted small", text: "The Guild Master and officers of each Olympus guild, I to X. For guild members and site administrators." }))); // .114
    add(body, [communityReader() ? null : standingNotice(), h("section", { class: "grid three" }, cards)]);
  }
  // A fresh memberSeats read is separate from volunteer Army observations and
  // boot state. Only Olympus I has an authoritative feed; no other branch is inferred.
  function armyCapacityPanel(isCurrent) {
    if (disposeArmyCapacity) disposeArmyCapacity();
    const user = S.user, route = currentRoute(), context = COM();
    const box = h("section", { class: "frame army-capacity196", "data-army-capacity": "current", "aria-label": "Olympus guild capacity" });
    let disposed = false, generation = 0, expiryTimer = null, clockTimer = null;
    const owned = () => !disposed && isCurrent() && S.signedIn && !S.denied && S.user === user && COM() === context && currentRoute() === route;
    const live = () => owned() && !document.hidden;
    const stop = () => { clearTimeout(expiryTimer); clearInterval(clockTimer); expiryTimer = clockTimer = null; };
    const labels = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const unknown = text => h("div", { class: "army-capacity-unavailable", text });
    const announcement = h("p", { class: "small", role: "status", "aria-live": "polite" });
    const refreshButton = h("button", { type: "button", class: "btn small", text: "Refresh capacity evidence" });
    refreshButton.addEventListener("click", () => { if (live()) refresh(); });
    let first = null;
    const draw = () => {
      clear(box); box.hidden = false;
      const rows = labels.map((name, index) => {
        const row = h("article", { class: "card", "data-army-capacity-guild": name }, h("h3", { text: "Olympus " + name }));
        if (!index) first = row;
        else add(row, [unknown("Capacity unavailable"), h("p", { class: "muted small", text: "No trusted capacity feed is connected for this branch. Its size, available places and admission state are unknown." })]);
        return row;
      });
      add(box, [h("div", { class: "plaque" }, h("h2", { text: "Olympus I–X capacity" }), refreshButton), announcement,
        h("p", { class: "muted small", text: "Dated officer evidence is informational. It is separate from the unverified community snapshots below and never guarantees an invite or a place now." }),
        h("div", { class: "grid two army-capacity-grid" }, rows),
        h("p", { class: "small" }, "Alt placement: ask the current ", h("a", { href: "#/community/leadership", text: "guild officers and leadership" }), ". There is no automatic Alt routing or dedicated Alt guild established by this panel.")]);
    };
    const unavailable = text => { announcement.textContent = text || "Current capacity unavailable"; if (!first) return; clear(first); add(first, [h("h3", { text: "Olympus I" }), unknown(text || "Current capacity unavailable"), h("p", { class: "muted small", text: "A fresh checked officer roster or recent refused-invite report is needed. No count or free-place estimate is inferred." })]); };
    function refresh() {
      if (!live()) return;
      const refocus = document.activeElement === refreshButton;
      stop(); draw(); if (refocus) refreshButton.focus(); unavailable("Checking current officer evidence…");
      const request = ++generation, requestLive = () => live() && generation === request;
      api("GET", "/api/me", undefined, { live: requestLive }).then(data => {
        if (!requestLive()) return;
        if (!data || data.signedIn !== true || data.denied !== false || data.user?.id !== user.id || !Number.isSafeInteger(data.now) || data.now <= 0) throw Error("Capacity reader refused");
        const seat = data.seats;
        if (!seat || seat.state === "unknown") { unavailable(); return; }
        // memberSeats currently labels an open checked roster with source:null;
        // its nonnull rounded evidence time and consistent counts identify that DTO.
        const roster = (seat.state === "full" && seat.source === "roster") || (seat.state === "open" && seat.source === null);
        const refused = seat.state === "full" && seat.source === "refused_invite";
        if ((!roster && !refused) || !Number.isSafeInteger(seat.asOf) || seat.asOf <= 0 || seat.asOf % 3600 !== 0 || seat.asOf > data.now) throw Error("Invalid dated capacity evidence");
        if (roster && (!Number.isSafeInteger(seat.cap) || seat.cap < 900 || seat.cap > 1000 || !Number.isSafeInteger(seat.members) || seat.members < 0 || seat.members > 1000 || !Number.isSafeInteger(seat.free) || seat.free !== Math.max(0, seat.cap - seat.members) || (seat.state === "open" ? seat.members >= seat.cap : seat.members < seat.cap))) throw Error("Invalid checked roster counts");
        // asOf is already rounded down by the server. Expire conservatively at
        // that hour plus the original48h roster /6h refusal window, not receipt time.
        const expiresAt = seat.asOf + (roster ? 48 : 6) * 3600, remaining = expiresAt - Math.max(data.now, nowSec());
        if (remaining <= 0) { unavailable("Officer evidence is out of date"); return; }
        clear(first); add(first, [h("h3", { text: "Olympus I" }),
          h("time", { class: "small", "data-army-capacity-evidence": "current", datetime: new Date(seat.asOf * 1000).toISOString(), text: "Evidence time: about " + fmtDateTime(seat.asOf) })]);
        if (roster) add(first, [
          h("p", { text: "Checked officer roster: " + seat.members + " of " + seat.cap + " members." }),
          h("meter", { class: "army-capacity-meter", min: "0", max: String(seat.cap), value: String(Math.min(seat.members, seat.cap)), "aria-label": "Olympus I recorded roster occupancy", text: seat.members + " of " + seat.cap }),
          h("p", { class: "muted small", text: seat.state === "full" ? "Full in this roster report. This dated evidence is not a promise of the present guild state." : "Below the configured limit in this roster report. This does not reserve or promise a place." })]);
        else add(first, [h("p", { text: "A recent Olympus I invite was refused for lack of space." }), h("p", { class: "muted small", text: "This refusal supplies no roster count or capacity meter. It does not establish the current number of available places." })]);
        announcement.textContent = roster ? "Olympus I checked roster: " + seat.members + " of " + seat.cap + " members. Dated evidence, not a present capacity guarantee." : "A recent Olympus I invite was refused for lack of space; no roster count is available.";
        const expire = () => { if (!requestLive()) return; stop(); unavailable("Officer evidence is out of date"); };
        expiryTimer = setTimeout(expire, remaining * 1000);
        clockTimer = setInterval(() => { if (nowSec() >= expiresAt) expire(); }, 1000);
      }).catch(() => { if (requestLive()) unavailable(); });
    }
    const visibility = () => {
      if (document.hidden) { generation++; stop(); clear(box); box.hidden = true; first = null; }
      else if (owned()) refresh();
    };
    const destroy = () => { if (disposed) return; disposed = true; generation++; stop(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", destroy); clear(box); box.hidden = true; first = null; if (disposeArmyCapacity === destroy) disposeArmyCapacity = null; };
    disposeArmyCapacity = destroy;
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", destroy);
    refresh();
    return { element: box, destroy };
  }

  // Owner .198: immutable aggregate history stays separate from current branch capacity.
  function betaEpochArchiveCard() {
    return h("details", { class: "frame mt beta-epoch-archive", "data-beta-epoch-archive": "october-2026" },
      h("summary", null, icon("icon-clock"), h("strong", { text: "Beta Veterans / Founding Epoch" }), h("span", { class: "badge", text: "October 2026 archive" })),
      h("div", { class: "beta-epoch-archive-body" },
        h("p", { text: "Before the Grand Alliance's new muster, Olympus filled its October Beta roster. This founding milestone belongs to the guild's history." }),
        h("dl", { class: "beta-epoch-figures" }, h("dt", { text: "Archived Beta roster" }), h("dd", { text: "1000/1000 characters" }), h("dt", { text: "Archived queue" }), h("dd", { text: "247 queued" })),
        h("p", { class: "muted small", text: "Historical aggregate snapshot, not a live census or a count of unique people. It identifies no former member and grants no veteran status, verification or invitation priority. Current Olympus I–X capacity is reported separately; an unavailable live feed remains unavailable." }),
        h("a", { class: "btn small", href: "#/governance", text: "Read the Grand Alliance Concordat" })));
  }
  // .183: read-only snapshots stay in this shell; attended reporting retains its separate capture policy.
  async function communityArmyReview(body) {
    add(body, writsPanel199("army"));
    const user = S.user, context = COM(), route = currentRoute(); let instance = null, disposed = false;
    const live = () => !disposed && app.contains(body) && S.user === user && COM() === context && currentRoute() === route && can("armyRead");
    const capacity = armyCapacityPanel(live);
    const dispose = () => { if (disposed) return; disposed = true; capacity.destroy(); if (instance && instance.destroy) instance.destroy(); if (disposeTool === dispose) disposeTool = null; };
    disposeTool = dispose;
    const reader = h("div", { class: "army-reader" }, h("p", { role: "status", class: "muted", text: "Opening Army snapshots…" }));
    add(body, [capacity.element, betaEpochArchiveCard(), h("section", { class: "stack", "data-army-qr-review": "public-reader" },
      frame("Army", sourceStrip("Unverified community observations", "Reported characters, not unique people"),
        h("a", { class: "btn small", href: "#/organization/alliance-overview", text: "Explore Olympus I–X roles & organization" }),
        h("p", { text: "The Army page shows aggregate guild snapshots that authorized reporters deliberately reviewed and published for signed-in Olympus members." }),
        h("p", { class: "small" }, h("a", { href: "https://www.curseforge.com/wow/addons/olympus-guild", target: "_blank", rel: "noopener noreferrer", text: "Olympus Guild on CurseForge" }), " · Unified guild addon; optional website snapshot export requires publisher adoption."),
        S.user && S.user.isAdmin ? h("a", { class: "btn small", href: "#/army/report", text: "Report a guild snapshot" }) : null,
        h("p", { class: "muted small", text: "Missing guilds are unavailable, not zero. Volunteer observations do not establish game origin, membership or complete guild coverage. Reporting uses the unified Olympus Guild addon and a separate attended page with current server admission. The optional website export still needs publisher adoption." }), reader))]);
    const load = async (namespace, file) => {
      if (window[namespace]) return;
      if (!toolScripts.has(namespace)) toolScripts.set(namespace, new Promise((resolve, reject) => {
        const script = h("script", { src: file });
        script.addEventListener("load", resolve);
        script.addEventListener("error", () => { toolScripts.delete(namespace); reject(new Error("The Army reader could not be loaded. Open this section again to retry.")); });
        document.head.appendChild(script);
      }));
      await toolScripts.get(namespace);
      if (!window[namespace]) throw new Error("The Army reader is unavailable.");
    };
    try {
      if (!document.querySelector('link[data-olympus-tool="OlympusArmyReader"]')) document.head.appendChild(h("link", { rel: "stylesheet", href: "/static/army-live/army.css", "data-olympus-tool": "OlympusArmyReader" }));
      await load("OlympusGuildQRProtocol", "/static/army-live/protocol.js"); if (!live()) return;
      await load("OlympusSanitizedExport", "/static/army-live/sanitized-export.js"); if (!live()) return;
      await load("OlympusArmyReader", "/static/army-live/army.js"); if (!live()) return;
      clear(reader); instance = await window.OlympusArmyReader.mount(reader, { isCurrent: live });
      if (!live() && instance && instance.destroy) instance.destroy();
    } catch (error) { if (live()) { clear(reader); add(reader, h("p", { role: "status", class: "muted", text: error.message || "Army snapshots could not be opened." })); } }
  }

  function communityCensus(body) {
    const subject = COM().subject, user = S.user, context = COM(), route = currentRoute();
    let sequence = 0, disposed = false, controller = null, attemptTimer = null, lifetimeTimer = null, expires = 0, lastClock = Date.now(), receipt = null;
    const input = h("textarea", { id: "census-json", rows: "10", maxlength: String(CENSUS_INPUT_BYTES), autocomplete: "off", spellcheck: "false", "aria-describedby": "census-input-help" });
    const submit = h("button", { type: "submit", class: "btn primary", text: "Validate and preview" });
    const clearButton = h("button", { type: "button", class: "btn", text: "Clear" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "small", text: "Paste an optional addon export to start a private preview." });
    const output = h("div", { "data-census-results": "true", class: "stack" });
    const form = h("form", { "data-census-form": "true" }, h("label", { for: "census-json", text: "Census JSON export" }), input,
      h("p", { id: "census-input-help", class: "small muted", text: "Paste up to 320 KiB. This page does not read files or your clipboard automatically. Nothing here proves membership, ownership or guild capacity." }),
      h("div", { class: "btn-row" }, submit, clearButton));
    const hidden = () => document.hidden === true || document.visibilityState === "hidden";
    const reset = (message, emptyInput = true) => {
      sequence++;
      if (controller) controller.abort();
      controller = null;
      clearTimeout(attemptTimer); clearTimeout(lifetimeTimer); attemptTimer = lifetimeTimer = null;
      expires = 0; receipt = null; clear(output);
      if (emptyInput) input.value = "";
      submit.disabled = disposed;
      status.textContent = message;
    };
    const present = () => !disposed && S.signedIn && !S.denied && S.user === user && COM() === context && COM().subject === subject && can("confirmedGuildData") && feat("census") && currentRoute() === route && app.contains(body) && !hidden();
    const live = () => {
      const now = Date.now();
      if (now < lastClock || expires && now >= expires) { reset("The preview expired and was cleared."); lastClock = now; return false; }
      lastClock = now;
      return present();
    };
    const onVisibility = () => { if (hidden()) reset("The preview was cleared when the page was hidden."); else { live(); reset("Paste an export to start a new private preview."); } };
    const onPageHide = () => reset("The preview was cleared when you left the page.");
    const dispose = () => {
      if (disposed) return;
      disposed = true; reset("The preview was cleared.");
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (disposeCensusPreview === dispose) disposeCensusPreview = null;
    };
    disposeCensusPreview = dispose;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    input.addEventListener("input", () => { if (live()) reset("Input changed. Validate again to display a preview.", false); else reset("The previous preview was cleared."); });
    clearButton.addEventListener("click", () => reset("Input and preview cleared."));
    const utc = seconds => new Date(seconds * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
    const draw = data => {
      const s = data.snapshot;
      add(output, frame("Private census preview", null,
        sourceStrip("Unsigned addon export", `Observed ${utc(s.observedAt)} · received ${utc(data.receiptNow)} · ${data.atReceipt.snapshotAgeSeconds} seconds old at receipt`),
        h("p", { text: `${s.guilds.length} guild observations. Counts describe reported characters; they are not a unique-player population.` }),
        kv([["Claimed addon version", s.addonVersion], ["Claimed realm group", s.realmGroup], ["Claimed faction", s.faction], ["Export observed at", utc(s.observedAt)], ["Authenticated server receipt", utc(data.receiptNow)], ["Export age at receipt", `${data.atReceipt.snapshotAgeSeconds} seconds`]]),
        h("p", { class: "small muted", text: "Guild receipt times come from the upstream client. Online at export is historical, never an online-now count. Rows older than seven days at receipt remain visible here as history; no server retention is implied." }),
        h("div", { class: "table-wrap" }, h("table", { class: "data", "aria-label": "Unsigned guild observations" },
          h("thead", null, h("tr", null, ["Guild", "Reported characters", "Upstream local receipt (UTC)", "Age at server receipt", "At export", "At server receipt", "Online at export"].map(t => h("th", { scope: "col", text: t })))),
          h("tbody", null, s.guilds.map((row, i) => {
            const age = data.atReceipt.guilds[i];
            return h("tr", null, h("th", { scope: "row", text: row.name }), h("td", { text: String(row.reportedCharacters) }), h("td", { text: utc(row.receivedAt) }), h("td", { text: `${age.ageSeconds} seconds` }),
              h("td", { text: `${row.fresh ? "Fresh" : "Not fresh"}; ${row.counted ? "counted" : "not counted"}` }),
              h("td", { text: `${age.fresh ? "Fresh" : "Not fresh"}; ${age.counted ? "counted" : "not counted"}; ${age.retained ? "within seven days" : "historical beyond seven days"}` }),
              h("td", { text: row.fresh ? `${row.online} at ${utc(s.observedAt)}` : "Not reported" }));
          }))))));
    };
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!live() || controller) return;
      reset("Checking the export…", false);
      const raw = input.value;
      if (!raw || !censusBytes(raw, CENSUS_INPUT_BYTES)) { status.textContent = "Paste valid Unicode text within 320 KiB. Nothing was sent."; return; }
      const token = sequence, owned = new AbortController(), started = Date.now(), deadline = started + CENSUS_ATTEMPT_MS;
      controller = owned; submit.disabled = true;
      const current = () => token === sequence && controller === owned && input.value === raw && live();
      attemptTimer = setTimeout(() => owned.abort(), CENSUS_ATTEMPT_MS);
      try {
        const data = await censusRawPreview(raw, owned, current, started, deadline);
        if (!current()) return;
        receipt = data; expires = started + CENSUS_VISIBLE_MS;
        draw(receipt); status.textContent = "Preview accepted for this page only. It is not saved and clears within 15 minutes.";
        lifetimeTimer = setTimeout(() => { if (!disposed && sequence === token) reset("The preview expired and was cleared."); }, Math.max(0, expires - Date.now()));
      } catch (error) {
        if (!current()) return;
        const message = censusFailure(error);
        reset(message);
        if (error.status === 401) {
          // Only the still-current original attempt may affect the signed-in shell.
          dispose(); S.signedIn = false; dirtyKeys.clear(); render();
        } else if (error.status === 403) {
          dispose(); status.textContent = "Your access changed. The preview was cleared. Reload to check your access again.";
          try { location.reload(); } catch { /* keep the cleared refusal visible if reload is blocked */ }
        } else if (codeOf(error) === "reload") reloadNotice();
      } finally {
        if (controller === owned) { controller = null; clearTimeout(attemptTimer); attemptTimer = null; submit.disabled = disposed; }
      }
    });
    add(body, frame("Census preview", null,
      sourceStrip("Community observation", "Freshness unknown until an export is validated; no live population or membership proof"),
      h("p", { class: "notice", text: "Unsigned community observations — private preview, not saved" }),
      h("p", { text: "The export and its labels are submitted claims. Signing in and validation do not verify them. Clear the preview when finished; hiding or leaving this page clears it too." }), form, status, output));
  }

  /** .114: the leadership of every Olympus guild, as the site's administrators list it. A record only: it grants nothing. */
  async function communityLeadership(body) {
    const owner=S.user, context=COM(), route=currentRoute();
    const live=()=>S.user===owner && COM()===context && S.signedIn && !S.denied && currentRoute()===route && app.contains(body) && document.hidden!==true;
    let data, revision=null, after=null;const identities=[];
    try {
      for(let page=0;page<5;page++) {
        const next=await api("GET","/api/leadership"+(after ? `?after=${encodeURIComponent(after)}&revision=${encodeURIComponent(revision)}` : ""),undefined,{live});
        if(!live()) return;
        if(!next || !Array.isArray(next.guilds) || next.guilds.length!==10 || !Array.isArray(next.identities) || next.identities.length>32 || typeof next.revision!=="string" || !/^[A-Za-z0-9_-]{43}$/.test(next.revision) || (revision && next.revision!==revision) || typeof next.complete!=="boolean") throw Error("The leadership view changed or could not be checked. Refresh to read it again.");
        revision=next.revision;data=next;identities.push(...next.identities);
        if(next.complete){after=null;break;}
        if(typeof next.nextCursor!=="string" || !/^guild_(?:0[1-9]|10)_(?:gm|officer_(?:0[1-9]|1[0-2]))$/.test(next.nextCursor) || next.nextCursor===after) throw Error("The leadership continuation could not be read.");
        after=next.nextCursor;
      }
      if(after || !live()) {if(!live())return;throw Error("The leadership view is incomplete. Refresh to read it again.");}
      const guilds=data.guilds.map(g=>({name:g.name,gm:g.gm,officers:[...g.officers]}));
      const qualified=new Set();
      for(const item of identities){
        if(!item || !Number.isInteger(item.branch) || item.branch<1 || item.branch>10 || typeof item.label!=="string" || item.label.length>120 || !["gm","officer"].includes(item.position))throw Error("The leadership association could not be read.");
        const g=guilds[item.branch-1];if(item.position==="gm"){g.gm=item.label;qualified.add(item.branch+":gm");}
        else if(Number.isInteger(item.officerIndex)&&item.officerIndex>=0&&item.officerIndex<g.officers.length){g.officers[item.officerIndex]=item.label;qualified.add(item.branch+":"+item.officerIndex);}
      }
      const label=(value,key)=>h("span",null,value || "Not listed",value ? h("span",{class:"badge muted",text:qualified.has(key)?"current account association":"staff-entered / unverified"}):null);
      add(body,frame("Leadership of the Olympus guilds",null,
        h("p",{class:"muted small",text:"Current account associations are checked for this exact guild and seat. Legacy typed labels remain explicitly unverified. A directory listing grants no powers on the website, bot, Discord or in game."}),
        h("div",{class:"grid two"},guilds.map((g,i)=>h("div",{class:"card leadership-card"},h("div",{class:"card-head"},icon("pos-guild_master"),h("h3",{text:g.name})),
          h("dl",{class:"kv"},h("dt",{text:"Guild Master"}),h("dd",null,label(g.gm,(i+1)+":gm")),h("dt",{text:"Officers"}),h("dd",null,g.officers.length?g.officers.map((name,j)=>h("div",null,label(name,(i+1)+":"+j))):"None listed"))))),
        data.councilUrl ? h("p",{class:"muted small"},"Council access is given separately in Discord. ",h("a",{href:data.councilUrl,rel:"noopener",target:"_blank",text:"Olympus I–X Council"})):null));
    } catch(e){if(!live())return;if(e?.status===403)refreshCommunity();add(body,noticeBox("warn","icon-warning",h("p",{text:explain(e,"The leadership directory could not be read.")})));}
  }
  /**
   * .115 (Viktor's item A, 2 Oct 2026): News for confirmed members while an administrator has it switched on (the Worker's
   * site-news.ts). Counts and times only, never a member's name; a notice is the administrators' plain text, put on the page
   * through text nodes (a blank line starts a paragraph, a single line break stays one).
   */
  const isoDay = (iso) => { const t = Date.parse(`${iso}T00:00:00Z`); return Number.isFinite(t) ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(t)) : String(iso || ""); };
  const fewer = (v) => (v === "few" ? "fewer than 5" : String(v)); // the Worker never sends a count from 1 to 4: it could point at a person
  const noticeText = (body) => String(body || "").split(/\n[ \t]*\n/).filter((p) => p.trim()).map((p) => h("p", null, p.split("\n").map((line, i) => [i ? h("br") : null, line])));
  /** The seat state as members read it (guild-seats.ts memberSeats: the hour of the deciding evidence, never a reason or an exact time). */
  function memberSeatsText(s) {
    const when = s && s.asOf ? `about ${fmtDateTime(s.asOf)}` : "";
    if (s && s.state === "full" && s.source === "roster") return `Olympus I is full: the officers' roster export of ${when} counts ${s.members} of ${s.cap} members.`;
    if (s && s.state === "full") return `Olympus I is full: the last invite was refused for lack of space (${when}).`;
    if (s && s.state === "open") return `Olympus I has ${plural(s.free, "free seat")}: the officers' roster export of ${when} counts ${s.members} of ${s.cap} members.`;
    return "Whether Olympus I has room is not known right now: the officers' latest roster export does not give a current, checked count.";
  }
  async function communityNews(body) {
    let d;
    try {
      d = await api("GET", "/api/news");
    } catch (e) {
      if (e && (e.status === 403 || e.status === 503)) refreshCommunity(); // .100 (F5): the shell follows what the Worker admits now
      add(body, noticeBox("warn", "icon-warning", h("p", { text: explain(e, "News could not be read.") })));
      return;
    }
    const notices = Array.isArray(d.notices) ? d.notices : [];
    const query = h("input", { type: "search", maxlength: "160", autocomplete: "off", placeholder: "Title or text" });
    const windowSel = selectOf([{ key: "all", label: "All current notices" }, { key: "1", label: "Last 24 hours" }, { key: "7", label: "Last 7 days" }, { key: "30", label: "Last 30 days" }], "all", { placeholder: null });
    const results = h("div", { class: "stack", "data-news-notices": true });
    const resultCount = h("p", { class: "muted small", role: "status", "aria-live": "polite", "aria-atomic": "true" });
    const reset = h("button", { class: "btn small", type: "button", text: "Clear filters" });
    const filterNotices = () => {
      const at = nowSec(), term = query.value.trim().toLowerCase();
      const active = notices.filter((n) => Number.isFinite(n.until) && n.until > at);
      const since = windowSel.value === "all" ? null : at - Number(windowSel.value) * 86400;
      const shown = active.filter((n) => (since === null || (Number.isFinite(n.postedAt) && n.postedAt >= since && n.postedAt <= at)) && (!term || `${n.title}\n${n.body}`.toLowerCase().includes(term)));
      clear(results);
      add(results, shown.length ? shown.map((n) => h("div", { class: "card" },
        h("h3", { text: n.title }), noticeText(n.body),
        h("p", { class: "muted small", text: `Posted ${fmtDateTime(n.postedAt)}${n.editedAt ? ` · changed ${fmtDateTime(n.editedAt)}` : ""} · shown until ${fmtDay(n.until)}` })))
        : h("p", { class: "muted", text: active.length ? "No notices match these filters. Try another search or clear the filters." : "No notices right now." }));
      resultCount.textContent = `Showing ${shown.length} of ${active.length} current notices.`;
      reset.disabled = query.value === "" && windowSel.value === "all";
    };
    query.addEventListener("input", filterNotices);
    windowSel.addEventListener("change", filterNotices);
    reset.addEventListener("click", () => { query.value = ""; windowSel.value = "all"; filterNotices(); query.focus(); });
    filterNotices();
    const f = d.figures;
    const moved = (w) => (w ? `${w.joined} joined, ${w.left} left` : "not enough history yet");
    const pair = (w) => [["Last day", w.day], ["Last 7 days", w.week]];
    const figures = !f
      ? h("p", { class: "muted", text: "No figures yet: they are counted from the officers' roster exports every few hours while News is on." })
      : [
          f.roster.day || f.roster.week
            ? kv(pair(f.roster).map(([k, w]) => [k, moved(w)]))
            : h("p", { text: `Not enough roster history yet; ${f.countingSince ? `counting began ${fmtDay(f.countingSince)}` : "counting begins with the next checked roster export"}.` }),
          h("h4", { text: "New applications (first saved)" }),
          kv(pair({ day: f.applications.day.firstSaved, week: f.applications.week.firstSaved }).map(([k, v]) => [k, fewer(v)])),
          h("h4", { text: "Decisions saved" }),
          kv(pair({ day: f.applications.day.decided, week: f.applications.week.decided }).map(([k, v]) => [k, fewer(v)])),
          h("p", { class: "muted small", text: `As of ${fmtDateTime(f.asOf)}. Joined and left compare complete, checked roster exports, so a rename counts as one of each. Applications count the accounts whose application was first saved in that time, and the decisions (accepted or declined) last saved in it.` }),
        ];
    const launchAt = d.beta && d.beta.launchAt;
    add(body, [
      frame("Notices", null,
        sourceStrip("Olympus administrators", "Dates below belong to each notice; a page refresh does not renew them"),
        h("p", { class: "muted small", text: "From the site's administrators, for the whole guild. Each notice is shown for a set time and then deleted." }),
        h("div", { class: "filters" }, fieldBox("news-search", "Search notices", query), fieldBox("news-window", "Posted", windowSel), reset),
        h("p", { class: "muted small", text: "Search title and text in current notices. Time filters use the original posting time; older notices may already have expired." }),
        resultCount, results),
      frame("Olympus I", null, sourceStrip("Officer roster / invite evidence", d.seats && d.seats.asOf ? `Evidence time: about ${fmtDateTime(d.seats.asOf)}` : "No current checked evidence"), h("p", { text: memberSeatsText(d.seats) })),
      frame("The guild in figures", null, sourceStrip("Checked roster exports and site records", f ? `Counted ${fmtDateTime(f.asOf)}; refreshed every few hours while News is on` : "No figures snapshot available"), figures),
      frame("The Herald's desk", null,
        h("p", { text: "Guild dispatches, game news and practical references, with sources kept visible." }),
        h("ul", null,
          h("li", null, h("a", { href: "https://olympusnewsnetwork.com/", target: "_blank", rel: "noopener noreferrer", text: "Olympus News Network — independent community news" })),
          h("li", null, h("a", { href: "https://www.curseforge.com/wow/addons/olympus-guild", target: "_blank", rel: "noopener noreferrer", text: "Olympus Guild — census and federation AddOn" })),
          h("li", null, h("a", { href: "#/governance", text: "Guild law, the Heraldry office and daily dispatch procedure" }))),
        h("p", { class: "muted small", text: "External reporting is separate from official guild decisions. Open the original source for its current article, date and corrections. A Town Crier appointment will appear only after it is accepted and recorded." })),
      Array.isArray(d.events)
        ? frame("Coming up", null, d.events.length
            ? h("ul", null, d.events.map((e) => h("li", null, h("a", { href: eventHref(e.id), text: e.title }), ` · ${fmtDateTime(e.startsAt)} · ${plural(e.durationMin, "minute")}`)))
            : h("p", { class: "muted", text: "No events in the next 14 days." }))
        : null,
      frame("Leadership directory", null, h("p", null,
        d.leadership && d.leadership.updatedAt ? `Last changed ${fmtDay(d.leadership.updatedAt)}. ` : "Not changed yet. ",
        h("a", { href: "#/community/leadership", text: "Open Community → Leadership" }))),
      frame("The road to launch", null,
        d.beta && d.beta.scheduleStatus === "announced-plan-not-observed" && Number.isSafeInteger(d.beta.announcedClosureAt)
          ? h("p", null, `Blizzard's 20 October update scheduled the final beta shutdown for ${fmtDateTime(d.beta.announcedClosureAt)} (${fmtPacific(d.beta.announcedClosureAt)}). `,
              h("a", {href:"https://us.forums.blizzard.com/en/wow/t/heads-up-wow-forever-stress-test-on-october-21/2387920",target:"_blank",rel:"noopener noreferrer",text:"Announced plan"}), "; actual server closure was not observed by this site.")
          : h("p", {class:"muted",text:"The latest announced beta shutdown schedule is unavailable here; check Blizzard's original update. No actual closure time is inferred."}),
        launchAt
          ? h("div", { class: "date-card" }, icon("icon-launch", "l"), h("div", null,
              h("h3", { text: nowSec() >= launchAt ? "World of Warcraft: Forever" : "World of Warcraft: Forever launches in" }),
              countdown(launchAt, { doneText: "Live now" }),
              h("p", { class: "muted small", text: `${fmtDateTime(launchAt)} (${fmtPacific(launchAt)}).` })))
          : null),
      Array.isArray(d.releases) && d.releases.length
        ? frame("Site updates", null, d.releases.map((r) => h("div", null,
            h("h3", { text: `${isoDay(r.date)} (build ${r.build})` }),
            h("ul", null, (r.lines || []).map((l) => h("li", { text: l }))))))
        : null,
    ]);
  }
  const proofBadge = (source) => (source === "keeper" ? h("span", { class: "badge green", text: "confirmed" }) : h("span", { class: "badge muted", text: "self-labelled" }));
  const altBadge = (a) => (a.status === "officer_confirmed" ? h("span", { class: "badge green", text: "officer-confirmed" }) : a.proof === "keeper" ? h("span", { class: "badge green", text: "confirmed" }) : a.status === "rejected" ? h("span", { class: "badge red", text: "rejected" }) : h("span", { class: "badge muted", text: "claimed" }));
  function memberCard(m) {
    return h("div", { class: "card member" },
      h("div", { class: "card-head" }, h("img", { class: "ico", src: art("pos-member"), alt: "", width: "32", height: "32" }), h("h3", { text: m.displayName || "(no name)" }), m.raidRole ? h("span", { class: "badge" }, rrIcon(m.raidRole.value), " ", RAID_ROLE_LABELS[m.raidRole.value] || m.raidRole.value) : null),
      h("dl", { class: "kv" },
        m.main ? [h("dt", { text: "Main" }), h("dd", null, m.main.name, " ", proofBadge(m.main.source))] : null,
        m.alts && m.alts.length ? [h("dt", { text: "Alts" }), h("dd", null, m.alts.map((a, i) => [i ? ", " : null, a.name, " ", altBadge(a)]))] : null,
        m.professions && m.professions.length ? [h("dt", { text: "Professions" }), h("dd", null, h("span", { class: "prof-list" }, m.professions.map((p, i) => [i ? ", " : null, h("span", { class: "prof-tag" }, profIcon(p.name), profLabel(p.name), p.skill !== null && p.skill !== undefined ? ` ${p.skill}` : "")])))] : null,
        m.crafts && m.crafts.length ? [h("dt", { text: "Crafts" }), h("dd", { text: `${plural(m.crafts.length, "offer")}: ${m.crafts.slice(0, 8).map((c) => c.recipe).join(", ")}${m.crafts.length > 8 ? ", …" : ""}` })] : null));
  }
  async function communityDirectory(body) {
    const user = S.user, context = COM(), route = currentRoute();
    let cursor = null, busy = false, disposed = false, expiryTimer = null, scanTimer = null, continuous = false, retryDelay = 1750, rateRetries = 0;
    const shown = new Set();
    const list = h("div", { class: "grid two", "data-discord-directory": "members" });
    const status = h("p", { class: "muted small", role: "status", "aria-live": "polite", text: "Reading Discord members…" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more members", hidden: true });
    const refresh = h("button", { class: "btn small", type: "button", text: "Refresh directory" });
    const scanAll = h("button", { class: "btn small", type: "button", text: "Load all eligible Olympus members", hidden: true });
    const announce = message => {if(status.textContent !== message)status.textContent=message;};
    const stopScan = () => { continuous = false; clearTimeout(scanTimer); scanTimer = null; scanAll.textContent = "Load all eligible Olympus members"; };
    const live = () => !disposed && S.user === user && COM() === context && S.signedIn && !S.denied && currentRoute() === route && app.contains(body) && document.hidden !== true;
    const clearMembers = message => { stopScan(); clear(list); shown.clear(); cursor = null; more.hidden = scanAll.hidden = true; if (message) status.textContent = message; };
    const dispose = () => { disposed = true; clearTimeout(expiryTimer); clearMembers(); document.removeEventListener("visibilitychange", visibility); if (disposeTool === dispose) disposeTool = null; };
    const visibility = () => { if (document.hidden) { clearTimeout(expiryTimer); clearMembers("The directory was cleared while this page was hidden. Refresh to read it again."); } };
    document.addEventListener("visibilitychange", visibility);
    disposeTool = dispose;
    const load = async restart => {
      if (busy || !live()) return;
      busy = true; more.disabled = refresh.disabled = true;
      if (restart) clearMembers("Reading Discord members…");
      const originalCursor = cursor;
      try {
        const data = await api("GET", "/api/community/discord-directory" + (originalCursor ? `?cursor=${encodeURIComponent(originalCursor)}` : ""));
        if (!live()) return;
        if (!data || data.source !== "discord_members" || !Array.isArray(data.members) || data.members.length > 100 || typeof data.complete !== "boolean" || !(data.nextCursor === null || typeof data.nextCursor === "string" && data.nextCursor.length <= 8192) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error("The directory response could not be read.");
        for (const member of data.members) {
          if (!member || typeof member.ref !== "string" || shown.has(member.ref)) continue;
          shown.add(member.ref);
          const roles = Array.isArray(member.roles) ? member.roles.filter(role => typeof role === "string") : [];
          const characters = Array.isArray(member.verifiedCharacters) ? member.verifiedCharacters.filter(character => character && typeof character.name === "string") : [];
          list.appendChild(h("article", { class: "card member" },
            h("div", { class: "card-head" }, discordAvatar(member, { class: "av", width: "40", height: "40", loading: "lazy" }), h("h3", { text: discordIdentity(member) || member.label || "Discord member" })),
            roles.length ? h("p", { class: "small" }, roles.map(role => h("span", { class: "badge", text: role }))) : h("p", { class: "muted small", text: "No public Olympus role listed" }),
            characters.length ? h("ul", { class: "small" }, characters.map(character => h("li", { text: character.name + " · verified character" }))) : h("p", { class: "muted small", text: "No verified character published through a website account" }),
            member.charactersTruncated ? h("p", { class: "muted small", text: "Additional characters are not included on this page." }) : null));
        }
        cursor = data.nextCursor; more.hidden = scanAll.hidden = !cursor; retryDelay=1750;rateRetries=0;
        status.textContent = `${plural(shown.size, "Discord member")} shown · checked ${new Date(data.generatedAt).toLocaleString()}. ${data.complete ? "End of this traversal." : "More pages are available."} Discord membership can change while you browse; this is not an atomic roster snapshot.`;
        clearTimeout(expiryTimer);
        const expires = data.traversal && Date.parse(data.traversal.expiresAt);
        expiryTimer = setTimeout(() => clearMembers("This directory view expired. Refresh to read current membership."), Number.isFinite(expires) ? Math.max(0, Math.min(expires - Date.now(), 15 * 60000)) : 5 * 60000);
      } catch (error) {
        if (!live()) return;
        if (error && (error.status === 401 || error.status === 403 || ["cursor_stale", "cursor_expired", "invalid_cursor"].includes(codeOf(error)))) clearMembers();
        if(error?.status===429 && continuous && ++rateRetries<=3){retryDelay=Math.max(1750,Math.min(900000,(error.retryAfterSeconds || 60)*1000));announce("Discord asked this directory to wait. Loading will resume after its retry delay; the existing view is not a complete roster.");}
        else {stopScan();announce(explain(error, "Discord members are unavailable. No empty or complete roster is inferred."));}
      } finally {
        busy = false; if (!disposed) more.disabled = refresh.disabled = false;
        if (continuous && cursor && live()) {
          scanAll.textContent = "Pause loading remaining members";
          scanTimer = setTimeout(() => { scanTimer = null; if (continuous && live()) load(false); }, retryDelay);
        } else if (!cursor) stopScan();
      }
    };
    more.addEventListener("click", () => { stopScan(); load(false); }); refresh.addEventListener("click", () => load(true));
    scanAll.addEventListener("click", () => { if (!live()) return; if (continuous) stopScan(); else if (cursor) { continuous = true; scanAll.textContent = "Pause loading remaining members"; load(false); } });
    const profiles = h("div", { class: "stack" });
    const showProfiles = h("button", { class: "btn small", type: "button", text: "Show opt-in guild profiles and crafting offers" });
    const ownVisibility = h("div", {class:"stack", "data-directory-visibility":"own"});
    showProfiles.addEventListener("click", async () => { if (!live()) return; showProfiles.disabled = true; try { await communityProfileDirectory(profiles); } finally { if (live()) showProfiles.hidden = true; } });
    add(body, frame("Discord member directory", h("a", { class: "btn small", href: "#/community/profile", text: "My profile" }),
      h("p", { class: "muted small", text: "Current holders of an Olympus membership or rank role, read a page at a time. Other members of the Asmongold Discord server are not listed. Your whole row is listed by default unless you opt out below; additional profile details remain a separate opt-in. Roles do not prove character membership. Verified characters are shown only for existing website accounts that pass current verification and privacy checks." }),
      ownVisibility, status, list, h("div", { class: "btn-row" }, refresh, more, scanAll), showProfiles, profiles));
    const loadOwnVisibility = async () => {
      try {
        const state = await api("GET", "/api/community/discord-directory/visibility"); if (!live()) return;
        if (!state || typeof state.listed !== "boolean") throw Error("Your directory preference could not be read.");
        clear(ownVisibility);
        const listed = h("input", {type:"checkbox", checked:state.listed, id:"discord-directory-listed"});
        const save = h("button", {type:"button", class:"btn small", text:"Save my listing preference"});
        const note = h("p", {class:"muted small", role:"status", text:state.listed ? "Your eligible Olympus row can be listed." : "Your whole directory row is hidden."});
        const erasureNote = h("p",{class:"muted small",text:state.erasureNotice || "Account erasure deletes this preference. An eligible Discord account may then appear in the directory; a fresh attended opt-out can hide it again."});
        save.addEventListener("click", async () => {
          if (!live() || save.disabled) return; save.disabled = true;
          try {
            const out = await api("PUT", "/api/community/discord-directory/visibility", {listed:listed.checked}); if (!live()) return;
            if (!out || typeof out.listed !== "boolean") throw Error("The preference outcome is unconfirmed. Reopen the directory before acting again.");
            listed.checked = out.listed; note.textContent = out.listed ? "Your eligible Olympus row can be listed." : "Your whole directory row is hidden. Earlier reader copies cannot be recalled.";
            await load(true);
          } catch (error) { if (live()) note.textContent = explain(error,"The preference outcome is unconfirmed. Reopen the directory to read it before acting again."); }
          finally { if (live()) save.disabled = false; }
        });
        add(ownVisibility, [h("label", {class:"check"}, listed, " List my Discord profile when I have an Olympus membership or rank role"), note, erasureNote, save]);
      } catch (error) { if (live()) { clear(ownVisibility); add(ownVisibility, h("p", {class:"muted small", text:explain(error,"Your own directory preference is unavailable.")})); } }
    };
    loadOwnVisibility();
    await load(true);
  }
  async function communityProfileDirectory(body) {
    const list = h("div", { class: "stack" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    const status = h("p", { class: "muted small", text: "Loading…" });
    let cursor = null;
    const load = async (restart) => {
      if (restart) { clear(list); cursor = null; }
      more.disabled = true;
      try {
        const data = await api("GET", "/api/community/directory" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""));
        for (const m of data.members) list.appendChild(memberCard(m));
        cursor = data.nextCursor;
        more.hidden = !cursor;
        status.textContent = data.counts.listed ? `${plural(data.counts.listed, "listed member")}${list.firstChild ? "" : "; none to show"}` : can("confirmedGuildData") ? "Nobody is listed yet. Be the first: open My profile and tick the box." : "Nobody is listed yet.";
      } catch (e) {
        if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); }
        status.textContent = explain(e, "The directory could not be read.");
        if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
      } finally { more.disabled = false; }
    };
    more.addEventListener("click", () => load(false));
    add(body, [
      frame("Member directory", h("a", { class: "btn small", href: "#/community/profile", text: "My profile" }),
        sourceStrip("Member opt-in profiles", "Profile and roster verification times are not supplied here; this is not a live roster"),
        h("p", { class: "muted small", text: "Members who chose to be listed, shown to guild members and site administrators by display name. A name marked confirmed is one the officers' roster export has confirmed on that account; the rest are labels members gave themselves." }),
        status, list, h("div", { class: "btn-row" }, more)),
      feat("crafting") ? craftingPanel() : null,
    ]);
    await load(true);
  }
  function workshopCard(row) {
    const target = row.commission?.mode === "manual_in_game" && row.commission.source === "keeper" && typeof row.commission.character === "string" ? row.commission.character : null;
    const request = target ? `Hello ${target}, I found your Olympus Workshop listing. Could we arrange ${row.recipe || profLabel(row.profession)}? Please confirm materials, price/tip and timing before we trade.` : "";
    return h("article", { class: "card craft" },
      h("div", { class: "card-head" }, profIcon(row.profession), h("h3", { text: row.recipe || profLabel(row.profession) })),
      h("p", { class: "muted small", text: `${row.crafter.displayName || "A listed member"} · ${profLabel(row.profession)} · ${row.skill === null ? "skill not supplied" : "self-reported skill " + row.skill}` }),
      h("p", { class: "muted small", text: `Listing updated ${fmtShort(Math.floor(Date.parse(row.updatedAt) / 1000))}` }),
      h("p", { class: "small", text: row.recipe === null ? "Member-supplied profession listing." : "Member-supplied recipe; ownership and rarity are not verified by the website." }),
      target ? h("details", { class: "workshop-commission" }, h("summary", { text: `Arrange a commission with ${target}` }),
        h("p", { class: "small", text: "This main currently matches the keeper's membership proof. Contact them in game and agree the craft yourself. Nothing is sent by this website." }),
        h("label", { class: "field" }, h("span", { class: "lab small", text: "Request text to copy and edit" }), h("textarea", { readonly: true, rows: "5", value: request, "aria-label": "Commission request text" })))
        : h("p", { class: "small", text: "No currently proven in-game contact on this listing." }));
  }
  function craftingPanel(workshop = false) {
    const q = h("input", { type: "search", maxlength: "60", placeholder: "a recipe name (two letters or more)", "aria-label": "Recipe" });
    const prof = selectOf(PROFESSION_KEYS.map((k) => ({ key: k, label: profLabel(k) })), "", { placeholder: "Any profession" });
    const mode = selectOf([{ key: "recipes", label: "Recipes & commissions" }, { key: "professions", label: "Profession directory" }], "recipes");
    const results = h("div", { class: "stack" });
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null;
    let cursorFor = "", generation = 0; // .100 (F6): the query the continuation cursor belongs to; .104 (F100-3): a reply to a superseded search is discarded
    const filtersNow = () => [workshop ? `browse=1&mode=${mode.value === "professions" ? "professions" : "recipes"}` : "", !q.disabled && q.value.trim() ? `q=${encodeURIComponent(q.value.trim())}` : "", prof.value ? `profession=${encodeURIComponent(prof.value)}` : ""].filter(Boolean).join("&");
    const search = async (restart) => {
      const filters = filtersNow();
      if (!restart && cursor && filters !== cursorFor) { toast("The filters changed; the search starts again."); return search(true); } // never an old cursor under new filters
      if (restart) { clear(results); cursor = null; }
      const gen = ++generation; // .107 (group 5): advanced BEFORE the empty-query return too: a late reply to an earlier search writes nothing after the filters were emptied
      if (!filters) { status.textContent = COMMUNITY_ERRORS.invalid_query; if (restart) { cursorFor = ""; more.hidden = true; } more.disabled = false; return; }
      const params = [filters, cursor ? `cursor=${encodeURIComponent(cursor)}` : ""].filter(Boolean);
      more.disabled = true;
      try {
        const data = await api("GET", `/api/community/crafting?${params.join("&")}`);
        if (gen !== generation) return; // a newer search (or continuation) replaced this one: its cards belong to a query that is gone
        if (workshop && (!data.workshop || data.workshop.version !== 1 || data.workshop.mode !== mode.value || !Array.isArray(data.results))) throw new ApiError(200, { error: "unreadable_answer" });
        cursorFor = filters;
        for (const r of data.results) results.appendChild(workshop ? workshopCard(r) : h("div", { class: "card craft" }, h("div", { class: "card-head" }, profIcon(r.profession), h("h3", { text: r.recipe })), h("p", { class: "muted small", text: `${profLabel(r.profession)} · offered by ${r.crafter.displayName || "a member"} · updated ${fmtShort(Math.floor(Date.parse(r.updatedAt) / 1000))}` })));
        cursor = data.nextCursor;
        more.hidden = !cursor;
        status.textContent = results.firstChild ? (workshop ? "Member opt-ins only. Listings are not a live recipe scan." : "") : workshop && mode.value === "professions" ? "No profession listing matches." : "No offer matches.";
      } catch (e) {
        if (gen !== generation) return;
        if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return search(true); }
        status.textContent = explain(e, "The search could not run.");
      } finally { if (gen === generation) more.disabled = false; }
    };
    more.addEventListener("click", () => search(false));
    const form = h("form", { class: "filters", novalidate: true }, workshop ? fieldBox("craft-mode", "Browse", mode) : null, fieldBox("craft-q", "Recipe", q), fieldBox("craft-prof", "Profession", prof), h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "submit", text: "Search" })));
    form.addEventListener("submit", (e) => { e.preventDefault(); search(true); });
    if (workshop) {
      mode.addEventListener("change", () => { q.disabled = mode.value === "professions"; if (q.disabled) q.value = ""; search(true); });
      search(true);
    }
    return frame("Crafting offers", null, h("p", { class: "muted small", text: "What listed members say they can make. Self-reported; arrange the materials and the tip with the crafter." }), form, status, results, h("div", { class: "btn-row" }, more));
  }
  // the profile editor
  async function communityProfile(body) {
    const holder = h("div", { class: "stack" });
    add(body, holder);
    let data;
    try {
      data = await api("GET", "/api/community/profile");
    } catch (e) {
      add(holder, frame("My profile", null, noticeBox("warn", "icon-warning", h("p", { text: explain(e, "Your profile could not be read.") }))));
      if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
      return;
    }
    const redraw = (fresh) => { clear(holder); holder.appendChild(profileForm(fresh.profile, fresh.limits || data.limits, redraw)); };
    holder.appendChild(profileForm(data.profile, data.limits, redraw));
  }
  function profileForm(p, limits, redraw) {
    const listed = h("input", { type: "checkbox", checked: p.listed });
    const main = h("input", { type: "text", maxlength: String(limits.nameMax), value: p.main ? p.main.name : "", placeholder: "First Last" });
    const raidRole = selectOf(Object.keys(RAID_ROLE_LABELS).map((k) => ({ key: k, label: RAID_ROLE_LABELS[k] })), p.raidRole ? p.raidRole.value : "", { placeholder: "No raid role" });
    const labelled = (el, label) => { el.setAttribute("aria-label", label); return el; }; // .100 (F8)
    const rows = (items, make, max, addLabel, what = "row") => {
      const box = h("div", { class: "stack rows" });
      const addBtn = h("button", { class: "btn small", type: "button", text: addLabel });
      const put = (item) => {
        const row = h("div", { class: "btn-row row" });
        add(row, [make(item, row), h("button", { class: "btn small", type: "button", text: "Remove", "aria-label": `Remove this ${what}`, onclick: () => { row.remove(); addBtn.hidden = box.children.length >= max; markDirty(); } })]);
        box.appendChild(row);
        addBtn.hidden = box.children.length >= max;
      };
      for (const it of items) put(it);
      addBtn.addEventListener("click", () => { put(null); markDirty(); });
      addBtn.hidden = box.children.length >= max;
      return { box, addBtn };
    };
    const professions = rows(p.professions, (it, row) => { row.dataset.kind = "profession"; return [labelled(selectOf(PROFESSION_KEYS.map((k) => ({ key: k, label: profLabel(k) })), it ? it.name : "", { placeholder: "Profession…" }), "Profession"), h("input", { type: "number", min: "0", max: String(limits.skillMax), value: it && it.skill !== null && it.skill !== undefined ? String(it.skill) : "", placeholder: "skill", "aria-label": "Skill level" })]; }, limits.maxProfessions, "Add a profession", "profession");
    const alts = rows(p.alts, (it, row) => { row.dataset.kind = "alt"; return [h("input", { type: "text", maxlength: String(limits.nameMax), value: it ? it.name : "", placeholder: "First Last", "aria-label": "Alt name" }), it ? altBadge(it) : null]; }, limits.maxAlts, "Add an alt", "alt");
    const crafts = feat("crafting") ? rows(p.crafts, (it, row) => { row.dataset.kind = "craft"; return [labelled(selectOf(PROFESSION_KEYS.map((k) => ({ key: k, label: profLabel(k) })), it ? it.profession : "", { placeholder: "Profession…" }), "Offer profession"), h("input", { type: "text", maxlength: String(limits.recipeMax), value: it ? it.recipe : "", placeholder: "recipe", "aria-label": "Recipe" })]; }, limits.maxCrafts, "Add an offer", "offer") : null;
    const err = errorLine(""); err.hidden = true;
    const notice = h("div");
    const save = h("button", { class: "btn", type: "submit", text: "Save" });
    const dirtyMark = h("span", { class: "badge warn", text: "unsaved", hidden: true });
    function markDirty() { setDirty("community-profile", true, dirtyMark); }
    const form = h("form", { class: "stack", novalidate: true },
      noticeBox("info", "icon-friends", h("p", null, h("strong", { text: "Who sees this: " }), "signed-in guild members and site administrators, by your display name and a random reference, never your Discord ID; only while you keep the box ticked and stay roster-confirmed. Officers may confirm or reject a claimed alt. This optional detailed profile is separate from the default Discord directory row; use that directory's own visibility control to hide the whole row. Your recruitment application is separate: its stated board fields appear only if you agree to the voting board, and a board picture needs its separate optional choice.")),
      h("label", { class: "check" }, listed, " List me in the member directory"),
      fieldBox("main", "Main character", main, { hint: `${limits.nameMin}–${limits.nameMax} letters, as "First Last". It is marked confirmed when it matches a character verified on your account; a name verified on another account is refused.` }),
      p.main ? h("p", { class: "small" }, "Saved main: ", h("b", { text: p.main.name }), " ", proofBadge(p.main.source)) : null,
      fieldBox("raid-role", "Raid role", raidRole),
      h("div", { class: "field" }, h("span", { class: "lab", text: `Professions (up to ${limits.maxProfessions}, with a skill level if you like)` }), professions.box, professions.addBtn),
      h("div", { class: "field" }, h("span", { class: "lab", text: `Alts you claim (up to ${limits.maxAlts}; labels until an officer confirms them)` }), alts.box, alts.addBtn),
      crafts ? h("div", { class: "field" }, h("span", { class: "lab", text: `Crafting offers (up to ${limits.maxCrafts}; each recipe once)` }), crafts.box, crafts.addBtn) : null,
      notice, err, h("div", { class: "btn-row savebar" }, save, dirtyMark));
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    const collect = () => {
      const body = { revision: p.revision, listed: listed.checked, main: main.value.trim() ? main.value.trim() : null, raidRole: raidRole.value || null };
      body.professions = [...professions.box.children].map((row) => { const [sel, skill] = row.children; return { name: sel.value, skill: skill.value === "" ? null : Number(skill.value) }; }).filter((x) => x.name);
      body.alts = [...alts.box.children].map((row) => row.children[0].value.trim()).filter(Boolean);
      if (crafts) body.crafts = [...crafts.box.children].map((row) => { const [sel, recipe] = row.children; return { profession: sel.value, recipe: recipe.value.trim() }; }).filter((x) => x.profession && x.recipe);
      return body;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      clear(notice);
      save.disabled = true;
      try {
        const out = await api("PUT", "/api/community/profile", collect());
        if (!out || !out.profile) throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1): no receipt, nothing marked saved
        setDirty("community-profile", false, dirtyMark);
        toast(out.unchanged ? "Nothing had changed." : "Saved.", "good");
        redraw({ profile: out.profile, limits }, limits, redraw);
      } catch (ex) {
        const code = codeOf(ex);
        if (code === "directory_full" && ex.data && ex.data.saved && ex.data.profile) {
          setDirty("community-profile", false, dirtyMark);
          toast("Saved, but not listed.", "");
          redraw({ profile: ex.data.profile, limits }, limits, redraw);
          return;
        }
        if (uncertain(ex)) {
          // .104 (F100-1): the answer was lost: re-read the current version; the draft stays in the form and the next Save applies it over whatever is current
          clear(notice);
          try {
            const fresh = await api("GET", "/api/community/profile");
            p.revision = fresh.profile.revision;
            notice.appendChild(noticeBox("warn", "icon-warning", h("p", null, h("strong", { text: "The answer was lost. " }), "Your profile was re-read: the current version is ", h("b", { text: fresh.profile.main ? fresh.profile.main.name : "no main" }), `, ${fresh.profile.listed ? "listed" : "not listed"}. Your draft is kept in this form; if the current version already shows it, nothing more is needed; otherwise Save again applies it.`)));
          } catch { notice.appendChild(noticeBox("warn", "icon-warning", h("p", { text: "The answer was lost and the profile could not be re-read. Your draft is kept in this form; reload the page to see the current version." }))); }
          save.disabled = false;
          return;
        }
        if (code === "stale_revision" && ex.data && ex.data.profile) {
          // .100 (F4): the Worker answered with the current row; the draft stays in the form, the next Save applies it over that version deliberately
          const fresh = ex.data.profile;
          p.revision = fresh.revision;
          clear(notice);
          notice.appendChild(noticeBox("warn", "icon-warning",
            h("p", null, h("strong", { text: "Your profile changed elsewhere " }), "(another tab, or an officer's review) since this page loaded. Nothing was saved. Your draft is kept in this form; the current version is: ", h("b", { text: fresh.main ? fresh.main.name : "no main" }), `, ${fresh.listed ? "listed" : "not listed"}, ${plural((fresh.alts || []).length, "alt")}, ${plural((fresh.professions || []).length, "profession")}. `, "Save again to apply your draft over it, or discard the draft and see the current version."),
            h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Reload and discard my draft", onclick: () => { setDirty("community-profile", false, dirtyMark); redraw({ profile: fresh, limits }, limits, redraw); } }))));
          save.disabled = false;
          return;
        }
        if (code === "conflict") {
          notice.appendChild(noticeBox("warn", "icon-warning", h("p", { text: "Your profile was changed elsewhere (another tab, or an officer's review) since this page loaded. Nothing was saved; the page is reloading it." })));
          try { const fresh = await api("GET", "/api/community/profile"); redraw(fresh, fresh.limits, redraw); } catch { /* the notice says enough */ }
          return;
        }
        err.textContent = explain(ex, "The profile could not be saved.");
        err.hidden = false;
        save.disabled = false;
        if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
      }
    });
    return frame("My profile", h("span", { class: "badge " + (p.listed ? "green" : "muted"), text: p.listed ? "listed" : "not listed" }), form);
  }

  // ---------------------------------------------------------------- community (.96): the calendar with answers and own attendance, the own trial, the own dues
  // The member surfaces of the calendar (community-events.ts), the trial (community-trials.ts) and the contribution
  // ledger (community-contributions-api.ts), read and written through the real API only; every refusal is shown in words
  // with the fresh state the Worker returns; nothing here changes a role, a rank or a membership.
  const RSVP_LABELS = { yes: "Yes", tentative: "Tentative", no: "No" };
  const DECISION_WORDS = { accepted: "accepted", bench: "on the bench", declined: "declined" }; // stage 2 (15 Oct 2026): the organizer's roster decision
  const STAGE_WORDS = { not_due: "not due yet", due: "due", notice_available: "due; a notice may be given", acknowledged: "acknowledged", final_notice: "final notice", officer_review: "officer review", paid: "paid", exempt: "exempt", resolved: "resolved", needs_review: "needs an officer's review", unknown: "waiting for the officers' attestation" };
  const EVIDENCE_WORDS = { complete: "records complete", partial: "records partial", stale: "records out of date", unavailable: "records not attested" };
  const SOURCE_WORDS = { officer_manual: "entered by an officer", mail: "in-game mail", bank_log: "guild bank log" };
  const ATTENDANCE_WORDS = { present: "present", absent: "absent", excused: "excused", unknown: "unknown" }; // .106: an explicit "unknown" is a record; the blank choice reads "not recorded"
  const REASON_WORDS = { late: "arrived late", left_early: "left early" };
  const TRIAL_WORDS = { active: "active", extended: "extended", passed: "passed", ended: "ended" };
  const TRIAL_REASONS = { review_passed: "the review passed", withdrew: "you withdrew", inactive: "inactivity", staff_decision: "an officer's decision" };
  const ACK_WORDS = { stale: "The ledger changed since this page loaded; it has been reloaded.", already_recorded: "That was already acknowledged.", not_applicable: "That week does not call for an acknowledgement right now.", facts_stale: "The week's records changed; the page has been reloaded." };
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const TRIAL_ABOUT = "A trial is the officers' review period for a new member: they look at activity and conduct by the review date and record the outcome here. Nothing on this page changes a role or a rank by itself; an officer does that in the game and in Discord. A concluded trial stays visible for thirty days.";
  const sec = (iso) => (iso ? Math.floor(Date.parse(iso) / 1000) : 0);
  const isoOf = (s) => new Date(s * 1000).toISOString();
  /** Copper as the game shows it: 12345 → "1g 23s 45c", zero parts left out. */
  function gold(copper) {
    const c = Math.max(0, Math.floor(Number(copper) || 0));
    const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cp = c % 100;
    const parts = [];
    if (g) parts.push(`${g}g`);
    if (s) parts.push(`${s}s`);
    if (cp || !parts.length) parts.push(`${cp}c`);
    return parts.join(" ");
  }
  const eventHref = (id) => `#/community/calendar/${encodeURIComponent(id)}`;
  // ---------- the calendar ----------
  function eventCard(e, link) {
    const start = sec(e.startsAt);
    const mine = e.mine ? h("span", { class: "badge " + (e.mine.status === "yes" ? "green" : e.mine.status === "no" ? "muted" : "warn"), text: `you: ${RSVP_LABELS[e.mine.status] || e.mine.status}` }) : null;
    const head = h("div", { class: "card-head" }, icon("icon-clock"), h("h3", null, link ? h("a", { href: eventHref(e.id), text: e.title }) : e.title),
      e.status === "cancelled" ? h("span", { class: "badge red", text: "cancelled" }) : null, mine, e.canManage ? h("span", { class: "badge", text: "you organize this" }) : null);
    const kv = h("dl", { class: "kv" },
      h("dt", { text: "When" }), h("dd", { text: `${fmtDateTime(start)} · ${plural(e.durationMin, "minute")}` }),
      h("dt", { text: "Organizer" }), h("dd", { text: e.organizer.displayName }),
      h("dt", { text: "Answers" }), h("dd", { text: `${e.counts.yes} yes${e.capacity ? ` of ${e.capacity} places` : ""}, ${e.counts.tentative} tentative, ${e.counts.no} no · ${e.counts.accepted || 0} accepted${e.capacity ? ` of ${e.capacity}` : ""} · tanks ${e.counts.byRole.tank}, healers ${e.counts.byRole.healer}, damage ${e.counts.byRole.damage}` }),
      e.mine && e.mine.decision ? [h("dt", { text: "Roster" }), h("dd", { text: `You are ${DECISION_WORDS[e.mine.decision] || e.mine.decision}.` })] : null,
      e.roleTargets ? [h("dt", { text: "Wanted" }), h("dd", { text: `${e.roleTargets.tank} tanks, ${e.roleTargets.healer} healers, ${e.roleTargets.damage} damage` })] : null,
      e.mine && e.mine.changedSinceRsvp ? [h("dt", { text: "Note" }), h("dd", { text: "The start time changed after you answered; answer again if it no longer suits you." })] : null,
      e.myAttendance ? [h("dt", { text: "Attendance" }), h("dd", { text: `${ATTENDANCE_WORDS[e.myAttendance.state] || e.myAttendance.state}${e.myAttendance.reasonCode ? ` (${REASON_WORDS[e.myAttendance.reasonCode] || e.myAttendance.reasonCode})` : ""}, recorded ${fmtShort(sec(e.myAttendance.recordedAt))}` })] : null);
    return h("div", { class: "card event" }, head, e.details ? h("p", { class: "details", text: e.details }) : null, kv);
  }
  async function communityCalendar(body) {
    const DAY = 86400;
    let from = nowSec(), to = from + 31 * DAY;
    const list = h("div", { class: "stack" });
    const status = h("p", { class: "muted small", text: "Loading…" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    const range = h("span", { class: "muted small" });
    let cursor = null, generation = 0; // .102 (F96-1): every load is bound to the window it asked for; a reply to a window the viewer has left is discarded
    const load = async (restart) => {
      const gen = ++generation;
      const win = { from, to };
      if (restart) { clear(list); cursor = null; }
      more.disabled = true;
      range.textContent = `${fmtShort(win.from)} – ${fmtShort(win.to)}`;
      try {
        const params = cursor ? `cursor=${encodeURIComponent(cursor)}` : `from=${encodeURIComponent(isoOf(win.from))}&to=${encodeURIComponent(isoOf(win.to))}`;
        const data = await api("GET", `/api/community/events?${params}`);
        if (gen !== generation) return; // Earlier or Later was pressed meanwhile: these rows belong to the window that was left
        for (const e of data.events) list.appendChild(eventCard(e, true));
        cursor = data.nextCursor;
        more.hidden = !cursor;
        status.textContent = list.firstChild ? "" : "Nothing is scheduled in this window.";
      } catch (e) {
        if (gen !== generation) return;
        if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); }
        status.textContent = explain(e, "The calendar could not be read.");
        if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
      } finally { if (gen === generation) more.disabled = false; }
    };
    more.addEventListener("click", () => load(false));
    const shift = (d) => { from += d; to += d; load(true); };
    add(body, frame("Calendar", h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Earlier", onclick: () => shift(-31 * DAY) }), range, h("button", { class: "btn small", type: "button", text: "Later", onclick: () => shift(31 * DAY) }), can("organizer") ? h("a", { class: "btn small", href: "#/community/calendar/new", text: "Schedule an event" }) : null),
      h("p", { class: "muted small", text: "Guild events as the organizers scheduled them, with the answers of confirmed members. Open an event to answer. Times are shown in your own time zone." }),
      status, list, h("div", { class: "btn-row" }, more)));
    if (feat("attendance")) add(body, myAttendancePanel());
    load(true);
  }
  function myAttendancePanel() {
    const tbody = h("tbody");
    const table = h("div", { class: "table-wrap", hidden: true }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Event" }), h("th", { text: "When" }), h("th", { text: "Recorded" }))), tbody));
    const status = h("p", { class: "muted small", text: "Loading…" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null;
    const load = async (restart) => {
      if (restart) { clear(tbody); cursor = null; }
      more.disabled = true;
      try {
        const data = await api("GET", "/api/community/attendance/me" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""));
        for (const a of data.entries) tbody.appendChild(h("tr", null, h("td", { class: "wrap" }, h("a", { href: eventHref(a.event.id), text: a.event.title })), h("td", { text: fmtDateTime(sec(a.event.startsAt)) }), h("td", { text: `${ATTENDANCE_WORDS[a.state] || a.state}${a.reasonCode ? ` (${REASON_WORDS[a.reasonCode] || a.reasonCode})` : ""} · ${fmtShort(sec(a.recordedAt))}` })));
        cursor = data.nextCursor;
        more.hidden = !cursor;
        table.hidden = !tbody.firstChild;
        status.textContent = tbody.firstChild ? "" : "No attendance has been recorded for you yet.";
      } catch (e) {
        if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); }
        status.textContent = explain(e, "Your attendance record could not be read.");
      } finally { more.disabled = false; }
    };
    more.addEventListener("click", () => load(false));
    load(true);
    return frame("My attendance", null, h("p", { class: "muted small", text: "What the organizers recorded about you after each event. Only you and the organizers see it; it is informational and changes no role." }), status, table, h("div", { class: "btn-row" }, more));
  }
  async function communityEvent(body, id) {
    const holder = h("div", { class: "stack" });
    add(body, holder);
    const back = () => h("a", { class: "btn small", href: "#/community/calendar", text: "Calendar" });
    const fail = (e) => {
      clear(holder);
      holder.appendChild(frame("Event", back(), noticeBox("warn", "icon-warning", h("p", { text: explain(e, "The event could not be read.") }))));
      if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
    };
    const draw = (data, message) => {
      clear(holder);
      const e = data.event;
      if (!e) { holder.appendChild(frame("Event", back(), noticeBox("warn", "icon-warning", h("p", { text: data.hydration === "too_large" ? COMMUNITY_ERRORS.events_too_large : "This event could not be read right now." })))); return; }
      if (message) holder.appendChild(noticeBox("warn", "icon-warning", h("p", { text: message })));
      holder.appendChild(frame(e.title, h("div", { class: "btn-row" }, back(), e.canManage ? [h("a", { class: "btn small", href: `${eventHref(e.id)}/edit`, text: "Edit" }), feat("attendance") ? h("a", { class: "btn small", href: `${eventHref(e.id)}/attendance`, text: "Attendance" }) : null, h("a", { class: "btn small", href: `${eventHref(e.id)}/discord`, text: "Discord announcement" })] : null), eventCard(e, false)));
      holder.appendChild(can("confirmedGuildData") ? rsvpForm(e, reload) : memberActionNotice());
      holder.appendChild(signupsPanel(id, data.signups || [], data.nextCursor || null, e));
    };
    const reload = async (message) => {
      try { draw(await api("GET", `/api/community/event?id=${encodeURIComponent(id)}`), message); } catch (e) { fail(e); }
    };
    await reload();
  }
  // .130: explicit organizer publication. A lost answer survives navigation/reload as a tab-local operation marker;
  // an absent read is never permission to resend. The Worker owns every destination, authority and custody check.
  async function organizerEventDiscord(body, id) {
    if (!can("organizer")) { add(body, frame("Discord announcement", null, h("p", { text: "Only the event organizer or a site administrator can manage its announcement." }))); return; }
    const key = "olympus.eventDelivery." + id;
    const opPattern = /^[A-Za-z0-9_-]{22}$/;
    const messagePattern = /^https:\/\/discord\.com\/channels\/[0-9]{17,20}\/[0-9]{17,20}\/([0-9]{17,20})$/;
    const states = ["claimed", "posted", "refused", "unknown", "removed"];
    const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    const validDelivery = (v) => v === null || (object(v) && states.includes(v.state) && Number.isSafeInteger(v.revision) && v.revision > 0 && typeof v.stale === "boolean" && typeof v.removalPending === "boolean" && typeof v.operationId === "string" && opPattern.test(v.operationId) && (v.messageUrl === null || (typeof v.messageUrl === "string" && messagePattern.test(v.messageUrl))) && typeof v.retainUntil === "string" && Number.isFinite(Date.parse(v.retainUntil)));
    let pending = null, storageUnavailable = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) { const v = JSON.parse(raw); if (!object(v) || typeof v.opId !== "string" || !opPattern.test(v.opId) || !["publish", "remove", "reconcile"].includes(v.kind)) throw new Error("unknown operation"); pending = v; }
    } catch { storageUnavailable = true; }
    const remember = (v) => { try { sessionStorage.setItem(key, JSON.stringify(v)); pending = v; return true; } catch { storageUnavailable = true; return false; } };
    const forget = () => { try { sessionStorage.removeItem(key); pending = null; } catch { storageUnavailable = true; } };
    const panel = h("div", { class: "stack" }); add(body, panel);
    let current = null, busy = false, sequence = 0;
    const live = () => document.body.contains(panel);
    const status = h("p", { class: "muted small", role: "status", "aria-live": "polite" });
    const preview = h("div", { class: "stack", "data-announcement-preview": "" });
    const exactText = h("pre", { class: "details", style: "white-space:pre-wrap;overflow-wrap:anywhere" });
    const exactDetails = h("details", {}, h("summary", { text: "Exact Discord message text" }), exactText);
    const showPreview = (content) => {
      clear(preview); exactText.textContent = content || ""; exactDetails.hidden = !content;
      if (!content) { preview.appendChild(h("p", { text: "An announcement preview is unavailable." })); return; }
      const lines = content.split("\n"), title = lines[0] && /^\*\*(.*)\*\*$/.exec(lines[0]);
      const when = lines[1] && /^<t:([0-9]{1,12}):F> · <t:\1:R>$/.exec(lines[1]);
      const duration = lines[2] && /^Duration: ([0-9]+) minutes$/.exec(lines[2]);
      const calendar = lines[3] && /^\[Sign up on the Olympus calendar\]\((https:\/\/[a-z0-9.-]+\/#\/community\/calendar\/[A-Za-z0-9_-]{22})\)$/.exec(lines[3]);
      const seconds = when && Number(when[1]);
      if (lines.length !== 5 || !title || !when || !duration || !calendar || !calendar[1].endsWith("/" + id) || !Number.isSafeInteger(seconds) || !Number.isFinite(new Date(seconds * 1000).getTime())) {
        preview.appendChild(h("p", { text: content })); return;
      }
      add(preview, [h("strong", { text: title[1].replace(/\\([\\`*_{}\[\]()<>#|~])/g, "$1") }),
        h("p", { text: fmtDateTime(seconds) }), h("p", { text: lines[2] }),
        h("a", { href: calendar[1], text: "Sign up on the Olympus calendar" }), h("p", { text: lines[4] }),
        h("p", { class: "muted small", text: "Time is shown in your browser's time zone. Discord shows each reader their local time." })]);
    };
    const publish = h("button", { class: "btn", type: "button", text: "Publish announcement" });
    const remove = h("button", { class: "btn small", type: "button", text: "Remove announcement" });
    const refresh = h("button", { class: "btn small", type: "button", text: "Refresh announcement status" });
    const message = h("input", { type: "text", autocomplete: "off", placeholder: "Discord message link or message ID" });
    const reconcile = h("button", { class: "btn small", type: "button", text: "Check existing message" });
    const link = h("div", { class: "btn-row" });
    add(panel, frame("Discord announcement", h("a", { class: "btn small", href: eventHref(id), text: "Back to event" }),
      h("p", { text: "Preview the announcement before publishing it to raid-signups. It contains the event title, time, duration and calendar link. Sign-ups stay on the website; this message does not ping members." }), status, preview, exactDetails, link,
      h("div", { class: "btn-row" }, publish, remove, refresh),
      fieldBox("event-discord-message", "Find an announcement after a lost answer", message, { hint: "Open raid-signups in Discord, copy the bot's message link, then check it here. Checking an existing message does not post another one." }), reconcile));
    const buttons = () => {
      const d = current && current.delivery, held = d && ["claimed", "unknown"].includes(d.state);
      publish.textContent = d && d.state === "posted" ? "Update announcement" : "Publish announcement";
      publish.disabled = busy || storageUnavailable || !!pending || !current || !current.canPublish || !!held || !!(d && d.removalPending) || !!(d && d.state === "posted" && !d.stale);
      remove.disabled = busy || storageUnavailable || !!(pending && (!d || pending.opId !== d.operationId)) || !d || !d.messageUrl || d.state === "claimed" || d.state === "removed";
      reconcile.disabled = busy || storageUnavailable || !d || !held || !!(pending && pending.opId !== d.operationId);
      refresh.disabled = busy; message.disabled = busy || reconcile.disabled;
    };
    const draw = (data) => {
      if (!object(data) || data.eventId !== id || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.enabled !== "boolean" || typeof data.canPublish !== "boolean" || typeof data.publicationClosed !== "boolean" || !validDelivery(data.delivery) ||
        !(data.payload === null ? data.payloadHash === null : object(data.payload) && typeof data.payload.content === "string" && data.payload.content.length <= 1024 && object(data.payload.allowed_mentions) && Array.isArray(data.payload.allowed_mentions.parse) && data.payload.allowed_mentions.parse.length === 0 && typeof data.payloadHash === "string" && /^[0-9a-f]{64}$/.test(data.payloadHash)) ||
        (data.canPublish && (!data.enabled || !data.payload || data.publicationClosed))) throw new ApiError(200, { error: "unreadable_answer" });
      current = data;
      const d = data.delivery;
      if (pending && (data.publicationClosed || (pending.kind === "publish" && d && d.state === "posted" && !d.stale && !d.removalPending) || (pending.kind === "remove" && d && d.state === "removed") || (d && d.operationId === pending.opId && ["posted", "removed", "refused"].includes(d.state) && !(d.state === "posted" && d.removalPending)))) forget();
      showPreview(data.payload && data.payload.content);
      clear(link); if (d && d.messageUrl) link.appendChild(h("a", { class: "btn small", href: d.messageUrl, target: "_blank", rel: "noopener noreferrer", text: "Open Discord announcement" }));
      status.textContent = storageUnavailable ? "This tab cannot preserve operation status. Publication is held; use a browser tab with session storage available." :
        data.publicationClosed ? "Publication is closed for this event because an earlier announcement could not be safely resolved within its retention period. It cannot be posted again." :
        pending || (d && ["claimed", "unknown"].includes(d.state)) ? "The outcome is unresolved. Refresh status or check the existing Discord message; do not post another announcement." :
        d && d.removalPending ? "Removal is pending. Check the existing message before completing removal." :
        !data.enabled ? "Discord announcements are switched off. A known existing announcement can still be removed." :
        d && d.state === "posted" ? (d.stale ? "The event changed. Preview and update its existing announcement." : "The announcement is published and matches this event revision.") :
        d && d.state === "removed" ? "The announcement was removed." : d && d.state === "refused" ? "Discord refused the previous attempt. Review the preview before trying again." :
        data.canPublish ? "Ready to publish the preview." : "This event is not currently eligible for publication.";
      buttons();
    };
    const load = async () => {
      if (busy || !live()) return;
      const n = ++sequence; busy = true; buttons();
      try { const data = await api("GET", `/api/community/events/discord?eventId=${encodeURIComponent(id)}`); if (n === sequence && live()) draw(data); }
      catch (ex) { current = null; clear(preview); exactText.textContent = ""; exactDetails.hidden = true; clear(link); status.textContent = explain(ex, "Announcement status could not be read. Check the existing operation before publishing again."); }
      finally { if (n === sequence) { busy = false; buttons(); } }
    };
    const action = async (kind) => {
      if (busy || !current || !live()) return;
      buttons(); const button = kind === "publish" ? publish : kind === "remove" ? remove : reconcile; if (button.disabled) return;
      const d = current.delivery, opId = kind === "reconcile" ? d.operationId : b64url(16);
      const payload = kind === "publish" ? { eventId: id, revision: current.revision, opId, payloadHash: current.payloadHash } : { eventId: id, opId };
      if (kind === "reconcile") {
        const text = message.value.trim(), match = messagePattern.exec(text);
        const messageId = match ? match[1] : text;
        if (!/^[0-9]{17,20}$/.test(messageId)) { status.textContent = "Enter a Discord message link or its numeric message ID."; return; }
        payload.messageId = messageId;
      }
      if (!remember({ kind, opId })) { buttons(); status.textContent = "The browser could not preserve this operation. Nothing was sent."; return; }
      busy = true; buttons();
      try {
        const result = await api("POST", `/api/community/events/discord/${kind}`, payload);
        if (!object(result) || result.eventId !== id || !Number.isSafeInteger(result.revision) || result.revision < 1 || !validDelivery(result.delivery) || !result.delivery || result.delivery.operationId !== opId ||
          (kind === "remove" ? result.delivery.state !== "removed" : result.delivery.state !== "posted" || result.delivery.removalPending)) throw new ApiError(200, { error: "unreadable_answer" });
        forget(); message.value = "";
      } catch (ex) {
        // These are definite pre-effect refusals. Every other answer remains bound to its operation until a durable read proves it.
        if (!uncertain(ex) && ["feature_disabled", "delivery_not_configured", "preview_changed", "stale_revision", "publication_closed", "event_not_scheduled", "event_creation_horizon", "not_organizer", "membership_unconfirmed", "delivery_destination_unqualified", "delivery_destination_changed", "delivery_custody_unqualified", "delivery_not_held"].includes(codeOf(ex))) forget();
        status.textContent = uncertain(ex) ? "The answer was lost. Check status or the existing message before taking any further action." : explain(ex, "The announcement could not be completed.");
      } finally { busy = false; buttons(); }
      await load();
    };
    publish.addEventListener("click", () => action("publish")); remove.addEventListener("click", () => action("remove")); reconcile.addEventListener("click", () => action("reconcile")); refresh.addEventListener("click", load);
    buttons(); await load();
    await organizerEventReminder(panel, id);
  }
  async function organizerEventReminder(body, id) {
    const panel = h("div", { class: "stack", "data-event-reminder": "" }); add(body, panel);
    const choice = h("input", { type: "checkbox", id: "event-reminder-consent" });
    const arm = h("button", { class: "btn small", type: "button", text: "Enable one reminder" });
    const stop = h("button", { class: "btn small", type: "button", text: "Stop reminder" });
    const refresh = h("button", { class: "btn small", type: "button", text: "Refresh reminder status" });
    const message = h("input", { type: "text", placeholder: "Reminder message ID or Discord link", autocomplete: "off" });
    const check = h("button", { class: "btn small", type: "button", text: "Check existing reminder" });
    const remove = h("button", { class: "btn small", type: "button", text: "Remove reminder" });
    const status = h("p", { role: "status", "aria-live": "polite", class: "small" });
    const preview = h("pre", { class: "details", style: "white-space:pre-wrap;overflow-wrap:anywhere" });
    const link = h("div", { class: "btn-row" });
    add(panel, frame("Optional raid reminder", null,
      h("p", { text: "Opt in separately for one reminder in raid-signups, with this event's title, time and calendar link. It does not ping or name attendees. It becomes due sixty minutes before the start; the half-hour scheduler sends at its next eligible tick. Outages or a busy queue can delay or prevent delivery; nothing is sent after the event starts." }),
      status, preview, h("label", { class: "check field", for: "event-reminder-consent" }, choice, "I want one reminder for this event revision"),
      h("div", { class: "btn-row" }, arm, stop, refresh), link,
      fieldBox("event-reminder-message", "Find a reminder after a lost answer", message), h("div", { class: "btn-row" }, check, remove)));
    const states = ["armed", "claimed", "posted", "refused", "unknown", "cancelled", "removed"];
    const pattern = /^https:\/\/discord\.com\/channels\/[0-9]{17,20}\/[0-9]{17,20}\/([0-9]{17,20})$/;
    let current = null, busy = false;
    const live = () => document.body.contains(panel);
    const buttons = () => {
      const r = current && current.reminder;
      choice.disabled = busy || !current || !current.canArm;
      arm.disabled = choice.disabled || !choice.checked;
      stop.disabled = busy || !r || !["armed", "claimed", "unknown", "posted"].includes(r.state);
      check.disabled = busy || !r || !["claimed", "unknown"].includes(r.state);
      remove.disabled = busy || !r || !r.messageUrl || r.state === "removed";
      message.disabled = check.disabled; refresh.disabled = busy;
    };
    const draw = (v) => {
      const r = v && v.reminder;
      if (!v || v.eventId !== id || !Number.isSafeInteger(v.revision) || v.revision < 1 || typeof v.enabled !== "boolean" || typeof v.closed !== "boolean" || typeof v.canArm !== "boolean" ||
        (r !== null && (!r || typeof r.state !== "string" || !states.includes(r.state) || !Number.isSafeInteger(r.revision) || r.revision < 1 || typeof r.stale !== "boolean" || typeof r.removalPending !== "boolean" || typeof r.operationId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(r.operationId) ||
          !(r.messageUrl === null || (typeof r.messageUrl === "string" && pattern.test(r.messageUrl))) || typeof r.dueAt !== "string" || !Number.isFinite(Date.parse(r.dueAt)) || typeof r.retainUntil !== "string" || !Number.isFinite(Date.parse(r.retainUntil)))) ||
        !(v.payload === null || (v.payload && typeof v.payload.content === "string" && v.payload.content.length <= 1024 && v.payload.allowed_mentions && Array.isArray(v.payload.allowed_mentions.parse) && v.payload.allowed_mentions.parse.length === 0)) || (v.canArm && (!v.enabled || v.closed || !v.payload || (r && (!["armed", "cancelled", "refused"].includes(r.state) || r.messageUrl || r.removalPending))))) throw new ApiError(200, { error: "unreadable_answer" });
      current = v; choice.checked = false; preview.textContent = v.payload ? v.payload.content : "Preview unavailable."; clear(link);
      if (r && r.messageUrl) link.appendChild(h("a", { href: r.messageUrl, target: "_blank", rel: "noopener noreferrer", text: "Open Discord reminder" }));
      status.textContent = r && ["claimed", "unknown"].includes(r.state) ? "Delivery is unresolved. Check the existing message; no automatic resend will occur." :
        r && r.removalPending ? "The stored reminder needs removal. Local cleanup does not delete a Discord message." :
        v.closed ? "Reminder custody expired. This event cannot send another reminder." : r && r.state === "armed" ? "One reminder is armed for this revision. Editing the event cancels this consent." :
        r && r.state === "posted" ? "The reminder was delivered." : r && r.state === "removed" ? "The reminder was removed." : !v.enabled ? "Automatic reminders are switched off." : r ? "Reminder state: " + r.state + "." : "No reminder is enabled.";
    };
    const load = async () => {
      if (busy || !live()) return; busy = true; buttons();
      try { const v = await api("GET", `/api/community/events/reminder?eventId=${encodeURIComponent(id)}`); if (live()) draw(v); }
      catch (ex) { current = null; preview.textContent = ""; clear(link); status.textContent = explain(ex, "Reminder status could not be verified. Nothing will be resent automatically."); }
      finally { busy = false; buttons(); }
    };
    const action = async (kind) => {
      if (busy || !current || !live()) return; buttons();
      const control = { arm, stop, check, remove }[kind]; if (control.disabled) return;
      const r = current.reminder;
      const payload = kind === "arm" || kind === "stop" ? { eventId: id, revision: current.revision, enabled: kind === "arm" } : { eventId: id, opId: r.operationId };
      if (kind === "check") { const value = message.value.trim(), match = pattern.exec(value); payload.messageId = match ? match[1] : value; if (!/^[0-9]{17,20}$/.test(payload.messageId)) { status.textContent = "Enter a numeric message ID or Discord message link."; return; } }
      busy = true; buttons();
      try { const v = await api("POST", "/api/community/events/reminder" + (kind === "check" ? "/reconcile" : kind === "remove" ? "/remove" : ""), payload); if (live()) draw(v); }
      catch (ex) { current = null; status.textContent = uncertain(ex) ? "The answer was lost. Refresh status before another action; do not resend a reminder." : explain(ex, "Reminder action was not confirmed."); }
      finally { busy = false; buttons(); }
      await load();
    };
    choice.addEventListener("change", buttons); arm.addEventListener("click", () => action("arm")); stop.addEventListener("click", () => action("stop")); check.addEventListener("click", () => action("check")); remove.addEventListener("click", () => action("remove")); refresh.addEventListener("click", load);
    buttons(); await load();
  }
  function rsvpForm(e, reload) {
    const closed = e.status === "cancelled" || sec(e.startsAt) <= nowSec();
    const status = selectOf(Object.keys(RSVP_LABELS).map((k) => ({ key: k, label: RSVP_LABELS[k] })), e.mine ? e.mine.status : "", { placeholder: "Choose…" });
    const character = h("input", { type: "text", value: e.mine && e.mine.character ? e.mine.character : "", placeholder: "First Last" });
    const raidRole = selectOf(Object.keys(RAID_ROLE_LABELS).map((k) => ({ key: k, label: RAID_ROLE_LABELS[k] })), e.mine && e.mine.raidRole ? e.mine.raidRole : "", { placeholder: "No raid role" });
    const remind = h("input", { type: "checkbox", checked: !!(e.mine && e.mine.remindMention) }); // stage 2
    const err = errorLine(""); err.hidden = true;
    const save = h("button", { class: "btn", type: "submit", text: e.mine ? "Change my answer" : "Answer" });
    const form = h("form", { class: "stack", novalidate: true },
      closed ? noticeBox("info", "icon-clock", h("p", { text: e.status === "cancelled" ? COMMUNITY_ERRORS.event_cancelled : COMMUNITY_ERRORS.event_started })) : null,
      fieldBox("rsvp-status", "Your answer", status, { required: true }),
      fieldBox("rsvp-character", "Character (optional)", character, { hint: "Which character you bring, as \"First Last\". Leave it empty to clear it." }),
      fieldBox("rsvp-role", "Raid role (optional)", raidRole),
      fieldBox("rsvp-remind", "Mention me in the Discord reminder", remind, { hint: "If the organizer sends the raid reminder to Discord an hour before the start, it mentions you while your answer is yes; your Discord account then appears in that message." }),
      h("p", { class: "muted small", text: "Your answer is shown to guild members and site administrators by your display name. A yes takes a place while places are limited; the organizers may record attendance afterwards." }),
      err, h("div", { class: "btn-row savebar" }, save));
    if (closed) { status.disabled = true; character.disabled = true; raidRole.disabled = true; remind.disabled = true; save.disabled = true; }
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      if (!status.value) { err.textContent = COMMUNITY_ERRORS.invalid_status; err.hidden = false; return; }
      save.disabled = true;
      const payload = { eventId: e.id, status: status.value, revision: e.mine ? e.mine.revision : 0, character: character.value.trim() ? character.value.trim() : null, raidRole: raidRole.value || null, remindMention: remind.checked };
      try {
        const out = await api("PUT", "/api/community/events/rsvp", payload);
        if (eventWithheld(out)) { receiptBar("Answer saved. ", `Your answer was stored, but the event cannot be shown to you right now (${HYDRATION_WORDS[out.hydration]}). The answer stands.`); await reload(); return; } // .108: a valid withheld receipt
        if (!out || !out.event || out.event.id !== payload.eventId) throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1); .107 (group 1): the answer is for THIS event
        toast("Answer saved.", "good");
        await reload();
      } catch (ex) {
        const code = codeOf(ex);
        if (uncertain(ex)) { await reload("The answer was lost, so the event was re-read: check your answer below before sending it again."); return; } // .104: reconcile, never resend on its own
        if (ex && ex.data && ex.data.event && ["stale_revision", "event_full", "calendar_full", "event_started", "event_cancelled"].includes(code)) { await reload(explain(ex, "Your answer could not be saved.")); return; }
        err.textContent = explain(ex, "Your answer could not be saved.");
        err.hidden = false;
        save.disabled = false;
        if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
      }
    });
    return frame("Your answer", e.mine ? h("span", { class: "badge green", text: `answered ${RSVP_LABELS[e.mine.status] || e.mine.status}` }) : null, form);
  }
  function signupsPanel(id, firstPage, firstCursor, e) {
    const tbody = h("tbody");
    const table = h("div", { class: "table-wrap", hidden: true }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Member" }), h("th", { text: "Answer" }), h("th", { text: "Character" }), h("th", { text: "Role" }), h("th", { text: "Roster" }))), tbody));
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = firstCursor;
    const subtitle = (ev) => `${ev.counts.yes} yes · ${ev.counts.tentative} tentative · ${ev.counts.no} no · ${ev.counts.accepted || 0} accepted`;
    const counts = h("span", { class: "muted small", text: subtitle(e) });
    // stage 2 (15 Oct 2026): the roster column. Everyone sees the decision; the organizer who manages the event decides per row through
    // POST /api/community/events/decide (the Worker enforces the capacity: accepted first, bench and declined never hold a place). A command
    // is acknowledged only by one of the Worker's two exact outcomes for this ref: the sent decision at revision + 1, or — for a clear sent
    // against a row that was undecided when the command was built — no decision at the unchanged revision. Any other readable 2xx, an
    // unreadable or lost answer re-reads the list and says the answer was lost (the decision may be stored); a definite refusal says why and
    // re-reads; nothing is resubmitted. Every reply is bound to this view (route, account, this table still on the page): a reply that arrives
    // after the page moved on changes nothing; readbacks are sequenced and only the latest replaces the list; a failed readback says so (F4a/F4b, 15 Oct 04:11).
    const REFUSED_WORDS = { full: "No place left: raise the capacity, or bench or decline someone first.", not_signed_up: "Only a member who answered yes or tentative can be accepted.", stale_revision: "This row changed meanwhile.", unknown_member: "That member no longer qualifies to be shown; nothing was decided.", invalid: "That decision was not understood; nothing was decided." };
    // the view as this table was drawn: route, signed-in state, account, the context's subject, capabilities and features (by value), and the table still on the page
    const fingerprint = () => JSON.stringify([currentRoute(), !!S.signedIn, S.user ? S.user.id : null, COM().subject ? COM().subject.discordId : null, COM().capabilities, COM().features]);
    const view = fingerprint();
    const attached = () => { for (let n = tbody; n; n = n.parentNode) if (n === document) return true; return false; };
    const alive = () => attached() && fingerprint() === view;
    // readSeq: the latest list read owns the table; generation: moves whenever the rows are replaced, so a command built from a replaced row is obsolete (F4b.2)
    let readSeq = 0, generation = 0;
    const reread = async (lead, text) => {
      const my = ++readSeq, live = () => my === readSeq && alive();
      let data = null, failure = null;
      try { data = await fetchPage(null, live); } catch (again) { failure = again; }
      if (!live()) return; // an obsolete readback (a newer one is in flight) or a departed view: nothing is replaced, nothing is said
      if (data) { generation++; clear(tbody); put(data.signups); cursor = data.nextCursor; finish(); if (data.event && data.event.counts) counts.textContent = subtitle(data.event); receiptBar(lead, `${text} The list was re-read from the Worker.`); }
      else { status.textContent = explain(failure, "The list could not be re-read."); receiptBar(lead, `${text} The list could not be re-read; reload the page before deciding again.`); }
    };
    const rosterCell = (s) => {
      const word = s.decision ? DECISION_WORDS[s.decision] || s.decision : "—";
      if (!(e.canManage && s.ref)) return h("td", { text: word });
      const pick = selectOf([{ key: "accepted", label: "Accepted" }, { key: "bench", label: "Bench" }, { key: "declined", label: "Declined" }], s.decision || "", { placeholder: "no decision" });
      pick.setAttribute("aria-label", "Roster decision");
      const saveBtn = h("button", { class: "btn small", type: "button", text: "Save" });
      const born = generation, owned = () => alive() && born === generation; // this row's controls: the view alive and the rows not replaced since they were drawn
      saveBtn.addEventListener("click", async () => {
        const contextRead = readSeq; // A newer authoritative roster read supersedes this command's context refresh immediately.
        const sent = { ref: s.ref, decision: pick.value || null, revision: s.decisionRevision || 0 }, prior = typeof s.decision === "string" ? s.decision : null; // the row as this command sees it
        saveBtn.disabled = true; pick.disabled = true;
        const settle = () => { if (owned()) { pick.disabled = false; saveBtn.disabled = false; } };
        try {
          const out = await api("POST", "/api/community/events/decide", { eventId: id, entries: [sent] }, { live: owned });
          if (!owned()) return; // the page moved on, or the rows were replaced, while the Worker answered: the Worker's state stands and the current rows show it; nothing is said here
          const r = out && Array.isArray(out.results) ? out.results.find((x) => x && typeof x === "object" && x.ref === sent.ref) : null;
          const acknowledged = !!r && (r.result === "ok" || Object.prototype.hasOwnProperty.call(REFUSED_WORDS, r.result)) && Number.isInteger(r.revision);
          if (!acknowledged) throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1): no closed receipt is a lost answer, never "nothing changed"
          if (r.result === "ok") {
            const changed = r.decision === sent.decision && r.revision === sent.revision + 1; // exact typed equality: one of the three words, or null
            const noop = sent.decision === null && prior === null && r.decision === null && r.revision === sent.revision; // a clear of an undecided row: the Worker stores nothing and says so at the unchanged revision
            if (!(changed || noop)) throw new ApiError(200, { error: "unreadable_answer" }); // any other receipt does not acknowledge this command
            s.decision = r.decision; s.decisionRevision = r.revision;
            toast(noop ? "No decision to clear." : r.decision ? `Roster: ${DECISION_WORDS[r.decision] || r.decision}.` : "Decision cleared.", "good");
            if (out.event && out.event.counts) counts.textContent = subtitle(out.event);
            settle();
            return;
          }
          await reread("Not decided. ", REFUSED_WORDS[r.result]);
        } catch (ex) {
          if (!owned()) return; // a failure reported after the page moved on, or after the rows were replaced, changes nothing here
          if (uncertain(ex)) { await reread("Roster answer lost. ", "The decision may have been stored. Check the row before deciding again."); return; }
          toast(explain(ex, "Nothing was decided."), "bad"); settle();
          if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity({ live: () => owned() && contextRead === readSeq }); // A pending newer reread owns the table before its response replaces the rows.
        }
      });
      return h("td", null, pick, " ", saveBtn);
    };
    const put = (rows) => {
      for (const s of rows) tbody.appendChild(h("tr", null, h("td", { text: s.displayName || "(no name)" }), h("td", null, RSVP_LABELS[s.status] || s.status, s.changedSinceRsvp ? [" ", h("span", { class: "badge warn", text: "before the time changed" })] : null), h("td", { text: s.character || "—" }), h("td", null, s.raidRole ? [rrIcon(s.raidRole), " ", RAID_ROLE_LABELS[s.raidRole] || s.raidRole] : "—"), rosterCell(s)));
    };
    const finish = () => { more.hidden = !cursor; table.hidden = !tbody.firstChild; status.textContent = tbody.firstChild ? "" : "Nobody has answered yet."; };
    const fetchPage = async (c, live) => api("GET", `/api/community/event?id=${encodeURIComponent(id)}${c ? `&cursor=${encodeURIComponent(c)}` : ""}`, undefined, live ? { live } : {});
    put(firstPage); finish();
    more.addEventListener("click", async () => {
      more.disabled = true;
      const my = readSeq, live = () => my === readSeq && alive(); // a list read that replaces the table while this page is in flight makes the page obsolete (F4b.2)
      try {
        const data = await fetchPage(cursor, live);
        if (!live()) return; // the table was replaced meanwhile: this page and its cursor belong to the old rows
        put(data.signups); cursor = data.nextCursor; finish();
      } catch (ex) {
        if (!live()) return;
        if (codeOf(ex) === "cursor_stale") {
          toast(COMMUNITY_ERRORS.cursor_stale);
          const again = ++readSeq, still = () => again === readSeq && alive();
          try {
            const data = await fetchPage(null, still);
            if (!still()) return;
            generation++; clear(tbody); put(data.signups); cursor = data.nextCursor; finish(); // the rows are replaced only by a read that still owns the table
          } catch (again2) { if (still()) status.textContent = explain(again2, "The list could not be read."); }
          return;
        }
        status.textContent = explain(ex, "The list could not be read.");
      } finally { if (alive()) more.disabled = false; }
    });
    return frame("Who answered", counts, status, table, h("div", { class: "btn-row" }, more));
  }
  // ---------- the own trial ----------
  async function communityTrial(body) {
    try {
      const data = await api("GET", "/api/community/trial/me");
      const t = data.trial;
      if (!t) { add(body, frame("My trial", null, h("p", { text: "No trial is recorded for you." }), h("p", { class: "muted small", text: TRIAL_ABOUT }))); return; }
      const open = t.status === "active" || t.status === "extended";
      add(body, frame("My trial", h("span", { class: "badge " + (t.status === "passed" ? "green" : open ? "warn" : "muted"), text: TRIAL_WORDS[t.status] || t.status }),
        h("dl", { class: "kv" },
          h("dt", { text: "Started" }), h("dd", { text: fmtDay(sec(t.startedAt)) }),
          h("dt", { text: open ? "Review due" : "Review was due" }), h("dd", { text: fmtDay(sec(t.reviewDueAt)) }),
          t.outcome ? [h("dt", { text: "Outcome" }), h("dd", { text: `${TRIAL_WORDS[t.status] || t.status}${t.reason ? ` (${TRIAL_REASONS[t.reason] || t.reason})` : ""}` })] : null,
          h("dt", { text: "Last change" }), h("dd", { text: fmtDateTime(sec(t.updatedAt)) })),
        h("p", { class: "muted small", text: TRIAL_ABOUT })));
    } catch (e) {
      add(body, frame("My trial", null, noticeBox("warn", "icon-warning", h("p", { text: explain(e, "Your trial could not be read.") }))));
      if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
    }
  }
  // ---------- the own dues ----------
  async function communityDues(body) {
    const holder = h("div", { class: "stack dues" });
    add(body, holder);
    let current = null;
    // .102 (F96-2): the committed result's receipt lives OUTSIDE the page view (a bar on the document, like the reload notice): a later
    // refused read clears the private ledger, a changed context redraws the page, and the receipt stays until Dismiss or a navigation
    const recorded = (o, out) => receiptBar("Recorded. ", `Your acknowledgement for the week of ${fmtShort(sec(o.periodStart))} was saved${out.withheld ? `. The ledger could not be re-read afterwards (${WITHHELD_WORDS[out.withheld] || out.withheld}), so your weeks are not shown; the acknowledgement stands` : ""}.`);
    const fail = (e) => {
      clear(holder);
      holder.appendChild(frame("My dues", null, noticeBox(codeOf(e) === "contributions_disabled" ? "info" : "warn", codeOf(e) === "contributions_disabled" ? "icon-clock" : "icon-warning", h("p", { text: explain(e, "Your ledger could not be read.") }))));
      if (e && (e.status === 403 || e.status === 503) && codeOf(e) !== "contributions_disabled") refreshCommunity();
    };
    const reload = async () => {
      try { current = await api("GET", "/api/community/contributions/me"); draw(current); } catch (e) { fail(e); }
    };
    const acknowledge = async (o, button) => {
      button.disabled = true;
      try {
        const out = await api("POST", "/api/community/contributions/acknowledge", { obligationId: o.id, kind: o.canAcknowledge, expectedRevision: current.ledger.revision });
        if (!out || !out.result || typeof out.result.status !== "string") throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1): no receipt, no "Recorded"
        const st = out.result && out.result.status;
        if (st === "recorded") { toast("Acknowledged.", "good"); recorded(o, out); } // the durable receipt, whatever the re-read below answers
        else toast(ACK_WORDS[st] || `Nothing was recorded (${st}).`);
        if (out.ledger) { current = Object.assign({}, current, { ledger: out.ledger }); draw(current); return; }
        await reload(); // `ledger: null, withheld`: a fresh read, which may be refused too; the holder then shows the refusal, the receipt stays
      } catch (ex) {
        if (uncertain(ex)) { toast("The answer was lost; the ledger is re-read to show what was recorded.", "bad"); await reload(); return; } // .104
        toast(explain(ex, "The acknowledgement could not be recorded."), "bad");
        if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
        await reload();
      }
    };
    function draw(data) {
      clear(holder);
      const L = data.ledger, P = data.policy, M = data.mailReference || {};
      const weeks = h("tbody");
      for (const o of L.obligations) {
        const ack = o.canAcknowledge && data.writable ? h("button", { class: "btn small", type: "button", text: o.canAcknowledge === "final_acknowledged" ? "Acknowledge the final notice" : "Acknowledge" }) : null;
        if (ack) ack.addEventListener("click", () => acknowledge(o, ack));
        const contacts = [];
        if (o.acknowledgedAt) contacts.push(`acknowledged ${fmtShort(sec(o.acknowledgedAt))}`);
        if (o.officerContactAt) contacts.push(`officer contact ${fmtShort(sec(o.officerContactAt))}`);
        if (o.finalNoticeAt) contacts.push(`final notice ${fmtShort(sec(o.finalNoticeAt))}`);
        if (o.finalAcknowledgedAt) contacts.push(`final notice acknowledged ${fmtShort(sec(o.finalAcknowledgedAt))}`);
        if (o.finalOfficerContactAt) contacts.push(`final officer contact ${fmtShort(sec(o.finalOfficerContactAt))}`);
        weeks.appendChild(h("tr", null,
          h("td", { text: fmtShort(sec(o.periodStart)) }),
          h("td", { text: fmtShort(sec(o.dueAt)) }),
          h("td", { class: "num", text: gold(o.amountCopper) }),
          h("td", { class: "num", text: gold(o.paidCopper) }),
          h("td", { class: "wrap" }, STAGE_WORDS[o.stage] || o.stage, o.eligible ? null : [" ", h("span", { class: "badge muted", text: "exempt as a new member" })], h("span", { class: "muted small", text: ` · ${EVIDENCE_WORDS[o.evidence] || o.evidence}` })),
          h("td", { class: "wrap" }, contacts.length ? contacts.join(" · ") : "—", o.nextReviewAt ? h("span", { class: "muted small", text: ` · next step ${fmtShort(sec(o.nextReviewAt))}` }) : null, ack ? [" ", ack] : null)));
      }
      const receipts = h("tbody");
      for (const r of L.receipts) receipts.appendChild(h("tr", null, h("td", { text: fmtShort(sec(r.observedAt)) }), h("td", { text: SOURCE_WORDS[r.source] || r.source }), h("td", { class: "num", text: gold(r.amountCopper) }), h("td", { class: "num", text: gold(r.allocatedCopper) }), h("td", { class: "num", text: gold(r.unallocatedCopper) }), h("td", { text: r.voidedAt ? `voided ${fmtShort(sec(r.voidedAt))}` : r.status })));
      add(holder, [
        frame("My dues", h("span", { class: "badge " + (data.writable ? "green" : "muted"), text: data.writable ? "ledger open" : "read-only" }),
          h("div", { class: "grid two" },
            h("div", { class: "card" }, h("div", { class: "card-head" }, icon("pos-treasurer"), h("h3", { text: "The policy" })),
              h("p", { class: "small", text: `Weekly dues of ${gold(P.amountCopper)} (policy ${P.version}). A week starts on ${WEEKDAYS[P.anchorWeekday] || "Monday"} at ${String(P.anchorHourUtc).padStart(2, "0")}:00 UTC and is due a week later, with ${plural(P.graceHours, "hour")} of grace. New members are exempt for their first ${plural(P.newMemberExemptDays, "day")}.` }),
              h("p", { class: "muted small", text: `An unpaid week may get a notice once the officers have attested that week's payment records; ${plural(P.finalNoticeDays, "day")} after a first notice a final notice may follow, and ${plural(P.reviewDays, "day")} after that the officers review it. A review is a conversation with an officer; nothing on this page removes anyone from the guild.` })),
            h("div", { class: "card gold" }, h("div", { class: "card-head" }, icon("icon-names"), h("h3", { text: "Paying by in-game mail" })),
              h("p", { class: "small" }, "Send the gold to ", h("b", { text: M.recipient || "an officer" }), " with this reference in the subject: ", h("code", { class: "case-value", text: M.reference || "—" })),
              M.note ? h("p", { class: "muted small", text: M.note }) : null)),
          data.writable ? null : noticeBox("info", "icon-clock", h("p", { text: "The ledger is read-only right now: the officers record payments; acknowledgements are off." })),
          L.complete ? null : noticeBox("warn", "icon-warning", h("p", { text: "Some of your records are not shown right now; ask an officer if this persists." }))),
        frame("Weeks", null,
          h("p", { class: "muted small", text: "Each week the policy counts for you, what it asks and what was applied to it. Acknowledging a notice only records that you have seen it." }),
          L.obligations.length ? h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Week of" }), h("th", { text: "Due" }), h("th", { class: "num", text: "Asked" }), h("th", { class: "num", text: "Paid" }), h("th", { text: "Stage" }), h("th", { text: "Contacts" }))), weeks)) : h("p", { text: "No week has been recorded for you yet." })),
        frame("Payments", L.unallocatedCopper ? h("span", { class: "badge green", text: `credit ${gold(L.unallocatedCopper)}` }) : null,
          h("p", { class: "muted small", text: "Payments the officers matched to you: the amount, what was applied to your weeks, and what is still credit. Who recorded them and the private details stay with the officers." }),
          L.receipts.length ? h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Seen" }), h("th", { text: "Source" }), h("th", { class: "num", text: "Amount" }), h("th", { class: "num", text: "Applied" }), h("th", { class: "num", text: "Credit" }), h("th", { text: "Status" }))), receipts)) : h("p", { text: "No payments have been recorded for you yet." })),
      ]);
    }
    await reload();
  }

  // ---------------------------------------------------------------- community (.98): the organizer's event pages
  // Scheduling, editing, cancelling and attendance (community-events.ts, organizers only: SITE_ADMINS or COMMUNITY_ORGANIZERS
  // with a confirmed character). Every write carries the event's revision; every refusal is shown in words with the fresh
  // event the Worker returns. Recording attendance never touches a role; a member who no longer qualifies is "withheld".
  const EVENT_LIMITS = { titleMax: 80, detailsMax: 500, durationMin: 15, durationMax: 720, capacityMax: 100 };
  /** .101: an accessible name on a control that has no visible label of its own (a filter, a per-row select). */
  const named = (el, label) => { el.setAttribute("aria-label", label); return el; };
  /**
   * .103 (the F1 rule of .100 for every operation keyed by an id the form made once): the answer to a write was lost, so
   * the outcome is unknown. The caller froze the exact payload; this locks the form and offers the only two ways out:
   * retry THOSE bytes (the Worker answers a stored operation with its original result, never doubling) or check whether
   * it was stored. `retry()` and `check()` answer "done" | "lost" | "found" | "absent" | "unproven";
   * an unproven absence keeps the frozen operation locked. Nothing is edited or re-sent on its own.
   */
  /** Why a committed write's re-read showed nothing: the Worker's `withheld` codes, in words. */
  const WITHHELD_WORDS = {
    reader_refused: "your standing could not be confirmed at that instant",
    contribution_overflow: "an amount in it is outside the range the site shows exactly",
    target_unqualified: "that member no longer qualifies to be shown",
  };
  /** .108: an event route's committed answer whose re-read was withheld (`event: null` with a `hydration` reason) is a valid receipt, never a lost answer. */
  const HYDRATION_WORDS = { refused: "your standing could not be confirmed at that instant", too_large: "it has more answers than the page can show safely" };
  const eventWithheld = (out) => !!out && typeof out === "object" && out.event === null && Object.prototype.hasOwnProperty.call(HYDRATION_WORDS, out.hydration);
  /** .108: a property the answer itself carries (an array, a string or null carries none). */
  const owns = (o, k) => !!o && typeof o === "object" && !Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, k);
  /**
   * .102 (F96-2), shared since .106: a committed result's receipt lives OUTSIDE the page view (a bar on the document, like the
   * reload notice): a later refused read clears the private view, a changed context redraws the page, and the receipt stays
   * until Dismiss or a navigation. It offers no undo and states only what the Worker answered.
   */
  function receiptBar(lead, text) {
    for (const old of document.querySelectorAll(".receipt-bar")) old.remove();
    const bar = h("div", { class: "notice receipt-bar" }, noticeBox("info", "icon-shield",
      h("p", null, h("strong", { text: lead }), text),
      h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Dismiss", onclick: () => { bar.remove(); stackBars(); } }))));
    document.body.appendChild(bar);
    stackBars();
    window.addEventListener("hashchange", () => { bar.remove(); stackBars(); }, { once: true }); // a deliberate navigation ends it; a redraw of the same page does not
  }
  function lostAnswer({ pending, lock, retry, check, what, unprovenMessage }) {
    clear(pending);
    lock(true);
    const retryBtn = h("button", { class: "btn small", type: "button", text: "Retry the same" });
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      const r = await retry();
      if (r === "lost") { toast("The answer was lost again. Try once more, or check whether it was stored.", "bad"); retryBtn.disabled = false; }
    });
    const checkBtn = check ? h("button", { class: "btn small", type: "button", text: "Check whether it was stored" }) : null;
    if (checkBtn) checkBtn.addEventListener("click", async () => {
      checkBtn.disabled = true;
      const r = await check();
      if (r === "absent") { clear(pending); lock(false); toast("Nothing was stored under this form's id; you may change it and send again."); }
      else if (r === "unproven") { toast(unprovenMessage || "The current list does not establish whether this operation was stored. Retry the same operation to check its status."); checkBtn.disabled = false; }
      else if (r === "lost") { toast("The check did not answer.", "bad"); checkBtn.disabled = false; }
    });
    pending.appendChild(noticeBox("warn", "icon-warning",
      h("p", null, h("strong", { text: "The answer was lost. " }), `${what} may have been stored. Nothing is changed, made anew or sent again on its own: retry the SAME operation (a stored one is answered with its original result, never doubled)${check ? ", or check first whether it was stored" : ""}.`),
      h("div", { class: "btn-row" }, retryBtn, checkBtn)));
  }
  const ATTENDANCE_STATES = ["present", "absent", "excused", "unknown"];
  const ORGANIZER_ERRORS = {
    not_organizer: "Only guild organizers can do that.",
    not_event_organizer: "Only the organizer who scheduled this event (or a site admin) can change it.",
    capacity_below_signups: "The capacity cannot go below the places already taken. Lower it after the answers change.", capacity_below_accepted: "The capacity cannot go below the members already accepted on the roster. Bench or decline someone first.",
    op_conflict: "A different event was already created from this form. Reload the page to start a new one.",
    invalid_title: "Give the event a title of up to 80 characters.",
    invalid_details: "The details are too long (up to 500 characters) or contain characters the form does not accept.",
    invalid_starts_at: "Choose a start no more than a day in the past and within the next year.",
    invalid_duration_min: "The duration is 15 minutes to 12 hours.",
    invalid_capacity: "The capacity is 1 to 100 places, or empty for no limit.",
    invalid_role_targets: "Each wanted role is 0 to 100.",
    invalid_entries: "The attendance entries are not valid.",
    event_not_started: "Attendance can be recorded once the event has started.",
    invalid_op_id: "The form's operation id is not valid; reload the page.",
  };
  // .106: the organizer's own wording for a stale edit or cancel (the shared code keeps the member's RSVP wording in COMMUNITY_ERRORS)
  const ORGANIZER_STALE = "This event changed since this page loaded: another organizer edited or cancelled it, or its answers moved on. The form now shows the current event; apply your change again if it still fits.";
  for (const [k, v] of Object.entries(ORGANIZER_ERRORS)) if (!(k in COMMUNITY_ERRORS)) COMMUNITY_ERRORS[k] = v; // the member wording of a shared code stays
  const localDT = (sec) => { const d = new Date(sec * 1000); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const fromLocalDT = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
  /** .126: calendar edits must preserve the saved instant, including the second occurrence of a repeated hour. */
  function eventStartControl(initial) {
    const original = initial ? sec(initial.startsAt) : null;
    const readZone = () => { try { return DT().resolvedOptions().timeZone || null; } catch { return null; } };
    const zone = readZone();
    const utcInput = (t) => isoOf(t).slice(0, 16);
    const start = h("input", { type: "datetime-local", value: original === null ? localDT(Math.ceil((nowSec() + 86400) / 1800) * 1800) : localDT(original), required: true });
    const mode = selectOf([{ key: "local", label: zone ? `Your time zone (${zone})` : "Your time zone" }, { key: "utc", label: "UTC" }], "local", { placeholder: null });
    const occurrence = h("select", { "aria-label": "Clock change occurrence", "data-event-occurrence": "true" });
    const choices = fieldBox("ev-occurrence", "Clock change occurrence", occurrence);
    choices.hidden = true;
    const preview = h("p", { class: "muted small", "aria-live": "polite" });
    let cache = null, priorMode = "local", error = "", known = null;
    const inputKey = () => `${mode.value}|${start.value}|${readZone()}`;
    const parts = (value) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
      if (!m) return null;
      const [year, month, day, hour, minute] = m.slice(1).map(Number);
      const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, 0, 0);
      return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day && d.getUTCHours() === hour && d.getUTCMinutes() === minute ? { year, month, day, hour, minute, wall: d.getTime() } : null;
    };
    const sameLocal = (d, p) => d.getFullYear() === p.year && d.getMonth() + 1 === p.month && d.getDate() === p.day && d.getHours() === p.hour && d.getMinutes() === p.minute && d.getSeconds() === 0;
    const label = (t) => `${fmtDateTime(t)} · ${isoOf(t).replace(".000Z", " UTC")}`;
    function refresh() {
      if (start.disabled) return cache;
      const key = inputKey();
      if (cache && cache.key === key) return cache;
      error = ""; choices.hidden = true; clear(occurrence);
      cache = { key, values: [] };
      const p = parts(start.value);
      if (!p) { error = "Enter a valid date and time."; preview.textContent = error; return cache; }
      if (mode.value === "utc") cache.values = [Math.floor(p.wall / 1000)];
      else if (!zone || readZone() !== zone) error = "Your browser's time zone changed or could not be read. Reopen this form, or choose UTC.";
      else {
        // A bounded contemporary-calendar search, using Date fields in the loop and Intl only on its matches.
        // Unsupported offsets or Date/Intl disagreement are refused; UTC remains an unambiguous input path.
        const parsed = new Date(start.value);
        if (!Number.isFinite(parsed.getTime()) || Math.abs(parsed.getTime() - p.wall) > 26 * 3600000) error = "This local time could not be determined. Choose UTC.";
        else try {
          const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
          for (let i = -1560; i <= 1560; i++) {
            const d = new Date(p.wall + i * 60000);
            if (!sameLocal(d, p)) continue;
            const shown = Object.fromEntries(formatter.formatToParts(d).map((x) => [x.type, x.value]));
            if (Number(shown.year) !== p.year || Number(shown.month) !== p.month || Number(shown.day) !== p.day || Number(shown.hour) !== p.hour || Number(shown.minute) !== p.minute || Number(shown.second) !== 0) { error = "This local time could not be determined. Choose UTC."; cache.values = []; break; }
            cache.values.push(Math.floor(d.getTime() / 1000));
          }
          if (!error && cache.values.length === 0) error = "This local time does not exist because the clocks change. Choose another time, or enter the time in UTC.";
        } catch { error = "This local time could not be determined. Choose UTC."; cache.values = []; }
      }
      if (cache.values.length > 1) {
        choices.hidden = false;
        add(occurrence, [h("option", { value: "", text: "Choose an occurrence" }), ...cache.values.map((t, i) => h("option", { value: String(t), text: `${i === 0 ? "Earlier" : i === cache.values.length - 1 ? "Later" : "Middle"}: ${label(t)}` }))]);
        if (known && known.key === key && cache.values.includes(Math.floor(known.seconds / 60) * 60)) occurrence.value = String(Math.floor(known.seconds / 60) * 60);
        else if (original !== null && start.value === localDT(original)) occurrence.value = String(Math.floor(original / 60) * 60);
      }
      preview.textContent = error || (cache.values.length > 1 ? "The clocks change at this time. Choose the occurrence you intend." : label(cache.values[0]));
      return cache;
    }
    function value() {
      const state = refresh();
      if (error || !state || state.values.length === 0) return null;
      let t = state.values[0];
      if (state.values.length > 1) {
        if (!state.values.includes(Number(occurrence.value)) || occurrence.value === "") { error = "Choose which occurrence of this time you intend."; preview.textContent = error; return null; }
        t = Number(occurrence.value);
      }
      // The input has minute precision; an unchanged edit retains the original seconds and UTC offset.
      if (known && known.key === state.key && Math.floor(known.seconds / 60) * 60 === t) t = known.seconds;
      else if (original !== null && start.value === (mode.value === "utc" ? utcInput(original) : localDT(original)) && Math.floor(original / 60) * 60 === t) t = original;
      preview.textContent = label(t);
      return t;
    }
    start.addEventListener("input", () => { cache = null; known = null; choices.hidden = true; preview.textContent = "Check the start time before saving."; });
    start.addEventListener("change", () => { cache = null; known = null; value(); });
    occurrence.addEventListener("change", () => { error = ""; value(); });
    mode.addEventListener("change", () => {
      const next = mode.value; mode.value = priorMode;
      const t = value(); mode.value = next; priorMode = next;
      start.value = t === null ? "" : next === "utc" ? utcInput(t) : localDT(t);
      known = t === null ? null : { key: inputKey(), seconds: t };
      cache = null; value();
    });
    value();
    return { start, fields: [fieldBox("ev-time-zone", "Time zone", mode), fieldBox("ev-start", "Starts", start, { required: true }), choices, preview], value, error: () => error,
      freeze: (on) => { start.disabled = on; mode.disabled = on; occurrence.disabled = on; } };
  }
  /** The event form (new or edit). `initial` is the event or null; `onSave(values)` returns a promise of the saved event. */
  function eventForm(initial, onSave, { cancelEvent = null } = {}) {
    const title = h("input", { type: "text", maxlength: String(EVENT_LIMITS.titleMax), value: initial ? initial.title : "", required: true });
    const details = h("textarea", { rows: "4", maxlength: String(EVENT_LIMITS.detailsMax) });
    details.value = initial ? initial.details : "";
    const time = eventStartControl(initial);
    const duration = h("input", { type: "number", min: String(EVENT_LIMITS.durationMin), max: String(EVENT_LIMITS.durationMax), value: String(initial ? initial.durationMin : 180) });
    const capacity = h("input", { type: "number", min: "1", max: String(EVENT_LIMITS.capacityMax), value: initial && initial.capacity ? String(initial.capacity) : "", placeholder: "no limit" });
    const targets = ["tank", "healer", "damage"].map((r) => h("input", { type: "number", min: "0", max: String(EVENT_LIMITS.capacityMax), value: initial && initial.roleTargets ? String(initial.roleTargets[r]) : "", placeholder: "0", "aria-label": `${RAID_ROLE_LABELS[r]} wanted`, "data-role": r }));
    const err = errorLine(""); err.hidden = true;
    const save = h("button", { class: "btn", type: "submit", text: initial ? "Save changes" : "Schedule" });
    const dirtyMark = h("span", { class: "badge warn", text: "unsaved", hidden: true });
    const form = h("form", { class: "stack", novalidate: true },
      fieldBox("ev-title", "Title", title, { required: true, hint: `Up to ${EVENT_LIMITS.titleMax} characters.` }),
      fieldBox("ev-details", "Details", details, { hint: `Up to ${EVENT_LIMITS.detailsMax} characters: what to bring, where to meet.` }),
      time.fields,
      fieldBox("ev-duration", "Duration (minutes)", duration, { hint: "15 minutes to 12 hours." }),
      fieldBox("ev-capacity", "Places", capacity, { hint: "How many yes answers take a place; empty for no limit." }),
      h("div", { class: "field" }, h("span", { class: "lab", text: "Wanted roles (optional)" }), h("div", { class: "btn-row" }, targets.map((t) => h("label", { class: "inline" }, rrIcon(t.dataset.role), " ", t)))),
      err, h("div", { class: "btn-row savebar" }, save, dirtyMark, cancelEvent ? h("button", { class: "btn small danger", type: "button", text: "Cancel this event", onclick: cancelEvent }) : null));
    const markDirty = () => setDirty("community-event", true, dirtyMark);
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    const collect = () => {
      const t = time.value();
      const v = { title: title.value.trim(), details: details.value.trim(), startsAt: t === null ? "" : isoOf(t), durationMin: Number(duration.value) };
      v.capacity = capacity.value.trim() === "" ? null : Number(capacity.value);
      const any = targets.some((x) => x.value.trim() !== "");
      v.roleTargets = any ? Object.fromEntries(targets.map((x) => [x.dataset.role, x.value.trim() === "" ? 0 : Number(x.value)])) : null;
      return v;
    };
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      const v = collect();
      if (!v.title) { err.textContent = ORGANIZER_ERRORS.invalid_title; err.hidden = false; return; }
      if (!v.startsAt) { err.textContent = time.error() || ORGANIZER_ERRORS.invalid_starts_at; err.hidden = false; return; }
      save.disabled = true;
      time.freeze(true);
      try {
        const r = await onSave(v);
        if (r === "unchanged") { save.disabled = false; time.freeze(false); }
        if (r !== "pending") setDirty("community-event", false, dirtyMark); // .109: "pending" = a lost answer waits; the form stays unsaved and the leave guard holds
      } catch (ex) {
        err.textContent = explain(ex, "The event could not be saved.");
        err.hidden = false;
        save.disabled = false;
        time.freeze(false);
        if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
      }
    });
    return form;
  }
  async function organizerNewEvent(body) {
    if (!can("organizer")) { add(body, frame("Schedule an event", null, noticeBox("info", "icon-shield", h("p", { text: ORGANIZER_ERRORS.not_organizer })))); return; }
    const opId = b64url(16); // fixed for this form: a retry after a lost answer replays the same creation (the event's id is this id)
    const pending = h("div");
    let frozen = null; // .103: the exact payload whose answer was lost
    const schedule = async (payload) => {
      const out = await api("POST", "/api/community/events", payload);
      if (eventWithheld(out)) { // .108: a valid withheld receipt: the event (its id IS this form's operation) is stored but cannot be shown now; the form is spent
        frozen = payload; clear(pending); lock(true); setDirty("community-event", false); // .109: stored; leaving the spent form asks nothing
        pending.appendChild(noticeBox("info", "icon-shield", h("p", { text: "This form's event is stored. It cannot be shown to you right now; open it from the calendar later." }), h("div", { class: "btn-row" }, h("a", { class: "btn small", href: eventHref(payload.opId), text: "Open the event" }))));
        receiptBar("Scheduled. ", `The event was stored, but it cannot be shown to you right now (${HYDRATION_WORDS[out.hydration]}). It stands; a retry from this form would be answered, never doubled.`);
        return;
      }
      if (!out || !out.event || out.event.id !== payload.opId) throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1); .107 (group 1): the event IS this form's operation
      toast(out.replay ? "This event was already scheduled from this form." : "Scheduled.", "good");
      setDirty("community-event", false); // .109: stored; the navigation asks nothing
      location.hash = eventHref(out.event.id);
    };
    let form;
    const lock = (on) => { for (const el of form.querySelectorAll("input, textarea, select, button")) el.disabled = on; };
    form = eventForm(null, async (v) => {
      if (frozen) return; // an unresolved lost answer: only the two buttons act
      const payload = { opId, title: v.title, details: v.details, startsAt: v.startsAt, durationMin: v.durationMin };
      if (v.capacity !== null) payload.capacity = v.capacity;
      if (v.roleTargets) payload.roleTargets = v.roleTargets;
      try { await schedule(payload); } catch (ex) {
        if (!uncertain(ex)) throw ex;
        frozen = payload;
        lostAnswer({ pending, lock, what: "The event",
          retry: async () => { try { await schedule(frozen); return "done"; } catch (ex2) { if (uncertain(ex2)) return "lost"; frozen = null; clear(pending); lock(false); toast(explain(ex2, "The event could not be scheduled."), "bad"); return "done"; } },
          check: async () => { try { const d = await api("GET", `/api/community/event?id=${encodeURIComponent(opId)}`); if (d && d.event && d.event.id === opId) { /* .108: the event read is THIS form's event */ toast("It was stored.", "good"); setDirty("community-event", false); location.hash = eventHref(d.event.id); return "found"; } frozen = null; return "absent"; } catch (ex2) { if (codeOf(ex2) === "event_not_found") { frozen = null; return "absent"; } return "lost"; } } });
        return "pending"; // .109: the form stays marked unsaved while the lost answer waits
      }
    });
    add(body, frame("Schedule an event", h("a", { class: "btn small", href: "#/community/calendar", text: "Calendar" }),
      h("p", { class: "muted small", text: "Confirmed members see it in the calendar and answer there. You can change or cancel it later; attendance is recorded after the start." }), form, pending));
  }
  async function organizerEditEvent(body, id) {
    const holder = h("div", { class: "stack" });
    add(body, holder);
    const draw = (data, message) => {
      clear(holder);
      const e = data.event;
      if (!e) { holder.appendChild(frame("Edit event", null, noticeBox("warn", "icon-warning", h("p", { text: "This event could not be read." })))); return; }
      if (!e.canManage) { holder.appendChild(frame(e.title, h("a", { class: "btn small", href: eventHref(e.id), text: "Back" }), noticeBox("info", "icon-shield", h("p", { text: ORGANIZER_ERRORS.not_event_organizer })))); return; }
      if (message) holder.appendChild(noticeBox("warn", "icon-warning", h("p", { text: message })));
      const closed = e.status === "cancelled" || sec(e.startsAt) <= nowSec();
      const refused = async (ex, fallback) => {
        const code = codeOf(ex);
        if (ex && ex.data && ex.data.event && ["stale_revision", "event_started", "event_cancelled", "not_event_organizer", "capacity_below_signups"].includes(code)) { draw({ event: ex.data.event }, code === "stale_revision" ? ORGANIZER_STALE : explain(ex, fallback)); return true; } // .106: the organizer's wording for a stale edit/cancel
        return false;
      };
      // .108: a lost answer to a change or a cancellation re-reads the event and says so; a repeat with the old revision is refused, never doubled
      const LOST_EDIT = "The answer was lost, so the event was re-read: check it before changing it again (a repeated change with the old revision is refused, never doubled).";
      const reread = async (message) => {
        try { const d = await api("GET", `/api/community/event?id=${encodeURIComponent(e.id)}`); if (!d || !d.event || d.event.id !== e.id) throw new ApiError(200, { error: "unreadable_answer" }); draw(d, message); }
        catch (ex2) { clear(holder); holder.appendChild(frame("Edit event", h("a", { class: "btn small", href: eventHref(e.id), text: "Back" }), noticeBox("warn", "icon-warning", h("p", { text: `${message} ${explain(ex2, "The event could not be re-read.")}` })))); }
      };
      const form = eventForm(e, async (v) => {
        const payload = { eventId: e.id, revision: e.revision };
        for (const k of ["title", "details", "startsAt", "durationMin", "capacity", "roleTargets"]) {
          const before = k === "startsAt" ? e.startsAt : e[k];
          if (JSON.stringify(v[k]) !== JSON.stringify(before)) payload[k] = v[k];
        }
        if (Object.keys(payload).length === 2) { toast("Nothing changed."); return "unchanged"; }
        try {
          const out = await api("POST", "/api/community/events/update", payload);
          if (eventWithheld(out)) { receiptBar("Saved. ", `The change was stored, but the event cannot be shown to you right now (${HYDRATION_WORDS[out.hydration]}). It stands.`); draw({ event: null }); return; } // .108: a valid withheld receipt
          if (!out || !out.event || out.event.id !== e.id) throw new ApiError(200, { error: "unreadable_answer" }); // .108: the answer is THIS event before anything is shown as saved
          toast(out.unchanged ? "Nothing changed." : "Saved.", "good");
          draw(out);
        } catch (ex) { if (uncertain(ex)) { await reread(LOST_EDIT); return; } if (!(await refused(ex, "The event could not be changed."))) throw ex; }
      }, {
        cancelEvent: closed ? null : async () => {
          if (!(await confirmBox("Cancel this event?", `"${e.title}" stays in the calendar marked cancelled; answers close. This cannot be undone.`, "Cancel the event", { danger: true }))) return;
          try {
            const out = await api("POST", "/api/community/events/cancel", { eventId: e.id, revision: e.revision });
            if (eventWithheld(out)) { receiptBar("Cancelled. ", `The cancellation was stored, but the event cannot be shown to you right now (${HYDRATION_WORDS[out.hydration]}). It stands.`); draw({ event: null }); return; } // .108: a valid withheld receipt
            if (!out || !out.event || out.event.id !== e.id) throw new ApiError(200, { error: "unreadable_answer" }); // .108: the answer is THIS event
            toast("Cancelled.", "good");
            draw(out);
          } catch (ex) { if (uncertain(ex)) { await reread(LOST_EDIT); return; } if (!(await refused(ex, "The event could not be cancelled."))) toast(explain(ex, "The event could not be cancelled."), "bad"); }
        },
      });
      if (closed) { for (const el of form.querySelectorAll("input, textarea, select, button")) el.disabled = true; }
      holder.appendChild(frame(`Edit: ${e.title}`, h("div", { class: "btn-row" }, h("a", { class: "btn small", href: eventHref(e.id), text: "Back to the event" }), feat("attendance") ? h("a", { class: "btn small", href: `${eventHref(e.id)}/attendance`, text: "Attendance" }) : null),
        closed ? noticeBox("info", "icon-clock", h("p", { text: e.status === "cancelled" ? "This event is cancelled; it cannot be changed." : "This event has started; it cannot be changed any more." })) : null,
        h("p", { class: "muted small", text: `Revision ${e.revision}. Members who answered see a note when the start moves.` }), form));
    };
    try { draw(await api("GET", `/api/community/event?id=${encodeURIComponent(id)}`)); } catch (e) { clear(holder); holder.appendChild(frame("Edit event", null, noticeBox("warn", "icon-warning", h("p", { text: explain(e, "The event could not be read.") })))); }
  }
  async function organizerAttendance(body, id) {
    const holder = h("div", { class: "stack" });
    add(body, holder);
    let cursor = null;
    const rows = new Map(); // ref → row element
    const draw = async (message) => {
      clear(holder);
      rows.clear();
      let data;
      try {
        data = await api("GET", `/api/community/event/attendance?id=${encodeURIComponent(id)}`);
      } catch (e) {
        holder.appendChild(frame("Attendance", h("a", { class: "btn small", href: eventHref(id), text: "Back" }), noticeBox("warn", "icon-warning", h("p", { text: explain(e, "The attendance list could not be read.") }))));
        if (e && (e.status === 403 || e.status === 503)) refreshCommunity();
        return;
      }
      const e = data.event;
      cursor = data.nextCursor;
      const started = e && sec(e.startsAt) <= nowSec() && e.status !== "cancelled";
      if (message) holder.appendChild(noticeBox("warn", "icon-warning", h("p", { text: message })));
      const tbody = h("tbody");
      const status = h("p", { class: "muted small" });
      const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: !cursor });
      const row = (a) => {
        const state = named(selectOf(ATTENDANCE_STATES.map((k) => ({ key: k, label: ATTENDANCE_WORDS[k] })), a.attendance ? a.attendance.state : "", { placeholder: "not recorded" }), "Attendance state");
        const reason = named(selectOf([{ key: "late", label: REASON_WORDS.late }, { key: "left_early", label: REASON_WORDS.left_early }], a.attendance && a.attendance.reasonCode ? a.attendance.reasonCode : "", { placeholder: "no note" }), "Attendance note");
        const saveBtn = h("button", { class: "btn small", type: "button", text: a.attendance ? "Change" : "Record" });
        const note = h("span", { class: "muted small", text: a.attendance ? `recorded ${fmtShort(sec(a.attendance.recordedAt))}` : "" });
        const tr = h("tr", null, h("td", { text: a.displayName || "(no name)" }), h("td", { text: a.rsvp ? RSVP_LABELS[a.rsvp] || a.rsvp : "—" }), h("td", null, state), h("td", null, reason), h("td", null, saveBtn, " ", note));
        if (!started) { state.disabled = true; reason.disabled = true; saveBtn.disabled = true; }
        saveBtn.addEventListener("click", async () => {
          if (!state.value) { toast(ORGANIZER_ERRORS.invalid_entries, "bad"); return; }
          saveBtn.disabled = true;
          const entry = { ref: a.ref, state: state.value, reasonCode: state.value === "present" && reason.value ? reason.value : null, revision: a.attendance ? a.attendance.revision : 0 };
          try {
            const out = await api("POST", "/api/community/attendance/record", { eventId: id, entries: [entry] });
            if (!out || !Array.isArray(out.results)) throw new ApiError(200, { error: "unreadable_answer" }); // .104 (F100-1)
            const r = out.results.find((x) => x.ref === a.ref) || {};
            if (r.result === "ok" && r.entry) { toast("Recorded.", "good"); a.attendance = r.entry.attendance; note.textContent = `recorded ${fmtShort(sec(a.attendance.recordedAt))}${r.superseded ? " (an earlier record was replaced)" : ""}`; saveBtn.textContent = "Change"; }
            // .106 (Codex's .98 review, item 1): the write stands, but the Worker withheld the member's details: their row (name,
            // answer, state, note) leaves the page; the receipt of the organizer's own write stays, outside the list and without them
            else if (r.result === "ok" && !r.entry && r.withheld === "target_unqualified") { withhold(a.ref); receiptBar("Recorded. ", `Your attendance record was stored; ${WITHHELD_WORDS.target_unqualified}, so their row is withheld. The record stands; a retry would be answered, never doubled.`); }
            else if (r.result === "ok" && !r.entry) { withhold(a.ref); receiptBar("Recorded. ", "Your attendance record was stored, but the Worker could not show the row; it is withheld. The record stands."); }
            else if (r.result === "stale_revision") { toast("This row changed meanwhile; the list is reloaded.", "bad"); await draw(); return; }
            else if (r.result === "unknown_member") { withhold(a.ref); toast("Nothing recorded: that member no longer qualifies to be shown, so their row is withheld.", "bad"); }
            else toast(ORGANIZER_ERRORS.invalid_entries, "bad");
          } catch (ex) {
            const code = codeOf(ex);
            if (uncertain(ex)) { await draw("The answer was lost; the list was re-read to show what was recorded."); return; } // .104: reconcile by re-reading
            if (ex && ex.data && ex.data.event && ["event_not_started", "event_cancelled", "calendar_full"].includes(code)) { await draw(explain(ex, "Nothing was recorded.")); return; }
            toast(explain(ex, "Nothing was recorded."), "bad");
            if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity();
          } finally { saveBtn.disabled = false; }
        });
        rows.set(a.ref, tr);
        return tr;
      };
      const put = (list) => { for (const a of list) tbody.appendChild(row(a)); status.textContent = tbody.firstChild ? "" : "Nobody has answered or been recorded yet."; };
      const withhold = (ref) => { const tr = rows.get(ref); if (tr) tr.remove(); rows.delete(ref); if (!tbody.firstChild) status.textContent = "No member who can be shown is on this list."; }; // .106: a protected row leaves the page
      put(data.attendance || []);
      more.addEventListener("click", async () => {
        more.disabled = true;
        try { const next = await api("GET", `/api/community/event/attendance?id=${encodeURIComponent(id)}&cursor=${encodeURIComponent(cursor)}`); put(next.attendance || []); cursor = next.nextCursor; more.hidden = !cursor; }
        catch (ex) { if (codeOf(ex) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); await draw(); return; } status.textContent = explain(ex, "The list could not be read."); }
        finally { more.disabled = false; }
      });
      holder.appendChild(frame(`Attendance: ${e ? e.title : "event"}`, h("div", { class: "btn-row" }, h("a", { class: "btn small", href: eventHref(id), text: "Back to the event" }), e && e.canManage ? h("a", { class: "btn small", href: `${eventHref(id)}/edit`, text: "Edit" }) : null),
        e && !started ? noticeBox("info", "icon-clock", h("p", { text: e.status === "cancelled" ? "This event is cancelled; nothing is recorded." : ORGANIZER_ERRORS.event_not_started })) : null,
        h("p", { class: "muted small", text: "Everyone who answered or was recorded, by display name. Recording is informational: it changes no role and no rank. A member who no longer qualifies is not shown." }),
        status, h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Member" }), h("th", { text: "Answer" }), h("th", { text: "Attendance" }), h("th", { text: "Note" }), h("th", { text: "" }))), tbody)), h("div", { class: "btn-row" }, more)));
    };
    await draw();
  }

  // ---------------------------------------------------------------- admin → Community (.98): the staff surfaces
  // SITE_ADMINS only (the Worker checks every call through site-admin.ts); each page reads and writes the real
  // /api/admin/community/* routes, carries the revision the Worker gave, and shows every refusal in words with the fresh
  // state the Worker returns. Nothing here grants or removes a Discord role; a restriction case is a record.
  const ADMIN_COMMUNITY_ERRORS = {
    stale: "This record changed since the page loaded; it has been reloaded.",
    stale_revision: "This record changed since the page loaded; it has been reloaded.",
    own_record: "You cannot act on your own record.",
    case_resolved: "This case is resolved; nothing more can be recorded on it.",
    case_conflict: "A different case already holds that id. Reload and try again.",
    not_applicable: "That action does not apply to the case as it is now.",
    trial_concluded: "This trial is concluded; it cannot be changed.",
    departure_reviewed: "This departure item was already reviewed.",
    restrictions_disabled: "Restriction cases are not switched on, so no case can be opened from here.",
    invalid_review_date: "The review date must be in the future and within the allowed period.",
    invalid_expiry: "The expiry must be after the review date and within the allowed period.",
    invalid_review_due_at: "The review date must be in the future and within 90 days.",
    invalid_discord_id: "That is not a Discord user ID.",
    invalid_sponsor_discord_id: "The sponsor must be a different Discord user ID.",
    invalid_outcome: "Choose passed or ended.",
    invalid_reason: "Choose a reason that fits the outcome.",
    invalid_period: "The week must be a Monday at 00:00 UTC, given as a date.",
    invalid_amount: "The amount is 1 copper to 2,147,483,647 copper.",
    invalid_observed_at: "Give the date the payment was seen.",
    invalid_receipt: "The payment's source, source id or status is not valid.",
    receipt_conflict: "A different payment already carries that source id.",
    contribution_limit: "The ledger's limit for this member or week is reached.",
    policy_conflict: "The policy version in force differs from the stored one; an officer must review the configuration.",
    ledger_inconsistent: "This ledger is inconsistent and refused until repaired.",
    op_conflict: "A different trial was already opened under this form's id. Reload the page to open another.", // .108: the only staff route that answers op_conflict is the trial creation
    // .109: the staff refusals a normal path reaches, in words (the shared member wording of a code stays the member's)
    trial_open_exists: "This member already has an open trial. Extend or conclude it instead.",
    account_deleted: "That account was erased; nothing can be opened for it.",
    case_not_found: "No such case, or it is past its lifetime.",
    renewal_required: "This case's watch period has ended: renew the watch-list with a reason before adding characters.",
    too_many_characters: "This case's watch-list is full.",
    no_period: "Nothing to renew yet: the first watched character opens the watch period.",
    character_not_found: "That character is no longer on this case's watch-list; the case was re-read.",
    binding_changed: "The verified record of that character changed meanwhile (owner, name or character identifier); the case was re-read. Check it and try again.",
    claim_not_found: "That claim is gone (the member changed or removed it); the list was re-read.",
    profile_not_found: "That member's profile is gone; the list was re-read.",
    operation_conflict: "A different staff operation already used this id. Reload and try again.",
    operation_limit: "This case has reached its limit of staff operations.",
    invalid_ref: "That member reference is not valid.",
    invalid_key: "That character name is not valid.",
    invalid_decision: "Choose confirm or reject.",
    not_found: "No such record, or it is past its lifetime.",
  };
  for (const [k, v] of Object.entries(ADMIN_COMMUNITY_ERRORS)) if (!(k in COMMUNITY_ERRORS)) COMMUNITY_ERRORS[k] = v; // the member wording of a shared code stays
  /** The staff wording first (the same code reads differently to a member), then the shared one. */
  const explainAdmin = (ex, fallback) => (ex && ex.data && ex.data.message) || ADMIN_COMMUNITY_ERRORS[codeOf(ex)] || explain(ex, fallback);
  /** .108: a revision-keyed staff action whose answer was lost is reconciled by re-reading; a repeat with the old revision is refused, never doubled. */
  const LOST_REREAD = "The answer was lost, so the list was re-read to show what was recorded. Check it before acting again: a repeated action with the old revision is refused, never doubled.";
  /** .109 (self-review): the ledger's own lost-answer words: the forms keep what was sent. */
  const LOST_LEDGER = "The answer was lost, so the ledger was re-read. If what you sent is not shown, send it again: the form kept it, a stored payment or week is answered, never doubled, and an action with the old revision is refused.";
  const CATEGORY_WORDS = { ban: "ban", conduct_removal: "conduct removal", tithe_removal: "dues removal" };
  const CATEGORY_DEFAULT_DAYS = { conduct_removal: { review: 180, expiry: 365 }, tithe_removal: { review: 90, expiry: 180 }, ban: { review: 365, expiry: null } };
  const RENEWAL_WORDS = { ongoing_risk: "ongoing risk", appeal_pending: "appeal pending", repeat_return: "repeat return" };
  const INTAKE_STATUS_WORDS = { received: "received", in_review: "in review", needs_verification: "needs verification", completed: "completed", declined: "declined" };
  const INTAKE_KIND_WORDS = { access: "access", deletion: "deletion", correction: "correction", objection: "objection", other: "other" };
  const DEPARTURE_WORDS = { left: "left the guild", removed: "removed from the guild", unknown: "left (how is unknown)" };
  const SNOWFLAKE_RE = /^\d{17,20}$/;
  const dateInput = (sec) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : "");
  const dayIso = (v) => { const t = Date.parse(`${v}T00:00:00Z`); return Number.isFinite(t) ? new Date(t).toISOString() : ""; };
  const ynBadge = (on, yes, no) => h("span", { class: "badge " + (on ? "green" : "muted"), text: on ? yes : no });
  const acted = (ex, fallback) => { toast(explainAdmin(ex, fallback), "bad"); if (ex && (ex.status === 403 || ex.status === 503)) refreshCommunity(); };
  function adminCommunityTabs(sub) {
    const tabs = [["", "Digest & coverage"]];
    if (feat("trials")) tabs.push(["trials", "Trials"]);
    if (feat("departures")) tabs.push(["departures", "Departures"]);
    if (feat("restrictions")) tabs.push(["cases", "Cases"]);
    if (feat("contributions")) tabs.push(["ledger", "Ledger"]);
    if (feat("privacy_intake")) tabs.push(["inbox", "Private inbox"]);
    if (feat("directory")) tabs.push(["claims", "Character claims"]);
    return h("div", { class: "community-admin-nav" },
      h("nav", { class: "btn-row", "aria-label": "Community admin sections", "aria-describedby": "community-admin-scroll-hint" }, tabs.map(([k, t]) => h("a", { class: "btn small", href: "#/admin/community" + (k ? "/" + k : ""), text: t, "aria-current": sub === k ? "page" : false }))),
      h("p", { class: "community-admin-scroll-hint", id: "community-admin-scroll-hint", text: "Scroll for more Community sections." }));
  }
  async function adminCommunity(body, parts) {
    const sub = parts[0] || "";
    clear(body);
    add(body, frame("Community", h("span", { class: "badge warn", text: "staff records; no role changes" }), adminCommunityTabs(sub)));
    const area = h("div", { class: "stack mt" });
    body.appendChild(area);
    if (!anyCommunity()) { add(area, noticeBox("info", "icon-clock", h("p", { text: "The community pages are not switched on." }))); return; }
    const views = { "": adminDigest, trials: adminTrials, departures: adminDepartures, cases: adminCases, ledger: adminLedger, inbox: adminInbox, claims: adminClaims };
    const gate = { trials: "trials", departures: "departures", cases: "restrictions", ledger: "contributions", inbox: "privacy_intake", claims: "directory" };
    if (!own(views, sub) || (gate[sub] && !feat(gate[sub]))) { add(area, frame("Not here", null, h("p", { text: "There is no such page, or it is not switched on." }))); return; }
    await views[sub](area);
  }
  // ---------- the digest and the coverage report ----------
  const DIGEST_COUNT_WORDS = { invitesWaiting: "invites queued or written", trialsDue: "trial reviews due", departuresOpen: "departure items open", casesReviewDue: "cases due for review", privateRequestsOpen: "private requests open", claimsToReview: "character claims to review", duesPastReview: "dues weeks past their final review" };
  async function adminDigest(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const draw = async () => {
      clear(holder);
      let d;
      try { d = await api("GET", "/api/admin/community/digest"); } catch (e) { holder.appendChild(frame("Officer digest", null, noticeBox("warn", "icon-warning", h("p", { text: explainAdmin(e, "The digest state could not be read.") })))); return; }
      const st = d.state || {};
      const resume = h("button", { class: "btn small", type: "button", text: "Resume tomorrow's digest", hidden: !st.halted });
      resume.addEventListener("click", async () => {
        if (!(await confirmBox("Resume the digest?", "Only after you have checked the channel yourself (and removed a duplicate by hand if one was posted). Today is given up; tomorrow posts again.", "Resume"))) return;
        resume.disabled = true;
        try { const out = await api("POST", "/api/admin/community/digest/resume", {}); toast(out.resumed ? "Resumed; tomorrow posts again." : out.reason === "not_halted" ? "The digest was not halted." : "Someone else resumed it already."); await draw(); }
        catch (ex) { acted(ex, "The digest could not be resumed."); resume.disabled = false; }
      });
      holder.appendChild(frame("Officer digest", h("div", { class: "btn-row" }, ynBadge(d.enabled, "switched on", "switched off"), ynBadge(d.channelConfigured, "channel configured", "no channel")),
        h("p", { class: "muted small", text: `Posted once a day after ${String(d.postsAfterUtcHour).padStart(2, "0")}:00 UTC to the staff channel: counts only, no names, no ids. Three attempts a day at most; a post whose outcome could not be read halts the digest until an administrator resumes it.` }),
        h("dl", { class: "kv" },
          h("dt", { text: "Today" }), h("dd", { text: st.day ? `${st.day}: ${st.outcome || "—"} after ${plural(st.attempts || 0, "attempt")}${st.postedDay ? `; a post of ${st.postedDay} is tracked` : ""}${st.waitingUntil ? `; retrying at ${fmtDateTime(sec(st.waitingUntil))}` : ""}` : "nothing recorded yet" }),
          h("dt", { text: "Halted" }), h("dd", null, st.halted ? h("span", { class: "badge red", text: "halted" }) : h("span", { class: "badge green", text: "no" }), " ", resume),
          h("dt", { text: "Discord message preview" }), h("dd", { class: "small digest-preview", text: String(d.preview || "").replace(/^\*\*(Officer digest:)\*\*/, "$1") })),
        h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Waiting for an officer" }), h("th", { class: "num", text: "Count" }))),
          h("tbody", null, Object.keys(DIGEST_COUNT_WORDS).map((k) => h("tr", null, h("td", { text: DIGEST_COUNT_WORDS[k] }), h("td", { class: "num", text: d.counts && d.counts[k] !== null && d.counts[k] !== undefined ? String(d.counts[k]) : "off" }))))))));
      const covBox = h("div", { class: "stack" });
      const covBtn = h("button", { class: "btn small", type: "button", text: "Read the coverage report" });
      covBtn.addEventListener("click", async () => {
        covBtn.disabled = true;
        clear(covBox);
        try {
          const c = await api("GET", "/api/admin/community/coverage");
          add(covBox, [h("p", { class: "muted small", text: c.explanation }), h("ul", { class: "small" }, (c.limitations || []).map((l) => h("li", { text: l }))),
            h("p", { class: "small", text: c.snapshot ? `Latest export: ${fmtDateTime(sec(c.snapshot.exportedAt))}, received ${fmtDateTime(sec(c.snapshot.receivedAt))}, ${plural(c.snapshot.memberCount, "member")} (${c.snapshot.rowsPresent} rows present). Generated ${fmtDateTime(sec(c.generatedAt))}.` : `No roster export is stored. Generated ${fmtDateTime(sec(c.generatedAt))}.` })]);
          if (c.unavailableReason) add(covBox, noticeBox("warn", "icon-warning", h("p", { text: ({ no_export: "No roster export yet: nothing to compare.", stale: "The latest export is older than seven days; the report would mislead, so it is withheld.", too_large: "The roster is larger than the report can show safely.", count_mismatch: "The export's rows do not match its member count; the report is withheld." })[c.unavailableReason] || c.unavailableReason })));
          else {
            const cv = c.coverage;
            add(covBox, [h("p", { class: "small", text: `${plural(cv.rosterRows, "roster row")}, ${cv.boundRows} bound to a Discord account, ${plural(cv.distinctPeople, "distinct person", "distinct people")}.` }),
              h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Class" }), h("th", { class: "num", text: "Characters" }))), h("tbody", null, Object.entries(cv.totals).map(([k, n]) => h("tr", null, h("td", { text: k.replaceAll("_", " ") }), h("td", { class: "num", text: String(n) })))))),
              h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Character" }), h("th", { text: "Rank" }), h("th", { text: "Game class" }), h("th", { text: "Last online" }), h("th", { text: "Discord" }), h("th", { text: "Coverage" }))),
                h("tbody", null, cv.entries.map((r) => h("tr", null, h("td", { text: r.name }), h("td", { text: r.rank || "—" }), h("td", { text: r.gameClass || "—" }), h("td", { text: r.lastOnline ? fmtShort(sec(r.lastOnline)) : "—" }), h("td", { class: "small", text: r.discordId || "—" }), h("td", { text: r.class.replaceAll("_", " ") }))))))]);
          }
        } catch (ex) { add(covBox, noticeBox("warn", "icon-warning", h("p", { text: explainAdmin(ex, "The report could not be read.") }))); }
        finally { covBtn.disabled = false; }
      });
      holder.appendChild(frame("Coverage report", covBtn, h("p", { class: "muted small", text: "The latest roster export next to what the bot and the site hold: who is bound, who is not in the server, who is denied or restricted. Cached facts, not proof of ownership and not a role census. Read on demand; nothing is stored." }), covBox));
    };
    await draw();
  }
  // ---------- trials ----------
  async function adminTrials(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const filter = named(selectOf([{ key: "active", label: "active" }, { key: "extended", label: "extended" }, { key: "passed", label: "passed" }, { key: "ended", label: "ended" }], "", { placeholder: "Every status" }), "Trial status filter");
    const tbody = h("tbody");
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null, generation = 0; // .106 (Codex's .98 review, item 5): every load is bound to the filter and continuation it asked for; a late reply to one the staff member has left writes no row, cursor or status
    const load = async (restart) => {
      const gen = ++generation;
      if (restart) { clear(tbody); cursor = null; }
      more.disabled = true;
      try {
        const q = [filter.value ? `status=${encodeURIComponent(filter.value)}` : "", cursor ? `cursor=${encodeURIComponent(cursor)}` : ""].filter(Boolean).join("&");
        const data = await api("GET", `/api/admin/community/trials${q ? `?${q}` : ""}`);
        if (gen !== generation) return; // superseded: these rows belong to a filter or page that is gone
        for (const t of data.trials) tbody.appendChild(trialRow(t));
        cursor = data.nextCursor; more.hidden = !cursor;
        status.textContent = tbody.firstChild ? "" : "No trial matches.";
      } catch (e) { if (gen !== generation) return; if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); } status.textContent = explainAdmin(e, "The trials could not be read."); }
      finally { if (gen === generation) more.disabled = false; }
    };
    const trialRow = (t) => {
      const open = t.status === "active" || t.status === "extended";
      const actions = h("div", { class: "btn-row" });
      if (open) {
        const due = h("input", { type: "date", value: dateInput(sec(t.reviewDueAt) + 14 * 86400), "aria-label": "New review date" });
        const extend = h("button", { class: "btn small", type: "button", text: "Extend" });
        extend.addEventListener("click", async () => {
          extend.disabled = true;
          try { const out = await api("POST", "/api/admin/community/trials/update", { id: t.id, revision: t.revision, action: "extend", reviewDueAt: dayIso(due.value) }); if (!out || !out.trial || out.trial.id !== t.id) throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt names THIS trial */ toast("Extended.", "good"); await load(true); }
          catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The trial could not be extended."); if (ex && ex.data && ex.data.trial) await load(true); }
          finally { extend.disabled = false; }
        });
        const outcome = named(selectOf([{ key: "passed", label: "passed" }, { key: "ended", label: "ended" }], "", { placeholder: "Conclude as…" }), "Conclude as");
        const reason = named(selectOf([{ key: "review_passed", label: "the review passed" }, { key: "withdrew", label: "withdrew" }, { key: "inactive", label: "inactive" }, { key: "staff_decision", label: "staff decision" }], "", { placeholder: "Reason…" }), "Reason for the outcome");
        const conclude = h("button", { class: "btn small", type: "button", text: "Conclude" });
        conclude.addEventListener("click", async () => {
          if (!outcome.value || !reason.value) { toast(ADMIN_COMMUNITY_ERRORS.invalid_outcome, "bad"); return; }
          conclude.disabled = true;
          try { const out = await api("POST", "/api/admin/community/trials/update", { id: t.id, revision: t.revision, action: "conclude", outcome: outcome.value, reason: reason.value }); if (!out || !out.trial || out.trial.id !== t.id) throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt names THIS trial */ toast("Concluded.", "good"); await load(true); }
          catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The trial could not be concluded."); if (ex && ex.data && ex.data.trial) await load(true); }
          finally { conclude.disabled = false; }
        });
        add(actions, [due, extend, outcome, reason, conclude]);
      }
      return h("tr", null, h("td", null, h("b", { text: t.displayName || "(no name)" }), h("span", { class: "muted small", text: ` ${t.discordId}` })), h("td", null, h("span", { class: "badge " + (t.status === "passed" ? "green" : open ? "warn" : "muted"), text: TRIAL_WORDS[t.status] || t.status }), t.reason ? h("span", { class: "muted small", text: ` ${TRIAL_REASONS[t.reason] || t.reason}` }) : null), h("td", { text: fmtShort(sec(t.startedAt)) }), h("td", { text: fmtShort(sec(t.reviewDueAt)) }), h("td", { text: t.sponsorDiscordId || "—" }), h("td", null, actions));
    };
    filter.addEventListener("change", () => load(true));
    more.addEventListener("click", () => load(false));
    // a new trial
    let opId = b64url(16); // .108 (Codex 12:04): retired after a valid receipt or a stored reconciliation; an unknown outcome keeps it (and its frozen body) exactly
    const who = h("input", { type: "text", placeholder: "Discord user ID", inputmode: "numeric" }); // .109: named by its visible label (Member), not by a second name
    const sponsor = h("input", { type: "text", placeholder: "Sponsor's Discord user ID (optional)", inputmode: "numeric" });
    const dueAt = h("input", { type: "date", value: dateInput(nowSec() + 30 * 86400) });
    const err = errorLine(""); err.hidden = true;
    const form = h("form", { class: "filters", novalidate: true }, fieldBox("tr-who", "Member", who, { required: true }), fieldBox("tr-due", "Review due", dueAt, { required: true }), fieldBox("tr-sponsor", "Sponsor", sponsor), h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "submit", text: "Open a trial" })));
    const pending = h("div");
    let frozen = null; // .103: the exact payload whose answer was lost
    const lock = (on) => { for (const el of form.querySelectorAll("input, button")) el.disabled = on; };
    const open = async (payload) => { const out = await api("POST", "/api/admin/community/trials", payload); if (!out || !out.trial || out.trial.id !== payload.opId) throw new ApiError(200, { error: "unreadable_answer" }); /* .107 (group 1): the trial IS this form's operation; an empty object or an array is no receipt */ toast(out.replay ? "That trial was already opened from this form." : "Trial opened.", "good"); opId = b64url(16); /* .108: the completed operation is retired; the next creation gets a fresh id */ frozen = null; clear(pending); lock(false); who.value = ""; sponsor.value = ""; await load(true); };
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); err.hidden = true;
      if (frozen) return;
      if (!SNOWFLAKE_RE.test(who.value.trim())) { err.textContent = ADMIN_COMMUNITY_ERRORS.invalid_discord_id; err.hidden = false; return; }
      const payload = { opId, discordId: who.value.trim(), reviewDueAt: dayIso(dueAt.value) };
      if (sponsor.value.trim()) payload.sponsorDiscordId = sponsor.value.trim();
      try { await open(payload); } catch (ex) {
        if (!uncertain(ex)) { err.textContent = explainAdmin(ex, "The trial could not be opened."); err.hidden = false; return; }
        frozen = payload;
        lostAnswer({ pending, lock, what: "The trial",
          retry: async () => { try { await open(frozen); return "done"; } catch (ex2) { if (uncertain(ex2)) return "lost"; frozen = null; clear(pending); lock(false); err.textContent = explainAdmin(ex2, "The trial could not be opened."); err.hidden = false; return "done"; } },
          // .108 (Codex 12:04): only the complete list proves absence: every page is followed through its continuation; a list that cannot be read to its end leaves the outcome unknown (Retry stays)
          check: async () => {
            const id = frozen.opId;
            try {
              let next = null;
              for (let page = 0; page < 50; page++) {
                const d = await api("GET", `/api/admin/community/trials${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
                if (!d || !Array.isArray(d.trials)) return "lost";
                if (d.trials.some((t) => t.id === id)) { toast("It was stored.", "good"); opId = b64url(16); frozen = null; clear(pending); lock(false); who.value = ""; sponsor.value = ""; await load(true); return "found"; }
                if (!d.nextCursor) { frozen = null; return "absent"; }
                next = d.nextCursor;
              }
              return "lost";
            } catch { return "lost"; }
          } });
      }
    });
    add(holder, [
      frame("Trials", h("div", { class: "btn-row" }, filter),
        h("p", { class: "muted small", text: "The officers' review periods for new members. Open trials come first, review-due first. Concluding records the outcome; it changes no rank." }),
        status, h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Member" }), h("th", { text: "Status" }), h("th", { text: "Started" }), h("th", { text: "Review due" }), h("th", { text: "Sponsor" }), h("th", { text: "" }))), tbody)), h("div", { class: "btn-row" }, more)),
      frame("Open a trial", null, form, err, pending),
    ]);
    load(true);
  }
  // ---------- departures and the return review ----------
  async function adminDepartures(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const filter = named(selectOf([{ key: "open", label: "open" }, { key: "acknowledged", label: "acknowledged" }, { key: "restriction_opened", label: "restriction opened" }], "open", { placeholder: "Every status" }), "Departure status filter");
    const tbody = h("tbody");
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null, generation = 0; // .106: as the trials list: a late reply to a filter or page that was left is discarded
    const load = async (restart) => {
      const gen = ++generation;
      if (restart) { clear(tbody); cursor = null; }
      more.disabled = true;
      try {
        const q = [filter.value ? `status=${encodeURIComponent(filter.value)}` : "", cursor ? `cursor=${encodeURIComponent(cursor)}` : ""].filter(Boolean).join("&");
        const data = await api("GET", `/api/admin/community/departures${q ? `?${q}` : ""}`);
        if (gen !== generation) return;
        for (const d of data.departures) tbody.appendChild(departureRow(d));
        cursor = data.nextCursor; more.hidden = !cursor;
        status.textContent = tbody.firstChild ? "" : "No departure item matches.";
      } catch (e) { if (gen !== generation) return; if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); } status.textContent = explainAdmin(e, "The departures could not be read."); }
      finally { if (gen === generation) more.disabled = false; }
    };
    const departureRow = (d) => {
      const actions = h("div", { class: "btn-row" });
      if (d.status === "open") {
        const ack = h("button", { class: "btn small", type: "button", text: "Acknowledge" });
        ack.addEventListener("click", async () => {
          ack.disabled = true;
          try { const out = await api("POST", "/api/admin/community/departures/update", { id: d.id, revision: d.revision, action: "acknowledge" }); if (!owns(out, "departure") || (out.departure !== null && (!out.departure || out.departure.id !== d.id))) throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt is THIS item's */ toast("Acknowledged.", "good"); await load(true); }
          catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The item could not be acknowledged."); if (ex && ex.data && ex.data.departure) await load(true); }
          finally { ack.disabled = false; }
        });
        add(actions, ack);
        if (feat("restrictions")) {
          const cat = named(selectOf(Object.keys(CATEGORY_WORDS).map((k) => ({ key: k, label: CATEGORY_WORDS[k] })), "", { placeholder: "Open a case as…" }), "Case category");
          const openCase = h("button", { class: "btn small danger", type: "button", text: "Open a restriction case" });
          openCase.addEventListener("click", async () => {
            if (!cat.value) { toast("Choose the case's category first.", "bad"); return; }
            if (!(await confirmBox("Open a restriction case?", `A ${CATEGORY_WORDS[cat.value]} case about ${d.displayName || d.discordId} with the default review and expiry dates. It is a record for the officers; it grants or removes no role.`, "Open the case", { danger: true }))) return;
            openCase.disabled = true;
            try { const out = await api("POST", "/api/admin/community/departures/update", { id: d.id, revision: d.revision, action: "open_restriction", category: cat.value }); if (!owns(out, "departure") || (out.departure !== null && (!out.departure || out.departure.id !== d.id)) || typeof out.restrictionCaseId !== "string") throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt is THIS item's, with the case it opened */ toast(`Case opened (${out.restrictionCaseId}).`, "good"); await load(true); }
            catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The case could not be opened."); if (ex && ex.data && ex.data.departure) await load(true); }
            finally { openCase.disabled = false; }
          });
          add(actions, [cat, openCase]);
        }
      }
      return h("tr", null, h("td", null, h("b", { text: d.displayName || "(no name)" }), h("span", { class: "muted small", text: ` ${d.discordId}` })), h("td", { text: d.characterName }), h("td", { text: DEPARTURE_WORDS[d.kind] || d.kind }), h("td", { text: fmtDateTime(sec(d.observedAt)) }), h("td", null, h("span", { class: "badge " + (d.status === "open" ? "warn" : "muted"), text: d.status.replaceAll("_", " ") }), d.restrictionCaseId ? h("span", { class: "muted small", text: ` case ${d.restrictionCaseId}` }) : null, d.reviewedAt ? h("span", { class: "muted small", text: ` · ${fmtShort(sec(d.reviewedAt))}` }) : null), h("td", null, actions));
    };
    filter.addEventListener("change", () => load(true));
    more.addEventListener("click", () => load(false));
    const review = h("div", { class: "stack" });
    const reviewBtn = h("button", { class: "btn small", type: "button", text: "Read the return review" });
    reviewBtn.addEventListener("click", async () => {
      reviewBtn.disabled = true; clear(review);
      try {
        const r = await api("GET", "/api/admin/community/return-review");
        add(review, [h("p", { class: "muted small", text: r.explanation }), h("p", { class: "small", text: `Generated ${fmtDateTime(sec(r.generatedAt))}; watch-list ${r.watchList}${r.truncated ? "; the list is truncated" : ""}.` })]);
        if (!r.members.length) add(review, h("p", { text: "Nobody with an active case has signed in here since it was set." }));
        for (const m of r.members) add(review, h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", { text: m.displayName || "(no name)" }), h("span", { class: "muted small", text: `${m.discordId} · last sign-in ${fmtDateTime(sec(m.lastLoginAt))}` })),
          h("ul", { class: "small" }, m.reasons.map((x) => h("li", { text: x.kind === "restriction" ? `${CATEGORY_WORDS[x.category] || x.category} case ${x.caseId}, set ${fmtShort(sec(x.setAt))}, review ${fmtShort(sec(x.reviewAt))}${x.reviewDue ? " (due)" : ""}, appeal ${x.appealStatus}` : `watched character ${x.characterName} (by ${x.by}) on case ${x.caseId}, watched ${fmtShort(sec(x.watchedAt))}, review ${fmtShort(sec(x.reviewAt))}` })))));
      } catch (ex) { add(review, noticeBox("warn", "icon-warning", h("p", { text: explainAdmin(ex, "The return review could not be read.") }))); }
      finally { reviewBtn.disabled = false; }
    });
    add(holder, [
      frame("Departures", h("div", { class: "btn-row" }, filter),
        h("p", { class: "muted small", text: "Roster-confirmed characters that left or were removed, as the roster export showed. Acknowledge what needs nothing; open a restriction case where the officers decided one. Neither touches a Discord role." }),
        status, h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Member" }), h("th", { text: "Character" }), h("th", { text: "What" }), h("th", { text: "Observed" }), h("th", { text: "Status" }), h("th", { text: "" }))), tbody)), h("div", { class: "btn-row" }, more)),
      feat("restrictions") ? frame("Return review", reviewBtn, h("p", { class: "muted small", text: "Members with an active case who signed in here after it was set, and other accounts that signed in after a watched character. Dated evidence only; read on demand." }), review) : null,
    ]);
    load(true);
  }
  // ---------- restriction cases ----------
  async function adminCases(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const who = h("input", { type: "text", placeholder: "Discord user ID (optional)", inputmode: "numeric", "aria-label": "Member filter (Discord user ID)" });
    const list = h("div", { class: "stack" });
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null, generation = 0; // .106: as the trials list
    const load = async (restart) => {
      const gen = ++generation;
      if (restart) { clear(list); cursor = null; }
      more.disabled = true;
      try {
        const q = [who.value.trim() ? `discordId=${encodeURIComponent(who.value.trim())}` : "", cursor ? `cursor=${encodeURIComponent(cursor)}` : ""].filter(Boolean).join("&");
        const data = await api("GET", `/api/admin/community/restrictions${q ? `?${q}` : ""}`);
        if (gen !== generation) return;
        for (const c of data.cases) list.appendChild(caseCard(c));
        cursor = data.nextCursor; more.hidden = !cursor;
        status.textContent = list.firstChild ? "" : "No case matches.";
      } catch (e) { if (gen !== generation) return; if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); } status.textContent = explainAdmin(e, "The cases could not be read."); }
      finally { if (gen === generation) more.disabled = false; }
    };
    const act = async (payload, done) => {
      try { const out = await api("POST", "/api/admin/community/restrictions", payload); if (!out || out.ok !== true || !out.case || out.case.caseId !== payload.caseId) throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt names THIS case */ toast(done, "good"); await load(true); }
      catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The case could not be changed."); if (ex && ((ex.data && ex.data.case) || ex.status === 404)) await load(true); } // .109: a case gone (404) re-reads the list too
    };
    const caseCard = (c) => {
      const base = { caseId: c.caseId, expectedRevision: c.revision };
      const actions = h("div", { class: "btn-row" });
      if (c.active) {
        if (c.returnToken && !c.acknowledgedAt && c.category !== "ban") actions.appendChild(h("button", { class: "btn small", type: "button", text: "Acknowledge the return", onclick: () => act({ action: "acknowledge", ...base, returnToken: c.returnToken }, "Return acknowledged.") }));
        const next = h("input", { type: "date", value: dateInput(nowSec() + 90 * 86400), "aria-label": "Next review date" });
        actions.appendChild(next);
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "Review: continue", onclick: () => act({ action: "review", ...base, outcome: "continued", nextReviewAt: dayIso(next.value) }, "Continued; the next review date set.") }));
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "Review: lift", onclick: async () => { if (await confirmBox("Lift this case?", "The case is resolved as lifted and kept thirty days; its watch-list is dropped.", "Lift")) act({ action: "review", ...base, outcome: "lifted" }, "Lifted."); } }));
        if (c.appealStatus === "none" || c.appealStatus === "upheld") actions.appendChild(h("button", { class: "btn small", type: "button", text: "Appeal requested", onclick: () => act({ action: "appeal", ...base, appealStatus: "requested" }, "Appeal recorded.") }));
        if (c.appealStatus === "requested") {
          actions.appendChild(h("button", { class: "btn small", type: "button", text: "Appeal upheld", onclick: () => act({ action: "appeal", ...base, appealStatus: "upheld" }, "Appeal upheld.") }));
          actions.appendChild(h("button", { class: "btn small", type: "button", text: "Appeal overturned", onclick: async () => { if (await confirmBox("Overturn on appeal?", "The case is resolved as overturned and kept thirty days.", "Overturn")) act({ action: "appeal", ...base, appealStatus: "overturned" }, "Overturned."); } }));
        }
        actions.appendChild(h("button", { class: "btn small", type: "button", text: "Watch the member's characters", title: "Adds the member's roster-bound characters from their verified record to this case's watch-list", onclick: () => act({ action: "add_characters", ...base }, "Characters added to the watch-list.") }));
        if (c.characters.length) {
          const reason = named(selectOf(Object.keys(RENEWAL_WORDS).map((k) => ({ key: k, label: RENEWAL_WORDS[k] })), "", { placeholder: "Renewal reason…" }), "Renewal reason");
          actions.appendChild(reason);
          actions.appendChild(h("button", { class: "btn small", type: "button", text: "Renew the watch-list", onclick: () => { if (!reason.value) { toast(ADMIN_COMMUNITY_ERRORS.invalid_reason, "bad"); return; } act({ action: "renew_characters", ...base, reason: reason.value }, "Watch-list renewed."); } }));
        }
      }
      const watch = c.characters.length ? h("ul", { class: "small" }, c.characters.map((w) => h("li", null, `${w.name} (${w.proof.guidPinned ? "pinned by GUID" : "by name"}; watched ${fmtShort(sec(w.addedAt))}, review ${fmtShort(sec(w.reviewAt))}, until ${fmtShort(sec(w.expiresAt))}${w.renewalReason ? `; renewed: ${RENEWAL_WORDS[w.renewalReason] || w.renewalReason}` : ""}) `, c.active ? h("button", { class: "btn small", type: "button", text: "Remove", onclick: () => act({ action: "remove_character", ...base, key: w.key }, "Removed from the watch-list.") }) : null))) : null;
      return h("div", { class: "card" + (c.active ? "" : " muted-card") },
        h("div", { class: "card-head" }, h("h3", { text: c.displayName || "(no name)" }), h("span", { class: "badge " + (c.active ? (c.reviewDue ? "warn" : "red") : "muted"), text: c.active ? (c.reviewDue ? "review due" : "active") : "resolved" }), h("span", { class: "badge", text: CATEGORY_WORDS[c.category] || c.category }), c.appealStatus !== "none" ? h("span", { class: "badge warn", text: `appeal ${c.appealStatus}` }) : null),
        h("dl", { class: "kv" },
          h("dt", { text: "Member" }), h("dd", { class: "small", text: `${c.discordId} · case ${c.caseId}` }),
          h("dt", { text: "Set" }), h("dd", { text: `${fmtShort(sec(c.setAt))}${c.setBy ? ` by ${c.setBy}` : ""}` }),
          h("dt", { text: "Review" }), h("dd", { text: `${fmtShort(sec(c.reviewAt))}${c.reviewOutcome ? ` (${c.reviewOutcome} ${c.reviewedAt ? fmtShort(sec(c.reviewedAt)) : ""})` : ""}` }),
          h("dt", { text: "Expires" }), h("dd", { text: c.expiresAt ? fmtShort(sec(c.expiresAt)) : "never (ban)" }),
          c.returnedAt ? [h("dt", { text: "Returned" }), h("dd", { text: `signed in here ${fmtDateTime(sec(c.returnedAt))}${c.acknowledgedAt ? `; acknowledged ${fmtShort(sec(c.acknowledgedAt))}` : "; not yet acknowledged"}` })] : null,
          c.resolvedAt ? [h("dt", { text: "Resolved" }), h("dd", { text: fmtShort(sec(c.resolvedAt)) })] : null,
          h("dt", { text: "Watch-list" }), h("dd", null, watch || "none", c.charactersRenewalRequired ? h("span", { class: "badge warn", text: "renewal required" }) : null, c.charactersRetainUntil ? h("span", { class: "muted small", text: ` kept until ${fmtShort(sec(c.charactersRetainUntil))}` }) : null)),
        actions);
    };
    who.addEventListener("change", () => load(true));
    more.addEventListener("click", () => load(false));
    // a new case
    let caseId = b64url(16); // .108 (Codex 12:04): retired after a valid receipt or a stored reconciliation; an unknown outcome keeps it (and its frozen body) exactly
    const member = h("input", { type: "text", placeholder: "Discord user ID", inputmode: "numeric" });
    const cat = selectOf(Object.keys(CATEGORY_WORDS).map((k) => ({ key: k, label: CATEGORY_WORDS[k] })), "conduct_removal", { placeholder: "Category…" });
    const reviewAt = h("input", { type: "date" });
    const expiresAt = h("input", { type: "date" });
    const presets = () => { const d = CATEGORY_DEFAULT_DAYS[cat.value]; if (!d) return; reviewAt.value = dateInput(nowSec() + d.review * 86400); expiresAt.value = d.expiry === null ? "" : dateInput(nowSec() + d.expiry * 86400); };
    presets();
    cat.addEventListener("change", presets);
    const err = errorLine(""); err.hidden = true;
    const form = h("form", { class: "filters", novalidate: true }, fieldBox("cs-who", "Member", member, { required: true }), fieldBox("cs-cat", "Category", cat), fieldBox("cs-review", "Review", reviewAt), fieldBox("cs-exp", "Expires", expiresAt, { hint: "empty for a ban" }), h("div", { class: "btn-row" }, h("button", { class: "btn small danger", type: "submit", text: "Open a case" })));
    const pending = h("div");
    let frozen = null; // .103: the exact payload whose answer was lost
    const lock = (on) => { for (const el of form.querySelectorAll("input, select, button")) el.disabled = on; };
    const openCase = async (payload) => { const out = await api("POST", "/api/admin/community/restrictions", payload); if (!out || !out.case || out.case.caseId !== payload.caseId) throw new ApiError(200, { error: "unreadable_answer" }); /* .107 (group 1): the case IS this form's; an empty object or an array is no receipt */ toast(out.replay ? "That case was already opened from this form." : "Case opened.", "good"); caseId = b64url(16); /* .108: the completed operation is retired; the next creation gets a fresh id */ frozen = null; clear(pending); lock(false); member.value = ""; await load(true); };
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); err.hidden = true;
      if (!SNOWFLAKE_RE.test(member.value.trim())) { err.textContent = ADMIN_COMMUNITY_ERRORS.invalid_discord_id; err.hidden = false; return; }
      if (frozen) return;
      if (!(await confirmBox("Open a restriction case?", `A ${CATEGORY_WORDS[cat.value]} case about ${member.value.trim()}. A record for the officers: it grants or removes no role; the member is told nothing by this software.`, "Open the case", { danger: true }))) return;
      const payload = { action: "create", caseId, discordId: member.value.trim(), category: cat.value, reviewAt: dayIso(reviewAt.value), expiresAt: expiresAt.value ? dayIso(expiresAt.value) : null };
      try { await openCase(payload); } catch (ex) {
        if (!uncertain(ex)) { err.textContent = explainAdmin(ex, "The case could not be opened."); err.hidden = false; return; }
        frozen = payload;
        lostAnswer({ pending, lock, what: "The case",
          retry: async () => { try { await openCase(frozen); return "done"; } catch (ex2) { if (uncertain(ex2)) return "lost"; frozen = null; clear(pending); lock(false); err.textContent = explainAdmin(ex2, "The case could not be opened."); err.hidden = false; return "done"; } },
          // .108: only the member's complete list proves absence (every page through its continuation); otherwise the outcome stays unknown
          check: async () => {
            const id = frozen.caseId, who0 = frozen.discordId;
            try {
              let next = null;
              for (let page = 0; page < 50; page++) {
                const d = await api("GET", `/api/admin/community/restrictions?discordId=${encodeURIComponent(who0)}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
                if (!d || !Array.isArray(d.cases)) return "lost";
                if (d.cases.some((c) => c.caseId === id)) { toast("It was stored.", "good"); caseId = b64url(16); frozen = null; clear(pending); lock(false); member.value = ""; await load(true); return "found"; }
                if (!d.nextCursor) { frozen = null; return "absent"; }
                next = d.nextCursor;
              }
              return "lost";
            } catch { return "lost"; }
          } });
      }
    });
    add(holder, [
      frame("Restriction cases", h("div", { class: "btn-row" }, who, h("button", { class: "btn small", type: "button", text: "Filter", onclick: () => load(true) })),
        h("p", { class: "muted small", text: "Records of bans and removals with their review and expiry dates, appeals and watched characters. A case is evidence for the officers; it never changes a role by itself." }),
        status, list, h("div", { class: "btn-row" }, more)),
      frame("Open a case", null, form, err, pending),
    ]);
    load(true);
  }
  // ---------- the ledger (staff) ----------
  async function adminLedger(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const who = h("input", { type: "text", placeholder: "Discord user ID", inputmode: "numeric", "aria-label": "Discord user ID" });
    const view = h("div", { class: "stack" });
    // .108 (Codex 12:04): every read and every action is bound to the member and the read it was made for: a late answer for a
    // member the page has left never fills the view, `current` or the actions (the ledger read does not echo the member)
    let current = null, subject = "", ledgerGen = 0, drawnFor = "";
    let drafts = { for: "" }; // .109 (self-review): the three forms' values for the member drawn, kept across redraws
    const load = async () => {
      const gen = ++ledgerGen, sub = subject;
      clear(view);
      if (!SNOWFLAKE_RE.test(sub)) { view.appendChild(h("p", { class: "muted small", text: "Enter a member's Discord user ID to read their ledger." })); return; }
      try { const d = await api("GET", `/api/admin/community/contributions?discordId=${encodeURIComponent(sub)}`); if (gen !== ledgerGen) return; current = d; drawLedger(sub); }
      catch (e) { if (gen !== ledgerGen) return; view.appendChild(noticeBox("warn", "icon-warning", h("p", { text: explainAdmin(e, "The ledger could not be read.") }))); }
    };
    const action = async (payload, done, clears = null) => {
      const gen = ledgerGen; // .108: the read this action was made from
      const draftsFor0 = drawnFor; // .110 (Codex 12:57): the member whose forms this action came from
      try {
        const out = await api("POST", "/api/admin/community/contributions", payload);
        const st = typeof out.result === "object" && out.result ? out.result.status || (out.result.created === false ? "replay" : out.result.created === true ? "created" : "") : "";
        toast(out.ok ? done : `Nothing changed: ${st || "refused"}.`, out.ok ? "good" : "");
        if (out.ok && clears && drafts.for === draftsFor0) for (const k of clears) delete drafts[k]; // .109: a recorded form starts empty; a refused one keeps what was typed. .110: only that member's drafts: if the page has moved to another member, the drafts there are theirs and stay
        // .106 (Codex's .98 review, item 2): the write stands and the ledger could not be re-read: the private view is cleared by
        // the reload below (a refused read shows nothing), while the acknowledgement lives on the document, dismissible, with
        // no undo and no state the Worker did not answer
        if (out.ledger === null && out.withheld) { receiptBar(out.ok ? `${done} ` : "Nothing changed. ", `${out.ok ? `The action was recorded (${st || "done"})` : `The ledger answered ${st || "refused"}`}. The ledger could not be re-read afterwards (${WITHHELD_WORDS[out.withheld] || out.withheld}), so its weeks and payments are not shown; what was recorded stands.`); if (gen === ledgerGen) await load(); return; }
        if (gen !== ledgerGen) return; // .108: the page has moved to another member (or a newer read): this answer's ledger is not drawn there
        if (out.ledger) { current = Object.assign({}, current, { ledger: out.ledger }); drawLedger(drawnFor); } else await load();
      } catch (ex) { if (uncertain(ex)) toast(LOST_LEDGER, "bad"); else acted(ex, "The action was refused."); if (gen === ledgerGen) await load(); } // .109: the forms keep what was sent
    };
    const drawLedger = (sub) => {
      drawnFor = sub; // .108: the member this view and its actions belong to
      clear(view);
      const L = current.ledger, rev = L.revision;
      const weeks = h("tbody");
      for (const o of L.obligations) {
        const acts = h("div", { class: "btn-row" });
        const state = named(selectOf(["open", "exempt", "disputed", "resolved"].map((k) => ({ key: k, label: k })), o.state, { placeholder: null }), "Week state");
        acts.appendChild(state);
        acts.appendChild(h("button", { class: "btn small", type: "button", text: "Set state", onclick: () => action({ action: "state", discordId: sub, obligationId: o.id, state: state.value, expectedRevision: rev }, "State set.") }));
        const kind = named(selectOf([{ key: "officer_contact", label: "officer contact" }, { key: "final_notice", label: "final notice given" }, { key: "final_officer_contact", label: "final officer contact" }], "", { placeholder: "Record a contact…" }), "Contact kind");
        acts.appendChild(kind);
        acts.appendChild(h("button", { class: "btn small", type: "button", text: "Record", onclick: () => { if (!kind.value) { toast("Choose the contact kind.", "bad"); return; } action({ action: "contact", discordId: sub, obligationId: o.id, kind: kind.value, expectedRevision: rev }, "Contact recorded."); } }));
        if (o.stage === "officer_review") {
          const caseInput = h("input", { type: "text", placeholder: "case id (optional)", "aria-label": "Restriction case id to link" });
          acts.appendChild(caseInput);
          acts.appendChild(h("button", { class: "btn small danger", type: "button", text: "Record the removal", onclick: async () => { if (await confirmBox("Record a removal?", "Records that the officers resolved this week after an in-game removal. It links an existing case if you name one; it opens none and touches no role.", "Record", { danger: true })) action({ action: "removal", discordId: sub, obligationId: o.id, expectedRevision: rev, caseId: caseInput.value.trim() || null }, "Removal recorded."); } }));
        }
        weeks.appendChild(h("tr", null, h("td", { text: `${fmtShort(sec(o.periodStart))} (#${o.id})` }), h("td", { class: "num", text: gold(o.amountCopper) }), h("td", { class: "num", text: gold(o.paidCopper) }), h("td", { class: "wrap" }, `${o.state} · ${STAGE_WORDS[o.stage] || o.stage}`, h("span", { class: "muted small", text: ` · ${EVIDENCE_WORDS[o.evidence] || o.evidence}${o.eligible ? "" : " · exempt (new member)"}` })), h("td", { class: "wrap small", text: [o.acknowledgedAt && `ack ${fmtShort(sec(o.acknowledgedAt))}`, o.officerContactAt && `officer ${fmtShort(sec(o.officerContactAt))}`, o.finalNoticeAt && `final ${fmtShort(sec(o.finalNoticeAt))}`, o.finalAcknowledgedAt && `final ack ${fmtShort(sec(o.finalAcknowledgedAt))}`, o.finalOfficerContactAt && `final officer ${fmtShort(sec(o.finalOfficerContactAt))}`].filter(Boolean).join(" · ") || "—" }), h("td", null, acts)));
      }
      const receipts = h("tbody");
      for (const r of L.receipts) {
        const acts = h("div", { class: "btn-row" });
        if (!r.voidedAt && r.id) {
          acts.appendChild(h("button", { class: "btn small danger", type: "button", text: "Void", onclick: async () => { if (await confirmBox("Void this payment?", "Its allocations are reversed, the weeks' contact facts cleared, and it can never pay again.", "Void", { danger: true })) action({ action: "void", discordId: sub, receiptId: r.id, expectedRevision: rev }, "Voided."); } }));
          const week = named(selectOf(L.obligations.map((o) => ({ key: String(o.id), label: `${fmtShort(sec(o.periodStart))} (#${o.id})` })), "", { placeholder: "Reverse from week…" }), "Week to reverse from");
          acts.appendChild(week);
          acts.appendChild(h("button", { class: "btn small", type: "button", text: "Reverse", onclick: () => { if (!week.value) { toast("Choose the week.", "bad"); return; } action({ action: "reverse", discordId: sub, receiptId: r.id, obligationId: Number(week.value), expectedRevision: rev }, "Reversed."); } }));
        }
        receipts.appendChild(h("tr", null, h("td", { text: fmtShort(sec(r.observedAt)) }), h("td", { class: "wrap small", text: `${SOURCE_WORDS[r.source] || r.source}${r.sourceId ? ` · ${r.sourceId}` : ""}${r.payerName ? ` · ${r.payerName}` : ""}${r.recordedBy ? ` · by ${r.recordedBy}` : ""}` }), h("td", { class: "num", text: gold(r.amountCopper) }), h("td", { class: "num", text: gold(r.allocatedCopper) }), h("td", { class: "num", text: gold(r.unallocatedCopper) }), h("td", { text: r.voidedAt ? `voided ${fmtShort(sec(r.voidedAt))}` : r.status }), h("td", null, acts)));
      }
      // new week, new receipt, evidence, allocate
      const weekStart = h("input", { type: "date" });
      const eligible = h("input", { type: "checkbox", checked: true });
      const src = selectOf(Object.keys(SOURCE_WORDS).map((k) => ({ key: k, label: SOURCE_WORDS[k] })), "officer_manual", { placeholder: null });
      const srcId = h("input", { type: "text", placeholder: "source id" });
      const payer = h("input", { type: "text", placeholder: "payer name as written (optional)" });
      const amount = h("input", { type: "number", min: "1", placeholder: "copper" });
      const seen = h("input", { type: "datetime-local", value: localDT(nowSec()) });
      const rstatus = selectOf(["matched", "disputed", "rejected"].map((k) => ({ key: k, label: k })), "matched", { placeholder: null }); // .109: a payment in a member's ledger is matched to them; the ledger refuses "unmatched" with a member
      const evWeek = h("input", { type: "date" });
      const evState = selectOf(["complete", "partial", "stale", "unavailable"].map((k) => ({ key: k, label: EVIDENCE_WORDS[k] })), "complete", { placeholder: null });
      // .109 (self-review): what is typed into the three forms survives a redraw of this member's ledger, and what was SENT is kept
      // when its answer is lost, so the same values can be sent again (a stored payment or week is answered, never doubled)
      if (drafts.for !== sub) drafts = { for: sub };
      const keep = (key, el, prop = "value") => { if (drafts[key] !== undefined) el[prop] = drafts[key]; const save = () => { drafts[key] = el[prop]; }; el.addEventListener("input", save); el.addEventListener("change", save); };
      keep("weekStart", weekStart); keep("eligible", eligible, "checked"); keep("src", src); keep("srcId", srcId); keep("payer", payer); keep("amount", amount); keep("seen", seen); keep("rstatus", rstatus); keep("evWeek", evWeek); keep("evState", evState);
      const snap = (rows) => { for (const [k, el, prop] of rows) drafts[k] = el[prop || "value"]; };
      add(view, [
        h("div", { class: "btn-row" }, ynBadge(current.writable, "ledger open", "read-only"), h("span", { class: "muted small", text: `revision ${rev || "—"} · mail reference ${typeof current.mailReference === "string" ? current.mailReference : (current.mailReference && current.mailReference.reference) || "—"}${L.complete ? "" : " · INCOMPLETE: a record is withheld"}` })),
        frame("Weeks", h("button", { class: "btn small", type: "button", text: "Allocate credit", onclick: () => action({ action: "allocate", discordId: sub }, "Allocated.") }),
          L.obligations.length ? h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Week" }), h("th", { class: "num", text: "Asked" }), h("th", { class: "num", text: "Paid" }), h("th", { text: "State · stage" }), h("th", { text: "Contacts" }), h("th", { text: "" }))), weeks)) : h("p", { text: "No week recorded." }),
          h("div", { class: "filters" }, fieldBox("lg-week", "New week (its Monday)", weekStart), h("label", { class: "check" }, eligible, " eligible"), h("button", { class: "btn small", type: "button", text: "Record the week", onclick: () => { if (!weekStart.value) { toast(ADMIN_COMMUNITY_ERRORS.invalid_period, "bad"); return; } snap([["weekStart", weekStart], ["eligible", eligible, "checked"]]); action({ action: "obligation", discordId: sub, periodStart: dayIso(weekStart.value), eligible: eligible.checked }, "Week recorded.", ["weekStart", "eligible"]); } }))),
        frame("Payments", L.unallocatedCopper ? h("span", { class: "badge green", text: `credit ${gold(L.unallocatedCopper)}` }) : null,
          L.receipts.length ? h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Seen" }), h("th", { text: "Source" }), h("th", { class: "num", text: "Amount" }), h("th", { class: "num", text: "Applied" }), h("th", { class: "num", text: "Credit" }), h("th", { text: "Status" }), h("th", { text: "" }))), receipts)) : h("p", { text: "No payment recorded." }),
          h("div", { class: "filters" }, fieldBox("lg-src", "Source", src), fieldBox("lg-srcid", "Source id", srcId, { required: true }), fieldBox("lg-payer", "Payer", payer), fieldBox("lg-amount", "Amount (copper)", amount, { required: true }), fieldBox("lg-seen", "Seen", seen), fieldBox("lg-status", "Status", rstatus),
            h("button", { class: "btn small", type: "button", text: "Record the payment", onclick: () => { const t = fromLocalDT(seen.value); if (!srcId.value.trim() || !amount.value || t === null) { toast(ADMIN_COMMUNITY_ERRORS.invalid_receipt, "bad"); return; } snap([["src", src], ["srcId", srcId], ["payer", payer], ["amount", amount], ["seen", seen], ["rstatus", rstatus]]); action({ action: "receipt", source: src.value, sourceId: srcId.value.trim(), payerName: payer.value.trim() || null, amountCopper: Number(amount.value), observedAt: isoOf(t), matchedDiscordId: sub, status: rstatus.value }, "Payment recorded.", ["src", "srcId", "payer", "amount", "seen", "rstatus"]); } }))),
        frame("Evidence", null, h("p", { class: "muted small", text: "An officer attests the state of a week's payment records for the whole scope; notices depend on it." }),
          h("div", { class: "filters" }, fieldBox("lg-evweek", "Week (its Monday)", evWeek), fieldBox("lg-evstate", "Records", evState), h("button", { class: "btn small", type: "button", text: "Attest", onclick: () => { if (!evWeek.value) { toast(ADMIN_COMMUNITY_ERRORS.invalid_period, "bad"); return; } snap([["evWeek", evWeek], ["evState", evState]]); action({ action: "evidence", periodStart: dayIso(evWeek.value), state: evState.value }, "Attested.", ["evWeek", "evState"]); } }))),
      ]);
    };
    const go = h("button", { class: "btn small", type: "button", text: "Read the ledger" });
    const open = () => { subject = who.value.trim(); load(); };
    go.addEventListener("click", open);
    who.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); open(); } });
    add(holder, [frame("Contribution ledger", h("div", { class: "btn-row" }, who, go), h("p", { class: "muted small", text: "One member's weeks and payments with the private details staff may see. Every action carries the ledger's revision; a stale page is refused and reloaded. Nothing here removes anyone: a removal is recorded, never performed." }), view)]);
    load();
  }
  // ---------- the private inbox ----------
  async function adminInbox(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const state = named(selectOf([{ key: "open", label: "open" }, { key: "closed", label: "closed" }], "open", { placeholder: null }), "Case list filter");
    const list = h("div", { class: "stack" });
    const detail = h("div", { class: "stack" });
    const status = h("p", { class: "muted small" });
    // .108 (Codex 12:04): the list and the open case are each bound to the selection they were read for, and a refreshed list
    // retires a case detail still being read; (self-review, F1) ONE update whose answer was lost is kept for ITS case, in memory,
    // across a refreshed list and a re-opened case, and is never sent for another case
    let listGen = 0, detailGen = 0, waiting = null; // waiting: { caseId, payload }
    const heldBox = () => {
      if (!waiting) return null;
      const box = noticeBox("warn", "icon-warning", h("p", { text: `An update to case ${waiting.caseId} is still waiting for a lost answer. It stays with that case and is sent for no other: open that case again to retry it, or discard it.` }),
        h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Discard that update", onclick: () => { waiting = null; box.remove(); } })));
      return box;
    };
    const load = async () => {
      const gen = ++listGen;
      ++detailGen; // a case detail still being read belongs to the list that is being replaced
      clear(list); clear(detail);
      { const held = heldBox(); if (held) detail.appendChild(held); }
      try {
        const d = await api("GET", `/api/admin/community/privacy-requests?state=${encodeURIComponent(state.value)}`);
        if (gen !== listGen) return; // a newer list replaced this one
        if (!d || !Array.isArray(d.cases)) throw new ApiError(200, { error: "unreadable_answer" });
        status.textContent = `${d.intakeOpen ? "The form accepts new cases." : "New cases are paused."}${d.truncated ? " The list is truncated." : ""}`;
        if (!d.cases.length) list.appendChild(h("p", { text: `No ${state.value} case.` }));
        for (const c of d.cases) {
          const openBtn = h("button", { class: "btn small", type: "button", text: "Open" });
          openBtn.addEventListener("click", () => openCase(c.caseId));
          list.appendChild(h("div", { class: "card" }, h("div", { class: "card-head" }, h("h3", { text: `${INTAKE_KIND_WORDS[c.kind] || c.kind} · ${c.caseId}` }), h("span", { class: "badge " + (c.status === "completed" || c.status === "declined" ? "muted" : "warn"), text: INTAKE_STATUS_WORDS[c.status] || c.status }), c.lastFrom === "requester" ? h("span", { class: "badge green", text: "requester wrote last" }) : null),
            h("p", { class: "small", text: `${c.subjectHint ? `who: ${c.subjectHint}; ` : ""}${c.characterHint ? `character: ${c.characterHint}; ` : ""}${plural(c.messageCount, "message")}; received ${fmtDateTime(sec(c.createdAt))}; last change ${fmtShort(sec(c.updatedAt))}; suggested review by ${fmtShort(sec(c.suggestedReviewBy))}; kept until ${fmtShort(sec(c.retentionDeadline))}` }), h("div", { class: "btn-row" }, openBtn)));
        }
      } catch (e) { if (gen !== listGen) return; status.textContent = explainAdmin(e, "The inbox could not be read."); }
    };
    const openCase = async (caseId) => {
      const gen = ++detailGen;
      clear(detail);
      try {
        const c = await api("GET", `/api/admin/community/privacy-requests/case?caseId=${encodeURIComponent(caseId)}`);
        if (gen !== detailGen) return; // .108: another case was opened, or the list refreshed, meanwhile: this detail is not shown
        if (!c || c.caseId !== caseId || !Array.isArray(c.messages)) throw new ApiError(200, { error: "unreadable_answer" });
        const mine = waiting && waiting.caseId === caseId ? waiting : null; // (self-review) this case's waiting update, restored below
        let opId = mine ? mine.payload.messageId : b64url(16); // one staff operation per form: a retry replays, never doubles
        const newStatus = selectOf(Object.keys(INTAKE_STATUS_WORDS).map((k) => ({ key: k, label: INTAKE_STATUS_WORDS[k] })), mine ? mine.payload.status : c.status, { placeholder: null });
        const reply = h("textarea", { rows: "4", maxlength: "2000", placeholder: "A reply the requester reads with their code (optional)" });
        if (mine && mine.payload.reply) reply.value = mine.payload.reply;
        const send = h("button", { class: "btn small", type: "button", text: "Update the case" });
        const pending = h("div");
        let frozen = mine ? mine.payload : null; // .103: the exact payload whose answer was lost
        const lock = (on) => { newStatus.disabled = on; reply.disabled = on; send.disabled = on; };
        const settle = () => { if (waiting && waiting.payload.messageId === opId) waiting = null; }; // (self-review) clears only this operation
        const update = async (payload) => { const out = await api("POST", "/api/admin/community/privacy-requests/update", payload); if (!out || out.ok !== true || out.status !== payload.status) throw new ApiError(200, { error: "unreadable_answer" }); /* .107 (group 1): the status applied is the one asked for */ settle(); toast(out.replay ? "That operation was already applied." : out.replied ? "Status set and reply sent." : "Status set.", "good"); await load(); await openCase(caseId); };
        // no check here: a status-only operation leaves no message to look for; the retry is answered with the original result when it was stored
        const showLost = () => {
          lostAnswer({ pending, lock, what: "The update", check: null,
            retry: async () => { try { await update(frozen); return "done"; } catch (ex2) { if (uncertain(ex2)) return "lost"; frozen = null; settle(); clear(pending); lock(false); acted(ex2, "The case could not be updated."); return "done"; } } });
          pending.appendChild(h("div", { class: "btn-row" }, h("button", { class: "btn small", type: "button", text: "Discard this update", onclick: () => { frozen = null; settle(); clear(pending); lock(false); opId = b64url(16); } })));
        };
        send.addEventListener("click", async () => {
          if (frozen) return;
          if (waiting && waiting.caseId !== caseId) { toast(`An update to case ${waiting.caseId} is still waiting for a lost answer: retry or discard it first. Nothing was sent for this case.`, "bad"); return; } // (self-review) one waiting update at a time
          send.disabled = true;
          const payload = { caseId, messageId: opId, status: newStatus.value };
          if (reply.value.trim()) payload.reply = reply.value.trim();
          try { await update(payload); } catch (ex) {
            if (!uncertain(ex)) { acted(ex, "The case could not be updated."); send.disabled = false; return; }
            frozen = payload; waiting = { caseId, payload };
            showLost();
          }
        });
        if (!mine) { const held = heldBox(); if (held) detail.appendChild(held); }
        add(detail, frame(`Case ${c.caseId}`, h("span", { class: "badge", text: INTAKE_STATUS_WORDS[c.status] || c.status }),
          h("p", { class: "small", text: `${INTAKE_KIND_WORDS[c.kind] || c.kind} request${c.subjectHint ? ` · who: ${c.subjectHint}` : ""}${c.characterHint ? ` · character: ${c.characterHint}` : ""} · received ${fmtDateTime(sec(c.createdAt))}${c.closedAt ? ` · closed ${fmtShort(sec(c.closedAt))}` : ""} · kept ${c.retentionDays} days (until ${fmtShort(sec(c.retentionDeadline))})` }),
          h("p", { class: "muted small", text: "A case proves nothing about who owns an account: verify that in the conversation before acting through the site's tools. Replies are read by whoever holds the case code." }),
          h("div", { class: "stack" }, c.messages.map((m) => h("div", { class: "card message" + (m.from === "staff" ? " staff" : "") }, h("div", { class: "card-head" }, h("h3", { text: m.from === "staff" ? "Staff" : "Requester" }), h("span", { class: "muted small", text: fmtDateTime(sec(m.at)) })), h("p", { text: m.text })))),
          c.closedAt ? h("p", { class: "muted small", text: "This case is closed; a status change may still be recorded, no reply is sent." }) : null,
          h("div", { class: "filters" }, fieldBox("pi-status", "Status", newStatus), fieldBox("pi-reply", "Reply", reply), send), pending));
        if (mine) showLost(); // (self-review) the re-opened case restores its waiting update as the same locked operation
      } catch (e) { if (gen !== detailGen) return; add(detail, noticeBox("warn", "icon-warning", h("p", { text: explainAdmin(e, "The case could not be read.") }))); }
    };
    state.addEventListener("change", load);
    add(holder, [frame("Private requests", h("div", { class: "btn-row" }, state), h("p", { class: "muted small", text: "Requests sent without Discord, keyed by case number. Only the status and your replies are written here; a request by itself exports, deletes or changes nothing." }), status, list), detail]);
    load();
  }
  // ---------- directory: character claims ----------
  async function adminClaims(area) {
    const holder = h("div", { class: "stack" });
    add(area, holder);
    const tbody = h("tbody");
    const status = h("p", { class: "muted small" });
    const more = h("button", { class: "btn small", type: "button", text: "Show more", hidden: true });
    let cursor = null, generation = 0; // .106: as the trials list
    const load = async (restart) => {
      const gen = ++generation;
      if (restart) { clear(tbody); cursor = null; }
      more.disabled = true;
      try {
        const d = await api("GET", `/api/admin/community/directory${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
        if (gen !== generation) return;
        for (const e of d.entries) {
          const acts = h("div", { class: "btn-row" });
          if (e.kind === "alt" && e.status === "claimed") {
            for (const [decision, label] of [["confirm", "Confirm"], ["reject", "Reject"]]) {
              const b = h("button", { class: "btn small" + (decision === "reject" ? " danger" : ""), type: "button", text: label });
              b.addEventListener("click", async () => { b.disabled = true; try { const out = await api("POST", "/api/admin/community/directory/alt", { ref: e.ref, key: e.key, decision, revision: e.revision }); if (!out || !out.claim || out.claim.ref !== e.ref || out.claim.key !== e.key) throw new ApiError(200, { error: "unreadable_answer" }); /* .108: the receipt names THIS claim */ toast(decision === "confirm" ? "Confirmed." : "Rejected.", "good"); await load(true); } catch (ex) { if (uncertain(ex)) { toast(LOST_REREAD, "bad"); await load(true); return; } acted(ex, "The decision could not be recorded."); if (ex && (ex.status === 409 || ex.status === 404)) await load(true); b.disabled = false; } });
              acts.appendChild(b);
            }
          }
          tbody.appendChild(h("tr", null, h("td", { text: e.displayName || "(no name)" }), h("td", { text: e.name }), h("td", { text: e.kind === "alt" ? `alt (${e.status})` : `main (${e.proof === "keeper" ? "confirmed" : "self-labelled"})` }), h("td", null, e.conflict ? h("span", { class: "badge red", text: "claimed by more than one account" }) : h("span", { class: "muted small", text: "—" })), h("td", { text: fmtShort(sec(e.at)) }), h("td", null, acts)));
        }
        cursor = d.nextCursor; more.hidden = !cursor;
        status.textContent = `${plural(d.counts.pendingClaims, "claim")} waiting · ${plural(d.counts.conflictKeys, "name")} claimed by more than one account${tbody.firstChild ? "" : " · nothing to review"}`;
      } catch (e) { if (gen !== generation) return; if (codeOf(e) === "cursor_stale") { toast(COMMUNITY_ERRORS.cursor_stale); return load(true); } status.textContent = explainAdmin(e, "The claims could not be read."); }
      finally { if (gen === generation) more.disabled = false; }
    };
    more.addEventListener("click", () => load(false));
    add(holder, frame("Character claims", null, h("p", { class: "muted small", text: "Alts members claimed in their profiles, waiting for an officer, and names claimed by more than one account. Confirming only marks the label officer-confirmed in the directory. It does not establish verified character ownership or change any role." }), status, h("div", { class: "table-wrap" }, h("table", { class: "data" }, h("thead", null, h("tr", null, h("th", { text: "Member" }), h("th", { text: "Character" }), h("th", { text: "Claim" }), h("th", { text: "Conflict" }), h("th", { text: "Since" }), h("th", { text: "" }))), tbody)), h("div", { class: "btn-row" }, more)));
    load(true);
  }

  // "Sign in to apply" on the Roles page: after the Discord sign-in the site opens at "/", so the role that was chosen
  // waits in this tab's sessionStorage and the application opens with it.
  try {
    const remembered = sessionStorage.getItem(PICK_KEY);
    if (remembered !== null) sessionStorage.removeItem(PICK_KEY);
    if (remembered && S.signedIn && !S.denied) {
      S.pick = remembered;
      history.replaceState(null, "", "#/apply");
      lastHash = location.hash; // what "Leave without saving?" returns to
    }
  } catch { /* storage off: the Home page it is */ }
  render();
})();
