#!/usr/bin/env node
/* One-shot migration of the .218 guide catalogue into Olympus University files (Evergreen Stage 2, 12 Nov 2026).
 * The owner's directive (Pillar 3 item 3) asks for 101/201/301 courses; the lane rule is that no existing guide
 * content is lost. This script moves every claim and line of guides218.json into facts and chapters by fixed rules
 * and writes build/migration-map.json, which records where each old path went.
 *
 *   node worker/public/static/university/build/migrate-guides218.cjs            write files that do not exist yet
 *   node worker/public/static/university/build/migrate-guides218.cjs --presets  refresh presets.json only
 *
 * It never overwrites a fact, course, profession or index file: once written, those files belong to their authors.
 * Grades follow mechanical rules (see gradeOf): nothing is upgraded, and every grade-A claim checked against the
 * 16 October talent data is marked for re-check against the 10 November data. */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const UNI = path.resolve(__dirname, ".."), STATIC = path.resolve(UNI, "..");
const g = JSON.parse(fs.readFileSync(path.join(STATIC, "guides218.json"), "utf8"));
const talents = JSON.parse(fs.readFileSync(path.join(STATIC, "talents", "data.json"), "utf8"));
const REVIEWED = g.reviewedAt, TODAY = "2026-11-12";
const write = (rel, value, force) => {
  const file = path.join(UNI, rel);
  if (fs.existsSync(file) && !force) { console.log("kept   " + rel); return false; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 1) + "\n");
  console.log("wrote  " + rel);
  return true;
};
// Presets stay owned by guides218.json (the talents lane); each class gets a copy so a guide page loads only its own.
const writePresets = force => { for (const c of g.classes) write("presets/" + c.id + ".json", { schema: "olympus-university-presets-v1",
  note: "Copied from guides218.json presets by build/migrate-guides218.cjs --presets; build/validate.cjs refuses any drift.", talentRevision: g.talentRevision,
  presets: g.presets.filter(p => p.classId === c.id) }, force); };
if (process.argv.includes("--presets")) { writePresets(true); process.exit(0); }

const map = [];
const slug = text => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
const sid = n => "g218-" + n;
const RECHECK = "Checked against the 16 October talent data; not yet re-checked against the 10 November data.";
// Grades: a claim keeps its own grade. A class change has a status instead, so its grade comes from its sources:
// pinned talent data is A (marked for re-check), official Blizzard text B, published guides and community sources C,
// Classic references E.
function gradeOfChange(x) {
  if (x.status === "pinned-data") return "A";
  const kinds = x.sources.map(n => g.sources[n].kind);
  if (kinds.includes("official")) return "B";
  if (kinds.some(k => k === "forever-guide" || k === "community" || k === "licensed-data")) return "C";
  return "E";
}
const buildOf = grade => grade === "A" ? "1.60.1.70425 talent snapshot (16 Oct 2026)" : grade === "D" || grade === "E" ? "Classic 1.12 reference" : "WoW: Forever (launch 4 Nov 2026)";

function factStore(file) {
  const facts = [], byKey = new Map(), ids = new Set();
  return {
    facts,
    add(from, f) {
      const key = JSON.stringify([f.label, f.value, f.grade, f.sources, f.note]);
      if (byKey.has(key)) { map.push({ from, to: byKey.get(key), note: "duplicate of an earlier claim" }); return byKey.get(key); }
      let id = file + "." + slug(f.idHint || f.label), n = 2;
      while (ids.has(id)) id = file + "." + slug(f.idHint || f.label) + "-" + n++;
      ids.add(id); byKey.set(key, id);
      const fact = { id, scope: f.scope, topic: f.topic, kind: f.kind || "theory", grade: f.grade, label: f.label, value: f.grade === "U" ? null : f.value };
      if (f.note) fact.note = f.note;
      fact.sources = f.sources.map(sid);
      fact.reviewedAt = REVIEWED; fact.gameBuild = buildOf(f.grade);
      if (f.grade === "A") fact.recheck = RECHECK;
      facts.push(fact); map.push({ from, to: id });
      return id;
    },
  };
}
const claimFact = (store, from, c, scope, topic) => store.add(from, { label: c.label, value: c.value, grade: c.grade, note: c.note, sources: c.sources, scope, topic });
const steps = (from, lines) => lines.map((text, i) => { map.push({ from: from + "[" + i + "]", to: "praxis step" }); return { text }; });
const omitted = (sections, reason) => sections.map(section => ({ section, reason }));
const NOT_WRITTEN = "Not written yet.";

