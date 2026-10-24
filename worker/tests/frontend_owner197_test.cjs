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
  console.log('\n' + ok + '/' + n + ' owner197 focused frontend checks passed; actual app/Worker with presentation-only DTO cases identified');
  process.exit(ok === n ? 0 : 1);
}
const execution197 = new Module(__filename, module); execution197.filename = __filename; execution197.paths = Module._nodeModulePaths(__dirname);
execution197._compile(prefix197 + '\n(' + frontendOwner197.toString() + ')().catch(error => { console.error(error.stack); process.exit(1); });', __filename);
