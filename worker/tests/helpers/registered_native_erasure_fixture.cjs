/** The separately pinned Native fixture remains byte-exact. Extensions borrow only its setup. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Module = require('node:module');

function runNativeErasureFixture(run, { lostAdmission = false } = {}) {
  const filename = path.join(__dirname, '..', 'privacy_native_erasure_mode_test.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const cuts = [...source.matchAll(/^\(async\(\)=>\{\r?\n \/\/ \.174:/gm)];
  if (cuts.length !== 1) throw Error('native erasure setup boundary changed');
  let setup = source.slice(0, cuts[0].index);
  const hash = createHash('sha256').update(setup).digest('hex');
  if (hash !== '572066b31422497e89314f47c972536517104de10521a45434b4f041f6ad02a3') {
    throw Error('native erasure setup bytes changed');
  }
  // Only provision the tested layout after verifying the original fixture evidence.
  setup = setup.replace('JSON.parse(catalogue.ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile',
    "JSON.parse(load('raid-schema316').raidAdmissionCatalogue316('recorded-live-pre-seal-20261017'))");
  if (lostAdmission) {
    const original = "if(list.some(s=>s.sql.includes('privacy_terminal_unconfirmed')))";
    if (setup.split(original).length !== 2) throw Error('native erasure commit hook changed');
    const fault = "if(f.loseAdmission&&list.some(s=>s.sql.includes('privacy_admission_unconfirmed'))){f.loseAdmission=false;f.admissionReplyLost=true;throw Error('synthetic lost committed admission reply');}";
    setup = setup.replace(original, fault + original);
  }
  const fixture = new Module(filename, module);
  fixture.filename = filename;
  fixture.paths = Module._nodeModulePaths(path.dirname(filename));
  fixture._compile(setup + '\nmodule.exports=(' + run.toString() + ');\n', filename);
  return fixture.exports();
}

module.exports = { runNativeErasureFixture };
