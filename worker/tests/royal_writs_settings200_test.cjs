// .200: real Worker/admin API, original OAuth sessions and installed Native SQLite fixture.
// Only Discord HTTP is synthetic; no provider, production setting or deployment is used.
const fs200 = require('node:fs'), path200 = require('node:path'), { Module } = require('node:module');
const fixture200 = path200.join(__dirname, 'site_test.cjs'), text200 = fs200.readFileSync(fixture200, 'utf8');
const boundary200 = /^\(async \(\) => \{\r?\n  console\.log\("== \.213: the original site JSON limit applies during consumption =="\);/gm;
const cuts200 = [...text200.matchAll(boundary200)];
if (cuts200.length !== 1) throw Error('one original site fixture boundary required');
const prefix200 = text200.slice(0, cuts200[0].index);
const body200 = String.raw`
(async () => {
  const installedSchema200 = JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all());
  const member200 = '300000000000000001';
  const otherMember200 = '300000000000000003';
  const setting200 = () => db.prepare("SELECT value,updated_by FROM site_settings WHERE key='royalWritsOn'").get();
  const audits200 = () => db.prepare("SELECT actor,details FROM audit WHERE action='site.settings' ORDER BY id").all();
  const snapshot200 = () => JSON.stringify({ row: setting200() ?? null, audit: audits200(), notice: db.prepare("SELECT value FROM site_settings WHERE key='notice'").get() ?? null });
  for (const value of [undefined, '0', 'true', 'false', 'TRUE', ' 1 ', 'on', '2', '', '{}']) {
    const settings200 = data.settingsFrom(rawEnv(), value === undefined ? [] : [{ key: 'royalWritsOn', value }]);
    check('missing or malformed stored ' + JSON.stringify(value) + ' keeps Royal Writs strictly OFF', settings200.royalWritsOn === false && typeof settings200.royalWritsOn === 'boolean');
  }
  check('only exact stored1 enables Royal Writs', data.settingsFrom(rawEnv(), [{ key: 'royalWritsOn', value: '1' }]).royalWritsOn === true);
  const adminLogin200 = await signIn(VIKTOR), memberLogin200 = await signIn(member200), otherLogin200 = await signIn(otherMember200);
  if (adminLogin200.status !== 303 || memberLogin200.status !== 303 || otherLogin200.status !== 303 || !jar.get(VIKTOR) || !jar.get(member200) || !jar.get(otherMember200)) throw Error('original OAuth fixture did not issue the three sessions');
  const beforeSettings200 = JSON.stringify(db.prepare('SELECT key,value FROM site_settings ORDER BY key').all());
  const originalApplicationsSwitch200 = db.prepare("SELECT value FROM site_settings WHERE key='applicationsOpen'").get();
  const providerAfterLogin200 = D.calls.length;
  let res200 = await call('GET', '/api/admin/overview', { who: VIKTOR }), result200 = await J(res200);
  check('actual admin overview defaults Royal Writs OFF without writing a row', res200.status === 200 && result200.settings.royalWritsOn === false && !setting200());
  const unchanged200 = snapshot200();
  for (const [label, options, status] of [
    ['signed out', {}, 401], ['ordinary member', { who: member200 }, 403],
    ['foreign origin', { who: VIKTOR, origin: 'https://other.example' }, 403],
    ['missing page header', { who: VIKTOR, headers: { 'X-Olympus': null } }, 403],
    ['malformed page header', { who: VIKTOR, headers: { 'X-Olympus': 'invalid' } }, 403],
  ]) {
    res200 = await call('PUT', '/api/admin/settings', { ...options, body: { royalWritsOn: true } });
    check(label + ' cannot enable Royal Writs or append an audit', res200.status === status && snapshot200() === unchanged200, res200.status);
  }
  for (const value of [null, 0, 1, 'true', 'false', '1', '0', {}, []]) {
    res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: value, notice: 'must not be partially saved' } }); result200 = await J(res200);
    check('nonboolean ' + JSON.stringify(value) + ' is rejected before every submitted setting/audit', res200.status === 400 && result200.error === 'invalid' && result200.field === 'royalWritsOn' && snapshot200() === unchanged200);
  }
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: true } }); result200 = await J(res200);
  check('admin true persists exact1 with boolean response and original actor audit', res200.status === 200 && result200.settings.royalWritsOn === true && setting200().value === '1' && setting200().updated_by === VIKTOR && audits200().at(-1).actor === VIKTOR && JSON.parse(audits200().at(-1).details).royalWritsOn === '1');
  for (const route of ['/api/public', '/api/me']) {
    res200 = await call('GET', route, { who: member200 }); result200 = await J(res200);
    check('enabled setting reaches existing member DTO ' + route, res200.status === 200 && result200.settings.royalWritsOn === true);
  }
  let page200 = await bootOf(await call('GET', '/', { who: member200 }));
  check('existing signed-in boot exposes strict enabled setting', page200.boot?.settings.royalWritsOn === true);
  const enabled200 = snapshot200();
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: {} }); result200 = await J(res200);
  check('old client omission preserves enabled state without a fake audit', res200.status === 200 && result200.settings.royalWritsOn === true && snapshot200() === enabled200);
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: false, appointed: { treasurer: 'Private Writ Fixture' } } }); result200 = await J(res200);
  check('new visibility bit does not bypass typed-name publication consent or partially apply', res200.status === 400 && result200.error === 'confirm_names' && snapshot200() === enabled200);
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: false } }); result200 = await J(res200);
  check('admin false persists exact0 and audited boolean readback', res200.status === 200 && result200.settings.royalWritsOn === false && setting200().value === '0' && JSON.parse(audits200().at(-1).details).royalWritsOn === '0');
  let raced200 = false;
  const offAudit200 = JSON.stringify(audits200());
  PREPARE_HOOK = async sql => {
    if (!raced200 && /INSERT INTO site_settings/.test(sql)) {
      raced200 = true;
      await fixtureRun("UPDATE site_settings SET value='1' WHERE key='royalWritsOn'");
    }
  };
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: false, notice: 'stale save must not apply' } }); result200 = await J(res200);
  PREPARE_HOOK = null;
  check('concurrent visibility change uses existing all-key stale guard with no partial notice/audit', raced200 && res200.status === 409 && result200.error === 'stale_settings' && setting200().value === '1' && !db.prepare("SELECT value FROM site_settings WHERE key='notice'").get() && JSON.stringify(audits200()) === offAudit200, res200.status, result200.error);
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: false } });
  check('fresh save after the observed conflict can explicitly turn the schedule OFF', res200.status === 200 && setting200().value === '0');
  page200 = await bootOf(await call('GET', '/', { who: member200 }));
  check('next normal signed-in boot returns OFF without an extra field-specific request', page200.boot?.settings.royalWritsOn === false);
  const application200 = () => db.prepare('SELECT * FROM site_applications WHERE discord_id=?').get(member200);
  const applicationBody200 = {
    position: 'member', backups: [], class: 'warrior', role: 'dps', region: 'eu', character: 'Royal Tester',
    avail: 'f'.repeat(42), availTz: 'Europe/Stockholm', fallback: true, board: false, ack: true,
    answers: { experience: 'A synthetic application experience.', why: 'Help the synthetic guild community.', leadership: 'Led a fictional raid group.', scenario: 'Listen and follow the agreed rules.', hours: '10to20', voice: 'yes' },
  };
  const directPatron200 = { ...applicationBody200, applicationTrack: 'patron', targetOffice: null };
  const nestedPatron200 = { ...applicationBody200, answers: { ...applicationBody200.answers, applicationTrack: 'patron', targetOffice: null } };
  for (const [label, payload] of [['top-level', directPatron200], ['answers JSON', nestedPatron200]]) {
    res200 = await call('PUT', '/api/application', { who: member200, body: payload }); result200 = await J(res200);
    check(label + ' Patron request fails closed while OFF without creating an application', res200.status === 403 && result200.error === 'royal_writs_paused' && result200.field === 'applicationTrack' && !application200());
  }
  await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: true } });
  res200 = await call('PUT', '/api/application', { who: member200, body: { ...directPatron200, ack: false } }); result200 = await J(res200);
  check('enabled Patron path still applies ordinary application validation', res200.status === 400 && result200.field === 'ack' && !application200());
  res200 = await call('PUT', '/api/application', { who: member200, body: nestedPatron200 }); result200 = await J(res200);
  check('enabled canonical nested Patron intent is saved through the ordinary application path', res200.status === 200 && JSON.parse(application200()?.answers || '{}').applicationTrack === 'patron' && JSON.parse(application200()?.answers || '{}').targetOffice === null, res200.status, result200);
  await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: false } });
  const preservedPatron200 = JSON.stringify(application200());
  for (const [label, payload] of [['top-level', directPatron200], ['answers JSON', nestedPatron200], ['legacy editor omitting intent', applicationBody200]]) {
    res200 = await call('PUT', '/api/application', { who: member200, body: payload }); result200 = await J(res200);
    check(label + ' cannot change or silently strip an existing Patron intent while OFF', res200.status === 403 && result200.error === 'royal_writs_paused' && JSON.stringify(application200()) === preservedPatron200);
  }
  res200 = await call('GET', '/api/me', { who: member200 }); result200 = await J(res200);
  check('paused existing Patron remains visible in the ordinary owned application DTO', res200.status === 200 && result200.application?.answers.applicationTrack === 'patron');
  res200 = await call('GET', '/api/me/export', { who: member200 }); result200 = await J(res200);
  check('pause preserves the existing Patron intent in Native owned copy', res200.status === 200 && result200.site?.application.answers.applicationTrack === 'patron' && JSON.stringify(application200()) === preservedPatron200);
  for (const [track, position, targetOffice, board] of [['member', 'member', null, false], ['raider', 'raider', null, false], ['artisan', 'member', null, false], ['officer', 'officer', 'office_62', true], ['high_council', 'office_03', 'office_03', true]]) {
    const beforeTrack200 = JSON.stringify(db.prepare('SELECT * FROM site_applications WHERE discord_id=?').get(otherMember200));
    res200 = await call('PUT', '/api/application', { who: otherMember200, body: { ...applicationBody200, character: 'Other Tester', applicationTrack: track, position, targetOffice, board } }); result200 = await J(res200);
    if (['officer', 'high_council'].includes(track)) {
      check(track + ' is a reserved appointment independently of the Royal Writs switch', res200.status === 403 && result200.error === 'reserved_seat' && JSON.stringify(db.prepare('SELECT * FROM site_applications WHERE discord_id=?').get(otherMember200)) === beforeTrack200 && setting200().value === '0', res200.status, result200);
    } else {
      check(track + ' remains available while Royal Writs and Patron are OFF', res200.status === 200 && result200.application?.answers.applicationTrack === track && setting200().value === '0', res200.status, result200);
    }
  }
  // The owner's Master QA (28 Oct 2026): settings must still admit the exact
  // application at its write, after any asynchronous reference-label lookup.
  for (const [switchKey200, track200, refusal200] of [
    ['royalWritsOn', 'patron', 'royal_writs_paused'],
    ['applicationsOpen', 'member', 'closed'],
  ]) for (const existing200 of [false, true]) {
    T += 61;
    await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { applicationsOpen: true, royalWritsOn: true } });
    await fixtureRun('DELETE FROM site_applications WHERE discord_id=?', member200);
    const racePayload200 = { ...applicationBody200, applicationTrack: track200, targetOffice: null,
      answers: { ...applicationBody200.answers, references: [{ kind: 'discord', key: otherMember200, label: 'Original synthetic reference' }] } };
    if (existing200) {
      const setup200 = await call('PUT', '/api/application', { who: member200, body: racePayload200 });
      if (setup200.status !== 200) throw Error('original application race setup failed: ' + setup200.status);
    }
    const beforeApplication200 = JSON.stringify(application200() ?? null);
    const applicationAudits200 = () => JSON.stringify(db.prepare("SELECT id,action,details FROM audit WHERE action IN ('site.application_submitted','site.application_updated') ORDER BY id").all());
    const beforeApplicationAudit200 = applicationAudits200();
    let interleaved200 = false, adminSwitchStatus200 = null, observedSwitch200 = null;
    PREPARE_HOOK = async sql => {
      if (!interleaved200 && /^SELECT discord_id, username, global_name, nick FROM site_users WHERE discord_id IN/.test(sql)) {
        interleaved200 = true;
        // The original currentEntry Native port awaits this hook before BEGIN,
        // so the real Admin request commits before the member batch resumes.
        const changed200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { [switchKey200]: false } });
        adminSwitchStatus200 = changed200.status;
        observedSwitch200 = db.prepare('SELECT value FROM site_settings WHERE key=?').get(switchKey200)?.value;
      }
    };
    try {
      res200 = await call('PUT', '/api/application', { who: member200, body: { ...racePayload200, character: 'Changed Racer' } });
      result200 = await J(res200);
    } finally { PREPARE_HOOK = null; }
    const label200 = switchKey200 + ' switched OFF during ' + (existing200 ? 'existing application update' : 'first application insert');
    check(label200 + ' genuinely completed the original reentrant Admin save', interleaved200 && adminSwitchStatus200 === 200 && observedSwitch200 === '0');
    check(label200 + ' refuses at the atomic application write without changing its row or audit', res200.status === 403 && result200.error === refusal200 && JSON.stringify(application200() ?? null) === beforeApplication200 && applicationAudits200() === beforeApplicationAudit200, res200.status, result200.error);
    console.log('MEASURED_APPLICATION_SWITCH_RACE ' + JSON.stringify({ switchKey: switchKey200, existing: existing200, adminStatus: adminSwitchStatus200, observedSwitch: observedSwitch200, status: res200.status, error: result200.error, rowUnchanged: JSON.stringify(application200() ?? null) === beforeApplication200, auditUnchanged: applicationAudits200() === beforeApplicationAudit200 }));
  }
  await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { applicationsOpen: true, royalWritsOn: false } });
  if (originalApplicationsSwitch200) await fixtureRun("UPDATE site_settings SET value=? WHERE key='applicationsOpen'", originalApplicationsSwitch200.value);
  else await fixtureRun("DELETE FROM site_settings WHERE key='applicationsOpen'");
  const beforeLogout200 = snapshot200();
  const logout200 = await call('POST', '/auth/logout', { who: VIKTOR });
  res200 = await call('PUT', '/api/admin/settings', { who: VIKTOR, body: { royalWritsOn: true } });
  check('original admin logout fences any later visibility write', logout200.status === 200 && res200.status === 401 && snapshot200() === beforeLogout200);
  check('all unrelated settings remain byte-for-byte unchanged', JSON.stringify(db.prepare("SELECT key,value FROM site_settings WHERE key!='royalWritsOn' ORDER BY key").all()) === beforeSettings200);
  check('visibility-only changes introduce no provider HTTP after original sign-in', D.calls.length === providerAfterLogin200);
  check('all paths preserve the exact installed Native schema', JSON.stringify(db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all()) === installedSchema200);
  globalThis.Date = RealDate;
  console.log(ok + '/' + n + ' Royal Writ settings checks passed'); db.close(); process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); try { db.close(); } catch {} process.exit(1); });
`;
const module200 = new Module(fixture200, module);
module200.filename = fixture200; module200.paths = Module._nodeModulePaths(path200.dirname(fixture200));
module200._compile(prefix200 + body200, fixture200);
