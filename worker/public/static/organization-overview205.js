/* Presentation only. Canonical role families, native ranks and charter relationships retain their identities. */
import { ORGANIZATION_LANES205, ORGANIZATION_HISTORY205 } from "/static/organization-context205.js";

const TIERS205 = Object.freeze({ leader: "Leader", high_council: "High Council", officer_corps: "Officer Corps", member_specialist: "Member & Specialist" });
const searchWords205 = text => String(text).normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export function buildAllianceOverview205(data, directory) {
  if (!directory?.families?.length || !Array.isArray(data.nodes) || !Array.isArray(data.nativeRanks)) throw new Error("The canonical organization directory is unavailable.");
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  const terms = new Map(data.terms.map(term => [term.officeKey, term]));
  const assignments = new Map([...(data.roleRank199?.offices || []), ...(data.appointments || [])].map(row => [row.key, row]));
  const groups = [
    { key: "leadership", title: "Leader & founding recognition", families: [] },
    { key: "council", title: "High Council · current alliance leadership", families: [] },
    { key: "independent", title: "Justice & independent review", families: [] },
    { key: "institutions", title: "Guild institutions & governing bodies", families: [] },
    ...ORGANIZATION_LANES205.map(lane => ({ ...lane, families: [] })),
    { key: "officers", title: "Branch leadership & Officer Corps", families: [] },
    { key: "members", title: "Membership, specialists & recognition", families: [] }
  ];
  const groupByKey = new Map(groups.map(group => [group.key, group]));
  const seen = new Set(), sourceKeys = new Set();
  for (const family of directory.families) {
    if (seen.has(family.key) || !TIERS205[family.tier] || !family.sourceKeys.includes(family.primaryKey)) throw new Error("Invalid canonical role family.");
    seen.add(family.key);
    const related = family.sourceKeys.map(key => terms.get(key) || terms.get(assignments.get(key)?.aliasOf)).filter(Boolean);
    const primary = terms.get(family.primaryKey) || related[0];
    const nodeId = primary?.nodeId || (family.key === "pvp_team" ? "activity" : "native");
    if (!nodes.has(nodeId)) throw new Error("A canonical role has no organization context.");
    const ancestors = new Set();
    for (let current = nodes.get(nodeId); current; current = current.parent ? nodes.get(current.parent) : null) {
      if (ancestors.has(current.id)) throw new Error("Cyclic organization context.");
      ancestors.add(current.id);
    }
    let groupKey;
    if (family.kind === "institution") groupKey = "institutions";
    else if (family.tier === "leader") groupKey = "leadership";
    else if (family.tier === "high_council") groupKey = "council";
    else if (ancestors.has("justice") || ancestors.has("auditor")) groupKey = "independent";
    else if (family.tier === "member_specialist") groupKey = "members";
    else groupKey = ORGANIZATION_LANES205.find(lane => ancestors.has(lane.rootId))?.key
      || (ancestors.has("officers") || ancestors.has("guilds") || family.tier === "officer_corps" ? "officers" : "council");
    const slots = new Set();
    for (const key of family.sourceKeys) {
      if (sourceKeys.has(key)) throw new Error("Duplicate canonical role source.");
      sourceKeys.add(key);
      const row = assignments.get(key) || terms.get(key);
      for (const slot of row?.recommendedNativeSlots || (Number.isInteger(row?.nativeSlot) ? [row.nativeSlot] : [])) if (Number.isInteger(slot) && slot >= 0 && slot <= 9) slots.add(slot);
    }
    const node = nodes.get(nodeId);
    const mandates = (data.officeMandates || []).filter(row => row.nodeId === nodeId);
    const searchText = [family.label, ...family.alternateTitles, ...family.variants.map(row => row.label), node.title, node.remit, ...related.map(row => row.department), ...mandates.map(row => row.title + " " + row.duty)].join(" ").toLowerCase();
    groupByKey.get(groupKey).families.push({ family, nodeId, slots: [...slots].sort((a, b) => a - b), searchText });
  }
  if (sourceKeys.size !== directory.sourceKeyCount || directory.ranks.length !== 10 || directory.ranks.some((rank, slot) => rank.nativeSlot !== slot || rank.nativeRankOrdinal !== slot + 1)) throw new Error("Incomplete canonical role or rank coverage.");
  const councilSeats = data.councilComposition?.currentSeats;
  const seatIds = ["gm-chair", "co-gm", "treasurer", "head-trading", "main-raid-lead", "main-pvp-lead", "head-justice", "artisanry", "heraldry", "intake", "systems", "internal-security", "concordat"];
  const canonicalFamilies = new Map(directory.families.map(family => [family.key, family]));
  if (!Array.isArray(councilSeats) || councilSeats.length !== seatIds.length || new Set(councilSeats.map(seat => seat.id)).size !== seatIds.length || seatIds.some(id => !councilSeats.some(seat => seat.id === id)) || councilSeats.some(seat => {
    const family = canonicalFamilies.get(seat.familyKey);
    return !family || family.tier !== (seat.id === "gm-chair" ? "leader" : "high_council") || !nodes.has(seat.nodeId) || seat.scope !== "alliance" || !seat.label || !seat.description || !Array.isArray(seat.officeKeys) || !seat.officeKeys.length || seat.officeKeys.some(key => !family.sourceKeys.includes(key));
  })) throw new Error("The complete current High Council roster is unavailable.");
  const seatOrder = councilSeats.map(seat => seat.familyKey);
  groupByKey.get("council").families.sort((a, b) => {
    const order = key => seatOrder.includes(key) ? seatOrder.indexOf(key) : seatOrder.length;
    return order(a.family.key) - order(b.family.key);
  });
  return { groups, councilSeats, ranks: directory.ranks, sourceKeyCount: sourceKeys.size, relationships: data.nodes.filter(node => node.parent && node.relation !== "classification").map(node => ({ from: node.id, to: node.parent, kind: node.relation })) };
}