// 1. Sources: the .218 list keeps its order (ids g218-0 ... g218-155); the refreshed talent data is added once.
const sources = g.sources.map((s, n) => ({ id: sid(n), label: s.label, publisher: s.publisher, kind: s.kind, url: s.url, checkedAt: s.checkedAt }));
sources.push({ id: "talents-data", label: "Olympus talent data: Talents Forever export of 10 Nov 2026 (client 1.60.1.70755 with server hotfixes to 10 Nov)",
  publisher: "Talents Forever", kind: "licensed-data", url: "https://talentsforever.com/", checkedAt: TODAY });
write("sources.json", { schema: "olympus-university-sources-v1", note: "g218-<n> is source n of guides218.json; talents-data is the calculator's data.json.", sources });
writePresets(false);

// 2. Classes.
const index = { schema: "olympus-university-index-v1", reviewedAt: TODAY, guides: [] };
const presetsFor = (cls, spec, contexts) => g.presets.filter(p => p.classId === cls && p.specId === spec && contexts.includes(p.context + p.level)).map(p => p.id);
for (const [ci, c] of g.classes.entries()) {
  const file = "class-" + c.id, store = factStore(file), base = "classes[" + ci + "]";
  const changes = c.changes.map((x, i) => store.add(base + ".changes[" + i + "]", {
    idHint: "change-" + (i + 1), label: x.status === "announced" ? "Announced by Blizzard" : x.status === "pinned-data" ? "Talent data" : "Not settled yet",
    value: x.text.replace(/^Talent snapshot, /, ""), grade: gradeOfChange(x), sources: x.sources, scope: { class: c.id }, topic: "class-change",
  }));
  // CL2-203: quests, baseline spells, unconfirmed reports and myths each get their own chapter instead of one list.
  const quests = [], baseline = [], unconfirmed = [], myths = [];
  c.classQuests.forEach((q, i) => {
    const id = store.add(base + ".classQuests[" + i + "]", { label: q.title + " (" + q.levelHint + ")", value: q.note, grade: q.grade, sources: q.sources, scope: { class: c.id }, topic: "class-quest", idHint: "quest-" + q.title });
    if (q.levelHint === "Not applicable") myths.push(id);
    else if (/^No quest needed/.test(q.title)) baseline.push(id);
    else if (q.levelHint === "Unconfirmed" || /no other details were found|Other reports disagree/.test(q.note) || /^Must be /.test(q.title)) unconfirmed.push(id);
    else quests.push(id);
  });
  const classChapters = [
    { id: c.id + "-101-forever-changes", section: "overview", title: "What Forever changes for " + c.name, theory: changes },
    quests.length ? { id: c.id + "-101-class-quests", section: "overview", title: "Class quests", theory: quests } : null,
    baseline.length ? { id: c.id + "-101-baseline-spells", section: "overview", title: "Baseline spells (no quest)", theory: baseline } : null,
    unconfirmed.length ? { id: c.id + "-101-unconfirmed", section: "overview", title: "Unconfirmed quest reports", theory: unconfirmed } : null,
    myths.length ? { id: c.id + "-101-myths", section: "overview", title: "Myths and mix-ups", theory: myths } : null,
  ].filter(Boolean);
  const course = {
    schema: "olympus-university-guide-v1", kind: "class", id: c.id, name: c.name, status: "migrated", reviewedAt: TODAY,
    migratedFrom: "guides218.json classes[" + ci + "] (" + REVIEWED + ")", factFiles: ["common", file, "talents-" + c.id], quizFiles: [],
    overview: { lead: c.overview[0], points: c.overview.slice(1).map(text => ({ text })), facts: [] },
    tracks: {
      101: { summary: "What every " + c.name + " should know before choosing a spec.", chapters: classChapters,
        omitted: omitted(["talents", "rotation", "stat-caps", "gear", "consumables", "macros", "praxis"], "Covered in each spec's course.") },
      201: { summary: "Class-wide intermediate chapters.", chapters: [], omitted: omitted(["overview", "talents", "rotation", "stat-caps", "gear", "consumables", "macros", "praxis"], NOT_WRITTEN) },
      301: { summary: "Class-wide advanced chapters.", chapters: [], omitted: omitted(["overview", "talents", "rotation", "stat-caps", "gear", "consumables", "macros", "praxis"], NOT_WRITTEN) },
    },
    specs: [],
  };
  map.push({ from: base + ".overview", to: "courses/" + c.id + ".json overview" });
  for (const [si, s] of c.specs.entries()) {
    const sb = base + ".specs[" + si + "]", scope = { class: c.id, spec: s.id }, pre = c.id + "-" + s.id;
    const pri = s.pro.priorities.map((x, i) => claimFact(store, sb + ".pro.priorities[" + i + "]", x, scope, s.id + "-priority"));
    const raid = s.pro.raid.map((x, i) => claimFact(store, sb + ".pro.raid[" + i + "]", x, scope, s.id + "-raid"));
    const cons = s.pro.consumables.map((x, i) => claimFact(store, sb + ".pro.consumables[" + i + "]", x, scope, s.id + "-consumable"));
    map.push({ from: sb + ".beginner.summary", to: "courses/" + c.id + ".json spec " + s.id + " overview" });
    map.push({ from: sb + ".whatChanged", to: "talents-" + c.id + "." + s.id + "-summary (recomputed from talents/data.json)" });
    const lvl = presetsFor(c.id, s.id, ["leveling30", "dungeon30"]), end = presetsFor(c.id, s.id, ["raid60", "dungeon60", "pvp60"]);
    s.presets.forEach((id, i) => map.push({ from: sb + ".presets[" + i + "]", to: (lvl.includes(id) ? pre + "-101-talents" : pre + "-201-talents") + " preset " + id }));
    const pvp = [...steps(sb + ".pvp.overview", s.pvp.overview), ...s.pvp.matchups.map((m, i) => { map.push({ from: sb + ".pvp.matchups[" + i + "]", to: "praxis step" }); return { text: "Against " + m.vs + ": " + m.text }; })];
    course.specs.push({
      id: s.id, name: s.name, roles: s.roles,
      overview: { lead: s.beginner.summary[0], points: s.beginner.summary.slice(1).map(text => ({ text })), facts: [] },
      tracks: {
        101: {
          summary: "Leveling, the core rotation and the habits that matter first.",
          chapters: [
            { id: pre + "-101-talents", section: "talents", title: "Leveling and talents", theory: [file.replace("class-", "talents-") + "." + s.id + "-summary"], praxis: { steps: steps(sb + ".beginner.leveling", s.beginner.leveling), mistakes: [] }, ...(lvl.length ? { presets: lvl.slice(0, 4) } : {}) },
            { id: pre + "-101-rotation", section: "rotation", title: "Core rotation", theory: [], praxis: { steps: steps(sb + ".beginner.rotation", s.beginner.rotation), mistakes: [] } },
            ...(s.beginner.tips.length ? [{ id: pre + "-101-tips", section: "rotation", title: "Tips", theory: [], praxis: { steps: steps(sb + ".beginner.tips", s.beginner.tips), mistakes: [] } }] : []),
          ],
          omitted: [...omitted(["overview"], "The spec overview above covers this."), ...omitted(["stat-caps", "gear", "consumables", "praxis"], "Covered in 201."), ...omitted(["macros"], NOT_WRITTEN)],
        },
        201: {
          summary: "Stat priorities, raid duties, consumables and PvP.",
          chapters: [
            ...(end.length ? [{ id: pre + "-201-talents", section: "talents", title: "Level-60 builds", theory: [], presets: end.slice(0, 4) }] : []),
            { id: pre + "-201-priorities", section: "stat-caps", title: "Stat priorities and caps", theory: pri },
            { id: pre + "-201-consumables", section: "consumables", title: "Consumables", theory: cons },
            { id: pre + "-201-raid", section: "praxis", title: "In the raid", theory: raid },
            ...(pvp.length ? [{ id: pre + "-201-pvp", section: "praxis", title: "PvP", theory: [], praxis: { steps: pvp, mistakes: [] } }] : []),
          ],
          omitted: [...omitted(["overview", "rotation", "gear", "macros"], NOT_WRITTEN), ...(end.length ? [] : omitted(["talents"], NOT_WRITTEN))],
        },
        301: { summary: "Advanced theory and min-maxing.", chapters: [], omitted: omitted(["overview", "talents", "rotation", "stat-caps", "gear", "consumables", "macros", "praxis"], NOT_WRITTEN) },
      },
    });
  }
  write("facts/" + file + ".json", { schema: "olympus-university-facts-v1", file, facts: store.facts });
  write("courses/" + c.id + ".json", course);
  index.guides.push({ kind: "class", id: c.id, name: c.name, file: "courses/" + c.id + ".json", status: "migrated", specs: c.specs.map(s => ({ id: s.id, name: s.name, roles: s.roles })) });
}

