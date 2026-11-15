'use strict';
// Evergreen Stage 2 (12 Nov 2026), talents lane: CL2-087 (10 November data, archive), CL2-088 (calculator Attach),
// CL2-089 (preset titles) and CL2-090 (presets legal and consistent with the 2 November notes on their own guide page).
// Plain Node over the shipped files and the real calculator; no network, D1, Workerd or browser.
// TALENTS_TEST_ROOT=<checkout> runs the same checks against another checkout (read-only), for the fail-before receipt.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const ts = require(require.resolve('typescript', { paths: [path.join(__dirname, '..')] }));
const repo = path.resolve(process.env.TALENTS_TEST_ROOT || path.join(__dirname, '../..'));
const worker = path.join(repo, 'worker'), folder = path.join(worker, 'public/static/talents');
const read = (...p) => fs.readFileSync(path.join(...p)), readText = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const exists = p => fs.existsSync(p);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let passed = 0, failed = 0;
function check(name, run) {
  let ok = false, detail = '';
  try { const result = run(); ok = result === true; if (!ok) detail = typeof result === 'string' ? result : JSON.stringify(result); }
  catch (error) { detail = error.message; }
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + String(detail).slice(0, 400)));
}
const calc = (() => { const m = { exports: {} }; vm.runInNewContext(readText(folder, 'calculator.js'), { module: m }, { filename: 'calculator.js', timeout: 2000 }); return m.exports; })();
const dataBytes = read(folder, 'data.json'), data = JSON.parse(dataBytes);
const provenance = JSON.parse(readText(folder, 'provenance.json'));
const guides = JSON.parse(readText(worker, 'public/static/guides218.json'));
const flat = (d, cls) => d.classes.find(c => c.id === cls).trees.flatMap((tree, ti) => tree.talents.map(t => ({ ...t, ti, tree: tree.name })));
const ARCHIVED = '260cf99b52db', CURRENT = '02e1e101d1a5';
const archiveDir = path.join(folder, 'archive', ARCHIVED);

// --- CL2-087: the current snapshot is the 10 November export and provenance counts match the shipped bytes.
check('data.json is the 10 November export (revision 02e1e101d1a5, client 1.60.1.70755)', () =>
  data.revision === CURRENT && data.source.upstreamGenerated === '2026-11-10' && data.source.clientBuilds.join() === '1.60.1.70755'
  && data.source.rawSHA256.startsWith(data.revision) && data.source.license === 'CC-BY-4.0' && data.source.url === 'https://talentsforever.com/data.json');
check('the calculator accepts the snapshot with its reviewed inventory', () => { const v = calc.validateData(data); return v.ok && v.talents === 467 && v.ranks === 1297 || JSON.stringify(v); });
check('provenance counts, bytes and hashes match data.json', () => {
  let talents = 0, ranks = 0, trees = 0;
  for (const c of data.classes) for (const t of c.trees) { trees++; for (const x of t.talents) { talents++; ranks += x.maxRank; } }
  const counts = { classes: data.classes.length, trees, talents, ranks };
  return JSON.stringify(provenance.counts) === JSON.stringify(counts) && JSON.stringify(data.counts) === JSON.stringify(counts)
    && provenance.normalizedBytes === dataBytes.length && provenance.normalizedSHA256 === sha(dataBytes)
    && provenance.source.rawSHA256 === data.source.rawSHA256 && provenance.source.upstreamGenerated === data.source.upstreamGenerated
    && JSON.stringify(provenance.source.limits) === JSON.stringify(data.source.limits) || JSON.stringify({ counts, p: provenance.counts });
});
check('provenance and data disclose the hotfix and development-notes limits', () =>
  data.source.limits.some(x => /hotfixes of 3, 4, 6 and 10 November 2026/.test(x)) && data.source.limits.some(x => /development notes of 2 November 2026/.test(x))
  && data.source.limits.some(x => /Legacy Talented/.test(x)) && data.source.limits.some(x => /Blizzard/.test(x)));
check('the licence file still names CC BY 4.0 and the source terms', () => /CC BY 4\.0/.test(readText(folder, 'LICENSE-DATA.txt')) && /talentsforever\.com\/terms/.test(readText(folder, 'LICENSE-DATA.txt')));

// --- CL2-087: the archive keeps old codes readable.
const archiveData = exists(path.join(archiveDir, 'data.json')) ? JSON.parse(readText(archiveDir, 'data.json')) : null;
const archiveArt = exists(path.join(archiveDir, 'art.json')) ? JSON.parse(readText(archiveDir, 'art.json')) : null;
check('the 16 October snapshot is kept as an archive with its own art map, both accepted by the calculator', () =>
  !!archiveData && archiveData.revision === ARCHIVED && calc.validateData(archiveData).ok && calc.validateArt(archiveData, archiveArt).ok);
check('the archive record in provenance pins the archived bytes', () => {
  const entry = (provenance.archive || []).find(a => a.revision === ARCHIVED), bytes = read(archiveDir, 'data.json');
  return !!entry && entry.normalizedSHA256 === sha(bytes) && entry.normalizedBytes === bytes.length && entry.normalizedSHA256 === '8b174d764836675b2b759050f441e2dfe12c7bad6a5b279ef39b05d8b1288a0c'
    && entry.data === '/static/talents/archive/260cf99b52db/data.json' && entry.label === '16 October beta data';
});
check('the calculator maps the archived revision to the shipped archive files and labels it', () =>
  calc.ARCHIVES && calc.ARCHIVES[ARCHIVED].data === '/static/talents/archive/260cf99b52db/data.json' && calc.ARCHIVES[ARCHIVED].art === '/static/talents/archive/260cf99b52db/art.json'
  && calc.REVIEWED[ARCHIVED].label === '16 October beta data' && !Object.hasOwn(calc.ARCHIVES, CURRENT));
const oldGuides = JSON.parse(readText(__dirname, 'fixtures/evergreen1112_old_presets.json'));
check('every 16 October preset code still decodes on the archive and is refused by the current data', () => {
  const bad = oldGuides.filter(p => !archiveData || !calc.parseBuild(archiveData, p.code).ok || calc.parseBuild(data, p.code).ok);
  return bad.length === 0 && oldGuides.length === 58 || bad.map(p => p.id).join(',');
});
check('app.js, the Discord replies and the calculator list the same archived revisions', () => {
  const app = readText(worker, 'public/static/app.js'), discord = readText(worker, 'src/guild-utilities219.ts');
  const appList = /TALENT_ARCHIVES218 = Object\.freeze\(\{ "([a-f0-9]{12})": "16 October beta data" \}\)/.exec(app), discordList = /ARCHIVED_TALENT_REVISIONS219:readonly string\[\]=\['([a-f0-9]{12})'\]/.exec(discord);
  return !!appList && !!discordList && appList[1] === ARCHIVED && discordList[1] === ARCHIVED && Object.keys(calc.ARCHIVES).join() === ARCHIVED;
});

