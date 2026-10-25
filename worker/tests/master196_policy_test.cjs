// Pure source-policy checks only: no Workerd, SQLite/D1 runtime, browser, provider or account effects.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const worker = path.join(__dirname, '..'), repo = path.join(worker, '..'), cache = new Map();
const real = new Set(['ruleset-profile', 'qr-phase1', 'native-rank-adapter', 'governance-offices', 'ruleset-publication-data', 'site-data']);
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw Error('No provider access in policy checks'); };
function load(name) {
  name = name.replace(/^\.\//, '');
  if (name === 'community-context') return { registerCommunityData() {} };
  if (name === 'privacy-business-catalog') return { registerServingPrivacyFamilies() {} };
  if (!real.has(name)) return {}; // Uncalled privacy/provider capabilities; not substitute implementations under test.
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const source = fs.readFileSync(path.join(worker, 'src', name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, load);
  return module.exports;
}
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
const profile = load('ruleset-profile'), qr = load('qr-phase1'), native = load('native-rank-adapter'), offices = load('governance-offices');
const organization = JSON.parse(fs.readFileSync(path.join(worker, 'public/static/governance/organization.json'), 'utf8'));
function loadBrowserModel(file) {
  const module = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(path.join(worker, 'public/static/rank-planner', file), 'utf8'))(module, module.exports);
  return module.exports;
}
const Model = loadBrowserModel('model.js'), catalogue = loadBrowserModel('catalogue.js').ranks;
const expected = ['Guild Master', 'High Council', 'Treasurer', 'Officer', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
const current199 = ['Leader', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
(async () => {
  check('public PvE direction is frozen, explicit and makes no realm/launch claim', () => {
    const p = profile.currentRulesetProfile();
    assert.deepEqual(p, { schema: 'olympus-ruleset-profile-v1', revision: 'forever-public-pve-alliance-20261023-v1', phase: 'public_direction', game: 'World of Warcraft: Forever', guild: 'Olympus', realm: 'Realm not announced', ruleset: 'PvE', faction: 'Alliance' });
    assert.ok(Object.isFrozen(p)); assert.equal(profile.publicRulesetSettingLabel(), 'PVE - Alliance');
    assert.match(profile.rulesetLabel(p), /PVE - Alliance.*public guild direction.*Realm not announced/);
  });
  check('historical beta and signed QR profile keep exact original observation', () => {
    assert.equal(profile.historicalBetaRulesetProfile().revision, 'forever-beta-pvp2-v1');
    assert.equal(profile.historicalBetaRulesetProfile().realm, 'Classic Beta PvP 2');
    assert.equal(profile.historicalBetaRulesetProfile().ruleset, 'PvP');
    assert.equal(qr.QR_PROFILE.revision, 'forever-beta-pvp2-v1'); assert.equal(qr.QR_PROFILE.realm, 'Classic Beta PvP 2');
    assert.equal(qr.QR_PROFILE.build, 70205); assert.equal(qr.QR_PROFILE.interface, 16001);
  });
  const resolved = await profile.resolveRulesetSnapshot([], {});
  check('absent legacy selector changes copy only without fabricated activation', () => {
    assert.equal(resolved.profile, profile.currentRulesetProfile()); assert.equal(resolved.modeRaw, null);
    assert.equal(resolved.activatedAt, null); assert.equal(resolved.activatedBy, null); assert.equal(resolved.digest, null);
    assert.equal(profile.rulesetSwitchReadiness(resolved).available, false);
    assert.equal(profile.rulesetSwitchReadiness(resolved).ownerEligibilityQualified, false);
  });
  const held = await profile.resolveRulesetSnapshot([{ key: 'rulesetMode', value: 'full_release' }], {});
  check('an activated but unqualified selector still holds instead of falling back to public copy', () => {
    assert.equal(held.profile, null); assert.equal(held.held, 'activation_pins_incomplete');
  });
  check('historical B proof stays exact while current .199 organization/planner use the owner-confirmed ten ranks', () => {
    assert.deepEqual(Array.from(qr.COUNCIL_TREASURER_NATIVE_RANKS), expected);
    assert.equal(qr.NATIVE_RANKS[1], 'High Council'); assert.equal(qr.SIGNER_NATIVE_RANKS, qr.NATIVE_RANKS);
    assert.deepEqual(organization.nativeRanks.map(r => r.name), current199);
    assert.deepEqual(Model.createDraft(catalogue).ranks.map(r => r.name), current199);
    assert.deepEqual(Array.from(offices.NATIVE_RANKS_199,r=>r.name),current199);
    assert.equal(Model.RECOMMENDED[1], 'highcouncil'); assert.equal(Model.createDraft(catalogue).review.liveChangesApplied, false);
    const page=fs.readFileSync(path.join(worker,'src/site-ranks.ts'),'utf8');const html=JSON.parse(page.match(/const HTML = (".*");/)[1]);assert.ok(html.includes('Exact 10-rank hierarchy · High Council slot 1 · Officer slot 2'));assert.ok(html.includes('Co-Guild Master and Treasurer are appointments'));assert.ok(!html.includes('Treasurer Slot 3'));
  });
  const roleIds = Array.from({ length: 10 }, (_, i) => String(70000000000000000n + BigInt(i)));
  const oldMap = native.parseNativeRoleMap(JSON.stringify({ profile: 'ten-rank', roles: roleIds }));
  const newMap = native.parseNativeRoleMap(JSON.stringify({ profile: 'ten-rank-treasurer-v1', roles: roleIds }));
  check('old and new cosmetic maps cannot reinterpret the other Slot2 name', () => {
    assert.equal(native.mappedNativeRole('High Council', 1, oldMap), roleIds[1]);
    assert.equal(native.mappedNativeRole('Treasurer', 1, newMap), roleIds[1]);
    assert.throws(() => native.mappedNativeRole('Treasurer', 1, oldMap), /name_index_mismatch/);
    assert.throws(() => native.mappedNativeRole('High Council', 1, newMap), /name_index_mismatch/);
    assert.throws(() => native.mappedNativeRole('Treasurer', 2, newMap), /name_index_mismatch/);
  });
  check('historical inference stays exact; new whole profiles require their explicit configured map', () => {
    const rows = names => names.map((rank, rank_index) => ({ rank, rank_index }));
    assert.equal(native.identifyNativeProfile(rows(qr.SIGNER_NATIVE_RANKS)), 'ten-rank');
    assert.equal(native.identifyConfiguredNativeProfile(rows(qr.TREASURER_NATIVE_RANKS), newMap), 'ten-rank-treasurer-v1');
    assert.throws(() => native.identifyNativeProfile(rows(qr.TREASURER_NATIVE_RANKS)), /ambiguous_or_contradictory/);
    assert.equal(native.identifyNativeProfile(rows(qr.BETA_RANKS)), 'beta-five');
    assert.equal(native.identifyNativeProfile([{ rank: 'Officer', rank_index: 2 }]), 'ten-rank');
    const partial = [7, 2, 9, 8].map(rank_index => ({ rank: qr.SIGNER_NATIVE_RANKS[rank_index], rank_index }));
    assert.equal(native.identifyNativeProfile(partial), 'ten-rank');
    assert.throws(() => native.identifyNativeProfile([{ rank: 'Guild Master', rank_index: 0 }]), /ambiguous_or_contradictory/);
    assert.throws(() => native.identifyNativeProfile([]), /ambiguous_or_contradictory/);
    assert.throws(() => native.identifyConfiguredNativeProfile(rows(qr.SIGNER_NATIVE_RANKS), newMap), /name_index_mismatch/);
    assert.throws(() => native.identifyConfiguredNativeProfile(rows(qr.TREASURER_NATIVE_RANKS), oldMap), /ambiguous_or_contradictory/);
    assert.throws(() => native.identifyNativeProfile([{ rank: 'Treasurer', rank_index: 1 }, { rank: 'High Council', rank_index: 1 }]), /ambiguous_or_contradictory/);
  });
  check('the new recommendation never qualifies privileged role mapping', () => {
    const env = { ROLE_GUILD_LEADER: roleIds[0], ROLE_OFFICER: roleIds[1], ROLE_RAID_LEADER: roleIds[2] };
    assert.throws(() => native.privilegedNativeMap('ten-rank-treasurer-v1', env), /privileged_rank_profile_not_qualified/);
    assert.equal(native.privilegedNativeMap('ten-rank', env).wanted('High Council', 1), null);
    assert.throws(() => native.privilegedNativeMap('ten-rank', env).wanted('Treasurer', 1), /name_index_mismatch/);
    assert.throws(() => qr.requireQr({}), /phase1_disabled/);
  });
  const observation = rank => ['OLG1', 'a'.repeat(32), 'b'.repeat(32), 'Player-4613-005A70D8', 'Player-4613-005A70D9', '1792750000', '70205', '16001', 'Synthetic Member', 'OLYMPUS', 'Classic Beta PvP 2', '1', '1', rank].join('|');
  check('existing signed game format accepts only its historical named native profile', () => {
    assert.equal(qr.parseGameObservation(observation('High Council')).requesterRank, 1);
    assert.throws(() => qr.parseGameObservation(observation('Treasurer')), /invalid_game_observation/);
  });
  let nextRow = { snapshot_id: 1, name: 'Synthetic Signer', rank: 'High Council', rank_index: 1 };
  const env = { LINKS_NOT_BEFORE: '0', DB: { prepare() { return { bind() { return this; }, async first() { return nextRow; } }; } } };
  const accepted = await qr.rosterIdentity(env, 'Player-4613-005A70D8', true);
  check('old council eligibility is explicit rather than ordinal-only', () => assert.equal(accepted.rank, 'High Council'));
  nextRow = { ...nextRow, rank: 'Treasurer' };
  await assert.rejects(qr.rosterIdentity(env, 'Player-4613-005A70D8', true), /no_qualified_high_council/); checks++; console.log('PASS Treasurer Slot2 is not a signer');
  nextRow = { ...nextRow, rank: 'High Council', rank_index: 2 };
  await assert.rejects(qr.rosterIdentity(env, 'Player-4613-005A70D8', true), /no_qualified_high_council/); checks++; console.log('PASS relocated Council label is not a qualified old-profile signer');
  check('every original office ordinal and every native slot has an immutable assignment key', () => {
    assert.equal(offices.OFFICE_APPOINTMENTS.length, 131); assert.ok(Object.isFrozen(offices.OFFICE_APPOINTMENTS));
    assert.equal(new Set(offices.OFFICE_APPOINTMENT_KEYS).size, 131);
    for (const term of organization.terms) {
      const entry = offices.OFFICE_APPOINTMENTS.find(e => e.key === 'office_' + String(term.ordinal).padStart(2, '0'));
      assert.equal(entry.label, term.label); assert.equal(entry.termOrdinal, term.ordinal); assert.ok(Object.isFrozen(entry));
      assert.ok(Object.isFrozen(entry.recommendedNativeSlots)); assert.equal(entry.mappingApplies, false);
      assert.ok(entry.recommendedNativeSlots.every(slot => Number.isInteger(slot) && slot >= 0 && slot <= 9));
      assert.equal(entry.nativeSlot,entry.nativeRankOrdinal-1);
    }
    assert.equal(offices.OFFICE_APPOINTMENTS.find(e => e.key === 'co_gm').aliasOf, 'office_19');
    assert.equal(offices.OFFICE_APPOINTMENTS.find(e => e.key === 'treasurer').aliasOf, 'office_86');
    assert.deepEqual(offices.OFFICE_APPOINTMENTS.find(e => e.key === 'co_gm').recommendedNativeSlots, [1]);
    assert.deepEqual(offices.OFFICE_APPOINTMENTS.find(e => e.key === 'office_85').recommendedNativeSlots, [7]);
    assert.deepEqual(offices.OFFICE_APPOINTMENTS.filter(e => e.group === 'native').map(e => e.label), current199);
  });
  check('Roles facts agree with the five stable office crosswalks without applying the recommendation', () => {
    const roles = load('site-data').POSITIONS;
    for (const [key, ordinal, slot, name] of [['class_lead',18,2,'Officer'],['loot_council',51,4,'Raid Leader'],['professions',69,2,'Officer'],['pvp_leader',71,4,'Raid Leader'],['raid_assist_na',73,4,'Raid Leader'],['raid_assist_eu',73,4,'Raid Leader']]) {
      const office = offices.OFFICE_APPOINTMENTS.find(entry => entry.key === 'office_' + ordinal);
      assert.deepEqual(Array.from(office.recommendedNativeSlots), [slot]); assert.equal(office.mappingApplies, false);
      const fact = roles.find(role => role.key === key).info.game;
      assert.ok(fact.includes('Rank '+office.nativeRankOrdinal+' '+name+' (zero-based slot '+slot+')'), key);
      assert.ok(fact.includes('not verification of the holder’s current game rank'),key);
    }
    for (const key of ['co_gm','officer','treasurer']) {
      const fact = roles.find(role => role.key === key).info.game;
      const office=offices.OFFICE_APPOINTMENTS.find(entry=>entry.key===key);
      assert.ok(fact.includes('Rank '+office.nativeRankOrdinal+' '+office.nativeRankName+' (zero-based slot '+office.nativeSlot+')'),key);
      assert.ok(fact.includes('not verification of the holder’s current game rank'),key);
    }
    const book = fs.readFileSync(path.join(worker,'public/static/governance/reconciled-book.md'),'utf8');
    assert.ok(book.includes('Officer Alt'));
    assert.match(book,/zero-based Slot 3/i);
    assert.equal(organization.nodes.find(node => node.id === 'officers').kind, 'Officer Corps native ranks and delegated duties');
    assert.ok(organization.officeMandates.some(office => office.boundary.includes('Treasurer is an appointed High Council office associated with Rank 2, zero-based slot 1')));
  });
  check('saved v2 Council drafts remain their historical policy with no silent conversion', () => {
    const old = Model.createDraft(catalogue, ['gm', 'highcouncil', 'officer', 'officeralt', 'raidlead', 'veteran', 'raider', 'member', 'alt', 'initiate']);
    old.schema = Model.PREVIOUS_SCHEMA; old.source.policy = Model.PREVIOUS_POLICY;
    const original = JSON.stringify(old), imported = Model.importDraft(original, catalogue);
    assert.equal(JSON.stringify(imported), original); assert.equal(imported.ranks[1].name, 'High Council');
    assert.ok(Model.notices(imported).some(n => n.text.includes('earlier draft is preserved')));
    const forged = JSON.parse(original); forged.source.policy = Model.POLICY;
    assert.throws(() => Model.importDraft(JSON.stringify(forged), catalogue), /source reference/);
  });
  check('governance keeps real authority, cosmetic-only recognition and privacy limits', () => {
    const book = fs.readFileSync(path.join(worker, 'public/static/governance/reconciled-book.md'), 'utf8');
    assert.ok(book.includes(fs.readFileSync(path.join(worker,'public/static/governance/operational-charter.md'),'utf8').trim()));
    const bytes=Buffer.from(book);assert.equal(organization.book.bytes,bytes.length);assert.equal(organization.book.sha256,require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
    for (const phrase of ['core Council offices', 'complete **unexecuted instruments**', 'No real money', 'no channels, native rank, Council seat or vote', 'This publication neither creates a Discord role nor activates live dispatch.', 'Tithe Payer requires at least 25', 'Patron of the Treasury at least 100', 'Benefactor of Olympus at least 500', 'TITHE reference', 'season’s end']) assert.ok(book.includes(phrase), phrase);
    assert.equal(organization.permissionsApplied, undefined); assert.equal(organization.currentOwnerDirection.permissionsApplied, false);
    assert.equal(organization.councilComposition.eligibleSeatIssued, false);
    assert.equal(organization.terms.filter(t => t.classification === 'native').length, 10);
  });
  check('the targeted organization module still parses without executing browser or chart actions', () => {
    const source = fs.readFileSync(path.join(worker, 'public/static/organization-view.js'), 'utf8');
    const result = ts.transpileModule(source, { fileName: 'organization-view.js', reportDiagnostics: true, compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    assert.equal(result.diagnostics?.length ?? 0, 0);
    const module = { exports: {} }; new Function('module', 'exports', result.outputText)(module, module.exports);
    assert.equal(typeof module.exports.renderOrganization, 'function');
  });
  check('B profile preserves all historical arrays while refusing old/new Officer/Treasurer reinterpretation', () => {
    assert.deepEqual(Array.from(qr.NATIVE_RANKS), ['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate']);
    assert.deepEqual(Array.from(qr.TREASURER_NATIVE_RANKS), ['Guild Master','Treasurer','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate']);
    const chosen = native.parseNativeRoleMap(JSON.stringify({profile:'ten-rank-council-treasurer-v1',roles:roleIds}));
    assert.equal(native.mappedNativeRole('High Council',1,chosen),roleIds[1]);
    assert.equal(native.mappedNativeRole('Treasurer',2,chosen),roleIds[2]);
    assert.equal(native.mappedNativeRole('Officer',3,chosen),roleIds[3]);
    assert.throws(()=>native.mappedNativeRole('Officer',2,chosen),/name_index_mismatch/);
    assert.throws(()=>native.mappedNativeRole('Treasurer',2,oldMap),/name_index_mismatch/);
    assert.throws(()=>native.privilegedNativeMap(chosen.profile,{ROLE_GUILD_LEADER:roleIds[0],ROLE_OFFICER:roleIds[1],ROLE_RAID_LEADER:roleIds[2]}),/not_qualified/);
    assert.equal(native.identifyConfiguredNativeProfile(expected.map((rank,rank_index)=>({rank,rank_index})),chosen),'ten-rank-council-treasurer-v1');
    assert.throws(()=>native.identifyNativeProfile(expected.map((rank,rank_index)=>({rank,rank_index}))),/ambiguous_or_contradictory/);
    assert.equal(native.identifyNativeProfile([{rank:'High Council',rank_index:1}]),'ten-rank');
    assert.throws(()=>native.identifyConfiguredNativeProfile(qr.SIGNER_NATIVE_RANKS.map((rank,rank_index)=>({rank,rank_index})),chosen),/name_index_mismatch/);
    assert.throws(()=>native.identifyConfiguredNativeProfile([{rank:'Officer',rank_index:2}],chosen),/name_index_mismatch/);
    assert.equal(native.identifyConfiguredNativeProfile([{rank:'High Council',rank_index:1}],chosen),chosen.profile);
    const oldKey=offices.OFFICE_APPOINTMENTS.find(e=>e.key==='rank_officer_alt');assert.ok(oldKey);assert.equal(oldKey.nativeIndex,3);assert.deepEqual(oldKey.recommendedNativeSlots,[3]);assert.equal(oldKey.group,'native');assert.equal(oldKey.aliasOf,undefined);
    const treasuryKey=offices.OFFICE_APPOINTMENTS.find(e=>e.key==='rank_treasurer');assert.equal(treasuryKey.group,'office');assert.equal(treasuryKey.aliasOf,'office_86');assert.equal(treasuryKey.nativeIndex,undefined);
  });
  check('interim A v3 drafts are preserved byte-for-byte under their exact historical policy', () => {
    const interim = Model.createDraft(catalogue,['gm','treasurer','officer','officeralt','raidlead','veteran','raider','member','alt','initiate']);
    interim.schema=Model.INTERIM_SCHEMA;interim.source.policy=Model.INTERIM_POLICY;
    const original=JSON.stringify(interim);assert.equal(JSON.stringify(Model.importDraft(original,catalogue)),original);
    const forged=JSON.parse(original);forged.source.policy=Model.POLICY;assert.throws(()=>Model.importDraft(JSON.stringify(forged),catalogue),/source reference/);
    assert.equal(Model.SCHEMA,'olympus-rank-draft/v5');
  });
  check('chosen seasonal tiers and restored PvP activity titles agree with exact human ruling', () => {
    assert.deepEqual(organization.currentOwnerDirection.cosmeticTitheTiers,[{name:'Tithe Payer',minimumAdditionalGold:25},{name:'Patron of the Treasury',minimumAdditionalGold:100},{name:'Benefactor of Olympus',minimumAdditionalGold:500}]);
    assert.equal(organization.terms.find(t=>t.ordinal===70).label,'PvP Captain');assert.equal(organization.terms.find(t=>t.ordinal===71).label,'PvP Lead (PvP Leader)');
    assert.ok(organization.nodes.some(n=>n.title==='War Head for PvP'));assert.ok(organization.nodes.some(n=>n.title.includes('PvP')));
    const book=fs.readFileSync(path.join(worker,'public/static/governance/reconciled-book.md'),'utf8');assert.ok(book.includes('Fern Melder reports playing World of Warcraft Forever on PVP - Alliance'));assert.ok(book.includes('D03 Historical owner-reported game diagnostics'));assert.equal((book.match(/23 October 2026 annotation: this dated PVP - Alliance observation remains historical/g)||[]).length,2);
    assert.ok(!book.includes('Bronze Patron'));assert.ok(!book.includes('rolling ninety-day recognition period'));
  });
  check('public direction own-copy projection is exact and switch/activation controls remain closed', () => {
    const publication=load('ruleset-publication-data'),project=revision=>publication.projectOwnRulesetPublication({profile_revision:revision}).profile_revision;
    assert.equal(project(profile.currentRulesetProfile().revision),profile.currentRulesetProfile().revision);
    assert.equal(project(profile.historicalBetaRulesetProfile().revision),profile.historicalBetaRulesetProfile().revision);
    assert.equal(project('forever-release-test1'),'forever-release-test1');assert.equal(project('arbitrary restored text'),null);assert.equal(project(profile.currentRulesetProfile().revision+'-spoof'),null);
    assert.equal(profile.parseRulesetProfile(profile.currentRulesetProfile()).phase,'public_direction');assert.equal(profile.parseFutureProfileSecret(JSON.stringify(profile.currentRulesetProfile())),null);
    const readiness=profile.rulesetSwitchReadiness(resolved);assert.equal(readiness.mode,'beta');assert.equal(readiness.currentRevision,profile.currentRulesetProfile().revision);assert.equal(readiness.available,false);assert.equal(readiness.ownerEligibilityQualified,false);assert.equal(readiness.projectionSyncQualified,false);assert.equal(readiness.futureProfileConfigured,false);
  });
  check('no network operation occurred', () => assert.equal(networkCalls, 0));
  console.log(`\n${checks} focused policy checks passed. No runtime/provider effects.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
