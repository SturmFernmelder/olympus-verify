// Owner .198 direction (25 October 2026): keep the authored five-Title codex
// identical in the member reader. Historical R6 downloads are never inputs or outputs.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.join(__dirname, ".."), sourcePath = path.join(root, "docs/master198-governance-titles.md");
const bookPath = path.join(root, "worker/public/static/governance/reconciled-book.md");
const modelPath = path.join(root, "worker/public/static/governance/organization.json");
const firstTitle = "# Title I — The Sovereign & Royal Decrees\n", nextChapter = "# Daily Guild News\n";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function projection(book, source) {
  if (source.includes("\r") || book.includes("\r") || !source.startsWith(firstTitle)) throw Error("Expected LF authored governance sources");
  if ((source.match(/^# Title /gm) || []).length !== 5 || (source.match(/^## Article [IVX]+\.\d+ — /gm) || []).length !== 27 || (source.match(/^### Section [IVX]+\.\d+\.\d+ — /gm) || []).length !== 54) throw Error("Unexpected five-Title structural census");
  const end = book.indexOf(nextChapter), start = book.indexOf(firstTitle);
  if (end < 0 || book.indexOf(nextChapter, end + 1) >= 0 || (start >= 0 && (start > end || book.indexOf(firstTitle, start + 1) >= 0))) throw Error("Ambiguous governance insertion boundary");
  const result = book.slice(0, start < 0 ? end : start) + source.trimEnd() + "\n\n" + book.slice(end);
  const bytes = Buffer.from(result, "utf8");
  if (bytes.length > 262144 || (result.match(/^# /gm) || []).length !== 20) throw Error("Governance reader size or chapter bound");
  return { text: result, bytes: bytes.length, sha256: sha256(bytes) };
}
function run(mode) {
  const book = fs.readFileSync(bookPath, "utf8"), source = fs.readFileSync(sourcePath, "utf8");
  const expected = projection(book, source), model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const supplement = { source: "docs/master198-governance-titles.md", recordedAt: "2026-10-25", authority: "explicit owner Build .198 direction", titles: 5, articles: 27, sections: 54, constitutionalVoteRecorded: false, namedSignaturesClaimed: false, permissionsApplied: false };
  if (mode === "--write") {
    fs.writeFileSync(bookPath, expected.text, "utf8");
    model.book.bytes = expected.bytes; model.book.sha256 = expected.sha256;
    model.statutoryExpansion = supplement;
    fs.writeFileSync(modelPath, JSON.stringify(model, null, 2) + "\n", "utf8");
  } else if (expected.text !== book || model.book.bytes !== expected.bytes || model.book.sha256 !== expected.sha256 || JSON.stringify(model.statutoryExpansion) !== JSON.stringify(supplement)) throw Error("Governance Titles projection or model pins differ; run --write");
  console.log(JSON.stringify({ mode, chapters: 20, titles: 5, articles: 27, sections: 54, bytes: expected.bytes, sha256: expected.sha256 }));
}
if (require.main === module) {
  if (process.argv.length !== 3 || !["--check", "--write"].includes(process.argv[2])) throw Error("Use --check or --write");
  run(process.argv[2]);
}
module.exports = { projection };