// --- Art rule: reused official files only, no-art list for the rest.
const art = JSON.parse(readText(folder, 'art.json'));
check('art.json covers every current talent: an existing local icon file or the no-art list', () => {
  const v = calc.validateArt(data, art); if (!v.ok) return v.error;
  const missingFiles = Object.values(art.talentIcons).filter(url => !exists(path.join(worker, 'public', url)));
  return missingFiles.length === 0 && v.unavailable === art.talentIconsUnavailable.length && art.talentIconsUnavailable.every(id => !art.talentIcons[id]) || missingFiles.join(',');
});
// --- h4 (15 Nov 2026): the owner reported blank talent tiles and chose "Codex extracts them from the game (Recommended)". The 17 talents
// that CL2-087 listed without art use the icons Codex Root extracted from client 1.60.1.70938 (manifest SHA-256 below). Each icon name is the
// one the retained 10 November export (talentsforever-source-02e1e101d1a5.json, kept outside the repository) gives the talent; file id,
// size and SHA-256 are the manifest's (fileDataId, pngBytes, pngSHA256). The remaining columns are also the manifest's, copied from its
// records: fileNameHashHex, originalBytes and originalSHA256 (the client BLP), rgbaSHA256, and alphaExtrema (low, high). Every record
// gives dimensions 64 by 64.
const CLIENT_MANIFEST = '6a2cff460c2efd39eb5786eb3ed039ac0f6249f88eded9558d3dc889b71f0447';
const CLIENT_ICONS = [
  ['warrior-fury-reckless-swings', 'ability_warrior_bloodfrenzy', 132334, 5432, 'c5ac0d4f4adea666128dc96ee8e81ffa5c6ecd51009bf12deb5274fd843aa891', 'b66a3d0800d82650', 6660, 'd07edec799976ad1e6219918675dfec819188936b4d7f42d19bd2a5baca72bbd', '976323009f921b523e4731c2a7ab7d26b6b72fcd04cd270e63186fdb755ab427', 0, 255],
  ['paladin-holy-divine-precision', 'spell_holy_mindsooth', 135933, 4714, '7a61cd0e1f46429a63d98d7f73bb00ceb32a8d7f925ba13a31068de195d74b39', 'bac4160998dba55e', 3916, 'a8d988715f589dee9afdeca98a86733b1f526a747018dcd4603b138210746bb7', '50a8f3704d37c4576d88e18ff057cdb70f6d76f79f374a4d18ae7923c7e2fe36', 255, 255],
  ['paladin-holy-oath-of-light', 'spell_holy_greaterblessingoflight', 135909, 6486, 'd9a6004240faf1b91e06404a33b7fc3f4cbda5cf5a1cb50afed1b8d21277f674', 'f3ee61bf594fb785', 6660, 'b06d6ac3b3bc1e2498a99591690cb5e5a7eb696df6b699bc1816fe60e4bd37a7', '3856fb7df4a936695b0da97e713ead0e4cb0c84ed01db75f256cd517fca8d3f4', 0, 255],
  ['paladin-holy-boundless-light', 'ability_paladin_sacredcleansing', 236261, 6200, '5d9353802b85d61399a1a2a839296bc4a783a43e203f217d58eabd181ae95499', '8b0003a9f4b11cdd', 6660, '5e1874c1094a33754a1f67113a0974cf7a03c758186bc1d695f0b4d4f213bc53', '177ea9e2df420c4311f08c115c1f097621d534c058c21e650bd0adb0225853da', 0, 255],
  ['paladin-protection-stoicism', 'spell_holy_stoicism', 135978, 5435, '4f226327c1696579b4b674d58d47b9191332dbe01e539b883b7462771306ad85', 'f185a995bc5380fe', 6660, 'e8e5607064cac4af77a16ee617b7913795097714ab1ad4e1e72d6f7c1804d131', '6d159fbaabfe8b14d4e16fc57fdfda82f3404ab059f836572d0e953655e22dc3', 0, 255],
  ['paladin-protection-shieldsworn', 'spell_holy_greaterblessingofsanctuary', 135911, 6631, '37d74b9ef16d8fcb2bcb407806215a4f7c43b570637634a4bc6d2fdf39499bcd', '26deea1ece7ddaef', 6660, 'fb1b58c09c245d93082e69e7cb423f73607f1fb6d578cf17f81517cad2d53aab', '0958f724f1b34552d199d141b3353c972fa3b86ca2dade638bd453bc6bd4e58a', 0, 255],
  ['paladin-retribution-turn-evil', 'spell_holy_turnundead', 135983, 6693, '6097f1267467f434673aedabcd06e11e331d343eb5b2adbcce03842febfcc6b6', 'b58cf5c8602c557d', 3916, '4d1a56c3a97c2cd8ff193be039f12aee37900654e7d7e98ecbb649135b574aea', '0aa1a6d0629912301d9f78e930a0abd5c414f1ff5f3e1b0cea1b7ee2a08acb04', 255, 255],
  ['rogue-combat-composure', 'ability_rogue_fleetfooted', 132296, 6576, 'f89b14caa4a71e080514344fc3810fa02554e601f84053057b7bbda384345dd2', 'c43f5fb01ef837ab', 6660, 'd482f69285b608faaf151cddd9d6c7498264a6dfb03291344df26290227ffb4d', 'b3c37be343ac0403684f3c3e5f2f8230c5717117f2c42a47c410bc2b1f93c504', 0, 255],
  ['rogue-combat-flash-of-steel', 'ability_rogue_restlessblades', 458731, 5533, 'a77d6f531208fb4e9be79750ec5ac413dce61e11acd2b714844764e98e235469', '4327e0770e2c02fc', 6660, 'e30ea0467da599f9e2b66172076c51dd854aaaddc3fc085b48b254c78c283aeb', 'feae54e113d2471f72d64254a871c7ab43cd74919be019ae77d10e55dccaf6af', 0, 255],
  ['rogue-subtlety-quick-getaway', 'ability_rogue_blackjack', 458797, 6085, '6fc5387423032998a115135eb7e11f05d8289e4a1f68e4c995b9392d00496096', '23d6253e1bcbf84e', 6660, 'f1c7ae76855df3a66c08f2edcd21a891836820fc77a4d0520fc3e836af7411d9', '35da08d266b2b3a27c6732dc916c5f5147cf6b94a1236005be76c3015c96e237', 0, 255],
  ['rogue-subtlety-boot-knife', 'inv_sword_32', 135342, 5074, 'bdacfda938798b3cef1158d58836c0295430567c9aff6dcb9c781d68599a6ca0', 'dd4b46bae8e21946', 6660, '8993c8da1a2e57bd9741cbff013f1767c27ee456fa2cc112fd1e1b91cb96891b', 'e470a618aa5e8d4cc00fd2335ff384518e2baf7503bcde5255471777f121e0d3', 0, 255],
  ['rogue-subtlety-death-mark', 'ability_creature_cursed_02', 132094, 5780, 'fa71a7868887c24534b44e0165c4662cea859b0ece44d1a541265e294f8e7f19', '65d2dd5e980fc9b4', 6660, 'b521d6892d1779b3567bf7055805bad349a699aa624c6a9ed9aa5b7efdf02c51', 'c74787faada8173cd0ebe9c79b5b2da43ae890b8d0d982bd3f968faa10a99c90', 0, 255],
  ['shaman-elemental-call-of-thunder', 'spell_nature_callstorm', 136014, 6435, '7215ad3fc4e56efd14cae1bb6040bc5e89514a240103565fa4a54d2f50566a67', 'd77c37f860701bc3', 6660, '464c6a2bb1ce6a300da9d9c164223fb71436717eea2e6b6e397b3b7d608626a0', '1f902e0a5a016fd91187681659c8b8c09454f198a8b408098d510a5a4f049561', 0, 255],
  ['shaman-elemental-lightning-mastery', 'spell_nature_unrelentingstorm', 136111, 5760, '644185f5ea3cbe6781c2dee89eadb1f826b00110db05ebd1b11a0b70428ab90b', 'e2d0dcba99c974e5', 6660, 'e332c6e69348515635dd05b7d6028b82b68f9fcfc1f554c25d6883fea34bc864', '14c1134e4b8daeba74222297877d0e1a29b16d59c7c01c5bd3442255bb8d1e2d', 0, 255],
  ['druid-feral-combat-lacerate', 'ability_druid_lacerate', 132131, 6827, '7d293e682f93d51108bf2e8e0d805d221abdfc8f3d282abab437ae31fb5c52f6', 'f932e198f46d4184', 3916, '0ee9b6f7eef30fe8c482e74f52508079cff2e439e1f26c31e67b1b607aad1737', '5b41a0b47c73b91f398a3722ebc7f8e8c7fd186512ea3d7f8b0ccc474435d838', 255, 255],
  ['druid-feral-combat-predatory-discipline', 'spell_druid_savagery', 1033484, 5788, 'd28bcea56937e670ea6039b3fd935933c5ee3b9c6be6f36b24f9ba5a3e32c67b', '4516e6779ef3b7b4', 6660, 'c0516325f4528972a3c28e18bf51f614d9431f4db0f8d5b8a657fde539b98ae9', '197dac02a26c23792a19a2557b6527e80c80f11c898711ae74aed32a922ed544', 0, 255],
  ['druid-restoration-bloom', 'inv_misc_herb_felblossom', 134206, 6223, 'aafd02a0ec7e9b55d0343be5b9f709af660b62ddee70bd5ff923e956cd9fb5c6', '45095d393aea3b46', 6660, '0ba4b9260e48ed2131193573db753bb01a4182a2d82c94731a606c241073c069', 'f90ff44913d2d266d016c33322ae0e4f40513172def774163141808e4330ceaf', 0, 255],
];
check('h4: the 17 talents CL2-087 listed without art map to the client icons the export names, each a 64 by 64 PNG with the manifest\'s size and SHA-256', () => {
  const bad = [];
  for (const [id, icon, , bytes, digest] of CLIENT_ICONS) {
    const url = '/static/wow/talents/icon-' + icon + '.png', file = path.join(worker, 'public', url), b = exists(file) ? read(file) : Buffer.alloc(0);
    if (art.talentIcons[id] !== url) bad.push(id + ' maps to ' + art.talentIcons[id]);
    else if (b.length !== bytes || sha(b) !== digest) bad.push(id + ' file has ' + b.length + ' bytes, ' + sha(b).slice(0, 12));
    else if (b.readUInt32BE(16) !== 64 || b.readUInt32BE(20) !== 64) bad.push(id + ' is not 64 by 64');
  }
  const png = Object.entries(art.talentIcons).filter(([, url]) => url.endsWith('.png')).map(([id]) => id).sort().join();
  return bad.length === 0 && CLIENT_ICONS.length === 17 && new Set(CLIENT_ICONS.map(r => r[1])).size === 17 && png === CLIENT_ICONS.map(r => r[0]).sort().join()
    && art.talentIconsUnavailable.length === 0 || bad.join(' | ') || JSON.stringify({ png, unavailable: art.talentIconsUnavailable });
});
check('h4: every current talent has exactly one local icon: 467 = 450 talentsforever.com JPEGs + 17 client PNGs, 365 distinct files, none listed without art', () => {
  const v = calc.validateArt(data, art), urls = Object.values(art.talentIcons);
  const jpg = urls.filter(u => /^\/static\/wow\/talents\/icon-[a-z0-9_]+\.jpg$/.test(u)).length, png = urls.filter(u => /^\/static\/wow\/talents\/icon-[a-z0-9_]+\.png$/.test(u)).length;
  return v.ok && v.talents === 467 && v.unavailable === 0 && data.counts.talents === 467 && Object.keys(art.talentIcons).length === 467 && jpg === 450 && png === 17 && new Set(urls).size === 365
    || JSON.stringify({ v, jpg, png, unique: new Set(urls).size });
});
// h4 (finishing round): each row is compared with every value the manifest gives it, every count exactly, and the attribution exactly.
check('h4: art-provenance.json, asset-provenance.json and provenance.json say which talent icons are client extractions and which are talentsforever.com copies, with counts that add up', () => {
  const ap = JSON.parse(readText(folder, 'art-provenance.json')), wow = JSON.parse(readText(worker, 'public/static/wow/asset-provenance.json'));
  const ce = ap.clientExtractions, te = wow.talent_icon_client_extraction, c = ap.counts, urls = Object.values(art.talentIcons);
  const tf = new Set(ap.assets.map(r => '/' + r.path.slice('worker/public/'.length))), files = fs.readdirSync(path.join(worker, 'public/static/wow/talents'));
  const rows = CLIENT_ICONS.filter(([id, icon, fileDataId, bytes, digest, nameHash, blpBytes, blpDigest, rgbaDigest, alphaLow, alphaHigh]) => {
    const a = ce.assets.filter(r => r.talent === id), b = te.assets.filter(r => r.talent === id);
    return a.length === 1 && b.length === 1 && a[0].path === 'worker/public/static/wow/talents/icon-' + icon + '.png' && a[0].clientPath === 'interface/icons/' + icon + '.blp'
      && a[0].fileDataId === fileDataId && a[0].bytes === bytes && a[0].sha256 === digest
      && a[0].icon === icon && a[0].fileNameHashHex === nameHash && a[0].sourceBytes === blpBytes && a[0].sourceSHA256 === blpDigest && a[0].rgbaSHA256 === rgbaDigest && a[0].width === 64 && a[0].height === 64
      && b[0].asset === '/static/wow/talents/icon-' + icon + '.png' && b[0].clientPath === a[0].clientPath && b[0].fileDataId === fileDataId && b[0].assetBytes === bytes && b[0].assetSha256 === digest
      && b[0].fileNameHashHex === nameHash && b[0].sourceBytes === blpBytes && b[0].sourceSha256 === blpDigest && b[0].rgbaSha256 === rgbaDigest && b[0].width === 64 && b[0].height === 64
      && JSON.stringify(b[0].alphaExtrema) === JSON.stringify([alphaLow, alphaHigh]);
  }).length;
  const relation = text => /rests on the retained Talents Forever export \(revision 02e1e101d1a5\)/.test(text) && /it is not taken from client data/.test(text);
  return rows === 17 && ce.assets.length === 17 && te.assets.length === 17 && ce.extractedBy === 'Codex Root' && te.extracted_by === 'Codex Root'
    && ce.clientVersion === '1.60.1.70938' && te.clientVersion === '1.60.1.70938' && ce.manifestSHA256 === CLIENT_MANIFEST && te.manifest_sha256 === CLIENT_MANIFEST
    && ce.limits.some(relation) && relation(te.talent_icon_relationship)
    && te.scope.includes('(369 icon JPEGs and 27 tree backgrounds) are exact copies from talentsforever.com, not client extractions') && te.scope.includes('396 + 17 = 413 files')
    && ap.assets.length === 396 && ap.assets.every(r => r.sourceURL.startsWith('https://talentsforever.com/assets/')) && ap.limits[0].startsWith('The 396 files under assets are')
    && files.length === 413 && files.every(f => tf.has('/static/wow/talents/' + f) !== ce.assets.some(r => r.path === 'worker/public/static/wow/talents/' + f))
    && c.talentsForeverIconFiles === 369 && c.talentsForeverBackgroundFiles === 27 && c.clientIconFiles === 17 && c.files === 413
    && c.talentsForeverIconFiles + c.talentsForeverBackgroundFiles + c.clientIconFiles === c.files
    && c.talents === 467 && c.talentsWithoutIcon === 0 && c.talentsWithClientIcon === 17 && c.talentsWithTalentsForeverIcon === urls.filter(u => tf.has(u)).length
    && c.talentsWithTalentsForeverIcon + c.talentsWithClientIcon + c.talentsWithoutIcon === c.talents
    && c.uniqueIcons === new Set(urls).size && c.uniqueTalentsForeverIcons === new Set(urls.filter(u => tf.has(u))).size && c.uniqueClientIcons === 17
    && c.uniqueTalentsForeverIcons + c.uniqueClientIcons === c.uniqueIcons
    && c.classes === 9 && c.classes === data.classes.length && c.trees === 27 && c.trees === data.classes.reduce((n, k) => n + k.trees.length, 0)
    && c.backgrounds === 27 && c.backgrounds === c.talentsForeverBackgroundFiles && c.backgrounds === new Set(Object.values(art.treeBackgrounds)).size
    && JSON.stringify(c) === JSON.stringify({ classes: 9, trees: 27, talents: 467, uniqueIcons: 365, backgrounds: 27, talentsWithoutIcon: 0, talentsWithTalentsForeverIcon: 450, talentsWithClientIcon: 17,
      uniqueTalentsForeverIcons: 348, uniqueClientIcons: 17, talentsForeverIconFiles: 369, talentsForeverBackgroundFiles: 27, clientIconFiles: 17, files: 413 })
    && ap.attribution === 'World of Warcraft artwork copyright Blizzard Entertainment. Reference files under assets distributed by Talents Forever; the files under clientExtractions were extracted from the game client by Codex Root.'
    && provenance.artImportNote.includes('17 icons that Codex Root extracted from the game client 1.60.1.70938') && !provenance.artImportNote.includes('no-art tile')
    || JSON.stringify({ rows, counts: c, files: files.length });
});

