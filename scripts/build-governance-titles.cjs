// Publish the current authored Titles in the member reader and derive its public integrity metadata.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const governance = path.join(root, "worker/public/static/governance");

function boundary(text, heading) {
  const pos = text.indexOf(heading);
  if (pos < 0 || (pos > 0 && text[pos - 1] !== "\n") || text.indexOf(heading, pos + 1) >= 0) {
    throw Error("Missing or ambiguous chapter heading: " + heading.trim());
  }
  return pos;
}

function publish(mode) {
  const bookPath = path.join(governance, "reconciled-book.md");
  const charterPath = path.join(governance, "operational-charter.md");
  const modelPath = path.join(governance, "organization.json");
  const readerPath = path.join(root, "worker/public/static/app.js");
  const read = file => fs.readFileSync(file, "utf8");
  const original = read(bookPath);
  const titles = read(path.join(root, "docs/master199-governance-titles.md"));
  const first = "# Title I — The Sovereign & Royal Decrees\n";
  const after = "# Daily Guild News\n";
  const start = boundary(original, first);
  const end = boundary(original, after);
  if (end <= start || boundary(titles, first) !== 0 || titles.includes(after) || titles.includes("\r")) {
    throw Error("Invalid authored Titles section");
  }
  const book = original.slice(0, start) + titles.trimEnd() + "\n\n" + original.slice(end);
  const charterStart = boundary(book, "# Operational Charter — The Work of Olympus\n");
  const charterEnd = boundary(book, "# The Guild Statute of Olympus\n");
  const bytes = Buffer.byteLength(book);
  if (charterEnd <= charterStart || bytes > 524288) throw Error("Invalid charter bounds or reader size");
  const charter = book.slice(charterStart, charterEnd).trimEnd() + "\n";
  const hash = crypto.createHash("sha256").update(book).digest("hex");
  const outputs = [[bookPath, book], [charterPath, charter]];
  if (mode !== "--write-book") {
    const model = JSON.parse(read(modelPath));
    model.book.bytes = bytes;
    model.book.sha256 = hash;
    const reader = read(readerPath);
    function setConstant(source, pattern, value) {
      if ((source.match(pattern) || []).length !== 1) throw Error("Missing or ambiguous reader integrity setting");
      return source.replace(pattern, value);
    }
    const pinned = setConstant(reader, /const GOVERNANCE_SHA256 = "[a-f0-9]{64}";/g, 'const GOVERNANCE_SHA256 = "' + hash + '";');
    outputs.push([modelPath, JSON.stringify(model, null, 2) + "\n"], [readerPath, setConstant(pinned, /const GOVERNANCE_BYTES = \d+;/g, "const GOVERNANCE_BYTES = " + bytes + ";")]);
  }
  for (const [file, content] of outputs) {
    if (read(file) === content) continue;
    if (mode === "--check") throw Error("Regenerate the governance reader: " + path.relative(root, file));
    fs.writeFileSync(file, content);
  }
  console.log(JSON.stringify({ mode, bytes, sha256: hash }));
}

if (require.main === module) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || !["--check", "--write", "--write-book"].includes(mode)) {
    throw Error("Use --check, --write or --write-book");
  }
  publish(mode);
} else {
  // Dated diagnostics still import the inverses for their own recorded editions.
  module.exports = require("./governance-historical-projections.cjs");
}
