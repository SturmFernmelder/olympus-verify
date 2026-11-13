#!/usr/bin/env node
/* Talent facts and talent questions from talents/data.json (Evergreen Stage 2, 12 Nov 2026).
 * Grade A: every value is the calculator's own rank text for revision 02e1e101d1a5 (10 Nov export), so a question
 * built here can only ask what that data says. Output is deterministic; --check fails when a file is out of date.
 *
 *   node worker/public/static/university/build/generate-talent-facts.cjs          write facts/talents-*.json and quizzes/talents-*.json
 *   node worker/public/static/university/build/generate-talent-facts.cjs --check  exit 1 if any output differs
 *
 * Questions are written only for the classes in QUIZ_CLASSES. A content author adds their class here once its
 * course has the chapters named by chapterFor(), then runs this script. */
"use strict";
const fs = require("node:fs"), path = require("node:path");
const UNI = path.resolve(__dirname, ".."), STATIC = path.resolve(UNI, "..");
const data = JSON.parse(fs.readFileSync(path.join(STATIC, "talents", "data.json"), "utf8"));
const QUIZ_CLASSES = ["warrior"];
const REVIEWED = "2026-11-12", BUILD = data.source.clientBuilds.join(", ") + " (talent data " + data.revision + ", " + data.source.upstreamGenerated + ")";
const chapterFor = (cls, tree, tier) => cls + "-" + tree + "-" + tier + "-talents";
const check = process.argv.includes("--check");
let stale = 0;
// One fact or question per line keeps the files small and their diffs readable.
function out(rel, value) {
  const file = path.join(UNI, rel), list = value.facts ? "facts" : "questions";
  const head = JSON.stringify({ ...value, [list]: [] }).replace(/\[\]\}$/, "");
  const text = head + "[\n" + value[list].map(x => JSON.stringify(x)).join(",\n") + "\n]}\n";
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) { console.log("out of date: " + rel); stale++; } return; }
  fs.writeFileSync(file, text); console.log("wrote " + rel);
}
const plural = (n, one) => n + " " + one + (n === 1 ? "" : "s");
const shortId = (cls, tree, id) => id.startsWith(cls + "-" + tree + "-") ? id.slice(cls.length + tree.length + 2) : id;
// A description's value tokens: numbers with their unit, such as "3%", "15 Rage" is reduced to "15".
const VALUE = /\d+(?:\.\d+)?%?/g;