// --- CL2-089/CL2-090: presets.
check('guides218.json pins the current revision and client build', () => guides.talentRevision === data.revision && guides.talentClientBuild === data.source.clientBuilds.join(', '));
check('all 58 presets decode legally on the 10 November data and spend their full budget', () => {
  const bad = [];
  for (const p of guides.presets) {
    const parsed = calc.parseBuild(data, p.code);
    if (!parsed.ok || parsed.build.className !== p.classId || parsed.build.level !== p.level || parsed.points !== p.level - 9 || parsed.points !== p.points
      || JSON.stringify(parsed.treePoints) !== JSON.stringify(p.treePoints)) bad.push(p.id + ':' + (parsed.error || parsed.points));
  }
  return guides.presets.length === 58 && bad.length === 0 || bad.join(' ');
});
check('no preset title starts with "Olympus starting point ·"', () => guides.presets.every(p => !/^Olympus starting point/.test(p.label)));
check('each spec lists only presets of its own class and spec, and every preset is reviewed for this data', () =>
  guides.classes.every(c => c.specs.every(s => s.presets.every(id => { const p = guides.presets.find(x => x.id === id); return p && p.classId === c.id && p.specId === s.id; })))
  && guides.presets.every(p => p.provenance.reviewedAt === '2026-11-12'));
