#!/usr/bin/env node
/* The university build check (Evergreen Stage 2, 12 Nov 2026). Run it before every commit that touches
 * worker/public/static/university/:
 *
 *   node scripts/university/validate.cjs           check everything, print a size table
 *   node scripts/university/validate.cjs --quiet   errors only
 *
 * It runs the page's own rules (validate.js) over every file at once, then once per guide with only the files that
 * guide declares (the page loads nothing else), and adds the checks only the build can make: talent facts against
 * talents/data.json, presets against guides218.json, generated files against their generator, and the index. */
"use strict";
const fs = require("node:fs"), path = require("node:path"), cp = require("node:child_process"), zlib = require("node:zlib"), vm = require("node:vm");
// INT-UNI-3 (12 Nov 2026): the build tools live in scripts/university/, outside the published static folder.
const UNI = path.resolve(__dirname, "../../worker/public/static/university"), STATIC = path.resolve(UNI, "..");
// worker/package.json makes .js files ES modules, so the shared rules file is run in a sandbox with a CommonJS module.
const rules = (() => { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(UNI, "validate.js"), "utf8"), { module }, { filename: "validate.js" }); return module.exports; })();
const quiet = process.argv.includes("--quiet");
const errors = [];
const read = rel => JSON.parse(fs.readFileSync(path.join(UNI, rel), "utf8"));
const exists = rel => fs.existsSync(path.join(UNI, rel));

const data = JSON.parse(fs.readFileSync(path.join(STATIC, "talents", "data.json"), "utf8"));
const g218 = JSON.parse(fs.readFileSync(path.join(STATIC, "guides218.json"), "utf8"));
const talents = new Map();
for (const c of data.classes) for (const t of c.trees) for (const x of t.talents) talents.set(x.id, { ...x, tree: c.id + "-" + t.id });

const index = read("index.json");
const sources = read("sources.json");
const listDir = dir => fs.readdirSync(path.join(UNI, dir)).filter(f => f.endsWith(".json")).sort();
const factFiles = listDir("facts").map(f => read("facts/" + f));
const quizFiles = listDir("quizzes").map(f => read("quizzes/" + f));
factFiles.forEach((doc, i) => { if (doc.file + ".json" !== listDir("facts")[i]) errors.push("facts/" + listDir("facts")[i] + ": file must equal the name"); });
quizFiles.forEach((doc, i) => { if (doc.file + ".json" !== listDir("quizzes")[i]) errors.push("quizzes/" + listDir("quizzes")[i] + ": file must equal the name"); });

// Index: every listed guide exists, every guide file is listed, races are only those the site's data names.
const RACES = new Map([["dwarf", "Dwarf"], ["gnome", "Gnome"], ["human", "Human"], ["night-elf", "Night Elf"], ["skyborne", "Skyborne (High Order)"]]);
if (index.schema !== "olympus-university-index-v1" || !Array.isArray(index.guides)) errors.push("index.json: schema");
const guides = [];
for (const entry of index.guides || []) {
  const where = "index " + entry.kind + " " + entry.id;
  if (entry.kind === "race" && !RACES.has(entry.id)) errors.push(where + ": not one of the Alliance races the site's data names");
  if (entry.status === "planned") { if (entry.file !== null) errors.push(where + ": a planned guide has file null"); continue; }
  if (!entry.file || !exists(entry.file)) { errors.push(where + ": file " + entry.file + " is missing"); continue; }
  const guide = read(entry.file);
  if (guide.kind !== entry.kind || guide.id !== entry.id || guide.name !== entry.name || guide.status !== entry.status) errors.push(where + ": index entry and file disagree (kind, id, name, status)");
  if (entry.kind === "class" && JSON.stringify((guide.specs || []).map(s => ({ id: s.id, name: s.name, roles: s.roles }))) !== JSON.stringify(entry.specs)) errors.push(where + ": index specs and file disagree");
  guides.push({ entry, guide });
}
const listed = new Set((index.guides || []).map(e => e.file).filter(Boolean));
for (const dir of ["courses", "races", "professions"]) for (const f of listDir(dir)) if (!listed.has(dir + "/" + f)) errors.push(dir + "/" + f + ": not listed in index.json");

// Presets: an exact copy of guides218.json, per class.
for (const c of g218.classes) {
  const rel = "presets/" + c.id + ".json";
  if (!exists(rel)) { errors.push(rel + ": missing (run scripts/university/migrate-guides218.cjs --presets)"); continue; }
  const doc = read(rel), want = g218.presets.filter(p => p.classId === c.id);
  if (JSON.stringify(doc.presets) !== JSON.stringify(want) || doc.talentRevision !== g218.talentRevision) errors.push(rel + ": differs from guides218.json (run scripts/university/migrate-guides218.cjs --presets)");
}

// Generated files are current.
const gen = cp.spawnSync(process.execPath, [path.join(__dirname, "generate-talent-facts.cjs"), "--check"], { encoding: "utf8" });
if (gen.status !== 0) errors.push("generated talent files are out of date:\n" + gen.stdout + gen.stderr);

