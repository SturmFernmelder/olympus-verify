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
  check('these UI reads and explicit application saves create no board vote or alt verification', !one('SELECT 1 FROM site_board_votes') && !one('SELECT 1 FROM characters WHERE name IN (?,?)', 'Mia Two', 'Mia Three'));
  console.log('\n' + ok + '/' + n + ' owner197 focused frontend checks passed; actual app/Worker with presentation-only DTO cases identified');
  process.exit(ok === n ? 0 : 1);
}
const execution197 = new Module(__filename, module); execution197.filename = __filename; execution197.paths = Module._nodeModulePaths(__dirname);
execution197._compile(prefix197 + '\n(' + frontendOwner197.toString() + ')().catch(error => { console.error(error.stack); process.exit(1); });', __filename);
