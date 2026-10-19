/* Public organization view. Static offices never confer identity, membership or permissions. */
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
export function renderOrganization(main, data, ui) {
  const { h, add, clear, posIcon, parts } = ui;
  clear(main);
  if (!document.getElementById("organization-view-style")) {
    const link = document.createElement("link"); link.id = "organization-view-style";
    link.rel = "stylesheet"; link.href = "/static/organization-view.css"; document.head.append(link);
  }
  const byId = new Map(data.nodes.map(n => [n.id, n])), buttons = new Map(), rows = new Map();
  const position = new Map(), visible = data.nodes.filter(n => n.relation !== "classification");
  const children = id => visible.filter(n => n.parent === id);
  let leaf = 0, maxDepth = 0;
  function place(node, depth) {
    maxDepth = Math.max(depth, maxDepth);
    const kids = children(node.id); let x;
    if (kids.length) { const xs = kids.map(n => place(n, depth + 1)); x = (xs[0] + xs[xs.length - 1]) / 2; }
    else x = 150 + leaf++ * 270;
    position.set(node.id, { x, y: 60 + depth * 190 }); return x;
  }
  visible.filter(n => n.parent === null).forEach(n => place(n, 0));
  const width = Math.max(1100, leaf * 270 + 40), height = (maxDepth + 1) * 190 + 60;
  const stage = h("div", { class: "org-stage" }), viewport = h("div", { class: "org-viewport", tabindex: "0", role: "region", "aria-label": "Directed organization chart. Arrow keys pan; plus and minus zoom; Home fits the chart." }, stage);
  stage.style.width = width + "px"; stage.style.height = height + "px";
  const wires = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", class: "org-wires" });
  const defs = svg("defs");
  for (const kind of ["accountability", "coordination", "independence"]) {
    const marker = svg("marker", { id: "org-arrow-" + kind, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "org-arrow-" + kind })); defs.append(marker);
  }
  wires.append(defs); stage.append(wires);
  const edges = [];
  function edge(fromId, toId, kind, relation) {
    const a = position.get(fromId), b = position.get(toId); if (!a || !b) return;
    const path = svg("path", { d: `M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y + 100) / 2}, ${b.x} ${(a.y + b.y + 100) / 2}, ${b.x} ${b.y + 110}`, class: "org-edge org-edge-" + kind, "marker-end": `url(#org-arrow-${kind})` });
    if (kind === "coordination") path.setAttribute("marker-start", "url(#org-arrow-coordination)");
    const title = svg("title"); title.textContent = `${byId.get(fromId).title} → ${byId.get(toId).title}: ${relation}`; path.append(title); wires.append(path); edges.push({ fromId, toId, path });
  }
  for (const node of visible) {
    if (node.parent) edge(node.id, node.parent, node.relation, data.legend[node.relation]);
    for (const peer of node.coordinates) if (peer !== node.parent) edge(node.id, peer, "coordination", "liaison; no command authority");
  }
  const detail = h("section", { class: "org-inspector", "aria-label": "Office mandate", "aria-live": "polite", tabindex: "-1" });
  const status = h("p", { class: "small muted", role: "status", "aria-live": "polite" });
  const search = h("input", { type: "search", id: "organization-search", maxlength: "160", placeholder: "Find an office, rank or duty…", "aria-label": "Search all offices and 95 labels" });
  let scale = 1, x = 0, y = 0, selected = "council", dragging = null, isList = false, suppressClick = false;
  const zoomStatus = h("output", { class: "org-zoom", "aria-label": "Chart zoom" });
  function transform() { stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; zoomStatus.textContent = Math.round(scale * 100) + "%"; }
  function zoom(next, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    next = Math.max(.05, Math.min(2, next)); x = cx - (cx - x) * next / scale; y = cy - (cy - y) * next / scale; scale = next; transform();
  }
  function fit() { const w = viewport.clientWidth || 850, ht = viewport.clientHeight || 620; scale = Math.max(.05, Math.min(1, (w - 32) / width, (ht - 32) / height)); x = (w - width * scale) / 2; y = 16; transform(); }
  function focusNode(id) { const p = position.get(id); if (!p) return; scale = Math.max(.7, scale); x = viewport.clientWidth / 2 - p.x * scale; y = Math.max(50, viewport.clientHeight / 3) - p.y * scale; transform(); }
  function select(id, move = false, focus = false, term = null) {
    const n = byId.get(id); if (!n) return; selected = id;
    for (const [key, button] of buttons) button.setAttribute("aria-pressed", String(key === id));
    for (const e of edges) e.path.classList.toggle("org-edge-active", e.fromId === id || e.toId === id);
    const offices = (data.officeMandates || []).filter(o => o.nodeId === id);
    clear(detail); add(detail, [h("p", { class: "eyebrow", text: n.kind }), h("h2", { text: n.title }), term ? h("p", { text: term.label + ": " + term.note }) : null,
      h("h3", { text: "Purpose" }), h("p", { text: n.remit }), h("h3", { text: "Authority and boundaries" }), h("p", { text: n.limits }),
      h("p", { class: "org-relation", text: n.parent ? `${n.relation === "accountability" ? "Accountable to" : n.relation === "independence" ? "Independent review remit connected to" : "Coordinates through"}: ${byId.get(n.parent).title}.` : "Constitutional root; no reporting parent in this model." }),
      offices.length ? h("div", null, h("h3", { text: "Offices and working mandates" }), offices.map(o => h("article", { class: "org-mandate" }, h("h4", { text: o.title }), h("p", { text: o.duty }), h("p", { class: "small", text: "Record of work: " + o.output }), h("p", { class: "small muted", text: "Appointment and limits: " + o.boundary })))) : null,
      n.coordinates.length ? h("div", null, h("h3", { text: "Working relationships" }), n.coordinates.map(key => h("button", { type: "button", class: "btn small", text: byId.get(key).title, onclick: () => select(key, true) }))) : null,
      h("h3", { text: "Related titles and vocabulary" }), h("ul", null, data.terms.filter(t => t.nodeId === id).map(t => h("li", { text: t.label + " — " + t.note }))),
      h("a", { class: "btn small", href: "#/governance/" + n.chapter, text: "Read the complete charter" }), h("a", { class: "btn small", href: "#/organization/" + id, text: "Link to this office" })]);
    if (move) focusNode(id); if (focus) detail.focus();
  }
  for (const node of visible) {
    const p = position.get(node.id), button = h("button", { type: "button", class: "org-node org-node-" + node.relation, "data-organization-node": node.id, "aria-pressed": "false", onclick: () => select(node.id, false, true) }, posIcon(node.icon), h("span", null, h("strong", { text: node.title }), h("small", { text: node.kind })));
    button.style.left = (p.x - 115) + "px"; button.style.top = p.y + "px"; stage.append(button); buttons.set(node.id, button);
  }
  const list = h("section", { class: "org-list", "aria-label": "All offices in reading order" });
  for (const n of data.nodes) {
    const row = h("article", { class: "org-list-row" }, h("button", { type: "button", class: "org-list-title", onclick: () => select(n.id, true, true) }, posIcon(n.icon), h("span", null, h("strong", { text: n.title }), h("small", { text: n.kind }))), h("p", { text: n.remit }), h("p", { class: "small muted", text: n.parent ? `${n.relation}: ${byId.get(n.parent).title}` : "Separate root" }));
    rows.set(n.id, row); list.append(row);
  }
  const chartButton = h("button", { type: "button", class: "btn small", "aria-pressed": "true", text: "Chart", onclick: () => view(false) });
  const listButton = h("button", { type: "button", class: "btn small", "aria-pressed": "false", text: "List", onclick: () => view(true) });
  const chartLocation = h("div", { class: "org-chart-location" });
  const chartDialog = h("dialog", { class: "org-fullscreen", "aria-label": "Organization chart in full screen" },
    h("div", { class: "org-fullscreen-heading" }, h("h2", { text: "Organization of Olympus" }),
      h("button", { type: "button", class: "btn small", text: "Close full screen", onclick: () => chartDialog.close() })));
  const fullScreen = h("button", { type: "button", class: "btn small", text: "Full screen", "aria-expanded": "false", onclick: () => {
    if (chartDialog.open) { chartDialog.close(); return; }
    if (typeof chartDialog.showModal !== "function") { status.textContent = "Full screen is unavailable in this browser. The chart and List view remain available below."; return; }
    stop(); chartDialog.append(chartShell);
    try { chartDialog.showModal(); }
    catch { chartLocation.append(chartShell); status.textContent = "Full screen could not be opened. The chart remains available below."; return; }
    fullScreen.textContent = "Exit full screen"; fullScreen.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => { if (chartDialog.open && main.isConnected) { focusNode(selected); viewport.focus(); } });
  } });
  const chartControls = h("div", { class: "org-chart-tools" }, h("button", { type: "button", class: "btn small", text: "−", "aria-label": "Zoom out", onclick: () => zoom(scale / 1.25) }), zoomStatus, h("button", { type: "button", class: "btn small", text: "+", "aria-label": "Zoom in", onclick: () => zoom(scale * 1.25) }), h("button", { type: "button", class: "btn small", text: "Fit chart", onclick: fit }), h("button", { type: "button", class: "btn small", text: "Center selected", onclick: () => focusNode(selected) }), fullScreen);
  const chartShell = h("section", { class: "org-chart-shell", "aria-label": "Explore the organization" },
    h("div", { class: "org-toolbar" }, h("label", { for: "organization-search", text: "Find a duty" }), search, chartButton, listButton, chartControls), status,
    h("div", { class: "org-workspace" }, h("div", { class: "org-explorer" }, viewport, list), detail));
  chartLocation.append(chartShell);
  chartDialog.addEventListener("close", () => {
    stop(); chartLocation.append(chartShell); fullScreen.textContent = "Full screen"; fullScreen.setAttribute("aria-expanded", "false");
    requestAnimationFrame(() => { if (main.isConnected) { if (!isList) focusNode(selected); (isList ? listButton : fullScreen).focus(); } });
  });
  function view(asList) { stop(); isList = asList; list.hidden = !asList; viewport.hidden = asList; chartControls.hidden = asList; chartButton.setAttribute("aria-pressed", String(!asList)); listButton.setAttribute("aria-pressed", String(asList)); if (!asList) fit(); }
  viewport.addEventListener("keydown", e => {
    if (e.target !== viewport) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 120 : 45; x += e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0; y += e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0; transform(); }
    else if (["+", "=", "-", "Home", "0"].includes(e.key)) { e.preventDefault(); if (e.key === "Home" || e.key === "0") fit(); else zoom(scale * (e.key === "-" ? .8 : 1.25)); }
  });
  // A card still clicks normally; movement beyond a small threshold becomes a pan instead.
  viewport.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false || dragging) return;
    suppressClick = false;
    dragging = { id: e.pointerId, px: e.clientX, py: e.clientY, x, y, moved: false };
    if (!e.target.closest("button")) { e.preventDefault(); viewport.focus({ preventScroll: true }); viewport.setPointerCapture(e.pointerId); }
  });
  viewport.addEventListener("pointermove", e => {
    if (dragging?.id !== e.pointerId) return;
    const dx = e.clientX - dragging.px, dy = e.clientY - dragging.py;
    if (!dragging.moved && Math.hypot(dx, dy) < 6) return;
    dragging.moved = true; suppressClick = true; e.preventDefault(); viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging"); x = dragging.x + dx; y = dragging.y + dy; transform();
  });
  const stop = e => {
    if (e?.pointerId !== undefined && dragging?.id !== e.pointerId) return;
    const id = dragging?.id; dragging = null; viewport.classList.remove("is-dragging");
    if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  };
  viewport.addEventListener("pointerup", stop); viewport.addEventListener("pointercancel", stop); viewport.addEventListener("lostpointercapture", stop);
  viewport.addEventListener("click", e => { if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  viewport.addEventListener("selectstart", e => e.preventDefault());
  viewport.addEventListener("wheel", e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const r = viewport.getBoundingClientRect(); zoom(scale * (e.deltaY < 0 ? 1.12 : .89), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const termList = h("ul", { class: "organization-terms" });
  const termRows = data.terms.map(t => { const li = h("li", null, h("button", { type: "button", class: "organization-term", text: t.label, onclick: () => select(t.nodeId, true, true, t) }), h("small", { class: "muted", text: data.termGroups.find(g => g.id === t.classification).title })); termList.append(li); return { t, li }; });
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase(); let count = 0;
    for (const n of data.nodes) { const matches = !q || [n.title, n.remit, n.limits, ...data.terms.filter(t => t.nodeId === n.id).map(t => t.label)].join(" ").toLowerCase().includes(q); rows.get(n.id).hidden = !matches; buttons.get(n.id)?.classList.toggle("org-node-match", !!q && matches); if (matches) count++; }
    for (const { t, li } of termRows) li.hidden = !!q && !(t.label + " " + t.note).toLowerCase().includes(q);
    status.textContent = q ? `${count} offices or groups match. Chart matches are outlined; use List for a filtered reading view.` : `${data.nodes.length} organizational groups · ${data.terms.length} titles and terms · ten native rank slots.`;
  });
  add(main, [h("section", { class: "governance-hero" }, posIcon("guild_master"), h("div", null, h("p", { class: "eyebrow", text: "The administration of Olympus" }), h("h1", { text: "Many guilds. One Olympus." }), h("p", { text: "Follow a line of responsibility, find the people a duty serves, and understand where an office’s authority ends." }))),
    h("aside", { class: "org-adoption", role: "note" }, h("strong", { text: "Guild rules adopted · 13 October 2026" }), h("p", { text: "Adopted by the authorized guild administration. An office shown here does not appoint a holder, grant a Council vote or alter game, Discord, website or bank permissions. Individual appointments and actual access remain separately recorded." })),
    h("nav", { class: "governance-quicklinks", "aria-label": "Organization resources" }, h("a", { class: "btn", href: "#/governance/operational-charter-the-work-of-olympus", text: "Read the operational charter" }), h("a", { class: "btn", href: data.directoryRoute, text: "Current appointed leadership" }), h("a", { class: "btn small", href: "#/governance", text: "Complete governance book" })),
    h("section", { class: "org-council-overview frame", "aria-label": "High Council offices" }, h("h2", { text: "The High Council at a glance" }),
      h("p", { text: data.councilComposition?.summary || "Five core portfolio offices coordinate the work of Olympus:" }),
      h("ul", { class: "org-council-offices" }, (data.councilComposition?.offices || ["War Head for PvP", "War Head for Raiding", "Federal Treasurer", "Minister of Artisanry", "Minister of Heraldry"]).map(title => h("li", null, h("strong", { text: title })))),
      data.councilComposition ? h("p", { class: "org-composition-status", role: "note", text: data.councilComposition.formalStatus }) : null,
      h("p", { text: "Council seats require an accepted appointment; the five portfolio offices are not a five-seat limit. Accepted councillors without another portfolio ordinarily serve the Council of Justice, subject to case designation and conflict review." }),
      h("p", { class: "small muted", text: "Systems and Addons is shared support. Specialist heads may advise, but are not automatically voting councillors. The owner-directed Co-Guild Master addition does not itself issue an eligible vote, individual warrant, native rank or permission. One person still has one vote, subject to recusal." }),
      data.councilComposition ? h("a", { href: data.councilComposition.sourcePath, text: "Read the dated Co-Guild Master composition direction" }) : null,
      h("a", { href: "#/governance/operational-charter-the-work-of-olympus", text: "Read Operational Charter O3 — The High Council and its offices" })),
    h("div", { class: "org-guide" }, h("h2", { text: "How to read the chart" }), h("p", { text: "Solid gold arrows point from an office toward the authority it answers to. Dashed blue two-way lines connect partners who coordinate. Dotted violet lines show independent review, never command by the person under review. Select a card to read its mandate. The rank and status groupings below carry no command arrows." }),
      h("p", { class: "small muted", text: "Drag the chart or a card to pan; click a card to read its mandate. Use +/−, Ctrl + wheel or ⌘ + wheel to zoom. Focus the chart and use arrow keys to pan, Shift for larger steps, Home or 0 to fit. Full screen gives the chart more room; Escape returns to this page. Every office is also available in List view." })),
    chartLocation, chartDialog,
    h("section", { class: "frame org-rank-guide" }, h("h2", { text: "An office, a native rank and a permission are three records" }), h("p", { text: "The High Council includes entrusted offices: the PvP and Raiding War Heads, Federal Treasurer, Ministers of Artisanry and Heraldry, and accepted members serving Justice or another recorded mandate. A Council seat is an appointment. High Council is also a slot in the adopted ten-rank ladder. One does not silently issue the other. The current five-rank beta client is a separate observed game configuration; this page does not claim the ten-rank ladder has already been installed." }),
      h("ol", { class: "organization-ranks" }, data.nativeRanks.map(r => h("li", { "data-native-rank": String(r.order) }, h("strong", { text: r.name }), h("p", { class: "small", text: r.meaning.replace("draft preset", "configuration preset") })))),
      h("p", { text: "Co-Guild Master, Vice Guild Master, Chief of Staff, Treasurer, ministers, deputies, emissaries, mentors and class heads are offices or duties; none creates an extra rank slot. Officer Alt and Alt identify verified characters, not extra people or votes. No title alone grants bank withdrawal, invitations, key signing or access to confidential records." })),
    h("section", { class: "frame" }, h("h2", { text: "Olympus I–X · affiliation and succession" }), h("p", { text: "These are directory places for affiliated guilds, not assertions that ten guilds are formed or that their Guild Masters have been appointed. A local Guild Master retains local command while accepting the common charter. Each guild names five correspondents: PvP, Raiding, Finance, Artisanry and Heraldry." }), h("ul", { class: "organization-guilds" }, data.guildPlaceholders.map(g => h("li", null, h("strong", { text: g.name }), h("small", { text: g.state }))))),
    h("section", { class: "frame" }, h("h2", { text: "The complete office and title index" }), h("p", { text: "All 95 recorded labels remain searchable. Aliases, courtesy titles, activity tags and review statuses are classified alongside offices without conferring their powers." }), termList)]);
  select(byId.has(parts[0]) ? parts[0] : "council");
  status.textContent = `${data.nodes.length} organizational groups · ${data.terms.length} titles and terms · ten native rank slots.`;
  view(typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches);
  const present = () => { if (main.isConnected && !isList) focusNode(selected); };
  document.getElementById("organization-view-style").addEventListener("load", present, { once: true });
  requestAnimationFrame(present);
}
