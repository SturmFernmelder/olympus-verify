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
  if ((source.match(/^# Title /gm) || []).length !== 5 || (source.match(/^## Article [IVX]+\.\d+ — /gm) || []).length !== 34 || (source.match(/^### Section [IVX]+\.\d+\.\d+ — /gm) || []).length !== 68 || (source.match(/^\([a-d]\) /gm) || []).length !== 138) throw Error("Unexpected five-Title structural census");
  const end = book.indexOf(nextChapter), start = book.indexOf(firstTitle);
  if (end < 0 || book.indexOf(nextChapter, end + 1) >= 0 || (start >= 0 && (start > end || book.indexOf(firstTitle, start + 1) >= 0))) throw Error("Ambiguous governance insertion boundary");
  const result = rankBridge(book.slice(0, start < 0 ? end : start) + source.trimEnd() + "\n\n" + book.slice(end));
  const bytes = Buffer.from(result, "utf8");
  if (bytes.length > 262144 || (result.match(/^# /gm) || []).length !== 20) throw Error("Governance reader size or chapter bound");
  const currentStart = result.indexOf(firstTitle), currentEnd = result.indexOf(nextChapter, currentStart);
  const originalOutside = Buffer.from(rankBridge(result.slice(0, currentStart) + result.slice(currentEnd), true), "utf8");
  if (originalOutside.length !== bridge.outsideTitlesBaselineBytes || sha256(originalOutside) !== bridge.outsideTitlesBaselineSHA256) throw Error("Governance outside-Titles baseline differs beyond finite owner rank bridge");
  return { text: result, bytes: bytes.length, sha256: sha256(bytes) };
}
function run(mode) {
  const book = fs.readFileSync(bookPath, "utf8"), source = fs.readFileSync(sourcePath, "utf8");
  const expected = projection(book, source), model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const charter = fs.readFileSync(charterPath, "utf8"), expectedCharter = rankBridge(charter, false, ["operational-council-current", "operational-council-not-rank"]);
  const supplement = { source: "docs/master199-governance-titles.md", supersedes: "docs/master198-governance-titles.md", recordedAt: "2026-10-25", authority: "explicit owner Build .199 direction", titles: 5, articles: 34, sections: 68, subclauses: 138, constitutionalVoteRecorded: false, namedSignaturesClaimed: false, permissionsApplied: false };
  if (mode === "--write" || mode === "--write-book") {
    fs.writeFileSync(bookPath, expected.text, "utf8");
    fs.writeFileSync(charterPath, expectedCharter, "utf8");
    if (mode === "--write") {
      model.book.bytes = expected.bytes; model.book.sha256 = expected.sha256;
      model.statutoryExpansion = supplement;
      fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n", "utf8");
    }
  } else if (expected.text !== book || charter !== expectedCharter || model.book.bytes !== expected.bytes || model.book.sha256 !== expected.sha256 || JSON.stringify(model.statutoryExpansion) !== JSON.stringify(supplement)) throw Error("Governance Titles projection or model pins differ; run --write");
  console.log(JSON.stringify({ mode, chapters: 20, titles: 5, articles: 34, sections: 68, subclauses: 138, bytes: expected.bytes, sha256: expected.sha256, supplement }));
}
if (require.main === module) {
  if (process.argv.length !== 3 || !["--check", "--write", "--write-book"].includes(process.argv[2])) throw Error("Use --check, --write or --write-book");
  run(process.argv[2]);
}
module.exports = { projection, rankBridge };
