// Build .186 (Olympus Link, Phase 1a; the reviewed integration plan of 21 Oct 2026, section 4.1): writes
// src/link-core.ts from the pristine upstream file in vendor/olympus-link/, which is never edited by hand.
//
//   node scripts/build-link-core.mjs           regenerate src/link-core.ts
//   node scripts/build-link-core.mjs --check   fail when a vendored file's SHA-256 or the generated file drifts
//
// The three vendored files are byte-pinned to dnl-gentile/olympus-addon at the commit below (MIT). The generated module
// is upstream's body plus exactly three reviewed patches, each an exact replacement that must match a fixed number of
// times or the build fails, so an upstream change can never be patched silently:
//   P1 database(): LINK_DB only. Upstream falls back to env.DB, and both schemas have a `members` table that
//      forgetUser deletes from; a missing binding must never point Link at the bot's own database.
//   P2 the nine console.error sites print a fixed stage and errorRef(err) only (log.ts, the .51 logging rule): no
//      code R, Discord id, message or stack reaches Workers Logs.
//   P3 discordUser(): no globalThis.fetch default. The caller injects credentialFetch (discord.ts: no redirects, an
//      8 s deadline); without one it throws link_fetch_missing instead of calling Discord with a bare fetch.
// Nothing else changes: limits, checks, texts and reasons stay upstream's, so its vectors keep passing.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UPSTREAM = Object.freeze({ repository: "dnl-gentile/olympus-addon", commit: "d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2" });
/** Vendored file -> its upstream path and SHA-256 at UPSTREAM.commit. */
export const VENDOR_PINS = Object.freeze({
  "link-core.mjs": Object.freeze({ upstream: "web/worker/link-core.mjs", bytes: 81304, sha256: "53f05c183f96363f696dc6040fd3fb27fd11406f09b7bd908a7f579e72cb0e11" }),
  "schema.sql": Object.freeze({ upstream: "web/worker/schema.sql", bytes: 7325, sha256: "a141dc14987bb834004473694e09c363f6a58cebd01952775e0d0099901657c9" }),
  "LICENSE": Object.freeze({ upstream: "LICENSE", bytes: 1083, sha256: "a78bf4300e7768b9cc6d047816efe6a726f64c400e7e1a30d5a559757b892328" }),
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const P2_SITES = [
  ["console.error('olympus-link: could not release code', b.R, e && e.stack ? e.stack : e);", "console.error('olympus-link', 'release_code', errorRef(e));"],
  ["console.error('olympus-link: could not record the link', b.R, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'record_link', errorRef(err));"],
  ["console.error('olympus-link: could not undo the link', b.R, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'undo_link', errorRef(err));"],
  ["console.error('olympus-link: promote failed for', discordId, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'promote', errorRef(err));"],
  ["console.error('olympus-link: Discord oauth2/@me fetch failed:', err && err.message ? err.message : err);", "console.error('olympus-link', 'discord_user_fetch', errorRef(err));"],
  ["console.error('olympus-link: could not log', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'log_proof', errorRef(err));"],
  ["console.error('olympus-link: /proof', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'proof', errorRef(err));"],
  ["console.error('olympus-link: inbox entry', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'inbox_entry', errorRef(err));"],
  ["console.error('olympus-link: inbox log', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'inbox_log', errorRef(err));"],
];

/** Each patch: the exact upstream text, its replacement, and how many times the text must occur. */
export const PATCHES = Object.freeze([
  Object.freeze({
    id: "P1",
    find: "const database = (env) => env.LINK_DB || env.DB;",
    replace: "const database = (env) => {\n\tif (!env || !env.LINK_DB) throw new Error('link_db_missing');\n\treturn env.LINK_DB;\n};",
    count: 1,
  }),
  ...P2_SITES.map(([find, replace], i) => Object.freeze({ id: `P2.${i + 1}`, find, replace, count: 1 })),
  Object.freeze({
    id: "P3",
    find: "export async function discordUser(accessToken, { clientId, fetchImpl = globalThis.fetch } = {}) {\n\tif (!DISCORD_ID_RE.test(String(clientId || ''))) throw new Error('Olympus Link: set DISCORD_CLIENT_ID to your Discord application\\'s id');\n",
    replace: "export async function discordUser(accessToken, { clientId, fetchImpl } = {}) {\n\tif (!DISCORD_ID_RE.test(String(clientId || ''))) throw new Error('Olympus Link: set DISCORD_CLIENT_ID to your Discord application\\'s id');\n\tif (typeof fetchImpl !== 'function') throw new Error('link_fetch_missing');\n",
    count: 1,
  }),
]);

export const HEADER = [
  "// @ts-nocheck",
  "// GENERATED by worker/scripts/build-link-core.mjs from worker/vendor/olympus-link/link-core.mjs -- never edit by hand.",
  "// `npm run build:link-core` regenerates it; `npm run check:link-core` (part of `npm test`) fails on any drift.",
  `// Upstream: ${UPSTREAM.repository} web/worker/link-core.mjs at commit ${UPSTREAM.commit}`,
  `// (SHA-256 ${VENDOR_PINS["link-core.mjs"].sha256}).`,
  "// Copyright (c) 2026 Olympus addon contributors. MIT License: the full notice is worker/vendor/olympus-link/LICENSE",
  "// and is kept with every copy, as it requires.",
  "// Build .186 reviewed patches, each an exact single replacement (the generator lists them):",
  "//   P1 database(): LINK_DB only, never env.DB (throws link_db_missing). The comment below that says",
  "//      \"DB when there is no LINK_DB\" is upstream's and no longer applies here.",
  "//   P2 the nine console.error sites print a fixed stage and errorRef(err) only (log.ts): no R, id, message or stack.",
  "//   P3 discordUser(): the caller injects fetchImpl (credentialFetch); there is no globalThis.fetch default.",
  "// Nothing else differs from upstream. Only worker/src/link.ts loads this module, by dynamic import, behind its gate;",
  "// src/index.ts never re-exports it (LINK and PROOF_REASONS are scalar exports, which workerd refuses in an entry).",
  "import { errorRef } from './log';",
  "",
].join("\n");

/** The generated module for the given upstream text; throws when the pin or any patch does not hold exactly. */
export function generate(upstreamText) {
  const bytes = Buffer.from(upstreamText, "utf8");
  if (bytes.length !== VENDOR_PINS["link-core.mjs"].bytes || sha256(bytes) !== VENDOR_PINS["link-core.mjs"].sha256) {
    throw new Error("link-core upstream pin mismatch: vendor/olympus-link/link-core.mjs is not the reviewed upstream file");
  }
  let out = upstreamText;
  for (const p of PATCHES) {
    const found = out.split(p.find).length - 1;
    if (found !== p.count) throw new Error(`link-core patch ${p.id} matched ${found} times, expected ${p.count}`);
    out = out.split(p.find).join(p.replace);
  }
  return HEADER + out;
}

/** Checks every vendored file against its pin; returns the problems (empty when all hold). */
export function vendorProblems(vendorDir) {
  const problems = [];
  for (const [name, pin] of Object.entries(VENDOR_PINS)) {
    let bytes;
    try {
      bytes = readFileSync(join(vendorDir, name));
    } catch {
      problems.push(`${name}: missing`);
      continue;
    }
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) problems.push(`${name}: SHA-256 drift`);
  }
  return problems;
}

function main(args) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const vendorDir = join(root, "vendor", "olympus-link"), target = join(root, "src", "link-core.ts");
  const check = args.includes("--check");
  const problems = vendorProblems(vendorDir);
  if (problems.length) {
    console.error("link-core: vendored upstream files drifted:\n  " + problems.join("\n  "));
    return 1;
  }
  const generated = generate(readFileSync(join(vendorDir, "link-core.mjs"), "utf8"));
  if (check) {
    let current = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = null;
    }
    if (current !== generated) {
      console.error("link-core: src/link-core.ts is not what scripts/build-link-core.mjs generates; run npm run build:link-core");
      return 1;
    }
    console.log(`link-core: vendored files match their pins and src/link-core.ts is current (${PATCHES.length} patches)`);
    return 0;
  }
  writeFileSync(target, generated);
  console.log(`link-core: wrote src/link-core.ts (${PATCHES.length} patches)`);
  return 0;
}

// Run only when invoked as a script; the tests import generate() and the pins without writing anything. Both sides go
// through realpath: Node gives import.meta.url as the real path, so a run through a junction or a symlink (argv[1] is
// then the link) would otherwise look like an import, and --check would do nothing and exit 0.
function invokedAsScript() {
  if (!process.argv[1]) return false;
  let self, invoked;
  try {
    self = realpathSync(fileURLToPath(import.meta.url));
    invoked = realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
  return process.platform === "win32" ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
}
if (invokedAsScript()) process.exitCode = main(process.argv.slice(2));