for (const cls of data.classes) {
  const file = "talents-" + cls.id, facts = [], questions = [];
  const byId = new Map(cls.trees.flatMap(t => t.talents.map(x => [x.id, { ...x, tree: t }])));
  for (const tree of cls.trees) {
    const counts = { new: 0, changed: 0, moved: 0, same: 0 };
    for (const t of tree.talents) if (Object.hasOwn(counts, t.classic && t.classic.status)) counts[t.classic.status]++;
    facts.push({ id: file + "." + tree.id + "-summary", scope: { class: cls.id, spec: tree.id }, topic: "tree-summary",
      label: tree.name + " tree compared with Classic 1.12",
      value: "Compared with Classic 1.12, the " + tree.name + " tree has " + counts.new + " new, " + counts.changed + " changed, " + counts.moved + " moved and " + counts.same + " unchanged talents; " + plural(tree.removedClassic.length, "Classic talent") + " " + (tree.removedClassic.length === 1 ? "is" : "are") + " gone.",
      tree: cls.id + "-" + tree.id });
    for (const t of tree.talents) {
      const sid = file + "." + tree.id + "-" + shortId(cls.id, tree.id, t.id), req = t.requires && byId.get(t.requires);
      facts.push({ id: sid, scope: { class: cls.id, spec: tree.id }, topic: "tree:" + cls.id + "-" + tree.id,
        label: t.name + " (" + tree.name + ")",
        value: t.name + " has " + plural(t.maxRank, "rank") + " and sits on row " + t.row + ", column " + t.column + " of the " + tree.name + " tree." + (req ? " It requires " + req.name + "." : "") + (!t.passive && t.cost ? " In use: " + t.cost.split(" | ").join(", ") + "." : ""),
        talent: t.id });
      t.descriptions.forEach((text, i) => facts.push({ id: sid + ".r" + (i + 1), scope: { class: cls.id, spec: tree.id }, topic: "talent:" + t.id,
        label: t.name + " rank " + (i + 1) + " of " + t.maxRank, value: text.replace(/\s+/g, " ").trim(), talent: t.id }));
    }
    if (!QUIZ_CLASSES.includes(cls.id)) continue;
    const scope = "spec:" + cls.id + "-" + tree.id, shape = t => file + "." + tree.id + "-" + shortId(cls.id, tree.id, t.id);
    const others = (t, pick) => tree.talents.filter(o => o !== t && pick(o));
    const take = (list, n, key) => list.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0).slice(0, n);
    for (const t of tree.talents) {
      const id = shape(t), q = (kind, extra) => questions.push({ id: file + "." + tree.id + "-" + shortId(cls.id, tree.id, t.id) + "." + kind, scope, generated: true, ...extra });
      // Prerequisite (101): the distractors are other talents of the same tree.
      if (t.requires && byId.get(t.requires)) {
        const req = byId.get(t.requires), wrong = take(others(t, o => o.id !== req.id && o.row < t.row && !t.name.includes(o.name) && !req.name.includes(o.name)), 3, o => o.row * 10 + o.column);
        if (wrong.length >= 2) {
          const choices = [req.name, ...wrong.map(o => o.name)];
          q("requires", { tier: 101, chapter: chapterFor(cls.id, tree.id, 101), type: "mcq", stem: "Which talent must you take before you can learn " + t.name + "?",
            choices, answer: 0, explanation: t.name + " requires " + req.name + " in the " + tree.name + " tree.", facts: [id], distractorFacts: wrong.map(shape) });
        }
      }
      // Ranks (101) for every talent with more than one rank: the distractors are rank counts other talents have.
      if (t.maxRank > 1) {
        const counts = [...new Set(others(t, o => o.maxRank !== t.maxRank).map(o => o.maxRank))].sort((a, b) => a - b).slice(0, 3);
        if (counts.length >= 2) {
          const pickFor = n => take(others(t, o => o.maxRank === n), 1, o => o.row * 10 + o.column)[0];
          q("ranks", { tier: 101, chapter: chapterFor(cls.id, tree.id, 101), type: "mcq", stem: "How many ranks does " + t.name + " have?",
            choices: [plural(t.maxRank, "rank"), ...counts.map(n => plural(n, "rank"))], answer: 0,
            explanation: t.name + " has " + plural(t.maxRank, "rank") + ".", facts: [id], distractorFacts: counts.map(n => shape(pickFor(n))) });
        }
      }
      // Rank values (201): the final rank's text with its one changing number left out; the distractors are that
      // number at the other ranks. Only talents whose ranks differ in exactly one value are asked about.
      if (t.maxRank > 1) {
        const tokens = t.descriptions.map(d => d.match(VALUE) || []);
        const len = tokens[0].length, same = tokens.every(x => x.length === len);
        const diff = same ? [...Array(len).keys()].filter(i => new Set(tokens.map(x => x[i])).size > 1) : [];
        if (diff.length === 1 && new Set(tokens.map(x => x[diff[0]])).size === t.maxRank) {
          const at = diff[0], last = t.maxRank - 1, text = t.descriptions[last].replace(/\s+/g, " ").trim();
          let n = -1;
          const blanked = text.replace(VALUE, m => (++n === at ? "___" : m));
          const values = tokens.map(x => x[at]), wrongRanks = [...values.keys()].filter(i => i !== last).slice(-3);
          q("value", { tier: 201, chapter: chapterFor(cls.id, tree.id, 201), type: "scenario",
            stem: "You have " + t.name + " at " + t.maxRank + "/" + t.maxRank + ". Its text reads: “" + blanked + "” What goes in the blank?",
            choices: [values[last], ...wrongRanks.map(i => values[i])], answer: 0,
            explanation: "At rank " + t.maxRank + " the text reads: “" + text + "” Lower ranks give " + wrongRanks.map(i => values[i]).join(", ") + ".",
            facts: [id + ".r" + (last + 1)], distractorFacts: wrongRanks.map(i => id + ".r" + (i + 1)) });
        }
      }
    }
  }
  out("facts/" + file + ".json", { schema: "olympus-university-facts-v1", file, note: "Generated by build/generate-talent-facts.cjs from talents/data.json " + data.revision + ". Do not edit by hand.",
    defaults: { kind: "reference", grade: "A", sources: ["talents-data"], reviewedAt: REVIEWED, gameBuild: BUILD }, facts });
  if (QUIZ_CLASSES.includes(cls.id)) out("quizzes/" + file + ".json", { schema: "olympus-university-quiz-v1", file, note: "Generated by build/generate-talent-facts.cjs. Do not edit by hand.", questions });
}
if (check && stale) { console.error(stale + " generated file(s) are out of date: run the script without --check."); process.exit(1); }
