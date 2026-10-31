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
  const boundarySeal218Rows=Object.entries(guides).filter(([key])=>directory.keyToFamily[key]).map(([key,guide])=>[key,typeof guide?.boundaries==='string'?guide.boundaries.replaceAll(sharedBoundary218,'').trim():'']).filter(([,text])=>text).sort(([a],[b])=>a<b?-1:a>b?1:0);
  check('.218 exactly40 source-specific boundary keys remain sealed', boundarySeal218.specificKeys.length===40 && boundarySeal218Rows.length===40 && JSON.stringify(boundarySeal218Rows.map(([key])=>key))===JSON.stringify(boundarySeal218.specificKeys));
  check('.218 every one of40 exact role-specific boundary texts remains sealed', require('node:crypto').createHash('sha256').update(JSON.stringify(boundarySeal218Rows)).digest('hex')===boundarySeal218.specificTextSHA256);
  for(const [key,familyKey,nodeKey] of boundarySeal218.placements){
    const specific=guides[key]?.boundaries.replaceAll(sharedBoundary218,'').trim();
    const card=page.app.querySelector('[data-role-family203="'+familyKey+'"]'),own=card?.querySelector('[data-role-key201="'+nodeKey+'"]');
    check('.218 '+key+' keeps its sealed boundary in its own declared source scope', !!specific && directory.keyToFamily[key]===familyKey && !!own && own.textContent.includes(specific));
  }
  const all = page.app.querySelectorAll('[data-role-key201]').map(node => node.getAttribute('data-role-key201')).sort();
  check('.218 every original role/rank/title key remains reachable exactly once', all.length === 140 && new Set(all).size === 140
    && JSON.stringify(all) === JSON.stringify(Object.keys(directory.keyToFamily).sort())
    && page.app.querySelectorAll('[data-role-family203]').length === 70);

  for (const family of directory.families) {
    const card = page.app.querySelector('[data-role-family203="'+family.key+'"]'), primary = card.querySelector('.role-primary203');
    const original = guides[family.primaryKey];
    check('.218 primary '+family.key+' retains its complete current specification', !!primary && !!original
      && primary.textContent.includes(original.definition) && original.responsibilities.every(text => primary.textContent.includes(text))
      && original.expectations.every(text => primary.textContent.includes(text)) && primary.textContent.includes(original.commitment)
      && primary.textContent.includes(original.worksWith));
    for (const variant of family.variants) {
      const node = card.querySelector('[data-role-key201="'+variant.key+'"]'), guide = guides[variant.key];
      if (['office','region','class'].includes(variant.presentation)) {
        const full = node?.querySelector('.role-guide201');
        check('.218 attributable complete '+variant.key+' specification stays under its own title', !!full
          && node.querySelector('summary').textContent === variant.label
          && full.textContent.includes(guide.definition) && guide.responsibilities.every(text => full.textContent.includes(text))
          && guide.expectations.every(text => full.textContent.includes(text)) && full.textContent.includes(guide.commitment)
          && full.textContent.includes(guide.worksWith) && !primary.textContent.includes(guide.definition));
      } else {
        check('.218 proven alias/rank '+variant.key+' keeps one unified specification', !!node && !node.querySelector('.role-guide201')
          && primary.textContent.includes(guide.definition) && guide.responsibilities.every(text => primary.textContent.includes(text))
          && guide.expectations.every(text => primary.textContent.includes(text)) && primary.textContent.includes(guide.commitment)
          && primary.textContent.includes(guide.worksWith));
      }
    }
    if (['leader','high_council','officer_corps'].includes(family.tier) || family.kind === 'institution') {
      const expectedBadge218=family.kind==='status'?'Standing or recognition — not an application':family.kind==='institution'?'Governance body — not an application':'Reserved seat — no applications';
      check('.218 '+family.key+' has its exact reserved-role or institution badge and no application control', !card.querySelector('[data-family-apply203]')
        && card.querySelector('summary').querySelector('.badge')?.textContent===expectedBadge218);
    }
  }
  for (const [familyKey, sourceKeys] of [['member',['member','office_55','rank_member']],['raider',['raider','office_75','rank_raider']]]) {
    const card=page.app.querySelector('[data-role-family203="'+familyKey+'"]');
    check('.218 '+familyKey+' stays one job and one application choice across native aliases', card.querySelectorAll('.role-guide201').length === 1
      && card.querySelectorAll('[data-family-apply203]').length === 1 && sourceKeys.every(key => directory.keyToFamily[key] === familyKey));
    check('.218 '+familyKey+' keeps its distinct native standing rule once inside the rank drawer', card.querySelector('[data-role-key201="rank_'+familyKey+'"]').textContent.includes(guides['rank_'+familyKey].eligibilityNote)
      && card.querySelectorAll('.role-standing218').length === 1 && !card.querySelector('.role-primary203').textContent.includes(guides['rank_'+familyKey].eligibilityNote));
  }
  const vice=page.app.querySelector('[data-role-key201="office_92"]'), co=page.app.querySelector('[data-role-family203="co_gm"] .role-primary203');
  check('.218 Vice-GM succession duties cannot silently become Co-GM duties', vice.querySelector('.role-guide201').textContent.includes(guides.office_92.commitment)
    && !co.textContent.includes(guides.office_92.definition) && co.querySelectorAll('.role-reporting218').filter(node=>node.textContent==='Council portfolio: Co-Guild Master / Hand of the Sovereign').length===1 && co.querySelectorAll('p.small.muted').filter(node=>node.textContent==='Co-Guild Master and Vice Guild Master').length===1);
  const councilLineCasesP2=[
    ['co_gm','Council portfolio: Co-Guild Master / Hand of the Sovereign'],
    ['chief_intake','Council portfolio: High Minister of the Chancery & Imperial Census'],
    ['minister_artisanry','Council portfolio: Grand Master Artisan'],
    ['minister_heraldry','Council portfolio: Lord High Herald / Minister of Heraldry'],
    ['treasurer','Council portfolio: Lord High Treasurer / Imperial Exchequer'],
    ['architect','Council portfolio: High Architect of Systems'],
  ];
  for(const [key,line] of councilLineCasesP2){
    const primary=page.app.querySelector('[data-role-family203="'+key+'"] .role-primary203');
    check('.218 fixed Council reporting line remains in its own '+key+' primary scope',!!primary&&primary.querySelectorAll('.role-reporting218').filter(node=>node.textContent===line).length===1);
  }
  const justice=page.app.querySelector('[data-role-family203="justice"]'), chancellor=page.app.querySelector('[data-role-family203="head_justice"]');
  check('.218 one judicial portfolio and one clearly named institution retain separate holder scopes', justice.querySelector('summary').textContent.includes('Council of Justice — institution')
    && !justice.querySelector('summary').textContent.includes('Head of Justice') && chancellor.querySelector('summary').textContent.includes('Lord High Chancellor / Head of Justice')
    && justice.querySelector('[data-appointment-scope203="office_26"]').textContent.includes('Council of Justice — institution — Appointed: Historical panel record.')
    && !justice.querySelector('[data-appointment-scope203="office_101"]') && !chancellor.querySelector('[data-appointment-scope203="office_26"]'));
  check('.218 historical War template cannot claim the two current portfolio records', guides.office_94.definition.includes('retained historical shared template')
    && !guides.office_94.definition.includes('Both current remit references use') && ['main_raid','main_pvp'].every(key => page.app.querySelector('[data-role-family203="'+key+'"]')));
  check('.218 one page scope bar replaces repetitive no-authority boilerplate', page.app.querySelectorAll('.role-scope218').length === 1
    && page.app.textContent.split('This is a descriptive website guide. A title or application changes no game rank').length === 2
    && !page.app.textContent.includes('Native-rank standing and its separate display record'));
  const rankDrawer218=page.app.querySelectorAll('details.technical-profile199').filter(node=>node.querySelector('summary')?.textContent==='Rank Slot & Technical Metadata');
  const nativeNames218=['Leader','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
  const nativeSlots218=rankDrawer218.length===1?rankDrawer218[0].querySelectorAll('li'):[];
  check('.218 exactly one CLOSED owner-named metadata drawer preserves all ten ordered native slots',rankDrawer218.length===1&&!rankDrawer218[0].open&&nativeSlots218.length===10&&nativeSlots218.every((node,index)=>node.textContent==='Rank '+(index+1)+' '+nativeNames218[index]+' · slot '+index));
  for (const key of ['office_06','office_92','raid_leader_na','class_lead:mage','rank_raider']) {
    await page.go('#/roles/'+encodeURIComponent(key));
    await waitFor(() => !!page.app.querySelector('[data-role-key201="'+key+'"]'), 'direct scoped guide '+key);
    const node=page.app.querySelector('[data-role-key201="'+key+'"]');
    check('.218 direct '+key+' links open their own readable group without changing identity', node.open
      && node.parentElement.open && page.app.querySelector('[data-role-family203="'+directory.keyToFamily[key]+'"]').open);
  }
  const reservedNotice218 = 'Leader, High Council and Officer Corps seats are reserved appointments. You cannot apply for them, including when no holder is listed.';
  for (const route of ['#/roles', '#/vote', '#/apply']) {
    await page.go(route);
    await waitFor(() => !!page.app.querySelector('#application-directory201'), 'reserved notice on '+route);
    const notices=page.app.querySelectorAll('#application-directory201 .notice-box p').filter(node=>node.textContent===reservedNotice218);
    check('.218 '+route+' explains reserved seats exactly once', notices.length===1&&page.app.textContent.split(reservedNotice218).length===2);
  }
  const standingNotes218=Object.values(guides).filter(guide=>guide.eligibility==='standing').map(guide=>guide.eligibilityNote);
  const naturalStanding218='These labels record a member’s current guild standing; they are not open positions. Ask the responsible officer to review a change in status.';
  const standingSection218=page.app.querySelector('[data-role-section201="standing"]'),standingIntro218=standingSection218?.querySelectorAll('.role-standing-scope218')||[];
  check('.218 one natural status-section intro suppresses only the old generic display text while distinct native rules remain', standingNotes218.filter(note=>note==='This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.').length>1&&standingIntro218.length===1&&standingIntro218[0].textContent===naturalStanding218&&page.app.querySelectorAll('.role-standing-scope218').length===1&&page.app.textContent.split(naturalStanding218).length===2&&!page.app.textContent.includes('This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.'));
  check('.218 role reading performs no protected writes', requests.length > 0 && requests.every(row => row.method === 'GET'));
  console.log('\n'+ok+'/'+n+' passed'); process.exit(ok === n ? 0 : 1);
})().catch(error => {console.error(error);process.exit(1);});
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename; execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixture218.slice(0, starts218[0].index) + '\n' + body218, __filename);
