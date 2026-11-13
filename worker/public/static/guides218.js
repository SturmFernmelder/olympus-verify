/* .218 Olympus guide tools: the raid-preparation tools linked from Olympus University (#/guides/tools/<id>).
 * Since Evergreen Stage 2 (12 Nov 2026) the class, spec, race and profession courses are rendered by
 * university/university.js; this file keeps the four tools and the closed validation of guides218.json. Original Olympus text. Every Forever fact carries a grade and a source; Classic numbers are labelled, unknowns say
 * "Unavailable" and never 0. Built with createElement and textContent only: no HTML strings, inline styles or eval. */
(function (root) {
  "use strict";
  const DATA_URL = "/static/guides218.json";
  const GUIDES_TITLE = "Olympus University";
  const TALENT_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
  const HOSTS = new Set(["worldofwarcraft.blizzard.com", "news.blizzard.com", "us.forums.blizzard.com", "eu.forums.blizzard.com", "warcraft.wiki.gg",
    "www.wowhead.com", "wowhead.com", "www.icy-veins.com", "icy-veins.com", "www.method.gg", "method.gg", "www.warcrafttavern.com", "warcrafttavern.com",
    "talentsforever.com", "www.talentsforever.com", "www.curseforge.com", "curseforge.com", "github.com", "wowpedia.fandom.com"]);
  const CLASSIC_BUILD = "1.15.9.69722";
  const CLASSIC_SOURCES = new Set(["Spell", "SpellEffect", "SpellMisc", "SpellDuration"]
    .map(table => `https://wago.tools/db2/${table}/csv?build=${CLASSIC_BUILD}`));
  const GRADES = ["A", "B", "C", "D", "E", "U"];
  const CODE = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(30|60)\.([0-9]+)$/;
  const ROLE_ICON = { tank: "role-tank", healer: "role-healer", melee: "role-dps", ranged: "role-dps", caster: "role-dps" };
  const BUFF_ROLES = [["tank", "Tank"], ["healer", "Healer"], ["melee", "Melee"], ["ranged", "Ranged"], ["caster", "Caster"]];
  const TOOLS = [
    ["attunements", "Attunements & pre-raid checklist", "Raid access, what Blizzard has announced, and a slot-by-slot gearing checklist."],
    ["buffs", "World buffs & consumables", "Pick a role and compare recorded effects for different encounters, with every Classic number labelled."],
    ["raid-structure", "Raid team structure & leadership", "Fox’s guide to organizing one roster for 10-, 20- and 40-player raids."],
    ["changes", "What changed in Forever", "The systems Forever changes, and each class's talent changes in the calculator's data."],
  ];
  const STAT_LABEL = { strength: "Strength", agility: "Agility", stamina: "Stamina", intellect: "Intellect", spirit: "Spirit", attackPower: "Attack power",
    spellPower: "Spell power", healing: "Healing", crit: "Critical strike %", spellCrit: "Spell critical %", hit: "Hit %", spellHit: "Spell hit %", armor: "Armor",
    mp5: "Mana per 5 sec", hp5: "Health per 5 sec", fireResistance: "Fire resistance", frostResistance: "Frost resistance",
    natureResistance: "Nature resistance", shadowResistance: "Shadow resistance", arcaneResistance: "Arcane resistance" };
  const SLOT_LABEL = { "finger 1": "Ring 1", "finger 2": "Ring 2", "off hand/ranged": "Off hand / Ranged" };
  let dataPromise = null;

  const fail = message => { throw Error(message); };
  const isText = (v, max = 400) => typeof v === "string" && v.length > 0 && v.length <= max;
  const isList = (v, max) => Array.isArray(v) && v.length <= max;
  function safeUrl(url) {
    if (typeof url !== "string" || url.length > 400) return null;
    if (CLASSIC_SOURCES.has(url)) return url;
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
    const checklistRowsOk = (list, max) => claimsOk(list, max)
      && list.every(c => c.kind === undefined || c.kind === "fact" || (c.kind === "action" && c.grade !== "U"));
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
      if (c.changes.some(x => !x || !isText(x.text) || !["live", "announced", "pinned-data", "pending"].includes(x.status) || !sourceOk(x.sources))) fail("class changes");
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
      if (!p || !/^[a-z-]+$/.test(p.key) || !isText(p.name, 40) || !["primary", "gathering", "secondary"].includes(p.type) || !textsOk(p.overview, 3) || !isList(p.pairsWith, 2)
        || !claimsOk(p.changes, 6) || !claimsOk(p.leveling, 8) || !claimsOk(p.raidValue, 4) || !isText(p.goldNote) || !textsOk(p.unknowns, 4)) fail("profession");
    }
    const t = data.tools;
    if (!t || !isList(t.attunements, 3) || !t.preBis || !isList(t.worldBuffs, 12) || !isList(t.consumables, 30) || !isList(t.whatChanged, 30)) fail("tools");
    if (t.attunements.some(a => !a || !isText(a.raid, 60) || !isText(a.opens, 120) || !isText(a.size, 2) || !claimOk(a.requirement) || !checklistRowsOk(a.steps, 8))) fail("attunements");
    if (!isText(t.preBis.note) || !isList(t.preBis.slots, 16) || t.preBis.slots.some(s => !s || !isText(s.slot, 40) || !claimOk(s.guidance)) || !checklistRowsOk(t.preBis.checklist, 10)) fail("pre-raid");
    const statsOk = st => st === undefined || (st && typeof st === "object" && Object.keys(st).every(k => Object.hasOwn(STAT_LABEL, k) && Number.isFinite(st[k])));
    const flaskSpells = new Set();
    for (const r of [...t.worldBuffs, ...t.consumables]) {
      if (!r || !isText(r.id, 80) || !isText(r.name, 80) || !isText(r.effect) || !GRADES.includes(r.grade) || !sourceOk(r.sources) || !statsOk(r.stats)
        || (r.raid !== undefined && r.raid !== null && typeof r.raid !== "boolean")
        || (r.roles !== undefined && (!isList(r.roles, BUFF_ROLES.length) || !r.roles.every(role => BUFF_ROLES.some(([id]) => id === role))))
        || !(r.durationMin === null || (Number.isFinite(r.durationMin) && r.durationMin > 0))) fail("buffs");
      if (r.classicFlaskSpellId !== undefined) {
        const spell = r.classicFlaskSpellId;
        if (!Number.isSafeInteger(spell) || spell < 1 || flaskSpells.has(spell) || !t.consumables.includes(r) || r.grade !== "E"
          || r.stats !== undefined || r.durationMin === null || !r.sources.some(n => CLASSIC_SOURCES.has(data.sources[n].url))) fail("Classic flask");
        flaskSpells.add(spell);
      }
    }
    if (t.whatChanged.some(x => !x || !isText(x.topic, 60) || !isText(x.text) || !["live", "announced", "pinned-data", "pending"].includes(x.status) || !sourceOk(x.sources))) fail("compendium");
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
    const external = (url, text) => safeUrl(url) || url === TALENT_LICENSE_URL
      ? el("a", { href: url, text, target: "_blank", rel: "noopener noreferrer" }) : el("span", { text });
    const icon = (name, alt = "") => el("img", { src: "/static/wow/" + name + ".png", alt, width: 32, height: 32, class: "guides218-icon", loading: "lazy" });
    const section = (title, ...kids) => el("section", { class: "card guides218-section" }, el("h2", { text: title }), ...kids);
    const list = (items, ordered) => el(ordered ? "ol" : "ul", { class: "guides218-list" }, items.map(t => el("li", { text: t })));
    const shell = el("div", { class: "guides218" });
    container.appendChild(shell);
    shell.appendChild(el("p", { role: "status", class: "muted", text: "Opening the guides…" }));

    function sourcesLine(data, ids) {
      if (!ids || !ids.length) return null;
      const citations = new Map();
      for (const n of ids) {
        const { url, publisher, kind, label } = data.sources[n];
        const key = JSON.stringify([url, publisher, kind]);
        if (!citations.has(key)) citations.set(key, { url, publisher, labels: new Set() });
        const prefix = label.startsWith(publisher + ": ") ? publisher + ": " : publisher + " ";
        const title = label.startsWith(prefix) ? label.slice(prefix.length).trimStart() : label;
        citations.get(key).labels.add(title || label);
      }
      return el("span", { class: "guides218-sources" }, citations.size === 1 ? "Source: " : "Sources: ",
        [...citations.values()].map(({ url, publisher, labels }, i) =>
          [i ? " · " : "", external(url, publisher + " — " + [...labels].join(" / "))]));
    }
    const talentCredit = () => el("p", { class: "muted small guides218-talent-credit" }, "Talent data from ",
      external("https://talentsforever.com/", "Talents Forever"), " by Chris Baldwin, summarized by Olympus under ",
      external(TALENT_LICENSE_URL, "CC BY 4.0"), ".");
    function grade(data, g, described = false) {
      return el("abbr", { class: "guides218-grade", "data-grade": g, title: data.grades[g], "aria-label": described ? data.grades[g] : null, text: g });
    }
    function claimDetails(data, c, described = false) {
      return [el("span", { text: c.grade === "U" ? "Unavailable" : c.value }), " ", grade(data, c.grade, described),
        c.note ? el("span", { class: "muted guides218-note", text: " " + c.note }) : null];
    }
    function claimEvidence(data, c) {
      return [claimDetails(data, c), " ", sourcesLine(data, c.sources)];
    }
    function claim(data, c) {
      return el("li", { class: "guides218-claim", "data-grade": c.grade },
        el("strong", { class: "guides218-claim-label", text: c.label }), " ", claimEvidence(data, c));
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
    const byName = (a, b) => a.name.localeCompare(b.name, "en");
    function checklist(data, rows) {
      const done = new Set(), count = el("p", { class: "muted small", role: "status" }), listId = "guides218-check-" + (++sequence);
      const update = () => { count.textContent = done.size + " of " + rows.length + " done."; };
      update();
      return [count, el("ul", { class: "guides218-checklist" }, rows.map((r, i) => {
        const id = listId + "-" + i, descriptionId = id + "-description", c = r.guidance || r;
        const box = el("input", { type: "checkbox", id, "aria-describedby": descriptionId,
          onchange: () => { if (box.checked) done.add(i); else done.delete(i); update(); } });
        return el("li", { "data-grade": c.grade }, box, el("label", { for: id, text: r.label }),
          el("div", { class: "small" }, r.guidance ? [el("strong", { class: "guides218-claim-label", text: c.label }), " "] : null,
            el("span", { id: descriptionId }, claimDetails(data, c, true)), " ", sourcesLine(data, c.sources)));
      }))];
    }
    function checklistSections(data, rows, actionTitle, referenceTitle) {
      // The historical catalogue had no action marker. Keep those entries as readable evidence.
      const actions = rows.filter(c => c.kind === "action"), facts = rows.filter(c => c.kind !== "action");
      return [
        actions.length ? [el("h3", { text: actionTitle }), checklist(data, actions)] : null,
        facts.length ? [el("h3", { text: referenceTitle }), claims(data, facts)] : null,
      ];
    }

    function raidStructure() {
      const groups = [
        ["Barrow Deeps · 10 players", "Groups 1–2, 3–4, 5–6 and 7–8 each form a team."],
        ["Hyjal Summit · 20 players", "Groups 1–4 form one team and Groups 5–8 form the other."],
        ["Onyxia’s Lair · 40 players", "Groups 1–8 raid together."],
      ];
      return [
        section("One roster, three raid sizes",
          el("p", { text: "Adapted from Fox (akaFoxSlayer)’s raid leadership guidelines for Olympus. Use this as a planning framework and adjust it to the encounter, roster and availability." }),
          el("p", { text: "Start with eight groups of five. Keep the smaller groups familiar with one another and give each team comparable leadership, preparation and support." }),
          el("p", null, "Blizzard set 9 December 2026 as the unlock date for the first three Forever raids. See ", external("https://worldofwarcraft.blizzard.com/en-us/news/24303009", "Blizzard Entertainment — raid sizes and attunements"), "."),
          el("table", { class: "guides218-table" },
            el("caption", { text: "How the eight groups combine" }),
            el("thead", null, el("tr", null, ["Forever raid", "Group assignments"].map(text => el("th", { scope: "col", text })))),
            el("tbody", null, groups.map(([size, assignment]) => el("tr", null,
              el("th", { scope: "row", text: size }), el("td", { text: assignment })))))),
        section("Lead, deputy and one caller",
          list([
            "Assign a lead and deputy to each 10-player team. The lead sets the strategy and makes encounter calls. The deputy handles agreed assignments, logistics and player support.",
            "When teams combine, name one overall caller and agree on the deputies’ responsibilities before the pull.",
            "Raid leaders share attendance, progression blockers, role coverage and upcoming changes across teams.",
          ])),
        section("Keep progression teams steady",
          el("p", { text: "Start with roughly two to three weeks of stable groups, then use consistent clears and player readiness to decide when a raid is on farm. Adjust sooner for attendance or a specific encounter requirement." }),
          el("p", { text: "Agree in advance who can switch between tanking, healing and damage when groups combine. Plan backups and distribute buffs and utility across teams. Set the final composition from the encounter and the current game’s mechanics." })),
        section("Rotate on farm with notice",
          list([
            "Try swapping a whole 10-player team between the two 20-player raids, or agree to a smaller exchange when that suits the schedule and role coverage.",
            "Give players advance notice, confirm that both leads and affected players agree, and publish eligibility, reserve places and loot rules before signups.",
            "When a rotation also helps distribute gear, agree on eligibility up front. After the event starts, get affected participants’ consent for a loot rule change or defer it.",
            "Share strategies and recognize progress across teams. Apply the same published selection criteria to each team.",
          ]),
          el("p", null, "Read the ", link("#/governance/the-guild-statute-of-olympus/article-s11", "Olympus raid and loot rules"), " alongside this guide.")),
      ];
    }

    function toolView(data, id) {
      const t = data.tools, used = new Set(), title = (TOOLS.find(x => x[0] === id) || [])[1];
      const frag = [crumbs(["#/guides", GUIDES_TITLE], [null, title]), header(data, title, null, (TOOLS.find(x => x[0] === id) || [])[2])];
      if (id === "attunements") {
        frag.push(el("p", { class: "muted small", text: "Ticks stay on this page only and reset when you reopen it." }));
        for (const a of t.attunements) {
          collect(used, [a.requirement, ...a.steps]);
          frag.push(section(a.raid + " (" + a.size + " players)", el("p", { text: "Unlock date: " + a.opens }), el("ul", { class: "guides218-claims" }, claim(data, a.requirement)),
            checklistSections(data, a.steps, "Attunement steps", "Raid details")));
        }
        collect(used, [...t.preBis.slots.map(s => s.guidance), ...t.preBis.checklist]);
        const gear = t.preBis.slots.map(({ slot, guidance }) => ({
          label: Object.hasOwn(SLOT_LABEL, slot) ? SLOT_LABEL[slot] : slot[0].toUpperCase() + slot.slice(1), guidance,
        }));
        frag.push(section("Pre-raid gear checklist", el("p", { text: t.preBis.note }), el("h3", { text: "Gear by slot" }), checklist(data, gear),
          checklistSections(data, t.preBis.checklist, "Before your first raid", "Preparation references")));
      } else if (id === "buffs") {
        frag.push(buffCalculator(data, used));
      } else if (id === "raid-structure") {
        frag.push(...raidStructure());
      } else if (id === "changes") {
        // CL2-173 (12 Nov 2026): what is already live in the game comes first, then what Blizzard has announced.
        const groups = [["live", "Live in the game"], ["announced", "Announced by Blizzard"], ["pinned-data", "From the talent data"], ["pending", "Not settled yet"]];
        for (const [status, name] of groups) {
          const rows = t.whatChanged.filter(x => x.status === status);
          if (rows.length) frag.push(section(name, el("dl", { class: "guides218-compendium" }, rows.map(x => [el("dt", { text: x.topic }), el("dd", null, x.text, " ", sourcesLine(data, x.sources))]))));
        }
        frag.push(section("Talent changes by class", el("table", { class: "guides218-table" },
          el("caption", { text: "Talents compared with Classic 1.12 (rank-one text)" }),
          el("thead", null, el("tr", null, ["Class", "New", "Changed", "Moved", "Unchanged", "Removed"].map(h => el("th", { scope: "col", text: h })))),
          el("tbody", null, [...data.classSummary].sort(byName).map(x => el("tr", null, el("th", { scope: "row" }, link("#/talents/" + x.id, x.name)),
            [x.new, x.changed, x.moved, x.same, x.classicOnly].map(n => el("td", { text: String(n) }))))))));
      }
      frag.push(legend(data, used), id === "changes" ? talentCredit() : null, related(id));
      return frag;
    }

    // CL2-207 (12 Nov 2026): every tool links to the other tools, the courses and the guides that make what it lists.
    function related(id) {
      const items = TOOLS.filter(t => t[0] !== id).map(([tid, name]) => ["#/guides/tools/" + tid, name]);
      if (id === "buffs") items.push(["#/guides/profession/alchemy", "Alchemy guide"], ["#/guides/profession/cooking", "Cooking guide"], ["#/guides/profession/first-aid", "First Aid guide"]);
      // The raid team guide names the leaders; their offices are on the Roles page (integrator, 12 Nov 2026).
      if (id === "raid-structure") items.push(["#/roles/raid_leader", "Raid Leader office"], ["#/roles/class_lead", "Class Lead offices"]);      items.push(["#/talents", "Talent calculator"], ["#/addons", "Addons for Forever"], ["#/guides", "Olympus University"]);
      return el("nav", { class: "card guides218-section", "aria-label": "Related" }, el("h2", { text: "Related" }),
        el("ul", { class: "guides218-list" }, items.map(([href, text]) => el("li", null, link(href, text)))));
    }

    function buffCalculator(data, used) {
      const t = data.tools, rows = [...t.worldBuffs.map(r => ({ ...r, kind: "World buff" })), ...t.consumables.map(r => ({ ...r, kind: "Consumable" }))];
      collect(used, rows);
      const picked = new Set();
      let flaskPick = null, flaskInput = null;
      const role = el("select", { id: "guides218-role", onchange: () => draw() }, [["", "Every role"], ...BUFF_ROLES]
        .map(([v, text]) => el("option", { value: v, text })));
      const box = el("div", { class: "guides218-buffs" }), total = el("div", { class: "guides218-total", role: "status", "aria-live": "polite" });
      const flaskResult = el("p", { role: "status", "aria-live": "polite" });
      const updateFlask = () => {
        flaskResult.textContent = flaskPick ? `${flaskPick.name}. ${flaskPick.effect} Recorded duration: ${flaskPick.durationMin} min.` : "Choose a Classic flask to see its effect.";
      };
      const flaskComparison = rows.some(r => r.classicFlaskSpellId) ? el("div", { class: "guides218-total", "data-classic-flask": "" },
        el("h3", { text: "Classic Era flask comparison" }),
        el("p", { id: "guides218-classic-flask-rule", class: "muted small", text: `Classic Era ${CLASSIC_BUILD} reference. One flask can be active at a time. Its effect is shown separately from the encounter previews.` }),
        flaskResult, el("button", { class: "btn small", type: "button", text: "Clear flask choice", onclick: () => {
          if (flaskInput) flaskInput.checked = false;
          flaskPick = flaskInput = null;
          updateFlask();
        } })) : null;
      updateFlask();
      const visibleRows = () => rows.filter(r => !role.value || r.kind === "World buff" || !r.roles?.length || r.roles.includes(role.value));
      function preview(id, title, chosen) {
        const totals = {};
        const numeric = chosen.filter(r => r.stats && Object.keys(r.stats).length);
        for (const r of numeric) for (const [k, v] of Object.entries(r.stats)) totals[k] = (totals[k] || 0) + v;
        const keys = Object.keys(totals);
        const durations = chosen.map(r => r.durationMin).filter(n => n !== null);
        const withoutDuration = chosen.length - durations.length;
        return el("div", { "data-buff-context": id }, el("h4", { text: title }),
          keys.length ? el("ul", { class: "guides218-list" }, keys.map(k => el("li", { text: STAT_LABEL[k] + ": +" + Math.round(totals[k] * 100) / 100 })))
            : el("p", { class: "small", text: chosen.length ? "No numeric effects recorded for these selections." : "No selections included in this preview." }),
          numeric.length && numeric.length < chosen.length ? el("p", { class: "small", text: "Some selections have no recorded numeric effect." }) : null,
          numeric.some(r => r.grade === "D" || r.grade === "E")
            ? el("p", { class: "muted small", text: "Includes Classic reference numbers that are not Forever-verified." }) : null,
          durations.length ? el("p", { class: "small", text: "Shortest recorded duration: " + Math.min(...durations) + " min." }) : null,
          withoutDuration ? el("p", { class: "small", text: `${withoutDuration} of ${chosen.length} selections without a recorded duration.` }) : null);
      }
      function sum() {
        const chosen = visibleRows().filter(r => picked.has(r.id));
        const hidden = picked.size - chosen.length;
        total.replaceChildren(el("h3", { text: picked.size ? chosen.length + " selected in this view" : "No encounter selections yet" }),
          el("div", null,
            hidden ? el("p", { class: "small", text: hidden + " hidden by the role filter. Change the role to see those selections." }) : null,
            chosen.some(r => r.raid === false) ? el("p", { class: "small", text: "World-buff selections marked Outside raid preview are omitted from raid totals." }) : null,
            chosen.some(r => r.raid == null) ? el("p", { class: "small", text: "Selections marked without a raid estimate are omitted from the raid preview." }) : null,
            preview("open-world", "Open world reference", chosen),
            preview("raid", "Inside a raid reference", chosen.filter(r => r.raid === true))));
      }
      function draw() {
        flaskInput = null;
        box.replaceChildren(el("ul", { class: "guides218-checklist" }, visibleRows().map(r => {
          const id = "guides218-buff-" + r.id.replace(/[^a-z0-9-]/g, "");
          const raidStatus = r.raid === true ? "Raid reference" : r.raid === false ? "Outside raid preview" : "No raid estimate";
          const classicFlask = r.classicFlaskSpellId !== undefined;
          const input = el("input", { type: classicFlask ? "radio" : "checkbox", name: classicFlask ? "guides218-classic-flask" : null, id,
            "aria-describedby": classicFlask ? "guides218-classic-flask-rule" : null,
            checked: classicFlask ? flaskPick === r : picked.has(r.id), onchange: () => {
              if (classicFlask) {
                if (!input.checked) return;
                if (flaskInput && flaskInput !== input) flaskInput.checked = false;
                flaskPick = r;
                flaskInput = input;
                updateFlask();
                return;
              }
              if (input.checked) picked.add(r.id); else picked.delete(r.id);
              sum();
            } });
          if (classicFlask && flaskPick === r) flaskInput = input;
          const spell = classicFlask ? ` Classic spell ${r.classicFlaskSpellId}.` : "";
          return el("li", null, input, el("label", { for: id }, el("strong", { text: r.name }), " · " + r.kind),
            el("div", null, grade(data, r.grade), " ", el("span", { class: "guides218-status", text: raidStatus })),
            el("p", { class: "small", text: r.effect + spell + (r.durationMin ? " Lasts " + r.durationMin + " min." : " No duration recorded.") + (r.foreverStatus ? " " + r.foreverStatus : "") }), sourcesLine(data, r.sources));
        })));
        sum();
      }
      draw();
      return section("Choose what you will bring", el("label", { for: "guides218-role", text: "Show consumables for " }), role,
        el("p", { class: "muted small", text: "Encounter previews add recorded values for visible selections. Check each value, item availability, faction and stacking in game. Camp buffs have no raid estimate." }),
        box, total, flaskComparison);
    }

    // CL2-105 (12 Nov 2026): an address that matches no guide or tool still gets the page H1 and a way back.
    function notFound(title, text) {
      return [el("header", { class: "guides218-head" }, el("div", null, el("h1", { text: title }), el("p", { role: "status", text }))),
        el("p", null, link("#/guides", "Back to " + GUIDES_TITLE, "btn"))];
    }
    function render(data) {
      const frag = options.view === "tool" && TOOLS.some(x => x[0] === options.tool) ? toolView(data, options.tool)
        : notFound("Tool not found", "There is no such tool.");
      shell.replaceChildren(...frag.filter(Boolean));
    }

    load(options.talentRevision).then(data => { if (alive) render(data); }, () => {
      if (alive) shell.replaceChildren(el("p", { role: "alert", text: "The guides could not be loaded. Try again in a moment." }));
    });
    return { destroy() { alive = false; for (const [node, type, fn] of listeners) node.removeEventListener(type, fn); listeners.length = 0; shell.remove(); } };
  }

  root.OlympusGuides = Object.freeze({ mount, validate });
})(typeof window !== "undefined" ? window : globalThis);
