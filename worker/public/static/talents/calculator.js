/* Original Olympus calculator (.169, owner's 18 October 2026 request). Data attribution is kept beside the snapshot. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusTalents = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const CLASS_IDS = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
  const DATA_URL = "/static/talents/data.json";
  const fail = message => ({ ok: false, error: message });
  const classOf = (data, name) => data.classes.find(c => c.id === String(name || "").toLowerCase());
  const talentsOf = cls => cls.trees.flatMap(tree => tree.talents);
  const pointsAtLevel = level => Number.isInteger(level) && level >= 10 && level <= 60 ? level - 9 : null;
  function validateData(data) {
    if (!data || data.schema !== "olympus-talents-v1" || !/^[a-f0-9]{12}$/.test(data.revision) || !Array.isArray(data.classes)
      || data.classes.length !== 9 || !data.source || data.source.license !== "CC-BY-4.0"
      || data.source.licenseURL !== "https://creativecommons.org/licenses/by/4.0/" || data.source.url !== "https://talentsforever.com/data.json"
      || !Array.isArray(data.source.clientBuilds) || data.source.clientBuilds.some(s => typeof s !== "string" || !/^[0-9.]+$/.test(s))
      || typeof data.source.fetchedAt !== "string" || typeof data.source.upstreamGenerated !== "string") return fail("Unrecognized talent snapshot.");
    const ids = new Set(); let nodes = 0, ranks = 0, trees = 0;
    for (const [index, cls] of data.classes.entries()) {
      if (cls.id !== CLASS_IDS[index] || !Array.isArray(cls.trees) || cls.trees.length !== 3) return fail("The nine classes need three trees each.");
      for (const tree of cls.trees) {
        trees++; const positions = new Set(), own = new Map();
        if (!Array.isArray(tree.talents) || !Array.isArray(tree.removedClassic)) return fail("Incomplete talent tree.");
        for (const t of tree.talents) {
          if (!t || !/^[a-z0-9-]+$/.test(t.id) || ids.has(t.id) || typeof t.name !== "string" || !t.name
            || !Number.isInteger(t.row) || t.row < 1 || t.row > 7 || !Number.isInteger(t.column) || t.column < 1 || t.column > 4
            || !Number.isInteger(t.maxRank) || t.maxRank < 1 || t.maxRank > 9 || !Array.isArray(t.descriptions)
            || t.descriptions.length !== t.maxRank || t.descriptions.some(s => typeof s !== "string" || !s)
            || !t.classic || !["same", "changed", "moved", "new"].includes(t.classic.status)) return fail("Invalid or incomplete talent.");
          const position = t.row + ":" + t.column;
          if (positions.has(position)) return fail("Duplicate talent grid position.");
          positions.add(position); ids.add(t.id); own.set(t.id, t); nodes++; ranks += t.maxRank;
        }
        for (const t of tree.talents) {
          const seen = new Set([t.id]); let node = t;
          while (node.requires) {
            const prior = own.get(node.requires);
            // The real Holy Shock/Divine Precision and Mind Flay pairs share a row.
            if (!prior || prior.row > node.row || seen.has(prior.id)) return fail("A prerequisite must resolve without cycles in the same tree.");
            seen.add(prior.id); node = prior;
          }
        }
      }
    }
    if (nodes !== 466 || ranks !== 1313 || trees !== 27) return fail("Snapshot coverage differs from its reviewed inventory.");
    return { ok: true, talents: nodes, ranks, trees, classes: data.classes.length };
  }
  function emptyBuild(data, className = "warrior", level = 60) {
    const cls = classOf(data, className);
    if (!cls || pointsAtLevel(level) === null) throw Error("Choose a supported class and a level from 10 to 60.");
    return { className: cls.id, level, ranks: talentsOf(cls).map(() => 0) };
  }
  function validateBuild(data, build) {
    const cls = build && classOf(data, build.className), budget = build && pointsAtLevel(build.level);
    if (!cls || budget === null || !Array.isArray(build.ranks)) return fail("Invalid class, level or rank vector.");
    const talents = talentsOf(cls);
    if (build.ranks.length !== talents.length || talents.some((talent, i) => !Object.hasOwn(build.ranks, i) || !Number.isInteger(build.ranks[i]) || build.ranks[i] < 0 || build.ranks[i] > talent.maxRank)) return fail("A talent rank is outside its allowed range.");
    const points = build.ranks.reduce((a, b) => a + b, 0);
    if (points > budget) return fail("This build needs more points than level " + build.level + " provides.");
    const byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]])), treePoints = [];
    for (const tree of cls.trees) {
      treePoints.push(tree.talents.reduce((sum, t) => sum + byId.get(t.id), 0));
      for (const t of tree.talents) if (byId.get(t.id) > 0) {
        const lower = tree.talents.filter(p => p.row < t.row).reduce((sum, p) => sum + byId.get(p.id), 0);
        if (lower < 5 * (t.row - 1)) return fail(t.name + " needs " + 5 * (t.row - 1) + " points in earlier rows.");
        if (t.requires) {
          const prior = tree.talents.find(p => p.id === t.requires);
          if (byId.get(t.requires) !== prior.maxRank) return fail(t.name + " requires " + prior.name + " at its maximum rank.");
        }
      }
    }
    return { ok: true, points, budget, treePoints, levelNeeded: Math.max(10, points + 9) };
  }
  function allocate(data, build, talentId, delta) {
    const current = validateBuild(data, build);
    if (!current.ok) return current;
    if (![1, -1].includes(delta)) return fail("Change one point at a time.");
    const index = talentsOf(classOf(data, build.className)).findIndex(t => t.id === talentId);
    if (index < 0) return fail("Unknown talent.");
    const next = { ...build, ranks: build.ranks.slice() }; next.ranks[index] += delta;
    const checked = validateBuild(data, next);
    return checked.ok ? { ...checked, build: next } : checked;
  }
  function serializeBuild(data, build) {
    const checked = validateBuild(data, build); if (!checked.ok) throw Error(checked.error);
    return ["ot1", data.revision, build.className, build.level, build.ranks.join("")].join(".");
  }
  function parseBuild(data, code) {
    if (typeof code !== "string" || code.length > 256) return fail("Invalid build code.");
    const match = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(\d{2})\.([0-9]+)$/.exec(code);
    if (!match || match[1] !== data.revision) return fail("This build code belongs to a different or invalid talent snapshot.");
    const build = { className: match[2], level: Number(match[3]), ranks: Array.from(match[4], Number) }, checked = validateBuild(data, build);
    return checked.ok ? { ...checked, build } : checked;
  }
  function comparisonBadges(talent) {
    const c = talent.classic, badges = [];
    if (c.status === "new") badges.push("New");
    else if (c.status === "changed") badges.push("Changed");
    else if (c.status === "same") badges.push("Same");
    if (c.moved || c.status === "moved") badges.push("Moved");
    return badges;
  }
  let dataPromise;
  const mounted = new WeakMap();
  async function mount(container, options = {}) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== "function") throw Error("A DOM container is required.");
    mounted.get(container)?.destroy();
    const document = container.ownerDocument;
    let active = true, compare = false, selected = null, message = "", build, data;
    const controller = { destroy() { active = false; if (mounted.get(container) === controller) mounted.delete(container); } };
    mounted.set(container, controller);
    const h = (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs || {})) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else if (key === "disabled" || key === "checked") node[key] = value;
        else node.setAttribute(key, String(value));
      }
      for (const child of children.flat()) if (child !== null && child !== undefined) node.append(typeof child === "string" ? document.createTextNode(child) : child);
      return node;
    };
    container.replaceChildren(h("p", { role: "status", text: "Opening the talent library…" }));
    try {
      if (!dataPromise) dataPromise = fetch(DATA_URL, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw Error("The talent library could not be loaded.");
        const snapshot = await response.json(), checked = validateData(snapshot);
        if (!checked.ok) throw Error(checked.error); return snapshot;
      }).catch(error => { dataPromise = null; throw error; });
      data = await dataPromise;
      if (!active) return controller;
      build = emptyBuild(data, options.className || "warrior");
      if (options.build) {
        const incoming = parseBuild(data, options.build);
        if (incoming.ok) build = incoming.build; else message = incoming.error;
      }
      selected = talentsOf(classOf(data, build.className))[0].id;
      render();
      return controller;
    } catch (error) {
      if (active) container.replaceChildren(h("p", { role: "alert", text: error.message || "The talent library is unavailable." }));
      return controller;
    }
    function changed() {
      if (typeof options.onBuildChange === "function") options.onBuildChange({ className: build.className, build: serializeBuild(data, build), level: build.level, points: validateBuild(data, build).points });
    }
    function edit(talentId, delta) {
      selected = talentId; const result = allocate(data, build, talentId, delta);
      if (result.ok) { build = result.build; message = ""; changed(); } else message = result.error;
      render(talentId);
    }
    function render(focus) {
      if (!active) return;
      const cls = classOf(data, build.className), talents = talentsOf(cls), state = validateBuild(data, build), byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]])), buttons = new Map();
      if (!talents.some(t => t.id === selected)) selected = talents[0].id;
      const classSelect = h("select", { id: "olympus-talent-class", "aria-label": "Character class", onchange(event) {
        build = emptyBuild(data, event.target.value, build.level); selected = talentsOf(classOf(data, build.className))[0].id; message = ""; changed(); render("class");
      } }, data.classes.map(c => h("option", { value: c.id, text: c.name })));
      classSelect.value = cls.id;
      const level = h("select", { id: "olympus-talent-level", "aria-label": "Character level", onchange(event) {
        const next = { ...build, level: Number(event.target.value) }, checked = validateBuild(data, next);
        if (checked.ok) { build = next; message = ""; changed(); } else message = checked.error + " Refund points or reset first.";
        render("level");
      } }, Array.from({ length: 51 }, (_, i) => h("option", { value: i + 10, text: String(i + 10) })));
      level.value = String(build.level);
      const compareInput = h("input", { type: "checkbox", checked: compare, onchange(event) { compare = event.target.checked; render("compare"); } });
      const detail = h("aside", { class: "talents-detail", "aria-label": "Selected talent" });
      const status = h("p", { class: "talents-feedback", role: "status", "aria-live": "polite", text: message || "Choose a talent to spend a point. Shift-click or − refunds a point." });
      function showDetail(t) {
        const rank = byId.get(t.id), c = t.classic;
        detail.replaceChildren(...[h("p", { class: "talents-eyebrow", text: "Talent details" }), h("h3", { text: t.name }),
          h("p", { class: "talents-rank", text: "Rank " + rank + " / " + t.maxRank + (t.passive ? " · Passive" : " · Active ability") }),
          t.cost ? h("p", { class: "talents-cost", text: t.cost }) : null,
          h("div", { class: "talents-detail-controls" }, h("button", { type: "button", disabled: !allocate(data, build, t.id, -1).ok, onclick: () => edit(t.id, -1), text: "− Refund" }), h("button", { type: "button", disabled: !allocate(data, build, t.id, 1).ok, onclick: () => edit(t.id, 1), text: "+ Add point" })),
          h("h4", { text: rank ? "Current rank" : "First rank" }), h("p", { class: "talents-description", text: t.descriptions[Math.max(0, rank - 1)] }),
          rank > 0 && rank < t.maxRank ? h("div", null, h("h4", { text: "Next rank" }), h("p", { class: "talents-description", text: t.descriptions[rank] })) : null,
          t.requires ? h("p", { class: "talents-requires", text: "Requires " + talents.find(p => p.id === t.requires).name + " at maximum rank." }) : null,
          h("details", { class: "talents-all-ranks" }, h("summary", { text: "Read all " + t.maxRank + " ranks" }), h("ol", null, t.descriptions.map(text => h("li", { text }))))].filter(node => node !== null && node !== undefined));
        if (compare) detail.append(h("section", { class: "talents-classic" }, h("h4", { text: "Classic comparison" }), h("p", { class: "talents-badges" }, comparisonBadges(t).map(label => h("span", { class: "talents-badge " + label.toLowerCase(), text: label }))),
          c.text ? h("div", null, h("p", { class: "talents-reference-label", text: "Classic rank-one reference · " + c.tree + " · " + c.max + " ranks" }), h("p", { class: "talents-description", text: c.text })) : h("p", { text: "No direct Classic counterpart is listed in this snapshot." }),
          c.renamed ? h("p", { text: "Classic name: " + c.renamed }) : null,
          c.note ? h("p", { text: c.note }) : null,
          c.replaces?.length ? h("p", { text: "Replaces: " + c.replaces.join(", ") }) : null));
      }
      const treeCards = cls.trees.map((tree, treeIndex) => h("section", { class: "talents-tree", "aria-label": tree.name },
        h("header", { class: "talents-tree-header" }, h("div", null, h("p", { class: "talents-eyebrow", text: "Tree " + (treeIndex + 1) }), h("h3", { text: tree.name })), h("strong", { text: String(state.treePoints[treeIndex]) + " points" })),
        h("div", { class: "talents-grid" }, tree.talents.map(t => {
          const rank = byId.get(t.id), canAdd = allocate(data, build, t.id, 1).ok, canRemove = allocate(data, build, t.id, -1).ok;
          const treeTabId = tree.talents.some(p => p.id === selected) ? selected : tree.talents[0].id;
          const pick = h("button", { type: "button", class: "talents-pick", tabindex: treeTabId === t.id ? "0" : "-1", "aria-pressed": String(selected === t.id), "aria-label": t.name + ", rank " + rank + " of " + t.maxRank + (canAdd ? ". Add one point." : ". Read talent details."),
            onclick: event => edit(t.id, event.shiftKey ? -1 : 1), oncontextmenu(event) { event.preventDefault(); edit(t.id, -1); },
            onfocus() { selected = t.id; for (const [id, button] of buttons) { button.setAttribute("aria-pressed", String(id === t.id)); if (tree.talents.some(p => p.id === id)) button.tabIndex = id === t.id ? 0 : -1; } showDetail(t); },
            onkeydown(event) {
              if (["+", "="].includes(event.key)) { event.preventDefault(); edit(t.id, 1); return; }
              if (["-", "_"].includes(event.key)) { event.preventDefault(); edit(t.id, -1); return; }
              const axis = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
              if (!axis) return; event.preventDefault();
              const near = tree.talents.filter(p => axis[0] ? p.column === t.column && (p.row - t.row) * axis[0] > 0 : p.row === t.row && (p.column - t.column) * axis[1] > 0)
                .sort((a, b) => Math.abs(a.row - t.row) + Math.abs(a.column - t.column) - Math.abs(b.row - t.row) - Math.abs(b.column - t.column))[0];
              if (near) buttons.get(near.id).focus();
            }
          }, h("span", { class: "talents-sigil", "aria-hidden": "true", text: t.name.split(" ").map(w => w[0]).join("").slice(0, 2) }), h("span", { class: "talents-name", text: t.name }), h("span", { class: "talents-rank-pill", text: rank + "/" + t.maxRank }));
          buttons.set(t.id, pick);
          const node = h("div", { class: "talents-node" + (rank ? " invested" : "") + (rank === t.maxRank ? " complete" : "") + (!canAdd && !rank ? " locked" : "") + (compare ? " compare-" + t.classic.status : ""), "data-row": t.row, "data-column": t.column }, pick,
            h("div", { class: "talents-point-controls" }, h("button", { type: "button", tabindex: "-1", disabled: !canRemove, "aria-label": "Refund one point from " + t.name, onclick: () => edit(t.id, -1), text: "−" }), h("button", { type: "button", tabindex: "-1", disabled: !canAdd, "aria-label": "Add one point to " + t.name, onclick: () => edit(t.id, 1), text: "+" })),
            compare ? h("span", { class: "talents-node-badges", text: comparisonBadges(t).join(" · ") }) : null,
            t.requires ? h("span", { class: "talents-prerequisite", "aria-label": "Prerequisite talent", text: "↳ Requires " + talents.find(p => p.id === t.requires).name }) : null);
          return node;
        })), compare && tree.removedClassic.length ? h("details", { class: "talents-removed" }, h("summary", { text: "Classic-only references (" + tree.removedClassic.length + ")" }), tree.removedClassic.map(t => h("div", null, h("strong", { text: t.name }), h("p", { text: t.text || "No text supplied." })))) : null));
      const code = serializeBuild(data, build), link = typeof location === "object" ? location.origin + location.pathname + "#/talents/" + cls.id + "/" + code : code;
      const copy = h("button", { type: "button", text: "Copy build link", async onclick() {
        try { if (!navigator.clipboard?.writeText) throw Error("clipboard unavailable"); await navigator.clipboard.writeText(link); status.textContent = "Build link copied. Anyone with the link can open it."; }
        catch { status.textContent = "Copy the build code below; clipboard access is unavailable."; share.focus(); share.select(); }
      } });
      const share = h("input", { class: "talents-share-code", readonly: "readonly", "aria-label": "Shareable talent build code", value: code });
      const shell = h("section", { class: "talents-tool" },
        h("header", { class: "talents-heading" }, h("p", { class: "talents-eyebrow", text: "The class library" }), h("h2", { text: "Shape your path" }), h("p", { text: "Nine classes. Three trees. Build a Forever character and see how its talents differ from Classic." })),
        h("div", { class: "talents-toolbar" }, h("label", null, "Class", classSelect), h("label", null, "Level", level), h("label", { class: "talents-compare-switch" }, compareInput, "Compare to Classic"), h("button", { type: "button", text: "Reset build", onclick() { build = emptyBuild(data, cls.id, build.level); message = "Build reset."; changed(); render("reset"); } })),
        h("div", { class: "talents-summary" }, h("strong", { text: state.treePoints.join(" / ") }), h("span", { text: (state.budget - state.points) + " points left of " + state.budget }), h("span", { text: "Level needed: " + state.levelNeeded })), status,
        h("div", { class: "talents-workspace" }, h("div", { class: "talents-trees" }, treeCards), detail),
        h("section", { class: "talents-sharing", "aria-label": "Share this build" }, copy, share),
        h("footer", { class: "talents-source" }, h("p", null, "Talent data: ", h("a", { href: "https://talentsforever.com/", rel: "noopener noreferrer", text: "Talents Forever" }), " · ", h("a", { href: data.source.licenseURL, rel: "noopener noreferrer", text: "CC BY 4.0" }), ". Normalized for Olympus; no source artwork or website code copied."),
          h("p", { text: "Beta client " + data.source.clientBuilds.join(", ") + " · Source generated " + data.source.upstreamGenerated + " · Snapshot fetched " + data.source.fetchedAt.slice(0, 10) + ". Not live tuning or a guide recommendation." }),
          h("p", { text: "Standard level-10-to-60 points; Legacy Talented bonuses are not modeled. Classic comparison uses the supplied rank-one references, not a full Classic calculator or a verified Classic build. Game text and names belong to Blizzard Entertainment; unofficial fan reference." }),
          h("p", { class: "talents-keyboard", text: "Keyboard: Tab enters each tree; arrow keys move across its grid. Enter adds a point; Shift-click or − removes one. A refund cannot break a tier or prerequisite." })));
      container.replaceChildren(shell); showDetail(talents.find(t => t.id === selected));
      if (buttons.has(focus)) buttons.get(focus).focus();
      else if (focus === "class") classSelect.focus(); else if (focus === "level") level.focus(); else if (focus === "compare") compareInput.focus();
      else if (focus === "reset") shell.querySelector(".talents-toolbar button").focus();
    }
  }
  return { validateData, pointsAtLevel, emptyBuild, validateBuild, allocate, serializeBuild, parseBuild, comparisonBadges, mount };
});