// 3. Professions.
for (const [pi, p] of g.professions.entries()) {
  const file = "profession-" + p.key, store = factStore(file), base = "professions[" + pi + "]", scope = { profession: p.key };
  const changes = p.changes.map((x, i) => claimFact(store, base + ".changes[" + i + "]", x, scope, "profession-change"));
  const leveling = p.leveling.map((x, i) => claimFact(store, base + ".leveling[" + i + "]", x, scope, "profession-leveling"));
  const raid = p.raidValue.map((x, i) => claimFact(store, base + ".raidValue[" + i + "]", x, scope, "profession-raid"));
  const unknown = p.unknowns.map((text, i) => store.add(base + ".unknowns[" + i + "]", { idHint: "unknown-" + (i + 1), label: "Not known yet", value: null, grade: "U", note: text, sources: [], scope, topic: "profession-unknown" }));
  map.push({ from: base + ".overview", to: "professions/" + p.key + ".json overview" }, { from: base + ".goldNote", to: p.key + "-201-gold praxis step" });
  const guide = {
    schema: "olympus-university-guide-v1", kind: "profession", id: p.key, name: p.name, type: p.type, status: "migrated", reviewedAt: TODAY,
    migratedFrom: "guides218.json professions[" + pi + "] (" + REVIEWED + ")", factFiles: ["common", file], quizFiles: [], pairsWith: p.pairsWith,
    overview: { lead: p.overview[0], points: p.overview.slice(1).map(text => ({ text })), facts: [] },
    tracks: {
      101: { summary: "What the profession makes in Forever and how to level it.",
        chapters: [
          { id: p.key + "-101-changes", section: "overview", title: "What Forever changes", theory: changes },
          { id: p.key + "-101-leveling", section: "overview", title: "Skill ranks, trainers and leveling", theory: leveling },
          ...(unknown.length ? [{ id: p.key + "-101-unknown", section: "overview", title: "Still unknown", theory: unknown }] : []),
        ],
        omitted: [...omitted(["talents"], "Professions have no talent tree."), ...omitted(["rotation"], "Professions have no rotation."), ...omitted(["stat-caps"], "Professions have no stat caps."), ...omitted(["gear", "consumables", "macros", "praxis"], "Covered in 201.")] },
      201: { summary: "Raid value and the market.",
        chapters: [
          { id: p.key + "-201-raid", section: "consumables", title: "Value for the raid", theory: raid },
          { id: p.key + "-201-gold", section: "praxis", title: "Gold and the Auction House", theory: [], praxis: { steps: [{ text: p.goldNote }], mistakes: [] } },
        ],
        omitted: [...omitted(["overview", "gear", "macros"], NOT_WRITTEN), ...omitted(["talents"], "Professions have no talent tree."), ...omitted(["rotation"], "Professions have no rotation."), ...omitted(["stat-caps"], "Professions have no stat caps.")] },
      301: { summary: "Advanced routes and min-maxing.", chapters: [],
        omitted: [...omitted(["overview", "gear", "consumables", "macros", "praxis"], NOT_WRITTEN), ...omitted(["talents"], "Professions have no talent tree."), ...omitted(["rotation"], "Professions have no rotation."), ...omitted(["stat-caps"], "Professions have no stat caps.")] },
    },
  };
  write("facts/" + file + ".json", { schema: "olympus-university-facts-v1", file, facts: store.facts });
  write("professions/" + p.key + ".json", guide);
  index.guides.push({ kind: "profession", id: p.key, name: p.name, type: p.type, file: "professions/" + p.key + ".json", status: "migrated" });
}

// 4. Races: the site's data names five Alliance races. None had a guide in .218, so each starts unwritten.
for (const [id, name] of [["dwarf", "Dwarf"], ["gnome", "Gnome"], ["human", "Human"], ["night-elf", "Night Elf"], ["skyborne", "Skyborne (High Order)"]]) {
  index.guides.push({ kind: "race", id, name, file: null, status: "planned" });
}
map.push({ from: "tools, presets, classSummary", to: "unchanged in guides218.json (tools stay in guides218.js; presets copied to presets/<class>.json)" });
write("index.json", index);
write("build/migration-map.json", { note: "Where each guides218.json path went (generated once by migrate-guides218.cjs).", source: "guides218.json reviewedAt " + REVIEWED, entries: map });
void talents;
