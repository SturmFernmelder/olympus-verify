'use strict';
// .211 static source qualification only. No reconstructed source is evaluated.
// The identity suite's loader, historical PINS and dynamic oracles stay current/unchanged.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const manifestBytes = fs.readFileSync(path.join(__dirname, 'fixtures/reviewed211-identity-source-contexts.json'));
if (sha(manifestBytes) !== 'b6fc8c301ce79e864949232ccc981477de01189e68f12c998d6333ea08760fbb') throw Error('reviewed211 identity contexts differ');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'reviewed211-identity-source-contexts-v1') throw Error('reviewed211 identity schema differs');
const historicalBytes = fs.readFileSync(path.join(__dirname, 'source196-historical-projection.cjs'));
if (historicalBytes.length !== manifest.historicalHelper.bytes || sha(historicalBytes) !== manifest.historicalHelper.sha256) throw Error('reviewed211 historical helper differs');
const historical = require('./source196-historical-projection.cjs');
const stageFor = name => manifest.stages.find(stage => stage.name === name);
function original211Source(name, raw) {
  const stage = stageFor(name);
  if (!stage || typeof raw !== 'string' || Buffer.byteLength(raw) !== stage.currentBytes || sha(raw) !== stage.currentSHA256) return null;
  let source = raw;
  for (const edit of stage.edits) {
    if (edit.count !== 1 || !edit.from || source.split(edit.from).length !== 2) return null;
    source = source.replace(edit.from, edit.to);
  }
  return Buffer.byteLength(source) === stage.acceptedBytes && sha(source) === stage.acceptedSHA256 ? source : null;
}
function source211HistoricalDigest(name, raw) {
  if (typeof raw !== 'string') return null;
  // Historical intermediates are needed by the original .198 negative controls.
  // The separate current-source checks below require the exact .211 source files.
  const stage = stageFor(name);
  if (stage && sha(raw) === stage.currentSHA256) {
    raw = original211Source(name, raw);
    if (raw === null) return null;
  }
  return historical.source196HistoricalDigest(name, raw);
}
function sourceChecks(sourceRoot, pins) {
  const results = {};
  for (const stage of manifest.stages) {
    const raw = fs.readFileSync(path.join(sourceRoot, stage.name + '.ts'), 'utf8'), original = original211Source(stage.name, raw);
    results[stage.name + ':exact-current-and-original'] = original !== null && sha(original) === stage.acceptedSHA256;
    results[stage.name + ':unchanged-historical-seal'] = original !== null && historical.source196HistoricalDigest(stage.name, original) === pins.files[stage.name];
  }
  for (const row of manifest.support) {
    const raw = fs.readFileSync(path.join(sourceRoot, row.name + '.ts'));
    results[row.name + ':exact-reviewed-support'] = raw.length === row.bytes && sha(raw) === row.sha256;
  }
  return results;
}
function driftControls(sourceRoot) {
  const results = [], replace = (source, from, to) => {
    if (!from || source.split(from).length !== 2 || from === to) throw Error('reviewed211 drift context differs');
    return source.replace(from, to);
  };
  for (const stage of manifest.stages) {
    const raw = fs.readFileSync(path.join(sourceRoot, stage.name + '.ts'), 'utf8');
    if (original211Source(stage.name, raw) === null) throw Error('reviewed211 positive source differs');
    const probes = [
      ['prefix', '// unreviewed211\n' + raw], ['suffix', raw + '\n// unreviewed211\n'],
      ['line endings', raw.replace(/\n/g, '\r\n')],
      ['unrelated whitespace', replace(raw, stage.name === 'role-settlements' ? "import type { Env } from './env';" : "import {AsyncLocalStorage} from 'node:async_hooks';", stage.name === 'role-settlements' ? "import  type { Env } from './env';" : "import  {AsyncLocalStorage} from 'node:async_hooks';")],
      ['duplicate reviewed context', replace(raw, stage.edits[0].from, stage.edits[0].from + stage.edits[0].from)],
    ];
    if (stage.name === 'role-settlements') {
      probes.push(['reserved footprint check removed', replace(raw, 'original.check();reserved.check();', 'original.check();')]);
      probes.push(['final expiry restriction removed', replace(raw, "`/guilds/${p.guild_id}/members/${p.subject}/roles/${p.role_id}`,undefined,check)", "`/guilds/${p.guild_id}/members/${p.subject}/roles/${p.role_id}`)")]);
    } else {
      probes.push(['final owned restriction removed', replace(raw, 'try{restrict();scope(a.origin);checkMethod(nativeFetch);', 'try{scope(a.origin);checkMethod(nativeFetch);')]);
      probes.push(['nonvoid restriction admitted', replace(raw, 'beforeDispatch()!==undefined', 'beforeDispatch()===undefined')]);
    }
    for (const [name, mutated] of probes) {
      const refused = mutated !== raw && original211Source(stage.name, mutated) === null;
      if (!refused) throw Error('reviewed211 unreviewed source accepted: ' + name);
      results.push({source:stage.name, name, refused});
    }
  }
  for (const row of manifest.support) {
    const raw = fs.readFileSync(path.join(sourceRoot, row.name + '.ts'), 'utf8');
    const contexts = {
      discord: ['\n  }, beforeDispatch);', '\n  });'],
      'treasury-cosmetic': ['} reserved.check(); };', '} };'],
      'treasury-reserved-roles': ['!!live || MARKER_KEYS[i]! in env', '!!live'],
    };
    const mutated = replace(raw, ...contexts[row.name]);
    const refused = sha(raw) === row.sha256 && sha(mutated) !== row.sha256;
    if (!refused) throw Error('reviewed211 unreviewed support accepted: ' + row.name);
    results.push({source:row.name, name:'reviewed restriction changed', refused});
  }
  return results;
}
module.exports = Object.freeze({ original211Source, source211HistoricalDigest, sourceChecks, driftControls });
