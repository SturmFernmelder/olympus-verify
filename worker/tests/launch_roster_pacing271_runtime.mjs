// Genuine Workerd/D1 fixture. Only the runner's external Discord HTTP is synthetic.
import {readLaunchOperations229} from '../src/site-launch229.ts';
import {captureLaunchVerification} from '../src/launch-verification227.ts';
import {ADMISSION_EXPECTED_JSON, ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';

const EPOCH = 'a'.repeat(32);
const MODES = new Set(['full', 'partial-recover', 'credential-change', 'slow-read', '429-body', '429-header', '429-reset', '429-persistent',
  'malformed', 'skip-native', 'source-change']);
let fixture;
const proofSQL = 'SELECT name_key,name,discord_id,status,bound_at,verified_at,source,guid FROM characters ORDER BY name_key';
const effectSQL = 'SELECT (SELECT COUNT(*) FROM role_settlements) roles,(SELECT COUNT(*) FROM invite_queue) invites,(SELECT COUNT(*) FROM pending) pending';
const checks = [];
const check = (name, value) => { if (!value) throw Error(name); checks.push({name, passed: true}); };

async function seed(db) {
  const catalogue = JSON.parse(ADMISSION_EXPECTED_JSON);
  const install = [...catalogue.tables, ...catalogue.indexes].map(row => db.prepare(row.sql));
  install.push(db.prepare(catalogue.slotSQL));
  while (install.length) await db.batch(install.splice(0, 40));
  const at = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
  const env = {DB: null, VERIFY_MEMBERSHIP_ONLY: 'true',
    VERIFY_NATIVE_SCOPE: JSON.stringify({version: 1, guild: 'OLYMPUS PRIME', realm: 'Fixture Realm'}),
    VERIFY_SECRET: 'synthetic-roster-pacing-only', LINKS_NOT_BEFORE: String(at - 3600),
    SITE_GUILD_ID: '800000000000000001', DISCORD_BOT_TOKEN: 'synthetic-roster-pacing-full',
    PRIVACY_WRITE_ADMISSION_ENABLED: 'true', PRIVACY_WRITE_ADMISSION_LAYOUT: 'canonical',
    PRIVACY_WRITE_ADMISSION_EPOCH: EPOCH};
  const launch = captureLaunchVerification(env);
  check('actual exact native capture admits only the synthetic fixture scope', launch.mode === 'members-only' && launch.current());
  const rows = Array.from({length: 1000}, (_, i) => ({
    name: 'Pacing Member ' + String(i).padStart(4, '0'),
    key: 'pacing member ' + String(i).padStart(4, '0'),
    subject: String(800000000000001000n + BigInt(i)),
    guid: 'Player-6933-' + (i + 1).toString(16).padStart(8, '0'),
  }));
  const json = JSON.stringify(rows);
  await db.batch([
    db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL, EPOCH),
    db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
    db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',?1)").bind(at),
    db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted) VALUES(1,?1,?1,?1,?2,1000,1,1)").bind(at - 120, launch.scope.provenance),
    db.prepare("INSERT INTO members(discord_id,banned) SELECT json_extract(value,'$.subject'),0 FROM json_each(?1)").bind(json),
    db.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level) SELECT 1,json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.guid'),'Initiate',9,60 FROM json_each(?1)").bind(json),
    db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) SELECT json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.subject'),'member',?2,?2,'whisper',json_extract(value,'$.guid') FROM json_each(?1)").bind(json, at - 60),
    db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',0,?3,?3)").bind(rows[0].subject, 'b'.repeat(32), at),
  ]);
  const triggers = catalogue.triggers.map(row => db.prepare(row.sql));
  while (triggers.length) await db.batch(triggers.splice(0, 40));
  env.DB = createPrivacyWriteAdmissionDatabase(db, 'writer', 'canonical', EPOCH);
  const originalProofs = JSON.stringify((await db.prepare(proofSQL).all()).results);
  const originalEffects = JSON.stringify(await db.prepare(effectSQL).first());
  const native = await db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT guid) guids FROM roster_members WHERE snapshot_id=1').first();
  const linked = await db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT guid) guids FROM characters').first();
  check('genuine D1 holds exactly 1000 distinct native GUIDs and original fresh links',
    native.n === 1000 && native.guids === 1000 && linked.n === 1000 && linked.guids === 1000);
  return {env, db, at, rows, originalProofs, originalEffects};
}

