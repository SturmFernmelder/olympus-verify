/* Olympus University (Evergreen Stage 2, 12 Nov 2026; CL2-052, CL2-057, CL2-058, CL2-059, CL2-060, CL2-202, CL2-206, CL2-207).
 * The owner's directive (Pillar 3 item 3) asks for 101/201/301 courses with Theory paired with Praxis, quizzes at the
 * end of chapters and mastery exams. This module renders the hub, the class, spec, race and profession courses and
 * the exams from the files beside it, after validate.js has accepted every file the page uses (closed validation:
 * a file that fails is not shown in part). DOM is built with createElement and textContent only.
 * Scores (owner ruling, 12 Nov 2026): one localStorage key, read and written inside try/catch, clearable and
 * exportable; nothing is sent to the Worker. Question order is deterministic (FNV-1a over id and attempt), never a random draw. */
(function (root) {
  "use strict";
  const BASE = "/static/university/";
  const KEY = "olympus.university.v1";
  const TRACK_NAMES = { 101: "101 Foundations", 201: "201 Intermediate", 301: "301 Advanced" };
  const TOOLS = [["attunements", "Attunements & pre-raid checklist"], ["buffs", "World buffs & consumables"], ["raid-structure", "Raid team structure & leadership"], ["changes", "What changed in Forever"]];
  // The same one-line descriptions guides218.js shows on the tool pages.
  const TOOL_NOTES = { attunements: "Raid access, what Blizzard has announced, and a slot-by-slot gearing checklist.",
    buffs: "Pick a role and compare recorded effects for different encounters, with every Classic number labelled.",
    "raid-structure": "Fox’s guide to organizing one roster for 10-, 20- and 40-player raids.", changes: "The systems Forever changes, and each class's talent changes in the calculator's data." };
  const ROLE_ICON = { tank: "role-tank", healer: "role-healer", melee: "role-dps", ranged: "role-dps", caster: "role-dps" };
  const GUIDE_FILE = /^(courses|races|professions)\/[a-z][a-z0-9-]{0,39}\.json$/;
  const SLUG = /^[a-z][a-z0-9-]{0,39}$/;
  // The governance chapter app.js links as "Title V · Artisans & Heralds".
  const WORKSHOP_TITLE = "title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord";
  const EXAM_SCOPE =/^(class|spec|race|profession):[a-z][a-z0-9-]{0,60}$/;
  const CHAPTER_QUIZ_SIZE = 5, EXAM_SIZE = 10;
  const cache = new Map();

  function getJson(rel) {
    if (!cache.has(rel)) {
      cache.set(rel, fetch(BASE + rel, { credentials: "same-origin", redirect: "error", cache: "no-store" })
        .then(r => { if (!r.ok) throw Error("status " + r.status); return r.json(); })
        .catch(error => { cache.delete(rel); throw error; }));
    }
    return cache.get(rel);
  }

  /* Scores: {v:1, q:{questionId:{a:attempts, c:1|0 last answer correct}}, best:{key:percent}, x:{key:attempt number}}. */
  const store = (() => {
    let memory = null, kept = true;
    const blank = () => ({ v: 1, q: {}, best: {}, x: {} });
    const count = n => Number.isSafeInteger(n) && n >= 0 && n < 1e6;
    function clean(s) {
      const out = blank();
      if (!s || s.v !== 1) return out;
      for (const [id, r] of Object.entries(s.q || {})) if (/^[a-z0-9.-]{1,120}$/.test(id) && r && count(r.a) && (r.c === 0 || r.c === 1)) out.q[id] = { a: r.a, c: r.c };
      for (const [k, n] of Object.entries(s.best || {})) if (/^[a-z0-9:.-]{1,120}$/.test(k) && count(n) && n <= 100) out.best[k] = n;
      for (const [k, n] of Object.entries(s.x || {})) if (/^[a-z0-9:.-]{1,120}$/.test(k) && count(n)) out.x[k] = n;
      return out;
    }
    function load() {
      try { const raw = root.localStorage.getItem(KEY); memory = raw ? clean(JSON.parse(raw)) : blank(); kept = true; }
      catch { memory = memory || blank(); kept = false; }
      return memory;
    }
    function save() { try { root.localStorage.setItem(KEY, JSON.stringify(memory)); kept = true; } catch { kept = false; } }
    return {
      load, get: () => memory || load(), kept: () => kept,
      answer(id, correct) { const s = memory || load(); const r = s.q[id] || { a: 0, c: 0 }; s.q[id] = { a: Math.min(r.a + 1, 999999), c: correct ? 1 : 0 }; save(); },
      best(key, pct) { const s = memory || load(); if (!(key in s.best) || pct > s.best[key]) s.best[key] = pct; save(); },
      attempt: key => (memory || load()).x[key] || 0,
      next(key) { const s = memory || load(); s.x[key] = Math.min((s.x[key] || 0) + 1, 999999); save(); },
      clear() { memory = blank(); try { root.localStorage.removeItem(KEY); kept = true; } catch { kept = false; } },
      text: () => JSON.stringify(memory || load(), null, 2),
    };
  })();

  function parseRoute(parts) {
    const p = parts.map(x => String(x || "").toLowerCase());
    const tier = x => x === "101" || x === "201" || x === "301";
    if (!p.length) return { view: "hub" };
    if (p[0] === "exams" && p.length === 1) return { view: "exams" };
    if (p[0] === "exam" && p.length === 3 && /^(class|spec|race|profession)-[a-z][a-z0-9-]{0,60}$/.test(p[1]) && tier(p[2])) return { view: "exam", scope: p[1], tier: p[2] };
    if (!["class", "race", "profession"].includes(p[0]) || !SLUG.test(p[1] || "")) return null;
    const r = { view: "guide", kind: p[0], id: p[1], spec: null, tier: "101", chapter: null, explicitTier: false };
    let i = 2;
    if (p[0] === "class" && p[i] && !tier(p[i])) { if (!SLUG.test(p[i])) return null; r.spec = p[i++]; }
    if (p[i]) { if (!tier(p[i])) return null; r.tier = p[i++]; r.explicitTier = true; }
    if (p[i]) { if (!/^[a-z0-9][a-z0-9.-]{0,119}$/.test(p[i])) return null; r.chapter = p[i++]; }
    return i === p.length ? r : null;
  }

  function checkIndex(index) {
    const ok = index && index.schema === "olympus-university-index-v1" && Array.isArray(index.guides) && index.guides.length <= 80 && index.grades && typeof index.scopeNote === "string"
      && ["A", "B", "C", "D", "E", "U"].every(g => typeof index.grades[g] === "string")
      && index.guides.every(g => g && ["class", "race", "profession"].includes(g.kind) && SLUG.test(g.id) && typeof g.name === "string" && g.name.length <= 40
        && (g.status === "planned" ? g.file === null : ["complete", "migrated"].includes(g.status) && GUIDE_FILE.test(g.file))
        && (g.kind !== "class" || (Array.isArray(g.specs) && g.specs.length === 3 && g.specs.every(s => s && SLUG.test(s.id) && typeof s.name === "string" && Array.isArray(s.roles))))
        && (g.kind !== "profession" || ["primary", "gathering", "secondary"].includes(g.type))
        // The exam index (built by build/validate.cjs --write-exams): every exam this guide's questions can fill.
        && (g.status === "planned" ? g.exams === undefined : Array.isArray(g.exams) && g.exams.length <= 12 && g.exams.every(x => x && EXAM_SCOPE.test(x.scope)
          && ["101", "201", "301"].includes(x.tier) && Number.isInteger(x.questions) && x.questions > 0 && x.questions <= 2000)));
    if (!ok) throw Error("index");
    return index;
  }

  async function loadGuide(entry, revision) {
    const R = root.OlympusUniversityRules;
    const guide = await getJson(entry.file);
    if (!guide || !Array.isArray(guide.factFiles) || !Array.isArray(guide.quizFiles) || !guide.factFiles.concat(guide.quizFiles).every(f => SLUG.test(f))) throw Error("guide");
    const [sources, factFiles, quizFiles, presets] = await Promise.all([
      getJson("sources.json"), Promise.all(guide.factFiles.map(f => getJson("facts/" + f + ".json"))), Promise.all(guide.quizFiles.map(f => getJson("quizzes/" + f + ".json"))),
      entry.kind === "class" ? getJson("presets/" + entry.id + ".json") : Promise.resolve(undefined)]);
    const result = R.validateBundle({ sources, factFiles, guides: [guide], quizFiles, presets }, { revision });
    if (result.errors.length) throw Object.assign(Error("invalid"), { problems: result.errors });
    if (guide.kind !== entry.kind || guide.id !== entry.id) throw Error("guide");
    return { guide, ...result };
  }

  function mount(container, options = {}) {
    const doc = container.ownerDocument || root.document;
    const R = root.OlympusUniversityRules;
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
    const uid = prefix => "uni-" + prefix + "-" + (++sequence);
    // Links are fragments of this site's hash router or allow-listed https addresses (validate.js safeUrl).
    const link = (href, text, cls) => el("a", { href: /^#\/[a-z0-9/._:-]*$/.test(href) ? href : "#/guides", text, class: cls });
    const external = (url, text) => R.safeUrl(url) ? el("a", { href: url, text, target: "_blank", rel: "noopener noreferrer" }) : el("span", { text });
    const icon = (name, alt = "") => el("img", { src: "/static/wow/" + name + ".png", alt, width: 32, height: 32, class: "uni-icon", loading: "lazy" });
    const shell = el("div", { class: "uni" });
    container.appendChild(shell);
    shell.appendChild(el("p", { role: "status", class: "muted", text: "Opening Olympus University…" }));
    const route = parseRoute(Array.isArray(options.parts) ? options.parts : []);

    let index = null;
    const gradeBadge = g => el("abbr", { class: "uni-grade", "data-grade": g, title: index.grades[g], text: g });
    function sourcesLine(sources, ids) {
      if (!ids.length) return null;
      return el("span", { class: "uni-sources" }, ids.length === 1 ? "Source: " : "Sources: ", ids.map((id, i) => {
        const s = sources.get(id);
        return [i ? " · " : "", s ? external(s.url, s.publisher + " — " + s.label.replace(new RegExp("^" + s.publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":? "), "")) : id];
      }));
    }
    function factItem(ctx, f) {
      return el("li", { class: "uni-fact", "data-grade": f.grade },
        el("strong", { class: "uni-fact-label", text: f.label }), " ",
        el("span", { text: f.grade === "U" ? "Unavailable" : f.value }), " ", gradeBadge(f.grade),
        f.note ? el("span", { class: "muted uni-note", text: " " + f.note }) : null,
        f.recheck ? el("span", { class: "uni-recheck", text: " Needs re-check: " + f.recheck }) : null,
        " ", sourcesLine(ctx.sources, f.sources));
    }
    const factList = (ctx, ids) => ids.length ? el("ul", { class: "uni-facts" }, ids.map(id => factItem(ctx, ctx.facts.get(id)))) : null;
    function legend(used) {
      const grades = ["A", "B", "C", "D", "E", "U"].filter(g => used.has(g));
      if (!grades.length) return null;
      return el("details", { class: "uni-legend card" }, el("summary", { text: "How to read the grades" }),
        el("dl", null, grades.map(g => [el("dt", null, gradeBadge(g)), el("dd", { text: index.grades[g] })])));
    }
    const crumbs = (...pairs) => el("nav", { class: "uni-crumbs", "aria-label": "Breadcrumb" },
      pairs.map(([href, text], i) => [i ? " › " : "", href ? link(href, text) : el("span", { "aria-current": "page", text })]));
    const header = (title, iconName, lead) => el("header", { class: "uni-head" }, iconName ? icon(iconName) : null,
      el("div", null, el("h1", { text: title }), lead ? el("p", { class: "uni-lead", text: lead }) : null, el("p", { class: "muted small", text: index.scopeNote })));
    const section = (title, ...kids) => el("section", { class: "card uni-section" }, el("h2", { text: title }), ...kids);
    const iconFor = entry => entry.kind === "class" ? "class-" + entry.id : entry.kind === "profession" ? "prof-" + entry.id.replace("-", "_") : null;
    const guideHref = (entry, spec) => "#/guides/" + entry.kind + "/" + entry.id + (spec ? "/" + spec : "");

    function scoresPanel() {
      const s = store.get(), answered = Object.keys(s.q).length, best = Object.entries(s.best).filter(([k]) => !k.startsWith("chapter:"));
      const status = el("p", { class: "muted small", role: "status", "aria-live": "polite" });
      const exportBox = el("div", { class: "uni-export", hidden: true });
      let confirming = false;
      const clearBtn = el("button", { type: "button", class: "btn small", text: "Clear my scores", onclick: () => {
        if (!confirming) { confirming = true; clearBtn.textContent = "Yes, clear all my scores"; cancel.hidden = false; status.textContent = "This removes every quiz and exam score kept in this browser."; return; }
        store.clear(); render();
      } });
      const cancel = el("button", { type: "button", class: "btn small", text: "Keep my scores", hidden: true, onclick: () => { confirming = false; clearBtn.textContent = "Clear my scores"; cancel.hidden = true; status.textContent = ""; } });
      const exportBtn = el("button", { type: "button", class: "btn small", text: "Export my scores", "aria-expanded": "false", onclick: () => {
        const open = exportBox.hidden;
        exportBox.hidden = !open; exportBtn.setAttribute("aria-expanded", String(open));
        if (open) {
          const id = uid("export"), area = el("textarea", { id, readonly: true, rows: 6, class: "uni-export-text", spellcheck: "false" });
          area.value = store.text();
          const copy = el("button", { type: "button", class: "btn small", text: "Copy to clipboard", onclick: async () => {
            try { await root.navigator.clipboard.writeText(area.value); status.textContent = "Copied. Paste it into a file to keep it."; }
            catch { area.focus(); area.select(); status.textContent = "Copying is blocked here: the text is selected, so copy it with your keyboard."; }
          } });
          exportBox.replaceChildren(el("label", { for: id, text: "Your scores as JSON" }), area, el("div", { class: "btn-row" }, copy));
        }
      } });
      return section("Your scores",
        el("p", { class: "small", text: store.kept() ? "Quiz and exam scores stay in this browser only. Nothing is sent to Olympus." : "This browser is not keeping scores, so they last until you leave the page. Nothing is sent to Olympus." }),
        el("p", { class: "small", text: answered ? answered + " question" + (answered === 1 ? "" : "s") + " answered." : "No questions answered yet." }),
        best.length ? el("ul", { class: "uni-best" }, best.sort(([a], [b]) => a < b ? -1 : 1).map(([k, pct]) => el("li", { text: examLabel(k) + ": best " + pct + "%" }))) : null,
        el("div", { class: "btn-row" }, exportBtn, clearBtn, cancel), exportBox, status);
    }
    function examLabel(key) {
      const [kind, id, tier] = key.split(":");
      const entry = index.guides.find(g => (kind === "spec" ? g.kind === "class" && id.startsWith(g.id + "-") : g.kind === kind && g.id === id));
      const spec = kind === "spec" && entry ? entry.specs.find(s => entry.id + "-" + s.id === id) : null;
      return (spec ? spec.name + " " : "") + (entry ? entry.name : id) + " " + (TRACK_NAMES[tier] || tier) + " exam";
    }

    // The directive's order (Pillar 2 item 1): classes Druid to Warrior, then races, then professions Primary crafting,
    // Gathering, Secondary, each alphabetical; the hub tools and the exam index follow.
    const byName = (a, b) => a.name.localeCompare(b.name, "en");
    const PROFESSION_GROUPS = [["primary", "Primary crafting"], ["gathering", "Gathering"], ["secondary", "Secondary"]];
    const ordered = kind => index.guides.filter(g => g.kind === kind).sort(byName);
    const examHref = (scope, tier) => "#/guides/exam/" + scope.replace(":", "-") + "/" + tier;
    const examCount = list => list.reduce((n, g) => n + (g.exams ? g.exams.length : 0), 0);

    function hub() {
      const card = (entry, kids) => el("article", { class: "uni-card", "data-status": entry.status },
        el("h3", null, iconFor(entry) ? icon(iconFor(entry)) : null, " ", entry.status === "planned" ? el("span", { text: entry.name }) : link(guideHref(entry), entry.name)),
        entry.status === "planned" ? el("p", { class: "muted small", text: "Not written yet." }) : entry.status === "migrated" ? el("p", { class: "muted small", text: "Carried over from the earlier guide pages; still being written." }) : null,
        kids);
      // Course status is said once for the page, not on every card.
      const all = index.guides, done = all.filter(g => g.status === "complete").length;
      const status = done === all.length ? "Every course below has its 101, 201 and 301 tracks, chapter quizzes and mastery exams."
        : done + " of " + all.length + " courses are complete. A card says when its course is still being written.";
      const classes = ordered("class"), races = ordered("race"), exams = examCount(all);
      return [header("Olympus University", null, "Courses for every class, spec, race and profession in World of Warcraft: Forever. Every chapter pairs Theory with Praxis and ends with a quiz."),
        el("p", { class: "small uni-hub-status", text: status }),
        el("nav", { class: "uni-jump", "aria-label": "On this page" }, el("ul", null, [["uni-classes", "Classes"], ["uni-races", "Races"], ["uni-professions", "Professions"], ["uni-tools", "Hub tools"], ["uni-exams", "Mastery exams"]]
          // Buttons, not links: the hash belongs to the router, so a jump moves focus to the section instead.
          .map(([id, text]) => el("li", null, el("button", { type: "button", "data-jump": id, class: "btn small", text, onclick: () => { const target = doc.getElementById(id); if (target) { target.focus(); if (target.scrollIntoView) target.scrollIntoView({ block: "start" }); } } }))))),
        hubSection("uni-classes", "Class guides", el("div", { class: "uni-grid" }, classes.map(c => card(c, el("ul", { class: "uni-inline small", "aria-label": c.name + " specs" }, c.specs.map(s => el("li", null, link(guideHref(c, s.id), s.name)))))))),
        hubSection("uni-races", "Race guides", el("p", { class: "small muted", text: "The five Alliance races, each written from reviewed racial facts only." }), el("div", { class: "uni-grid" }, races.map(r => card(r)))),
        hubSection("uni-professions", "Profession guides", PROFESSION_GROUPS.map(([type, title]) => [el("h3", { text: title }),
          el("div", { class: "uni-grid" }, ordered("profession").filter(g => g.type === type).map(p => card(p)))])),
        hubSection("uni-tools", "Hub tools", el("ul", { class: "uni-list uni-tools" },
          TOOLS.map(([id, name]) => el("li", null, link("#/guides/tools/" + id, name), " — " + TOOL_NOTES[id])),
          el("li", null, link("#/talents", "Talent calculator"), " — plan a build, compare it with Classic and attach it to your application."),
          el("li", null, link("#/addons", "Addons for Forever"), " — the curated addon directory."))),
        hubSection("uni-exams", "Mastery exams", el("p", { text: exams + " exams, one per course and track that has questions: class and spec, race and profession, at 101, 201 and 301 where written. Each draws up to " + EXAM_SIZE + " questions and grades when you submit." }),
          el("p", null, link("#/guides/exams", "Browse every exam", "btn"))),
        scoresPanel(),
        section("More resources", el("ul", { class: "uni-list" },
          el("li", null, link("#/guides/library", "Publisher library"), " — reviewed guides from other publishers."),
          el("li", null, link("#/updates", "Game updates"), " — Blizzard news and patch notes."),
          el("li", null, link("#/roles", "Roles and offices"), " — Class Leads, raid leadership and the Guild Workshop's artisans."),
          el("li", null, link("#/governance", "Governance"), " — the charter, including Title V on the Guild Workshop."),
          el("li", null, link("#/guide/member", "Member guide"), " — how Olympus works.")))];
    }
    const hubSection = (id, title, ...kids) => el("section", { class: "card uni-section", id, tabindex: "-1", "aria-labelledby": id + "-h" }, el("h2", { id: id + "-h", text: title }), ...kids);

    // #/guides/exams: every mastery exam, in the hub's order, with this browser's best score.
    function examsIndex() {
      const best = store.get().best;
      const row = (label, exams) => el("li", { class: "uni-exam-row" }, el("span", { class: "uni-exam-label", text: label }),
        el("ul", { class: "uni-exam-tiers", "aria-label": label + " exams" }, exams.map(x => {
          const key = x.scope + ":" + x.tier, mine = key in best ? " · best " + best[key] + "%" : "";
          return el("li", null, el("a", { href: examHref(x.scope, x.tier), class: "btn small", "aria-label": label + ", " + TRACK_NAMES[x.tier] + " exam, " + x.questions + " questions" + (mine ? ", your best " + best[key] + "%" : "") },
            el("strong", { text: x.tier }), el("span", { class: "uni-exam-meta", text: " · " + x.questions + " questions" + mine })));
        })));
      const block = (entry, rows) => el("article", { class: "uni-exam-group" }, el("h3", null, iconFor(entry) ? icon(iconFor(entry)) : null, " ", link(guideHref(entry), entry.name)),
        rows.length ? el("ul", { class: "uni-exam-rows" }, rows) : el("p", { class: "muted small", text: "No exam yet: this course has no questions." }));
      const scopeRows = entry => {
        const by = new Map();
        for (const x of entry.exams || []) { if (!by.has(x.scope)) by.set(x.scope, []); by.get(x.scope).push(x); }
        return [...by].map(([scope, list]) => {
          const spec = scope.startsWith("spec:") ? entry.specs.find(s => "spec:" + entry.id + "-" + s.id === scope) : null;
          return row(spec ? spec.name + " " + entry.name : entry.kind === "class" ? "Class course" : entry.name + " course", list);
        });
      };
      return [crumbs(["#/guides", "Olympus University"], [null, "Mastery exams"]),
        header("Mastery exams", null, "Every exam draws up to " + EXAM_SIZE + " questions from its course and track, in a fixed order for each attempt, and grades them when you submit. 101 is Foundations, 201 Intermediate and 301 Advanced."),
        section("Class exams", el("p", { class: "small muted", text: "A class exam draws on the class course and all three specs; a spec exam on that spec and the class course." }),
          ordered("class").map(c => block(c, scopeRows(c)))),
        section("Race exams", ordered("race").map(r => block(r, scopeRows(r)))),
        section("Profession exams", PROFESSION_GROUPS.map(([type, title]) => [el("h3", { class: "uni-group-title", text: title }), ordered("profession").filter(g => g.type === type).map(p => block(p, scopeRows(p)))])),
        scoresPanel()];
    }

    function presetCard(ctx, entry, p) {
      const trees = entry.specs.map(s => s.name), context = p.context === "pvp" ? "PvP" : p.context[0].toUpperCase() + p.context.slice(1);
      const pointsSuffix = " (" + p.treePoints.join("/") + ")", title = p.label.endsWith(pointsSuffix) ? p.label.slice(0, -pointsSuffix.length) : p.label;
      const status = el("p", { class: "muted small", role: "status" });
      const current = !options.talentRevision || p.code.split(".")[1] === options.talentRevision;
      const attach = typeof options.onAttach === "function" && current ? el("button", { type: "button", class: "btn", text: "Attach to my application", disabled: options.canAttach === false,
        onclick: () => { status.textContent = "Opening your application with this build…"; options.onAttach(Object.freeze({ presetId: p.id, label: p.label, classId: p.classId, level: p.level, code: p.code })); } }) : null;
      return el("article", { class: "uni-preset", "data-preset": p.id },
        el("h5", { text: title.charAt(0).toUpperCase() + title.slice(1) }),
        el("p", { class: "muted small", text: "Talent build · Level " + p.level + " · " + context + " · " + p.treePoints.map((n, i) => trees[i] + " " + n).join(" / ") }),
        el("ul", { class: "uni-list" }, p.why.map(t => el("li", { text: t }))),
        el("div", { class: "btn-row" }, link("#/talents/" + p.classId + "/" + encodeURIComponent(p.code), "Load in the talent calculator", "btn"), attach),
        status);
    }

    /* One question. Chapter quizzes check each answer at once; exams check all on submit. */
    function questionBlock(ctx, q, attempt, onGraded) {
      const name = uid("q"), legendId = name + "-stem", feedback = el("div", { class: "uni-feedback", "aria-live": "polite" });
      const order = R.order(q.choices.map((text, i) => ({ text, i })), x => q.id + ":" + x.i, attempt);
      const inputs = order.map(({ text, i }) => {
        const id = name + "-" + i;
        return [el("input", { type: "radio", name, id, value: String(i) }), el("label", { for: id, text })];
      });
      const box = el("fieldset", { class: "uni-question", "data-question": q.id }, el("legend", { id: legendId, text: q.stem }),
        el("div", { class: "uni-choices" }, inputs.map(([input, label]) => el("div", { class: "uni-choice" }, input, label))), feedback);
      let graded = false;
      box.grade = () => {
        const picked = inputs.find(([input]) => input.checked);
        const choice = picked ? Number(picked[0].value) : null, correct = choice === q.answer;
        graded = true;
        store.answer(q.id, correct);
        for (const [input, label] of inputs) {
          const i = Number(input.value);
          label.setAttribute("data-result", i === q.answer ? "answer" : i === choice ? "wrong" : "");
          input.disabled = true;
        }
        box.setAttribute("data-correct", String(correct));
        feedback.replaceChildren(
          el("p", { class: "uni-verdict" }, el("strong", { text: correct ? "Correct." : choice === null ? "Not answered." : "Not quite." }), " ", correct ? "" : "The answer is: " + q.choices[q.answer] + "."),
          el("p", { text: q.explanation }),
          el("p", { class: "small muted", text: "Based on:" }), el("ul", { class: "uni-facts" }, q.facts.map(id => factItem(ctx, ctx.facts.get(id)))));
        if (onGraded) onGraded(correct);
        return correct;
      };
      box.isGraded = () => graded;
      return box;
    }

    function chapterQuiz(ctx, chapter) {
      const pool = ctx.questions.filter(q => q.chapter === chapter.id);
      if (!pool.length) return chapter.noQuiz ? el("p", { class: "muted small", text: "No quiz: " + chapter.noQuiz }) : null;
      const key = "chapter:" + chapter.id, holder = el("div", { class: "uni-quiz" });
      const draw = () => {
        const attempt = store.attempt(key), picked = R.order(pool, q => q.id, attempt).slice(0, CHAPTER_QUIZ_SIZE);
        const summary = el("p", { role: "status", class: "uni-summary" });
        let right = 0, done = 0;
        const blocks = picked.map(q => {
          const box = questionBlock(ctx, q, attempt, correct => {
            right += correct ? 1 : 0; done++;
            if (done === picked.length) { const pct = Math.round(100 * right / picked.length); store.best(key, pct); summary.textContent = "You answered " + right + " of " + picked.length + " correctly."; }
          });
          const check = el("button", { type: "button", class: "btn small", text: "Check answer", onclick: () => { if (!box.isGraded()) { box.grade(); check.disabled = true; } } });
          box.appendChild(el("div", { class: "btn-row" }, check));
          return box;
        });
        holder.replaceChildren(...[
          el("h4", { text: "Check yourself" }),
          el("p", { class: "muted small", text: picked.length + " of " + pool.length + " questions" + (key in store.get().best ? " · your best " + store.get().best[key] + "%" : "") + "." }),
          blocks, summary,
          pool.length > picked.length || attempt ? el("div", { class: "btn-row" }, el("button", { type: "button", class: "btn small", text: "New set of questions", onclick: () => { store.next(key); draw(); const first = holder.querySelector("legend"); if (first) { first.setAttribute("tabindex", "-1"); first.focus(); } } })) : null,
        ].flat().filter(Boolean));
      };
      draw();
      return holder;
    }

    function chapterView(ctx, entry, chapter, focusId) {
      const head = el("h3", { id: "chapter-" + chapter.id, tabindex: "-1", text: chapter.title });
      if (focusId === chapter.id) ctx.focus = head;
      if (chapter.unavailable !== undefined) {
        return el("article", { class: "uni-chapter", "data-chapter": chapter.id, "data-unavailable": "" }, head,
          el("p", { class: "uni-unavailable" }, el("strong", { text: "Not available yet. " }), chapter.unavailable), factList(ctx, chapter.theory));
      }
      for (const id of chapter.theory) ctx.used.add(ctx.facts.get(id).grade);
      const p = chapter.praxis;
      const presets = (chapter.presets || []).map(id => ctx.presets.get(id)).filter(Boolean);
      return el("article", { class: "uni-chapter", "data-chapter": chapter.id }, head,
        chapter.theory.length ? [el("h4", { text: "Theory" }), factList(ctx, chapter.theory)] : null,
        p && p.steps.length ? [el("h4", { text: "Praxis" }), el("ol", { class: "uni-steps" }, p.steps.map(s => el("li", { text: s.text })))] : null,
        p && p.mistakes.length ? [el("h4", { text: "Common mistakes" }), el("dl", { class: "uni-mistakes" }, p.mistakes.map(m => [el("dt", { text: m.mistake }), el("dd", null, el("span", { class: "uni-fix", text: "Fix: " }), m.fix)]))] : null,
        presets.length ? [el("h4", { text: "Talent builds" }), el("p", { class: "muted small" }, "Check a build against your talents in game before you use it or attach it to an application."),
          options.canAttach === false && options.attachReason ? el("p", { class: "muted small", text: options.attachReason }) : null,
          el("div", { class: "uni-presets" }, presets.map(x => presetCard(ctx, entry, x)))] : null,
        chapterQuiz(ctx, chapter));
    }

    // The pool rule lives in validate.js, so the exam index the build writes matches what this page draws from.
    const examPool = (ctx, scopeKey, tier) => R.examPool(ctx.questions, scopeKey, tier, ctx.guide.kind === "class" ? ctx.guide.id : null);

    function trackView(ctx, entry, owner, route, base, scopeKey) {
      const track = owner.tracks[route.tier];
      const toc = el("ol", { class: "uni-toc" }, R.SECTIONS.map(([key, title]) => {
        const chapters = track.chapters.filter(c => c.section === key), omitted = track.omitted.find(o => o.section === key);
        return el("li", { "data-section": key }, el("strong", { text: title }), chapters.length
          ? el("ul", null, chapters.map(c => el("li", null, link(base + "/" + route.tier + "/" + c.id, c.title), c.unavailable !== undefined ? el("span", { class: "muted small", text: " (not available yet)" }) : null)))
          : el("span", { class: "muted small", text: " " + (omitted ? omitted.reason : "") }));
      }));
      const out = [el("nav", { class: "uni-tracks", "aria-label": "Course tracks" }, el("h2", { class: "uni-visually-hidden", text: "Course tracks" }),
        el("ul", null, R.TRACKS.map(([t, name]) => el("li", null, el("a", { href: base + "/" + t, class: "btn" + (t === route.tier ? " active" : ""), "aria-current": t === route.tier ? "page" : null, text: name })))))];
      out.push(section(TRACK_NAMES[route.tier], el("p", { text: track.summary }), el("h3", { text: "In this track" }), toc));
      for (const [key, title] of R.SECTIONS) {
        const chapters = track.chapters.filter(c => c.section === key);
        if (chapters.length) out.push(el("section", { class: "card uni-section", "data-section": key }, el("h2", { text: title }), chapters.map(c => chapterView(ctx, entry, c, route.chapter))));
      }
      const pool = examPool(ctx, scopeKey, route.tier), best = store.get().best[scopeKey + ":" + route.tier];
      out.push(section("Mastery exam", pool.length
        ? [el("p", { text: "Up to " + Math.min(EXAM_SIZE, pool.length) + " questions drawn from the " + pool.length + " in this track, graded when you submit, with an explanation for each answer." }),
          best !== undefined ? el("p", { class: "small", text: "Your best: " + best + "%." }) : null,
          el("p", null, link("#/guides/exam/" + scopeKey.replace(":", "-") + "/" + route.tier, "Take the " + TRACK_NAMES[route.tier] + " exam", "btn"))]
        : el("p", { class: "muted", text: "No exam for this track yet: its chapters have no questions." })));
      return out;
    }

    function related(entry) {
      const items = [];
      // Cross-links (CL2-207; integrator, 12 Nov 2026): the talent calculator, the hub tools, the courses that feed this
      // one, the matching office on the Roles page and, for professions, the Guild Workshop's title in the charter.
      if (entry.kind === "class") items.push(["#/talents/" + entry.id, entry.name + " talent calculator"], ["#/guides/tools/attunements", "Attunements & pre-raid checklist"], ["#/guides/tools/buffs", "World buffs & consumables"],
        ["#/guides/tools/raid-structure", "Raid team structure & leadership"], ["#/guides/profession/alchemy", "Alchemy guide"], ["#/guides/profession/first-aid", "First Aid guide"], ["#/guides/profession/cooking", "Cooking guide"],
        ["#/roles/class_lead:" + entry.id, entry.name + " Class Lead office"]);
      if (entry.kind === "race") items.push(...ordered("class").map(g => [guideHref(g), g.name + " guide"]));
      if (entry.kind === "profession") items.push(["#/guides/tools/buffs", "World buffs & consumables"], ["#/guides/tools/attunements", "Attunements & pre-raid checklist"],
        ["#/roles/artisan", "Guild Workshop artisan roles"], ["#/governance/" + WORKSHOP_TITLE, "Title V · Artisans & Heralds"]);
      items.push(["#/guides/exams", "All mastery exams"], ["#/addons", "Addons for Forever"], ["#/guides", "All courses"]);
      return el("nav", { class: "card uni-section uni-related", "aria-label": "Related" }, el("h2", { text: "Related" }), el("ul", { class: "uni-list" }, items.map(([href, text]) => el("li", null, link(href, text)))));
    }

    function guideView(ctx, entry, route) {
      const g = ctx.guide, spec = route.spec ? g.specs.find(s => s.id === route.spec) : null;
      if (route.spec && !spec) return notFound();
      const owner = spec || g, base = guideHref(entry, spec && spec.id), scopeKey = spec ? "spec:" + g.id + "-" + spec.id : g.kind + ":" + g.id;
      if (route.chapter && !owner.tracks[route.tier].chapters.some(c => c.id === route.chapter)) return notFound();
      const title = spec ? spec.name + " " + g.name : g.name, used = ctx.used;
      for (const id of owner.overview.facts) used.add(ctx.facts.get(id).grade);
      const frag = [], trail = [["#/guides", "Olympus University"]];
      if (spec) trail.push([guideHref(entry), g.name], [null, spec.name]); else trail.push([null, g.name]);
      frag.push(crumbs(...trail), header(entry.kind === "profession" || entry.kind === "race" ? g.name + " guide" : title, iconFor(entry), owner.overview.lead));
      if (g.status === "migrated") frag.push(el("p", { class: "uni-notice", text: "This course was carried over from the earlier guide pages and is still being written: some chapters are short, and quizzes come later." }));
      frag.push(section("Overview",
        owner.overview.points.length ? el("ul", { class: "uni-list" }, owner.overview.points.map(p => el("li", { text: p.text }))) : null,
        factList(ctx, owner.overview.facts),
        g.kind === "profession" && g.pairsWith && g.pairsWith.length ? el("p", null, "Pairs well with ", g.pairsWith.map((k, i) => { const x = index.guides.find(e => e.kind === "profession" && e.id === k); return [i ? " · " : "", x ? link(guideHref(x), x.name) : k]; }), ".") : null));
      if (g.kind === "class") {
        frag.push(el("nav", { class: "uni-specs", "aria-label": g.name + " specs" }, el("ul", null,
          el("li", null, el("a", { href: guideHref(entry), class: "btn small" + (spec ? "" : " active"), "aria-current": spec ? null : "page", text: "Class course" })),
          g.specs.map(s => el("li", null, el("a", { href: guideHref(entry, s.id), class: "btn small" + (spec && spec.id === s.id ? " active" : ""), "aria-current": spec && spec.id === s.id ? "page" : null }, icon(ROLE_ICON[s.roles[0]] || "role-dps"), " " + s.name + " " + g.name))))));
      }
      frag.push(...trackView(ctx, entry, owner, route, base, scopeKey), legend(used), related(entry));
      return frag;
    }

    function examView(ctx, entry, route) {
      const g = ctx.guide, [kind, ...rest] = route.scope.split("-"), id = rest.join("-");
      const spec = kind === "spec" ? g.specs.find(s => g.id + "-" + s.id === id) : null;
      if (kind === "spec" && !spec) return notFound();
      const scopeKey = kind + ":" + id, examKey = scopeKey + ":" + route.tier, pool = examPool(ctx, scopeKey, route.tier);
      const name = (spec ? spec.name + " " : "") + g.name, back = guideHref(entry, spec && spec.id) + "/" + route.tier;
      const frag = [crumbs(["#/guides", "Olympus University"], ["#/guides/exams", "Mastery exams"], [guideHref(entry), g.name], ...(spec ? [[guideHref(entry, spec.id), spec.name]] : []), [null, TRACK_NAMES[route.tier] + " exam"]),
        header(name + " · " + TRACK_NAMES[route.tier] + " exam", iconFor(entry), null)];
      if (!pool.length) { frag.push(section("No exam yet", el("p", { text: "This track's chapters have no questions yet." }), link(back, "Back to the course", "btn"))); return frag; }
      const attempt = store.attempt(examKey), picked = R.order(pool, q => q.id, attempt).slice(0, EXAM_SIZE);
      const result = el("div", { class: "uni-result", role: "status", "aria-live": "polite", tabindex: "-1" });
      const blocks = picked.map(q => questionBlock(ctx, q, attempt));
      const submit = el("button", { type: "submit", class: "btn", text: "Submit the exam" });
      const form = el("form", { class: "uni-exam", "aria-label": name + " " + TRACK_NAMES[route.tier] + " exam", novalidate: true, onsubmit: event => {
        event.preventDefault();
        if (blocks[0].isGraded()) return;
        const right = blocks.filter(b => b.grade()).length, pct = Math.round(100 * right / blocks.length);
        store.best(examKey, pct);
        submit.disabled = true;
        result.replaceChildren(el("h2", { text: "Your result: " + right + " of " + blocks.length + " (" + pct + "%)" }),
          el("p", { text: "Best in this browser: " + store.get().best[examKey] + "%. Each question below shows the answer and the facts it rests on." }),
          el("div", { class: "btn-row" }, el("button", { type: "button", class: "btn", text: "Take a new exam", onclick: () => { store.next(examKey); render(); } }), link(back, "Back to the course", "btn")));
        result.focus();
      } }, blocks, el("div", { class: "btn-row" }, submit));
      frag.push(section("About this exam", el("p", { text: picked.length + " questions drawn from the " + pool.length + " in this track. Choose one answer for each, then submit. Unanswered questions count as wrong." })),
        result, form, scoresPanel(), legend(ctx.used));
      for (const q of picked) for (const fid of q.facts) ctx.used.add(ctx.facts.get(fid).grade);
      return frag;
    }

    const notFound = () => [el("p", { text: "There is no such guide." }), link("#/guides", "Back to Olympus University", "btn")];

    async function render() {
      if (!alive) return;
      store.load();
      try {
        index = checkIndex(await getJson("index.json"));
        if (!route) { shell.replaceChildren(...notFound()); return; }
        if (route.view === "hub") { shell.replaceChildren(...hub()); return; }
        if (route.view === "exams") { shell.replaceChildren(...examsIndex()); return; }
        const kind = route.view === "exam" ? (route.scope.startsWith("spec-") ? "class" : route.scope.split("-")[0]) : route.kind;
        const id = route.view === "exam" ? route.scope.slice(route.scope.indexOf("-") + 1) : route.id;
        const entry = index.guides.find(g => g.kind === kind && (g.id === id || (route.view === "exam" && route.scope.startsWith("spec-") && id.startsWith(g.id + "-"))));
        if (!entry) { shell.replaceChildren(...notFound()); return; }
        if (entry.status === "planned") {
          shell.replaceChildren(crumbs(["#/guides", "Olympus University"], [null, entry.name]), header(entry.name + " guide", null, null),
            section("Not written yet", el("p", { text: "The " + entry.name + " guide has not been written yet. It will be built only from reviewed facts the site holds." }), link("#/guides", "Back to Olympus University", "btn")));
          return;
        }
        const ctx = { ...(await loadGuide(entry, options.talentRevision)), used: new Set(), focus: null };
        if (!alive) return;
        shell.replaceChildren(...(route.view === "exam" ? examView(ctx, entry, route) : guideView(ctx, entry, route)).filter(Boolean));
        if (ctx.focus) { ctx.focus.focus(); if (ctx.focus.scrollIntoView) ctx.focus.scrollIntoView({ block: "start" }); }
      } catch (error) {
        if (!alive) return;
        shell.replaceChildren(el("p", { role: "alert", text: error && error.message === "invalid" ? "This guide did not pass its checks, so it is not shown. Try again later." : "Olympus University could not be loaded. Try again in a moment." }));
      }
    }
    render();
    return { destroy() { alive = false; for (const [node, type, fn] of listeners) node.removeEventListener(type, fn); listeners.length = 0; shell.remove(); } };
  }

  root.OlympusUniversity = Object.freeze({ mount, parseRoute, store: Object.freeze({ key: KEY }) });
})(typeof window !== "undefined" ? window : globalThis);