check('preset notes carry no stale beta or recheck wording', () => {
  const stale = guides.presets.filter(p => p.why.some(w => /October beta|beta preset|Recheck these|still contains points|November 2 changes:/i.test(w)));
  return stale.length === 0 || stale.map(p => p.id).join(',');
});
check('guide talent-change counts equal the snapshot counts for every spec and class', () => {
  const bad = [];
  for (const c of guides.classes) {
    const source = data.classes.find(x => x.id === c.id), sum = { changed: 0, same: 0, moved: 0, new: 0, classicOnly: 0 };
    c.specs.forEach((s, i) => {
      const tree = source.trees[i], w = { changed: 0, same: 0, moved: 0, new: 0, classicOnly: tree.removedClassic.length };
      for (const t of tree.talents) w[t.classic.status]++;
      for (const k of Object.keys(sum)) sum[k] += w[k];
      if (tree.id !== s.id || JSON.stringify(w) !== JSON.stringify(s.whatChanged)) bad.push(c.id + '/' + s.id);
    });
    const row = guides.classSummary.find(x => x.id === c.id);
    if (Object.keys(sum).some(k => row[k] !== sum[k])) bad.push(c.id);
  }
  return bad.length === 0 || bad.join(',');
});

// --- CL2-090: the 2 November notes each guide page quotes (source 150) against the presets of that class.
// Each rule names the exact words it rests on; the test first proves those words are on the class's own guide page.
const NOTES = guides.sources.findIndex(s => s.url === 'https://us.forums.blizzard.com/en/wow/t/2360696/9');
const RULES = [
  ['warrior', 'Improved Tactical Mastery three points', { cap: ['Improved Tactical Mastery', 3] }],
  ['warrior', 'Bloodthrill two points', { cap: ['Bloodthrill', 2] }],
  ['warrior', 'Flurry has three ranks and no longer needs Death Wish', { cap: ['Flurry', 3], noRequirement: 'Flurry' }],
  ['warrior', 'Death Wish leads to Bloodthirst', { requires: ['Bloodthirst', 'Death Wish'] }],
  ['paladin', 'loses Improved Seal of Fury and One-Handed Weapon Specialization', { removed: ['Improved Seal of Fury', 'One-Handed Weapon Specialization'] }],
  ['paladin', 'loses Instrument of Law', { removed: ['Instrument of Law'] }],
  ['paladin', 'replaces the old Twist of Light capstone with Unsealed Wrath', { removed: ['Twist of Light'], requires: ['Unsealed Wrath', 'Repentance'] }],
  ['paladin', 'Spiritual Focus has five points on row 1. Reverence has two points on row 2.', { cap: ['Reverence', 2], max: ['Spiritual Focus', 5], row: [['Spiritual Focus', 1], ['Reverence', 2]] }],
  ['paladin', 'Divine Precision grants 4% or 8% hit', { cap: ['Divine Precision', 2] }],
  ['paladin', 'Conviction adds 2%, 4% or 6% crit', { cap: ['Conviction', 3] }],
  ['paladin', 'Two points give 15% or 30% more shield block value', { cap: ['Shield Specialization', 2] }],
  ['paladin', 'Vengeance now needs Seal of Command', { requires: ['Vengeance', 'Seal of Command'] }],
  ['rogue', 'Assassination loses Murder', { removed: ['Murder'] }],
  ['rogue', 'Relentless Strikes takes five points, Lethality two, and Seal Fate three', { max: ['Relentless Strikes', 5], cap: ['Lethality', 2], cap2: ['Seal Fate', 3] }],
  ['rogue', 'Dual Wield Specialization gives 25% or 50% off-hand damage over two ranks', { cap: ['Dual Wield Specialization', 2] }],
  ['rogue', 'Subtlety loses Improved Distract, Quietus, Cutthroat and Thousand Cuts', { removed: ['Improved Distract', 'Quietus', 'Cutthroat', 'Thousand Cuts'] }],
  ['rogue', 'Death Mark is the row-7 finisher', { row: [['Death Mark', 7]] }],
  ['priest', 'Blizzard replaced Binding Heal with Holy Binding', { removed: ['Binding Heal'], present: ['Holy Binding'] }],
  ['shaman', 'Call of Thunder replaces Lava Burst', { removed: ['Lava Burst'], present: ['Call of Thunder'] }],
  ['shaman', 'Elemental Mastery is now Lightning Mastery', { removed: ['Elemental Mastery'], present: ['Lightning Mastery'] }],
  ['mage', 'Blizzard removed Arcane Focus, Frost Blast and Piercing Ice', { removed: ['Arcane Focus', 'Frost Blast', 'Piercing Ice'] }],
  ['mage', 'Precision in the Frost tree now improves hit with all spells by 2%, 4% or 6%', { cap: ['Precision', 3] }],
  ['mage', 'Critical Mass now caps at three points', { cap: ['Critical Mass', 3] }],
  ['mage', 'Five points in Incineration', { max: ['Incineration', 5] }],
  ['mage', 'Missile Barrage moved to row 2', { row: [['Missile Barrage', 2]] }],
  ['druid', 'Berserk and Gift of the Earthmother were removed', { removed: ['Berserk', 'Gift of the Earthmother'] }],
  ['druid', 'Furor moves to Feral in exchange for Heart of the Wild, and Restoration gains Bloom', { tree: [['Furor', 'Feral Combat'], ['Heart of the Wild', 'Restoration'], ['Bloom', 'Restoration']] }],
  ['druid', 'Lacerate is a one-point Feral talent on row 4', { max: ['Lacerate', 1], row: [['Lacerate', 4]] }],
  ['druid', 'Predatory Discipline leads to Shifting Power', { requires: ['Shifting Power', 'Predatory Discipline'] }],
];
function quotedOnPage(cls) {
  const out = [];
  const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') { if (Array.isArray(value.sources) && value.sources.includes(NOTES)) out.push(value.text || value.value || ''); Object.values(value).forEach(walk); } };
  walk(guides.classes.find(c => c.id === cls));
  return out.join('\n');
}
check('every rule quotes words that the class guide page attributes to the 2 November notes', () => {
  const missing = RULES.filter(([cls, quote]) => !quotedOnPage(cls).includes(quote));
  return NOTES >= 0 && missing.length === 0 || missing.map(r => r[0] + ': ' + r[1]).join(' | ');
});
check('the 10 November data agrees with every quoted 2 November note', () => {
  const bad = [];
  for (const [cls, quote, rule] of RULES) {
    const talents = flat(data, cls), byName = name => talents.find(t => t.name === name);
    for (const name of rule.removed || []) if (byName(name)) bad.push(cls + ' still has ' + name);
    for (const name of rule.present || []) if (!byName(name)) bad.push(cls + ' lacks ' + name);
    for (const [name, n] of [rule.cap, rule.cap2, rule.max].filter(Boolean)) if (!byName(name) || byName(name).maxRank !== n) bad.push(cls + ' ' + name + ' ranks ' + (byName(name) || {}).maxRank);
    for (const [name, row] of rule.row || []) if (!byName(name) || byName(name).row !== row) bad.push(cls + ' ' + name + ' row');
    for (const [name, tree] of rule.tree || []) if (!byName(name) || byName(name).tree !== tree) bad.push(cls + ' ' + name + ' tree');
    if (rule.requires) { const [child, parent] = rule.requires; if (!byName(child) || byName(child).requires !== (byName(parent) || {}).id) bad.push(cls + ' ' + child + ' requirement'); }
    if (rule.noRequirement && (!byName(rule.noRequirement) || byName(rule.noRequirement).requires)) bad.push(cls + ' ' + rule.noRequirement + ' still has a requirement');
  }
  return bad.length === 0 || bad.join(' | ');
});
check('no preset contradicts a quoted 2 November note on its own guide page', () => {
  const bad = [];
  for (const p of guides.presets) {
    const parsed = calc.parseBuild(data, p.code); if (!parsed.ok) { bad.push(p.id + ' undecodable'); continue; }
    const talents = flat(data, p.classId), rankOf = name => { const i = talents.findIndex(t => t.name === name); return i < 0 ? 0 : parsed.build.ranks[i]; };
    for (const [cls, , rule] of RULES) {
      if (cls !== p.classId) continue;
      for (const [name, cap] of [rule.cap, rule.cap2].filter(Boolean)) if (rankOf(name) > cap) bad.push(p.id + ' ' + name);
      if (rule.requires && rankOf(rule.requires[0]) && !rankOf(rule.requires[1])) bad.push(p.id + ' ' + rule.requires[0] + ' without ' + rule.requires[1]);
      // A removed talent may be named only to say it is gone; it can never be recommended.
      for (const name of rule.removed || []) for (const line of p.why) for (const sentence of line.split(/(?<=\.)\s+/)) {
        if (sentence.includes(name) && !/removed|gone|replaced|no longer|became|formerly|renamed|is now/i.test(sentence)) bad.push(p.id + ' recommends ' + name);
      }
    }
  }
  return bad.length === 0 || bad.join(' | ');
});
check('the preset whose intent no longer fits says so in its note', () => {
  const p = guides.presets.find(x => x.id === 'rogue-assassination-leveling-30');
  return !!p && p.why.some(w => /no longer fits a level-30 build/.test(w)) && !/Mutilate/.test(p.label);
});

