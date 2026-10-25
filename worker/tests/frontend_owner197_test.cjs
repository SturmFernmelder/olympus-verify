// Actual app and Worker, original authenticated SQLite fixture. Substituted
// refusals/identity pages qualify presentation only; no browser/provider action.
const fs197 = require('node:fs'), path197 = require('node:path'), crypto197 = require('node:crypto'), { Module } = require('node:module');
const fixture197 = fs197.readFileSync(path197.join(__dirname, 'frontend_check.cjs'), 'utf8');
const boundaries197 = [...fixture197.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (boundaries197.length !== 1) throw Error('owner197_original_frontend_boundary');
const prefix197 = fixture197.slice(0, boundaries197[0].index);
if (crypto197.createHash('sha256').update(prefix197).digest('hex') !== '7b72fd253e127dfa0379b0528adb5a05c9ae8e92655fd6c9b2e468ce201300f1') throw Error('owner197_original_frontend_prefix_drift');
async function frontendOwner197() {
  await siteUser(MEMBER, { global_name: 'Mia' }); await character(MEMBER, 'Mia One', 'Player-1-0001');
  await siteUser(OTHER, { global_name: 'Oz' }); await character(OTHER, 'Oz Two', 'Player-1-0002');
  await siteUser(STAFF, { global_name: 'Vik' });
  const must = async (predicate, label) => { if (!await waitFor(predicate, label)) throw Error(label + ' did not reach its original terminal witness'); };
  const ownError = box => [...box.children].find(child => child.classList.contains('err'));
  const stored = () => { const row = one('SELECT answers FROM site_applications WHERE discord_id=?', MEMBER); return row && JSON.parse(row.answers); };
  const data = JSON.parse(fs.readFileSync(path.join(root, 'public/static/talents/data.json')));
  const code = (cls, level) => 'ot1.' + data.revision + '.' + cls + '.' + level + '.' + '0'.repeat(data.classes.find(item => item.id === cls).trees.flatMap(tree => tree.talents).length);
  const characters = () => [['Mia One', 'warrior'], ['Mia Two', 'mage'], ['Mia Three', 'druid']].map(([character, cls]) => ({ character, class: cls, build30: code(cls, 30), build60: code(cls, 60) }));
  const collection = () => ({ version: 1, characters: characters() });
  const request = async (method, url, payload, who = MEMBER) => {
    const response = await indexMod.default.fetch(new Request('https://guild.example' + url, { method, headers: { Cookie: await cookieFor(who), Origin: 'https://guild.example', 'X-Olympus': siteCore.PAGE_VERSION, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }), env(), ctx);
    return { response, body: await response.clone().json().catch(() => null) };
  };

  const fresh = await openPage(MEMBER); await fresh.go('#/apply');
  const freshSharing = fresh.app.querySelector('#board-talent-builds-opt-in'), freshPortrait = fresh.app.querySelector('#board-portrait-opt-in');
  check('new application separates unchecked build sharing and picture sharing from ordinary board consent', !!freshSharing && !!freshPortrait && !freshSharing.checked && !freshPortrait.checked && freshSharing.disabled && freshPortrait.disabled);
  check('collection form explicitly identifies self-reported names and the separate publication choice', fresh.app.textContent.includes('self-reported application details, not roster verification') && fresh.app.textContent.includes('separate board-sharing choice'));
  const addAlt = byText(fresh.app, 'button', 'Add declared alt build'); addAlt.click(); addAlt.click(); addAlt.click();
  check('actual add control enforces three character rows even under a synthetic disabled click', fresh.app.querySelectorAll('.talent-application-character').length === 3 && addAlt.disabled);
  const freshMain = fresh.app.querySelector('[data-field="character"] input'), freshClass = fresh.app.querySelector('[data-field="class"] select');
  freshMain.value = 'Mia One'; fire(freshMain, 'input'); freshClass.value = 'warrior'; fire(freshClass, 'change');
  const primary = fresh.app.querySelector('.talent-application-character');
  check('primary collection row mirrors the actual selected application character and class', primary.querySelector('input').value === 'Mia One' && primary.querySelector('input').getAttribute('readonly') !== null && primary.querySelector('select').value === 'warrior' && primary.querySelector('select').disabled);

  const privateSentinel = 'Private leadership-only question sentinel';
  const body = { position: 'officer', backups: [], character: 'Mia One', class: 'warrior', role: 'dps', region: 'eu', avail: 'f'.repeat(42), availTz: 'Europe/Stockholm', fallback: true, board: true, ack: true,
    answers: { experience: 'A fictional original application.', why: 'Help this fictional guild.', leadership: 'Led a fictional raid group.', scenario: 'Listen and follow the agreed loot rules.', hours: '10to20', voice: 'yes', extra: privateSentinel, talentBuilds: collection() } };
  const seeded = await request('PUT', '/api/application', body);
  if (seeded.response.status !== 200) throw Error('real primary collection setup refused: ' + JSON.stringify(seeded.body));
  const page = await openPage(MEMBER), sent = [];
  page.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') sent.push(JSON.parse(init.body)); return false; });
  await page.go('#/apply');
  check('stored three-character form restores all six codes while separate sharing stays false', page.app.querySelectorAll('.talent-application-character').length === 3 && page.app.querySelectorAll('.talent-application-character textarea').length === 6 && !page.app.querySelector('#board-talent-builds-opt-in').checked && !page.app.querySelector('#board-talent-builds-opt-in').disabled && page.app.querySelectorAll('.talent-application-character textarea').every(input => input.value.startsWith('ot1.' + data.revision + '.')));
  let form = page.app.querySelector('form'), sharing = page.app.querySelector('#board-talent-builds-opt-in');
  sharing.checked = true; fire(sharing, 'change'); form.querySelector('[data-field="ack"] input').checked = true; fire(form, 'submit');
  await must(() => stored()?.boardTalentBuildsOptIn === true && page.app.querySelector('#board-talent-builds-opt-in')?.checked === true && !page.app.querySelector('button[type="submit"]').disabled, 'actual separately consented collection save');
  check('actual form sends exactly three named class-bound rows and the independent top-level boolean', sent.length === 1 && sent[0].board === true && sent[0].boardTalentBuilds === true && sent[0].boardPortrait === false && JSON.stringify(sent[0].answers.talentBuilds) === JSON.stringify(collection()) && !Object.hasOwn(sent[0].answers, 'boardTalentBuildsOptIn'));
  const voter = await openPage(OTHER); await voter.go('#/vote/officer');
  await must(() => !!voter.app.querySelector('.cand .talent-build-links'), 'actual current shared build board');
  const card = voter.app.querySelector('.cand'), sharedLinks = card.querySelectorAll('.talent-build-links a');
  check('actual consented board renders six calculator links with names, classes and exact levels', sharedLinks.length === 6 && sharedLinks.every(link => /^#\/talents\/(warrior|mage|druid)\/ot1\./.test(link.getAttribute('href'))) && card.textContent.includes('Mia Two') && card.textContent.includes('Mage') && card.textContent.includes('Druid') && card.textContent.includes('level 30') && card.textContent.includes('level 60') && !card.textContent.includes('[object Object]'));
  check('minimal board remains explicit self-report and does not render other private answers', card.textContent.includes('Self-reported character names; shared separately') && !card.textContent.includes(privateSentinel) && !card.textContent.includes('roster verified'));

  // Fixed error DTO substitutions exercise the existing UI error boundary only.
  // The actual Worker runs first; these are not admission or write-proof fixtures.
  let errorField = null;
  page.answer((url, init) => url === '/api/application' && init.method === 'PUT' && errorField ? new Response(JSON.stringify({ error: 'invalid', field: errorField, message: 'Exact ' + errorField + ' refusal' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) : null);
  for (const field of ['board', 'boardPortrait', 'boardTalentBuilds', 'talentBuilds']) {
    form = page.app.querySelector('form'); errorField = field; form.querySelector('[data-field="ack"] input').checked = true; fire(form, 'submit');
    const fieldBox = form.querySelector('[data-field="' + field + '"]');
    await must(() => fieldBox.classList.contains('invalid') && ownError(fieldBox)?.textContent === 'Exact ' + field + ' refusal' && !page.app.querySelector('button[type="submit"]').disabled, 'terminal nested ' + field + ' refusal');
    check('nested ' + field + ' error belongs to its own field and clears previous sibling/parent errors', form.querySelectorAll('.invalid').length === 1 && !ownError(fieldBox).hidden && ['board', 'boardPortrait', 'boardTalentBuilds', 'talentBuilds'].filter(key => key !== field).every(key => { const other = form.querySelector('[data-field="' + key + '"]'); return !other.classList.contains('invalid') && ownError(other)?.hidden && ownError(other)?.textContent === ''; }));
  }
  errorField = null; form.querySelector('[data-field="ack"] input').checked = true; fire(form, 'submit');
  await must(() => page.app.querySelectorAll('.invalid').length === 0 && page.app.querySelector('#board-talent-builds-opt-in')?.checked === true && !page.app.querySelector('button[type="submit"]').disabled, 'original successful application readback clears errors');
  check('successful real readback clears every nested error without granting portrait consent', page.app.querySelectorAll('.invalid').length === 0 && !page.app.querySelector('#board-portrait-opt-in').checked);

  const staff = await openPage(STAFF), attendedCalls = [], targetId = '730000000000000197'; let origin = 'unconfirmed';
  staff.before((url, init) => { if (url.startsWith('/api/admin/discord-directory/')) attendedCalls.push({ url, method: init.method, body: JSON.parse(init.body) }); return false; });
  staff.answer(url => url === '/api/admin/discord-directory/status' ? origin === 'unconfirmed' ? { discordId: targetId, listed: false } : { discordId: targetId, listed: false, visibilityOrigin: origin, restoreAllowed: origin === 'attended_request' } : null);
  await staff.go('#/admin/directory-visibility');
  const attendedId = staff.app.querySelector('#attended-directory-id'), listed = staff.app.querySelector('#attended-directory-listed'), confirmed = staff.app.querySelector('#attended-directory-confirmed'), save = byText(staff.app, 'button', 'Save requested listing preference'), read = byText(staff.app, 'button', 'Read this member’s preference');
  check('attended target has its actual associated exact-ID label and no command on entry', staff.app.querySelector('label[for="attended-directory-id"]')?.textContent.includes('Exact Discord account ID supplied by the requester') && attendedCalls.length === 0 && save.disabled);
  attendedId.value = targetId; fire(attendedId, 'input'); read.click();
  await must(() => staff.app.textContent.includes('Preference origin: unconfirmed') && !attendedId.disabled, 'unconfirmed directory DTO terminal read');
  check('missing restore allowance stays fail closed instead of becoming attended authority', listed.disabled && confirmed.disabled && save.disabled && attendedCalls.length === 1);
  origin = 'self_service'; read.click();
  await must(() => staff.app.textContent.includes('Preference origin: self_service') && !attendedId.disabled, 'self-owned directory preference read');
  confirmed.checked = true; fire(confirmed, 'change'); save.click();
  check('self-owned preference remains disabled and cannot be overridden by a synthetic save click', listed.disabled && confirmed.disabled && save.disabled && staff.app.textContent.includes('Only this member can change their self-service preference') && attendedCalls.length === 2 && attendedCalls.every(call => call.url.endsWith('/status')));
  origin = 'attended_request'; read.click();
  await must(() => staff.app.textContent.includes('Preference origin: attended_request') && !listed.disabled, 'fresh attended-owned directory preference');
  check('a newly permitted read clears the old confirmation before any attended save can arm', !confirmed.checked && save.disabled && attendedCalls.length === 3);
  await staff.go('#/');

  const ranks = await openPage(MEMBER); await ranks.go('#/roles');
  const expectedIcons = { guild_master: 'guild_master', high_council: 'co_gm', treasurer: 'treasurer', officer: 'officer', raid_leader: 'raid_leader', veteran: 'raider', raider: 'raider', member: 'member', alt: 'member', initiate: 'member' };
  check('all ten current rank display records use their intended existing icons without unknown rank art', Object.entries(expectedIcons).every(([rank, icon]) => ranks.app.querySelector('[data-office-assignment="rank_' + rank + '"] h3 img')?.getAttribute('src') === '/static/wow/pos-' + icon + '.png'));

  // A main view and its role dialog can share only an unresolved read captured
  // from that same owner/settings/context/route. No result cache is introduced.
  const appointments = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.appointed = { co_gm: 'Appointed member', treasurer: 'Appointed member' }; } });
  const revision = 'A'.repeat(43), identityCalls = [], identityReplies = []; let wrongFilteredRole = false;
  appointments.before(url => { if (url.startsWith('/api/appointed-identities')) identityCalls.push(url); return false; });
  appointments.hold(url => url.startsWith('/api/appointed-identities') ? 120 : 0);
  appointments.answer(url => {
    if (!url.startsWith('/api/appointed-identities')) return null;
    identityReplies.push(url);
    const selected = new URL(url, 'https://guild.example').searchParams.get('role');
    const returned = selected ? [wrongFilteredRole ? 'treasurer' : selected] : ['co_gm', 'treasurer'];
    return { scope: 'qualified_community_readers', revision, complete: true, nextCursor: null, identities: returned.map(role => ({ role, appointment: '<@300000000000000097>', displayName: 'Qualified ' + role, username: 'qualified.' + role, characters: [] })) };
  });
  await appointments.go('#/apply');
  await must(() => identityCalls.length === 1, 'one original pending appointment collection');
  const coGmLabel = appointments.boot.meta.positions.find(position => position.key === 'co_gm')?.label;
  const details = appointments.app.querySelector('button[aria-label="Details: ' + coGmLabel + '"]');
  if (!details) throw Error('actual appointed Co-Guild Master details control is unavailable');
  details.click(); let dialog = appointments.document.querySelector('dialog[open]') || appointments.document.querySelectorAll('dialog').find(item => item.open);
  check('same captured main and dialog share only the one in-flight collection without early identity paint', !!dialog && identityCalls.length === 1 && identityReplies.length === 0 && !appointments.app.textContent.includes('Qualified co_gm') && !dialog.textContent.includes('Qualified co_gm'));
  await must(() => identityReplies.length === 1 && appointments.app.textContent.includes('Qualified co_gm') && dialog.textContent.includes('Qualified co_gm'), 'one shared terminal identity collection');
  check('one completed admitted collection paints both current owners without a second request', identityCalls.length === 1 && identityReplies.length === 1);
  dialog.close(); details.click(); dialog = appointments.document.querySelectorAll('dialog').find(item => item.open);
  await must(() => identityCalls.length === 2, 'new dialog performs a fresh uncached identity read');
  check('.197 a completed main collection is not cached: the later dialog requests only its own existing catalogue office', new URL(identityCalls[1], 'https://guild.example').search === '?role=co_gm');
  check('resolved identities are never reused as a cross-view cache', identityReplies.length === 1 && !dialog.textContent.includes('Qualified co_gm'));
  appointments.document.hidden = true; appointments.document.dispatchEvent(new Event('visibilitychange'));
  await must(() => identityReplies.length === 2, 'original hidden collection terminal response'); await settle();
  check('hidden views clear identity projection and refuse the late pending reply', !appointments.app.textContent.includes('Qualified co_gm') && !dialog.textContent.includes('Qualified co_gm') && identityCalls.length === 2);
  appointments.document.hidden = false; appointments.document.dispatchEvent(new Event('visibilitychange'));
  await must(() => identityCalls.length === 3 && identityReplies.length === 3 && dialog.textContent.includes('Qualified co_gm'), 'fresh shared collection after visibility returns');
  check('visibility re-entry obtains one fresh shared read rather than restoring resolved data', identityCalls.length === 3 && identityReplies.length === 3 && appointments.app.textContent.includes('Qualified co_gm'));
  check('.197 the main view retains its full collection and a same-capture dialog shares that superset', identityCalls[2] === '/api/appointed-identities');
  dialog.close(); wrongFilteredRole = true; details.click(); dialog = appointments.document.querySelectorAll('dialog').find(item => item.open);
  await must(() => identityReplies.length === 4, 'single-office wrong-holder terminal response'); await settle();
  check('.197 a single-office reply containing another otherwise valid office fails closed without a stale or foreign holder', identityCalls.length === 4 && !dialog.textContent.includes('Qualified co_gm') && !dialog.textContent.includes('Qualified treasurer'));
  wrongFilteredRole = false;
  await appointments.go('#/settings');
  const callsAtDisposal = identityCalls.length;
  appointments.document.hidden = true; appointments.document.dispatchEvent(new Event('visibilitychange')); appointments.document.hidden = false; appointments.document.dispatchEvent(new Event('visibilitychange')); await settle();
  check('route disposal removes old identity readers and cannot restore names or start another collection', identityCalls.length === callsAtDisposal && !appointments.app.textContent.includes('Qualified co_gm') && !appointments.app.textContent.includes('Qualified treasurer'));
  // PR90 P2: a pending dialog-owned read cannot be inherited after that dialog is closed.
  // Real app lifecycle; substituted qualified DTOs below prove presentation only, not backend identity authority.
  const reopenRace = await openPage(MEMBER, {}, { bootTransform: boot => { boot.settings.appointed = { co_gm: 'Appointed member', treasurer: 'Appointed member' }; } });
  const reopenCalls = [], reopenReplies = [], reopenOrdinals = new WeakMap();
  reopenRace.before((url, init) => { if (url.startsWith('/api/appointed-identities')) { const ordinal = reopenCalls.length + 1; reopenOrdinals.set(init, ordinal); reopenCalls.push({ url, ordinal }); } return false; });
  reopenRace.hold((url, init) => !url.startsWith('/api/appointed-identities') ? 0 : reopenOrdinals.get(init) === 2 ? 80 : reopenOrdinals.get(init) === 3 ? 400 : 0);
  reopenRace.answer((url, init) => {
    if (!url.startsWith('/api/appointed-identities')) return null;
    const ordinal = reopenOrdinals.get(init); reopenReplies.push(ordinal);
    const selected = new URL(url, 'https://guild.example').searchParams.get('role'), returned = selected ? [selected] : ['co_gm', 'treasurer'];
    return { scope: 'qualified_community_readers', revision, complete: true, nextCursor: null, identities: returned.map(role => ({ role, appointment: '<@300000000000000097>', displayName: (ordinal === 2 ? 'Closed old ' : ordinal === 1 ? 'Initial current ' : 'Reopened current ') + role, username: 'qualified.' + role, characters: [] })) };
  });
  await reopenRace.go('#/apply');
  await must(() => reopenReplies.includes(1) && reopenRace.app.textContent.includes('Initial current co_gm'), 'separate world original main identity read completed');
  const reopenDetails = reopenRace.app.querySelector('button[aria-label="Details: ' + coGmLabel + '"]');
  if (!reopenDetails) throw Error('actual role details control missing in reopen world');
  reopenDetails.click(); const closedPendingDialog = reopenRace.document.querySelectorAll('dialog').find(item => item.open);
  await must(() => reopenCalls.length === 2, 'dialog-owned identity read is pending before close');
  check('.197 dialog owns a fresh single-role pending read after the main result has settled', !!closedPendingDialog && !reopenReplies.includes(2) && new URL(reopenCalls[1].url, 'https://guild.example').search === '?role=co_gm');
  closedPendingDialog.close(); reopenDetails.click(); const reopenedPendingDialog = reopenRace.document.querySelectorAll('dialog').find(item => item.open);
  await must(() => reopenCalls.length === 3, 'same-role reopen replaces disposed-owner pending identity read');
  check('.197 close then immediate reopen starts exactly one replacement without stale identity paint', !!reopenedPendingDialog && reopenedPendingDialog !== closedPendingDialog && new URL(reopenCalls[2].url, 'https://guild.example').search === '?role=co_gm' && !reopenedPendingDialog.textContent.includes('Closed old co_gm') && !reopenedPendingDialog.textContent.includes('Reopened current co_gm'));
  await must(() => reopenReplies.includes(2), 'old disposed-owner response is delivered'); await settle();
  check('.197 late old identity reply cannot paint the closed or reopened dialog', !closedPendingDialog.textContent.includes('Closed old co_gm') && !reopenedPendingDialog.textContent.includes('Closed old co_gm') && (reopenReplies.includes(3) ? reopenedPendingDialog.textContent.includes('Reopened current co_gm') : !reopenedPendingDialog.textContent.includes('Reopened current co_gm')));
  await must(() => reopenReplies.includes(3) && reopenedPendingDialog.textContent.includes('Reopened current co_gm'), 'replacement current-owner identity response hydrates reopened dialog');
  check('.197 replacement reply belongs to the current role while main identity remains its own projection', reopenCalls.length === 3 && reopenReplies.length === 3 && !reopenedPendingDialog.textContent.includes('Initial current co_gm') && reopenRace.app.textContent.includes('Initial current co_gm'));
  reopenedPendingDialog.close(); reopenDetails.click(); const uncachedReopen = reopenRace.document.querySelectorAll('dialog').find(item => item.open);
  await must(() => reopenCalls.length === 4 && reopenReplies.includes(4) && uncachedReopen.textContent.includes('Reopened current co_gm'), 'settled replacement has no resolved private cache');
  check('.197 each later settled dialog still performs its own role-filtered admitted read', new URL(reopenCalls[3].url, 'https://guild.example').search === '?role=co_gm' && reopenCalls.length === 4);
  await reopenRace.go('#/settings');
  // PR90: real Clear control -> actual serialization/Worker -> fresh read -> separate board projection.
  const optionalMain = await openPage(MEMBER), optionalSends = [];
  optionalMain.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') optionalSends.push(JSON.parse(init.body)); return false; });
  await optionalMain.go('#/apply'); byText(optionalMain.app, 'button', 'Clear main builds').click();
  const optionalRows = optionalMain.app.querySelectorAll('.talent-application-character');
  check('Clear main builds empties only main codes and leaves four alt codes', optionalRows.length === 3 && optionalRows[0].querySelectorAll('textarea').every(input => input.value === '') && optionalRows.slice(1).every(row => row.querySelectorAll('textarea').every(input => input.value.startsWith('ot1.' + data.revision + '.'))));
  let optionalForm = optionalMain.app.querySelector('form'), optionalShare = optionalMain.app.querySelector('#board-talent-builds-opt-in');
  optionalShare.checked = false; fire(optionalShare, 'change'); optionalForm.querySelector('[data-field="ack"] input').checked = true; fire(optionalForm, 'submit');
  await must(() => stored()?.talentBuilds?.characters?.[0]?.build30 === '' && stored()?.talentBuilds?.characters?.[0]?.build60 === '' && stored()?.boardTalentBuildsOptIn === false && !optionalMain.app.querySelector('button[type="submit"]').disabled, 'actual optional-main clear save');
  const expectedAltOnly = collection(); expectedAltOnly.characters[0].build30 = expectedAltOnly.characters[0].build60 = '';
  check('submit preserves empty main anchor followed by four unchanged alt builds', optionalSends.length === 1 && JSON.stringify(optionalSends[0].answers.talentBuilds) === JSON.stringify(expectedAltOnly) && JSON.stringify(stored().talentBuilds) === JSON.stringify(expectedAltOnly));
  const optionalReload = await openPage(MEMBER), reloadedSends = [];
  optionalReload.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') reloadedSends.push(JSON.parse(init.body)); return false; });
  await optionalReload.go('#/apply'); const reloadedRows = optionalReload.app.querySelectorAll('.talent-application-character');
  check('fresh read restores empty main and both alts without shifting alt into main', reloadedRows.length === 3 && reloadedRows[0].querySelector('input').value === 'Mia One' && reloadedRows[0].querySelector('select').value === 'warrior' && reloadedRows[0].querySelectorAll('textarea').every(input => input.value === '') && reloadedRows[1].querySelector('input').value === 'Mia Two' && reloadedRows[2].querySelector('input').value === 'Mia Three');
  optionalForm = optionalReload.app.querySelector('form'); const optionalWhy = optionalForm.querySelector('[data-field="why"]').querySelector('input, textarea'); optionalWhy.value = 'An unrelated application edit after clearing main builds.'; fire(optionalWhy, 'input');
  optionalForm.querySelector('[data-field="ack"] input').checked = true; fire(optionalForm, 'submit');
  await must(() => stored()?.why === optionalWhy.value && !optionalReload.app.querySelector('button[type="submit"]').disabled, 'actual unrelated save with alt-only collection');
  check('unrelated edit retains four alt codes and separate private choice', JSON.stringify(stored().talentBuilds) === JSON.stringify(expectedAltOnly) && stored().boardTalentBuildsOptIn === false);
  optionalForm = optionalReload.app.querySelector('form'); optionalShare = optionalReload.app.querySelector('#board-talent-builds-opt-in'); optionalShare.checked = true; fire(optionalShare, 'change'); optionalForm.querySelector('[data-field="ack"] input').checked = true; fire(optionalForm, 'submit');
  await must(() => stored()?.boardTalentBuildsOptIn === true && !optionalReload.app.querySelector('button[type="submit"]').disabled, 'separate alt-only sharing save');
  const altVoter = await openPage(OTHER); await altVoter.go('#/vote/officer'); await must(() => altVoter.app.querySelectorAll('.cand .talent-build-links a').length === 4, 'actual alt-only board');
  const altList = altVoter.app.querySelector('.cand .talent-build-links');
  check('board shows four real alt links and no empty-main attachment', altList.querySelectorAll('a').every(link => /^#\/talents\/(mage|druid)\//.test(link.getAttribute('href'))) && !altList.textContent.includes('Mia One') && altList.textContent.includes('Mia Two') && altList.textContent.includes('Mia Three'));
  byText(optionalReload.app, 'button', 'Remove declared alt').click(); byText(optionalReload.app, 'button', 'Remove declared alt').click();
  optionalForm = optionalReload.app.querySelector('form'); optionalShare = optionalReload.app.querySelector('#board-talent-builds-opt-in'); optionalShare.checked = false; fire(optionalShare, 'change'); optionalForm.querySelector('[data-field="ack"] input').checked = true; fire(optionalForm, 'submit');
  await must(() => !stored()?.talentBuilds && stored()?.boardTalentBuildsOptIn === false && !optionalReload.app.querySelector('button[type="submit"]').disabled, 'actual all-build clear');
  check('all-build clear serializes no phantom anchor and leaves only the empty main editor', reloadedSends.at(-1).answers.talentBuilds.characters.length === 0 && optionalReload.app.querySelectorAll('.talent-application-character').length === 1 && optionalReload.app.querySelectorAll('.talent-application-character textarea').every(input => input.value === ''));
  check('these UI reads and explicit application saves create no board vote or alt verification', !one('SELECT 1 FROM site_board_votes') && !one('SELECT 1 FROM characters WHERE name IN (?,?)', 'Mia Two', 'Mia Three'));
  // PR90: actual form serialization and real Worker admission after main edits.
  const oldAltCollection=collection();oldAltCollection.characters[1].build30=oldAltCollection.characters[1].build30.replace(data.revision,'f'.repeat(12));
  for(const main of [{character:'Mia Four',class:'warrior'},{character:'Mia One',class:'mage'}]){
    await fixtureRun('UPDATE site_applications SET character=?,class=?,answers=? WHERE discord_id=?','Mia One','warrior',JSON.stringify({...body.answers,talentBuilds:oldAltCollection,boardTalentBuildsOptIn:false}),MEMBER);
    const historyPage=await openPage(MEMBER),historySends=[];historyPage.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')historySends.push(JSON.parse(init.body));return false;});await historyPage.go('#/apply');
    const nameInput=historyPage.app.querySelector('[data-field="character"] input'),classInput=historyPage.app.querySelector('[data-field="class"] select');nameInput.value=main.character;fire(nameInput,'input');classInput.value=main.class;fire(classInput,'change');byText(historyPage.app,'button','Clear main builds').click();
    let historyForm=historyPage.app.querySelector('form');const legacy=historyForm.querySelector('[data-field="talentBuild"]').querySelector('input, textarea');legacy.value='';fire(legacy,'input');historyForm.querySelector('[data-field="ack"] input').checked=true;fire(historyForm,'submit');
    await must(()=>historySends.length===1&&!historyPage.app.querySelector('button[type="submit"]').disabled,'terminal actual main-anchor edit');
    const expectedHistory=JSON.parse(JSON.stringify(oldAltCollection));Object.assign(expectedHistory.characters[0],{character:main.character,class:main.class,build30:'',build60:''});const changed=one('SELECT character,class FROM site_applications WHERE discord_id=?',MEMBER),saved=JSON.stringify(stored()?.talentBuilds)===JSON.stringify(expectedHistory)&&changed.character===main.character&&changed.class===main.class;
    check('actual main '+main.character+'/'+main.class+' form edit saves unchanged historical alt privately',saved&&JSON.stringify(historySends[0].answers.talentBuilds)===JSON.stringify(expectedHistory)&&historySends[0].boardTalentBuilds===false&&stored().boardTalentBuildsOptIn===false);
    if(saved){
      const historyReload=await openPage(MEMBER),reloadSends=[];historyReload.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')reloadSends.push(JSON.parse(init.body));return false;});await historyReload.go('#/apply');const historyRows=historyReload.app.querySelectorAll('.talent-application-character');
      check('fresh form restores changed main anchor and same historical alt editor',historyRows.length===3&&historyRows[0].querySelector('input').value===main.character&&historyRows[0].querySelector('select').value===main.class&&historyRows[0].querySelectorAll('textarea').every(input=>input.value==='')&&historyRows[1].querySelector('input').value==='Mia Two'&&historyRows[1].querySelector('select').value==='mage'&&historyRows[1].querySelectorAll('textarea')[0].value===oldAltCollection.characters[1].build30&&!historyReload.app.querySelector('#board-talent-builds-opt-in').checked);
      historyForm=historyReload.app.querySelector('form');const why=historyForm.querySelector('[data-field="why"]').querySelector('input, textarea');why.value='Unrelated form edit after main change.';fire(why,'input');historyForm.querySelector('[data-field="ack"] input').checked=true;fire(historyForm,'submit');await must(()=>reloadSends.length===1&&!historyReload.app.querySelector('button[type="submit"]').disabled,'terminal unrelated historical-alt save');
      check('unrelated form save after re-open retains historical alt and private consent',stored().why===why.value&&JSON.stringify(stored().talentBuilds)===JSON.stringify(expectedHistory)&&stored().boardTalentBuildsOptIn===false);
      historyForm=historyReload.app.querySelector('form');const share=historyReload.app.querySelector('#board-talent-builds-opt-in');share.checked=true;fire(share,'change');historyForm.querySelector('[data-field="ack"] input').checked=true;fire(historyForm,'submit');await must(()=>reloadSends.length===2&&!historyReload.app.querySelector('button[type="submit"]').disabled,'terminal historical-alt sharing refusal');
      check('historical-alt sharing refusal stays in its own field and stored consent stays false',historyReload.app.querySelector('[data-field="talentBuilds"]').classList.contains('invalid')&&stored().boardTalentBuildsOptIn===false&&JSON.stringify(stored().talentBuilds)===JSON.stringify(expectedHistory));
    }else{
      check('fresh form restores changed main anchor and same historical alt editor',false);check('unrelated form save after re-open retains historical alt and private consent',false);check('historical-alt sharing refusal stays in its own field and stored consent stays false',false);
    }
  }
  // Real public Worker response and actual app index application after the
  // exact Native-redacted envelope shape; actual Native SQL is covered in
  // leadership197_test.cjs. Only Discord member transport is synthetic here.
  const leadershipOver = { DISCORD_BOT_TOKEN: 'synthetic-leadership-fixture-only' };
  const leadershipRequest = async (method, url, payload) => {
    const response = await indexMod.default.fetch(new Request('https://guild.example' + url, { method, headers: { Cookie: await cookieFor(STAFF), Origin: 'https://guild.example', 'X-Olympus': siteCore.PAGE_VERSION, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }), env(leadershipOver), ctx);
    return { response, body: await response.clone().json().catch(() => null) };
  };
  const leadershipTransport = originalTestFetch;
  originalTestFetch = async url => {
    const id = /\/members\/([0-9]{17,20})$/.exec(String(url))?.[1];
    if ([MEMBER, OTHER].includes(id)) return new Response(JSON.stringify({ user: { id, username: id === MEMBER ? 'active-officer' : 'erased-officer' }, nick: id === MEMBER ? 'Active officer' : null, roles: [], pending: false }), { headers: { 'Content-Type': 'application/json' } });
    return leadershipTransport(url);
  };
  try {
    for (const trailingTyped of [true, false]) {
      const admin = await leadershipRequest('GET', '/api/admin/leadership');
      if (admin.response.status !== 200) throw Error('original leadership administrator view unavailable: ' + JSON.stringify({ status: admin.response.status, body: admin.body }));
      const guilds = load('./site-leadership-data').GUILD_NAMES.map(name => ({ name, gm: '', officers: [] }));
      guilds[0].officers = ['Name withheld', '<@' + OTHER + '>', '<@' + MEMBER + '>', ...(trailingTyped ? ['Typed officer'] : [])];
      const saved = await leadershipRequest('PUT', '/api/admin/leadership', { guilds, expectedRevision: admin.body.revision, namesConfirmed: true, leadershipIdentitiesConfirmed: true });
      if (saved.response.status !== 200) throw Error('original qualified leadership fixture save refused: ' + JSON.stringify({ status: saved.response.status, body: saved.body }));
      const removed = JSON.parse(one("SELECT value FROM site_settings WHERE key='leadership'").value);
      removed.guilds[0].officers[1] = 'Name withheld'; delete removed.publications.guild_01_officer_02;
      if (!load('./site-leadership-data').leadershipEnvelope(removed)) throw Error('redacted leadership fixture lost its original schema');
      await fixtureRun("UPDATE site_settings SET value=? WHERE key='leadership'", JSON.stringify(removed));
      const leadershipPage = await openPage(MEMBER, leadershipOver); await leadershipPage.go('#/community/leadership');
      await must(() => leadershipPage.app.querySelectorAll('.leadership-card').length === 10, 'complete original leadership view');
      const officers = leadershipPage.app.querySelector('.leadership-card').querySelectorAll('dd')[1];
      check('actual app keeps active officer at seat3 after repeated withheld markers' + (trailingTyped ? ' and preserves the following typed officer' : ' even at the terminal seat'), officers.children.length === (trailingTyped ? 4 : 3) && officers.children[0].textContent.includes('Name withheld') && officers.children[1].textContent.includes('Name withheld') && officers.children[2].textContent.includes('Active officer') && officers.children[2].textContent.includes('current account association') && (!trailingTyped || officers.children[3].textContent.includes('Typed officer') && officers.children[3].textContent.includes('staff-entered / unverified')) && !leadershipPage.app.textContent.includes(MEMBER) && !leadershipPage.app.textContent.includes(OTHER));
      await leadershipPage.go('#/');
    }
  } finally { originalTestFetch = leadershipTransport; }
  // .199: the same admitted app/Worker fixture now exercises the guided application
  // UI. These are local synthetic reads/writes, not provider or game acceptance.
  const APPLICANT199 = '730000000000000199';
  await siteUser(APPLICANT199, { global_name: 'Iris' }); await character(APPLICANT199, 'Iris Main', 'Player-1-0199');
  const guided199 = await openPage(APPLICANT199); await guided199.go('#/vote');
  await must(() => !!guided199.app.querySelector('#application-track199'), '.199 six-track picker');
  const tracks199 = guided199.app.querySelector('#application-track199'), offices199 = guided199.app.querySelector('#application-office199'), search199 = guided199.app.querySelector('#application-office-search199');
  const trackIds199 = ['member', 'raider', 'artisan', 'officer', 'high_council', 'patron'];
  check('.199 visible picker has exactly the six owner-directed application tracks', JSON.stringify(tracks199.options.filter(option => option.value).map(option => option.value)) === JSON.stringify(trackIds199) && tracks199.getAttribute('aria-label') === 'Application track');
  tracks199.value = 'high_council'; fire(tracks199, 'change');
  const councilKeys199 = offices199.options.filter(option => option.value).map(option => option.value);
  check('.199 Council picker contains eligible Council portfolios and requires a specific seat', councilKeys199.includes('office_67') && councilKeys199.includes('office_58') && councilKeys199.every(key => guided199.boot.meta.appointments.find(row => row.key === key)?.applicationTrack === 'high_council') && byText(guided199.app, 'button', 'Apply on this track').disabled);
  tracks199.value = 'officer'; fire(tracks199, 'change'); search199.value = 'Mage Class Lead'; fire(search199, 'input');
  check('.199 searchable Officer picker narrows to the exact class office without Council leakage', offices199.options.some(option => option.value === 'class_lead:mage') && offices199.options.filter(option => option.value).every(option => /mage/i.test(option.textContent)) && !offices199.options.some(option => councilKeys199.includes(option.value)));
  search199.value = ''; fire(search199, 'input'); offices199.value = 'office_62'; fire(offices199, 'change'); byText(guided199.app, 'button', 'Apply on this track').click();
  await must(() => !!guided199.app.querySelector('form') && !!guided199.app.querySelector('[data-target-office="office_62"]'), '.199 actual picker enters exact Officer form');
  check('.199 actual track action opens the exact office form with the canonical Officer first choice', guided199.location.hash === '#/vote/officer/office_62' && guided199.app.querySelector('#application-track199').value === 'officer' && guided199.app.querySelector('#application-office199').value === 'office_62' && guided199.app.querySelector('[data-field="position"]').hidden && guided199.app.querySelectorAll('input[name="position"]').find(input => input.value === 'officer')?.checked);
  const publicIntent199 = guided199.app.querySelector('#board-application-intent199');
  check('.199 new office form never implies public intent, portrait or talent consent', !!publicIntent199 && !publicIntent199.checked && publicIntent199.disabled && !guided199.app.querySelector('#board-portrait-opt-in').checked && !guided199.app.querySelector('#board-talent-builds-opt-in').checked);
  await guided199.go('#/vote/not-a-track/office_62');
  check('.199 invalid track URL clears the prior valid application form and target badge', !guided199.app.querySelector('form') && !guided199.app.querySelector('[data-target-office="office_62"]') && guided199.app.textContent.includes('Application track unavailable'));
  await guided199.go('#/vote/high_council/office_62');
  check('.199 cross-tier office URL fails closed without mounting the former form', !guided199.app.querySelector('form') && guided199.app.textContent.includes('matching application track'));
  await guided199.go('#/vote/high_council/office_67');
  check('.199 exact Privy Council deep link preselects the Council track and matching portfolio', guided199.app.querySelector('#application-track199')?.value === 'high_council' && guided199.app.querySelector('#application-office199')?.value === 'office_67' && guided199.app.querySelector('[data-target-office="office_67"]') && guided199.app.querySelectorAll('input[name="position"]').find(input => input.value === 'office_67')?.checked);
  const membership199 = await openPage(APPLICANT199); await membership199.go('#/apply');
  check('.199 fresh ordinary application defaults visibly to Member without a public-intent tick', membership199.app.querySelector('#application-track199')?.value === 'member' && membership199.app.querySelectorAll('input[name="position"]').find(input => input.value === 'member')?.checked && !membership199.app.querySelector('#board-application-intent199')?.checked);
  for (const [track, canonical] of [['raider', 'raider'], ['artisan', 'member'], ['patron', 'member']]) {
    await membership199.go('#/vote/' + track + '/new');
    check('.199 ' + track + ' track uses its honest canonical application position without an office grant', membership199.app.querySelector('#application-track199')?.value === track && membership199.app.querySelectorAll('input[name="position"]').find(input => input.value === canonical)?.checked && !membership199.app.querySelector('[data-target-office]') && !membership199.app.querySelector('#board-application-intent199')?.checked);
  }

  const seed199 = { ...body, character: 'Iris Main', class: 'mage', backups: ['class_lead:mage', 'raid_leader_na'], answers: { ...body.answers, extra: 'Private .199 office applicant sentinel' } }; delete seed199.answers.talentBuilds;
  const seeded199 = await request('PUT', '/api/application', seed199, APPLICANT199);
  if (seeded199.response.status !== 200) throw Error('.199 exact-office seed refused: ' + JSON.stringify(seeded199.body));
  const exact199 = await openPage(APPLICANT199), exactSends199 = [];
  exact199.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') exactSends199.push(JSON.parse(init.body)); return false; });
  await exact199.go('#/vote/officer/class_lead%3Amage');
  let exactForm199 = exact199.app.querySelector('form'), classPick199 = exact199.app.querySelector('[data-field="classLead"] select');
  check('.199 exact Mage Class Lead form permits only its requested class and removes the same first-choice backup', classPick199.value === 'mage' && classPick199.options.filter(option => option.value).every(option => option.value === 'mage' ? !option.disabled : option.disabled) && exactForm199.querySelectorAll('[data-field="backups"] select').every(select => select.value !== 'class_lead:mage') && exactForm199.querySelectorAll('[data-field="backups"] select').some(select => select.value === 'raid_leader_na'));
  check('.199 saved board membership still does not imply public office-intent consent', !exact199.app.querySelector('#board-application-intent199').checked && !exact199.app.querySelector('#board-application-intent199').disabled && !exact199.app.querySelector('#board-portrait-opt-in').checked && !exact199.app.querySelector('#board-talent-builds-opt-in').checked);
  exactForm199.querySelector('[data-field="ack"] input').checked = true; fire(exactForm199, 'submit');
  const saved199 = () => JSON.parse(one('SELECT answers FROM site_applications WHERE discord_id=?', APPLICANT199).answers);
  await must(() => exactSends199.length === 1 && saved199().targetOffice === 'class_lead:mage' && !exact199.app.querySelector('button[type="submit"]').disabled, '.199 actual exact-class application save');
  check('.199 actual save persists bounded track and target in owned answers while leaving all three publication choices private', exactSends199[0].position === 'class_lead' && exactSends199[0].classLead === 'mage' && exactSends199[0].applicationTrack === 'officer' && exactSends199[0].targetOffice === 'class_lead:mage' && exactSends199[0].boardApplicationIntent === false && exactSends199[0].boardPortrait === false && exactSends199[0].boardTalentBuilds === false && saved199().applicationTrack === 'officer' && saved199().boardApplicationIntentOptIn === false);
  const privateIntentBoard199 = await openPage(OTHER); await privateIntentBoard199.go('#/vote/class_lead%3Amage');
  await must(() => privateIntentBoard199.app.querySelectorAll('.cand').some(candidate => candidate.textContent.includes('Iris')), '.199 actual class board private-intent read');
  let irisCard199 = privateIntentBoard199.app.querySelectorAll('.cand').find(candidate => candidate.textContent.includes('Iris'));
  check('.199 other voter sees the original board answers but no unconsented intent badge or private extra', !!irisCard199 && !irisCard199.querySelector('.application-intent199') && !irisCard199.textContent.includes(seed199.answers.extra));
  exactForm199 = exact199.app.querySelector('form'); const explicitIntent199 = exact199.app.querySelector('#board-application-intent199'); explicitIntent199.checked = true; fire(explicitIntent199, 'change'); exactForm199.querySelector('[data-field="ack"] input').checked = true; fire(exactForm199, 'submit');
  await must(() => exactSends199.length === 2 && saved199().boardApplicationIntentOptIn === true && !exact199.app.querySelector('button[type="submit"]').disabled, '.199 separate exact-office publication choice');
  const sharedIntentBoard199 = await openPage(OTHER); await sharedIntentBoard199.go('#/vote/class_lead%3Amage');
  await must(() => !!sharedIntentBoard199.app.querySelector('.cand [data-target-office="class_lead:mage"]'), '.199 explicitly shared exact office badge');
  irisCard199 = sharedIntentBoard199.app.querySelectorAll('.cand').find(candidate => candidate.textContent.includes('Iris'));
  check('.199 explicit intent consent publishes only canonical track and office badges without portrait, talents or private extra', irisCard199.querySelector('.application-intent199')?.getAttribute('data-application-track') === 'officer' && irisCard199.querySelector('[data-target-office="class_lead:mage"]') && !irisCard199.querySelector('.talent-build-links') && !irisCard199.textContent.includes(seed199.answers.extra) && exactSends199[1].boardApplicationIntent === true && exactSends199[1].boardPortrait === false && exactSends199[1].boardTalentBuilds === false);
  check('.199 successful save resets its separate public-intent control for the next save', !exact199.app.querySelector('#board-application-intent199').checked);
  const regional199 = await openPage(APPLICANT199); await regional199.go('#/vote/officer/office_74');
  const regionPick199 = regional199.app.querySelector('[data-field="applicationRaidRegion199"] select'), backupPick199 = regional199.app.querySelectorAll('[data-field="backups"] select')[0];
  check('.199 canonical Raid Leader office exposes exactly NA and EU existing regional seats', JSON.stringify(regionPick199.options.map(option => option.value)) === JSON.stringify(['raid_leader_na', 'raid_leader_eu']));
  backupPick199.value = 'raid_leader_eu'; fire(backupPick199, 'change'); regionPick199.value = 'raid_leader_eu'; fire(regionPick199, 'change');
  check('.199 changing raid region removes that exact role from backups without inventing a new seat', backupPick199.value === '' && regionPick199.value === 'raid_leader_eu' && !regional199.app.querySelector('#board-application-intent199').checked);
  const regionalSends199 = []; regional199.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') regionalSends199.push(JSON.parse(init.body)); return false; });
  const regionalForm199 = regional199.app.querySelector('form'); regionalForm199.querySelector('[data-field="ack"] input').checked = true; fire(regionalForm199, 'submit');
  await must(() => regionalSends199.length === 1 && !regional199.app.querySelector('button[type="submit"]').disabled, '.199 terminal regional selection save');
  check('.199 actual regional save uses the existing EU ballot key and retains the exact canonical office intent privately', regionalSends199[0].position === 'raid_leader_eu' && regionalSends199[0].targetOffice === 'office_74' && !regionalSends199[0].backups.includes('raid_leader_eu') && one('SELECT position FROM site_applications WHERE discord_id=?', APPLICANT199).position === 'raid_leader_eu' && saved199().targetOffice === 'office_74' && saved199().boardApplicationIntentOptIn === false);

  const roles199 = await openPage(APPLICANT199); await roles199.go('#/roles/rosetta-stone');
  const exactNames199 = ['Leader', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran', 'Raider', 'Member', 'Alt', 'Initiate'];
  const nativeCards199 = roles199.app.querySelectorAll('.rank-guide199-grid [data-native-slot]');
  check('.199 role guide fronts exactly ten ordered native ranks with the owner-confirmed zero-based slots', nativeCards199.length === 10 && nativeCards199.every((card, index) => card.getAttribute('data-native-slot') === String(index) && card.querySelector('h3').textContent === 'Rank ' + (index + 1) + ' — ' + exactNames199[index]));
  const table199 = roles199.app.querySelector('.rosetta-table199'), headings199 = ['In-Game Rank Number & Name', 'Tier & Statutory Codex Title', 'Organization Department & Branch Offices', 'Discord Role & Portal Access', 'How to Attain It'];
  const rows199 = table199.querySelectorAll('[data-rank-crosswalk]');
  check('.199 Rosetta Stone has five named columns and ten complete individually labelled rank rows', JSON.stringify(table199.querySelectorAll('th').map(th => th.textContent)) === JSON.stringify(headings199) && rows199.length === 10 && rows199.every((row, index) => row.getAttribute('data-rank-crosswalk') === String(index + 1) && row.querySelectorAll('td').length === 5 && row.querySelectorAll('td').every((td, column) => td.getAttribute('data-column') === headings199[column])));
  const bridgeKeys199 = rows199.flatMap(row => row.querySelectorAll('li a').map(link => decodeURIComponent(link.getAttribute('href').slice('#/organization/'.length))));
  const expectedKeys199 = roles199.boot.meta.appointments.map(row => row.key);
  check('.199 Rosetta Stone enumerates all 131 assignable keys exactly once across their ten rank rows', bridgeKeys199.length === 131 && new Set(bridgeKeys199).size === 131 && JSON.stringify(bridgeKeys199.slice().sort()) === JSON.stringify(expectedKeys199.slice().sort()) && rows199.every(row => row.querySelectorAll('li a').every(link => roles199.boot.meta.appointments.find(office => office.key === decodeURIComponent(link.getAttribute('href').slice('#/organization/'.length))).nativeRankOrdinal === Number(row.getAttribute('data-rank-crosswalk')))));
  const seatCards199 = roles199.app.querySelectorAll('.office-seat199'), eligibleKeys199 = roles199.boot.meta.appointments.filter(row => row.applicationEligible && ['officer', 'high_council'].includes(row.applicationTrack));
  check('.199 all 95 stable offices and 131 assignment cards have individual rank badges and exact open-seat apply links', seatCards199.length === 131 && seatCards199.filter(card => /^office_[0-9]{2}$/.test(card.getAttribute('data-office-key'))).length === 95 && seatCards199.every(card => !!card.querySelector('.rank-office199')) && eligibleKeys199.every(row => !!roles199.app.querySelector('[data-office-key="' + row.key + '"] a[href="#/vote/' + row.applicationTrack + '/' + encodeURIComponent(row.key) + '"]')));
  for (const appointedKey199 of ['member', 'office_07', 'office_27']) {
    const artisanCards199 = await openPage(APPLICANT199, {}, { bootTransform: boot => { boot.settings.appointed = { [appointedKey199]: 'Recorded synthetic holder' }; } });
    await artisanCards199.go('#/roles');
    const targets199 = ['office_07', 'office_27'].map(key => ({ key, card: artisanCards199.app.querySelector('[data-office-key="' + key + '"]') }));
    check('.199 actual Roles cards keep ' + appointedKey199 + ' separate from unrelated artisan route adapters', targets199.every(({ key, card }) => !!card && (key === appointedKey199 ? !!card.querySelector('[data-appointment-label="' + key + '"]') : !card.querySelector('[data-appointment-label]') && card.textContent.includes('No appointment recorded here; availability requires current leadership review.'))));
    await artisanCards199.go('#/');
  }
  const historical199 = roles199.app.querySelector('.technical-profile199');
  check('.199 competing historical profile guidance is closed under its explicit technical accordion', !!historical199 && !historical199.open && historical199.querySelector('summary').textContent === 'Technical & Historical Profile Notes' && roles199.app.textContent.includes('Co-Guild Master and Treasurer are appointments, not extra native ranks'));
  const goldKeys199 = roles199.boot.meta.royalWrits.map(row => row.key).sort();
  check('.199 roles renders the complete 20-item reviewed gold-only schedule and truthful OFF gates', goldKeys199.length === 20 && JSON.stringify(roles199.app.querySelectorAll('.royal-writs199 [data-writ-key]').map(row => row.getAttribute('data-writ-key')).sort()) === JSON.stringify(goldKeys199) && roles199.app.querySelector('.gold-policy199').textContent === roles199.boot.meta.royalWritPolicy.banner && roles199.app.textContent.includes('Olympus Link remain OFF') && roles199.app.textContent.includes("recipient's prior, specific, revocable opt-in"));
  for (const page199 of ['vote', 'governance', 'news', 'community/workshop']) {
    const goldPage199 = await openPage(APPLICANT199); await goldPage199.go('#/' + page199);
    await must(() => !!goldPage199.app.querySelector('[data-royal-writ-page="' + page199 + '"]'), '.199 ' + page199 + ' gold reference');
    check('.199 ' + page199 + ' exposes all 20 catalogue rows with the shared gold-only, free-addon and officer-review policy', goldPage199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 20 && goldPage199.app.querySelector('.gold-policy199')?.textContent === goldPage199.boot.meta.royalWritPolicy.banner && goldPage199.app.textContent.includes('no USD, Twitch subscriptions or crypto') && goldPage199.app.textContent.includes('zero paid addon gating'));
  }
  const army199 = await openPage(APPLICANT199); await army199.go('#/army');
  await must(() => !!army199.app.querySelector('[data-royal-writ-page="army"]'), '.199 Army charter schedule');
  check('.199 Army shows four reviewed flagship/leave writs without converting the unavailable live feed into capacity', army199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 4 && army199.app.querySelector('.gold-policy199')?.textContent === army199.boot.meta.royalWritPolicy.banner && !army199.app.querySelector('.royal-writs199 button'));
  const admin199 = await openPage(STAFF); await admin199.go('#/admin/treasury');
  await must(() => !!admin199.app.querySelector('.stockades-checklist199'), '.199 attended Treasury/Stockades operator reference');
  check('.199 Treasury keeps all 20 writs and eight manual steps honest about the unconfirmed external appeal venue', admin199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 20 && admin199.app.querySelectorAll('.stockades-checklist199 li').length === 8 && admin199.app.querySelector('.stockades-checklist199').textContent.includes('repurposing and an approved appeal invite are not confirmed') && admin199.app.querySelector('.gold-policy199')?.textContent === admin199.boot.meta.royalWritPolicy.banner && !admin199.app.querySelector('.stockades-checklist199 button'));
  // .199 H2 browser finding: exercise the actual model loader over genuine
  // authenticated Worker static HTTP before rendering its returned data. The
  // finite model cap is separate from the unchanged 256KiB reviewed-book cap.
  {
    const modelPath199 = '/static/governance/organization.json';
    const modelBytes199 = fs.readFileSync(path.join(root, 'public', modelPath199));
    const loaderStart199 = APP_JS.indexOf('  const GOVERNANCE_BOOK = '), loaderEnd199 = APP_JS.indexOf('  const governanceSlug = ', loaderStart199);
    if (loaderStart199 < 0 || loaderEnd199 <= loaderStart199) throw Error('owner199_actual_governance_loader_boundary');
    const actualLoaderSource199 = APP_JS.slice(loaderStart199, loaderEnd199);
    const instantiate199 = new Function('fetch', 'crypto', 'TextDecoder', 'own', actualLoaderSource199 + '\nreturn {governanceModel};');
    const loadClient199 = () => {
      const reads = []; let bodyOverride = null;
      const actualStaticFetch = async (pathname, init) => {
        if (pathname !== modelPath199) throw Error('owner199_unexpected_model_request');
        const assets = { fetch: request => bodyOverride === null ? governanceAssets.fetch(request) : new Response(bodyOverride, { headers: {'Content-Type':'application/json; charset=utf-8'} }) };
        const response = await indexMod.default.fetch(new Request('https://guild.example' + pathname, {headers:{Cookie:await cookieFor(MEMBER)}}), env({ASSETS:assets}), ctx);
        reads.push({path:pathname,credentials:init.credentials,redirect:init.redirect,status:response.status,bytes:(await response.clone().arrayBuffer()).byteLength});
        return response;
      };
      const loader = instantiate199(actualStaticFetch, globalThis.crypto, TextDecoder, (object,key)=>Object.prototype.hasOwnProperty.call(object,key));
      return {read:()=>loader.governanceModel(),reads,override:bytes=>{bodyOverride=bytes;}};
    };
    check('.199 regression uses the actual expanded Organization body above128KiB within its finite512KiB model cap',modelBytes199.length===345654&&modelBytes199.length>131072&&modelBytes199.length<=524288&&actualLoaderSource199.includes('publicGovernanceBytes(GOVERNANCE_MODEL, 524288)')&&actualLoaderSource199.includes('publicGovernanceBytes(GOVERNANCE_BOOK, 262144)'));
    const currentClient199=loadClient199(),model199=await currentClient199.read();
    check('.199 actual authenticated Worker HTTP and current app loader accept every345654 source byte with95 terms and exact book pins',currentClient199.reads.length===1&&currentClient199.reads[0].status===200&&currentClient199.reads[0].bytes===modelBytes199.length&&currentClient199.reads[0].credentials==='same-origin'&&currentClient199.reads[0].redirect==='error'&&JSON.stringify(model199)===JSON.stringify(JSON.parse(modelBytes199))&&model199.terms.length===95&&model199.appointments.length===131);
    // Reuse the existing Organization DOM fixture definitions, not its test body.
    // Only that fixture's data binding is supplied from the real loader above;
    // its actual organization-view.js renderer remains unchanged.
    const rendererFixturePath199=path.join(root,'tests/organization_view_test.cjs'),rendererFixtureSource199=fs.readFileSync(rendererFixturePath199,'utf8'),rendererCut199=rendererFixtureSource199.indexOf('const p = open();');
    const rendererPrefix199=rendererFixtureSource199.slice(0,rendererCut199);
    if(rendererCut199<0||require('node:crypto').createHash('sha256').update(rendererPrefix199).digest('hex')!=='13c3695d6a32aad145117d4ca5d971c506f40d2cc30ef995551b2ae67e187406')throw Error('owner199_original_organization_fixture_prefix_drift');
    const dataBinding199='const data = JSON.parse(fs.readFileSync(path.join(root, "public/static/governance/organization.json"), "utf8"));';
    if(rendererPrefix199.split(dataBinding199).length!==2)throw Error('owner199_original_organization_fixture_data_boundary');
    const FixtureModule199=require('node:module').Module,rendererExecution199=new FixtureModule199(rendererFixturePath199,module);rendererExecution199.filename=rendererFixturePath199;rendererExecution199.paths=FixtureModule199._nodeModulePaths(path.dirname(rendererFixturePath199));
    rendererExecution199.loadedModel199=model199;
    rendererExecution199._compile(rendererPrefix199.replace(dataBinding199,'const data = module.loadedModel199;')+'\nmodule.exports = open;',rendererFixturePath199);
    const rendered199=rendererExecution199.exports();
    check('.199 the actual Organization renderer paints the model returned by the real app HTTP loader',rendered199.main.all(node=>node.classList.contains('organization-term')).length===95&&rendered199.main.all(node=>!!node.getAttribute('data-office-key')).length===95&&rendered199.main.all(node=>!!node.getAttribute('data-native-rank')).length===10&&rendered199.main.textContent.includes('Technical & Historical Profile Notes'));
    rendered199.dispose();
    const padded199=size=>Buffer.concat([modelBytes199,Buffer.alloc(size-modelBytes199.length,0x20)]);
    const exactLimit199=loadClient199();exactLimit199.override(padded199(524288));
    const atLimit199=await exactLimit199.read();
    check('.199 exactly524288 valid JSON bytes retain all shape checks at the model boundary',exactLimit199.reads[0].bytes===524288&&atLimit199.terms.length===95&&atLimit199.book.sha256===model199.book.sha256);
    const oversized199=loadClient199();oversized199.override(padded199(524289));let oversizedError199=null;
    try{await oversized199.read();}catch(error){oversizedError199=error;}
    check('.199 actual524289-byte HTTP body fails closed before otherwise-valid model JSON can render',oversized199.reads.length===1&&oversized199.reads[0].status===200&&oversized199.reads[0].bytes===524289&&oversizedError199?.message==='The public governance file has an unexpected size.');
    oversized199.override(null);const recovered199=await oversized199.read();
    check('.199 a failed oversized read is not cached and an explicit later read loads only the genuine current body',oversized199.reads.length===2&&oversized199.reads[1].bytes===modelBytes199.length&&recovered199.terms.length===95);
    for(const [label,patch]of [['schema',data=>{data.schema='wrong-synthetic-schema';}],['book pin',data=>{data.book.sha256='0'.repeat(64);}]]){
      const altered199=JSON.parse(modelBytes199),refused199=loadClient199();patch(altered199);refused199.override(Buffer.from(JSON.stringify(altered199)));let refusal199=null;
      try{await refused199.read();}catch(error){refusal199=error;}
      check('.199 larger model ceiling preserves the original exact '+label+' validation',refused199.reads.length===1&&refused199.reads[0].status===200&&refusal199?.message==='The organization model has an unexpected shape.');
    }
  }
  console.log('\n' + ok + '/' + n + ' owner197/199 focused frontend checks passed; actual app/Worker with presentation-only DTO cases identified');
  process.exit(ok === n ? 0 : 1);
}
const execution197 = new Module(__filename, module); execution197.filename = __filename; execution197.paths = Module._nodeModulePaths(__dirname);
execution197._compile(prefix197 + '\n(' + frontendOwner197.toString() + ')().catch(error => { console.error(error.stack); process.exit(1); });', __filename);
