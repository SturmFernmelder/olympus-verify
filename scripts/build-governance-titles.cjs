// Owner .199 direction (25 October 2026): keep the authored five-Title codex
// identical in the member reader. Historical R6 downloads are never inputs or outputs.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.join(__dirname, ".."), sourcePath = path.join(root, "docs/master199-governance-titles.md");
const bookPath = path.join(root, "worker/public/static/governance/reconciled-book.md");
const modelPath = path.join(root, "worker/public/static/governance/organization.json");
const charterPath = path.join(root, "worker/public/static/governance/operational-charter.md");
const bridge = require("../docs/governance-rank-bridge199.json");
const firstTitle = "# Title I — The Sovereign & Royal Decrees\n", nextChapter = "# Daily Guild News\n";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
// .204: the owner authorized eight finite factual corrections, not a new baseline.
// Compose their exact inverse with the original17 rank bridge to retain every prior byte.
const factsBytes = fs.readFileSync(path.join(root, "docs/governance-facts204.json"));
if (sha256(factsBytes) !== "b510426c726d014b471b993b73a5f71a5eee6b6d2c96672a7c592ff9b055e2b5") throw Error("Governance204 finite facts manifest digest");
const facts = JSON.parse(factsBytes);
const presentationBytes218 = fs.readFileSync(path.join(root, "docs/governance-presentation218.json"));
if (sha256(presentationBytes218) !== "ece2d3d5f8ca5281949fea77d0cf281a5cdda5b8cf5ae54898ecd26d6d276e4c") throw Error("Governance218 finite presentation manifest digest");
const presentation218 = JSON.parse(presentationBytes218);
function presentationBridge218(text, inverse = false) {
  if (presentation218.schema !== "olympus-governance-presentation218-v1" || presentation218.changes.length !== 1 || presentation218.changes[0].key !== "rc9-officer-principles") throw Error("Governance218 presentation census");
  const change = presentation218.changes[0], before = "\n\n" + change.before + "\n\n", after = "\n\n" + change.after + "\n\n";
  const oldCount = text.split(before).length - 1, newCount = text.split(after).length - 1;
  if (oldCount === 1 && newCount === 0) return inverse ? text : text.replace(before, after);
  if (oldCount === 0 && newCount === 1) return inverse ? text.replace(after, before) : text;
  throw Error("Ambiguous governance218 presentation paragraph");
}
function factsBridge(text, inverse = false, keys = null) {
  if (facts.schema !== "governance-fact204-finite-source-delta-v1" || facts.base !== "c9ccc3358ff4e0b538348b58371f22c4eeedb08e"
    || facts.changes.length !== 8 || new Set(facts.changes.map(change => change.key)).size !== 8) throw Error("Governance204 finite facts census");
  const changes = facts.changes.filter(change => !keys || keys.includes(change.key));
  for (const change of inverse ? changes.slice().reverse() : changes) {
    const before = "\n\n" + change.before + "\n\n", after = "\n\n" + change.after + "\n\n";
    const beforeCount = text.split(before).length - 1, afterCount = text.split(after).length - 1;
    // Insertions retain an entire old paragraph inside their longer replacement.
    // Discount that one nested match; another independent occurrence still refuses.
    const oldOnly = beforeCount - (after.includes(before) ? afterCount : 0);
    const newOnly = afterCount - (before.includes(after) ? beforeCount : 0);
    if (oldOnly === 1 && newOnly === 0) { if (!inverse) text = text.replace(before, after); }
    else if (oldOnly === 0 && newOnly === 1) { if (inverse) text = text.replace(after, before); }
    else throw Error("Ambiguous governance204 factual paragraph: " + change.key);
  }
  return text;
}
function rankBridge(text, inverse = false, keys = null) {
  if (bridge.schema !== "olympus-governance-rank-bridge199-v1" || bridge.changes.length !== 17 || new Set(bridge.changes.map(change => change.key)).size !== 17) throw Error("Governance rank-bridge census");
  for (const change of bridge.changes.filter(change => !keys || keys.includes(change.key))) {
    const before = "\n\n" + (inverse ? change.after : change.before) + "\n\n", after = "\n\n" + (inverse ? change.before : change.after) + "\n\n";
    const beforeCount = text.split(before).length - 1, afterCount = text.split(after).length - 1;
    if (beforeCount === 1 && afterCount === 0) text = text.replace(before, after);
    else if (beforeCount !== 0 || afterCount !== 1) throw Error("Ambiguous governance rank-bridge paragraph: " + change.key);
  }
  return text;
}
function projection(book, source) {
  if (source.includes("\r") || book.includes("\r") || !source.startsWith(firstTitle)) throw Error("Expected LF authored governance sources");
  if ((source.match(/^# Title /gm) || []).length !== 5 || (source.match(/^## Article [IVX]+\.\d+ — /gm) || []).length !== 36 || (source.match(/^### Section [IVX]+\.\d+\.\d+ — /gm) || []).length !== 72 || (source.match(/^\([a-d]\) /gm) || []).length !== 147) throw Error("Unexpected five-Title structural census");
  const uncorrected = factsBridge(book, true);
  const end = uncorrected.indexOf(nextChapter), start = uncorrected.indexOf(firstTitle);
  if (end < 0 || uncorrected.indexOf(nextChapter, end + 1) >= 0 || (start >= 0 && (start > end || uncorrected.indexOf(firstTitle, start + 1) >= 0))) throw Error("Ambiguous governance insertion boundary");
  const result = presentationBridge218(factsBridge(rankBridge(uncorrected.slice(0, start < 0 ? end : start) + source.trimEnd() + "\n\n" + uncorrected.slice(end))));
  const bytes = Buffer.from(result, "utf8");
  if (bytes.length > 524288 || (result.match(/^# /gm) || []).length !== 20) throw Error("Governance reader size or chapter bound");
  const currentStart = result.indexOf(firstTitle), currentEnd = result.indexOf(nextChapter, currentStart);
  const originalOutside = Buffer.from(rankBridge(factsBridge(presentationBridge218(result.slice(0, currentStart) + result.slice(currentEnd), true), true), true), "utf8");
  if (originalOutside.length !== bridge.outsideTitlesBaselineBytes || sha256(originalOutside) !== bridge.outsideTitlesBaselineSHA256) throw Error("Governance outside-Titles baseline differs beyond finite owner rank bridge");
  return { text: result, bytes: bytes.length, sha256: sha256(bytes) };
}
function run(mode) {
  const book = fs.readFileSync(bookPath, "utf8"), source = fs.readFileSync(sourcePath, "utf8");
  const expected = projection(book, source), model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const charter = fs.readFileSync(charterPath, "utf8"), charterFacts = ["facts204-04", "facts204-05"];
  const expectedCharter = factsBridge(rankBridge(factsBridge(charter, true, charterFacts), false, ["operational-council-current", "operational-council-not-rank"]), false, charterFacts);
  const supplement = { source: "docs/master199-governance-titles.md", supersedes: "docs/master198-governance-titles.md", recordedAt: "2026-10-30", authority: "explicit owner Master218 direction; prior .199 statutory text retained", titles: 5, articles: 36, sections: 72, subclauses: 147, constitutionalVoteRecorded: false, namedSignaturesClaimed: false, permissionsApplied: false };
  if (mode === "--write" || mode === "--write-book") {
    fs.writeFileSync(bookPath, expected.text, "utf8");
    fs.writeFileSync(charterPath, expectedCharter, "utf8");
    if (mode === "--write") {
      model.book.bytes = expected.bytes; model.book.sha256 = expected.sha256;
      model.statutoryExpansion = supplement;
      fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n", "utf8");
    }
  } else if (expected.text !== book || charter !== expectedCharter || model.book.bytes !== expected.bytes || model.book.sha256 !== expected.sha256 || JSON.stringify(model.statutoryExpansion) !== JSON.stringify(supplement)) throw Error("Governance Titles projection or model pins differ; run --write");
  console.log(JSON.stringify({ mode, chapters: 20, titles: 5, articles: 36, sections: 72, subclauses: 147, bytes: expected.bytes, sha256: expected.sha256, supplement }));
}
if (require.main === module) {
  if (process.argv.length !== 3 || !["--check", "--write", "--write-book"].includes(process.argv[2])) throw Error("Use --check, --write or --write-book");
  run(process.argv[2]);
}
module.exports = { projection, rankBridge, factsBridge, presentationBridge218 };
