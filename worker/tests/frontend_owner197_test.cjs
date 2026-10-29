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
  const directoryModel203 = page => page.boot.meta.roleDirectory203;
  const familyCards203 = page => page.app.querySelectorAll('details.role-family203');
  const sourceGuides203 = page => page.app.querySelectorAll('[data-role-key201]');
  const sourceVisible203 = node => { for (let current=node;current;current=current.parentNode) if (current.hidden) return false; return !!node; };
  const familyForKey203 = (page,key) => page.app.querySelector('[data-role-family203="'+directoryModel203(page).keyToFamily[key]+'"]');
  // Match the actual rendered family and source witnesses to the original API
  // catalogue, not a retired one-card-per-alias count. All existing keys survive.
  const directoryComplete203 = page => {
    const model=directoryModel203(page), expected=[...page.boot.meta.appointments.map(row=>row.key),'member','raider','pvp_team'].sort();
    if (!model || model.version!==1 || model.sourceKeyCount!==135 || !Array.isArray(model.families) || model.families.length!==65 || !Array.isArray(model.ranks)) return false;
    const families=familyCards203(page), keys=sourceGuides203(page).map(row=>row.getAttribute('data-role-key201')).sort(), covered=model.families.flatMap(family=>family.sourceKeys).sort();
    return expected.length===135 && new Set(expected).size===135 && JSON.stringify(keys)===JSON.stringify(expected) && JSON.stringify(covered)===JSON.stringify(expected)
      && families.length===model.families.length && new Set(families.map(row=>row.getAttribute('data-role-family203'))).size===families.length
      && model.families.every(family=>families.some(row=>row.getAttribute('data-role-family203')===family.key&&row.querySelector('summary .role-entry-name201')?.textContent===family.label)&&family.sourceKeys.every(key=>model.keyToFamily[key]===family.key));
  };
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
  // Current collection editing remains an ordinary Member application; reserved
  // Officer records below are explicit historical fixtures, never current PUTs.
  const body = { position: 'member', backups: [], character: 'Mia One', class: 'warrior', role: 'dps', region: 'eu', avail: 'f'.repeat(42), availTz: 'Europe/Stockholm', fallback: true, board: true, ack: true,
    answers: { experience: 'A fictional original application.', why: 'Help this fictional guild.', leadership: 'Led a fictional raid group.', scenario: 'Listen and follow the agreed loot rules.', hours: '10to20', voice: 'yes', extra: privateSentinel, talentBuilds: collection() } };
  const seeded = await request('PUT', '/api/application', body);
  if (seeded.response.status !== 200) throw Error('real primary collection setup refused: ' + JSON.stringify(seeded.body));
  // .202: browsing the directory inside an editable form changes no answers.
  // Exercise both a new draft and the ordinary record saved by the real Worker.
  for (const [who202, label202] of [[OTHER, 'fresh ordinary form'], [MEMBER, 'saved ordinary application']]) {
    const row202 = () => JSON.stringify(one('SELECT * FROM site_applications WHERE discord_id=?', who202) || null);
    const originalRow202 = row202(), writes202 = [];
    const searchPage202 = await openPage(who202);
    searchPage202.before((url, init) => { if (init.method !== 'GET') writes202.push({url, method:init.method}); return false; });
    await searchPage202.go('#/apply');
    const searchForm202 = searchPage202.app.querySelector('form');
    const search202 = searchForm202.querySelector('#application-role-search201');
    search202.value = 'NA'; fire(search202, 'input'); fire(search202, 'change');
    const enter202 = new Event('keydown', { bubbles: true, key: 'Enter' }); search202.dispatchEvent(enter202);
    check('.202 ' + label202 + ' Search Enter prevents implicit application submission without writing', enter202.defaultPrevented && writes202.length === 0);
    const na202 = searchForm202.querySelector('[data-role-key201="raid_leader_na"]');
    check('.202 ' + label202 + ' directory search filters actual entries without marking an answer dirty',
      !!na202 && sourceVisible203(na202) && familyForKey203(searchPage202,'member').hidden && searchForm202.querySelector('.dirty').hidden);
    const cleanUnload202 = new Event('beforeunload'); searchPage202.window.dispatchEvent(cleanUnload202);
    check('.202 ' + label202 + ' directory search alone leaves the unload guard clear', !cleanUnload202.defaultPrevented);
    await searchPage202.go('#/roles');
    const blockedSearch202 = searchPage202.document.body.querySelector('dialog');
    check('.202 ' + label202 + ' can leave the filtered application without an unsaved-navigation prompt',
      searchPage202.location.hash === '#/roles' && searchPage202.app.querySelector('main').dataset.routeHead === 'roles' && !blockedSearch202);
    // Preserve a complete red-run terminal if the original regression blocks it.
    if (blockedSearch202) { byText(blockedSearch202, 'button', 'Leave anyway').click(); await must(() => searchPage202.app.querySelector('main').dataset.routeHead === 'roles', '.202 original false prompt cleanup'); }
    await searchPage202.go('#/apply');
    const editForm202 = searchPage202.app.querySelector('form'), answer202 = editForm202.querySelector('[data-field="experience"] textarea');
    const draft202 = 'Unsubmitted answer change for ' + label202;
    answer202.value = draft202; fire(answer202, 'input');
    const dirtyUnload202 = new Event('beforeunload'); searchPage202.window.dispatchEvent(dirtyUnload202);
    check('.202 ' + label202 + ' actual answer edits retain both the dirty indicator and unload protection',
      editForm202.querySelector('.dirty').hidden === false && dirtyUnload202.defaultPrevented);
    await searchPage202.go('#/roles');
    const realPrompt202 = searchPage202.document.body.querySelector('dialog');
    check('.202 ' + label202 + ' actual answer edits still require explicit navigation confirmation',
      searchPage202.location.hash === '#/apply' && realPrompt202?.textContent.includes('Leave without saving?') && searchPage202.app.querySelector('form') === editForm202);
    byText(realPrompt202, 'button', 'Cancel').click(); await settle(); await settle();
    check('.202 ' + label202 + ' cancelling navigation preserves the unsaved answer and exact stored record',
      searchPage202.location.hash === '#/apply' && searchPage202.app.querySelector('form') === editForm202 && answer202.value === draft202 && editForm202.querySelector('.dirty').hidden === false && row202() === originalRow202 && writes202.length === 0);
    await searchPage202.go('#/roles');
    byText(searchPage202.document.body.querySelector('dialog'), 'button', 'Leave anyway').click();
    await must(() => searchPage202.app.querySelector('main').dataset.routeHead === 'roles', '.202 answer draft explicit discard');
    searchPage202.window.dispatchEvent(new Event('pagehide'));
  }
  const page = await openPage(MEMBER), sent = [];
  page.before((url, init) => { if (url === '/api/application' && init.method === 'PUT') sent.push(JSON.parse(init.body)); return false; });
  await page.go('#/apply');
  check('stored three-character form restores all six codes while separate sharing stays false', page.app.querySelectorAll('.talent-application-character').length === 3 && page.app.querySelectorAll('.talent-application-character textarea').length === 6 && !page.app.querySelector('#board-talent-builds-opt-in').checked && page.app.querySelector('#board-talent-builds-opt-in').disabled && page.app.querySelectorAll('.talent-application-character textarea').every(input => input.value.startsWith('ot1.' + data.revision + '.')));
  let form = page.app.querySelector('form'), sharing = page.app.querySelector('#board-talent-builds-opt-in');
  sharing.checked = true; fire(sharing, 'change'); form.querySelector('[data-field="ack"] input').checked = true; fire(form, 'submit');
  await must(() => stored()?.boardTalentBuildsOptIn === false && page.app.querySelector('#board-talent-builds-opt-in')?.checked === false && !page.app.querySelector('button[type="submit"]').disabled, 'actual separately consented collection save');
  check('ordinary form sends three named class-bound rows while keeping unavailable board sharing false', sent.length === 1 && sent[0].board === false && sent[0].boardTalentBuilds === false && sent[0].boardPortrait === false && JSON.stringify(sent[0].answers.talentBuilds) === JSON.stringify(collection()) && !Object.hasOwn(sent[0].answers, 'boardTalentBuildsOptIn'));
  const {historicalApplicationFixture201} = require('./historical_application201_fixture.cjs');
  const historical201 = async (id,payload) => {
    const seeded = await historicalApplicationFixture201({validate:load('./site-api').validateApplication,run:fixtureRun,previous:id=>one('SELECT * FROM site_applications WHERE discord_id=?',id),id,payload,time:now});
    if (seeded.validation?.error) throw Error('Historical application setup refused: '+JSON.stringify(seeded.validation));
    return request('GET','/api/me',undefined,id);
  };
  const OLD_BOARD201='730000000000002010'; await siteUser(OLD_BOARD201,{global_name:'Historic Mia'});
  await historical201(OLD_BOARD201,{...body,position:'officer',board:true,boardTalentBuilds:true});
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
  await must(() => page.app.querySelectorAll('.invalid').length === 0 && page.app.querySelector('#board-talent-builds-opt-in')?.checked === false && !page.app.querySelector('button[type="submit"]').disabled, 'original successful application readback clears errors');
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
  const expectedIcons = ['guild_master','co_gm','officer','officer','raid_leader','raider','raider','member','member','member'];
  const compactRanks203=ranks.app.querySelectorAll('.role-ranks203 [data-native-slot]');
  check('.203 all ten compact native rank links retain their intended existing local icons and canonical family destination',compactRanks203.length===10&&compactRanks203.every((link,slot)=>link.tagName==='A'&&link.getAttribute('data-native-slot')===String(slot)&&link.querySelector('img')?.getAttribute('src')==='/static/wow/pos-'+expectedIcons[slot]+'.png'&&link.getAttribute('data-rank-family203')===directoryModel203(ranks).ranks[slot].familyKey&&link.getAttribute('href')==='#/roles/'+encodeURIComponent(ranks.boot.meta.appointments.find(row=>row.group==='native'&&row.nativeSlot===slot).key)&&!link.querySelector('.role-info')));

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
  const details = {click:()=>appointments.window.__roleDialog201('co_gm')};
  check('.201 current reserved directory exposes its guide and no obsolete Officer application Details control',!!appointments.app.querySelector('[data-role-key201="co_gm"]')&&!appointments.app.querySelector('button[aria-label="Details: '+coGmLabel+'"]'));
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
  const reopenDetails = {click:()=>reopenRace.window.__roleDialog201('co_gm')};
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
  await must(() => stored()?.boardTalentBuildsOptIn === false && !optionalReload.app.querySelector('button[type="submit"]').disabled, 'ordinary alt-only sharing remains unavailable');
  await historical201(OLD_BOARD201,{...body,position:'officer',board:true,boardTalentBuilds:true,answers:{...body.answers,talentBuilds:expectedAltOnly}});
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
      check('ordinary historical-alt form cannot enable board sharing and keeps all private attachments unchanged',historyReload.app.querySelector('#board-talent-builds-opt-in').disabled&&!historyReload.app.querySelector('#board-talent-builds-opt-in').checked&&stored().boardTalentBuildsOptIn===false&&JSON.stringify(stored().talentBuilds)===JSON.stringify(expectedHistory));
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
  // .201: the real app renders the whole catalogue as disclosures. The current
  // API refuses reserved seats; historical setup uses the explicit fixture above.
  const APPLICANT199 = '730000000000000199';
  await siteUser(APPLICANT199,{global_name:'Iris'}); await character(APPLICANT199,'Iris Main','Player-1-0199');
  const writsOn200={bootTransform:boot=>{boot.settings.royalWritsOn=true;}};
  const guided199=await openPage(APPLICANT199,{},writsOn200); await guided199.go('#/vote');
  await must(()=>!!guided199.app.querySelector('#application-directory201'),'complete .201 role directory');
  const allRows201=guided199.boot.meta.appointments, keys201=allRows201.map(row=>row.key).sort();
  const entries201=sourceGuides203(guided199),families203=familyCards203(guided199),model203=directoryModel203(guided199);
  check('.203 replaces the dropdowns and duplicate alias cards with exactly one disclosure per canonical family while retaining all132 plus three ordinary source keys',!guided199.app.querySelector('#application-track199')&&!guided199.app.querySelector('#application-office199')&&directoryComplete203(guided199)&&families203.every(row=>!!row.querySelector('summary')));
  check('.203 separates job families, optional activities, standing and institutions into descriptive collapsible groups plus the gated Patron reference',JSON.stringify(guided199.app.querySelectorAll('[data-role-section201]').map(row=>row.getAttribute('data-role-section201')))===JSON.stringify(['members','activities','officers','council','royal','standing','institutions','patron'])&&guided199.app.querySelector('[data-role-section201="members"]').hasAttribute('open')&&!guided199.app.querySelector('[data-role-section201="officers"]').hasAttribute('open')&&!guided199.app.querySelector('[data-role-section201="council"]').hasAttribute('open'));
  check('.203 each canonical family retains local art and substantial duties, expectations and time guidance',families203.every(row=>row.querySelector('summary img')?.getAttribute('src')?.startsWith('/static/wow/')&&fs.existsSync(path.join(root,'public',row.querySelector('summary img').getAttribute('src')))&&(row.querySelector('.rank-office199')||['member','raider','pvp_team'].includes(model203.families.find(family=>family.key===row.getAttribute('data-role-family203')).primaryKey))&&row.querySelector('.role-info')?.textContent.includes('Responsibilities')&&row.querySelector('.role-info')?.textContent.includes('Expectations')&&row.querySelector('.role-info')?.textContent.includes('Time')&&row.querySelectorAll('.role-info li').length>=4));
  check('.203 exactly three ordinary job families offer applications while optional activities, standings and institutions do not become application tracks',JSON.stringify(guided199.app.querySelectorAll('[data-family-apply203]').map(button=>button.getAttribute('data-family-apply203')).sort())===JSON.stringify(['artisan','member','raider'])&&guided199.app.querySelectorAll('.role-variant203').length===70&&new Set(families203.map(card=>card.querySelector('summary .role-entry-name201').textContent)).size===65);
  const reservedRows201=allRows201.filter(row=>row.reservedSeat201);
  check('.203 every reserved source key retains its proper role, standing or institution badge and explicit closed-application policy',reservedRows201.length>70&&reservedRows201.every(row=>{const card=familyForKey203(guided199,row.key),family=model203.families.find(item=>item.key===model203.keyToFamily[row.key]),badge=family.kind==='status'?'Standing or recognition — not an application':family.kind==='institution'?'Governance body — not an application':'Reserved seat — no applications';return card?.querySelector('summary .badge')?.textContent===badge&&!!card.querySelector('[data-role-key201="'+row.key+'"]')&&card.querySelector('.reserved-explanation201')?.textContent.includes('You cannot apply')&&!card.querySelector('[data-apply-role201]')&&!card.querySelector('[data-family-apply203]')&&!card.querySelector('a[href^="#/vote/"]');}));
  const tradingFamily208 = familyForKey203(guided199, 'office_96'), tradingGuide208 = guided199.boot.meta.roleGuides201.office_96;
  check('.208 Vote directory gives Trading its own detailed reserved Council family without a purchase or application action', tradingFamily208?.getAttribute('data-role-family203') === 'head_trading' && tradingFamily208.querySelector('summary .role-entry-name201')?.textContent === 'Head of Trading & Markets' && tradingFamily208.textContent.includes(tradingGuide208.definition) && tradingGuide208.responsibilities.every(text => tradingFamily208.textContent.includes(text)) && tradingFamily208.textContent.includes('You cannot apply') && !tradingFamily208.querySelector('[data-apply-role201]') && !tradingFamily208.querySelector('[data-family-apply203]') && !tradingFamily208.querySelector('a[href^="#/vote/"]'));
  check('.208 Trading keeps its complete limits visible without absorbing the Treasurer, Artisanry or Auditor families', ['office_86', 'office_58', 'office_08'].every(key => familyForKey203(guided199, key) !== tradingFamily208) && tradingFamily208.textContent.includes('Treasurer retains financial custody') && tradingFamily208.textContent.includes('auditor remains independent') && !guided199.app.querySelector('form'));
  for(const [label,keys] of [['Officer',['office_62','officer','rank_officer']],['Raider',['office_75','raider','rank_raider']],['Treasurer',['office_86','treasurer','rank_treasurer']]]){
    const familyKeys=keys.map(key=>model203.keyToFamily[key]);
    check('.203 '+label+' aliases share one canonical job card rather than competing duplicate cards',new Set(familyKeys).size===1&&families203.filter(card=>card.getAttribute('data-role-family203')===familyKeys[0]).length===1&&keys.every(key=>!!guided199.app.querySelector('[data-role-key201="'+key+'"]')));
  }
  for(const [key,region,times] of [['raid_leader_na','North American','7 pm to midnight (4 to 9 pm Pacific)'],['raid_leader_eu','European','7 pm to midnight (6 to 11 pm UK)']]){
    const card=guided199.app.querySelector('[data-role-key201="'+key+'"]');
    check('.203 '+key+' remains a nested regional guide with its full schedule, preparation, calls, loot and conduct mandate',card?.classList.contains('role-variant203')&&familyForKey203(guided199,key).contains(card)&&card.textContent.includes(region)&&card.textContent.includes(times)&&card.textContent.includes('2 to 3 hours of preparation')&&card.textContent.includes('strategy, positions, assignments')&&card.textContent.includes('pulls, wipes, pace and breaks')&&card.textContent.includes('Loot Council')&&card.textContent.includes('No flaming after a wipe')&&!card.querySelector('button'));
  }
  const classKeys203=['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid'].map(key=>'class_lead:'+key);
  check('.203 all nine class leads retain distinct nested duties and expectations under one class leadership family',new Set(classKeys203.map(key=>model203.keyToFamily[key])).size===1&&classKeys203.every(key=>{const card=guided199.app.querySelector('[data-role-key201="'+key+'"]'),guide=guided199.boot.meta.roleGuides201[key];return card?.classList.contains('role-variant203')&&card.textContent.includes(guide.definition)&&guide.responsibilities.every(text=>card.textContent.includes(text))&&guide.expectations.every(text=>card.textContent.includes(text))&&!card.querySelector('[data-apply-role201]');}));
  const search201=guided199.app.querySelector('#application-role-search201'); search201.value='Mage Class Lead'; fire(search201,'input');
  check('.203 class alias search reveals its nested full guide without deleting catalogue coverage or opening an application',directoryComplete203(guided199)&&sourceVisible203(guided199.app.querySelector('[data-role-key201="class_lead:mage"]'))&&familyForKey203(guided199,'class_lead:mage').querySelector('.role-search-match203').textContent.includes('Mage Class Lead')&&families203.filter(row=>!row.hidden).every(row=>/mage/i.test(row.textContent))&&!guided199.app.querySelector('form'));
  search201.value='';fire(search201,'input');
  for(const route of ['#/vote/officer/office_62','#/vote/high_council/office_67','#/vote/high_council/office_96','#/vote/officer/class_lead%3Amage','#/vote/officer/office_74','#/vote/high_council/office_62','#/vote/officer/new']){
    await guided199.go(route);
    check('.201 reserved deep link '+route+' provides a clear reference and no stale editable form',guided199.app.textContent.includes('Reserved seat — no applications')&&!guided199.app.querySelector('form')&&!guided199.app.querySelector('button[type="submit"]')&&directoryComplete203(guided199));
  }
  await guided199.go('#/vote/not-a-track/office_62');
  check('.201 unknown track still fails closed without mounting a previous application',!guided199.app.querySelector('form')&&guided199.app.textContent.includes('Application track unavailable'));
  for(const key201 of ['officer','co_gm','treasurer','raid_leader_na','raid_leader_eu','class_lead:mage','office_67','office_96']){
    module.cachedPick201=key201;const remembered201=await openPage(APPLICANT199);module.cachedPick201=null;
    check('.201 real startup remembered pick '+key201+' cannot mount a reserved application or write a row',remembered201.location.hash==='#/apply'&&remembered201.app.textContent.includes('Reserved seat')&&!remembered201.app.querySelector('form')&&!one('SELECT 1 FROM site_applications WHERE discord_id=?',APPLICANT199));await remembered201.go('#/');
  }
  const membership199=await openPage(APPLICANT199,{},writsOn200);await membership199.go('#/apply');
  check('.201 ordinary fresh application uses Member without any reserved first or backup option',membership199.app.querySelectorAll('input[name="position"]').some(input=>input.value==='member'&&input.checked)&&membership199.app.querySelectorAll('input[name="position"]').every(input=>input.value==='member'||input.value==='raider'||input.value==='pvp_team')&&membership199.app.querySelectorAll('[data-field="backups"] option').every(option=>['','raider','pvp_team'].includes(option.value)));
  for(const [track,canonical] of [['raider','raider'],['artisan','member'],['patron','member']]){
    await membership199.go('#/vote/'+track+'/new');
    check('.201 ordinary '+track+' route retains its honest canonical position and fresh private consent',!!membership199.app.querySelector('form')&&membership199.app.querySelectorAll('input[name="position"]').some(input=>input.value===canonical&&input.checked)&&!membership199.app.querySelector('#board-application-intent199')?.checked&&!membership199.app.querySelector('#board-portrait-opt-in')?.checked&&!membership199.app.querySelector('#board-talent-builds-opt-in')?.checked);
  }
  const seed199={...body,position:'class_lead',classLead:'mage',character:'Iris Main',class:'mage',backups:['raid_leader_na'],applicationTrack:'officer',targetOffice:'class_lead:mage',board:true,boardApplicationIntent:false,answers:{...body.answers,extra:'Private .199 office applicant sentinel'}};delete seed199.answers.talentBuilds;
  await historical201(APPLICANT199,seed199);
  const exact199=await openPage(APPLICANT199),exactSends199=[];
  exact199.before((url,init)=>{if(url==='/api/application')exactSends199.push(init.method||'GET');return false;});await exact199.go('#/apply');
  check('.201 historical reserved application keeps its full private summary and Withdraw but no editor or implicit conversion',exact199.app.textContent.includes(seed199.answers.extra)&&exact199.app.textContent.includes('Reserved')&&!!byText(exact199.app,'button','Withdraw my application')&&!exact199.app.querySelector('form')&&exactSends199.length===0&&one('SELECT position FROM site_applications WHERE discord_id=?',APPLICANT199).position==='class_lead');
  const privateIntentBoard199=await openPage(OTHER);await privateIntentBoard199.go('#/vote/class_lead%3Amage');
  await must(()=>privateIntentBoard199.app.querySelectorAll('.cand').some(candidate=>candidate.textContent.includes('Iris')),'historical class board read');
  let irisCard199=privateIntentBoard199.app.querySelectorAll('.cand').find(candidate=>candidate.textContent.includes('Iris'));
  check('.201 historical board retains answers without unconsented office badges or private extras',!!irisCard199&&!irisCard199.querySelector('.application-intent199')&&!irisCard199.textContent.includes(seed199.answers.extra));
  await historical201(APPLICANT199,{...seed199,boardApplicationIntent:true});
  const sharedIntentBoard199=await openPage(OTHER);await sharedIntentBoard199.go('#/vote/class_lead%3Amage');
  await must(()=>!!sharedIntentBoard199.app.querySelector('.cand [data-target-office="class_lead:mage"]'),'historical explicitly consented office badge');
  irisCard199=sharedIntentBoard199.app.querySelectorAll('.cand').find(candidate=>candidate.textContent.includes('Iris'));
  check('.201 consented historical exact-office badges remain canonical and do not imply new application availability',irisCard199.querySelector('.application-intent199')?.getAttribute('data-application-track')==='officer'&&!irisCard199.querySelector('.talent-build-links')&&!irisCard199.textContent.includes(seed199.answers.extra));
  const oldAnswers201=one('SELECT answers FROM site_applications WHERE discord_id=?',APPLICANT199).answers;
  exact199.app.querySelector('[data-apply-role201="member"]').click();
  await must(()=>!!exact199.app.querySelector('form'),'explicit ordinary replacement form');
  check('.201 explicit Member choice removes reserved backups locally without saving or rewriting history',exactSends199.length===0&&one('SELECT answers FROM site_applications WHERE discord_id=?',APPLICANT199).answers===oldAnswers201&&exact199.app.querySelectorAll('[data-field="backups"] select').every(select=>!select.value)&&!exact199.app.querySelector('#board-application-intent199')?.checked);
  await exact199.go('#/');
  for(const state201 of ['submitted','reviewing']){
    await fixtureRun('UPDATE site_applications SET status=? WHERE discord_id=?',state201,APPLICANT199);
    const withdraw201=await openPage(APPLICANT199),methods201=[];withdraw201.before((url,init)=>{if(url==='/api/application')methods201.push(init.method||'GET');return false;});await withdraw201.go('#/apply');byText(withdraw201.app,'button','Withdraw my application').click();
    await must(()=>withdraw201.document.querySelectorAll('dialog').some(dialog=>dialog.open),'reserved '+state201+' withdrawal confirmation');const dialog201=withdraw201.document.querySelectorAll('dialog').find(dialog=>dialog.open);
    check('.201 reserved '+state201+' history requires confirmation before its original withdrawal route',methods201.length===0&&one('SELECT status FROM site_applications WHERE discord_id=?',APPLICANT199).status===state201);
    byText(dialog201,'button','Withdraw').click();await must(()=>one('SELECT status FROM site_applications WHERE discord_id=?',APPLICANT199).status==='withdrawn','reserved '+state201+' original DELETE acknowledgement');
    check('.201 reserved '+state201+' UI withdrawal sends only DELETE and preserves the exact old answers',JSON.stringify(methods201)===JSON.stringify(['DELETE'])&&one('SELECT answers FROM site_applications WHERE discord_id=?',APPLICANT199).answers===oldAnswers201);await withdraw201.go('#/');
  }
  const roles199=await openPage(APPLICANT199,{},writsOn200);await roles199.go('#/roles/rosetta-stone');
  const exactNames199=['Leader','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'];
  const nativeCards199=roles199.app.querySelectorAll('.role-ranks203 [data-native-slot]');
  check('.203 role guide fronts exactly ten compact links with the exact native rank names and owner-confirmed slots',nativeCards199.length===10&&nativeCards199.every((card,index)=>card.tagName==='A'&&card.getAttribute('data-native-slot')===String(index)&&card.querySelector('.role-rank-number203').textContent===String(index+1)&&card.textContent.endsWith(exactNames199[index])&&card.getAttribute('data-rank-family203')===directoryModel203(roles199).ranks[index].familyKey&&card.getAttribute('href')==='#/roles/'+encodeURIComponent(roles199.boot.meta.appointments.find(row=>row.group==='native'&&row.nativeSlot===index).key)&&!card.querySelector('.role-info')));
  const table199=roles199.app.querySelector('.rosetta-table199'),headings199=['In-Game Rank Number & Name','Tier & Statutory Codex Title','Organization Department & Branch Offices','Discord Role & Portal Access','How to Attain It'];
  const rows199=table199.querySelectorAll('[data-rank-crosswalk]');
  check('.199 Rosetta Stone has five named columns and ten complete individually labelled rank rows',JSON.stringify(table199.querySelectorAll('th').map(th=>th.textContent))===JSON.stringify(headings199)&&rows199.length===10&&rows199.every((row,index)=>row.getAttribute('data-rank-crosswalk')===String(index+1)&&row.querySelectorAll('td').length===5&&row.querySelectorAll('td').every((td,column)=>td.getAttribute('data-column')===headings199[column])));
  const bridgeKeys199=rows199.flatMap(row=>row.querySelectorAll('li a').map(link=>decodeURIComponent(link.getAttribute('href').slice('#/organization/'.length))));
  check('.199 Rosetta Stone enumerates all132 assignable keys exactly once across their ten rank rows',bridgeKeys199.length===132&&new Set(bridgeKeys199).size===132&&JSON.stringify(bridgeKeys199.slice().sort())===JSON.stringify(keys201));
  const roleCards201=roles199.app.querySelectorAll('[data-role-key201]');
  check('.203 Roles keeps all96 stable office references and every original source key in canonical families, with no reserved application CTA',directoryComplete203(roles199)&&roleCards201.filter(card=>/^office_[0-9]{2}$/.test(card.getAttribute('data-role-key201'))).length===96&&reservedRows201.every(row=>!familyForKey203(roles199,row.key).querySelector('[data-apply-role201]')));
  for(const appointedKey199 of ['member','office_07','office_27']){
    const artisanCards199=await openPage(APPLICANT199,{}, {bootTransform:boot=>{boot.settings.appointed={[appointedKey199]:'Recorded synthetic holder'};}});await artisanCards199.go('#/roles');
    const targets199=['office_07','office_27'].map(key=>({key,card:artisanCards199.app.querySelector('[data-role-key201="'+key+'"]')}));
    check('.201 Roles keeps '+appointedKey199+' separate from unrelated artisan aliases',targets199.every(({key,card})=>!!card&&(key===appointedKey199?!!card.querySelector('[data-appointment-label="'+key+'"]'):!card.querySelector('[data-appointment-label]'))));await artisanCards199.go('#/');
  }
  const historical199=roles199.app.querySelector('.technical-profile199');
  check('.201 historical profile guidance remains a closed technical accordion beside the full directory',!!historical199&&!historical199.open&&historical199.querySelector('summary').textContent==='Technical & Historical Profile Notes'&&roles199.app.textContent.includes('Co-Guild Master and Treasurer are appointments, not extra native ranks'));
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
    ['roles', page => !!page.app.querySelector('.role-ranks203')],
    ['vote', page => !!page.app.querySelector('#application-directory201')],
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
      if (route === 'vote') check('.200 ' + label + ' setting keeps all six historical metadata tracks but offers only the canonical families retaining all135 source keys without a Patron offer', paused.boot.meta.applicationTracks.length === 6 && paused.boot.meta.applicationTracks.some(track => track.id === 'patron') && directoryComplete203(paused) && !paused.app.querySelector('[data-role-section201="patron"]') && !paused.app.querySelector('#application-track199'));
      if (route === 'roles') check('.200 ' + label + ' setting also hides the legacy price offer while preserving the exact ten ranks and historical profile notes', !paused.app.textContent.includes('Tithe Payer 25g+') && !!paused.app.querySelector('.technical-profile199') && paused.app.querySelectorAll('[data-native-slot]').length === 10 && paused.boot.settings.royalWritsOn!==true&&!paused.app.querySelector('[data-role-section201="patron"]'));
      if (route === 'governance') check('.200 ' + label + ' governance keeps the constitutional reader and current source download with a visible paused-reference notice', !!paused.app.querySelector('.governance-reader') && paused.app.querySelector('a[href="/static/governance/reconciled-book.md"]') && paused.app.querySelector('.writs-paused200')?.textContent.includes('not an offer of an available service'));
      if (route === 'admin/treasury') check('.200 ' + label + ' Treasury retains receipt/status tools without offering the old price tiers or Stockades service', !!paused.app.querySelector('#treasury-operation') && !!paused.app.querySelector('#treasury-reference') && paused.app.textContent.includes('Existing receipt and operation records remain available') && !paused.app.textContent.includes('Tithe Payer 25g+'));
      await paused.go('#/');
    }
  }
  const defaultBoot200 = await openPage(APPLICANT199);
  check('.200 actual Worker boot defaults the display switch OFF without removing the canonical writ/track catalogues', defaultBoot200.boot.settings.royalWritsOn === false && defaultBoot200.boot.meta.royalWrits.length === 20 && defaultBoot200.boot.meta.applicationTracks.length === 6);
  await defaultBoot200.go('#/vote/patron/new');
  await must(()=>defaultBoot200.app.textContent.includes('Patron applications are paused'),'.200 direct Patron pause terminal view');
  check('.201 a direct paused Patron URL shows an explicit hold and the full directory, never a savable Member substitute',defaultBoot200.app.textContent.includes('Patron applications are paused')&&!defaultBoot200.app.querySelector('form')&&!defaultBoot200.app.querySelector('button[type="submit"]')&&directoryComplete203(defaultBoot200)&&!defaultBoot200.app.querySelector('[data-role-section201="patron"]'));

  // Explicit local settings fixture: use distinct original-key holders so the
  // existing real Save Settings request must preserve the populated map exactly.
  const beforeAdmin203=await request('GET','/api/admin/overview',undefined,STAFF);
  if(beforeAdmin203.response.status!==200)throw Error('.203 original Admin settings fixture read refused');
  const populatedAppointed203={...beforeAdmin203.body.settings.appointed,co_gm:'Synthetic Co-GM 203',office_03:'Synthetic Architect 203',rank_treasurer:'Synthetic Treasurer history 203'};
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES('appointed',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",JSON.stringify(populatedAppointed203),now,STAFF);
  const sortedAppointed203=value=>JSON.stringify(Object.keys(value).sort().map(key=>[key,value[key]]));
  const switchPage200 = await openPage(STAFF), switchSends200 = [];
  switchPage200.before((url, init) => { if (url === '/api/admin/settings' && init.method === 'PUT') switchSends200.push(JSON.parse(init.body)); return false; });
  await switchPage200.go('#/admin/settings'); await must(() => !!switchPage200.app.querySelector('#royal-writs-on'), '.200 original admin switch');
  const switchBox200 = switchPage200.app.querySelector('#royal-writs-on');
  const appointmentFields203=switchPage200.app.querySelectorAll('[data-appointment-field203]'),expectedAppointmentKeys203=switchPage200.boot.meta.appointments.map(row=>row.key).sort();
  check('.203 Admin family grouping retains all132 distinct original appointment fields and their populated exact-key values',appointmentFields203.length===132&&new Set(appointmentFields203.map(row=>row.getAttribute('data-appointment-field203'))).size===132&&JSON.stringify(appointmentFields203.map(row=>row.getAttribute('data-appointment-field203')).sort())===JSON.stringify(expectedAppointmentKeys203)&&Object.entries(populatedAppointed203).every(([key,value])=>switchPage200.app.querySelector('[data-appointment-field203="'+key+'"] input')?.value===value));
  check('.200 Admin renders an unchecked explicit switch with preservation and separate provider-OFF disclosure', switchBox200.getAttribute('type') === 'checkbox' && !switchBox200.checked && switchBox200.closest('label').textContent.includes('Existing applications, receipts and constitutional reference text are preserved') && switchBox200.closest('label').textContent.includes('does not enable payments, Discord role dispatch, Olympus Link'));
  switchBox200.checked = true; byText(switchPage200.app, 'button', 'Save settings').click();
  await must(() => switchSends200.length === 1 && one("SELECT value FROM site_settings WHERE key='royalWritsOn'")?.value === '1' && !byText(switchPage200.app, 'button', 'Save settings').disabled, '.200 original enabled-setting save');
  const enabledRead200 = await request('GET', '/api/admin/overview', undefined, STAFF);
  check('.200 actual Admin enable sends a boolean and adopts a genuine readable enabled setting without provider activation fields', switchSends200[0].royalWritsOn === true && typeof switchSends200[0].royalWritsOn === 'boolean' && enabledRead200.response.status === 200 && enabledRead200.body.settings.royalWritsOn === true && !Object.keys(switchSends200[0]).some(key => /TREASURY_COSMETIC|ARMY_SITE_AGGREGATE|LINK_DB|webhook/i.test(key)));
  check('.203 the existing real settings save preserves every populated original holder key without family migration',sortedAppointed203(switchSends200[0].appointed)===sortedAppointed203(populatedAppointed203)&&sortedAppointed203(enabledRead200.body.settings.appointed)===sortedAppointed203(populatedAppointed203));
  await switchPage200.go('#/vote');
  check('.200 admitted Admin readback enables the schedule and optional Patron disclosure in the same page state', directoryComplete203(switchPage200) && !!switchPage200.app.querySelector('[data-role-section201="patron"]') && switchPage200.app.querySelectorAll('[data-writ-key]').length === 20);

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
  check('.200 same page after Admin ON to OFF removes the Patron disclosure and schedule', scheduleAbsent200(switchPage200) && directoryComplete203(switchPage200) && !switchPage200.app.querySelector('[data-role-section201="patron"]') && !switchPage200.app.querySelector('#application-track199'));
  const retained200 = await openPage(PATRON200), retainedRequests200 = [];
  retained200.before((url, init) => { if (url === '/api/application') retainedRequests200.push(init.method || 'GET'); return false; });
  await retained200.go('#/apply');
  check('.200 an existing Patron application remains visibly labelled with its original private history and the full role directory while paused, without an edit form or silent write', retained200.app.textContent.includes('Patron applications are paused') && !!retained200.app.querySelector('[data-application-track="patron"]') && retained200.app.textContent.includes('Private retained Patron fixture .200') && directoryComplete203(retained200) && !retained200.app.querySelector('form') && retainedRequests200.length === 0 && JSON.stringify(one('SELECT answers,position,status FROM site_applications WHERE discord_id=?', PATRON200)) === JSON.stringify(patronBefore200));
  const patronCopy200 = await request('GET', '/api/me/export', undefined, PATRON200);
  check('.200 paused Patron history remains in the real own-copy with its canonical track and unchanged application content', patronCopy200.response.status === 200 && patronCopy200.body.site.application.answers.applicationTrack === 'patron' && patronCopy200.body.site.application.answers.extra === 'Private retained Patron fixture .200' && one('SELECT answers FROM site_applications WHERE discord_id=?', PATRON200).answers === patronBefore200.answers);
  retained200.app.querySelector('[data-apply-role201="member"]').click();
  await must(()=>!!retained200.app.querySelector('form'),'.201 explicit alternative Member form');
  check('.201 explicitly opening the alternative Member form performs no silent save and preserves private content and fresh unchecked consents',retained200.location.hash==='#/vote/member/new'&&retainedRequests200.length===0&&one('SELECT answers FROM site_applications WHERE discord_id=?',PATRON200).answers===patronBefore200.answers&&retained200.app.querySelector('[data-field="extra"] textarea')?.value==='Private retained Patron fixture .200'&&!retained200.app.querySelector('#board-application-intent199').checked&&!retained200.app.querySelector('#board-portrait-opt-in').checked&&!retained200.app.querySelector('#board-talent-builds-opt-in').checked);
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
    const productionPicker200=sourcePart200('  // Owner decision, 26 Oct 2026: browse the whole directory; leadership seats are reserved.','  // The boot carries the RESOLVED');
    const productionBoardPrefix200=sourcePart200('  const V = { role:','    // The Worker already caches these counts');
    const w=makeWindow('{}'),state={settings:{royalWritsOn:true,votingOpen:true,appointed:{},noVote:[]}},meta={...defaultBoot200.boot.meta};
    const deps={document:w.document,Node,Event,S:state,M:()=>meta,tracks199:()=>meta.applicationTracks,offices199:()=>meta.appointments,office199:key=>meta.appointments.find(row=>row.key===key),track199:id=>meta.applicationTracks.find(row=>row.id===id),displayHolder:()=>'',appointedTo:()=>'',communityReader:()=>false,positionOf:key=>meta.positions.find(row=>row.key===key),posIcon:()=>null,officeBadge199:()=>null,roleInfo:()=>null,appointmentLabelNode:()=>null,ROUTES:{},location:w.location,dec:value=>value};
    const cache200=new Function(...Object.keys(deps),productionDom200+'\n'+originalLine200('  const art = ')+'\n'+originalLine200('  const icon = ')+'\n'+originalLine200('  const frame = ')+'\n'+originalLine200('  const noticeBox = ')+'\n'+productionGate200+productionWrits200+productionPicker200+productionBoardPrefix200+'\nboardShells.set(main,{settingsKey}); }; return {vote:main=>ROUTES.vote(main,[]),panel:writsPanel199};')(...Object.values(deps));
    const sameMain200=w.app.appendChild(new Element('main')); await cache200.vote(sameMain200);
    const previousChooser200=sameMain200.querySelector('#application-directory201');
    check('.200 original board cache prefix initially mounts the canonical families, enabled Patron reference and schedule', !!previousChooser200 && directoryComplete203({app:sameMain200,boot:{meta}})&&!!sameMain200.querySelector('[data-role-section201="patron"]') && sameMain200.querySelectorAll('[data-writ-key]').length===20);
    state.settings.royalWritsOn=false; await cache200.vote(sameMain200);
    check('.200 original same-mounted board cache invalidates on ON to OFF rather than retaining the Patron chooser or schedule', !sameMain200.contains(previousChooser200) && directoryComplete203({app:sameMain200,boot:{meta}}) && !sameMain200.querySelector('[data-role-section201="patron"]') && !sameMain200.querySelector('.royal-writs199'));
    for(const malformed200 of[undefined,null,'true','1',1,{},[],false]){
      state.settings.royalWritsOn=malformed200;
      check('.200 original shared panel refuses every schedule location for '+JSON.stringify(malformed200), ['roles','vote','governance','organization','news','community/workshop','army','admin'].every(page=>cache200.panel(page,{checklist:true})===null));
    }
    state.settings.royalWritsOn=true; await cache200.vote(sameMain200);
    check('.200 original same-mounted board cache can explicitly reopen the Patron reference beside canonical families while metadata remains unchanged', directoryComplete203({app:sameMain200,boot:{meta}})&&!!sameMain200.querySelector('[data-role-section201="patron"]') && sameMain200.querySelectorAll('[data-writ-key]').length===20 && meta.applicationTracks.length===6 && meta.royalWrits.length===20);
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
    check('.199 regression uses the actual expanded Organization body above128KiB within its finite512KiB model cap',modelBytes199.length===357931&&modelBytes199.length>131072&&modelBytes199.length<=524288&&actualLoaderSource199.includes('publicGovernanceBytes(GOVERNANCE_MODEL, 524288)')&&actualLoaderSource199.includes('publicGovernanceBytes(GOVERNANCE_BOOK, 262144)'));
    const currentClient199=loadClient199(),model199=await currentClient199.read();
    check('.199 actual authenticated Worker HTTP and current app loader accept every357931 source byte with96 terms and exact book pins',currentClient199.reads.length===1&&currentClient199.reads[0].status===200&&currentClient199.reads[0].bytes===modelBytes199.length&&currentClient199.reads[0].credentials==='same-origin'&&currentClient199.reads[0].redirect==='error'&&JSON.stringify(model199)===JSON.stringify(JSON.parse(modelBytes199))&&model199.terms.length===96&&model199.appointments.length===132);
    // Reuse the existing Organization DOM fixture definitions, not its test body.
    // Only that fixture's data binding is supplied from the real loader above.
    // Keep this original focused relationship-map witness explicit; the wide
    // overview and its actual context module have their own qualified leaf.
    const rendererFixturePath199=path.join(root,'tests/organization_view_test.cjs'),rendererFixtureSource199=fs.readFileSync(rendererFixturePath199,'utf8'),rendererCut199=rendererFixtureSource199.indexOf('const p = open();');
    const rendererPrefix199=rendererFixtureSource199.slice(0,rendererCut199);
    if(rendererCut199<0||require('node:crypto').createHash('sha256').update(rendererPrefix199).digest('hex')!=='78635b63279c9a26bf5746274f5ee0d774b6fa649836239a21bde9c35288fafd')throw Error('owner199_original_organization_fixture_prefix_drift');
    const dataBinding199='const data = JSON.parse(fs.readFileSync(path.join(root, "public/static/governance/organization.json"), "utf8"));';
    if(rendererPrefix199.split(dataBinding199).length!==2)throw Error('owner199_original_organization_fixture_data_boundary');
    const FixtureModule199=require('node:module').Module,rendererExecution199=new FixtureModule199(rendererFixturePath199,module);rendererExecution199.filename=rendererFixturePath199;rendererExecution199.paths=FixtureModule199._nodeModulePaths(path.dirname(rendererFixturePath199));
    rendererExecution199.loadedModel199=model199;
    rendererExecution199._compile(rendererPrefix199.replace(dataBinding199,'const data = module.loadedModel199;')+'\nmodule.exports = open;',rendererFixturePath199);
    const rendered199=rendererExecution199.exports({overview205:false});
    check('.199 the actual focused Organization renderer paints the model returned by the real app HTTP loader',!rendered199.one('org-alliance')&&rendered199.one('org-relationship-map205').open&&rendered199.main.all(node=>node.classList.contains('organization-term')).length===96&&rendered199.main.all(node=>!!node.getAttribute('data-office-key')).length===96&&rendered199.main.all(node=>!!node.getAttribute('data-native-rank')).length===10&&rendered199.main.textContent.includes('Technical & Historical Profile Notes'));
    // Follow the canonical Artisan link through the real app and Worker. The
    // former Crafter/Core Raider URLs below remain explicit historical intent
    // compatibility, not additional publicly offered jobs or canonical aliases.
    const publicChoices203=rendered199.main.all(node=>!!node.getAttribute('data-office-application'));
    check('.203 Organization offers only the three canonical ordinary choices from its shared family contract',publicChoices203.length===3&&JSON.stringify(publicChoices203.map(node=>node.getAttribute('href')).sort())===JSON.stringify(['#/vote/artisan/office_07','#/vote/member/new','#/vote/raider/new']));
    const nonleadLinks199 = [['office_07','artisan','member','730000000000001990','Artisan One'],['office_27','artisan','member','730000000000001991','Crafter One'],['office_25','raider','raider','730000000000001992','Raider One']];
    for (const [target,track,canonical,id,name] of nonleadLinks199) {
      const links=rendered199.main.all(node=>node.getAttribute('data-office-application')===target),legacyHref203='#/vote/'+track+'/'+target;
      const href=target==='office_07'?links[0]?.getAttribute('href'):legacyHref203;
      check(target==='office_07'?'.203 Organization emits the exact canonical Artisan application link':'.203 former '+target+' URL is not offered as a separate public job but remains an explicit historical URL',target==='office_07'?links.length>0&&links.every(link=>link.getAttribute('href')===legacyHref203)&&href===legacyHref203:links.length===0&&!publicChoices203.some(link=>link.getAttribute('href')===legacyHref203));
      await siteUser(id,{global_name:name});await character(id,name,'Player-199-'+id.slice(-4));
      const seed={...body,position:canonical,backups:[],character:name,applicationTrack:track,targetOffice:null,board:false,boardApplicationIntent:false,answers:{...body.answers}};delete seed.answers.talentBuilds;
      const seeded=await request('PUT','/api/application',seed,id);if(seeded.response.status!==200)throw Error('nonleadership original form seed refused');
      const linked=await openPage(id),sent=[];linked.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')sent.push(JSON.parse(init.body));return false;});
      await linked.go(href);const form=linked.app.querySelector('form');
      check((target==='office_07'?'.203 actual canonical Organization link':'.203 explicit historical '+target+' URL')+' opens its matching form and exact target badge',!!form&&!!linked.app.querySelector('#application-directory201')&&!!linked.app.querySelector('[data-target-office="'+target+'"]')&&linked.app.querySelectorAll('input[name="position"]').find(input=>input.value===canonical)?.checked);
      if(!form){await linked.go('#/');continue;}
      check('.199 '+target+' link grants no public-intent or portrait consent',!linked.app.querySelector('#board-application-intent199').checked&&!linked.app.querySelector('#board-portrait-opt-in').checked&&!linked.app.querySelector('#board-talent-builds-opt-in').checked);
      form.querySelector('[data-field="ack"] input').checked=true;fire(form,'submit');
      const saved=()=>{const row=one('SELECT answers FROM site_applications WHERE discord_id=?',id);return row&&JSON.parse(row.answers);};
      await must(()=>sent.length===1&&saved()?.targetOffice===target&&!linked.app.querySelector('button[type="submit"]').disabled,'terminal actual Organization '+target+' form save');
      check('.199 '+target+' form preserves its exact private intent through the real Worker',sent[0].position===canonical&&sent[0].applicationTrack===track&&sent[0].targetOffice===target&&sent[0].boardApplicationIntent===false&&saved().applicationTrack===track&&saved().targetOffice===target&&saved().boardApplicationIntentOptIn===false);
      const copy=await request('GET','/api/me/export',undefined,id);
      check('.199 signed-in own copy retains the exact Organization '+target+' intent',copy.response.status===200&&copy.body.site.application.answers.applicationTrack===track&&copy.body.site.application.answers.targetOffice===target);
      if(target==='office_27'){
        const priorCrafter203=JSON.stringify(one('SELECT * FROM site_applications WHERE discord_id=?',id));
        await linked.go('#/');await linked.go('#/apply');
        const oldGuide203=linked.app.querySelector('[data-role-key201="office_27"]');
        check('.203 an existing Crafter intent reopens its original nested guide and target without canonicalizing history or writing',oldGuide203?.open===true&&familyForKey203(linked,'office_27').open===true&&linked.app.querySelector('#application-directory201').getAttribute('data-initial-role203')==='office_27'&&!!linked.app.querySelector('[data-target-office="office_27"]')&&saved().targetOffice==='office_27'&&sent.length===1&&JSON.stringify(one('SELECT * FROM site_applications WHERE discord_id=?',id))===priorCrafter203);
        const artisanChoice203=linked.app.querySelector('[data-family-apply203="artisan"]');
        artisanChoice203.click();await must(()=>!!linked.app.querySelector('form')&&!!linked.app.querySelector('[data-target-office="office_07"]'),'.203 explicit canonical Artisan local choice');
        check('.203 only an explicit new Artisan choice changes local intent while the stored Crafter record and consents stay untouched',linked.location.hash==='#/vote/artisan/office_07'&&saved().targetOffice==='office_27'&&sent.length===1&&JSON.stringify(one('SELECT * FROM site_applications WHERE discord_id=?',id))===priorCrafter203&&!linked.app.querySelector('#board-application-intent199').checked&&!linked.app.querySelector('#board-portrait-opt-in').checked&&!linked.app.querySelector('#board-talent-builds-opt-in').checked);
      }
      for(const route of ['#/vote/member/'+target,'#/vote/'+track+'/office_99','#/vote/'+track+'/office_43','#/vote/officer/new']) {
        await linked.go(route);check('.199 exact non-leadership link validation refuses '+route+' without a stale form',!linked.app.querySelector('form')&&!linked.app.querySelector('[data-target-office]')&&(linked.app.textContent.includes('Application track unavailable')||linked.app.textContent.includes('Reserved seat — no applications')));
      }
      await linked.go('#/');
    }
    rendered199.dispose();
    const padded199=size=>Buffer.concat([modelBytes199,Buffer.alloc(size-modelBytes199.length,0x20)]);
    const exactLimit199=loadClient199();exactLimit199.override(padded199(524288));
    const atLimit199=await exactLimit199.read();
    check('.199 exactly524288 valid JSON bytes retain all shape checks at the model boundary',exactLimit199.reads[0].bytes===524288&&atLimit199.terms.length===96&&atLimit199.book.sha256===model199.book.sha256);
    const oversized199=loadClient199();oversized199.override(padded199(524289));let oversizedError199=null;
    try{await oversized199.read();}catch(error){oversizedError199=error;}
    check('.199 actual524289-byte HTTP body fails closed before otherwise-valid model JSON can render',oversized199.reads.length===1&&oversized199.reads[0].status===200&&oversized199.reads[0].bytes===524289&&oversizedError199?.message==='The public governance file has an unexpected size.');
    oversized199.override(null);const recovered199=await oversized199.read();
    check('.199 a failed oversized read is not cached and an explicit later read loads only the genuine current body',oversized199.reads.length===2&&oversized199.reads[1].bytes===modelBytes199.length&&recovered199.terms.length===96);
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
  // focused Organization renderer are exercised independently just above. The
  // real wide-overview/context modules remain in organization_view_test's leaf.
  {
    const cut199 = (start, end) => { const a=APP_JS.indexOf(start),b=APP_JS.indexOf(end,a);if(a<0||b<=a)throw Error('owner199_overview_source_boundary');return APP_JS.slice(a,b); };
    const domSource199=cut199('  function h(tag, props, ...kids) {','  // ---------------------------------------------------------------- the game');
    const apiSource199=cut199('  class ApiError extends Error {','  // Optional census previews');
    const overviewSource199=cut199('  async function adminOverview(body) {','  async function drawHeat(box) {');
    const orgOriginal199=cut199('  ROUTES.organization = async (main, parts) => {','  // ---------------------------------------------------------------- home');
    const moduleExpression199='await import("/static/organization-view.js")';
    const overviewModuleExpression205='await import("/static/organization-overview205.js")';
    if(orgOriginal199.split(moduleExpression199).length!==2||orgOriginal199.split(overviewModuleExpression205).length!==2)throw Error('owner199_organization_module_boundary');
    const orgSource199=orgOriginal199.replace(moduleExpression199,'await loadOrganization199()').replace(overviewModuleExpression205,'await loadAllianceOverview205()');
    const deferred199=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
    const realOverview199=await request('GET','/api/admin/overview',undefined,STAFF);
    if(realOverview199.response.status!==200||!realOverview199.body.settings)throw Error('owner199_original_overview_fixture_refused');
    const actualModel199=JSON.parse(fs.readFileSync(path.join(root,'public/static/governance/organization.json'),'utf8'));
    const roleDirectory205=directoryModel203(page),roleGuides205=page.boot.meta.roleGuides201,guideKeys205=roleDirectory205.families.flatMap(family=>family.sourceKeys);
    function lifecycle199(status=200){
      const w=makeWindow('{}'),oldMain=w.app.appendChild(new Element('main')),body=oldMain.appendChild(new Element('div'));
      body.textContent='Loading original overview';
      const initialSettings={appointed:{},applicationsOpen:true,notice:'original settings'},state={signedIn:true,denied:false,user:{id:STAFF,isAdmin:true},settings:initialSettings},context={},response=deferred199(),model=deferred199();
      const seen={fetches:[],toasts:0,renders:0,reloads:0,heat:0,module:0,overviewModule:0,overviewBinding:false,guideBinding:false,organization:0};let route='admin';
      const plainFrame=title=>{const element=new Element('section');element.textContent=title;return element;};
      const renderAllianceOverview205=()=>{throw Error('owner205_race_fixture_must_not_render_overview');};
      const deps={document:w.document,Node,S:state,app:w.app,currentRoute:()=>route,COM:()=>context,ROUTES:{},
        fetch:async(pathname,init)=>{seen.fetches.push({pathname,init});await response.promise;return new Response(JSON.stringify(status===200?{...realOverview199.body,settings:{...realOverview199.body.settings,notice:'late overview'}}:status===409?{error:'reload'}:{error:'signed_out'}),{status,headers:{'Content-Type':'application/json'}});},
        toast:()=>{seen.toasts++;},dirtyKeys:new Set(['original-unsaved']),render:()=>{seen.renders++;},reloadNotice:()=>{seen.reloads++;},
        M:()=>({positions:[],professions:[],ballots:[],roleDirectory203:roleDirectory205,roleGuides201:roleGuides205}),A:{heat:'',apps:{}},statusText:value=>value,posIcon:()=>null,frame:plainFrame,icon:()=>null,plural:(count,word)=>count+' '+word,seatsStaffText:()=>'',zoneName:()=>'',myZone:'UTC',drawHeat:async()=>{seen.heat++;},
        governanceModel:()=>model.promise.then(()=>actualModel199),loadOrganization199:async()=>{seen.module++;return{renderOrganization:(main,data,ui)=>{seen.organization++;seen.overviewBinding=ui.allianceOverview205===renderAllianceOverview205;seen.guideBinding=ui.roleDirectory203===roleDirectory205&&ui.roleGuides201===roleGuides205;while(main.firstChild)main.removeChild(main.firstChild);const label=new Element('h1');label.textContent='Organization loaded '+data.terms.length+' offices';main.appendChild(label);return()=>{};}};},
        loadAllianceOverview205:async()=>{seen.overviewModule++;return{renderAllianceOverview205};},
        offices199:()=>[],office199:()=>null,reservedKey201:()=>false,guideBody201:()=>null,positionOf:()=>null,displayHolder:()=>'',writsPanel199:()=>null,officeAssignmentPanel:()=>null,scrollToSection:()=>{}};
      const handlers=new Function(...Object.keys(deps),domSource199+apiSource199+overviewSource199+'\nlet disposeOrganization=null;\n'+orgSource199+'\nreturn {overview:adminOverview,organization:ROUTES.organization};')(...Object.values(deps));
      return{...w,state,initialSettings,oldMain,body,seen,response,model,handlers,dirty:deps.dirtyKeys,route:value=>{route=value;}};
    }
    const race199=lifecycle199(),oldRead199=race199.handlers.overview(race199.body);
    race199.route('organization/office_03');race199.oldMain.remove();
    const organizationMain199=race199.app.appendChild(new Element('main'));organizationMain199.dataset.viewRequest='2';
    const organizationRead199=race199.handlers.organization(organizationMain199,['office_03']);
    check('.199 deterministic race starts Organization while the original admin answer and model are both pending',race199.seen.fetches.length===1&&race199.seen.fetches[0].pathname==='/api/admin/overview'&&organizationMain199.textContent==='Opening the organization…'&&race199.seen.module===0&&race199.seen.overviewModule===0);
    race199.response.resolve();await oldRead199;
    check('.199 detached Admin overview success changes neither global settings nor its stale DOM',race199.state.settings===race199.initialSettings&&race199.body.textContent==='Loading original overview'&&race199.seen.heat===0);
    race199.model.resolve();await organizationRead199;
    check('.199 initial Organization navigation reaches its module and renders after the late old admin response',race199.seen.module===1&&race199.seen.organization===1&&organizationMain199.textContent==='Organization loaded 96 offices'&&!organizationMain199.textContent.includes('Opening the organization'));
    check('.205 the actual Organization route loads its overview once and passes the same renderer and canonical guide references',race199.seen.overviewModule===1&&race199.seen.overviewBinding&&race199.seen.guideBinding&&roleDirectory205.families.length===65&&guideKeys205.length===135&&new Set(guideKeys205).size===135&&guideKeys205.every(key=>!!roleGuides205[key]));
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
  // .210: remove-only privacy remains usable when an application is readonly.
  // Every save below runs the original Worker before any held/dropped answer.
  const privacyFields210 = [['boardPortrait','boardPortraitOptIn','Discord profile picture'],['boardTalentBuilds','boardTalentBuildsOptIn','declared characters'],['boardApplicationIntent','boardApplicationIntentOptIn','application track']];
  const privacyFailure210 = 'Privacy changes could not be confirmed. Reload your application and check its sharing settings before trying again.';
  for (const [key,value] of [['appointed','{}'],['noVote','[]'],['applicationsOpen','0'],['royalWritsOn','0']]) await fixtureRun('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)ON CONFLICT(key)DO UPDATE SET value=excluded.value',key,value,now);
  const PRIVACY_READER210='740000000000210000'; await siteUser(PRIVACY_READER210,{global_name:'Privacy reader'}); await character(PRIVACY_READER210,'Privacy Reader','Player-210-1000');
  let privacyOrdinal210=0;
  const privacyRow210=id=>one('SELECT * FROM site_applications WHERE discord_id=?',id);
  const privacyAnswers210=id=>JSON.parse(privacyRow210(id).answers);
  const privacyInvariant210=row=>{const clean={...row,answers:{...JSON.parse(row.answers)}};delete clean.updated_at;for(const [,key]of privacyFields210)delete clean.answers[key];return JSON.stringify(clean);};
  const privacySeed210=async(kind='reserved',shared=true)=>{
    const id=String(740000000000210000n+BigInt(++privacyOrdinal210)); await siteUser(id,{global_name:'Privacy owner '+privacyOrdinal210});
    const payload={...body,position:kind==='patron'||kind==='ordinary'?'member':'officer',backups:[],board:true,boardPortrait:shared,boardTalentBuilds:shared,boardApplicationIntent:shared,applicationTrack:kind==='patron'?'patron':kind==='ordinary'?'member':'officer',targetOffice:kind==='patron'||kind==='ordinary'?null:'office_62',answers:{...body.answers,talentBuilds:collection(),extra:'Private210 sentinel '+id}};
    const setup=await historical201(id,payload);if(setup.response.status!==200)throw Error('privacy210 historical own read refused');
    // A stored Patron consent row is a schema-valid compatibility fixture, not a
    // claim that today's non-voted Patron parser can create public board flags.
    if(kind==='patron'&&shared){const answers=privacyAnswers210(id);for(const [,key]of privacyFields210)answers[key]=true;await fixtureRun('UPDATE site_applications SET answers=? WHERE discord_id=?',JSON.stringify(answers),id);}
    if(kind==='accepted'||kind==='declined')await fixtureRun('UPDATE site_applications SET status=? WHERE discord_id=?',kind,id);
    return id;
  };
  const privacyControls210=page=>{const panel=page.app.querySelector('.board-privacy210');return{panel,save:panel&&byText(panel,'button','Apply privacy changes'),inputs:panel?panel.querySelectorAll('input[type="checkbox"]'):[]};};
  const privacySelect210=(panel,index)=>{const label=panel.querySelectorAll('label').find(label=>label.textContent.includes(privacyFields210[index][2]));const input=label&&label.querySelector('input');if(!input)throw Error('privacy210 actual checkbox missing');input.checked=true;fire(input,'change');return input;};
  const privacyPage210=async id=>{const page=await openPage(id),sends=[];page.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT')sends.push(JSON.parse(init.body));return false;});await page.go('#/apply');return{page,sends,...privacyControls210(page)};};
  const privacyBoard210=async id=>{const out=await request('GET','/api/board/officer',undefined,PRIVACY_READER210);if(out.response.status!==200)throw Error('privacy210 actual board read refused');return out.body.candidates.find(candidate=>candidate.id===id);};
  const privacyInitial210=await privacySeed210(),privacyInitialRow210=privacyRow210(privacyInitial210),privacyPublic210=await privacyBoard210(privacyInitial210);
  check('.210 historical reserved fixture has all three actual public board projections before UI withdrawal',!!privacyPublic210?.avatarUrl&&privacyPublic210.talentBuilds?.length===6&&privacyPublic210.applicationIntent?.applicationTrack==='officer'&&privacyPublic210.applicationIntent?.targetOffice==='office_62');
  const partial210=await privacyPage210(privacyInitial210);
  check('.210 readonly reserved application exposes three unchecked remove-only choices and a disabled Apply action',!!partial210.panel&&partial210.inputs.length===3&&partial210.inputs.every(input=>!input.checked)&&partial210.save?.disabled===true&&!partial210.page.app.querySelector('form'));
  if(partial210.panel){
    const hold210={};hold210.promise=new Promise(resolve=>{hold210.resolve=resolve;});partial210.page.hold((url,init)=>url==='/api/application'&&init.method==='PUT'?hold210.promise:0);
    privacySelect210(partial210.panel,0);partial210.save.focus();partial210.save.click();
    await must(()=>privacyAnswers210(privacyInitial210).boardPortraitOptIn===false,'privacy210 actual held consent commit');
    partial210.save.click();partial210.save.click();await settle();
    check('.210 pending withdrawal retains Apply focus, disables choices semantically and rejects duplicate raw clicks',partial210.sends.length===1&&partial210.save.getAttribute('aria-disabled')==='true'&&partial210.inputs.every(input=>input.disabled)&&partial210.page.document.activeElement===partial210.save&&partial210.save.textContent==='Saving privacy changes…');
    check('.210 actual partial consent PUT contains only strict false removal and no application edits',JSON.stringify(partial210.sends[0])===JSON.stringify({consentOnly:true,boardPortrait:false}));
    hold210.resolve();await must(()=>partial210.page.app.querySelector('.board-privacy210 input')&&!partial210.page.app.querySelector('.board-privacy210').textContent.includes('Discord profile picture'),'privacy210 partial withdrawal receipt');
    const partialBoard210=await privacyBoard210(privacyInitial210);
    check('.210 portrait removal withholds only that actual public projection and preserves all private application fields',partialBoard210?.avatarUrl===null&&partialBoard210.talentBuilds?.length===6&&partialBoard210.applicationIntent?.targetOffice==='office_62'&&privacyInvariant210(privacyRow210(privacyInitial210))===privacyInvariant210(privacyInitialRow210));
    const remaining210=privacyControls210(partial210.page);remaining210.inputs.forEach(input=>{input.checked=true;fire(input,'change');});remaining210.save.click();await must(()=>!partial210.page.app.querySelector('.board-privacy210'),'privacy210 all remaining flags removed');
    const hidden210=await privacyBoard210(privacyInitial210);
    check('.210 all remaining removals use a second explicit false-only action and clear actual board builds/intent without withdrawing',partial210.sends.length===2&&JSON.stringify(partial210.sends[1])===JSON.stringify({consentOnly:true,boardTalentBuilds:false,boardApplicationIntent:false})&&hidden210?.avatarUrl===null&&hidden210.talentBuilds?.length===0&&hidden210.applicationIntent===null&&privacyRow210(privacyInitial210).status==='submitted'&&privacyRow210(privacyInitial210).board_at===privacyInitialRow210.board_at&&privacyInvariant210(privacyRow210(privacyInitial210))===privacyInvariant210(privacyInitialRow210));
  }else console.log('INFO .210 pre-UI baseline: action/pending checks skipped because the actual privacy panel is absent');
  for(const kind of ['accepted','declined','patron']){
    const id=await privacySeed210(kind),before=privacyRow210(id),view=await privacyPage210(id);
    check('.210 '+kind+' readonly application exposes independent removal without a full application form',!!view.panel&&view.inputs.length===3&&!view.page.app.querySelector('form'));
    if(!view.panel)continue;
    view.inputs.forEach(input=>{input.checked=true;fire(input,'change');});view.save.click();await must(()=>privacyFields210.every(([,key])=>privacyAnswers210(id)[key]===false)&&!view.page.app.querySelector('.board-privacy210'),'privacy210 '+kind+' withdrawal');
    check('.210 '+kind+' removal is an actual consent-only PUT preserving status, board timestamp and complete private answers',view.sends.length===1&&Object.keys(view.sends[0]).sort().join('|')==='boardApplicationIntent|boardPortrait|boardTalentBuilds|consentOnly'&&privacyFields210.every(([field])=>view.sends[0][field]===false)&&view.sends[0].consentOnly===true&&privacyInvariant210(privacyRow210(id))===privacyInvariant210(before));
  }
  const noShared210=await privacyPage210(await privacySeed210('reserved',false));
  check('.210 readonly private application has no removal control and performs no consent PUT',!noShared210.panel&&noShared210.sends.length===0);
  const ordinaryPrivacy210=await privacyPage210(await privacySeed210('ordinary',false));
  check('.210 ordinary editable Member application retains its full form without the readonly consent action',!!ordinaryPrivacy210.page.app.querySelector('form')&&!ordinaryPrivacy210.panel&&ordinaryPrivacy210.sends.length===0);
  for(const mode of ['before-send','lost-answer','wrong-receipt']){
    const id=await privacySeed210(),view=await privacyPage210(id),before=privacyRow210(id);
    check('.210 '+mode+' failure case starts at the actual readonly privacy action',!!view.panel);
    if(!view.panel)continue;
    if(mode==='before-send')view.page.before((url,init)=>{if(url==='/api/application'&&init.method==='PUT'){view.sends.push(JSON.parse(init.body));return true;}return false;});
    if(mode==='lost-answer')view.page.drop((url,init)=>url==='/api/application'&&init.method==='PUT');
    if(mode==='wrong-receipt')view.page.answer((url,init)=>url==='/api/application'&&init.method==='PUT'?{ok:true,application:view.page.boot.application}:null);
    privacySelect210(view.panel,0);view.save.click();await must(()=>view.panel.textContent.includes(privacyFailure210),'privacy210 fixed '+mode+' failure copy');
    check('.210 '+mode+' reports unconfirmed privacy outcome without success or automatic retry',view.sends.length===1&&view.panel.textContent.includes(privacyFailure210)&&!view.page.document.body.textContent.includes('Voting-board privacy changes saved.')&&privacyInvariant210(privacyRow210(id))===privacyInvariant210(before)&&(mode==='before-send'?privacyAnswers210(id).boardPortraitOptIn===true:privacyAnswers210(id).boardPortraitOptIn===false));
  }
  for(const outcome of ['success','lost-answer','401','409-reload']){
    const id=await privacySeed210(),view=await privacyPage210(id);
    check('.210 detached '+outcome+' case starts at the original removal panel',!!view.panel);
    if(!view.panel)continue;
    const held={};held.promise=new Promise(resolve=>{held.resolve=resolve;});view.page.hold((url,init)=>url==='/api/application'&&init.method==='PUT'?held.promise:0);
    if(outcome==='lost-answer')view.page.answer((url,init)=>url==='/api/application'&&init.method==='PUT'?new Response('unreadable',{status:500}):null);
    if(outcome==='401'||outcome==='409-reload')view.page.answer((url,init)=>url==='/api/application'&&init.method==='PUT'?new Response(JSON.stringify({error:outcome==='401'?'signed_out':'reload'}),{status:outcome==='401'?401:409,headers:{'Content-Type':'application/json'}}):null);
    privacySelect210(view.panel,0);view.save.click();await must(()=>privacyAnswers210(id).boardPortraitOptIn===false,'privacy210 detached actual commit');
    await view.page.go('#/guide/member');const nextMain=view.page.app.querySelector('main');held.resolve();await settle();await settle();
    check('.210 late detached '+outcome+' changes no current view, toast or route and sends no replacement',view.sends.length===1&&view.page.location.hash==='#/guide/member'&&view.page.app.querySelector('main')===nextMain&&!view.page.document.body.textContent.includes('Voting-board privacy changes saved.')&&!view.page.document.body.textContent.includes(privacyFailure210)&&!view.page.document.body.textContent.includes('You were signed out.')&&!view.page.document.querySelector('.reload-bar'));
  }
  const identityPrivacyId210=await privacySeed210(),identityPrivacy210=await privacyPage210(identityPrivacyId210);
  check('.210 owner-change case starts at the original removal panel',!!identityPrivacy210.panel);
  if(identityPrivacy210.panel){
    const held={};held.promise=new Promise(resolve=>{held.resolve=resolve;});identityPrivacy210.page.hold((url,init)=>url==='/api/application'&&init.method==='PUT'?held.promise:0);
    privacySelect210(identityPrivacy210.panel,0);identityPrivacy210.save.click();await must(()=>privacyAnswers210(identityPrivacyId210).boardPortraitOptIn===false,'privacy210 owner-change actual commit');
    const logout=byText(identityPrivacy210.page.app,'button','Sign out');if(!logout)throw Error('privacy210 actual sign-out control missing');logout.click();await must(()=>identityPrivacy210.page.location.navigated==='/','privacy210 actual sign-out navigation');
    const revoked=await request('GET','/api/me',undefined,identityPrivacyId210);
    // The minimal DOM records location.href rather than destroying its document.
    // Detach that old app as real navigation does, then load another real session.
    identityPrivacy210.page.app.remove();const nextIdentity210=await openPage(PRIVACY_READER210);await nextIdentity210.go('#/guide/member');
    const nextIdentityMain210=nextIdentity210.app.querySelector('main');held.resolve();await settle();await settle();
    check('.210 completed old-owner withdrawal cannot redraw or toast across actual logout and a new identity document',revoked.response.status===401&&nextIdentity210.app.querySelector('main')===nextIdentityMain210&&nextIdentity210.boot.user.id===PRIVACY_READER210&&!nextIdentity210.document.body.textContent.includes('Voting-board privacy changes saved.')&&!identityPrivacy210.page.document.body.textContent.includes('Voting-board privacy changes saved.')&&identityPrivacy210.sends.length===1);
  }
  console.log('\n' + ok + '/' + n + ' owner197/199 focused frontend checks passed; actual app/Worker with presentation-only DTO cases identified');
  process.exit(ok === n ? 0 : 1);
}
const execution197 = new Module(__filename, module); execution197.filename = __filename; execution197.paths = Module._nodeModulePaths(__dirname);
// The former leadership-radio Details entrance is retired. Expose only the
// unchanged production dialog function in this local VM so its existing identity
// reader lifecycle tests remain exercised. No handler, admission or request is replaced.
const runLine201 = 'vm.runInNewContext(APP_JS, sandbox, { filename: "app.js" });';
if(prefix197.split(runLine201).length!==2)throw Error('owner201_actual_app_execution_boundary');
const pageWindow201='  const w = makeWindow(JSON.stringify(boot));';
if(prefix197.split(pageWindow201).length!==2)throw Error('owner201_original_window_boundary');
const rememberedPrefix201=prefix197.replace(pageWindow201,pageWindow201+'\n  if(module.cachedPick201)w.sessionStorage.setItem("olympus.pick",module.cachedPick201);');
const exposedPrefix201=rememberedPrefix201.replace(runLine201, 'vm.runInNewContext(APP_JS.replace("  render();\\n})();", "  window.__roleDialog201 = key => roleDialog(positionOf(key));\\n  render();\\n})();"), sandbox, { filename: "app.js" });');
// Deterministic post-Worker hold: the exact original Worker handles the request
// first, then this test-only response seam can await a manually released promise.
const holdSeam210='{ const ms2 = sandbox.__hold ? sandbox.__hold(pathname, init) : 0; if (ms2) await new Promise((res) => setTimeout(res, ms2)); }';
if(exposedPrefix201.split(holdSeam210).length!==2)throw Error('privacy210_original_post_worker_hold_boundary');
const deferredPrefix210=exposedPrefix201.replace(holdSeam210,'{ const hold210 = sandbox.__hold ? sandbox.__hold(pathname, init) : 0; if (hold210 && typeof hold210.then === "function") await hold210; else if (hold210) await new Promise(res => setTimeout(res, hold210)); }');
execution197._compile(deferredPrefix210 + '\n(' + frontendOwner197.toString() + ')().catch(error => { console.error(error.stack); process.exit(1); });', __filename);
