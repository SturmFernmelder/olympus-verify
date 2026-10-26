// .201: load the real pure TypeScript catalogue and its real site-data projection.
// No copied role fixture, SQL changes, HTTP mock, server or production interaction.
'use strict';
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '../src'), cache = new Map();
function load(file) {
  const absolute = path.resolve(sourceRoot, file.endsWith('.ts') ? file : file + '.ts');
  if (!absolute.startsWith(sourceRoot + path.sep)) throw Error('source root escape');
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} }; cache.set(absolute, module);
  const result = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
  const failures = (result.diagnostics || []).filter(row => row.category === ts.DiagnosticCategory.Error);
  if (failures.length) throw Error(ts.formatDiagnosticsWithColorAndContext(failures, { getCanonicalFileName: x => x, getCurrentDirectory: () => sourceRoot, getNewLine: () => '\n' }));
  new Function('exports', 'require', 'module', result.outputText)(module.exports, key => key.startsWith('.') ? load(path.relative(sourceRoot, path.resolve(path.dirname(absolute), key))) : require(key), module);
  return module.exports;
}
let checks = 0, failed = 0;
function check(label, condition) { checks++; if (condition) console.log('PASS ' + label); else { failed++; console.error('FAIL ' + label); } }
const catalogue = load('governance-offices'), content = load('site-role-guides201'), site = load('site-data');
const guides = content.OFFICE_ROLE_GUIDES_201, complete = content.roleGuides201(site.POSITIONS), meta = site.meta();
const stable = catalogue.OFFICE_APPOINTMENTS.filter(row => /^office_\d\d$/.test(row.key));
const words = guide => [guide.definition, ...guide.responsibilities, ...guide.expectations, guide.commitment, guide.worksWith].join(' ').trim().split(/\s+/).length;
check('all original 95 stable offices remain represented', stable.length === 95 && stable.every(row => guides[row.key]));
check('all original 131 assignable display keys have exactly one guide', Object.keys(guides).length === 131 && catalogue.OFFICE_APPOINTMENTS.every(row => guides[row.key]?.key === row.key));
check('95 office definitions are individually written', new Set(stable.map(row => guides[row.key].definition)).size === 95);
check('95 office responsibility lists are individually written', new Set(stable.map(row => JSON.stringify(guides[row.key].responsibilities))).size === 95);
check('95 office expectation lists are individually written', new Set(stable.map(row => JSON.stringify(guides[row.key].expectations))).size === 95);
for (const row of catalogue.OFFICE_APPOINTMENTS) {
  const guide = guides[row.key];
  check(row.key + ' has a definition, three duties, two expectations, commitment, colleagues and access boundary', !!guide && guide.definition.length > 100 && guide.responsibilities.length >= 3 && guide.responsibilities.every(text => typeof text === 'string' && text.length > 35) && guide.expectations.length >= 2 && guide.expectations.every(text => typeof text === 'string' && text.length > 35) && guide.commitment.length > 15 && guide.worksWith.length > 10 && /changes no game rank, Discord role, bank limit, signing authority or addon permission/.test(guide.boundaries));
  check(row.key + ' follows current reservation and original ordinary application eligibility', row.tier !== 'member_specialist' ? guide.eligibility === 'reserved' && /not open to public applications/.test(guide.eligibilityNote) : row.applicationTrack === 'patron' ? guide.eligibility === 'cosmetic' : row.applicationEligible ? guide.eligibility === row.applicationTrack : guide.eligibility === 'standing');
}
check('every stable office has at least100 concrete words before its shared access boundary', stable.every(row => words(guides[row.key]) >= 100));
check('native guide keeps the exact ten-rank order and no extra Treasurer rank', content.NATIVE_RANK_GUIDES_201.length === 10 && content.NATIVE_RANK_GUIDES_201.map(row => row.label).join('|') === 'Leader|High Council|Officer|Officer Alt|Raid Leader|Veteran|Raider|Member|Alt|Initiate' && content.NATIVE_RANK_GUIDES_201.every((row, index) => row.nativeSlot === index && row.nativeRankOrdinal === index + 1));
check('native leadership slots0 through4 are reserved and member standings are not leadership vacancies', content.NATIVE_RANK_GUIDES_201.every((row, index) => row.eligibility === (index < 5 ? 'reserved' : 'standing')));
check('historical Treasurer key still describes the reserved appointment at Council slot1', guides.rank_treasurer.nativeSlot === 1 && guides.rank_treasurer.eligibility === 'reserved' && /not an additional native rank/.test(guides.rank_treasurer.boundaries));
for (const position of site.POSITIONS.filter(row => !/^office_\d\d$/.test(row.key))) {
  const guide = complete[position.key];
  check('legacy detailed copy retained for ' + position.key, !!guide && guide.definition === position.info.about && JSON.stringify(guide.responsibilities) === JSON.stringify(position.info.duties) && JSON.stringify(guide.expectations) === JSON.stringify(position.info.expect) && guide.commitment === position.info.time);
}
for (const region of ['na', 'eu']) {
  const lead = complete['raid_leader_' + region], assist = complete['raid_assist_' + region];
  check(region + ' regional Leader retains concrete six-duty encounter and loot plan', lead.responsibilities.length === 6 && lead.responsibilities.some(text => /pulls, wipes, pace and breaks/.test(text)) && lead.responsibilities.some(text => /Loot Council/.test(text)) && /2 to 3 hours/.test(lead.commitment) && lead.eligibility === 'reserved');
  check(region + ' regional Assist retains invites, marks, attendance, stand-in and setup duties', assist.responsibilities.length === 5 && assist.responsibilities.some(text => /marks/.test(text)) && assist.responsibilities.some(text => /attendance/.test(text)) && assist.responsibilities.some(text => /Lead the raid yourself/.test(text)) && /hour of setup/.test(assist.commitment) && assist.eligibility === 'reserved');
}
check('NA and EU remain different real historical schedule contexts', /Eastern time.*7 pm to midnight.*4 to 9 pm Pacific/.test(complete.raid_leader_na.definition) && /Central European time.*7 pm to midnight.*6 to 11 pm UK/.test(complete.raid_leader_eu.definition));
const classes = catalogue.OFFICE_APPOINTMENTS.filter(row => row.key.startsWith('class_lead:')).map(row => guides[row.key]);
check('all nine class lead guides have distinct concrete class duties', classes.length === 9 && new Set(classes.map(row => row.definition)).size === 9 && new Set(classes.map(row => JSON.stringify(row.responsibilities))).size === 9 && classes.every(row => row.eligibility === 'reserved'));
check('warrior, hunter, priest and druid guidance discusses their own actual planning concerns', /tank transitions/.test(guides['class_lead:warrior'].responsibilities.join(' ')) && /pet control/i.test(guides['class_lead:hunter'].responsibilities.join(' ')) && /healing targets/.test(guides['class_lead:priest'].responsibilities.join(' ')) && /primary tanking, healing or damage/.test(guides['class_lead:druid'].responsibilities.join(' ')));
check('shaman guide does not invent current ruleset or class availability', /where the current game ruleset and team support the class/.test(guides['class_lead:shaman'].definition) && /Confirm current class availability/.test(guides['class_lead:shaman'].responsibilities[0]));
check('auditor guide separates evidence and custody from Treasury operations', /independently checks/.test(guides.office_08.definition) && /missing record from proof of theft/.test(guides.office_08.expectations.join(' ')) && /grants no withdrawal permission/.test(guides.office_08.boundaries));
check('judicial guide preserves evidence, hearing, recusal and appeal duties', /evidence/.test(guides.office_26.responsibilities.join(' ')) && /recusals/.test(guides.office_26.responsibilities.join(' ')) && /appeal route/.test(guides.office_26.responsibilities.join(' ')));
check('Broadcaster guide preserves consent and separate Stream Shield authorization', /refusal to appear/.test(guides.office_12.expectations.join(' ')) && /not automatic Stream Shield authorization/.test(guides.office_12.boundaries));
check('honorary officer title does not create a current Officer Corps seat', guides.office_91.eligibility === 'standing' && /not a current Officer Corps appointment/.test(guides.office_91.boundaries));
check('paused cosmetic recognition cannot advertise a currently available payment service', /paused by default/.test(guides.office_85.definition) && /no payment or service is offered/.test(guides.office_85.eligibilityNote));
check('real site metadata exposes the same complete guides and exact ten native guides', Object.keys(meta.roleGuides201).length === Object.keys(complete).length && JSON.stringify(meta.roleGuides201) === JSON.stringify(complete) && JSON.stringify(meta.nativeRankGuides201) === JSON.stringify(content.NATIVE_RANK_GUIDES_201));
check('guide map, guide objects and text arrays are immutable', Object.isFrozen(guides) && Object.values(guides).every(row => Object.isFrozen(row) && Object.isFrozen(row.responsibilities) && Object.isFrozen(row.expectations)) && Object.isFrozen(complete));
console.log(`${checks - failed}/${checks} checks passed`);
process.exitCode = failed ? 1 : 0;
