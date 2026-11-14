// Focused current role rendering through the existing real Worker/SQLite/miniDOM fixture.
// This leaf adds attribution assertions; the original full frontend suite and its roots remain unchanged.
const fs218 = require('node:fs'), path218 = require('node:path'), { Module } = require('node:module');
const fixture218 = fs218.readFileSync(path218.join(__dirname, 'frontend_check.cjs'), 'utf8');
const starts218 = [...fixture218.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts218.length !== 1) throw Error('one existing frontend fixture boundary required');
const body218 = String.raw`
(async () => {
  await siteUser(MEMBER, {global_name:'Role reader'}); await character(MEMBER,'Role Reader','Player-1-2181');
  const page = await openPage(MEMBER, {}, {bootTransform(boot) {
    boot.settings.appointed = {...boot.settings.appointed, office_26:'Historical panel record'};
  }}), requests = [];
  page.before((pathname, init) => { requests.push({pathname,method:init.method || 'GET'}); return false; });
  await page.go('#/roles');
  await waitFor(() => !!page.app.querySelector('[data-role-family203="bank_custody"]'), 'current role families');
  const directory = page.boot.meta.roleDirectory203, guides = page.boot.meta.roleGuides201;
  const sharedBoundary218 = 'This is a descriptive website guide. A title or application changes no game rank, Discord role, bank limit, signing authority or addon permission; actual access requires its separate authorized process.';
  // Fixed literal oracle, not expectations rebuilt from the rendered family cards.
  const boundarySeal218=require('./role_boundaries218_seal.cjs');
  const boundarySeal218Rows=Object.entries(guides).filter(([key])=>directory.keyToFamily[key]&&boundarySeal218.specificKeys.includes(key)).map(([key,guide])=>[key,typeof guide?.boundaries==='string'?guide.boundaries.replaceAll(sharedBoundary218,'').trim():'']).filter(([,text])=>text).sort(([a],[b])=>a<b?-1:a>b?1:0);
  check('.218 exactly40 source-specific boundary keys remain sealed', boundarySeal218.specificKeys.length===40 && boundarySeal218Rows.length===40 && JSON.stringify(boundarySeal218Rows.map(([key])=>key))===JSON.stringify(boundarySeal218.specificKeys));
  check('.218 every one of40 exact role-specific boundary texts remains sealed', require('node:crypto').createHash('sha256').update(JSON.stringify(boundarySeal218Rows)).digest('hex')===boundarySeal218.specificTextSHA256);
  for(const [key,familyKey,nodeKey] of boundarySeal218.placements){
    const specific=guides[key]?.boundaries.replaceAll(sharedBoundary218,'').trim();
    // CL2-188 (our 4c7b542): guild_master's boundary, inherited through aliasOf office_43, is stated once on the card, in office_43's scope.
    const card=page.app.querySelector('[data-role-family203="'+familyKey+'"]'),own=card?.querySelector('[data-role-key201="'+(key==='guild_master'?'office_43':nodeKey)+'"]') || card?.querySelector('.role-primary203');
    check('.218 '+key+(key==='guild_master'?' keeps its sealed boundary once, in the scope of office_43, which it aliases':' keeps its sealed boundary in its own declared source scope'), !!specific && directory.keyToFamily[key]===familyKey && !!own && own.textContent.includes(specific) && (key!=='guild_master' || card.textContent.split(specific).length===2));
  }
  const all = page.app.querySelectorAll('[data-role-key201]').map(node => node.getAttribute('data-role-key201')).sort();
  const expectedVisible = directory.families.flatMap(f => [f.primaryKey,...f.variants.filter(v=>['office','region','class'].includes(v.presentation)).map(v=>v.key)]).sort();
  check('.219 all140 source identities remain mapped while only70 canonical guides and genuine sub-offices render', Object.keys(directory.keyToFamily).length===142 && all.length===new Set(all).size && JSON.stringify(all)===JSON.stringify(expectedVisible) && page.app.querySelectorAll('[data-role-family203]').length===72);
  check('.219 no duplicate metadata drawers or stitched alias prose', !page.app.textContent.includes('Covered by the') && !page.app.textContent.includes('Related titles & rank details') && !page.app.textContent.includes('Also known as:') && !page.app.querySelector('[data-role-variant-group218="associations"]'));

  for (const family of directory.families) {
    const card = page.app.querySelector('[data-role-family203="'+family.key+'"]'), primary = card.querySelector('.role-primary203');
    const original = guides[family.primaryKey];
    // CL2-037 (our 4c7b542; RC-037 receipt, 4b406f6): a purely regional family states its two facts once, from the sheet its NA and EU seats share.
    const facts218 = ['raid_leader','raid_assist'].includes(family.key) ? guides[family.variants.find(v => v.presentation === 'region').key] : original;
    check('.218 primary '+family.key+' retains its complete current specification'+(facts218!==original?', with the two facts its regional seats share':''), !!primary && !!original
      && primary.textContent.includes(original.definition) && original.responsibilities.every(text => primary.textContent.includes(text))
      && original.expectations.every(text => primary.textContent.includes(text)) && primary.textContent.includes(facts218.commitment)
      && primary.textContent.includes(facts218.worksWith));
    for (const variant of family.variants) {
      const node = card.querySelector('[data-role-key201="'+variant.key+'"]'), guide = guides[variant.key];
      if (['office','region','class'].includes(variant.presentation)) {
        const full = node?.querySelector('.role-guide201');
        // CL2-037 (our 4c7b542; RC-037 4b406f6): a line or fact every regional (or every class) assignment shares is stated once, in the card's shared block.
        const peers218 = family.variants.filter(v => v.presentation === variant.presentation).map(v => guides[v.key]);
        const home218 = text => ['region','class'].includes(variant.presentation) && peers218.length > 1 && peers218.every(g => [...g.responsibilities, ...g.expectations, g.commitment, g.worksWith].includes(text)) ? card.querySelector('[data-role-shared1112="'+variant.presentation+'"]') : full;
        check('.218 attributable complete '+variant.key+' specification stays under its own title'+(['region','class'].includes(variant.presentation)?', except what every '+variant.presentation+' assignment shares, stated once on the card':''), !!full
          && node.querySelector('summary').textContent === variant.label
          && full.textContent.includes(guide.definition) && guide.responsibilities.every(text => !!home218(text)?.textContent.includes(text))
          && guide.expectations.every(text => !!home218(text)?.textContent.includes(text)) && !!home218(guide.commitment)?.textContent.includes(guide.commitment)
          && !!home218(guide.worksWith)?.textContent.includes(guide.worksWith) && !primary.textContent.includes(guide.definition));
      } else {
        check('.219 alias/rank '+variant.key+' is searchable through its canonical guide without a stub drawer', !node && directory.keyToFamily[variant.key]===family.key);

      }
    }
    if (['leader','high_council','officer_corps'].includes(family.tier) || family.kind === 'institution') {
      // CL2-036 (our 4c7b542, 9f866bd): one eligibility vocabulary; the badge reads Standing, Appointed or Reserved leadership seat.
      const expectedBadge218=family.kind==='status'?'Standing':family.kind==='institution'?'Appointed':'Reserved leadership seat';
      check('.218 '+family.key+' has its exact reserved-role or institution badge and no application control', !card.querySelector('[data-family-apply203]')
        && card.querySelector('summary').querySelector('.badge')?.textContent===expectedBadge218);
    }
  }
  for (const [familyKey, sourceKeys] of [['member',['member','office_55','rank_member']],['raider',['raider','office_75','rank_raider']]]) {
    const card=page.app.querySelector('[data-role-family203="'+familyKey+'"]');
    check('.218 '+familyKey+' stays one job and one application choice across native aliases', card.querySelectorAll('.role-guide201').length === 1
      && card.querySelectorAll('[data-family-apply203]').length === 1 && sourceKeys.every(key => directory.keyToFamily[key] === familyKey));
    check('.219 '+familyKey+' native standing is metadata on the main card, without a duplicate specification', !card.querySelector('[data-role-key201="rank_'+familyKey+'"]') && card.querySelector('summary .rank-office199').textContent.includes('Slot ') && !card.querySelector('.role-primary203 .rank-office199') && card.querySelector('.role-primary203').querySelectorAll('.role-guide201').length===1);

  }
  const vice=page.app.querySelector('[data-role-key201="office_92"]'), co=page.app.querySelector('[data-role-family203="co_gm"] .role-primary203');
  check('.218 Vice-GM succession duties cannot silently become Co-GM duties', vice.querySelector('.role-guide201').textContent.includes(guides.office_92.commitment)
    && !co.textContent.includes(guides.office_92.definition) && co.querySelectorAll('.role-reporting218').length===0 && page.app.querySelector('[data-role-family203="co_gm"] summary').textContent.includes('Hand of the Sovereign · Co-Guild Master'));
  const councilLineCasesP2=[
    ['co_gm','Council portfolio: Hand of the Sovereign · Co-Guild Master'],
    ['chief_intake','Council portfolio: Lord High Chancellor · Minister of the Chancery & Imperial Census'],
    ['minister_artisanry','Council portfolio: Lord High Artificer · Minister of Artisanry & The Guild Workshop'],
    ['minister_heraldry','Council portfolio: Lord High Seneschal · Minister of Court Protocol & Crown Estates'],
    ['treasurer','Council portfolio: Lord High Treasurer · Minister of the Imperial Exchequer'],
    ['propaganda','Council portfolio: Lord High Herald · Minister of Propaganda'],
  ];
  for(const [key,line] of councilLineCasesP2){
    const primary=page.app.querySelector('[data-role-family203="'+key+'"] .role-primary203');
    check('.218 Council reporting is stated once in the header or its own '+key+' primary scope',!!primary&&primary.querySelectorAll('.role-reporting218').filter(node=>node.textContent===line).length===(directory.families.find(f=>f.key===key).label===line.replace('Council portfolio: ','')?0:1));
  }
  const technical222=page.app.querySelector('[data-role-family203="architect"]');
  check('.222 architecture is technical Officer Corps support without a Council portfolio label',directory.families.find(f=>f.key==='architect').tier==='officer_corps'&&!technical222.querySelector('.role-reporting218')&&technical222.textContent.includes('outside the High Council'));
  check('.222 Propaganda has its own detailed responsibilities and boundaries',guides.office_102.responsibilities.length>=4&&guides.office_102.boundaries.includes('no moderation')&&directory.keyToFamily.office_102==='propaganda');
  const justice=page.app.querySelector('[data-role-family203="justice"]'), chancellor=page.app.querySelector('[data-role-family203="head_justice"]');
  check('.218 one judicial portfolio and one clearly named institution retain separate holder scopes', justice.querySelector('summary').textContent.includes('Council of Justice — institution')
    && !justice.querySelector('summary').textContent.includes('Lord High Justiciar') && chancellor.querySelector('summary').textContent.includes('Lord High Justiciar · Minister of Justice & The Privy Court')
    && justice.querySelector('[data-appointment-scope203="office_26"]').textContent.includes('Council of Justice — institution — Appointed: Historical panel record.')
    && !justice.querySelector('[data-appointment-scope203="office_101"]') && !chancellor.querySelector('[data-appointment-scope203="office_26"]'));
  check('.218 historical War template cannot claim the two current portfolio records', guides.office_94.definition.includes('retained historical shared template')
    && !guides.office_94.definition.includes('Both current remit references use') && ['main_raid','main_pvp'].every(key => page.app.querySelector('[data-role-family203="'+key+'"]')));
  // CL2-045 (our 7d62b9c): the scope rule is stated once, in new words; the guides' old shared sentence is shown nowhere.
  check('.218 one page scope bar replaces repetitive no-authority boilerplate', page.app.querySelectorAll('.role-scope218').length === 1
    && page.app.textContent.split('A title, listing or application grants no access, promotion or appointment and changes no game rank').length === 2
    && page.app.textContent.split('This is a descriptive website guide. A title or application changes no game rank').length === 1
    && !page.app.textContent.includes('Native-rank standing and its separate display record'));
  const rankDrawer218=page.app.querySelectorAll('details.technical-profile199').filter(node=>node.querySelector('summary')?.textContent==='Rank Slot & Technical Metadata');
  const nativeNames218=['Leader (Guild Master)','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
  // CL2-197 (our 4c7b542): the metadata drawer is gone; the game slot sits in the page's one rank ladder.
  const rankLadder218=page.app.querySelectorAll('ol.role-ranks203'),nativeSlots218=rankLadder218.length===1?rankLadder218[0].querySelectorAll('li'):[];
  check('.218 no metadata drawer, and the one rank ladder preserves all ten ordered native slots',rankDrawer218.length===0&&rankLadder218.length===1&&nativeSlots218.length===10&&nativeSlots218.every((node,index)=>node.textContent===(index+1)+nativeNames218[index]+'Slot '+index));
  const memberFamilies228=page.app.querySelector('[data-role-section201="members"]').querySelectorAll('[data-role-family203]');
  // CL2-214 (our 9f866bd, 4c7b542): families sort by native slot, the rank's own family first within its slot, then by name.
  check('.228 the member group lists its five native ranks in order, each first within its slot', memberFamilies228.map(node=>node.getAttribute('data-role-family203')).join() === 'veteran,mentor,raider,raid_standing,member,creative,inactive,moderation_restrictions,social,alt,initiate,probation,recruit,trial');
  check('.228 the Marshall is grouped with organized combat leadership', !!page.app.querySelector('[data-role-section201="raid"]').querySelector('[data-role-family203="marshall"]'));
  // CL2-035 (our 4c7b542): the shared See-also strip names the board link "Vote board".
  check('.228 a leadership guide links its exact existing board while its reserved application control remains absent',
    page.app.querySelector('[data-role-family203="officer"]').querySelector('a[href="#/vote/officer"]')?.textContent === 'Vote board'
    && !page.app.querySelector('[data-role-family203="officer"]').querySelector('[data-apply-role201]')
    && !!page.app.querySelector('[data-role-family203="member"]').querySelector('[data-apply-role201]'));
  for (const key of ['office_06','office_92','raid_leader_na','class_lead:mage','rank_raider']) {
    await page.go('#/roles/'+encodeURIComponent(key));
    const family=directory.families.find(row=>row.key===directory.keyToFamily[key]);
    await waitFor(() => !!page.app.querySelector('[data-role-family203="'+family.key+'"]'), 'direct scoped guide '+key);
    const node=page.app.querySelector('[data-role-key201="'+key+'"]');
    check('.219 direct '+key+' links open the canonical family, retaining real sub-office scope', page.app.querySelector('[data-role-family203="'+family.key+'"]').open && (!node || node.classList.contains('role-primary203') || node.open));
  }
  const reservedNotice218 = 'Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed.';
  await page.go('#/vote/officer');
  check('.228 the Officer board points back to the exact role family', page.app.querySelector('.board-role-content a[href="#/roles/officer"]')?.textContent === 'Role guide');
  for (const [route, surface] of [['#/roles','#application-directory201 .notice-box'],['#/vote','.frame'],['#/apply','#application-track-chooser228']]) {
    await page.go(route);
    await waitFor(() => !!page.app.querySelector(surface), 'reserved notice on '+route);
    // CL2-045 (our 7d62b9c): on #/roles the one box opens with the three open applications, then the reserved-seat rule.
    const notices=page.app.querySelectorAll(surface+' p').filter(node=>node.textContent===(route==='#/roles'?'Member, Raider and Artisan are open for applications. ':'')+reservedNotice218);
    check('.218 '+route+' explains reserved seats exactly once', notices.length===1&&page.app.textContent.split(reservedNotice218).length===2);
  }
  await page.go('#/roles');
  const standingNotes218=Object.values(guides).filter(guide=>guide.eligibility==='standing').map(guide=>guide.eligibilityNote);
  // CL2-036, CL2-214 (our 4c7b542, 9f866bd) and the owner ruling of 14 Nov (111867e): the section's open families, in slot order.
  const naturalStanding218='Raider and Guild Member accept applications. For a change in your guild standing, ask the responsible officer to review your record.';
  const standingSection218=page.app.querySelector('[data-role-section201="members"]'),standingIntro218=standingSection218?.querySelectorAll('.role-standing-scope218')||[];
  check('.218 one natural status-section intro suppresses only the old generic display text while distinct native rules remain', standingNotes218.filter(note=>note==='This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.').length>1&&standingIntro218.length===1&&standingIntro218[0].textContent===naturalStanding218&&page.app.querySelectorAll('.role-standing-scope218').length===1&&page.app.textContent.split(naturalStanding218).length===2&&!page.app.textContent.includes('This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.'));
  check('.218 role reading performs no protected writes', requests.length > 0 && requests.every(row => row.method === 'GET'));
  console.log('\n'+ok+'/'+n+' passed'); process.exit(ok === n ? 0 : 1);
})().catch(error => {console.error(error);process.exit(1);});
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename; execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixture218.slice(0, starts218[0].index) + '\n' + body218, __filename);
