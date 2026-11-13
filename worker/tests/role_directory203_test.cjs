// .203: the real presentation catalogue over the real source keys and guides.
// No SQL, Worker, HTTP stub, browser, provider or copied office fixture is needed.
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
const directory = load('site-role-directory203').ROLE_DIRECTORY_203;
const meta = site.meta(), guides = content.roleGuides201(site.POSITIONS);
const expectedKeys = [...catalogue.OFFICE_APPOINTMENTS.map(row => row.key), 'member', 'raider', 'pvp_team'].sort();
const families = directory.families, byFamily = new Map(families.map(row => [row.key, row]));
const familyOf = key => byFamily.get(directory.keyToFamily[key]);
const assigned = families.flatMap(row => row.sourceKeys);
const same = (...keys) => keys.every(key => familyOf(key)?.key === familyOf(keys[0])?.key);
const distinct = (...keys) => new Set(keys.map(key => familyOf(key)?.key)).size === keys.length && keys.every(key => familyOf(key));
check('registered source identity is exactly139 registered keys plus three ordinary paths', expectedKeys.length === 142 && new Set(expectedKeys).size === 142);
check('all142 source keys appear exactly once under one family', directory.version === 1 && directory.sourceKeyCount === 142 && assigned.length === 142 && new Set(assigned).size === 142 && JSON.stringify(assigned.slice().sort()) === JSON.stringify(expectedKeys));
check('key lookup is complete and has no extra presentation identity', Object.keys(directory.keyToFamily).length === 142 && JSON.stringify(Object.keys(directory.keyToFamily).sort()) === JSON.stringify(expectedKeys) && assigned.every(key => familyOf(key)?.sourceKeys.includes(key)));
check('seventy-two canonical families replace duplicate cards without pretending every source key is an independent job', families.length === 72 && new Set(families.map(row => row.key)).size === families.length && families.every(row => row.sourceKeys.includes(row.primaryKey)));
const editorialFields219 = ['definition', 'responsibilities', 'expectations', 'commitment', 'worksWith'];
const metadataPresentation219 = ['alias', 'native', 'historical'];
const nativeSource1112 = Object.fromEntries(['guild_master', 'high_council', 'officer', 'officer_alt', 'raid_leader', 'veteran', 'raider', 'member', 'alt', 'initiate'].map((rank, slot) => ['rank_' + rank, ['office_43', 'office_45', 'office_62', 'office_63', 'office_74', 'office_90', 'office_75', 'office_55', 'office_04', 'office_48'][slot]]));
check('only45 genuine office regional and class variants need separate guides;25 alias and rank identities remain metadata', families.flatMap(row => row.variants).filter(row => ['office', 'region', 'class'].includes(row.presentation)).length === 45 && families.flatMap(row => row.variants).filter(row => metadataPresentation219.includes(row.presentation)).length === 25);
for (const family of families) {
  const nonPrimary = family.sourceKeys.filter(key => key !== family.primaryKey).sort();
  check(family.key + ' has a clear label, declared kind/tier and a unique primary guide', typeof family.label === 'string' && family.label.length > 3 && ['role', 'activity', 'status', 'institution'].includes(family.kind) && ['leader', 'high_council', 'officer_corps', 'member_specialist'].includes(family.tier) && !!guides[family.primaryKey]);
  check(family.key + ' retains every non-primary source identity with an explicit real-office or metadata presentation', family.variants.length === nonPrimary.length && new Set(family.variants.map(row => row.key)).size === family.variants.length && JSON.stringify(family.variants.map(row => row.key).sort()) === JSON.stringify(nonPrimary) && family.variants.every(row => typeof row.label === 'string' && row.label.length > 3 && ['region', 'class', 'subrole', 'historical'].includes(row.kind) && ['office', 'region', 'class', ...metadataPresentation219].includes(row.presentation) && guides[row.key]));
  // REV-GOV-1 (12 Nov 2026): a native rank shares its own source office's edited guide (Rank 1 keeps the branch Guild
  // Master, office_43, while the Leader family opens with the Sovereign); for the other nine ranks that is the family primary.
  check(family.key + ' metadata aliases share one edited specification without concatenated duplicate fields', family.variants.filter(row => metadataPresentation219.includes(row.presentation)).every(row => editorialFields219.every(field => JSON.stringify(guides[row.key][field]) === JSON.stringify(guides[row.presentation === 'native' ? nativeSource1112[row.key] : family.primaryKey][field]))) && ['responsibilities', 'expectations'].every(field => new Set(guides[family.primaryKey][field]).size === guides[family.primaryKey][field].length));
  check(family.key + ' uses titles for display without crossing authority tiers', Array.isArray(family.alternateTitles) && new Set(family.alternateTitles).size === family.alternateTitles.length && family.alternateTitles.every(text => typeof text === 'string' && text.trim()) && catalogue.OFFICE_APPOINTMENTS.filter(row => family.sourceKeys.includes(row.key)).every(row => row.tier === family.tier));
}
for (const key of expectedKeys) {
  const guide = guides[key], published = meta.roleGuides201[key];
  check(key + ' retains its current canonical or distinct sub-office specification through real site metadata', !!guide && !!published && guide.definition.length > 50 && guide.responsibilities.length >= 3 && guide.expectations.length >= 2 && guide.commitment.length > 10 && guide.boundaries.length > 20 && JSON.stringify(published) === JSON.stringify(guide));
}
check('real site metadata publishes the same family catalogue', JSON.stringify(meta.roleDirectory203) === JSON.stringify(directory));
const rankNames = ['Leader', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
check('the exact owner ten-rank order and zero-based slots remain unchanged', directory.ranks.length === 10 && directory.ranks.every((row, index) => row.nativeSlot === index && row.nativeRankOrdinal === index + 1 && row.label === rankNames[index]));
check('native ladder links point into existing families rather than extra job cards', catalogue.OFFICE_APPOINTMENTS.filter(row => row.group === 'native').every(row => directory.ranks[row.nativeSlot].familyKey === directory.keyToFamily[row.key] && familyOf(row.key).variants.some(variant => variant.key === row.key && /native rank/.test(variant.label))));
check('historical Treasurer stays a Council appointment and is not an eleventh native rank', same('rank_treasurer', 'office_86', 'treasurer') && familyOf('rank_treasurer').tier === 'high_council' && familyOf('rank_treasurer').variants.some(row => row.key === 'rank_treasurer' && row.kind === 'historical' && /not an eleventh rank/.test(row.label)) && !directory.ranks.some(row => /Treasurer/.test(row.label)));
const admissions = families.filter(row => row.application);
check('only Member, Raider and Artisan family primaries expose ordinary applications', admissions.length === 3 && JSON.stringify(admissions.map(row => [row.primaryKey, row.application.applicationTrack, row.application.targetOffice]).sort()) === JSON.stringify([['member', 'member', null], ['office_07', 'artisan', 'office_07'], ['raider', 'raider', null]].sort()) && admissions.every(row => row.tier === 'member_specialist' && row.kind === 'role'));
check('leadership, statuses and cosmetic recognition cannot advertise primary admissions', families.filter(row => row.tier !== 'member_specialist' || row.kind === 'status' || row.kind === 'institution').every(row => !row.application) && !familyOf('pvp_team').application);
check('old Crafter deep links retain their original identity under the canonical Artisan application', same('office_07', 'office_27') && familyOf('office_27').application.targetOffice === 'office_07' && familyOf('office_27').variants.some(row => row.key === 'office_27') && /materials/.test(guides.office_27.responsibilities.join(' ')));
check('frontline Recruiter titles share one guide family', same('office_44', 'office_77'));
check('Moderator titles share presentation with explicit jurisdictions', same('office_33', 'office_60', 'moderator') && familyOf('office_60').variants.some(row => row.key === 'office_60' && /jurisdiction/.test(row.label)));
check('Heraldry branch-reporting titles share one correspondent family', same('office_37', 'office_65'));
check('Social/Casual are together while Verified Alt identity remains separate', same('office_05', 'office_13', 'office_80') && distinct('office_04', 'office_80'));
check('Emeritus and former-officer recognition share no current officer card', same('office_46', 'office_91') && familyOf('office_91').kind === 'status' && distinct('office_91', 'office_62'));
check('Recruit/Pledge status stays separate from the actual Initiate rank', same('office_66', 'office_76') && distinct('office_76', 'office_48') && familyOf('office_76').kind === 'status');
check('Co-GM/Vice-GM preserve nested delegation guides without merging into the Leader', same('office_19', 'office_92', 'co_gm') && distinct('office_19', 'office_43') && familyOf('office_92').variants.some(row => row.key === 'office_92' && /delegation/.test(row.label)));
for (const [label, keys] of [
  ['event calendar, planning and delivery', ['office_21', 'office_39', 'office_40', 'community']],
  ['media direction, production and news editing', ['office_53', 'office_54', 'office_50']],
  ['diplomacy relationships, negotiations, bounded missions and liaison', ['office_20', 'office_06', 'office_30', 'office_31', 'liaison']],
  ['recruitment team coordination and casework', ['office_78', 'office_79', 'recruitment']],
  ['class-wide standards and class-specific coaching', ['office_17', 'office_18']]
]) check(label + ' share a family while keeping their own full guide keys', same(...keys) && keys.every(key => familyOf(key).primaryKey === key || familyOf(key).variants.some(row => row.key === key)));
check('Council intake policy remains separate from officer intake operations', distinct('office_14', 'office_79'));
check('Council and Officer native roles stay visibly separate', distinct('rank_high_council', 'rank_officer', 'rank_officer_alt') && familyOf('rank_high_council').tier === 'high_council' && familyOf('rank_officer').tier === 'officer_corps');
check('Trading is one dedicated Council family separate from Treasury, custody, audit and Artisanry', familyOf('office_96').key === 'head_trading' && familyOf('office_96').tier === 'high_council' && familyOf('office_96').primaryKey === 'office_96' && familyOf('office_96').sourceKeys.length === 1 && !familyOf('office_96').application && distinct('office_96', 'office_86', 'office_09', 'office_08', 'office_58'));
check('the current register has thirteen Council roles plus five institutions without another native rank or ordinary admission', families.length === 72 && families.filter(row => row.tier === 'high_council').length === 18 && admissions.length === 3 && directory.ranks.length === 10);
check('Treasury custody cannot absorb independent audit or the Treasurer appointment', distinct('office_08', 'office_86', 'office_09') && ['office_09', 'office_10', 'office_71'].every(key => !same(key, 'office_08') && !same(key, 'office_86')));
check('judicial hearings, Privy advice and the Court institution stay distinct', distinct('office_26', 'office_67', 'office_84') && familyOf('office_84').kind === 'institution');
check('portfolio categories link into Council rather than extra native jobs', same('office_28', 'office_57', 'office_45', 'rank_high_council') && familyOf('office_28').kind === 'institution');
check('named Council portfolios remain separate from their officer services', distinct('office_58', 'office_69') && distinct('office_59', 'office_53') && distinct('office_94', 'office_74'));
check('Sovereign and final responsibility link into Leader, while Founder remains recognition', same('office_43', 'office_81', 'office_41', 'rank_guild_master') && distinct('office_42', 'office_43') && familyOf('office_42').kind === 'status');
const classVariants = familyOf('office_18').variants.filter(row => row.kind === 'class');
check('all nine class variants retain distinct detailed guides under Class Leadership', classVariants.length === 9 && new Set(classVariants.map(row => guides[row.key].definition)).size === 9 && catalogue.OFFICE_APPOINTMENTS.filter(row => row.group === 'class').every(row => classVariants.some(variant => variant.key === row.key)));
for (const role of ['leader', 'assist']) {
  const keys = ['raid_' + role + '_na', 'raid_' + role + '_eu'];
  check('NA/EU Raid ' + role + ' remain full region variants of one job', same(...keys) && keys.every(key => familyOf(key).variants.some(row => row.key === key && row.kind === 'region')) && /Eastern time.*4 to 9 pm Pacific/.test(guides[keys[0]].definition) && /Central European time.*6 to 11 pm UK/.test(guides[keys[1]].definition));
}
check('original NA raid preparation, encounter and loot details are not shortened by metadata', guides.raid_leader_na.responsibilities.length === 6 && guides.raid_leader_na.expectations.length === 4 && /2 to 3 hours/.test(guides.raid_leader_na.commitment) && guides.raid_leader_na.responsibilities.some(text => /Loot Council/.test(text)));
check('the rendered Raid Leader family and both regional guides describe encounter-specific raid sizes', [familyOf('raid_leader_na').primaryKey, 'raid_leader_na', 'raid_leader_eu'].every(key => meta.roleGuides201[key].definition.includes('10, 20 or 40 players') && !/forty people/.test(meta.roleGuides201[key].definition)));
check('an invalid canonical category does not advertise six currently open application tracks', load('application-track199').validateApplicationIntent199('unknown', null, () => false)?.message === 'Choose a supported application category.');
check('current PvP and liaison guides use realmless ruleset terminology', ['pvp_leader', 'liaison', 'pvp_team', 'office_71'].every(key => !/PvE realm/.test(JSON.stringify(meta.roleGuides201[key]))) && meta.roleGuides201.pvp_leader.definition.includes('PvE ruleset') && meta.roleGuides201.office_71.definition.includes('PvE ruleset'));
check('branch capacity in current Guild Master and member guides remains a qualified planning boundary', /1,000-character.*planning boundary/.test(meta.roleGuides201.guild_master.definition) && /not been independently verified/.test(meta.roleGuides201.guild_master.definition) && meta.roleGuides201.member.expectations.some(text => /1,000-character.*planning boundary/.test(text) && /actual game capacity is separately unverified/.test(text) && /guarantees no team place/.test(text)));
check('shared PvP Leader guide remains shared and no invented NA-only key appears', same('office_71', 'pvp_leader') && !directory.keyToFamily.pvp_leader_na && /NA or EU/.test(guides.pvp_leader.expectations.join(' ')));
check('paused Treasury recognition is informational and has no payment/application action', familyOf('office_85').kind === 'status' && !familyOf('office_85').application && /paused/.test(familyOf('office_85').label.toLowerCase()) && /no payment or service is offered/.test(guides.office_85.eligibilityNote));
check('directory output is plain JSON-serializable metadata', JSON.stringify(JSON.parse(JSON.stringify(directory))) === JSON.stringify(directory));
check('directory structure is immutable', Object.isFrozen(directory) && Object.isFrozen(families) && Object.isFrozen(directory.ranks) && Object.isFrozen(directory.keyToFamily) && families.every(row => Object.isFrozen(row) && Object.isFrozen(row.sourceKeys) && Object.isFrozen(row.alternateTitles) && Object.isFrozen(row.variants) && row.variants.every(Object.isFrozen)));
const presentation218 = key => familyOf(key).variants.find(row => row.key === key)?.presentation;
check('.218 distinct custody diplomacy delegation and specialist scopes are not pooled as aliases', ['office_10','office_72','office_06','office_30','office_31','office_92','office_35','office_36','office_38','office_70','office_17','office_11','office_61','guild_master'].every(key => presentation218(key) === 'office'));
check('.219 proven member raider recruiter social and legacy aliases stay unified without duplicating native jobs', ['office_55','office_75','office_77','office_05','office_13','co_gm','treasurer','officer','pvp_leader'].every(key => presentation218(key) === 'alias') && ['rank_member','rank_raider','rank_high_council'].every(key => presentation218(key) === 'native') && presentation218('rank_treasurer') === 'historical');
check('.218 regional and class full specifications keep their explicit presentation', ['raid_leader_na','raid_leader_eu','raid_assist_na','raid_assist_eu'].every(key => presentation218(key) === 'region') && catalogue.OFFICE_APPOINTMENTS.filter(row => row.group === 'class').every(row => presentation218(row.key) === 'class'));
check('.218 judicial institution and current Chancellor are visibly distinct without rekeying either record', familyOf('office_26').label === 'Council of Justice — institution' && familyOf('office_101').key === 'head_justice' && /not a second Head of Justice/.test(guides.office_26.definition) && guides.office_101.definition.includes('individual judicial portfolio holder'));
check('.218 retained War Head guide no longer claims the two current appointment records', guides.office_94.definition.includes('retained historical shared template') && !guides.office_94.definition.includes('Both current remit references use') && ['office_97','office_98'].every(key => directory.keyToFamily[key] !== directory.keyToFamily.office_94));
console.log(`${checks - failed}/${checks} checks passed`);
process.exitCode = failed ? 1 : 0;
