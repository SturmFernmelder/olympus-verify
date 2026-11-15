// .184: the actual app.js, Worker and SQLite, with real completed board replies
// held briefly before delivery. No summary DTO, settings response or boot is replaced.
// Run from worker/: node tests/vote_labels184_test.cjs
const fs184 = require('node:fs'), path184 = require('node:path'), { Module } = require('node:module');
const fixture184 = path184.join(__dirname, 'frontend_check.cjs'), source184 = fs184.readFileSync(fixture184, 'utf8');
const starts184 = [...source184.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts184.length !== 1) throw Error('one original frontend fixture boundary required');
const body184 = String.raw`
// The shared minimal DOM keeps value only as an internal property. A browser's
// OPTION.value reflects its value attribute, which the actual app queries when
// updating picker text. Model that native browser fact in this leaf only.
const value184 = Object.getOwnPropertyDescriptor(Element.prototype, 'value');
Object.defineProperty(Element.prototype, 'value', { ...value184, set(value) {
  value184.set.call(this, value);
  if (this.tagName === 'OPTION') this.setAttribute('value', value);
} });
(async () => {
  await siteUser(MEMBER, { global_name: 'Vote Reader' });
  await character(MEMBER, 'Vote Reader Fixture', 'Player-1-018401');
  await siteUser(OTHER, { global_name: 'Vote Candidate' });
  await character(OTHER, 'Vote Candidate Fixture', 'Player-1-018402');
  const appointed184 = JSON.stringify({ co_gm: 'Example Co-GM', treasurer: 'Example Treasurer' });
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at) VALUES('appointed',?,?)", appointed184, now);
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at) VALUES('noVote',?,?)", JSON.stringify(['pvp_leader']), now);
  await fixtureRun("INSERT INTO site_applications(discord_id,position,backup1,board_at,answers,status,created_at,updated_at) VALUES(?,'officer','pvp_leader',?,'{}','submitted',?,?)", OTHER, now, now, now);
  const calls184 = [], label184 = (page, key) => page.boot.meta.ballots.find(role => role.key === key).label;
  const option184 = (page, key) => page.app.querySelector('.role-pick')?.options.find(option => option.value === key);
  const marker184 = (page, key, alt) => page.app.querySelector('.role-item[href="#/vote/' + key + '"] .n img[alt="' + alt + '"]');
  const closed184 = page => !page.app.querySelector('button.vote') && !page.app.querySelector('.board-results') && !page.app.querySelector('textarea');
  const prepared184 = async () => {
    const page = await openPage(MEMBER), calls = [];
    page.before((pathname, init) => { const call = { pathname, method: init.method || 'GET' }; calls.push(call); calls184.push(call); return false; });
    return { page, calls };
  };

  for (const [key184, suffix184, alt184, error184] of [
    ['co_gm', 'appointed', 'appointed', 'appointed'],
    ['treasurer', 'appointed', 'appointed', 'appointed'],
    ['pvp_leader', 'no public vote', 'no public vote', 'no_vote'],
  ]) {
    const { page: page184, calls: reads184 } = await prepared184();
    let held184 = false;
    page184.hold(pathname => { if (pathname === '/api/board') { held184 = true; return 180; } return 0; });
    await page184.go('#/vote/' + key184);
    await waitFor(() => held184, key184 + ' actual summary completed and held');
    const expected184 = label184(page184, key184) + ' (' + suffix184 + ')';
    check(key184 + ' initially renders its special mobile label and original rail marker while the real summary is pending', held184 && page184.app.querySelector('.board-summary-status')?.textContent === 'Refreshing role counts…' && option184(page184, key184)?.textContent === expected184 && !!marker184(page184, key184, alt184));
    // The surrounding chooser legitimately updates other roles' applicant counts.
    // Preserve the actual closure note, not that independently changing chooser.
    const closureNote184 = page184.app.querySelector('.board-role-content .notice-box');
    const closureText184 = closureNote184?.textContent;
    const closurePhrase184 = suffix184 === 'appointed'
      ? 'is filled by appointment rather than by the board, so there is nothing to vote on or write in here.'
      : "is a reserved appointment. Historical applications remain readable by leadership; there is no current application, public ballot or write-in invitation here.";
    await waitFor(() => page184.app.querySelector('.board-summary-status')?.textContent === '', key184 + ' delivered real summary');
    check(key184 + ' retains its special mobile label after the fresh zero-count summary', option184(page184, key184)?.textContent === expected184, option184(page184, key184)?.textContent);
    check(key184 + ' retains its original rail marker after the fresh summary', !!marker184(page184, key184, alt184));
    check(key184 + ' keeps its explanatory closure and never creates voting or write-in controls', closed184(page184) && !!closureNote184 && closureNote184.isConnected && page184.app.querySelector('.board-role-content .notice-box') === closureNote184 && closureNote184.textContent === closureText184 && closureText184.includes(closurePhrase184) && reads184.filter(call => call.pathname === '/api/board').length === 1 && !reads184.some(call => call.pathname.startsWith('/api/board/')));
    const refusal184 = await indexMod.default.fetch(new Request('https://guild.example/api/board/' + key184, { headers: { Cookie: page184.cookie, Origin: 'https://guild.example', 'X-Olympus': '2' } }), env(), ctx);
    const refused184 = await refusal184.json();
    check(key184 + ' remains closed at the actual Worker role endpoint', refusal184.status === 409 && refused184.error === error184);
  }

  const { page: open184, calls: openReads184 } = await prepared184();
  let openHeld184 = false;
  open184.hold(pathname => { if (pathname === '/api/board') { openHeld184 = true; return 180; } return 0; });
  await open184.go('#/vote/officer');
  await waitFor(() => openHeld184 && open184.app.querySelector('.board-results')?.getAttribute('aria-busy') === 'false', 'fresh open-role applicants while summary is held');
  check('ordinary open-role counts update from the genuine selected-role response before the held summary', openHeld184 && option184(open184, 'officer')?.textContent === label184(open184, 'officer') + ' (1)' && open184.app.querySelector('.role-item[aria-current="page"] .n')?.textContent === '0/1' && open184.app.querySelector('#role-applicants')?.textContent === '1 applicant');
  await waitFor(() => open184.app.querySelector('.board-summary-status')?.textContent === '', 'open-role summary delivered');
  check('the genuine summary preserves open-role totals and real candidate controls', option184(open184, 'officer')?.textContent === label184(open184, 'officer') + ' (1)' && open184.app.querySelector('.role-item[aria-current="page"] .n')?.textContent === '0/1' && !!open184.app.querySelector('button.vote') && openReads184.some(call => call.pathname.startsWith('/api/board/officer?')));
  const chooser184 = open184.app.querySelector('.role-pick'), rail184 = open184.app.querySelector('.role-list');
  for (const [key184, suffix184, alt184] of [['co_gm', 'appointed', 'appointed'], ['treasurer', 'appointed', 'appointed'], ['pvp_leader', 'no public vote', 'no public vote']]) {
    await open184.go('#/vote/' + key184);
    check('cached chooser reuse preserves ' + key184 + ' closure, label and marker without another summary', open184.app.querySelector('.role-pick') === chooser184 && open184.app.querySelector('.role-list') === rail184 && option184(open184, key184)?.textContent === label184(open184, key184) + ' (' + suffix184 + ')' && !!marker184(open184, key184, alt184) && closed184(open184) && openReads184.filter(call => call.pathname === '/api/board').length === 1);
  }
  await open184.go('#/vote/officer');
  await waitFor(() => open184.app.querySelector('.board-results')?.getAttribute('aria-busy') === 'false', 'fresh open role after cached closed roles');
  check('returning to an open role keeps the chooser and makes its original fresh role read', open184.app.querySelector('.role-pick') === chooser184 && open184.app.querySelector('.role-item[aria-current="page"] .n')?.textContent === '0/1' && openReads184.filter(call => call.pathname.startsWith('/api/board/officer?')).length === 2 && openReads184.filter(call => call.pathname === '/api/board').length === 1);

  const { page: late184, calls: lateReads184 } = await prepared184();
  let lateHeld184 = false;
  late184.hold(pathname => { if (pathname === '/api/board' && !lateHeld184) { lateHeld184 = true; return 180; } return 0; });
  await late184.go('#/vote/co_gm');
  await waitFor(() => lateHeld184, 'old closed-role summary completed');
  await late184.go('#/vote/officer');
  await waitFor(() => late184.app.querySelector('.board-results')?.getAttribute('aria-busy') === 'false' && late184.app.querySelector('.board-summary-status')?.textContent === '', 'replacement open role and its summary');
  await new Promise(resolve => setTimeout(resolve, 210));
  check('a late old closed-role summary cannot damage the replacement role or either special label', late184.app.querySelector('.role-pick')?.value === 'officer' && late184.app.querySelector('.role-item[aria-current="page"] .n')?.textContent === '0/1' && option184(late184, 'co_gm')?.textContent === label184(late184, 'co_gm') + ' (appointed)' && !!marker184(late184, 'co_gm', 'appointed') && option184(late184, 'pvp_leader')?.textContent === label184(late184, 'pvp_leader') + ' (no public vote)' && lateReads184.filter(call => call.pathname === '/api/board').length === 2);
  check('all exercised navigation remains read-only and preserves the seeded settings, application and zero votes', calls184.every(call => call.method === 'GET') && one('SELECT COUNT(*) AS n FROM site_board_votes').n === 0 && one('SELECT COUNT(*) AS n FROM site_applications').n === 1 && one("SELECT value FROM site_settings WHERE key='appointed'").value === appointed184 && one("SELECT value FROM site_settings WHERE key='noVote'").value === JSON.stringify(['pvp_leader']));

  // Unit h3, the owner's question of 15 Nov 2026 ("Shouldn't .../#/vote already have assigned HC roles since we have them
  // ingame and on Discord?"): the board lists every current High Council portfolio with the holder from the website
  // appointment record only, or the existing fallback. The expected portfolios and their order are the Council register,
  // governance/organization.json councilComposition.currentSeats without the Guild Master's chair, not the page's code.
  const register184 = JSON.parse(fs.readFileSync(path.join(root, 'public', 'static', 'governance', 'organization.json'), 'utf8')).councilComposition.currentSeats.filter(seat => seat.familyKey !== 'leader').map(seat => [seat.officeKeys[0], seat.label]);
  const none184 = 'No website appointment recorded.';
  const panelOf184 = page => { const kids = page.app.querySelector('main')?.children || []; return kids.length === 3 ? kids[2] : null; };
  const shape184 = page => {
    const kids = page.app.querySelector('main')?.children || [], panel = kids[2], list = panel?.children[1];
    return kids.length === 3 && kids[0].querySelector('.plaque')?.textContent === 'Leadership applications board' && kids[1].classList.contains('board-layout')
      && panel.tagName === 'SECTION' && panel.classList.contains('frame') && panel.children.length === 2 && panel.children[0].classList.contains('plaque') && panel.children[0].textContent === 'High Council portfolios'
      && list.tagName === 'DL' && list.classList.contains('kv') && JSON.stringify(list.children.map(el => el.tagName)) === JSON.stringify(register184.flatMap(() => ['DT', 'DD']))
      && JSON.stringify(list.querySelectorAll('dt').map(dt => dt.textContent)) === JSON.stringify(register184.map(([, label]) => label));
  };
  const rows184 = page => JSON.stringify((panelOf184(page)?.querySelectorAll('dd') || []).map(dd => [dd.getAttribute('data-council-holder'), dd.textContent, dd.querySelector('[data-appointment-label]')?.getAttribute('data-appointment-label') || null]));
  const expected184 = holders => JSON.stringify(register184.map(([key]) => [key, ...(holders[key] || [none184, null])]));
  const note184 = page => page.app.querySelector('.board-role-content .notice-box');
  const openHolders184 = async (appointed, hash, answer) => {
    await fixtureRun("UPDATE site_settings SET value=? WHERE key='appointed'", JSON.stringify(appointed));
    const page = await openPage(MEMBER), reads = [];
    page.before(pathname => { reads.push(pathname); return false; });
    if (answer) page.answer(answer);
    await page.go(hash);
    await waitFor(() => page.app.querySelector('.board-summary-status')?.textContent === '' && !!panelOf184(page), hash + ' summary and holders panel');
    await new Promise(resolve => setTimeout(resolve, 250));
    return { page, reads };
  };

  const seeded184 = await openHolders184({ co_gm: 'Example Co-GM', treasurer: 'Example Treasurer' }, '#/vote/officer');
  check('h3 the board shows one High Council portfolios panel after the board, with the thirteen register portfolios in register order', register184.length === 13 && shape184(seeded184.page));
  check('h3 each portfolio shows its holder through the key the record is stored under, and the fallback where nothing is recorded', rows184(seeded184.page) === expected184({ office_19: ['Appointed: Example Co-GM.', 'co_gm'], office_86: ['Appointed: Example Treasurer.', 'treasurer'] }), rows184(seeded184.page));

  const hand184 = await openHolders184({ office_19: 'Recorded Hand', office_101: 'Recorded Justiciar', office_96: '<@' + OTHER + '>' }, '#/vote/co_gm');
  const handNote184 = note184(hand184.page);
  check('h3 a record under office_19 closes the co_gm ballot and names that record as the source', shape184(hand184.page) && option184(hand184.page, 'co_gm')?.textContent === label184(hand184.page, 'co_gm') + ' (appointed)' && !!marker184(hand184.page, 'co_gm', 'appointed') && closed184(hand184.page)
    && handNote184?.textContent === 'Appointed: Recorded Hand. ' + label184(hand184.page, 'co_gm') + ' is filled by appointment rather than by the board, so there is nothing to vote on or write in here.' && handNote184.querySelector('[data-appointment-label]')?.getAttribute('data-appointment-label') === 'office_19', handNote184?.textContent);
  check('h3 recorded typed holders show as recorded, an account holder the projection does not name keeps the opaque label, every other portfolio the fallback', rows184(hand184.page) === expected184({ office_19: ['Appointed: Recorded Hand.', 'office_19'], office_101: ['Appointed: Recorded Justiciar.', 'office_101'], office_96: ['Filled by appointment.', 'office_96'] }) && hand184.reads.some(pathname => pathname.startsWith('/api/appointed-identities')), rows184(hand184.page));

  const both184 = await openHolders184({ co_gm: 'Exact Co-GM record', office_19: 'Exact Hand record' }, '#/vote/co_gm');
  check('h3 with records under both co_gm and office_19, the ballot and the portfolio each read their own record first', shape184(both184.page) && note184(both184.page)?.textContent.startsWith('Appointed: Exact Co-GM record. ') && note184(both184.page).querySelector('[data-appointment-label]')?.getAttribute('data-appointment-label') === 'co_gm'
    && rows184(both184.page) === expected184({ office_19: ['Appointed: Exact Hand record.', 'office_19'] }), rows184(both184.page));

  const ranks184 = await openHolders184({ rank_high_council: 'Rank holder', rank_treasurer: 'Rank treasurer record', office_45: 'High Council office record', office_92: 'Vice Guild Master record' }, '#/vote/officer');
  check('h3 a record under the High Council rank, the historical Treasurer rank key or another High Council office fills no portfolio and closes neither co_gm nor treasurer', shape184(ranks184.page) && rows184(ranks184.page) === expected184({})
    && !option184(ranks184.page, 'co_gm')?.textContent.endsWith('(appointed)') && !option184(ranks184.page, 'treasurer')?.textContent.endsWith('(appointed)') && !marker184(ranks184.page, 'co_gm', 'appointed') && !marker184(ranks184.page, 'treasurer', 'appointed'), rows184(ranks184.page));

  // The page's existing projection reader names an account holder by the stored key; this reply has the contract's shape.
  const projected184 = await openHolders184({ co_gm: '<@' + OTHER + '>' }, '#/vote/officer', pathname => pathname.startsWith('/api/appointed-identities')
    ? { scope: 'qualified_community_readers', identities: [{ role: 'co_gm', appointment: '<@' + OTHER + '>', displayName: 'Projected Hand', username: 'projected_hand', characters: [] }], revision: 'A'.repeat(43), nextCursor: null, complete: true } : null);
  check('h3 the identity reader asks for the stored key co_gm and its name fills the office_19 portfolio only', shape184(projected184.page) && projected184.reads.includes('/api/appointed-identities?role=co_gm')
    && rows184(projected184.page) === expected184({ office_19: ['Appointed: Projected Hand (projected_hand).', 'co_gm'] }), rows184(projected184.page), JSON.stringify(projected184.reads));
  console.log('\n' + ok + '/' + n + ' vote labels184 checks passed'); process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution184 = new Module(fixture184, module); execution184.filename = fixture184; execution184.paths = Module._nodeModulePaths(path184.dirname(fixture184)); execution184._compile(source184.slice(0, starts184[0].index) + '\n' + body184, fixture184);
