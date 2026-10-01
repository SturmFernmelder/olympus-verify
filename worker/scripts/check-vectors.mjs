#!/usr/bin/env node
/**
 * Pin the third implementation of the code spec. watcher/tests/vectors.json is generated from the Python code and
 * the Lua is checked against it by addon/test/harness.lua; without this the TypeScript in the Worker — the one that
 * actually issues the codes members see — was the only implementation nothing compared.
 *
 *   npm run check:vectors
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { codeFor, isValidTicket, normalizeCharacter, ticketFor, ticketNonce } from "../src/codes.ts";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(join(here, "..", "..", "watcher", "tests", "vectors.json"), "utf8"));

let failed = 0;
for (const v of vectors) {
  const norm = normalizeCharacter(v.character);
  if (norm !== v.normalized) {
    console.error(`normalize(${JSON.stringify(v.character)}): ts ${JSON.stringify(norm)} vs python ${JSON.stringify(v.normalized)}`);
    failed++;
  }
  const code = await codeFor(v.secret, v.character, v.day);
  if (code !== v.code) {
    console.error(`code(${JSON.stringify(v.character)}, ${v.day}): ts ${code} vs python ${v.code}`);
    failed++;
  }
  if (v.ticket) {
    const t = await ticketFor(v.secret, v.nonce, v.day);
    if (t !== v.ticket) {
      console.error(`ticket(${v.nonce}, ${v.day}): ts ${t} vs python ${v.ticket}`);
      failed++;
    }
    // accepted on its issue day and the next, not the day after that
    const issued = new Date(`${v.day}T12:00:00Z`);
    const next = new Date(issued.getTime() + 86_400_000), late = new Date(issued.getTime() + 2 * 86_400_000);
    if (!(await isValidTicket(v.secret, v.ticket.toLowerCase(), issued)) || !(await isValidTicket(v.secret, v.ticket, next)) || (await isValidTicket(v.secret, v.ticket, late))) {
      console.error(`ticket ${v.ticket}: acceptance window wrong`);
      failed++;
    }
    if (ticketNonce(v.ticket) !== v.nonce) {
      console.error(`ticketNonce(${v.ticket}) is not ${v.nonce}`);
      failed++;
    }
  }
}
if (failed) {
  console.error(`\n${failed} mismatch(es) — the Worker would issue codes the addon will reject.`);
  process.exit(1);
}
console.log(`vectors: ${vectors.length} cases match the Python implementation (codes, tickets and normalization)`);
