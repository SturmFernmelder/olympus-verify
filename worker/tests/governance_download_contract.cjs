// R6 public downloads: exact accepted bytes, bounded archive CRC/payload contract and actual h()/add() quicklink attributes.
// Stdlib only. The isolated CLI uses candidate files; governance_test.cjs calls the same checks after integration.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib"), vm = require("vm");
const PAYLOADS = [
  {
    "name": "Olympus Guild Governance - Successor Draft.html",
    "bytes": 156302,
    "sha256": "8144d60d4affb525af68fbcf4ca82df9a482a57d1cae6c424c3c9a680f0cb586"
  },
  {
    "name": "Olympus Guild Governance - Successor Source.txt",
    "bytes": 116006,
    "sha256": "dc250be085cd89c9ddb0e4dd6029d7392898e73a7df893657670e44c65d367ca"
  },
  {
    "name": "Olympus Organisation - Successor Draft.png",
    "bytes": 1056712,
    "sha256": "d504e6732e6ccf5c9454905ee9e908cee11da6189d95ecdd88a2d94bbdc7d026"
  },
  {
    "name": "Olympus Organisation - Successor Draft.svg",
    "bytes": 32194,
    "sha256": "17cc76c45af4fa13403f5bb33a14b60f4cfd306ffdfbd269d8cc51f87eb197c9"
  },
  {
    "name": "pdf/Olympus Guild Governance - Successor Draft.pdf",
    "bytes": 1361567,
    "sha256": "8bbd9517272718991823aad15920a6ff0250f452a7affbd9141eee3f5129e6de"
  }
];
const PDF = { bytes: 1361567, sha256: "8bbd9517272718991823aad15920a6ff0250f452a7affbd9141eee3f5129e6de" };
const ZIP = { bytes: 2081840, sha256: "7ead7b97d80477aa607ab13c419c527b25ff2c4be1ede79da51cca5ca4b5f0ed" };
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function inspectZip(bytes) {
  if (bytes.length > 3000000 || bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw Error("ZIP size/magic");
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) throw Error("ZIP EOCD/disks");
  const count = bytes.readUInt16LE(eocd + 10), cdSize = bytes.readUInt32LE(eocd + 12), cdStart = bytes.readUInt32LE(eocd + 16);
  if (count !== 5 || bytes.readUInt16LE(eocd + 8) !== count || cdStart + cdSize !== eocd) throw Error("ZIP closed census");
  const entries = []; let pos = cdStart, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > eocd || bytes.readUInt32LE(pos) !== 0x02014b50) throw Error("ZIP central header");
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10), crc = bytes.readUInt32LE(pos + 16);
    const compressed = bytes.readUInt32LE(pos + 20), size = bytes.readUInt32LE(pos + 24), nl = bytes.readUInt16LE(pos + 28), xl = bytes.readUInt16LE(pos + 30), cl = bytes.readUInt16LE(pos + 32), local = bytes.readUInt32LE(pos + 42);
    if (flags !== 0 || method !== 8 || size > 2000000 || compressed > 3000000 || pos + 46 + nl + xl + cl > eocd || bytes.readUInt16LE(pos + 34) !== 0) throw Error("ZIP bounded entry");
    const name = bytes.subarray(pos + 46, pos + 46 + nl).toString("utf8");
    const expected = PAYLOADS.find((entry) => entry.name === name);
    if (!expected || entries.some((entry) => entry.name === name) || size !== expected.bytes) throw Error("ZIP payload name/size");
    if (local + 30 > cdStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== size) throw Error("ZIP local parity");
    const lnl = bytes.readUInt16LE(local + 26), lxl = bytes.readUInt16LE(local + 28), start = local + 30 + lnl + lxl;
    if (start + compressed > cdStart || bytes.subarray(local + 30, local + 30 + lnl).toString("utf8") !== name) throw Error("ZIP local path/bounds");
    const data = zlib.inflateRawSync(bytes.subarray(start, start + compressed), { maxOutputLength: size + 1 });
    if (data.length !== size || crc32(data) !== crc || sha(data) !== expected.sha256) throw Error("ZIP CRC/payload mismatch");
    total += size;
    if (total > 5000000) throw Error("ZIP aggregate output cap");
    entries.push({ name, data, centralOffset: pos });
    pos += 46 + nl + xl + cl;
  }
  if (pos !== eocd || entries.length !== PAYLOADS.length) throw Error("ZIP final census");
  return entries;
}
function renderedQuicklinks(app) {
  const hs = app.indexOf("  function h(tag, props, ...kids) {"), he = app.indexOf("  const clear = ", hs);
  const start = app.indexOf('      h("nav", { class: "governance-quicklinks", "aria-label": "Start reading" },');
  const endLine = '        h("a", { class: "btn small", href: GOVERNANCE_BOOK, download: "Olympus Governance R6.md", text: "Download the exact source" })),';
  const end = app.indexOf(endLine, start);
  if (hs < 0 || he < 0 || start < 0 || end < 0 || app.indexOf(endLine, end + 1) >= 0) throw Error("Unique actual h/quicklinks context");
  class Node { constructor() { this.childNodes = []; } appendChild(child) { this.childNodes.push(child); return child; } }
  class Element extends Node { constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.attributes = {}; } setAttribute(k, v) { this.attributes[k] = String(v); } getAttribute(k) { return this.attributes[k] ?? null; } }
  const document = { createElement: (tag) => new Element(tag), createTextNode: (text) => Object.assign(new Node(), { textContent: String(text) }) };
  // Execute only the exact current h/add functions and literal public navigation expression, never the app boot/API routes.
  const code = app.slice(hs, he) + '\nconst GOVERNANCE_BOOK = "/static/governance/reconciled-book.md";\n(' + app.slice(start, end + endLine.length).trim().replace(/,$/, "") + ')';
  const nav = vm.runInNewContext(code, { document, Node }, { timeout: 1000 });
  if (!(nav instanceof Element) || nav.tagName !== "NAV") throw Error("Navigation element");
  return nav.childNodes.filter((node) => node.tagName === "A");
}
function runChecks(workerRoot = path.join(__dirname, "..")) {
  const dir = path.join(workerRoot, "public/static/governance"), app = fs.readFileSync(path.join(workerRoot, "public/static/app.js"), "utf8");
  const pdf = fs.readFileSync(path.join(dir, "olympus-governance-r6.pdf")), zip = fs.readFileSync(path.join(dir, "olympus-governance-r6.zip"));
  const checks = [], check = (name, passed) => checks.push({ name, passed: !!passed });
  check("R6 public PDF has exact accepted size and SHA256", pdf.length === PDF.bytes && sha(pdf) === PDF.sha256);
  check("R6 public PDF has PDF magic and EOF", pdf.subarray(0, 5).toString("ascii") === "%PDF-" && pdf.subarray(-128).includes(Buffer.from("%%EOF")));
  check("R6 public ZIP has exact accepted size, SHA256 and ZIP magic", zip.length === ZIP.bytes && sha(zip) === ZIP.sha256 && zip.readUInt32LE(0) === 0x04034b50);
  const entries = inspectZip(zip);
  check("ZIP closed five-entry census, every CRC and exact accepted payload hash passes", entries.length === 5);
  check("ZIP PDF payload is byte-identical to standalone public PDF", entries.find((entry) => entry.name.endsWith(".pdf")).data.equals(pdf));
  const book = entries.find((entry) => entry.name.endsWith("Source.txt")).data;
  check("ZIP source remains exact 116006-byte reviewed R6, not a rewritten book", book.length === 116006 && sha(book) === "dc250be085cd89c9ddb0e4dd6029d7392898e73a7df893657670e44c65d367ca");
  const links = renderedQuicklinks(app);
  const download = (label, href, filename) => links.filter((link) => link.textContent === label && link.getAttribute("href") === href && link.getAttribute("download") === filename).length === 1;
  check("actual h/add renders Download PDF with correct public href and download filename", download("Download PDF", "/static/governance/olympus-governance-r6.pdf", "Olympus Guild Governance - Successor Draft.pdf"));
  check("actual h/add renders Download full package with correct href and filename", download("Download full package", "/static/governance/olympus-governance-r6.zip", "Olympus Governance - Successor Draft.zip"));
  check("existing source-download and all four reading/chart links remain", links.length === 7 && links.filter((link) => link.getAttribute("href") === "/static/governance/reconciled-book.md").length === 1 && ["Start here", "Adoption checklist", "Appointment templates", "Interactive organization"].every((label) => links.some((link) => link.textContent === label)));
  check("public draft/unissued-appointment notice remains explicit", app.includes("R6 • Public draft for ratification") && app.includes("Publication is not adoption.") && app.includes("issues no appointments or warrants"));
  const bad = Buffer.from(zip); bad.writeUInt32LE((bad.readUInt32LE(entries[0].centralOffset + 16) ^ 1) >>> 0, entries[0].centralOffset + 16);
  let crcRejected = false; try { inspectZip(bad); } catch { crcRejected = true; }
  check("negative archive control rejects changed central CRC", crcRejected);
  const wrong = renderedQuicklinks(app.replace('download: "Olympus Guild Governance - Successor Draft.pdf"', 'download: "wrong.pdf"'));
  check("negative UI control detects wrong PDF download filename", !wrong.some((link) => link.textContent === "Download PDF" && link.getAttribute("download") === "Olympus Guild Governance - Successor Draft.pdf"));
  return checks;
}
module.exports = { runChecks };
if (require.main === module) {
  try { const checks = runChecks(); for (const check of checks) console.log((check.passed ? "PASS " : "FAIL ") + check.name); console.log(checks.filter((check) => check.passed).length + "/" + checks.length + " passed"); process.exit(checks.every((check) => check.passed) ? 0 : 1); }
  catch (error) { console.error("FAIL R6 download contract: " + error.message); process.exit(1); }
}
