/* Original Olympus calculator (.170, owner's reference-layout request). Data and artwork attribution remain explicit. */
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
  const ART_URL = "/static/talents/art.json";
  function validateArt(data, art) {
    if (!art || art.schema !== "olympus-talents-art-v1" || art.revision !== data.revision) return fail("The talent artwork does not match this snapshot.");
    const classes = data.classes.map(cls => cls.id), trees = data.classes.flatMap(cls => cls.trees.map(tree => cls.id + "-" + tree.id));
    const talents = data.classes.flatMap(cls => talentsOf(cls).map(t => t.id));
    const map = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).sort().join("\n") === keys.slice().sort().join("\n")
      && Object.values(value).every(url => typeof url === "string" && /^\/static\/wow\/[A-Za-z0-9_/-]+\.(?:png|jpg|webp)$/.test(url) && !url.split("/").some(part => part === "." || part === ".."));
    if (!map(art.classIcons, classes) || !map(art.treeIcons, trees) || !map(art.treeBackgrounds, trees) || !map(art.talentIcons, talents)
      || art.classPortraits && !map(art.classPortraits, classes)) return fail("The talent artwork is incomplete or has an unrecognised path.");
    return { ok: true, classes: classes.length, trees: trees.length, talents: talents.length };
  }
  let dataPromise, artPromise, instanceSequence = 0;
  const mounted = new WeakMap();
  async function mount(container, options = {}) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== "function") throw Error("A DOM container is required.");
    mounted.get(container)?.destroy();
    const document = container.ownerDocument, detailId = "olympus-talent-detail-" + ++instanceSequence;
    let active = true, compare = false, selected = null, message = "", build, data, art;
    const controller = { destroy() { active = false; if (mounted.get(container) === controller) mounted.delete(container); } };
    mounted.set(container, controller);
    const h = (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs || {})) {
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else if (key === "disabled" || key === "checked" || key === "hidden") node[key] = value;
        else node.setAttribute(key, String(value));
      }
      for (const child of children.flat()) if (child !== null && child !== undefined) node.append(typeof child === "string" ? document.createTextNode(child) : child);
      return node;
    };
    const image = (url, attrs = {}) => h("img", { ...attrs, src: url, alt: "", draggable: "false", onerror(event) { event.target.hidden = true; } });
    container.replaceChildren(h("p", { role: "status", text: "Opening the talent library…" }));
    try {
      if (!dataPromise) dataPromise = fetch(DATA_URL, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw Error("The talent library could not be loaded.");
        const snapshot = await response.json(), checked = validateData(snapshot);
        if (!checked.ok) throw Error(checked.error); return snapshot;
      }).catch(error => { dataPromise = null; throw error; });
      data = await dataPromise;
      if (!artPromise) artPromise = fetch(ART_URL, { credentials: "same-origin" }).then(async response => {
        if (!response.ok) throw Error("The talent artwork could not be loaded.");
        return response.json();
      }).catch(error => { artPromise = null; throw error; });
      art = await artPromise;
      const checkedArt = validateArt(data, art);
      if (!checkedArt.ok) { artPromise = null; throw Error(checkedArt.error); }
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
    function chooseClass(className) {
      build = emptyBuild(data, className, build.level); selected = talentsOf(classOf(data, className))[0].id; message = ""; changed(); render("class:" + className);
    }
    function render(focus) {
      if (!active) return;
      const cls = classOf(data, build.className), talents = talentsOf(cls), state = validateBuild(data, build), byId = new Map(talents.map((t, i) => [t.id, build.ranks[i]]));
      const buttons = new Map(), classButtons = new Map();
      if (!talents.some(t => t.id === selected)) selected = talents[0].id;
      const classSelect = h("select", { id: "olympus-talent-class", "aria-label": "Character class", tabindex: "-1", onchange(event) { chooseClass(event.target.value); } }, data.classes.map(c => h("option", { value: c.id, text: c.name })));
      classSelect.value = cls.id;
      const classRow = h("nav", { class: "talents-classes", "aria-label": "Character classes" }, data.classes.map(c => {
        const button = h("button", { type: "button", class: "talents-class-button", "data-class": c.id, "aria-pressed": String(c.id === cls.id), onclick() { chooseClass(c.id); } }, image(art.classIcons[c.id]), h("span", { text: c.name }));
        classButtons.set(c.id, button); return button;
      }));
      const level = h("select", { id: "olympus-talent-level", "aria-label": "Character level", onchange(event) {
        const next = { ...build, level: Number(event.target.value) }, checked = validateBuild(data, next);
        if (checked.ok) { build = next; message = ""; changed(); } else message = checked.error + " Refund points or reset first.";
        render("level");
      } }, Array.from({ length: 51 }, (_, i) => h("option", { value: i + 10, text: String(i + 10) })));
      level.value = String(build.level);
      const compareInput = h("input", { type: "checkbox", checked: compare, onchange(event) { compare = event.target.checked; render("compare"); } });
      const detail = h("aside", { id: detailId, class: "talents-detail", "aria-label": "Selected talent", tabindex: "-1", hidden: true, onkeydown(event) { if (event.key === "Escape") { event.preventDefault(); buttons.get(selected).focus(); detail.hidden = true; } } });
      const status = h("p", { class: "talents-feedback", role: "status", "aria-live": "polite", text: message || "Left-click adds a point; right-click or Shift-click refunds. Hover or focus a talent to read every rank." });
      function showDetail(t, button, open = true) {
        const rank = byId.get(t.id), c = t.classic;
        detail.replaceChildren(...[h("div", { class: "talents-tooltip-heading" }, image(art.talentIcons[t.id]), h("h3", { text: t.name }), h("button", { type: "button", class: "talents-detail-close", "aria-label": "Close talent details", text: "Close", onclick() { detail.hidden = true; if (button) button.focus(); detail.hidden = true; } })),
          h("p", { class: "talents-rank", text: "Rank " + rank + " / " + t.maxRank + (t.passive ? " · Passive" : " · Active ability") }),
          t.cost ? h("p", { class: "talents-cost", text: t.cost }) : null,
          h("h4", { text: rank ? "Current rank" : "First rank" }), h("p", { class: "talents-description", text: t.descriptions[Math.max(0, rank - 1)] }),
          rank > 0 && rank < t.maxRank ? h("div", null, h("h4", { text: "Next rank" }), h("p", { class: "talents-description", text: t.descriptions[rank] })) : null,
          t.requires ? h("p", { class: "talents-requires", text: "Requires " + talents.find(p => p.id === t.requires).name + " at maximum rank." }) : null,
          h("details", { class: "talents-all-ranks" }, h("summary", { text: "Read all " + t.maxRank + " ranks" }), h("ol", null, t.descriptions.map(text => h("li", { text })))),
          h("div", { class: "talents-detail-controls" }, h("button", { type: "button", disabled: !allocate(data, build, t.id, -1).ok, onclick: () => edit(t.id, -1), text: "− Unlearn" }), h("button", { type: "button", disabled: !allocate(data, build, t.id, 1).ok, onclick: () => edit(t.id, 1), text: "+ Learn" }))].filter(node => node !== null && node !== undefined));
        if (compare) detail.append(h("section", { class: "talents-classic" }, h("h4", { text: "Classic comparison" }), h("p", { class: "talents-badges" }, comparisonBadges(t).map(label => h("span", { class: "talents-badge " + label.toLowerCase(), text: label }))),
          c.text ? h("div", null, h("p", { class: "talents-reference-label", text: "Classic rank-one reference · " + c.tree + " · " + c.max + " ranks" }), h("p", { class: "talents-description", text: c.text })) : h("p", { text: "No direct Classic counterpart is listed in this snapshot." }),
          c.renamed ? h("p", { text: "Classic name: " + c.renamed }) : null,
          c.note ? h("p", { text: c.note }) : null,
          c.replaces?.length ? h("p", { text: "Replaces: " + c.replaces.join(", ") }) : null));
        if (button && button.parentNode) button.parentNode.append(detail);
        for (const pick of buttons.values()) pick.removeAttribute("aria-describedby");
        if (button) button.setAttribute("aria-describedby", detailId);
        detail.hidden = !open;
      }
      const treeCards = cls.trees.map((tree, treeIndex) => {
        const treeKey = cls.id + "-" + tree.id;
        const links = tree.talents.filter(t => t.requires).map(t => {
          const parent = talents.find(p => p.id === t.requires), ready = byId.get(parent.id) === parent.maxRank;
          return h("span", { class: "talents-link from-r" + parent.row + " to-r" + t.row + " to-c" + t.column + " start-c" + Math.min(parent.column, t.column) + " span-r" + (t.row - parent.row) + " span-c" + Math.abs(t.column - parent.column) + (t.column < parent.column ? " leftward" : " rightward") + (t.row === parent.row ? " same-row" : "") + (ready ? " ready" : ""), "aria-hidden": "true" }, h("span", { class: "talents-link-h" }), h("span", { class: "talents-link-v" }), h("span", { class: "talents-link-arrow" }));
        });
        return h("section", { class: "talents-tree", "data-tree-index": treeIndex, "aria-label": tree.name },
          h("header", { class: "talents-tree-header" }, image(art.treeIcons[treeKey]), h("h3", { text: tree.name }), h("strong", { text: String(state.treePoints[treeIndex]) + " points" })),
          h("div", { class: "talents-tree-body" }, image(art.treeBackgrounds[treeKey], { class: "talents-backdrop", "aria-hidden": "true" }), h("div", { class: "talents-links", "aria-hidden": "true" }, links),
            h("div", { class: "talents-grid" }, tree.talents.map(t => {
              const rank = byId.get(t.id), canAdd = allocate(data, build, t.id, 1).ok, canRemove = allocate(data, build, t.id, -1).ok;
              const treeTabId = tree.talents.some(p => p.id === selected) ? selected : tree.talents[0].id;
              const pick = h("button", { type: "button", class: "talents-pick", tabindex: treeTabId === t.id ? "0" : "-1", "aria-pressed": String(selected === t.id), "aria-label": t.name + ", rank " + rank + " of " + t.maxRank + (canAdd ? ". Add one point." : ". Read talent details."),
                onclick: event => edit(t.id, event.shiftKey ? -1 : 1), oncontextmenu(event) { event.preventDefault(); edit(t.id, -1); },
                onpointerenter() { showDetail(t, pick); },
                onfocus() { selected = t.id; for (const [id, button] of buttons) { button.setAttribute("aria-pressed", String(id === t.id)); if (tree.talents.some(p => p.id === id)) button.tabIndex = id === t.id ? 0 : -1; } showDetail(t, pick); },
                onkeydown(event) {
                  if (event.key === "Escape") { event.preventDefault(); detail.hidden = true; return; }
                  if (event.key === "i" || event.key === "I") { event.preventDefault(); showDetail(t, pick); detail.focus(); return; }
                  if (["+", "="].includes(event.key)) { event.preventDefault(); edit(t.id, 1); return; }
                  if (["-", "_"].includes(event.key)) { event.preventDefault(); edit(t.id, -1); return; }
                  const axis = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
                  if (!axis) return; event.preventDefault();
                  const near = tree.talents.filter(p => axis[0] ? p.column === t.column && (p.row - t.row) * axis[0] > 0 : p.row === t.row && (p.column - t.column) * axis[1] > 0)
                    .sort((a, b) => Math.abs(a.row - t.row) + Math.abs(a.column - t.column) - Math.abs(b.row - t.row) - Math.abs(b.column - t.column))[0];
                  if (near) buttons.get(near.id).focus();
                }
              }, image(art.talentIcons[t.id]), h("span", { class: "talents-name", text: t.name }), h("span", { class: "talents-rank-pill", "aria-hidden": "true", text: rank + "/" + t.maxRank }));
              buttons.set(t.id, pick);
              const node = h("div", { class: "talents-node" + (rank ? " invested" : "") + (rank === t.maxRank ? " complete" : "") + (canAdd ? " available" : "") + (!canAdd && !rank ? " locked" : "") + (compare ? " compare-" + t.classic.status : ""), "data-row": t.row, "data-column": t.column,
                onpointerleave(event) { if (detail.parentNode === node && !node.contains(event.relatedTarget) && !node.contains(document.activeElement)) detail.hidden = true; } }, pick,
                compare ? h("span", { class: "talents-node-badges", "aria-hidden": "true", text: comparisonBadges(t).map(label => label[0]).join("") }) : null);
              return node;
            }))),
          compare && tree.removedClassic.length ? h("details", { class: "talents-removed" }, h("summary", { text: "Classic-only references (" + tree.removedClassic.length + ")" }), tree.removedClassic.map(t => h("div", null, h("strong", { text: t.name }), h("p", { text: t.text || "No text supplied." })))) : null);
      });
      const code = serializeBuild(data, build), link = typeof location === "object" ? location.origin + location.pathname + "#/talents/" + cls.id + "/" + code : code;
      const copy = h("button", { type: "button", text: "Copy link", async onclick() {
        try { if (!navigator.clipboard?.writeText) throw Error("clipboard unavailable"); await navigator.clipboard.writeText(link); status.textContent = "Build link copied. Anyone with the link can open it."; }
        catch { status.textContent = "Copy the build code below; clipboard access is unavailable."; share.focus(); share.select(); }
      } });
      const reset = h("button", { type: "button", text: "Reset", onclick() { build = emptyBuild(data, cls.id, build.level); message = "Build reset."; changed(); render("reset"); } });
      const share = h("input", { class: "talents-share-code", readonly: "readonly", "aria-label": "Shareable talent build code", value: code });
      const shell = h("section", { class: "talents-tool", "data-class": cls.id }, classRow,
        h("div", { class: "talents-toolbar" }, h("label", { class: "talents-class-select", "aria-hidden": "true" }, "Class", classSelect), h("label", null, "Level", level), reset, copy, h("label", { class: "talents-compare-switch" }, compareInput, "Compare to Classic")),
        h("header", { class: "talents-class-banner" }, image((art.classPortraits || art.classIcons)[cls.id], { class: "talents-portrait" }), h("div", { class: "talents-class-title" }, h("p", { class: "talents-eyebrow", text: "Olympus · Forever talents" }), h("h2", { text: cls.name })),
          h("div", { class: "talents-spec-bars" }, cls.trees.map((tree, index) => h("div", null, h("span", { text: tree.name }), h("meter", { min: "0", max: String(state.budget), value: String(state.treePoints[index]), "aria-label": tree.name + " points" }, String(state.treePoints[index])), h("b", { text: String(state.treePoints[index]) }))))),
        h("div", { class: "talents-summary" }, h("strong", { text: state.treePoints.join(" / ") }), h("span", { text: "Points left: " + (state.budget - state.points) }), h("span", { text: "Level needed: " + state.levelNeeded })),
        compare ? h("p", { class: "talents-comparison-legend", text: "N New · C Changed · M Moved · dimmed: same as Classic. Hover or focus a talent for its Classic reference." }) : null,
        h("div", { class: "talents-workspace" }, h("div", { class: "talents-trees" }, treeCards)), status,
        h("section", { class: "talents-sharing", "aria-label": "Share this build" }, h("label", null, "Share", share)),
        h("footer", { class: "talents-source" }, h("p", null, "Talent data: ", h("a", { href: "https://talentsforever.com/", rel: "noopener noreferrer", text: "Talents Forever" }), " · ", h("a", { href: data.source.licenseURL, rel: "noopener noreferrer", text: "CC BY 4.0" }), ". World of Warcraft artwork © Blizzard Entertainment. Unofficial guild tool; not affiliated with Blizzard."),
          h("p", { text: "Beta client " + data.source.clientBuilds.join(", ") + " · Source generated " + data.source.upstreamGenerated + " · Snapshot fetched " + data.source.fetchedAt.slice(0, 10) + ". Not live tuning or a guide recommendation." }),
          h("p", { text: "Standard level-10-to-60 points; Legacy Talented bonuses are not modeled. Classic comparison uses supplied rank-one references, not a full Classic calculator or a verified Classic build. Game names, text and artwork belong to Blizzard Entertainment." }),
          h("p", { class: "talents-keyboard", text: "Keyboard: Tab enters each tree; arrows move across its grid. Enter or + adds; − removes. I enters the full detail panel; Escape closes it. A refund cannot break a tier or prerequisite." })));
      container.replaceChildren(shell); showDetail(talents.find(t => t.id === selected), buttons.get(selected), false);
      if (buttons.has(focus)) buttons.get(focus).focus();
      else if (focus && focus.startsWith("class:")) classButtons.get(cls.id).focus();
      else if (focus === "level") level.focus(); else if (focus === "compare") compareInput.focus(); else if (focus === "reset") reset.focus();
    }
  }
  return { validateData, validateArt, pointsAtLevel, emptyBuild, validateBuild, allocate, serializeBuild, parseBuild, comparisonBadges, mount };
});
