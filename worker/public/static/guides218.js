/* .218 Olympus guides and tools: in-house class, spec and profession guides, raid-preparation tools and the Resources hub.
 * Original Olympus text. Every Forever fact carries a grade and a source; Classic numbers are labelled, unknowns say
 * "Unavailable" and never 0. Built with createElement and textContent only: no HTML strings, inline styles or eval. */
(function (root) {
  "use strict";
  const DATA_URL = "/static/guides218.json";
  const HOSTS = new Set(["worldofwarcraft.blizzard.com", "news.blizzard.com", "us.forums.blizzard.com", "eu.forums.blizzard.com", "warcraft.wiki.gg",
    "www.wowhead.com", "wowhead.com", "www.icy-veins.com", "icy-veins.com", "www.method.gg", "method.gg", "www.warcrafttavern.com", "warcrafttavern.com",
    "talentsforever.com", "www.talentsforever.com", "www.curseforge.com", "curseforge.com", "github.com", "wowpedia.fandom.com"]);
  const GRADES = ["A", "B", "C", "D", "E", "U"];
  const CODE = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(30|60)\.([0-9]+)$/;
  const ROLE_ICON = { tank: "role-tank", healer: "role-healer", melee: "role-dps", ranged: "role-dps", caster: "role-dps" };
  const TOOLS = [
    ["attunements", "Attunements & pre-raid checklist", "Raid access, what Blizzard has announced, and a slot-by-slot gearing checklist."],
    ["buffs", "World buffs & consumables", "Pick a role, tick what you will bring and see the combined effect, with every Classic number labelled."],
    ["changes", "What changed in Forever", "The systems Forever changes, and the talent snapshot's changes for every class."],
  ];
  const STAT_LABEL = { strength: "Strength", agility: "Agility", stamina: "Stamina", intellect: "Intellect", spirit: "Spirit", attackPower: "Attack power",
    spellPower: "Spell power", healing: "Healing", crit: "Critical strike %", spellCrit: "Spell critical %", hit: "Hit %", spellHit: "Spell hit %", armor: "Armor",
    mp5: "Mana per 5 sec", hp5: "Health per 5 sec", fireResistance: "Fire resistance", frostResistance: "Frost resistance",
    natureResistance: "Nature resistance", shadowResistance: "Shadow resistance", arcaneResistance: "Arcane resistance" };
  let dataPromise = null;

  const fail = message => { throw Error(message); };
  const isText = (v, max = 400) => typeof v === "string" && v.length > 0 && v.length <= max;
  const isList = (v, max) => Array.isArray(v) && v.length <= max;
  function safeUrl(url) {
    if (typeof url !== "string" || url.length > 400) return null;
    const m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>]*)?$/.exec(url);
    return m && HOSTS.has(m[1]) ? url : null;
  }

  /* Closed validation: the page refuses the whole file rather than showing part of an unchecked one. */
  function validate(data, revision) {
    if (!data || data.schema !== "olympus-guides-v1" || data.version !== 1) fail("schema");
    if (!/^[a-f0-9]{12}$/.test(data.talentRevision) || (revision && data.talentRevision !== revision)) fail("revision");
    if (!isText(data.scopeNote, 600) || !isText(data.reviewedAt, 10) || !data.grades || GRADES.some(g => !isText(data.grades[g], 120))) fail("header");
    if (!isList(data.sources, 400) || data.sources.some(s => !s || !isText(s.label, 200) || !isText(s.publisher, 80) || !safeUrl(s.url))) fail("sources");
    const sourceOk = list => isList(list, 12) && list.every(n => Number.isInteger(n) && n >= 0 && n < data.sources.length);
    const claimOk = c => c && isText(c.label, 160) && GRADES.includes(c.grade) && (c.grade === "U" ? c.value === null : isText(c.value)) && sourceOk(c.sources)
      && (c.note === undefined || isText(c.note));
    const claimsOk = (list, max) => isList(list, max) && list.every(claimOk);
    const textsOk = (list, max) => isList(list, max) && list.every(t => isText(t));
    if (!isList(data.classes, 9) || data.classes.length !== 9) fail("classes");
    const presetIds = new Set();
    if (!isList(data.presets, 120)) fail("presets");
    for (const p of data.presets) {
      const m = p && CODE.exec(p.code);
      if (!m || m[1] !== data.talentRevision || m[2] !== p.classId || Number(m[3]) !== p.level || !isText(p.label, 120) || !isText(p.id, 80) || presetIds.has(p.id)
        || !["leveling", "dungeon", "raid", "pvp"].includes(p.context) || !Array.isArray(p.treePoints) || p.treePoints.length !== 3
        || p.treePoints.reduce((a, b) => a + b, 0) !== p.points || !textsOk(p.why, 3) || !p.provenance || !isText(p.provenance.kind, 40)) fail("preset");
      presetIds.add(p.id);
    }
    for (const c of data.classes) {
      if (!c || !/^[a-z]+$/.test(c.id) || !isText(c.name, 40) || !textsOk(c.overview, 4) || !isList(c.changes, 8) || !isList(c.classQuests, 6) || !isList(c.specs, 3) || c.specs.length !== 3) fail("class");
      if (c.changes.some(x => !x || !isText(x.text) || !["announced", "pinned-data", "pending"].includes(x.status) || !sourceOk(x.sources))) fail("class changes");
      if (c.classQuests.some(q => !q || !isText(q.title, 120) || !isText(q.levelHint, 60) || !isText(q.note) || !GRADES.includes(q.grade) || !sourceOk(q.sources))) fail("class quests");
      for (const s of c.specs) {
        if (!s || !/^[a-z-]+$/.test(s.id) || !isText(s.name, 40) || !isList(s.roles, 2) || !s.roles.every(r => ROLE_ICON[r]) || !s.beginner || !s.pro || !s.pvp || !s.whatChanged) fail("spec");
        const b = s.beginner;
        if (!textsOk(b.summary, 3) || !textsOk(b.rotation, 5) || !textsOk(b.leveling, 4) || !textsOk(b.tips, 4)) fail("beginner");
        if (!claimsOk(s.pro.priorities, 6) || !claimsOk(s.pro.raid, 6) || !claimsOk(s.pro.consumables, 6)) fail("pro");
        if (!textsOk(s.pvp.overview, 3) || !isList(s.pvp.matchups, 4) || s.pvp.matchups.some(m => !m || !isText(m.vs, 40) || !isText(m.text))) fail("pvp");
        if (!isList(s.presets, 3) || s.presets.some(id => !presetIds.has(id))) fail("spec presets");
        if (["changed", "same", "moved", "new", "classicOnly"].some(k => !Number.isInteger(s.whatChanged[k]) || s.whatChanged[k] < 0)) fail("what changed");
      }
    }
    if (!isList(data.professions, 12) || data.professions.length !== 12) fail("professions");
    for (const p of data.professions) {
      if (!p || !/^[a-z-]+$/.test(p.key) || !isText(p.name, 40) || !isText(p.type, 20) || !textsOk(p.overview, 3) || !isList(p.pairsWith, 2)
        || !claimsOk(p.changes, 6) || !claimsOk(p.leveling, 8) || !claimsOk(p.raidValue, 4) || !isText(p.goldNote) || !textsOk(p.unknowns, 4)) fail("profession");
    }
    const t = data.tools;
    if (!t || !isList(t.attunements, 3) || !t.preBis || !isList(t.worldBuffs, 12) || !isList(t.consumables, 30) || !isList(t.whatChanged, 30)) fail("tools");
    if (t.attunements.some(a => !a || !isText(a.raid, 60) || !isText(a.opens, 120) || !isText(a.size, 2) || !claimOk(a.requirement) || !claimsOk(a.steps, 8))) fail("attunements");
    if (!isText(t.preBis.note) || !isList(t.preBis.slots, 16) || t.preBis.slots.some(s => !s || !isText(s.slot, 40) || !claimOk(s.guidance)) || !claimsOk(t.preBis.checklist, 10)) fail("pre-raid");
    const statsOk = st => st === undefined || (st && typeof st === "object" && Object.keys(st).every(k => STAT_LABEL[k] && Number.isFinite(st[k])));
    for (const r of [...t.worldBuffs, ...t.consumables]) {
      if (!r || !isText(r.id, 80) || !isText(r.name, 80) || !isText(r.effect) || !GRADES.includes(r.grade) || !sourceOk(r.sources) || !statsOk(r.stats)
        || !(r.durationMin === null || (Number.isFinite(r.durationMin) && r.durationMin > 0))) fail("buffs");
    }
    if (t.whatChanged.some(x => !x || !isText(x.topic, 60) || !isText(x.text) || !["announced", "pinned-data", "pending"].includes(x.status) || !sourceOk(x.sources))) fail("compendium");
    if (!isList(data.classSummary, 9) || data.classSummary.some(x => !x || !isText(x.name, 40) || ["changed", "same", "moved", "new", "classicOnly"].some(k => !Number.isInteger(x[k])))) fail("summary");
    return data;
  }

  function load(revision) {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL, { credentials: "same-origin", redirect: "error", cache: "no-store" })
        .then(r => { if (!r.ok) throw Error("status " + r.status); return r.json(); })
        .catch(error => { dataPromise = null; throw error; });
    }
    return dataPromise.then(data => validate(data, revision));
  }

  function mount(container, options = {}) {
    const doc = container.ownerDocument || root.document;
    let alive = true, sequence = 0;
    const listeners = [];
    const el = (tag, props, ...kids) => {
      const node = doc.createElement(tag);
      for (const [k, v] of Object.entries(props || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") { node.addEventListener(k.slice(2), v); listeners.push([node, k.slice(2), v]); }
        else node.setAttribute(k, v === true ? "" : String(v));
      }
      for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) node.appendChild(typeof kid === "string" ? doc.createTextNode(kid) : kid);
      return node;
    };
    const link = (href, text, cls) => el("a", { href, text, class: cls });
    const external = (url, text) => safeUrl(url) ? el("a", { href: url, text, target: "_blank", rel: "noopener noreferrer" }) : el("span", { text });
    const icon = (name, alt = "") => el("img", { src: "/static/wow/" + name + ".png", alt, width: 32, height: 32, class: "guides218-icon", loading: "lazy" });
    const section = (title, ...kids) => el("section", { class: "card guides218-section" }, el("h2", { text: title }), ...kids);
    const list = (items, ordered) => el(ordered ? "ol" : "ul", { class: "guides218-list" }, items.map(t => el("li", { text: t })));
    const shell = el("div", { class: "guides218" });
    container.appendChild(shell);
    shell.appendChild(el("p", { role: "status", class: "muted", text: "Opening the guides…" }));

    function sourcesLine(data, ids) {
      if (!ids || !ids.length) return null;
      return el("span", { class: "guides218-sources" }, "Source: ", ids.map((n, i) => [i ? ", " : "", external(data.sources[n].url, data.sources[n].publisher)]));
    }
    function grade(data, g) {
      return el("abbr", { class: "guides218-grade", "data-grade": g, title: data.grades[g], text: g });
    }
    function claim(data, c) {
      return el("li", { class: "guides218-claim", "data-grade": c.grade },
        el("strong", { text: c.label + ": " }), el("span", { text: c.grade === "U" ? "Unavailable" : c.value }), " ", grade(data, c.grade),
        c.note ? el("span", { class: "muted guides218-note", text: " " + c.note }) : null, " ", sourcesLine(data, c.sources));
    }
    const claims = (data, items, empty = "Nothing confirmed yet.") => items.length ? el("ul", { class: "guides218-claims" }, items.map(c => claim(data, c))) : el("p", { class: "muted", text: empty });
    function legend(data, used) {
      const grades = GRADES.filter(g => used.has(g));
      if (!grades.length) return null;
      return el("details", { class: "guides218-legend" }, el("summary", { text: "How to read the grades" }),
        el("dl", null, grades.map(g => [el("dt", null, grade(data, g)), el("dd", { text: data.grades[g] })])));
    }
    const collect = (used, items) => { for (const c of items) if (c && c.grade) used.add(c.grade); };
    function header(data, title, iconName, lead) {
      return el("header", { class: "guides218-head" }, iconName ? icon(iconName) : null, el("div", null, el("h1", { text: title }),
        lead ? el("p", { class: "guides218-lead", text: lead }) : null, el("p", { class: "muted small", text: data.scopeNote })));
    }
    function crumbs(...pairs) {
      return el("nav", { class: "guides218-crumbs", "aria-label": "Breadcrumb" }, pairs.map(([href, text], i) => [i ? " › " : "", href ? link(href, text) : el("span", { "aria-current": "page", text })]));
    }
    function presetCard(data, p) {
      const cls = data.classes.find(c => c.id === p.classId), trees = cls ? cls.specs.map(s => s.name) : ["", "", ""];
      const href = "#/talents/" + p.classId + "/" + encodeURIComponent(p.code);
      const status = el("p", { class: "muted small", role: "status" });
      let attach = null;
      if (typeof options.onAttach === "function") {
        attach = el("button", { type: "button", class: "btn", text: "Attach to my application", disabled: options.canAttach === false,
          onclick: () => { status.textContent = "Opening your application with this build…"; options.onAttach(Object.freeze({ presetId: p.id, label: p.label, classId: p.classId, level: p.level, code: p.code })); } });
      }
      return el("article", { class: "guides218-preset", "data-preset": p.id },
        el("h3", { text: p.label }),
        el("p", { class: "muted small", text: "Level " + p.level + " · " + p.context + " · " + p.treePoints.map((n, i) => trees[i] + " " + n).join(" / ") }),
        list(p.why),
        el("p", { class: "muted small", text: "Olympus editorial starting point, checked against talent snapshot " + data.talentRevision + " on " + p.provenance.reviewedAt + ". Adjust it to your gear and group." }),
        el("div", { class: "btn-row" }, link(href, "Load this build in the talent calculator", "btn"), attach),
        options.canAttach === false && options.attachReason ? el("p", { class: "muted small", text: options.attachReason }) : null, status);
    }

    function hub(data) {
      const frag = [header(data, "Olympus guides & tools", null, "Class, spec and profession guides written for Olympus, plus raid-preparation tools.")];
      frag.push(section("Class guides", el("div", { class: "guides218-grid" }, data.classes.map(c => el("article", { class: "guides218-card" },
        el("h3", null, icon("class-" + c.id), " ", link("#/guides/class/" + c.id, c.name)),
        el("p", { class: "small" }, c.specs.map((s, i) => [i ? " · " : "", link("#/guides/class/" + c.id + "/" + s.id, s.name)])))))));
      frag.push(section("Profession guides", el("div", { class: "guides218-grid" }, data.professions.map(p => el("article", { class: "guides218-card" },
        el("h3", null, icon("prof-" + p.key.replace("-", "_")), " ", link("#/guides/profession/" + p.key, p.name)), el("p", { class: "small muted", text: p.type }))))));
      frag.push(section("Raid preparation tools", el("div", { class: "guides218-grid" }, TOOLS.map(([id, name, text]) => el("article", { class: "guides218-card" },
        el("h3", null, link("#/guides/tools/" + id, name)), el("p", { class: "small", text }))))));
      frag.push(section("More resources", el("ul", { class: "guides218-list" },
        el("li", null, link("#/talents", "Talent calculator"), " — plan a build and compare it with Classic."),
        el("li", null, link("#/addons", "Addons for Forever"), " — the curated addon directory."),
        el("li", null, link("#/guides", "Guide library"), " — reviewed guides from other publishers."),
        el("li", null, link("#/updates", "Game updates"), " — Blizzard news and patch notes."),
        el("li", null, link("#/guide/member", "Member guide"), " — how Olympus works."))));
      return frag;
    }

    function classView(data, cls, spec) {
      const used = new Set();
      const frag = [crumbs(["#/resources", "Guides & tools"], [null, cls.name + (spec ? " · " + spec.name : "")]), header(data, cls.name + " guide", "class-" + cls.id, cls.overview[0])];
      frag.push(el("nav", { class: "guides218-tabs", "aria-label": cls.name + " specs" }, cls.specs.map(s => el("a", { href: "#/guides/class/" + cls.id + "/" + s.id,
        class: "btn small" + (spec && s.id === spec.id ? " active" : ""), "aria-current": spec && s.id === spec.id ? "page" : null }, icon(ROLE_ICON[s.roles[0]]), " " + s.name))));
      if (cls.overview.length > 1) frag.push(section("Class overview", list(cls.overview.slice(1))));
      if (cls.changes.length) frag.push(section("What Forever changes for " + cls.name, el("ul", { class: "guides218-list" }, cls.changes.map(x =>
        el("li", null, el("span", { class: "guides218-status", "data-status": x.status, text: x.status === "announced" ? "Announced" : x.status === "pinned-data" ? "Talent snapshot" : "Pending" }), " ", x.text, " ", sourcesLine(data, x.sources))))));
      if (cls.classQuests.length) { collect(used, cls.classQuests); frag.push(section("Class quests", el("ul", { class: "guides218-claims" }, cls.classQuests.map(q =>
        el("li", { class: "guides218-claim" }, el("strong", { text: q.title }), " (" + q.levelHint + ") ", grade(data, q.grade), " ", q.note, " ", sourcesLine(data, q.sources)))))); }
      const s = spec || cls.specs[0];
      collect(used, [...s.pro.priorities, ...s.pro.raid, ...s.pro.consumables]);
      frag.push(section(s.name + ": quick start", el("div", { class: "guides218-columns" },
        el("div", null, el("h3", { text: "What it does" }), list(s.beginner.summary)),
        el("div", null, el("h3", { text: "Rotation and priorities" }), list(s.beginner.rotation, true))),
        s.beginner.leveling.length ? [el("h3", { text: "Leveling" }), list(s.beginner.leveling)] : null,
        s.beginner.tips.length ? [el("h3", { text: "Tips" }), list(s.beginner.tips)] : null));
      frag.push(section(s.name + ": advanced",
        el("h3", { text: "Priorities" }), claims(data, s.pro.priorities), el("h3", { text: "In the raid" }), claims(data, s.pro.raid),
        el("h3", { text: "Consumables" }), claims(data, s.pro.consumables)));
      frag.push(section(s.name + ": PvP", s.pvp.overview.length ? list(s.pvp.overview) : el("p", { class: "muted", text: "No PvP notes yet." }),
        s.pvp.matchups.length ? el("dl", { class: "guides218-matchups" }, s.pvp.matchups.map(m => [el("dt", { text: "Against " + m.vs }), el("dd", { text: m.text })])) : null));
      const presets = s.presets.map(id => data.presets.find(p => p.id === id));
      frag.push(section(s.name + ": talent starting points", el("div", { class: "guides218-presets" }, presets.map(p => presetCard(data, p)))));
      const w = s.whatChanged;
      frag.push(section(s.name + ": talent tree changes", el("p", { text: "Compared with Classic, the " + s.name + " tree in the talent snapshot has " + w.new + " new, " + w.changed + " changed, " + w.moved + " moved and " + w.same + " unchanged talents; " + w.classicOnly + " Classic talents are gone." }),
        el("p", null, link("#/talents/" + cls.id, "Open the calculator and switch on Compare to Classic", "btn small"))));
      frag.push(legend(data, used));
      return frag;
    }

    function professionView(data, p) {
      const used = new Set(); collect(used, [...p.changes, ...p.leveling, ...p.raidValue]);
      const pairs = p.pairsWith.map(k => data.professions.find(x => x.key === k)).filter(Boolean);
      return [crumbs(["#/resources", "Guides & tools"], [null, p.name]), header(data, p.name + " guide", "prof-" + p.key.replace("-", "_"), p.overview[0]),
        p.overview.length > 1 ? section("Overview", list(p.overview.slice(1))) : null,
        pairs.length ? section("Pairs well with", el("p", null, pairs.map((x, i) => [i ? " · " : "", link("#/guides/profession/" + x.key, x.name)]))) : null,
        section("What Forever changes", claims(data, p.changes)), section("Leveling", claims(data, p.leveling)),
        section("Value for the raid", claims(data, p.raidValue)), section("Gold", el("p", { text: p.goldNote })),
        p.unknowns.length ? section("Still unknown", list(p.unknowns)) : null, legend(data, used)];
    }

    function checklist(data, rows, labelOf, claimOf) {
      const done = new Set(), count = el("p", { class: "muted small", role: "status" });
      const update = () => { count.textContent = done.size + " of " + rows.length + " done. Ticks stay on this page only."; };
      update();
      return [count, el("ul", { class: "guides218-checklist" }, rows.map((r, i) => {
        const id = "guides218-check-" + (++sequence) + "-" + i;
        const box = el("input", { type: "checkbox", id, onchange: () => { if (box.checked) done.add(i); else done.delete(i); update(); } });
        const c = claimOf(r);
        return el("li", null, box, el("label", { for: id, text: labelOf(r) }), " ", c ? el("span", { class: "small" }, c.grade === "U" ? "Unavailable" : c.value, " ", grade(data, c.grade), " ", sourcesLine(data, c.sources)) : null);
      }))];
    }

    function toolView(data, id) {
      const t = data.tools, used = new Set(), title = (TOOLS.find(x => x[0] === id) || [])[1];
      const frag = [crumbs(["#/resources", "Guides & tools"], [null, title]), header(data, title, null, (TOOLS.find(x => x[0] === id) || [])[2])];
      if (id === "attunements") {
        for (const a of t.attunements) {
          collect(used, [a.requirement, ...a.steps]);
          frag.push(section(a.raid + " (" + a.size + " players)", el("p", { text: "Opens: " + a.opens }), el("ul", { class: "guides218-claims" }, claim(data, a.requirement)),
            a.steps.length ? [el("h3", { text: "Steps" }), ...checklist(data, a.steps, s => s.label, s => s)] : null));
        }
        collect(used, [...t.preBis.slots.map(s => s.guidance), ...t.preBis.checklist]);
        frag.push(section("Pre-raid gear checklist", el("p", { text: t.preBis.note }), ...checklist(data, t.preBis.slots, s => s.slot, s => s.guidance),
          el("h3", { text: "Before your first raid" }), ...checklist(data, t.preBis.checklist, c => c.label, c => c)));
      } else if (id === "buffs") {
        frag.push(buffCalculator(data, used));
      } else if (id === "changes") {
        const groups = [["announced", "Announced by Blizzard"], ["pinned-data", "From the talent snapshot"], ["pending", "Not settled yet"]];
        for (const [status, name] of groups) {
          const rows = t.whatChanged.filter(x => x.status === status);
          if (rows.length) frag.push(section(name, el("dl", { class: "guides218-compendium" }, rows.map(x => [el("dt", { text: x.topic }), el("dd", null, x.text, " ", sourcesLine(data, x.sources))]))));
        }
        frag.push(section("Talent changes by class", el("table", { class: "guides218-table" },
          el("caption", { text: "Talent snapshot " + data.talentRevision + " compared with Classic 1.12 (rank-one text)" }),
          el("thead", null, el("tr", null, ["Class", "New", "Changed", "Moved", "Unchanged", "Removed"].map(h => el("th", { scope: "col", text: h })))),
          el("tbody", null, data.classSummary.map(x => el("tr", null, el("th", { scope: "row" }, link("#/talents/" + x.id, x.name)),
            [x.new, x.changed, x.moved, x.same, x.classicOnly].map(n => el("td", { text: String(n) }))))))));
      }
      frag.push(legend(data, used));
      return frag;
    }

    function buffCalculator(data, used) {
      const t = data.tools, rows = [...t.worldBuffs.map(r => ({ ...r, kind: "World buff" })), ...t.consumables.map(r => ({ ...r, kind: "Consumable" }))];
      collect(used, rows);
      const picked = new Set();
      const role = el("select", { id: "guides218-role", onchange: () => draw() }, [["", "Every role"], ["tank", "Tank"], ["healer", "Healer"], ["melee", "Melee"], ["ranged", "Ranged"], ["caster", "Caster"]]
        .map(([v, text]) => el("option", { value: v, text })));
      const box = el("div", { class: "guides218-buffs" }), total = el("div", { class: "guides218-total", role: "status", "aria-live": "polite" });
      function sum() {
        const totals = {}, grades = new Set(), chosen = rows.filter(r => picked.has(r.id));
        for (const r of chosen) { grades.add(r.grade); for (const [k, v] of Object.entries(r.stats || {})) totals[k] = (totals[k] || 0) + v; }
        const keys = Object.keys(totals);
        // replaceChildren would print a null as the text "null", so absent parts are filtered out first.
        total.replaceChildren(...[el("h3", { text: chosen.length ? "Combined effect of " + chosen.length + " selected" : "Nothing selected yet" }),
          keys.length ? el("ul", { class: "guides218-list" }, keys.map(k => el("li", { text: STAT_LABEL[k] + ": +" + Math.round(totals[k] * 100) / 100 }))) : null,
          chosen.length && (grades.has("D") || grades.has("E")) ? el("p", { class: "muted small", text: "These totals use Classic reference numbers that are not Forever-verified. Stacking rules in Forever may differ." }) : null,
          chosen.some(r => r.durationMin) ? el("p", { class: "small", text: "Shortest duration: " + Math.min(...chosen.filter(r => r.durationMin).map(r => r.durationMin)) + " min." }) : null].filter(Boolean));
      }
      function draw() {
        const wanted = role.value;
        box.replaceChildren(el("ul", { class: "guides218-checklist" }, rows.filter(r => !wanted || r.kind === "World buff" || (r.roles || []).includes(wanted)).map(r => {
          const id = "guides218-buff-" + r.id.replace(/[^a-z0-9-]/g, "");
          const input = el("input", { type: "checkbox", id, checked: picked.has(r.id), onchange: () => { if (input.checked) picked.add(r.id); else picked.delete(r.id); sum(); } });
          return el("li", null, input, el("label", { for: id }, el("strong", { text: r.name }), " · " + r.kind), " ", grade(data, r.grade),
            el("p", { class: "small", text: r.effect + (r.durationMin ? " Lasts " + r.durationMin + " min." : "") + (r.foreverStatus ? " " + r.foreverStatus : "") }), sourcesLine(data, r.sources));
        })));
        sum();
      }
      draw();
      return section("Choose what you will bring", el("label", { for: "guides218-role", text: "Show consumables for " }), role, box, total);
    }

    function render(data) {
      const view = options.view, frag = [];
      if (view === "class") {
        const cls = data.classes.find(c => c.id === options.classId), spec = cls && options.specId ? cls.specs.find(s => s.id === options.specId) : null;
        if (!cls || (options.specId && !spec)) frag.push(el("p", { text: "There is no such guide." }), link("#/resources", "Back to guides & tools", "btn"));
        else frag.push(...classView(data, cls, spec));
      } else if (view === "profession") {
        const p = data.professions.find(x => x.key === options.profession);
        if (!p) frag.push(el("p", { text: "There is no such guide." }), link("#/resources", "Back to guides & tools", "btn"));
        else frag.push(...professionView(data, p));
      } else if (view === "tool") {
        if (!TOOLS.some(x => x[0] === options.tool)) frag.push(el("p", { text: "There is no such tool." }), link("#/resources", "Back to guides & tools", "btn"));
        else frag.push(...toolView(data, options.tool));
      } else frag.push(...hub(data));
      shell.replaceChildren(...frag.filter(Boolean));
    }

    load(options.talentRevision).then(data => { if (alive) render(data); }, () => {
      if (alive) shell.replaceChildren(el("p", { role: "alert", text: "The guides could not be loaded. Try again in a moment." }));
    });
    return { destroy() { alive = false; for (const [node, type, fn] of listeners) node.removeEventListener(type, fn); listeners.length = 0; shell.remove(); } };
  }

  root.OlympusGuides = Object.freeze({ mount, validate });
})(typeof window !== "undefined" ? window : globalThis);
