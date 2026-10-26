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
  const writsOn200 = { bootTransform: boot => { boot.settings.royalWritsOn = true; } };
  const guided199 = await openPage(APPLICANT199, {}, writsOn200); await guided199.go('#/vote');
  await must(() => !!guided199.app.querySelector('#application-track199'), '.199 six-track picker');
  const tracks199 = guided199.app.querySelector('#application-track199'), offices199 = guided199.app.querySelector('#application-office199'), search199 = guided199.app.querySelector('#application-office-search199');
  const trackIds199 = ['member', 'raider', 'artisan', 'officer', 'high_council', 'patron'];
  check('.199 visible picker has exactly the six owner-directed application tracks', JSON.stringify(tracks199.options.filter(option => option.value).map(option => option.value)) === JSON.stringify(trackIds199) && tracks199.getAttribute('aria-label') === 'Application track');
  const trackArt200 = { member: 'pos-member', raider: 'pos-raider', artisan: 'pos-professions', officer: 'pos-officer', high_council: 'pos-co_gm', patron: 'pos-treasurer' };
  const trackPurpose200 = {
    member: 'Find your place in Olympus at your own pace: leveling, dungeons, guild events and everyday company.',
    raider: 'Build toward dependable PvE progression with a prepared character and a team that knows when you can play.',
    artisan: 'Put your professions and rare recipes to work for the guild through the opt-in Workshop.',
    officer: 'Take responsibility for a specific part of guild life: branch leadership, raids, class support, recruitment, events or moderation.',
    high_council: 'Apply to steward a High Council portfolio, from the Privy Court and War Council to intake, artisanry, systems or heraldry.',
    patron: 'Request a reviewed Royal Patron or Flagship charter through the voluntary in-game gold writ track.'
  };
  const trackCards200 = guided199.app.querySelectorAll('[data-application-track-card]');
  check('.200 explicitly enabled picker illustrates all six canonical paths with existing local icons, duties and expandable commitments', JSON.stringify(trackCards200.map(card => card.getAttribute('data-application-track-card'))) === JSON.stringify(trackIds199) && trackCards200.every(card => { const id=card.getAttribute('data-application-track-card'), image=card.querySelector('img.ico.l'), details=card.querySelector('details.application-expectations200'); return image?.getAttribute('src') === '/static/wow/'+trackArt200[id]+'.png' && fs.existsSync(path.join(root,'public',image.getAttribute('src'))) && image.getAttribute('alt') === '' && card.querySelector('p')?.textContent === trackPurpose200[id] && card.querySelectorAll('li').length === 2 && details?.querySelector('summary')?.textContent === 'Commitment & expectations' && details.querySelector('p')?.textContent.length > 65 && card.querySelector('[data-choose-track200="'+id+'"]')?.getAttribute('type') === 'button'; }));
  check('.200 every illustrated path button has a distinct accessible name tied to its visible heading', trackCards200.every(card=>card.querySelector('button').getAttribute('aria-label')==='Choose application path: '+card.querySelector('h3').textContent) && new Set(trackCards200.map(card=>card.querySelector('button').getAttribute('aria-label'))).size===6);
  guided199.app.querySelector('[data-choose-track200="high_council"]').click();
  check('.200 illustrated Council selection synchronizes the quick selector and one visual/accessibility selected state without navigating', tracks199.value === 'high_council' && guided199.location.hash === '#/vote' && trackCards200.filter(card => card.classList.contains('chosen')).length === 1 && guided199.app.querySelector('[data-choose-track200="high_council"]').getAttribute('aria-pressed') === 'true');
  const councilKeys199 = offices199.options.filter(option => option.value).map(option => option.value);
  check('.199 Council picker contains eligible Council portfolios and requires a specific seat', councilKeys199.includes('office_67') && councilKeys199.includes('office_58') && councilKeys199.every(key => guided199.boot.meta.appointments.find(row => row.key === key)?.applicationTrack === 'high_council') && byText(guided199.app, 'button', 'Apply on this track').disabled);
  guided199.app.querySelector('[data-choose-track200="officer"]').click(); search199.value = 'Mage Class Lead'; fire(search199, 'input');
  check('.199 searchable Officer picker narrows to the exact class office without Council leakage', offices199.options.some(option => option.value === 'class_lead:mage') && offices199.options.filter(option => option.value).every(option => /mage/i.test(option.textContent)) && !offices199.options.some(option => councilKeys199.includes(option.value)));
  check('.200 searched office cards carry the exact keys, actual role descriptions and expandable responsibilities', guided199.app.querySelectorAll('[data-application-office-card]').length > 0 && guided199.app.querySelectorAll('[data-application-office-card]').every(card => /mage/i.test(card.textContent) && card.querySelector('img.ico.l')?.getAttribute('src')?.startsWith('/static/wow/') && fs.existsSync(path.join(root,'public',card.querySelector('img').getAttribute('src'))) && card.querySelector('details.application-expectations200 summary')?.textContent === 'Responsibilities & expectations' && card.querySelector('details').textContent.length > 100));
  search199.value = ''; fire(search199, 'input'); guided199.app.querySelector('[data-choose-office200="office_62"]').click();
  check('.200 choosing an illustrated office synchronizes its exact key, pressed state and vacancy explanation without navigating', offices199.value === 'office_62' && guided199.location.hash === '#/vote' && guided199.app.querySelector('[data-choose-office200="office_62"]').getAttribute('aria-pressed') === 'true' && guided199.app.querySelector('[data-application-office-card="office_62"]').classList.contains('chosen') && guided199.app.querySelector('[data-application-office-card="office_62"]').textContent.includes('Selection does not confer the office or its permissions'));
  check('.200 office-card buttons retain accessible specific-office names after selection',guided199.app.querySelectorAll('[data-application-office-card]').every(card=>card.querySelector('[data-choose-office200]').getAttribute('aria-label')==='Choose office: '+card.querySelector('h4').textContent));
  guided199.app.querySelector('[data-choose-track200="officer"]').click();
  check('.200 clicking the already-selected illustrated path preserves the exact office selection', offices199.value === 'office_62' && guided199.app.querySelector('[data-choose-office200="office_62"]').getAttribute('aria-pressed') === 'true');
  byText(guided199.app, 'button', 'Apply on this track').click();
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
  const membership199 = await openPage(APPLICANT199, {}, writsOn200); await membership199.go('#/apply');
  check('.199 fresh ordinary application defaults visibly to Member without a public-intent tick', membership199.app.querySelector('#application-track199')?.value === 'member' && membership199.app.querySelectorAll('input[name="position"]').find(input => input.value === 'member')?.checked && !membership199.app.querySelector('#board-application-intent199')?.checked);
  for (const [track, canonical] of [['raider', 'raider'], ['artisan', 'member'], ['patron', 'member']]) {
    await membership199.go('#/vote/' + track + '/new');
    check('.199 ' + track + ' track uses its honest canonical application position without an office grant', membership199.app.querySelector('#application-track199')?.value === track && membership199.app.querySelectorAll('input[name="position"]').find(input => input.value === canonical)?.checked && !membership199.app.querySelector('[data-target-office]') && !membership199.app.querySelector('#board-application-intent199')?.checked);
  }
  const filled200 = await openPage(APPLICANT199, {}, { bootTransform: boot => { boot.settings.appointed = { office_67: 'Recorded Council holder' }; } });
  await filled200.go('#/vote'); filled200.app.querySelector('[data-choose-track200="high_council"]').click();
  const filledCard200 = filled200.app.querySelector('[data-application-office-card="office_67"]'), filledButton200 = filledCard200.querySelector('[data-choose-office200="office_67"]');
  check('.200 filled illustrated Council seat is labelled unavailable in both controls and keeps its responsibilities readable', filledButton200.disabled && filledButton200.textContent === 'Seat filled' && filledCard200.classList.contains('appointed') && filledCard200.textContent.includes('this seat takes no applications') && filledCard200.querySelector('details').textContent.length > 100 && filled200.app.querySelector('#application-office199').options.find(option => option.value === 'office_67').disabled);
  filledButton200.click();
  check('.200 a synthetic click on a disabled filled office cannot select it or enable the final application action', filled200.app.querySelector('#application-office199').value === '' && filledButton200.getAttribute('aria-pressed') === 'false' && byText(filled200.app,'button','Apply on this track').disabled && filled200.location.hash === '#/vote');

  const seed199 = { ...body, character: 'Iris Main', class: 'mage', backups: ['class_lead:mage', 'raid_leader_na'], answers: { ...body.answers, extra: 'Private .199 office applicant sentinel' } }; delete seed199.answers.talentBuilds;
  const seeded199 = await request('PUT', '/api/application', seed199, APPLICANT199);
  if (seeded199.response.status !== 200) throw Error('.199 exact-office seed refused: ' + JSON.stringify(seeded199.body));
  const exact199 = await openPage(APPLICANT199), exactSends199 = [];
  exact199.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') exactSends199.push(JSON.parse(init.body)); return false; });
  await exact199.go('#/vote'); exact199.app.querySelector('[data-choose-track200="officer"]').click();
  const exactSearch200=exact199.app.querySelector('#application-office-search199'); exactSearch200.value='Mage Class Lead';fire(exactSearch200,'input');
  exact199.app.querySelector('[data-choose-office200="class_lead:mage"]').click(); byText(exact199.app,'button','Apply on this track').click();
  await must(()=>!!exact199.app.querySelector('form')&&!!exact199.app.querySelector('[data-target-office="class_lead:mage"]'),'.200 illustrated Mage choice enters the original exact form');
  check('.200 illustrated Mage card reaches the exact encoded route and grants none of the three publication consents',exact199.location.hash==='#/vote/officer/class_lead%3Amage'&&!exact199.app.querySelector('#board-application-intent199').checked&&!exact199.app.querySelector('#board-portrait-opt-in').checked&&!exact199.app.querySelector('#board-talent-builds-opt-in').checked);
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
  const regional199 = await openPage(APPLICANT199); await regional199.go('#/vote'); regional199.app.querySelector('[data-choose-track200="officer"]').click();regional199.app.querySelector('[data-choose-office200="office_74"]').click();byText(regional199.app,'button','Apply on this track').click();
  await must(()=>!!regional199.app.querySelector('[data-field="applicationRaidRegion199"] select'),'.200 illustrated regional office reaches the original exact region form');
  check('.200 illustrated regional card preserves the canonical office URL and original private intent controls',regional199.location.hash==='#/vote/officer/office_74'&&regional199.app.querySelector('[data-target-office="office_74"]')&&!regional199.app.querySelector('#board-application-intent199').checked&&!regional199.app.querySelector('#board-portrait-opt-in').checked&&!regional199.app.querySelector('#board-talent-builds-opt-in').checked);
  const regionPick199 = regional199.app.querySelector('[data-field="applicationRaidRegion199"] select'), backupPick199 = regional199.app.querySelectorAll('[data-field="backups"] select')[0];
  check('.199 canonical Raid Leader office exposes exactly NA and EU existing regional seats', JSON.stringify(regionPick199.options.map(option => option.value)) === JSON.stringify(['raid_leader_na', 'raid_leader_eu']));
  backupPick199.value = 'raid_leader_eu'; fire(backupPick199, 'change'); regionPick199.value = 'raid_leader_eu'; fire(regionPick199, 'change');
  check('.199 changing raid region removes that exact role from backups without inventing a new seat', backupPick199.value === '' && regionPick199.value === 'raid_leader_eu' && !regional199.app.querySelector('#board-application-intent199').checked);
  const regionalSends199 = []; regional199.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') regionalSends199.push(JSON.parse(init.body)); return false; });
  const regionalForm199 = regional199.app.querySelector('form'); regionalForm199.querySelector('[data-field="ack"] input').checked = true; fire(regionalForm199, 'submit');
  await must(() => regionalSends199.length === 1 && !regional199.app.querySelector('button[type="submit"]').disabled, '.199 terminal regional selection save');
  check('.199 actual regional save uses the existing EU ballot key and retains the exact canonical office intent privately', regionalSends199[0].position === 'raid_leader_eu' && regionalSends199[0].targetOffice === 'office_74' && !regionalSends199[0].backups.includes('raid_leader_eu') && one('SELECT position FROM site_applications WHERE discord_id=?', APPLICANT199).position === 'raid_leader_eu' && saved199().targetOffice === 'office_74' && saved199().boardApplicationIntentOptIn === false);

  const roles199 = await openPage(APPLICANT199, {}, writsOn200); await roles199.go('#/roles/rosetta-stone');
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
  // Read the actual rendered banner source, rather than trusting a text-only
  // banner check. The H7 browser found a complete but undecodable missing icon.
  const goldArt199 = JSON.parse(fs.readFileSync(path.join(root, 'public/static/wow/asset-provenance.json'), 'utf8'));
  const goldReference199 = JSON.parse(fs.readFileSync(path.join(root, '../scripts/official_asset_reference.json'), 'utf8'));
  const goldBannerAsset199 = page => {
    const policy = page.app.querySelector('.gold-policy199'), banner = policy?.parentNode?.parentNode;
    const images = banner?.querySelectorAll('img') || []; if (!banner?.classList.contains('notice-box') || images.length !== 1) return false;
    const src = images[0].getAttribute('src'); if (!/^\/static\/wow\/[a-z0-9_-]+\.png$/.test(src || '')) return false;
    const file = path.join(root, 'public', src), relative = 'worker/public' + src;
    if (!fs.existsSync(file)) return false;
    const bytes = fs.readFileSync(file), hash = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const provenance = goldArt199.images_and_fonts.filter(row => row.path === relative), reference = goldReference199.assets.filter(row => row.path === relative);
    return provenance.length === 1 && reference.length === 1 && provenance[0].classification === 'WoW client-derived image' && provenance[0].pixel_lineage === 'PASS'
      && bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(16) === provenance[0].width && bytes.readUInt32BE(20) === provenance[0].height
      && [...provenance, ...reference].every(row => row.bytes === bytes.length && row.sha256 === hash) && images[0].getAttribute('alt') === '';
  };
  check('.199 roles renders the complete 20-item reviewed gold-only schedule and truthful OFF gates', goldKeys199.length === 20 && JSON.stringify(roles199.app.querySelectorAll('.royal-writs199 [data-writ-key]').map(row => row.getAttribute('data-writ-key')).sort()) === JSON.stringify(goldKeys199) && roles199.app.querySelector('.gold-policy199').textContent === roles199.boot.meta.royalWritPolicy.banner && roles199.app.textContent.includes('Olympus Link remain OFF') && roles199.app.textContent.includes("recipient's prior, specific, revocable opt-in"));
  check('.199 roles gold banner references an existing provenance-pinned PNG with matching original dimensions and bytes', goldBannerAsset199(roles199));
  for (const page199 of ['vote', 'governance', 'news', 'community/workshop']) {
    const goldPage199 = await openPage(APPLICANT199, {}, writsOn200); await goldPage199.go('#/' + page199);
    await must(() => !!goldPage199.app.querySelector('[data-royal-writ-page="' + page199 + '"]'), '.199 ' + page199 + ' gold reference');
    check('.199 ' + page199 + ' exposes all 20 catalogue rows with the shared gold-only, free-addon and officer-review policy', goldPage199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 20 && goldPage199.app.querySelector('.gold-policy199')?.textContent === goldPage199.boot.meta.royalWritPolicy.banner && goldPage199.app.textContent.includes('no USD, Twitch subscriptions or crypto') && goldPage199.app.textContent.includes('zero paid addon gating'));
    check('.199 ' + page199 + ' gold banner image exists and matches its original official PNG provenance and asset pins', goldBannerAsset199(goldPage199));
  }
  const army199 = await openPage(APPLICANT199, {}, writsOn200); await army199.go('#/army');
  await must(() => !!army199.app.querySelector('[data-royal-writ-page="army"]'), '.199 Army charter schedule');
  check('.199 Army shows four reviewed flagship/leave writs without converting the unavailable live feed into capacity', army199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 4 && army199.app.querySelector('.gold-policy199')?.textContent === army199.boot.meta.royalWritPolicy.banner && !army199.app.querySelector('.royal-writs199 button'));
  check('.199 Army gold banner image exists and matches its original official PNG provenance and asset pins', goldBannerAsset199(army199));
  const admin199 = await openPage(STAFF, {}, writsOn200); await admin199.go('#/admin/treasury');
  await must(() => !!admin199.app.querySelector('.stockades-checklist199'), '.199 attended Treasury/Stockades operator reference');
  check('.199 Treasury keeps all 20 writs and eight manual steps honest about the unconfirmed external appeal venue', admin199.app.querySelectorAll('.royal-writs199 [data-writ-key]').length === 20 && admin199.app.querySelectorAll('.stockades-checklist199 li').length === 8 && admin199.app.querySelector('.stockades-checklist199').textContent.includes('repurposing and an approved appeal invite are not confirmed') && admin199.app.querySelector('.gold-policy199')?.textContent === admin199.boot.meta.royalWritPolicy.banner && !admin199.app.querySelector('.stockades-checklist199 button'));
  check('.199 admin Treasury gold banner image exists and matches its original official PNG provenance and asset pins', goldBannerAsset199(admin199));
  // .200: actual application routes and authenticated local Worker writes. Boot
  // corruption below qualifies presentation only; no provider setting changes.
  const scheduleAbsent200 = page => !page.app.querySelector('.royal-writs199') && !page.app.querySelector('.gold-policy199') && !page.app.querySelector('.stockades-checklist199') && !page.app.querySelector('[data-writ-key]');
  const routeWitnesses200 = [
    ['roles', page => !!page.app.querySelector('.rank-guide199-grid')],
    ['vote', page => !!page.app.querySelector('#application-track199')],
    ['governance', page => !!page.app.querySelector('#governance-search')],
    ['news', page => page.app.textContent.includes('Town Crier')],
    ['community/workshop', page => page.app.textContent.includes('Crafters & Artisans Workshop')],
    ['army', page => !!page.app.querySelector('[data-beta-epoch-archive]')],
    ['admin', page => !!byText(page.app, 'button', 'Show recent activity')],
    ['admin/treasury', page => !!page.app.querySelector('#treasury-reference')]
  ];
  for (const [label, corrupt] of [['absent', settings => { delete settings.royalWritsOn; }], ['string true', settings => { settings.royalWritsOn = 'true'; }], ['number one', settings => { settings.royalWritsOn = 1; }], ['object', settings => { settings.royalWritsOn = {}; }]]) {
    for (const [route, mounted] of routeWitnesses200) {
      const paused = await openPage(route.startsWith('admin') ? STAFF : APPLICANT199, {}, { bootTransform: boot => corrupt(boot.settings) });
      await paused.go('#/' + route); await must(() => mounted(paused), '.200 ' + label + ' ' + route + ' settled original view');
      check('.200 ' + route + ' hides the schedule, banner and Stockades checklist for ' + label + ' display setting', scheduleAbsent200(paused));
      if (route === 'vote') check('.200 ' + label + ' setting keeps all six historical metadata tracks but offers only the five unpaused illustrated paths', paused.boot.meta.applicationTracks.length === 6 && paused.boot.meta.applicationTracks.some(track => track.id === 'patron') && paused.app.querySelectorAll('[data-application-track-card]').length === 5 && !paused.app.querySelector('[data-application-track-card="patron"]') && !paused.app.querySelector('#application-track199').options.some(option => option.value === 'patron'));
      if (route === 'roles') check('.200 ' + label + ' setting also hides the legacy price offer while preserving the exact ten ranks and historical profile notes', !paused.app.textContent.includes('Tithe Payer 25g+') && !!paused.app.querySelector('.technical-profile199') && paused.app.querySelectorAll('[data-native-slot]').length === 10 && paused.app.textContent.includes('Royal Writs and new Patron applications are paused'));
      if (route === 'governance') check('.200 ' + label + ' governance keeps the constitutional reader and current source download with a visible paused-reference notice', !!paused.app.querySelector('.governance-reader') && paused.app.querySelector('a[href="/static/governance/reconciled-book.md"]') && paused.app.querySelector('.writs-paused200')?.textContent.includes('not an offer of an available service'));
      if (route === 'admin/treasury') check('.200 ' + label + ' Treasury retains receipt/status tools without offering the old price tiers or Stockades service', !!paused.app.querySelector('#treasury-operation') && !!paused.app.querySelector('#treasury-reference') && paused.app.textContent.includes('Existing receipt and operation records remain available') && !paused.app.textContent.includes('Tithe Payer 25g+'));
      await paused.go('#/');
    }
  }
  const defaultBoot200 = await openPage(APPLICANT199);
  check('.200 actual Worker boot defaults the display switch OFF without removing the canonical writ/track catalogues', defaultBoot200.boot.settings.royalWritsOn === false && defaultBoot200.boot.meta.royalWrits.length === 20 && defaultBoot200.boot.meta.applicationTracks.length === 6);
  await defaultBoot200.go('#/vote/patron/new');
  await must(()=>defaultBoot200.app.textContent.includes('Patron applications are paused'),'.200 direct Patron pause terminal view');
  check('.200 a direct paused Patron URL shows an explicit hold and five alternatives, never a savable Member substitute', defaultBoot200.app.textContent.includes('Patron applications are paused') && !defaultBoot200.app.querySelector('form') && !defaultBoot200.app.querySelector('button[type="submit"]') && defaultBoot200.app.querySelectorAll('[data-application-track-card]').length === 5 && !defaultBoot200.app.querySelector('[data-application-track-card="patron"]'), {hash:defaultBoot200.location.hash,forms:defaultBoot200.app.querySelectorAll('form').length,submits:defaultBoot200.app.querySelectorAll('button[type="submit"]').length,cards:defaultBoot200.app.querySelectorAll('[data-application-track-card]').map(card=>card.getAttribute('data-application-track-card'))});

  const switchPage200 = await openPage(STAFF), switchSends200 = [];
  switchPage200.before((url, init) => { if (url === '/api/admin/settings' && init.method === 'PUT') switchSends200.push(JSON.parse(init.body)); return false; });
  await switchPage200.go('#/admin/settings'); await must(() => !!switchPage200.app.querySelector('#royal-writs-on'), '.200 original admin switch');
  const switchBox200 = switchPage200.app.querySelector('#royal-writs-on');
  check('.200 Admin renders an unchecked explicit switch with preservation and separate provider-OFF disclosure', switchBox200.getAttribute('type') === 'checkbox' && !switchBox200.checked && switchBox200.closest('label').textContent.includes('Existing applications, receipts and constitutional reference text are preserved') && switchBox200.closest('label').textContent.includes('does not enable payments, Discord role dispatch, Olympus Link'));
  switchBox200.checked = true; byText(switchPage200.app, 'button', 'Save settings').click();
  await must(() => switchSends200.length === 1 && one("SELECT value FROM site_settings WHERE key='royalWritsOn'")?.value === '1' && !byText(switchPage200.app, 'button', 'Save settings').disabled, '.200 original enabled-setting save');
  const enabledRead200 = await request('GET', '/api/admin/overview', undefined, STAFF);
  check('.200 actual Admin enable sends a boolean and adopts a genuine readable enabled setting without provider activation fields', switchSends200[0].royalWritsOn === true && typeof switchSends200[0].royalWritsOn === 'boolean' && enabledRead200.response.status === 200 && enabledRead200.body.settings.royalWritsOn === true && !Object.keys(switchSends200[0]).some(key => /TREASURY_COSMETIC|ARMY_SITE_AGGREGATE|LINK_DB|webhook/i.test(key)));
  await switchPage200.go('#/vote');
  check('.200 admitted Admin readback enables the schedule and sixth illustrated path in the same page state', switchPage200.app.querySelectorAll('[data-application-track-card]').length === 6 && !!switchPage200.app.querySelector('[data-application-track-card="patron"]') && switchPage200.app.querySelectorAll('[data-writ-key]').length === 20);

  const PATRON200 = '730000000000000200'; await siteUser(PATRON200, { global_name: 'Patron fixture' }); await character(PATRON200, 'Patron Main', 'Player-1-0200');
  const patronBody200 = { ...body, position: 'member', backups: [], character: 'Patron Main', class: 'mage', applicationTrack: 'patron', targetOffice: null, boardApplicationIntent: false, answers: { ...body.answers, extra: 'Private retained Patron fixture .200' } }; delete patronBody200.answers.talentBuilds;
  const patronSeed200 = await request('PUT', '/api/application', patronBody200, PATRON200);
  if (patronSeed200.response.status !== 200) throw Error('.200 original enabled Patron seed refused: ' + JSON.stringify(patronSeed200.body));
  const patronBefore200 = one('SELECT answers,position,status FROM site_applications WHERE discord_id=?', PATRON200);
  await switchPage200.go('#/admin/settings'); await must(() => switchPage200.app.querySelector('#royal-writs-on')?.checked === true, '.200 original enabled admin reread');
  switchPage200.app.querySelector('#royal-writs-on').checked = false; byText(switchPage200.app, 'button', 'Save settings').click();
  await must(() => switchSends200.length === 2 && one("SELECT value FROM site_settings WHERE key='royalWritsOn'")?.value === '0' && !byText(switchPage200.app, 'button', 'Save settings').disabled, '.200 original disabled-setting save');
  const disabledRead200 = await request('GET', '/api/admin/overview', undefined, STAFF);
  check('.200 actual Admin disable sends strict false and the fresh Worker readback confirms OFF', switchSends200[1].royalWritsOn === false && disabledRead200.response.status === 200 && disabledRead200.body.settings.royalWritsOn === false);
  await switchPage200.go('#/vote');
  check('.200 same page after Admin ON to OFF removes the Patron card, selector option and schedule', scheduleAbsent200(switchPage200) && switchPage200.app.querySelectorAll('[data-application-track-card]').length === 5 && !switchPage200.app.querySelector('[data-application-track-card="patron"]') && !switchPage200.app.querySelector('#application-track199').options.some(option => option.value === 'patron'));
  const retained200 = await openPage(PATRON200), retainedRequests200 = [];
  retained200.before((url, init) => { if (url === '/api/application') retainedRequests200.push(init.method || 'GET'); return false; });
  await retained200.go('#/apply');
  check('.200 an existing Patron application remains visibly labelled with its original private history and five alternatives while paused, without an edit form or silent write', retained200.app.textContent.includes('Patron applications are paused') && !!retained200.app.querySelector('[data-application-track="patron"]') && retained200.app.textContent.includes('Private retained Patron fixture .200') && retained200.app.querySelectorAll('[data-application-track-card]').length===5 && !retained200.app.querySelector('form') && retainedRequests200.length === 0 && JSON.stringify(one('SELECT answers,position,status FROM site_applications WHERE discord_id=?', PATRON200)) === JSON.stringify(patronBefore200));
  const patronCopy200 = await request('GET', '/api/me/export', undefined, PATRON200);
  check('.200 paused Patron history remains in the real own-copy with its canonical track and unchanged application content', patronCopy200.response.status === 200 && patronCopy200.body.site.application.answers.applicationTrack === 'patron' && patronCopy200.body.site.application.answers.extra === 'Private retained Patron fixture .200' && one('SELECT answers FROM site_applications WHERE discord_id=?', PATRON200).answers === patronBefore200.answers);
  retained200.app.querySelector('[data-choose-track200="member"]').click();
  check('.200 selecting an alternative card changes only the explicit local choice and preserves the original Patron history until a final action',retained200.location.hash==='#/apply'&&retained200.app.querySelector('#application-track199').value==='member'&&retainedRequests200.length===0&&one('SELECT answers FROM site_applications WHERE discord_id=?',PATRON200).answers===patronBefore200.answers);
  byText(retained200.app,'button','Apply on this track').click();
  await must(()=>!!retained200.app.querySelector('form')&&retained200.app.querySelector('#application-track199')?.value==='member','.200 explicit alternative path form');
  check('.200 explicitly opening the alternative Member form still performs no silent conversion or save and preserves private content and fresh unchecked consents',retained200.location.hash==='#/vote/member/new'&&retainedRequests200.length===0&&one('SELECT answers FROM site_applications WHERE discord_id=?',PATRON200).answers===patronBefore200.answers&&retained200.app.querySelector('[data-field="extra"] textarea')?.value==='Private retained Patron fixture .200'&&!retained200.app.querySelector('#board-application-intent199').checked&&!retained200.app.querySelector('#board-portrait-opt-in').checked&&!retained200.app.querySelector('#board-talent-builds-opt-in').checked);
  for (const state200 of ['submitted', 'reviewing']) {
    await fixtureRun('UPDATE site_applications SET status=? WHERE discord_id=?', state200, PATRON200);
    const withdrawPage200 = await openPage(PATRON200), deletes200 = [];
    withdrawPage200.before((url, init) => { if (url === '/api/application') deletes200.push(init.method || 'GET'); return false; });
    await withdrawPage200.go('#/apply'); byText(withdrawPage200.app, 'button', 'Withdraw my application').click();
    await must(() => withdrawPage200.document.querySelectorAll('dialog').some(dialog => dialog.open), '.200 ' + state200 + ' Patron withdrawal confirmation');
    const confirmation200 = withdrawPage200.document.querySelectorAll('dialog').find(dialog => dialog.open);
    check('.200 paused ' + state200 + ' Patron withdrawal requires confirmation before issuing any request', confirmation200.textContent.includes('Withdraw your application?') && deletes200.length === 0 && one('SELECT status FROM site_applications WHERE discord_id=?', PATRON200).status === state200);
    byText(confirmation200, 'button', 'Withdraw').click();
    await must(() => one('SELECT status FROM site_applications WHERE discord_id=?', PATRON200).status === 'withdrawn', '.200 ' + state200 + ' Patron withdrawal acknowledged');
    check('.200 confirmed paused ' + state200 + ' Patron withdrawal uses only the original DELETE and preserves its historical track', JSON.stringify(deletes200) === JSON.stringify(['DELETE']) && JSON.parse(one('SELECT answers FROM site_applications WHERE discord_id=?', PATRON200).answers).applicationTrack === 'patron');
  }
  // Exercise the unchanged production cache-admission prefix against the same
  // mounted main. Its later board network/results path is outside this fixture;
  // no copied condition or timer stands in for the setting-change invalidation.
  {
    const sourcePart200 = (start, end) => { const a=APP_JS.indexOf(start),b=APP_JS.indexOf(end,a);if(a<0||b<=a)throw Error('owner200_source_boundary');return APP_JS.slice(a,b); };
    const originalLine200 = start => { const lines=APP_JS.split(/\r?\n/).filter(line=>line.startsWith(start));if(lines.length!==1)throw Error('owner200_source_line_boundary');return lines[0]; };
    const productionDom200=sourcePart200('  function h(tag, props, ...kids) {','  // ---------------------------------------------------------------- the game');
    const productionGate200=sourcePart200('  const royalWritsVisible200 = ','  // Membership-form adapters');
    const productionWrits200=sourcePart200('  function goldBanner199() {','  function hierarchyPanel199() {');
    const productionPicker200=sourcePart200('  function applicationTrackPicker199(','  // The boot carries the RESOLVED');
    const productionBoardPrefix200=sourcePart200('  const V = { role:','    // The Worker already caches these counts');
    const w=makeWindow('{}'),state={settings:{royalWritsOn:true,votingOpen:true,appointed:{},noVote:[]}},meta={...defaultBoot200.boot.meta,appointments:[]};
    const deps={document:w.document,Node,Event,S:state,M:()=>meta,tracks199:()=>meta.applicationTracks,offices199:()=>[],office199:()=>null,track199:id=>meta.applicationTracks.find(row=>row.id===id),displayHolder:()=>'',positionOf:()=>null,posIcon:()=>null,officeBadge199:()=>null,roleInfo:()=>null,ROUTES:{},location:w.location,dec:value=>value};
    const cache200=new Function(...Object.keys(deps),productionDom200+'\n'+originalLine200('  const art = ')+'\n'+originalLine200('  const icon = ')+'\n'+originalLine200('  const frame = ')+'\n'+originalLine200('  const noticeBox = ')+'\n'+productionGate200+productionWrits200+productionPicker200+productionBoardPrefix200+'\nboardShells.set(main,{settingsKey}); }; return {vote:main=>ROUTES.vote(main,[]),panel:writsPanel199};')(...Object.values(deps));
    const sameMain200=w.app.appendChild(new Element('main')); await cache200.vote(sameMain200);
    const previousChooser200=sameMain200.querySelector('.application-chooser200');
    check('.200 original board cache prefix initially mounts all six enabled cards and the schedule', !!previousChooser200 && sameMain200.querySelectorAll('[data-application-track-card]').length===6 && sameMain200.querySelectorAll('[data-writ-key]').length===20);
    state.settings.royalWritsOn=false; await cache200.vote(sameMain200);
    check('.200 original same-mounted board cache invalidates on ON to OFF rather than retaining the Patron chooser or schedule', !sameMain200.contains(previousChooser200) && sameMain200.querySelectorAll('[data-application-track-card]').length===5 && !sameMain200.querySelector('[data-application-track-card="patron"]') && !sameMain200.querySelector('.royal-writs199'));
    for(const malformed200 of[undefined,null,'true','1',1,{},[],false]){
      state.settings.royalWritsOn=malformed200;
      check('.200 original shared panel refuses every schedule location for '+JSON.stringify(malformed200), ['roles','vote','governance','organization','news','community/workshop','army','admin'].every(page=>cache200.panel(page,{checklist:true})===null));
    }
    state.settings.royalWritsOn=true; await cache200.vote(sameMain200);
    check('.200 original same-mounted board cache can explicitly reopen all six cards while the canonical metadata remains unchanged', sameMain200.querySelectorAll('[data-application-track-card]').length===6 && sameMain200.querySelectorAll('[data-writ-key]').length===20 && meta.applicationTracks.length===6 && meta.royalWrits.length===20);
    check('.200 actual Organization route delegates its schedule to the same strict shared gate without changing the imported model', sourcePart200('  ROUTES.organization = async (main, parts) => {','  // ---------------------------------------------------------------- home').includes('writsPanel199("organization")'));
  }
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
    // Follow the renderer's real non-leadership links through the actual app,
    // form submission and Worker; the office remains an intent, never a seat alias.
    const nonleadLinks199 = [['office_07','artisan','member','730000000000001990','Artisan One'],['office_27','artisan','member','730000000000001991','Crafter One'],['office_25','raider','raider','730000000000001992','Raider One']];
    for (const [target,track,canonical,id,name] of nonleadLinks199) {
      const links=rendered199.main.all(node=>node.getAttribute('data-office-application')===target),href=links[0]?.getAttribute('href');
      check('.199 Organization emits the exact eligible '+target+' application link',links.length>0&&links.every(link=>link.getAttribute('href')==='#/vote/'+track+'/'+target)&&href==='#/vote/'+track+'/'+target);
      await siteUser(id,{global_name:name});await character(id,name,'Player-199-'+id.slice(-4));
      const seed={...body,position:canonical,backups:[],character:name,applicationTrack:track,targetOffice:null,board:false,boardApplicationIntent:false,answers:{...body.answers}};delete seed.answers.talentBuilds;
      const seeded=await request('PUT','/api/application',seed,id);if(seeded.response.status!==200)throw Error('nonleadership original form seed refused');
      const linked=await openPage(id),sent=[];linked.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')sent.push(JSON.parse(init.body));return false;});
      await linked.go(href);const form=linked.app.querySelector('form');
      check('.199 actual Organization '+target+' link opens its matching form and exact target badge',!!form&&linked.app.querySelector('#application-track199')?.value===track&&!!linked.app.querySelector('[data-target-office="'+target+'"]')&&linked.app.querySelectorAll('input[name="position"]').find(input=>input.value===canonical)?.checked);
      if(!form){await linked.go('#/');continue;}
      check('.199 '+target+' link grants no public-intent or portrait consent',!linked.app.querySelector('#board-application-intent199').checked&&!linked.app.querySelector('#board-portrait-opt-in').checked&&!linked.app.querySelector('#board-talent-builds-opt-in').checked);
      form.querySelector('[data-field="ack"] input').checked=true;fire(form,'submit');
      const saved=()=>{const row=one('SELECT answers FROM site_applications WHERE discord_id=?',id);return row&&JSON.parse(row.answers);};
      await must(()=>sent.length===1&&saved()?.targetOffice===target&&!linked.app.querySelector('button[type="submit"]').disabled,'terminal actual Organization '+target+' form save');
      check('.199 '+target+' form preserves its exact private intent through the real Worker',sent[0].position===canonical&&sent[0].applicationTrack===track&&sent[0].targetOffice===target&&sent[0].boardApplicationIntent===false&&saved().applicationTrack===track&&saved().targetOffice===target&&saved().boardApplicationIntentOptIn===false);
      const copy=await request('GET','/api/me/export',undefined,id);
      check('.199 signed-in own copy retains the exact Organization '+target+' intent',copy.response.status===200&&copy.body.site.application.answers.applicationTrack===track&&copy.body.site.application.answers.targetOffice===target);
      for(const route of ['#/vote/member/'+target,'#/vote/'+track+'/office_99','#/vote/'+track+'/office_43','#/vote/officer/new']) {
        await linked.go(route);check('.199 exact non-leadership link validation refuses '+route+' without a stale form',!linked.app.querySelector('form')&&!linked.app.querySelector('[data-target-office]')&&linked.app.textContent.includes('Application track unavailable'));
      }
      await linked.go('#/');
    }
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
  // .199 H4 browser finding: settle the old Admin response between the new
  // Organization model read and its module load. No timer chooses this order.
  // These are the exact production handlers/API/DOM helpers. Only dynamic
  // module transport/rendering is a counted stand-in; real model HTTP and the
  // unchanged Organization renderer are exercised independently just above.
  {
    const cut199 = (start, end) => { const a=APP_JS.indexOf(start),b=APP_JS.indexOf(end,a);if(a<0||b<=a)throw Error('owner199_overview_source_boundary');return APP_JS.slice(a,b); };
    const domSource199=cut199('  function h(tag, props, ...kids) {','  // ---------------------------------------------------------------- the game');
    const apiSource199=cut199('  class ApiError extends Error {','  // Optional census previews');
    const overviewSource199=cut199('  async function adminOverview(body) {','  async function drawHeat(box) {');
    const orgOriginal199=cut199('  ROUTES.organization = async (main, parts) => {','  // ---------------------------------------------------------------- home');
    const moduleExpression199='await import("/static/organization-view.js")';
    if(orgOriginal199.split(moduleExpression199).length!==2)throw Error('owner199_organization_module_boundary');
    const orgSource199=orgOriginal199.replace(moduleExpression199,'await loadOrganization199()');
    const deferred199=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
    const realOverview199=await request('GET','/api/admin/overview',undefined,STAFF);
    if(realOverview199.response.status!==200||!realOverview199.body.settings)throw Error('owner199_original_overview_fixture_refused');
    const actualModel199=JSON.parse(fs.readFileSync(path.join(root,'public/static/governance/organization.json'),'utf8'));
    function lifecycle199(status=200){
      const w=makeWindow('{}'),oldMain=w.app.appendChild(new Element('main')),body=oldMain.appendChild(new Element('div'));
      body.textContent='Loading original overview';
      const initialSettings={appointed:{},applicationsOpen:true,notice:'original settings'},state={signedIn:true,denied:false,user:{id:STAFF,isAdmin:true},settings:initialSettings},context={},response=deferred199(),model=deferred199();
      const seen={fetches:[],toasts:0,renders:0,reloads:0,heat:0,module:0,organization:0};let route='admin';
      const plainFrame=title=>{const element=new Element('section');element.textContent=title;return element;};
      const deps={document:w.document,Node,S:state,app:w.app,currentRoute:()=>route,COM:()=>context,ROUTES:{},
        fetch:async(pathname,init)=>{seen.fetches.push({pathname,init});await response.promise;return new Response(JSON.stringify(status===200?{...realOverview199.body,settings:{...realOverview199.body.settings,notice:'late overview'}}:status===409?{error:'reload'}:{error:'signed_out'}),{status,headers:{'Content-Type':'application/json'}});},
        toast:()=>{seen.toasts++;},dirtyKeys:new Set(['original-unsaved']),render:()=>{seen.renders++;},reloadNotice:()=>{seen.reloads++;},
        M:()=>({positions:[],professions:[],ballots:[]}),A:{heat:'',apps:{}},statusText:value=>value,posIcon:()=>null,frame:plainFrame,icon:()=>null,plural:(count,word)=>count+' '+word,seatsStaffText:()=>'',zoneName:()=>'',myZone:'UTC',drawHeat:async()=>{seen.heat++;},
        governanceModel:()=>model.promise.then(()=>actualModel199),loadOrganization199:async()=>{seen.module++;return{renderOrganization:(main,data)=>{seen.organization++;while(main.firstChild)main.removeChild(main.firstChild);const label=new Element('h1');label.textContent='Organization loaded '+data.terms.length+' offices';main.appendChild(label);return()=>{};}};},
        offices199:()=>[],displayHolder:()=>'',writsPanel199:()=>null,officeAssignmentPanel:()=>null,scrollToSection:()=>{}};
      const handlers=new Function(...Object.keys(deps),domSource199+apiSource199+overviewSource199+'\nlet disposeOrganization=null;\n'+orgSource199+'\nreturn {overview:adminOverview,organization:ROUTES.organization};')(...Object.values(deps));
      return{...w,state,initialSettings,oldMain,body,seen,response,model,handlers,dirty:deps.dirtyKeys,route:value=>{route=value;}};
    }
    const race199=lifecycle199(),oldRead199=race199.handlers.overview(race199.body);
    race199.route('organization/office_03');race199.oldMain.remove();
    const organizationMain199=race199.app.appendChild(new Element('main'));organizationMain199.dataset.viewRequest='2';
    const organizationRead199=race199.handlers.organization(organizationMain199,['office_03']);
    check('.199 deterministic race starts Organization while the original admin answer and model are both pending',race199.seen.fetches.length===1&&race199.seen.fetches[0].pathname==='/api/admin/overview'&&organizationMain199.textContent==='Opening the organization…'&&race199.seen.module===0);
    race199.response.resolve();await oldRead199;
    check('.199 detached Admin overview success changes neither global settings nor its stale DOM',race199.state.settings===race199.initialSettings&&race199.body.textContent==='Loading original overview'&&race199.seen.heat===0);
    race199.model.resolve();await organizationRead199;
    check('.199 initial Organization navigation reaches its module and renders after the late old admin response',race199.seen.module===1&&race199.seen.organization===1&&organizationMain199.textContent==='Organization loaded 95 offices'&&!organizationMain199.textContent.includes('Opening the organization'));
    for(const [label,invalidate]of[
      ['same-route detached body',page=>page.oldMain.remove()],
      ['changed route with attached body',page=>page.route('roles')],
      ['changed account',page=>{page.state.user={id:OTHER,isAdmin:true};}],
      ['signed out',page=>{page.state.signedIn=false;}],
      ['denied admission',page=>{page.state.denied=true;}],
      ['lost admin authority',page=>{page.state.user.isAdmin=false;}]
    ]){
      const page=lifecycle199(),pending=page.handlers.overview(page.body);invalidate(page);page.response.resolve();await pending;
      check('.199 old overview refuses settings and DOM adoption after '+label,page.state.settings===page.initialSettings&&page.body.textContent==='Loading original overview'&&page.seen.heat===0);
    }
    const active199=lifecycle199(),activeRead199=active199.handlers.overview(active199.body);active199.response.resolve();await activeRead199;
    check('.199 current admitted admin overview still adopts settings and paints its original report',active199.state.settings!==active199.initialSettings&&active199.state.settings.notice==='late overview'&&active199.seen.heat===1&&!active199.body.textContent.includes('Loading original overview'));
    for(const status of[401,409]){
      const stale=lifecycle199(status),pending=stale.handlers.overview(stale.body).catch(error=>error);stale.oldMain.remove();stale.route('organization/office_03');stale.response.resolve();const error=await pending;
      check('.199 stale overview '+status+' cannot sign out, toast, redraw or show reload UI in the new view',error.status===status&&stale.state.signedIn===true&&stale.state.settings===stale.initialSettings&&stale.seen.toasts===0&&stale.seen.renders===0&&stale.seen.reloads===0&&stale.dirty.size===1);
    }
    const refused199=lifecycle199(401),refusalRead199=refused199.handlers.overview(refused199.body).catch(error=>error);refused199.response.resolve();const currentRefusal199=await refusalRead199;
    check('.199 a current overview 401 retains the original sign-out and unsaved-state safety effects',currentRefusal199.status===401&&!refused199.state.signedIn&&refused199.seen.toasts===1&&refused199.seen.renders===1&&refused199.dirty.size===0);
    const updated199=lifecycle199(409),updateRead199=updated199.handlers.overview(updated199.body).catch(error=>error);updated199.response.resolve();const currentUpdate199=await updateRead199;
    check('.199 a current overview 409 retains the original reload notice without adopting settings',currentUpdate199.status===409&&updated199.seen.reloads===1&&updated199.state.settings===updated199.initialSettings);
  }
  console.log('\n' + ok + '/' + n + ' owner197/199 focused frontend checks passed; actual app/Worker with presentation-only DTO cases identified');
  process.exit(ok === n ? 0 : 1);
}
const execution197 = new Module(__filename, module); execution197.filename = __filename; execution197.paths = Module._nodeModulePaths(__dirname);
execution197._compile(prefix197 + '\n(' + frontendOwner197.toString() + ')().catch(error => { console.error(error.stack); process.exit(1); });', __filename);
