// Current promotion producer under genuine local Workerd/D1; synthetic identities only.
import {readLaunchOperations229} from '../src/site-launch229.ts';
import {captureLaunchVerification} from '../src/launch-verification227.ts';
import {ADMISSION_EXPECTED_JSON, ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH = 'a'.repeat(32);
let used = false;
export default {async fetch(request, bindings) {
  if (request.method !== 'POST' || used) return new Response(null, {status: 404});
  used = true;
  const db = bindings.DB, checks = [];
  const check = (name, value) => { if (!value) throw Error(name); checks.push({name, passed: true}); };
  try {
    const catalogue = JSON.parse(ADMISSION_EXPECTED_JSON);
    const install = [...catalogue.tables, ...catalogue.indexes].map(row => db.prepare(row.sql));
    install.push(db.prepare(catalogue.slotSQL));
    while (install.length) await db.batch(install.splice(0, 40));
    const at = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS n").first()).n;
    const env = {DB: null, VERIFY_MEMBERSHIP_ONLY: 'true',
      VERIFY_NATIVE_SCOPE: JSON.stringify({version: 1, guild: 'OLYMPUS PRIME', realm: 'Fixture Realm'}),
      VERIFY_SECRET: 'synthetic-promotion-only', LINKS_NOT_BEFORE: String(at - 3600),
      SITE_GUILD_ID: '800000000000000001', DISCORD_BOT_TOKEN: 'synthetic-promotion-only',
      PRIVACY_WRITE_ADMISSION_ENABLED: 'true', PRIVACY_WRITE_ADMISSION_LAYOUT: 'canonical',
      PRIVACY_WRITE_ADMISSION_EPOCH: EPOCH};
    const launch = captureLaunchVerification(env);
    check('actual exact native scope is current', launch.mode === 'members-only' && launch.current());
    const rows = [
      ['Fresh Initiate', 'fresh'], ['Fresh Knight', 'knight'], ['Future Anchor', 'future'],
      ['Zero Anchor', 'zero'], ['Text Anchor', 'text'], ['Old Anchor', 'old'],
      ['Denied Link', 'denied'], ['Banned Link', 'banned'], ['Private Link', 'private'],
    ].map(([name, kind], i) => ({name, kind, key: name.toLowerCase(),
      subject: String(800000000000000101n + BigInt(i)), guid: 'Player-6933-' + (i + 1).toString(16).padStart(8, '0')}));
    await db.batch([
      db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL, EPOCH),
      db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
      db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',?1)").bind(at),
      db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted) VALUES(1,?1,?1,?1,?2,?3,1,1)").bind(at - 30, launch.scope.provenance, rows.length),
      ...rows.map(row => db.prepare('INSERT INTO members(discord_id,banned) VALUES(?1,?2)').bind(row.subject, row.kind === 'banned' ? 1 : 0)),
      ...rows.map(row => db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level) VALUES(1,?1,?2,?3,?4,?5,60)').bind(row.key, row.name, row.guid, row.kind === 'knight' ? 'Raider' : 'Initiate', row.kind === 'knight' ? 7 : 9)),
      ...rows.map(row => db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)").bind(row.key, row.name, row.subject,
        row.kind === 'future' ? at + 3600 : row.kind === 'zero' ? 0 : row.kind === 'text' ? 'not-a-time' : row.kind === 'old' ? at - 7200 : at - 60, row.guid)),
      db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?1,?2,?2,1)').bind(rows.find(row => row.kind === 'denied').subject, at),
      db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',0,?3,?3)").bind(rows.find(row => row.kind === 'private').subject, 'b'.repeat(32), at),
    ]);
    const triggers = catalogue.triggers.map(row => db.prepare(row.sql));
    while (triggers.length) await db.batch(triggers.splice(0, 40));
    env.DB = createPrivacyWriteAdmissionDatabase(db, 'writer', 'canonical', EPOCH);
    const before = JSON.stringify((await db.prepare('SELECT name_key,guid,status,bound_at,verified_at FROM characters ORDER BY name_key').all()).results);
    const countsBefore = JSON.stringify(await db.prepare('SELECT (SELECT COUNT(*) FROM role_settlements) roles,(SELECT COUNT(*) FROM invite_queue) invites,(SELECT COUNT(*) FROM pending) pending').first());
    const page = await readLaunchOperations229(env);
    check('fresh original Initiate link retains exact Member recommendation', page.promotions.some(row => row.name === 'Fresh Initiate' && row.currentSlot === 9 && row.targetSlot === 8 && row.targetName === 'Member'));
    check('fresh native Raider with exact Knight entitlement retains Veteran recommendation', page.promotions.some(row => row.name === 'Fresh Knight' && row.currentSlot === 7 && row.targetSlot === 6 && row.targetName === 'Veteran'));
    for (const name of ['Future Anchor', 'Zero Anchor', 'Text Anchor', 'Old Anchor', 'Denied Link', 'Banned Link', 'Private Link']) {
      check(name + ' remains held unknown without a promotion', !page.promotions.some(row => row.name === name) && page.held.some(row => row.name === name && row.reason === 'verification-unknown'));
    }
    check('projection retains original native source clock and bounded page/scan deadlines', page.snapshotAt === at - 30 && page.expiresAt <= page.fetchedAt + 60 && page.scan.expiresAt === at - 30 + 600);
    check('projection preserves both original link anchors without repair', before === JSON.stringify((await db.prepare('SELECT name_key,guid,status,bound_at,verified_at FROM characters ORDER BY name_key').all()).results));
    check('read-only projection creates no roles invites or pending requests', countsBefore === JSON.stringify(await db.prepare('SELECT (SELECT COUNT(*) FROM role_settlements) roles,(SELECT COUNT(*) FROM invite_queue) invites,(SELECT COUNT(*) FROM pending) pending').first()));
    await env.DB.prepare('UPDATE roster_snapshots SET trusted=0 WHERE id=1').run();
    const untrusted = await readLaunchOperations229(env);
    check('latest untrusted snapshot remains held without recommendations', untrusted.status === 'held' && untrusted.promotions.length === 0);
    await env.DB.prepare('UPDATE roster_snapshots SET trusted=1,complete=0 WHERE id=1').run();
    const incomplete = await readLaunchOperations229(env);
    check('latest incomplete snapshot remains held without recommendations', incomplete.status === 'held' && incomplete.promotions.length === 0);
    await env.DB.prepare('UPDATE roster_snapshots SET complete=1,exported_at=?1 WHERE id=1').bind(at - 600).run();
    const expired = await readLaunchOperations229(env);
    check('600-second native source is refused rather than redated', expired.status === 'held' && expired.promotions.length === 0);
    check('real D1 foreign-key integrity remains intact', (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0);
    return Response.json({complete: true, actualLocalWorkerdD1: true, checks});
  } catch (error) {
    return Response.json({complete: false, actualLocalWorkerdD1: true, checks, error: String(error?.stack || error)}, {status: 500});
  }
}};
