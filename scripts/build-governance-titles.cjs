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
if (sha256(presentationBytes218) !== "12f8f36ac9a4d42174f465cca5a947b42d26c2e4ed43d47bcd822dad783c6715") throw Error("Governance218 finite presentation manifest digest");
const presentation218 = JSON.parse(presentationBytes218);
function presentationBridge218(text, inverse = false) {
  const keys = ['rc9-officer-principles', 'master218-intake-current-reporting', 'master218-ord02-current-reporting', 'master218-charter-intake-reporting', 'master218-heraldry-intake-separation', 'master218-current-office-census'];
  if (presentation218.schema !== "olympus-governance-presentation218-v1" || JSON.stringify(presentation218.changes.map(change => change.key)) !== JSON.stringify(keys)) throw Error("Governance218 presentation census");
  const intermediateKeys = ['master218-intake-current-reporting', 'master218-ord02-current-reporting'];
  if (JSON.stringify(presentation218.changes.filter(change => Object.hasOwn(change, 'previousAfter')).map(change => change.key)) !== JSON.stringify(intermediateKeys)) throw Error("Governance218 intermediate edition census");
  for (const change of inverse ? presentation218.changes.slice().reverse() : presentation218.changes) {
    const before = "\n\n" + change.before + "\n\n", after = "\n\n" + change.after + "\n\n";
    // Only two pinned P2 reporting paragraphs have a retained intermediate edition.
    // Exactly one complete original, intermediate or current paragraph must exist.
    const variants = [before, after, ...(change.previousAfter === undefined ? [] : ["\n\n" + change.previousAfter + "\n\n"])];
    const matches = variants.map(value => ({ value, count: text.split(value).length - 1 })).filter(row => row.count !== 0);
    if (matches.length !== 1 || matches[0].count !== 1) throw Error("Ambiguous governance218 presentation paragraph: " + change.key);
    text = text.replace(matches[0].value, inverse ? before : after);
  }
  return text;
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
const current222Bytes = fs.readFileSync(path.join(root, 'docs/governance-current222.json'));
if (sha256(current222Bytes) !== 'fa1e6503fbd3a38d0591284621a4d1a9083e3bc620142742d02372197282ae3a') throw Error('Governance222 finite manifest changed');
const current222 = JSON.parse(current222Bytes);
const cabinet224Bytes=fs.readFileSync(path.join(root,'docs/governance-cabinet224-text.json'));
if(sha256(cabinet224Bytes)!=='550fb732a45a1f751ddc7a9992a0f92d2ba9826a86b0d96f6ae7b4e12cb3c0c3')throw Error('Cabinet224 finite text manifest changed');
const cabinet224=JSON.parse(cabinet224Bytes);
function cabinetBridge224(text,inverse=false,scope='book'){
 if(!['book','titles'].includes(scope))return text;
 for(const change of inverse?cabinet224.changes.slice().reverse():cabinet224.changes){
  const before='\n\n'+change.before+'\n\n',after='\n\n'+change.after+'\n\n',a=text.split(before).length-1,b=text.split(after).length-1;
  if(a===1&&b===0){if(!inverse)text=text.replace(before,after);}else if(a===0&&b===1){if(inverse)text=text.replace(after,before);}else throw Error('Ambiguous exact Cabinet224 paragraph');
 }return text;
}
const cabinet228Bytes = fs.readFileSync(path.join(root, 'docs/governance-cabinet228-text.json'));
if (sha256(cabinet228Bytes) !== 'a5b043cf785a6d1bd0f9692b70a5febe9d7b36b5132c6fe119b23406da152841') throw Error('Cabinet228 finite text manifest changed');
const cabinet228 = JSON.parse(cabinet228Bytes);
const currentCopyBytes = fs.readFileSync(path.join(root, 'docs/governance-current-reader-copy228.json'));
if (sha256(currentCopyBytes) !== '1a70754c9ea8ff9d8788eae6789f555b287ff04a95e98c43a6bb884a1c098544') throw Error('Current reader copy manifest changed');
const currentCopy228 = JSON.parse(currentCopyBytes);
// Evergreen Stage 2 editorial reconciliation (12 November 2026): one full copy of each long block, one current
// Council composition, dates instead of build numbers and repaired headings. It changes no rule, amount, eligibility,
// decision or named holder, and leaves every D-numbered register entry verbatim. Whole-paragraph pairs keep each
// earlier edition exactly recoverable, so it is applied last and inverted first.
const evergreen1112Bytes = fs.readFileSync(path.join(root, 'docs/governance-evergreen1112.json'));
if (sha256(evergreen1112Bytes) !== 'b55224c6240cea33dc36de1ce272d17a955b97faedf304c6ef880620238d8a4e') throw Error('Evergreen1112 editorial manifest changed');
const evergreen1112 = JSON.parse(evergreen1112Bytes);

function scopedParagraphBridge(text, inverse, scope, manifest, label) {
  const changes = manifest.changes.filter(change => change.scope.includes(scope) || scope === "outside" && change.scope.includes("book") && !change.scope.includes("titles"));
  for (const change of inverse ? changes.slice().reverse() : changes) {
    const before = '\n\n' + change.before + '\n\n';
    const after = '\n\n' + change.after + '\n\n';
    const beforeCount = text.split(before).length - 1;
    const afterCount = text.split(after).length - 1;
    if (beforeCount === 1 && afterCount === 0) {
      if (!inverse) text = text.replace(before, after);
    } else if (beforeCount === 0 && afterCount === 1) {
      if (inverse) text = text.replace(after, before);
    } else throw Error('Ambiguous ' + label + ' paragraph' + (change.key ? ': ' + change.key : ''));
  }
  return text;
}
function currentBridge222(text, inverse = false, scope = 'book') {
  if (inverse) {
    text = scopedParagraphBridge(text, true, scope, evergreen1112, 'Evergreen1112 editorial');
    text = scopedParagraphBridge(text, true, scope, currentCopy228, 'current reader copy');
    text = cabinetBridge224(scopedParagraphBridge(text, true, scope, cabinet228, 'Cabinet228'), true, scope);
  }
  const applicable = current222.changes.filter(c => scope === 'book' ? c.inBook : scope === 'outside' ? c.inBook && c.scope !== 'titles' : c.scope === scope);
  for (const change of inverse ? applicable.slice().reverse() : applicable) {
    const before = '\n\n' + change.before + '\n\n', after = '\n\n' + change.after + '\n\n';
    const a = text.split(before).length - 1, b = text.split(after).length - 1;
    if (a === 1 && b === 0) { if (!inverse) text = text.replace(before, after); }
    else if (a === 0 && b === 1) { if (inverse) text = text.replace(after, before); }
    else throw Error('Ambiguous finite governance222 paragraph: ' + change.key);
  }
  if (inverse) return text;
  text = scopedParagraphBridge(cabinetBridge224(text, false, scope), false, scope, cabinet228, 'Cabinet228');
  text = scopedParagraphBridge(text, false, scope, currentCopy228, 'current reader copy');
  return scopedParagraphBridge(text, false, scope, evergreen1112, 'Evergreen1112 editorial');
}
function projection(book, source) {
  source = currentBridge222(source, true, 'titles');
  book = currentBridge222(book, true);
  if (source.includes("\r") || book.includes("\r") || !source.startsWith(firstTitle)) throw Error("Expected LF authored governance sources");
  if ((source.match(/^# Title /gm) || []).length !== 5 || (source.match(/^## Article [IVX]+\.\d+ — /gm) || []).length !== 36 || (source.match(/^### Section [IVX]+\.\d+\.\d+ — /gm) || []).length !== 72 || (source.match(/^\([a-d]\) /gm) || []).length !== 147) throw Error("Unexpected five-Title structural census");
  const uncorrected = factsBridge(presentationBridge218(book, true), true);
  const end = uncorrected.indexOf(nextChapter), start = uncorrected.indexOf(firstTitle);
  if (end < 0 || uncorrected.indexOf(nextChapter, end + 1) >= 0 || (start >= 0 && (start > end || uncorrected.indexOf(firstTitle, start + 1) >= 0))) throw Error("Ambiguous governance insertion boundary");
  const result = presentationBridge218(factsBridge(rankBridge(uncorrected.slice(0, start < 0 ? end : start) + source.trimEnd() + "\n\n" + uncorrected.slice(end))));
  const currentStart = result.indexOf(firstTitle), currentEnd = result.indexOf(nextChapter, currentStart);
  const originalOutside = Buffer.from(rankBridge(factsBridge(presentationBridge218(result.slice(0, currentStart) + result.slice(currentEnd), true), true), true), "utf8");
  if (originalOutside.length !== bridge.outsideTitlesBaselineBytes || sha256(originalOutside) !== bridge.outsideTitlesBaselineSHA256) throw Error("Governance outside-Titles baseline differs beyond finite owner rank bridge");
  const finalText = currentBridge222(result), bytes = Buffer.from(finalText, 'utf8');
  if (bytes.length > 524288 || (finalText.match(/^# /gm) || []).length !== 20) throw Error("Governance reader size or chapter bound");
  return { text: finalText, bytes: bytes.length, sha256: sha256(bytes) };
}
function assertAuthoredSource222(source) {
  if (sha256(Buffer.from(currentBridge222(source, true, 'titles'))) !== current222.originalSourceSHA256) throw Error('Governance222 source exceeds finite owner delta');
}
function run(mode) {
  const book = fs.readFileSync(bookPath, "utf8"), source = fs.readFileSync(sourcePath, "utf8");
  assertAuthoredSource222(source);
  const expected = projection(book, source), model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const charter = fs.readFileSync(charterPath, "utf8"), priorCharter = currentBridge222(charter, true, 'charter'), charterFacts = ["facts204-04", "facts204-05"];
  const expectedCharter = currentBridge222(factsBridge(rankBridge(factsBridge(priorCharter, true, charterFacts), false, ["operational-council-current", "operational-council-not-rank"]), false, charterFacts), false, 'charter');
  const supplement = { source: "docs/master199-governance-titles.md", supersedes: "docs/master198-governance-titles.md", recordedAt: "2026-11-01", authority: "explicit owner .222 Council direction; prior statutory text retained through finite inverse", titles: 5, articles: 36, sections: 72, subclauses: 147, constitutionalVoteRecorded: false, namedSignaturesClaimed: false, permissionsApplied: false, previous: {"source":"docs/master199-governance-titles.md","supersedes":"docs/master198-governance-titles.md","recordedAt":"2026-10-25","authority":"explicit owner Build .199 direction","titles":5,"articles":34,"sections":68,"subclauses":138,"constitutionalVoteRecorded":false,"namedSignaturesClaimed":false,"permissionsApplied":false} };
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
// CL2-039 (owner ruling on the organization chart, 13 Nov 2026): the model's reportingLines1113 record is an exact
// finite delta. This undoes it in reverse order and returns the previous model, so the historical graph, term and
// mandate inverses keep working on the earlier edition. A current value that differs from the recorded "after", a
// target that is missing or duplicated, an unknown kind of change or a leftover reference to a removed node refuses.
function restoreReportingLines1113(model) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), record = model && model.reportingLines1113;
  if (!record || record.recordedAt !== "2026-11-13" || record.issue !== "CL2-039" || !Array.isArray(record.changes) || !record.changes.length) throw Error("Reporting1113 record missing");
  const prior = structuredClone(model), removed = new Set();
  const one = (rows, test, label) => { const hit = (rows || []).filter(test); if (hit.length !== 1) throw Error("Reporting1113 target " + label); return hit[0]; };
  for (const change of record.changes.slice().reverse()) {
    if (change.field === "node") {
      const node = one(prior.nodes, n => n.id === change.nodeId, change.nodeId);
      if (change.before !== null || !same(node, change.after)) throw Error("Reporting1113 node differs: " + change.nodeId);
      prior.nodes.splice(prior.nodes.indexOf(node), 1); removed.add(change.nodeId); continue;
    }
    const kinds = [["nodeId", prior.nodes, r => r.id], ["term", prior.terms, r => r.officeKey], ["officeMandate", prior.officeMandates, r => r.title], ["councilSeat", prior.councilComposition && prior.councilComposition.currentSeats, r => r.id]].filter(([k]) => Object.hasOwn(change, k));
    if (kinds.length !== 1 || typeof change.field !== "string" || (kinds[0][0] !== "nodeId" && change.field !== "nodeId")) throw Error("Reporting1113 change kind");
    const [kind, rows, keyOf] = kinds[0], row = one(rows, r => keyOf(r) === change[kind], change[kind]);
    if (!Object.hasOwn(row, change.field) || !same(row[change.field], change.after)) throw Error("Reporting1113 value differs: " + change[kind] + "." + change.field);
    row[change.field] = structuredClone(change.before);
  }
  const refs = [...prior.nodes.flatMap(n => [n.parent, ...n.coordinates, ...(n.alsoReportsTo || [])]), ...prior.terms.map(t => t.nodeId), ...prior.officeMandates.map(o => o.nodeId), ...prior.councilComposition.currentSeats.map(s => s.nodeId)];
  if (refs.some(id => removed.has(id)) || prior.nodes.some(n => Object.hasOwn(n, "alsoReportsTo"))) throw Error("Reporting1113 leftover reference");
  delete prior.reportingLines1113;
  return prior;
}
if (require.main === module) {
  if (process.argv.length !== 3 || !["--check", "--write", "--write-book"].includes(process.argv[2])) throw Error("Use --check, --write or --write-book");
  run(process.argv[2]);
}
module.exports = { projection, rankBridge, factsBridge, presentationBridge218, currentBridge222, assertAuthoredSource222, restoreReportingLines1113 };
