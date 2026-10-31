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
  for (const [key, guide] of Object.entries(guides).filter(([key]) => directory.keyToFamily[key])) {
    const specific = guide.boundaries.replaceAll(sharedBoundary218, '').trim();
    if (specific) check('.218 '+key+' keeps its own exact authority boundary', page.app.querySelector('[data-role-family203="'+directory.keyToFamily[key]+'"]').textContent.includes(specific));
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
      check('.218 '+family.key+' remains unavailable to public applications', !card.querySelector('[data-family-apply203]')
        && /Reserved seat|Governance body|Standing or recognition/.test(card.querySelector('summary').textContent));
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
    && !co.textContent.includes(guides.office_92.definition) && !co.textContent.includes('Council portfolio: Co-Guild Master'));
  const justice=page.app.querySelector('[data-role-family203="justice"]'), chancellor=page.app.querySelector('[data-role-family203="head_justice"]');
  check('.218 one judicial portfolio and one clearly named institution retain separate holder scopes', justice.querySelector('summary').textContent.includes('Council of Justice — institution')
    && !justice.querySelector('summary').textContent.includes('Head of Justice') && chancellor.querySelector('summary').textContent.includes('Lord High Chancellor / Head of Justice')
    && justice.querySelector('[data-appointment-scope203="office_26"]').textContent.includes('Council of Justice — institution — Appointed: Historical panel record.')
    && !justice.querySelector('[data-appointment-scope203="office_101"]') && !chancellor.querySelector('[data-appointment-scope203="office_26"]'));
  check('.218 historical War template cannot claim the two current portfolio records', guides.office_94.definition.includes('retained historical shared template')
    && !guides.office_94.definition.includes('Both current remit references use') && ['main_raid','main_pvp'].every(key => page.app.querySelector('[data-role-family203="'+key+'"]')));
  check('.218 one page scope bar replaces repetitive no-authority boilerplate', page.app.querySelectorAll('.role-scope218').length === 1
    && page.app.textContent.split('This is a descriptive website guide. A title or application changes no game rank').length === 2
    && !page.app.textContent.includes('Rank Slot & Technical Metadata') && !page.app.textContent.includes('Native-rank standing and its separate display record'));
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
  check('.218 one natural standing note replaces repeated generic card notices while distinct native rules remain', standingNotes218.filter(note=>note==='This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.').length>1&&page.app.querySelectorAll('.role-standing-scope218').length===1&&page.app.querySelector('.role-standing-scope218').textContent==='This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.'&&page.app.textContent.split('This label records current guild standing, rather than an open position. Ask the responsible officer to review a change in status.').length===2);
  check('.218 role reading performs no protected writes', requests.length > 0 && requests.every(row => row.method === 'GET'));
  console.log('\n'+ok+'/'+n+' passed'); process.exit(ok === n ? 0 : 1);
})().catch(error => {console.error(error);process.exit(1);});
`;
const execution218 = new Module(__filename, module);
execution218.filename = __filename; execution218.paths = Module._nodeModulePaths(__dirname);
execution218._compile(fixture218.slice(0, starts218[0].index) + '\n' + body218, __filename);
