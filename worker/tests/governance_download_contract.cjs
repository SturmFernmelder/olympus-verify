// .154/.174: exact historical R6 downloads, bounded archive CRC/payloads and current R7/closed Archive h()/add() attributes.
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
const EXTRA_DOWNLOADS = [
  ["Historical R6 guide", "olympus-guide-r6.pdf", "Olympus Guild Guide - Draft R6.pdf", 135664, "af79188f5b04adbccd0a2c1d9662728be5165cee1b7d3715400465bca4097013"],
  ["Historical R6 checklist", "olympus-adoption-checklist-r6.pdf", "Olympus Adoption Checklist - Draft R6.pdf", 79878, "fb36006cb9c9c3e11b41ede67c8b6da682dd81254ff1c9d0df708d9bc9d4430c"],
  ["Historical R6 templates", "olympus-templates-r6.pdf", "Olympus Appointment and News Templates - Draft R6.pdf", 81476, "d8bb80fc30c41a3de34d631f4762f0224398af11d81c4c87b857c34f272b087c"],
  ["Release preparation PDF", "olympus-release-preparation.pdf", "Olympus Release Preparation Checklist.pdf", 4661, "ac7ec608e6b4386b01962595f5ca6ed8da9f5246c5c9d9e7f09523c51a7e71c2"]
];
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
  const endLine = '      h("div", { class: "governance-controls" },';
  const end = app.indexOf(endLine, start);
  if (hs < 0 || he < 0 || start < 0 || end < 0 || app.indexOf(endLine, end + 1) >= 0) throw Error("Unique actual h/quicklinks context");
  class Node { constructor() { this.childNodes = []; } appendChild(child) { this.childNodes.push(child); return child; } }
  class Element extends Node { constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.attributes = {}; this.listeners = {}; } setAttribute(k, v) { this.attributes[k] = String(v); } getAttribute(k) { return this.attributes[k] ?? null; } addEventListener(name, handler) { this.listeners[name] = handler; } }
  const document = { createElement: (tag) => new Element(tag), createTextNode: (text) => Object.assign(new Node(), { textContent: String(text) }) };
  // Execute only current h/add and the real navigation plus sibling Archive expressions.
  // Event handlers are retained but never invoked; no application requests or permissions are involved.
  const code = app.slice(hs, he) + '\nconst GOVERNANCE_BOOK = "/static/governance/reconciled-book.md";\n[' + app.slice(start, end).trim().replace(/,$/, "") + ']';
  const nodes = vm.runInNewContext(code, { document, Node }, { timeout: 1000 });
  const [nav, archive] = nodes;
  if (nodes.length !== 2 || !(nav instanceof Element) || nav.tagName !== "NAV" || !(archive instanceof Element) || archive.tagName !== "DETAILS") throw Error("Navigation and Archive elements");
  const descendants = (node, tag) => node.childNodes.flatMap(child => [...(child.tagName === tag ? [child] : []), ...descendants(child, tag)]);
  const currentLinks = descendants(nav, "A"), archiveLinks = descendants(archive, "A");
  return { links: [...currentLinks, ...archiveLinks], currentLinks, archiveLinks, archive, buttons: descendants(nav, "BUTTON") };
}
function runChecks(workerRoot = path.join(__dirname, "..")) {
  const dir = path.join(workerRoot, "public/static/governance"), app = fs.readFileSync(path.join(workerRoot, "public/static/app.js"), "utf8");
  const pdf = fs.readFileSync(path.join(dir, "olympus-governance-r6.pdf")), zip = fs.readFileSync(path.join(dir, "olympus-governance-r6.zip"));
  const checks = [], check = (name, passed) => checks.push({ name, passed: !!passed });
  check("historical R6 PDF has exact accepted size and SHA256", pdf.length === PDF.bytes && sha(pdf) === PDF.sha256);
  check("historical R6 PDF has PDF magic and EOF", pdf.subarray(0, 5).toString("ascii") === "%PDF-" && pdf.subarray(-128).includes(Buffer.from("%%EOF")));
  check("historical R6 ZIP has exact accepted size, SHA256 and ZIP magic", zip.length === ZIP.bytes && sha(zip) === ZIP.sha256 && zip.readUInt32LE(0) === 0x04034b50);
  const entries = inspectZip(zip);
  check("ZIP closed five-entry census, every CRC and exact accepted payload hash passes", entries.length === 5);
  check("ZIP PDF payload is byte-identical to standalone public PDF", entries.find((entry) => entry.name.endsWith(".pdf")).data.equals(pdf));
  const book = entries.find((entry) => entry.name.endsWith("Source.txt")).data;
  check("ZIP source remains exact 116006-byte reviewed R6, not a rewritten book", book.length === 116006 && sha(book) === "dc250be085cd89c9ddb0e4dd6029d7392898e73a7df893657670e44c65d367ca");
  const { links, buttons, currentLinks, archiveLinks, archive } = renderedQuicklinks(app);
  const download = (label, href, filename) => links.filter((link) => link.textContent === label && link.getAttribute("href") === href && link.getAttribute("download") === filename).length === 1;
  check("actual h/add labels the unchanged R6 PDF as historical with its exact download filename", download("Historical R6 PDF", "/static/governance/olympus-governance-r6.pdf", "Olympus Guild Governance - Successor Draft.pdf"));
  check("actual h/add labels the unchanged R6 package as historical with its exact filename", download("Historical R6 package", "/static/governance/olympus-governance-r6.zip", "Olympus Governance - Successor Draft.zip"));
  const readingLinks = [["Start here", "#/governance/reading-and-adopting-this-book"], ["Adoption checklist", "#/governance/adoption-and-office-registers"], ["Appointment templates", "#/governance/3-letters-patent-and-warrants"], ["Interactive organization", "#/organization"], ["Operational charter", "#/governance/operational-charter-the-work-of-olympus"], ["Role & Rank Rosetta Stone", "#/roles/rosetta-stone"], ["Title I · Sovereign", "#/governance/title-i-the-sovereign-royal-decrees"], ["Title II · Council & Court", "#/governance/title-ii-the-high-council-co-guild-master-privy-court"], ["Title III · Treasury", "#/governance/title-iii-the-imperial-treasury-guild-bank-tithe-ledger"], ["Title IV · Grand Alliance", "#/governance/title-iv-the-grand-alliance-concordat"], ["Title V · Artisans & Heralds", "#/governance/title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord"]];
  check("closed eighteen-link census retains eleven exact reading/chart/Title/Rosetta links and the distinct current R7 source download", links.length === 18 && readingLinks.every(([label, href]) => links.filter((link) => link.textContent === label && link.getAttribute("href") === href && link.getAttribute("download") === null).length === 1) && download("Download current R7 source", "/static/governance/reconciled-book.md", "Olympus Governance R7.md"));
  check("current twelve reading/source links stay outside the closed six-download historical Archive", currentLinks.length === 12 && archiveLinks.length === 6 && archive.className === "governance-archive" && archive.getAttribute("open") === null && archive.childNodes.filter(node => node.tagName === "SUMMARY" && node.textContent === "Archive and release records").length === 1 && currentLinks.every(link => !archiveLinks.includes(link)) && archiveLinks.every(link => link.getAttribute("download") !== null && link.getAttribute("href") !== "/static/governance/reconciled-book.md") && readingLinks.every(([label, href]) => currentLinks.some(link => link.textContent === label && link.getAttribute("href") === href)));
  check("current R7 print control is a button with the actual retained click handler", buttons.length === 1 && buttons[0].textContent === "Print current R7 book" && buttons[0].getAttribute("type") === "button" && typeof buttons[0].listeners.click === "function");
  for (const [label, file, filename, bytes, hash] of EXTRA_DOWNLOADS) {
    const data = fs.readFileSync(path.join(dir, file));
    check(label + " has accepted bytes and a matching real download link", data.length === bytes && sha(data) === hash && data.subarray(0, 5).toString("ascii") === "%PDF-" && data.subarray(-128).includes(Buffer.from("%%EOF")) && download(label, "/static/governance/" + file, filename));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "downloads-manifest.json"), "utf8"));
  check("historical PDF manifest retains its original R6 source and unratified/unissued status", manifest.schema === "olympus-governance-downloads-v1" && manifest.sourceSHA256 === PDF.sha256 && manifest.ratified === false && manifest.appointmentsIssued === false && manifest.artifacts.length === 4 && EXTRA_DOWNLOADS.every(([, file, , bytes, hash]) => manifest.artifacts.filter((entry) => entry.file === file && entry.bytes === bytes && entry.sha256 === hash).length === 1));
  const currentBook = fs.readFileSync(path.join(dir, "reconciled-book.md"));
  check("current R7 plus199five-Title and rank-bridge source is exact and distinct from preserved R6", currentBook.length === 259596 && sha(currentBook) === "dd1d8bbf0e5bb0ecc7e27a60ab62ff10e7df3753da7bb7f2e38b3927e46a3b97" && !currentBook.equals(book));
  check("current R7 adoption notice separates appointments, signatures, permissions and historical status", app.includes("R7 • Guild rules adopted 13 October 2026") && app.includes("Adoption issues no individual appointment or named signature") && app.includes("changes no native rank, bank limit or platform permission") && app.includes("Dated archives retain their historical status"));
  check("current governance loader sends same-origin credentials for private book/model delivery", app.includes('fetch(path, { credentials: "same-origin", redirect: "error" })'));
  const bad = Buffer.from(zip); bad.writeUInt32LE((bad.readUInt32LE(entries[0].centralOffset + 16) ^ 1) >>> 0, entries[0].centralOffset + 16);
  let crcRejected = false; try { inspectZip(bad); } catch { crcRejected = true; }
  check("negative archive control rejects changed central CRC", crcRejected);
  const wrong = renderedQuicklinks(app.replace('download: "Olympus Guild Governance - Successor Draft.pdf"', 'download: "wrong.pdf"')).links;
  check("negative UI control detects wrong historical PDF download filename", !wrong.some((link) => link.textContent === "Historical R6 PDF" && link.getAttribute("download") === "Olympus Guild Governance - Successor Draft.pdf"));
  return checks;
}
module.exports = { runChecks };
if (require.main === module) {
  try { const checks = runChecks(); for (const check of checks) console.log((check.passed ? "PASS " : "FAIL ") + check.name); console.log(checks.filter((check) => check.passed).length + "/" + checks.length + " passed"); process.exit(checks.every((check) => check.passed) ? 0 : 1); }
  catch (error) { console.error("FAIL R7 reader / historical R6 download contract: " + error.message); process.exit(1); }
}