export default {async fetch(request, bindings) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return new Response(null, {status: 404});
  try {
    if (url.pathname === '/seed' && !fixture) {
      fixture = await seed(bindings.DB);
      return Response.json({complete: true, actualLocalWorkerdD1: true, at: fixture.at, checks});
    }
    if (!fixture) return new Response(null, {status: 404});
    const {env, db} = fixture;
    if (url.pathname === '/page') {
      const {mode, cursor = null} = await request.json();
      if (!MODES.has(mode) || cursor !== null && typeof cursor !== 'string') return new Response(null, {status: 400});
      env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-' + mode;
      const page = await readLaunchOperations229(env, cursor);
      return Response.json({complete: true, actualLocalWorkerdD1: true, page});
    }
    if (url.pathname === '/cursor-boundary') {
      // Explicit signed-input boundary, not an assertion that this old cursor was
      // historically minted. Current clock, D1 source and reader remain genuine.
      const {cursor, kind} = await request.json();
      let value = JSON.parse(atob(cursor.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      const at = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
      let sharedKeyOnly = false;
      if (kind === 'expired-role') {
        value.issuedAt = at - 90;
        value.expiresAt = Math.min(value.issuedAt + 600, value.snapshotAt + 600);
        value.roleReads = value.roleReads.map(row => [row[0], row[1], at - 61]);
      } else if (kind === 'expired-scan') {
        value.issuedAt = at - 700;
        value.expiresAt = Math.min(value.issuedAt + 600, value.snapshotAt + 600);
        value.roleReads = [];
      } else if (kind === 'wrong-guid') {
        value.roleReads[0][0] = fixture.rows[999].guid;
      } else if (kind === 'wrong-role-scope') {
        value.roleScope = 'f'.repeat(64);
      } else if (kind === 'shared-secret-forgery') {
        value.roleReads[0] = [value.roleReads[0][0], 'knight', at];
        sharedKeyOnly = true;
      } else if (kind === 'legacy-v1' || kind === 'legacy-v1-cache-forgery') {
        const {snapshotId, snapshotAt, scopeHash, rowsDigest, offset, issuedAt, expiresAt} = value;
        value = {version: 1, snapshotId, snapshotAt, scopeHash, rowsDigest, offset, issuedAt, expiresAt,
          ...(kind === 'legacy-v1-cache-forgery' ? {roleReads: value.roleReads} : {})};
        sharedKeyOnly = true;
      } else return new Response(null, {status: 400});
      const body = btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-partial-recover';
      const signingKey = sharedKeyOnly ? env.VERIFY_SECRET
        : JSON.stringify(['officer-role-cursor', 271, env.VERIFY_SECRET, env.SITE_GUILD_ID, env.DISCORD_BOT_TOKEN]);
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
      const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('officer-operations-cursor|233|' + body))), n => n.toString(16).padStart(2, '0')).join('');
      const page = await readLaunchOperations229(env, body + '.' + signature);
      return Response.json({complete: true, actualLocalWorkerdD1: true, syntheticSignedInputBoundary: true, page});
    }
    if (url.pathname === '/source-state') {
      const {kind, restore = false} = await request.json();
      if (kind === 'privacy') await env.DB.prepare('UPDATE privacy_subjects SET state=?1 WHERE subject_id=?2').bind(restore ? 'active' : 'retiring', fixture.rows[0].subject).run();
      else if (kind === 'link') await env.DB.prepare('UPDATE characters SET guid=?1 WHERE name_key=?2').bind(restore ? fixture.rows[0].guid : null, fixture.rows[0].key).run();
      else return new Response(null, {status: 400});
      return Response.json({complete: true});
    }
    if (url.pathname === '/ranks') {
      const names = ['Guild Master', 'Stewart', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran'];
      await env.DB.batch(names.map((rank, i) => env.DB.prepare('UPDATE roster_members SET rank=?1,rank_index=?2 WHERE snapshot_id=1 AND name_key=?3').bind(rank, i, fixture.rows[i].key)));
      return Response.json({complete: true});
    }
    if (url.pathname === '/source-change') {
      await env.DB.prepare('UPDATE roster_snapshots SET trusted=0 WHERE id=1').run();
      return Response.json({complete: true});
    }
    if (url.pathname === '/audit') {
      check('all 1000 original identity and proof anchors are unchanged', fixture.originalProofs === JSON.stringify((await db.prepare(proofSQL).all()).results));
      check('read projections created no roles invitations or pending requests', fixture.originalEffects === JSON.stringify(await db.prepare(effectSQL).first()));
      check('genuine D1 foreign-key integrity remains intact', (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0);
      return Response.json({complete: true, actualLocalWorkerdD1: true, checks});
    }
    return new Response(null, {status: 404});
  } catch (error) {
    return Response.json({complete: false, actualLocalWorkerdD1: true, checks, error: String(error?.stack || error)},
      {status: [400, 409].includes(error?.status) ? error.status : 500});
  }
}};