export function renderAllianceOverview205(data, ui, onSelectNode) {
  const { h, posIcon } = ui;
  const root = h("section", { class: "org-alliance frame", id: "alliance-overview", "aria-label": "Olympus Alliance organization overview" });
  let model;
  try { model = buildAllianceOverview205(data, ui.roleDirectory203); }
  catch { root.append(h("p", { role: "alert", text: "The complete organization overview is unavailable. Reload, or use the charter and relationship map below." })); return root; }
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  const status = h("p", { class: "org-alliance-status small", role: "status", "aria-live": "polite" });
  const search = h("input", { id: "org-alliance-search205", type: "search", maxlength: "160", placeholder: "Raid Lead NA, Treasurer, recipes…", "aria-label": "Search the Alliance role families" });
  const rank = h("select", { id: "org-alliance-rank205", "aria-label": "Filter by native rank association" }, h("option", { value: "", text: "All ranks" }), model.ranks.map(row => h("option", { value: String(row.nativeSlot), text: "Rank " + row.nativeRankOrdinal + " · " + row.label })));
  const guild = h("select", { id: "org-alliance-guild205", "aria-label": "Explore a guild branch context" }, h("option", { value: "", text: "All Olympus branches" }), data.guildPlaceholders.map(row => h("option", { value: row.name, text: row.name })));
  const branchTitle = h("h3", { text: "Olympus I–X · local guild management" });
  const branchDescription = h("p");
  const families = [], familyCounts = [], seatReferences = [], referenceGroups = [];
  function nodeButton(id, text) {
    return h("button", { type: "button", class: "btn small", text, onclick: () => onSelectNode?.(id) });
  }
  function guide(key, options) {
    return ui.roleGuide201 ? ui.roleGuide201(key, options) : h("a", { href: "#/roles/" + encodeURIComponent(ui.roleDirectory203.keyToFamily[key] || "rosetta-stone"), text: "Read the complete role guide" });
  }
  function familyCard(row) {
    const family = row.family, node = nodes.get(row.nodeId), institution = family.kind === "institution", reserved = family.kind === "role" && family.tier !== "member_specialist";
    const body = h("div", { class: "org-alliance-family-guide" });
    const card = h("details", { class: "org-alliance-family" + (institution ? " org-alliance-institution218" : ""), "data-alliance-family": family.key },
      h("summary", { class: "org-alliance-card-heading" }, posIcon(node.icon), h("span", null, h("strong", { text: family.label }), h("small", { text: institution ? "Collective institution or historical mandate" : TIERS205[family.tier] + (reserved ? " · Reserved appointment" : " · " + (family.kind === "status" ? "Standing or recognition" : "Role or voluntary activity")) }))),
      h("p", { class: "org-alliance-badges" }, h("span", { class: "org-alliance-tier", "data-tier": family.tier, text: institution ? "Governance institution" : TIERS205[family.tier] }),
        institution ? null : h("span", { class: "small", text: row.slots.length ? row.slots.map(slot => "Rank " + (slot + 1) + " " + model.ranks[slot].label).join(" · ") : "No native rank assigned" })),
      body,
      h("a", { class: "btn small", href: "#/roles/" + encodeURIComponent(family.key), text: "Open this complete role family" }),
      nodeButton(row.nodeId, "Trace responsibilities"));
    let loaded = false;
    card.addEventListener("toggle", () => {
      if (!card.open || loaded) return;
      loaded = true;
      body.append(guide(family.primaryKey, { canonical:true, familyKey:family.key }));
      for (const [groupKey,title,kinds] of [["offices","Separate offices & remits",["office"]], ["specialisms","Regional & class duties",["region","class"]], ["associations","Related titles & rank details",["alias","native","historical"]]]) {
        const variants = family.variants.filter(variant => kinds.includes(variant.presentation || (["region","class"].includes(variant.kind) ? variant.kind : "office")));
        if (!variants.length) continue;
        const group = h("section", { class:"org-alliance-guide-group218", "data-alliance-guide-group218":groupKey }, h("h4", {text:title}));
        for (const variant of variants) {
          const variantBody = h("div"), disclosure = h("details", { "data-alliance-variant": variant.key }, h("summary", { text: variant.label }), variantBody);
          let variantLoaded = false;
          disclosure.addEventListener("toggle", () => { if (disclosure.open && !variantLoaded) { variantLoaded = true; variantBody.append(guide(variant.key, { association:groupKey === "associations", sharedWith:family.primaryKey, familyKey:family.key })); } });
          group.append(disclosure);
        }
        body.append(group);
      }
    });
    const searchable = row.searchText + " " + family.sourceKeys.map(key => JSON.stringify(ui.roleGuides201?.[key] || "")).join(" ").toLowerCase();
    families.push({ ...row, element: card, words: new Set(searchWords205(searchable)) });
    return card;
  }
  function groupCards(key) {
    const group = model.groups.find(row => row.key === key);
    const counter = h("span", { class: "small muted", text: String(group.families.length) + " role families" });
    const box = h("div", { class: "org-alliance-families", "data-alliance-group": key }, counter, group.families.map(familyCard));
    familyCounts.push({ group, counter, box });
    return box;
  }
  const groupSection = (key, className, text) => h("section", { class: className }, h("h3", { text: model.groups.find(row => row.key === key).title }), h("p", { text }), groupCards(key));
  function seatReference(seat, detailed) {
    const row = h("li", { "data-council-seat206": detailed ? seat.id : null }, h("a", { href: "#/roles/" + encodeURIComponent(seat.familyKey), class: detailed ? "org-alliance-seat-link" : null, "data-council-reference206": seat.id, title: seat.description },
      detailed ? posIcon(nodes.get(seat.nodeId).icon) : null, detailed ? h("strong", { text: seat.label }) : seat.label),
      detailed ? h("small", { text: seat.id === "gm-chair" ? "Council chair · Rank 1 Leader" : "Alliance portfolio · Rank 2 High Council" }) : null);
    seatReferences.push({ element: row, familyKey: seat.familyKey });
    return row;
  }
  const councilRoster = h("section", { class: "org-alliance-current-council", "aria-label": "Current High Council composition" }, h("h4", { text: "The current Council seats and portfolios" }),
    h("p", { text: "The Guild Master chairs the Council. The Co-GM, Treasurer, Head of Trading & Markets, main Raid Lead, main PvP Lead and head of Justice sit alongside the other alliance portfolio heads below. These are alliance-wide responsibilities; regional and branch activity leaders have separate remits." }),
    h("ul", { class: "org-alliance-council-seats" }, model.councilSeats.map(seat => seatReference(seat, true))),
    h("p", { class: "small muted", text: "Council composition identifies the remit, not a named holder. Leadership seats remain reserved appointments. Regional Raid Leaders and PvP Leads do not acquire a Council seat through an event assignment." }),
    h("a", { href: data.councilComposition.sourcePath, text: "Read the current Council portfolios & reporting lines" }));
  referenceGroups.push({ element: councilRoster, rows: seatReferences.slice() });
  function councilReferences(rootId) {
    const seats = model.councilSeats.filter(seat => {
      for (let node = nodes.get(seat.nodeId); node; node = node.parent ? nodes.get(node.parent) : null) if (node.id === rootId) return true;
      return false;
    });
    if (!seats.length) return null;
    const start = seatReferences.length;
    const box = h("div", { class: "org-alliance-council-references" }, h("strong", { text: "Represented on the High Council" }), h("ul", null, seats.map(seat => seatReference(seat, false))), h("p", { class: "small muted", text: "Council portfolios are listed together above; these links show the department they serve." }));
    referenceGroups.push({ element: box, rows: seatReferences.slice(start) });
    return box;
  }
  const departments = h("div", { class: "org-alliance-departments", "aria-label": "Olympus-wide departments and shared support" }, ORGANIZATION_LANES205.map(lane => {
    const node = nodes.get(lane.rootId);
    return h("section", { class: "org-alliance-lane", "data-lane": lane.key }, h("div", { class: "org-alliance-lane-heading" }, posIcon(node.icon), h("h3", { text: lane.title })), h("p", { text: lane.summary }),
      councilReferences(lane.rootId), h("ul", null, lane.duties.map(text => h("li", { text }))), h("details", null, h("summary", { text: "Mandate & boundaries" }), h("p", { text: node.remit }), h("p", { text: lane.boundary }), nodeButton(node.id, "See reporting & coordination")), model.groups.find(group => group.key === lane.key).families.length ? groupCards(lane.key) : h("p", { class: "small muted", text: "The Council portfolio guide is above. Local support duties remain in the branch and specialist guides below." }));
  }));
  const empty = h("p", { class: "org-alliance-empty", role: "note", hidden: true, text: "No role families match these filters. Try an alternate title or reset the filters." });
  function describeBranch() {
    const branch = data.guildPlaceholders.find(row => row.name === guild.value);
    branchTitle.textContent = branch ? branch.name + " · local guild context" : "Olympus I–X · local guild management";
    branchDescription.textContent = branch ? branch.state + ". The cards describe shared local duties for this directory scope, not confirmed officeholders, a formed guild or live capacity. Alliance portfolios still coordinate across branches; the role catalogue below remains shared." : "Choose Olympus I–X to explore a directory scope. Local Guild Masters retain local command. These placeholders establish no formed guild, officeholder or live roster capacity.";
  }
  function filter() {
    const query = searchWords205(search.value), slot = rank.value === "" ? null : Number(rank.value);
    let count = 0;
    for (const row of families) {
      const matches = query.every(word => word.length <= 2 ? row.words.has(word) : [...row.words].some(candidate => candidate.startsWith(word)));
      row.element.hidden = !matches || (slot !== null && !row.slots.includes(slot));
      if (!row.element.hidden) count++;
    }
    for (const { group, counter } of familyCounts) {
      const shown = families.filter(row => group.families.some(family => family.family.key === row.family.key) && !row.element.hidden).length;
      counter.textContent = shown + " of " + group.families.length + " role families";
    }
    for (const reference of seatReferences) reference.element.hidden = families.find(row => row.family.key === reference.familyKey).element.hidden;
    for (const group of referenceGroups) group.element.hidden = group.rows.every(row => row.element.hidden);
    empty.hidden = count !== 0;
    status.textContent = count + " of " + families.length + " role families · ten native ranks · " + (guild.value || "all branch scopes") + ". Rank badges describe associations, not permissions or reporting lines.";
  }
  const reset = h("button", { type: "button", class: "btn small", text: "Reset overview filters", onclick: () => { search.value = ""; rank.value = ""; guild.value = ""; describeBranch(); filter(); } });
  search.addEventListener("input", filter); rank.addEventListener("change", filter); guild.addEventListener("change", () => { describeBranch(); filter(); });
  root.append(h("header", { class: "org-alliance-heading" }, h("p", { class: "eyebrow", text: "Command · portfolios · guilds · membership" }), h("h2", { text: "The Olympus Alliance at a glance" }), h("p", { text: "Explore the same organization from its leadership, departments and local guilds. Expand an individual role for its full definition, responsibilities, expectations and regional or class specialisms." })),
    h("div", { class: "org-alliance-toolbar" }, h("label", { for: "org-alliance-search205", text: "Find a role" }), search, h("label", { for: "org-alliance-rank205", text: "Native rank" }), rank, h("label", { for: "org-alliance-guild205", text: "Guild context" }), guild, reset), status,
    h("p", { class: "org-alliance-legend small", text: "Leadership sets the common charter. Department columns organize work; horizontal placement gives no command authority. Justice and Audit retain independent review. Open the relationship map below for the exact reporting and coordination lines." }),
    groupSection("leadership", "org-alliance-sovereign", "The Leader / Guild Master holds the sovereign office. Founder recognition and patronage are distinct from an issued command or permission."),
    h("section", { class: "org-alliance-council" }, h("h3", { text: model.groups.find(row => row.key === "council").title }), councilRoster,
      h("p", { text: "Every High Council role family is collected here, including its departmental heads. Expand a guide for the full mandate and expectations. Council appointments do not add native rank slots." }), groupCards("council")),
    h("div", { class: "org-alliance-support" }, h("section", { class: "org-alliance-independent" }, h("h3", { text: "Justice & independent review" }),
      h("p", { text: "The head of Justice is a High Council portfolio holder. Judicial case panels and the Bank Auditor retain unconflicted, independent review; they are not subordinate to the officer or Treasury custodian whose work is under review." }), councilReferences("justice"), groupCards("independent"))),
    groupSection("institutions", "org-alliance-institutions", "These are institutions and collective mandates, not extra Council seats or individual jobs. Their members, hearing panels and delegated powers require their own accepted appointments."),
    departments,
    h("section", { class: "org-alliance-branches" }, branchTitle, branchDescription,
      h("div", { class: "org-alliance-branch-guides" }, ["guilds", "officers", "emissaries"].map(id => h("article", { class: "org-alliance-card" }, h("h4", null, posIcon(nodes.get(id).icon), h("span", { text: nodes.get(id).title })), h("p", { text: nodes.get(id).remit }), nodeButton(id, "Read the local mandate")))),
      h("p", { class: "small muted", text: "Each branch's five emissary remits cover PvP, Raiding, Finance, Artisanry and Heraldry. They carry local needs and agreed guidance; liaison does not replace local command." })),
    groupSection("officers", "org-alliance-officers", "Officer, Officer Alt and regional Raid Leader occupy native Ranks 3–5. The alliance-wide main Raid and PvP portfolio leads are on the High Council above. Branch, activity and NA/EU time-zone remits remain distinct; all leadership seats are reserved appointments, with no public application route."),
    h("section", { class: "org-alliance-rank-guide" }, h("h3", { text: "The ten in-game ranks · exact order" }), h("ol", { class: "org-alliance-ranks" }, model.ranks.map(row => h("li", { "data-alliance-rank": String(row.nativeSlot) }, h("a", { href: "#/roles/" + encodeURIComponent(row.familyKey), text: row.nativeRankOrdinal + ". " + row.label }), h("small", { text: "Native slot " + row.nativeSlot })))), h("p", { class: "small muted", text: "This ladder is separate from the lines of responsibility above. Class Heads, Treasury, regional duties and courtesy titles do not add native rank slots; actual game configuration remains separately verified." })),
    groupSection("members", "org-alliance-members", "Members, raiders, artisans, mentors and voluntary activities share the guild without acquiring officer powers. Status, verified alts and cosmetic recognition remain distinct from appointments."), empty,
    h("details", { class: "org-alliance-history" }, h("summary", { text: "From the early Olympus organization design" }), h("p", { text: "The earlier poster supplies useful context for the departments and their working relationships. Its named holders, shorter membership ladder and older scope do not establish today's appointments or native configuration." }), ORGANIZATION_HISTORY205.map(row => h("section", null, h("h3", { text: row.title }), h("p", { text: row.text })))),
    h("nav", { class: "governance-quicklinks", "aria-label": "Continue exploring the Alliance" }, h("a", { class: "btn small", href: "#/roles/rosetta-stone", text: "Role & Rank Rosetta Stone" }), h("a", { class: "btn small", href: "#/governance/operational-charter-the-work-of-olympus", text: "Complete operational charter" })));
  describeBranch(); filter();
  return root;
}