// --- Everything else that reads the snapshot.
check('guide-builds179.js offers only unchanged, legal publisher allocations for the current revision', () => {
  const ctx = { window: {} }; vm.runInNewContext(readText(folder, 'guide-builds179.js'), ctx); const g = ctx.window.OlympusTalentGuides;
  const bad = g.records.filter(r => { const parsed = calc.parseBuild(data, r.code); return !parsed.ok || parsed.points !== r.points || JSON.stringify(parsed.treePoints) !== JSON.stringify(r.treePoints); });
  const totals = g.sources.every(s => s.accepted === g.records.filter(r => r.className === s.className).length);
  return g.revision === data.revision && bad.length === 0 && totals || JSON.stringify({ revision: g.revision, bad: bad.map(r => r.id) });
});
check('the level-60 sheet files are pinned to the current data and reference only current talents', () => {
  const naked = JSON.parse(readText(folder, 'naked60-186.json')), effects = JSON.parse(readText(folder, 'stat-effects186.json'));
  const ids = new Set(data.classes.flatMap(c => c.trees.flatMap(t => t.talents.map(x => x.id))));
  const stray = effects.components.filter(c => !ids.has(c.talentId)).map(c => c.id);
  return naked.build.talentRevision === data.revision && naked.dataJsonSHA256 === sha(dataBytes) && effects.source.talentRevision === data.revision
    && effects.source.dataJsonSHA256 === sha(dataBytes) && effects.counts.components === effects.components.length && stray.length === 0 || stray.join(',');
});
check('the build comparison module is pinned to the current data', () => {
  const ctx = { module: { exports: {} }, TextEncoder }; vm.runInNewContext(readText(folder, 'analysis.js'), ctx);
  const src = /const SOURCE = Object\.freeze\(\{ revision: "([a-f0-9]{12})", rawSHA256: "([a-f0-9]{64})", normalizedSHA256: "([a-f0-9]{64})"/.exec(readText(folder, 'analysis.js'));
  return !!src && src[1] === data.revision && src[2] === data.source.rawSHA256 && src[3] === sha(dataBytes);
});

// --- Worker contract and Discord replies (TypeScript transpiled in memory, as talent_build_attachment196_test does).
const cache = new Map();
function load(name) {
  name = name.replace(/^\.\//, '');
  if (!['talent-build-contract', 'talent-build-attachment'].includes(name)) throw Error('Unexpected dependency: ' + name);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const out = ts.transpileModule(readText(worker, 'src', name + '.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function('module', 'exports', 'require', out.outputText)(module, module.exports, load);
  return module.exports;
}
check('the generated Worker contract is current, regenerates byte for byte and pins the current revision', () => {
  const generator = require(path.join(repo, 'scripts/build-talent-build-contract.cjs')), contract = load('talent-build-contract');
  return generator.buildContract(repo) === readText(worker, 'src/talent-build-contract.ts') && contract.TALENT_SNAPSHOT_REVISION === data.revision
    && contract.TALENT_SNAPSHOT_DATA_SHA256 === sha(dataBytes) && contract.TALENT_SNAPSHOT_UPSTREAM_SHA256 === data.source.rawSHA256;
});
check('the Worker accepts every preset for attachment and keeps an unchanged 16 October code only as history', () => {
  const { talentBuildAttachment, unchangedHistoricalTalentBuild } = load('talent-build-attachment');
  const refused = guides.presets.filter(p => { const r = talentBuildAttachment(p.code); return !r || r.code !== p.code || r.points !== p.points; });
  const old = oldGuides[0];
  return refused.length === 0 && talentBuildAttachment(old.code) === null && unchangedHistoricalTalentBuild(old.code, old.code, old.classId, old.level) === old.code || refused.map(p => p.id).join(',');
});
check('the Discord talent replies name the 10 November data, not the 16 October snapshot', () => {
  const source = readText(worker, 'src/guild-utilities219.ts');
  return !/16 October beta talent snapshot|'16 October beta builds'/.test(source) && /encoded against the 10 November talent data/.test(source) && /made on the 16 October beta data/.test(source);
});

// --- Docs (follow-up item 11, 12 Nov 2026): the two talent docs state the 10 November snapshot, and every paragraph or
// bullet that still gives a 16 October number is labelled historical.
// h4 (15 Nov 2026, owner: "Codex extracts them from the game"): the 17 talents use client icons and none is listed, so the doc says so.
check('docs: talents-data169.md and talents-stats60-186.md describe the 10 November data and label the 16 October facts historical', () => {
  const doc = name => readText(repo, 'docs', name), bad = [];
  const d169 = doc('talents-data169.md'), s60 = doc('talents-stats60-186.md');
  const want169 = ['02e1e101d1a5', '1.60.1.70755', '3, 4, 6 and 10 November', '467 talents and 1,297 rank descriptions', '/static/talents/archive/260cf99b52db/', 'The 17 talents whose icon was not on file use icons\nextracted by Codex Root from the installed game client, build 1.60.1.70938, as 64 by 64 PNG files; none is listed in\n`talentIconsUnavailable`.',
    String(data.source.rawBytes).replace(/\B(?=(\d{3})+(?!\d))/g, ','), data.source.rawSHA256];
  for (const w of want169) if (!d169.includes(w)) bad.push('talents-data169.md lacks ' + w);
  const art = JSON.parse(readText(folder, 'art.json'));
  if (art.talentIconsUnavailable.length !== 0 || data.counts.talents !== 467 || data.counts.ranks !== 1297) bad.push('the stated counts no longer match the shipped files');
  const effects = JSON.parse(readText(folder, 'stat-effects186.json'));
  const c = effects.counts, wantS60 = [c.components + ' components in ' + c.talents + ' talents', c.textMatchesCurrent + ' components match byte for byte', c.withheldTextChanged + ' have changed rank text', '02e1e101d1a5'];
  for (const w of wantS60) if (!s60.includes(w)) bad.push('talents-stats60-186.md lacks ' + w);
  // A block (paragraph or bullet) that gives an old snapshot number must say it is historical or name 16 October.
  // In the sheet doc 1.60.1.70425 stays current as the DB2 build of its checks, so only the data doc refuses it.
  const STALE = /\b466\b|1,313|260cf99b52db|141 components|reachable in this snapshot|Priest and Shaman have none|This beta snapshot/;
  for (const [name, text, own] of [['talents-data169.md', d169, /\b70425\b/], ['talents-stats60-186.md', s60, /$^/]]) {
    const blocks = text.split(/\n\s*\n|\n(?=- )/);
    let historical = false;
    for (const b of blocks) {
      if (/^#{2,3} /m.test(b)) historical = /^#{2,3} Historical/m.test(b.match(/^#{2,3} .*$/m)[0]);
      if ((STALE.test(b) || own.test(b)) && !historical && !/Historical|16 October|archive|archived|Archive/.test(b)) bad.push(name + ': ' + b.trim().slice(0, 90));
    }
  }
  return bad.length === 0 || bad.slice(0, 6).join(' | ');
});

// --- CL2-088: the calculator's own Attach control uses the guide presets' attachment path.
check('the calculator offers Attach only for level 30/60, hands over the exact code and is absent from archived builds', () => {
  const source = readText(folder, 'calculator.js'), app = readText(worker, 'public/static/app.js');
  return /const attachAvailable = !readOnly\(\) && typeof options\.onAttach === "function"/.test(source)
    && /attach\.hidden = !levelOk/.test(source) && /options\.onAttach\(Object\.freeze\(\{ classId: cls\.id, level: build\.level, code: serializeBuild\(data, build\), label: "Calculator build" \}\)\)/.test(source)
    && /canAttach: talentAttachAllowed218\(\), attachReason: TALENT_ATTACH_CLOSED218, onAttach: attachTalentBuild218,\n\s+onBuildChange/.test(app)
    && (app.match(/onAttach: attachTalentBuild218/g) || []).length === 2;
});

// --- REV-UNI-5 / REV-SITEB-1 (12 Nov 2026): under the class H1 the tree names and "Guide builds" are H2 (styled as the
// old H3s), and the class buttons and the toolbar controls are 44 px touch targets.
check('REV-UNI-5: the calculator renders tree names and "Guide builds" as H2, and its CSS styles those H2s and no tree or guide H3', () => {
  const source = readText(folder, 'calculator.js'), css = readText(folder, 'calculator.css');
  return /h\("header", \{ class: "talents-tree-header" \}, image\(art\.treeIcons\[treeKey\]\), h\("h2", \{ text: tree\.name \}\)/.test(source)
    && /h\("div", \{ class: "talents-guide-heading" \}, h\("h2", \{ text: "Guide builds" \}\)/.test(source)
    && /\.talents-tree-header h2\{font-size:16px/.test(css) && /\.talents-guide-heading h2\{font-size:17px\}/.test(css) && !/\.talents-(?:tree-header|guide-heading) h3/.test(css);
});
check('REV-SITEB-1: the class buttons and the toolbar select and buttons have a 44 px minimum height', () => {
  const css = readText(folder, 'calculator.css');
  const classButton = /\.talents-classes \.talents-class-button\{[^}]*min-height:(\d+)px/.exec(css), toolbar = /\.talents-toolbar select,\.talents-toolbar button\{min-height:(\d+)px\}/.exec(css);
  return !!classButton && Number(classButton[1]) >= 44 && !!toolbar && Number(toolbar[1]) >= 44 || JSON.stringify({ classButton: classButton && classButton[1], toolbar: toolbar && toolbar[1] });
});
check('the build contract pins the shipped calculator (scripts/build-talent-build-contract.cjs --check)', () => {
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(repo, 'scripts/build-talent-build-contract.cjs'), '--check'], { cwd: repo, encoding: 'utf8', timeout: 60000 });
  return r.status === 0 || (r.stdout + r.stderr).slice(-300);
});

// Browser part (opt-in): node tests/evergreen1112_talents_test.cjs --base http://127.0.0.1:<harness> --cdp <port>
// counts heading jumps on /#/talents and measures the class buttons and the toolbar at 1280 and 375 px (member persona).
async function browserChecks(base, port) {
  const { launch, instrument, idle, viewport, sleep } = await import('file:///C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs');
  const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'talents-edge-'));
  const cdp = await launch({ port, profile }), st = await instrument(cdp);
  const result = (name, ok, detail) => { if (ok) passed++; else failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ' :: ' + JSON.stringify(detail)); };
  try {
    await cdp.send('Page.navigate', { url: base + '/__qa/member' }); await idle(st);
    for (const width of [1280, 375]) {
      await viewport(cdp, width, 900);
      await cdp.send('Page.navigate', { url: base + '/#/talents/warrior' }); await idle(st); await cdp.send('Page.reload', {}); await idle(st); await sleep(900);
      const r = await cdp.eval(`(() => {
        const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].filter(h => h.getClientRects().length);
        const lv = hs.map(h => Number(h.tagName[1])), jumps = [];
        for (let i = 1; i < lv.length; i++) if (lv[i] > lv[i - 1] + 1) jumps.push(hs[i - 1].tagName + ' ' + hs[i - 1].textContent.trim().slice(0, 24) + ' > ' + hs[i].tagName + ' ' + hs[i].textContent.trim().slice(0, 24));
        const height = e => Math.round(e.getBoundingClientRect().height * 10) / 10;
        const visible = [...document.querySelectorAll('.talents-class-button, #olympus-talent-level, .talents-toolbar button')].filter(e => e.getClientRects().length);
        return { h1: lv.filter(x => x === 1).length, first: lv[0], jumps, smallest: Math.min(...visible.map(height)), level: height(document.querySelector('#olympus-talent-level')),
          classButton: height(document.querySelector('.talents-class-button')), trees: [...document.querySelectorAll('.talents-tree-header h2')].length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`);
      result('browser ' + width + ' px: /#/talents has one H1, the three tree H2s and no heading jump', r.h1 === 1 && r.first === 1 && r.trees === 3 && r.jumps.length === 0, r);
      result('browser ' + width + ' px: the class buttons, level select and toolbar buttons are at least 44 px tall, with no page overflow', r.smallest >= 44 && r.overflow <= 0, r);
    }
    if (st.exceptions.length) result('browser: no page exceptions', false, st.exceptions.slice(0, 3));
  } finally { await Promise.race([cdp.close(), sleep(3000)]); try { cdp.proc.kill(); } catch { /* gone */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold it */ } }
}

// --- REV-UNI-3 (12 Nov 2026): the real /guide replies (guideLookup219 over the shipped guides218.json) carry a grade
// footer that matches the site's six grades (university/index.json and guides218.json) and the 10 November export, with
// no beta caveat, and every reply stays within Discord's embed limits. The file's database and Discord imports are stubs:
// the member check answers yes and no provider is contacted.
async function discordGuideFooter() {
  const stub = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key === 'currentGuildActor219' ? async () => true
    : key === 'destination' ? () => ({ host: 'verify.example' }) : () => { throw Error('unexpected call to ' + String(key)); } });
  const out = ts.transpileModule(readText(worker, 'src/guild-utilities219.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', out.outputText)(module, module.exports, name => ['./talent-build-contract', './talent-build-attachment'].includes(name) ? load(name) : stub);
  const env = { ASSETS: { fetch: async request => new Response(read(worker, 'public', new URL(request.url).pathname), { status: 200 }) } };
  const index = JSON.parse(readText(folder, '../university/index.json'));
  const asks = [['consumes', {}], ['buffs', {}], ['attunement', { raid: 'onyxia' }], ['attunement', { raid: 'mc' }]];
  for (const c of guides.classes) { asks.push(['class', { class: c.id }]); for (const s of c.specs) asks.push(['class', { class: c.id, spec: s.id }]); }
  const replies = [];
  for (const [sub, v] of asks) replies.push([sub + ' ' + JSON.stringify(v), await module.exports.guideLookup219(env, { id: '1' }, sub, v)]);
  const limits = e => (e.title || '').length <= 256 && (e.description || '').length <= 4096 && (e.fields || []).length <= 25
    && (e.fields || []).every(f => f.name.length <= 256 && f.value.length <= 1024 && f.value.length > 0) && (e.footer?.text || '').length <= 2048
    && (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length + (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0) <= 6000;
  const footer = replies[0][1].footer.text, legend = /^Grades: (.+?)\.(?= |$)/.exec(footer);
  const pairs = legend ? legend[1].split(' · ').map(x => [x[0], x.slice(2)]) : [];
  // Each footer label must say what the site's grade says (the key words of index.json's definition of that grade).
  const meaning = { A: /talent data, 10 November 2026 export/, B: /official Blizzard/, C: /published Forever guide or community/, D: /derived from Classic/, E: /Classic reference/, U: /^unavailable$/ };
  const siteSays = { A: /10 November 2026 export/, B: /Official Blizzard/, C: /Published Forever guide or community/, D: /Derived estimate from Classic/, E: /Classic reference/, U: /^Unavailable$/ };
  const problems = [];
  if (pairs.map(p => p[0]).join('') !== Object.keys(index.grades).join('') || Object.keys(index.grades).join('') !== Object.keys(guides.grades).join('')) problems.push('grade letters ' + pairs.map(p => p[0]).join(''));
  for (const [g, label] of pairs) if (!meaning[g] || !meaning[g].test(label) || !siteSays[g].test(index.grades[g]) || !siteSays[g].test(guides.grades[g])) problems.push('grade ' + g + ': ' + label);
  if (/beta|pinned|can differ|unknown/i.test(footer)) problems.push('stale footer: ' + footer);
  const comment = /\n( \/\/[^\n]*\n)+ const evidence=/.exec(readText(worker, 'src/guild-utilities219.ts'));
  if (!comment || /beta snapshot until replaced/.test(comment[0]) || !/10 November 2026 export/.test(comment[0])) problems.push('the comment above the footer does not describe the 10 November export');
  for (const [ask, e] of replies) {
    if (!e.footer || !e.footer.text.startsWith(legend ? legend[0] : '\u0000')) problems.push(ask + ': no shared footer');
    if (!limits(e)) problems.push(ask + ': over a Discord embed limit');
  }
  return problems.length === 0 && replies.length === 4 + 9 + 27 || problems.slice(0, 6).join(' | ') || 'replies ' + replies.length;
}

(async () => {
  {
    let ok = false, detail = '';
    try { const r = await discordGuideFooter(); ok = r === true; if (!ok) detail = String(r); } catch (error) { detail = error.message; }
    if (ok) passed++; else failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + 'REV-UNI-3: /guide replies end with the site\'s six grades and the 10 November export, no beta caveat, within Discord\'s embed limits' + (ok ? '' : ' :: ' + detail.slice(0, 400)));
  }
  const at = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  if (at('--base') && at('--cdp')) await browserChecks(at('--base'), Number(at('--cdp')));
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