// Everything at once: global id uniqueness, the honesty rules and the talent table.
const all = rules.validateBundle({ sources, factFiles, guides: guides.map(x => x.guide), quizFiles, presets: { schema: "olympus-university-presets-v1", presets: g218.presets } },
  { talents, revision: data.revision });
errors.push(...all.errors);
for (const f of all.facts.values()) {
  if (f.tree !== undefined && !data.classes.some(c => c.trees.some(t => c.id + "-" + t.id === f.tree))) errors.push("fact " + f.id + ": tree " + f.tree + " is not in talents/data.json");
}

// Once per guide, with only what that page loads.
const sizes = [];
const bytes = rel => fs.readFileSync(path.join(UNI, rel));
for (const { entry, guide } of guides) {
  const files = ["index.json", "sources.json", entry.file, ...guide.factFiles.map(f => "facts/" + f + ".json"), ...guide.quizFiles.map(f => "quizzes/" + f + ".json")];
  if (entry.kind === "class") files.push("presets/" + entry.id + ".json");
  const missing = files.filter(f => !exists(f));
  if (missing.length) { errors.push(entry.kind + " " + entry.id + ": declares missing files " + missing.join(", ")); continue; }
  const own = rules.validateBundle({ sources, factFiles: guide.factFiles.map(f => read("facts/" + f + ".json")), guides: [guide],
    quizFiles: guide.quizFiles.map(f => read("quizzes/" + f + ".json")), presets: entry.kind === "class" ? read("presets/" + entry.id + ".json") : undefined });
  errors.push(...own.errors.map(e => entry.kind + " " + entry.id + " (own files): " + e));
  const raw = files.reduce((n, f) => n + bytes(f).length, 0), gz = files.reduce((n, f) => n + zlib.gzipSync(bytes(f)).length, 0);
  sizes.push([entry.kind + " " + entry.id, guide.status, own.questions.length, Math.round(raw / 1024), Math.round(gz / 1024)]);
}
// The exam index: index.json lists, per guide, every exam with its question count, computed with the page's own pool
// rule from the questions that guide's page loads. --write-exams rewrites the lists; otherwise a stale list fails.
let examsChanged = false;
for (const { entry, guide } of guides) {
  const own = rules.validateBundle({ sources, factFiles: guide.factFiles.filter(f => exists("facts/" + f + ".json")).map(f => read("facts/" + f + ".json")), guides: [guide],
    quizFiles: guide.quizFiles.filter(f => exists("quizzes/" + f + ".json")).map(f => read("quizzes/" + f + ".json")), presets: entry.kind === "class" && exists("presets/" + entry.id + ".json") ? read("presets/" + entry.id + ".json") : undefined });
  const want = rules.examCatalogue(guide, own.questions);
  if (JSON.stringify(entry.exams) !== JSON.stringify(want)) {
    if (process.argv.includes("--write-exams")) { entry.exams = want; examsChanged = true; }
    else errors.push("index " + entry.kind + " " + entry.id + ": exams list is out of date (run scripts/university/validate.cjs --write-exams)");
  }
  // Chapter counts for the hub's status line (review, 12 Nov 2026: the hub must say what the courses hold, not more):
  // written chapters, and the chapters not available yet per track 101, 201, 301.
  const counts = { written: 0, waiting: [0, 0, 0] };
  for (const owner of [guide, ...(guide.specs || [])]) rules.TRACKS.forEach(([tier], i) => {
    for (const ch of ((owner.tracks || {})[tier] || { chapters: [] }).chapters) { if (ch.unavailable !== undefined) counts.waiting[i]++; else counts.written++; }
  });
  if (JSON.stringify(entry.chapters) !== JSON.stringify(counts)) {
    if (process.argv.includes("--write-exams")) { entry.chapters = counts; examsChanged = true; }
    else errors.push("index " + entry.kind + " " + entry.id + ": chapter counts are out of date (run scripts/university/validate.cjs --write-exams)");
  }
}
if (examsChanged) { fs.writeFileSync(path.join(UNI, "index.json"), JSON.stringify(index, null, 1) + "\n"); console.log("index.json: exam lists and chapter counts rewritten"); }

// Quiz questions must belong to a guide that lists their file.
for (const doc of quizFiles) if (!guides.some(x => x.guide.quizFiles.includes(doc.file))) errors.push("quizzes/" + doc.file + ".json: no guide lists it in quizFiles");

if (!quiet) {
  console.log("guide".padEnd(26) + "status".padEnd(10) + "questions".padStart(10) + "KB".padStart(7) + "KB gz".padStart(8));
  for (const [name, status, q, kb, gz] of sizes) console.log(name.padEnd(26) + status.padEnd(10) + String(q).padStart(10) + String(kb).padStart(7) + String(gz).padStart(8));
  console.log(all.facts.size + " facts, " + all.questions.length + " questions, " + all.sources.size + " sources.");
}
if (errors.length) { console.error(errors.length + " problem(s):\n" + errors.map(e => "  - " + e).join("\n")); process.exit(1); }
console.log("university: valid");
