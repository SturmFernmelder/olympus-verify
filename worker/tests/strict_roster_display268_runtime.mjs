// Actual Workerd/D1 display behavior; fixture identities never authorize roles.
import {strictRosterDisplay, STRICT_ROSTER_DISPLAY_PROTOCOL_V2} from '../src/unverified.ts';
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
      VERIFY_NATIVE_SCOPE: JSON.stringify({version: 1, guild: 'Olympus', realm: 'Fixture Realm'}),
      VERIFY_SECRET: 'synthetic-display-only', LINKS_NOT_BEFORE: String(at - 3600),
      PRIVACY_WRITE_ADMISSION_ENABLED: 'true', PRIVACY_WRITE_ADMISSION_LAYOUT: 'canonical',
      PRIVACY_WRITE_ADMISSION_EPOCH: EPOCH};
    const launch = captureLaunchVerification(env);
    check('actual native scope capture is current', launch.mode === 'members-only' && launch.current());
    const rows = [
      ['Fresh Member', 'member'], ['Old Member', 'old'], ['Review Member', 'review'],
      ['Mismatch Member', 'mismatch'], ['Duplicate Member', 'duplicate'], ['Banned Member', 'banned'],
      ['Denied Member', 'denied'], ['Private Member', 'private'], ['Unlinked Member', 'unlinked'],
      ['Pending Member', 'pending'], ['Invalid Guid', 'invalid'],
      ['Future Anchor', 'future'], ['Zero Anchor', 'zero'], ['Invalid Anchor', 'invalid-time'],
    ].map(([name, kind], i) => ({name, kind, key: name.toLowerCase(),
      subject: String(800000000000000100n + BigInt(i)), guid: 'Player-4613-' + (i + 1).toString(16).padStart(8, '0')}));
    await db.batch([
      db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL, EPOCH),
      db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
      db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',?1)").bind(at),
      db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted) VALUES(1,?1,?1,?1,?2,?3,1,1)").bind(at - 30, launch.scope.provenance, rows.length),
      ...rows.map(row => db.prepare('INSERT INTO members(discord_id,banned) VALUES(?1,?2)').bind(row.subject, row.kind === 'banned' ? 1 : 0)),
      ...rows.map(row => db.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index) VALUES(1,?1,?2,?3,\'Member\',8)').bind(row.key, row.name, row.kind === 'invalid' ? 'not-a-native-guid' : row.guid)),
      ...rows.filter(row => !['unlinked', 'pending'].includes(row.kind)).map(row => db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) VALUES(?1,?2,?3,?4,?5,?5,'whisper',?6)").bind(row.key, row.name, row.subject, row.kind === 'review' ? 'verified' : 'member', row.kind === 'old' ? at - 7200 : row.kind === 'future' ? at + 3600 : row.kind === 'zero' ? 0 : row.kind === 'invalid-time' ? 'not-a-time' : at - 60, row.kind === 'mismatch' ? 'Player-4613-FFFFFFFF' : row.kind === 'invalid' ? 'not-a-native-guid' : row.guid)),
      db.prepare("INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?1,?2,?2,1)").bind(rows.find(row => row.kind === 'denied').subject, at),
      db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',0,?3,?3)").bind(rows.find(row => row.kind === 'private').subject, 'b'.repeat(32), at),
      db.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce) VALUES(?1,?2,?3,?4,?5,'M2X')").bind(rows.find(row => row.kind === 'pending').subject, 'pending member', 'Pending Member', at, at + 120),
      db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) VALUES('duplicate alias','Duplicate Alias',?1,'member',?2,?2,'whisper',?3)").bind(rows.find(row => row.kind === 'duplicate').subject, at - 60, rows.find(row => row.kind === 'duplicate').guid),
    ]);
    const triggers = catalogue.triggers.map(row => db.prepare(row.sql));
    while (triggers.length) await db.batch(triggers.splice(0, 40));
    env.DB = createPrivacyWriteAdmissionDatabase(db, 'writer', 'canonical', EPOCH);
    const before = JSON.stringify((await db.prepare('SELECT name_key,guid,status,bound_at,verified_at FROM characters ORDER BY name_key').all()).results);
    const v1 = await strictRosterDisplay(env, launch);
    const v2 = await strictRosterDisplay(env, launch, STRICT_ROSTER_DISPLAY_PROTOCOL_V2);
    check('v1 retains its exact seven-key schema and protocol', Object.keys(v1).sort().join(',') === 'fetchedAt,guild,protocol,realm,snapshotAt,unverified,verified' && v1.protocol === 'launch-roster-display-v1');
    check('v1 still omits old and review links', !v1.verified.some(row => row.name === 'Old Member') && !v1.verified.some(row => row.name === 'Review Member'));
    check('v1 timestamp behavior is preserved without retroactive authority changes', v1.verified.some(row => row.name === 'Future Anchor') && v1.verified.some(row => row.name === 'Invalid Anchor'));
    check('v2 adds only the unknown section', Object.keys(v2).sort().join(',') === 'fetchedAt,guild,protocol,realm,snapshotAt,unknown,unverified,verified' && v2.protocol === 'launch-roster-display-v2');
    check('fresh exact member stays verified in both protocols', v1.verified.some(row => row.name === 'Fresh Member') && v2.verified.length === 1 && v2.verified[0].name === 'Fresh Member');
    check('pre-cutoff member is explained without turning green', v2.unknown.find(row => row.name === 'Old Member')?.reason === 'linked_before_cutoff' && !v2.verified.some(row => row.name === 'Old Member'));
    for (const name of ['Review Member', 'Mismatch Member', 'Duplicate Member', 'Banned Member', 'Denied Member', 'Private Member', 'Future Anchor', 'Zero Anchor', 'Invalid Anchor']) {
      check(name + ' receives only a generic review reason', v2.unknown.find(row => row.name === name)?.reason === 'link_review');
    }
    check('unknown rows disclose only name GUID and safe reason', v2.unknown.length === 10 && v2.unknown.every(row => Object.keys(row).sort().join(',') === 'guid,name,reason'));
    check('unlinked and pending lists retain their separate meanings', v2.unverified.length === 2 && v2.unverified.find(row => row.name === 'Unlinked Member')?.pending === false && v2.unverified.find(row => row.name === 'Pending Member')?.pending === true);
    check('invalid native GUID is omitted from every section', ![...v2.verified, ...v2.unverified, ...v2.unknown].some(row => row.name === 'Invalid Guid'));
    check('display reads do not refresh or repair original link anchors', before === JSON.stringify((await db.prepare('SELECT name_key,guid,status,bound_at,verified_at FROM characters ORDER BY name_key').all()).results));
    check('actual D1 foreign-key integrity is intact', (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0);
    const display = () => strictRosterDisplay(env, captureLaunchVerification(env), STRICT_ROSTER_DISPLAY_PROTOCOL_V2);
    await env.DB.prepare('UPDATE roster_snapshots SET exported_at=?1 WHERE id=1').bind(at - 3601).run();
    check('an old roster is refused rather than redated', await display() === null);
    await env.DB.prepare('UPDATE roster_snapshots SET exported_at=?1,trusted=0 WHERE id=1').bind(at - 30).run();
    check('an untrusted roster is refused', await display() === null);
    await env.DB.prepare('UPDATE roster_snapshots SET trusted=1,complete=0 WHERE id=1').run();
    check('an incomplete roster is refused', await display() === null);
    await env.DB.prepare('UPDATE roster_snapshots SET complete=1,member_count=member_count+1 WHERE id=1').run();
    check('roster count mismatch is refused', await display() === null);
    await env.DB.prepare("UPDATE roster_snapshots SET member_count=member_count-1,source='different-scope' WHERE id=1").run();
    check('another native source is refused', await display() === null);
    env.VERIFY_NATIVE_SCOPE = JSON.stringify({version: 1, guild: 'Olympus I', realm: 'Fixture Realm'});
    check('a changed captured scope cannot be reused', await strictRosterDisplay(env, launch, STRICT_ROSTER_DISPLAY_PROTOCOL_V2) === null);
    return Response.json({complete: true, actualLocalWorkerdD1: true, checks, providerCalls: 0});
  } catch (error) { return Response.json({complete: false, checks, error: String(error?.stack || error)}, {status: 500}); }
}};
