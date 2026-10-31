'use strict';
// SEN-01 (30 Oct 2026) static source qualification only. No reconstructed source is evaluated.
// The current interactions.ts must be the reviewed SEN-01 source: reversing its exact hunks (refusal
// copy, one opening timestamp, code dating; the follow-up's atomic insert, same-day rule and officer
// release) gives the accepted .212 bytes that the ban210 and .210 authorities pin.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const manifestBytes = fs.readFileSync(path.join(__dirname, 'fixtures/reviewed212-sen01-source-contexts.json'));
if (sha(manifestBytes) !== '7badbe12055f27ae936b6e212594ef9483550e34c2e1eefd2dd98913d58f61d6') throw Error('reviewed212 SEN-01 source contexts differ');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'reviewed212-sen01-source-contexts-v1') throw Error('reviewed212 SEN-01 schema differs');
function original212Interactions(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return null;
  if (Buffer.byteLength(raw) !== manifest.currentBytes || sha(raw) !== manifest.currentSHA256) return null;
  let source = raw.toString('utf8');
  for (const edit of manifest.edits) {
    if (edit.count !== 1 || !edit.from || source.split(edit.from).length !== 2) return null;
    source = source.split(edit.from).join(edit.to);
  }
  return Buffer.byteLength(source) === manifest.acceptedBytes && sha(source) === manifest.acceptedSHA256 ? source : null;
}
function driftControls(raw) {
  const source = raw.toString('utf8');
  if (original212Interactions(source) === null) throw Error('reviewed212 SEN-01 positive source differs');
  const replace = (from, to) => {
    if (!from || source.split(from).length !== 2 || from === to) throw Error('reviewed212 SEN-01 drift context differs');
    return source.split(from).join(to);
  };
  const probes = [
    ['prefix', '// unreviewed212\n' + source], ['suffix', source + '\n// unreviewed212\n'],
    ['line endings', source.replace(/\n/g, '\r\n')],
    ['unrelated whitespace', replace('import { membershipSettlementEnabled }', 'import  { membershipSettlementEnabled }')],
    ['duplicate reviewed context', replace(manifest.edits[0].from, manifest.edits[0].from + manifest.edits[0].from)],
    ["today's code restored", replace('dayBucket(new Date(opened * 1000))', 'dayBucket(new Date())')],
    ['refusal expiry restored', replace('another account. If the character is yours,', 'another account. It expires <t:${open.expires_at}:R>; if the character is yours,')],
    ['same-day rule disabled', replace('((p.created_at >= ?6', '((p.created_at >= ?6 AND 0')],
    ['holder lock disabled', replace("AND (p.consumed_source = 'release'", "AND 0 AND (p.consumed_source = 'release'")],
    ['unbound names not released', replace('key && (!row || row.status === "unbound") ?', 'key && !row ?')],
    ['officer release removed', replace('const held = key && (!row || row.status === "unbound") ? await openPendingFor(env, key) : null;', 'const held = null;')],
  ];
  // Every probe changes bytes, so the exact input pin refuses it before the context and output guards, which are
  // defence in depth (as in the .210 and .211 reconstructions).
  return probes.map(([name, mutated]) => ({ name, refused: mutated !== source && original212Interactions(mutated) === null }));
}
module.exports = Object.freeze({ original212Interactions, driftControls });
