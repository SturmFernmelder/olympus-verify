// Actual candidate modules in Workerd, genuine local D1, no production bypass.
import { routeLink } from '../src/link.ts';
import { liveLinkMembershipOn } from '../src/live-link-membership.ts';
import { captureLiveLinkRoster, liveLinkRosterFacts, liveLinkRosterPredicate } from '../src/live-link-roster.ts';
import { LIVE_LINK_NO_DISPATCH_SQL, captureLiveLinkNoDispatch } from '../src/live-link-no-dispatch.ts';
import { queueAndSettleLiveLinkMembership } from '../src/role-settlements.ts';
import { CANONICAL_GUILD233, CANONICAL_PROFILE233, CANONICAL_RANKS233 } from '../src/canonical-ranks233.ts';
import vectors from '../vendor/olympus-link/guid-vectors.json';

export async function qualifyLiveLink({ env, db, check, replacementEnv, replacementDB }) {
  const now = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").first()).t;
  const native = { version: 1, guild: 'OLYMPUS PRIME', realm: 'Qualification Native Realm' };
  const proof = vectors.cases.find(c => c.name === 'valid-one').text;
  const configured = { ...env, GUILD_ID: CANONICAL_GUILD233, ROLE_GUILD_MEMBER: CANONICAL_RANKS233[9].roleId,
    PRIVACY_NATIVE_ERASURE_ENABLED: 'true', VERIFY_MEMBERSHIP_ONLY: 'true', VERIFY_NATIVE_SCOPE: JSON.stringify(native),
    LINKS_NOT_BEFORE: String(now - 1000), LINK_ENABLED: 'true', LINK_MEMBERSHIP_ENABLED: 'true',
    LINK_MEMBERSHIP_SCOPE: JSON.stringify({ version: 1, guild: native.guild, faction: 'Alliance', servers: ['6933'] }),
    LINK_DB: db, LINK_BACKEND_SEED: 'k'.repeat(43), LINK_BACKEND_PUBLIC: 'a'.repeat(64), LINK_ADMIN_TOKEN: 'qualification-only-'.repeat(3),
    LINK_ORIGIN: 'https://dnl-gentile.github.io', LINK_ROLE_ID: '1700000000000000001', LINK_MODE: 'c', LINK_GUILD_POLICY: 'verified' };
  const canonical = JSON.stringify({ version: 1, enabled: true, profile: CANONICAL_PROFILE233, guildId: CANONICAL_GUILD233,
    ranks: CANONICAL_RANKS233.map(r => ({ ...r, permissions: '0' })) });
  const snapshot = async () => JSON.stringify((await db.prepare(`SELECT
    (SELECT COUNT(*) FROM members) AS members,(SELECT COUNT(*) FROM characters) AS characters,
    (SELECT COUNT(*) FROM role_settlements) AS roles,(SELECT COUNT(*) FROM site_settings) AS settings,
    (SELECT COUNT(*) FROM audit) AS audit`).first()));
  const submit = async e => {
    const request = new Request('https://verify.example/proof', { method: 'POST',
      headers: { Origin: e.LINK_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: proof, discordToken: 'qualification-signin-token' }) });
    const response = await routeLink(request, e, '/proof', true);
    return { status: response.status, body: await response.json() };
  };
  const before = await snapshot();
  for (const [label, change, reason] of [
    ['off', { LINK_MEMBERSHIP_ENABLED: 'false' }, 'membership-off'],
    ['invalid flag', { LINK_MEMBERSHIP_ENABLED: 'TRUE' }, 'membership-off'],
    ['unresolved lifecycle', {}, 'privacy-contract-pending'],
    ['current canonical policy', { CANONICAL_RANKS233: canonical }, 'native-rank-integration-pending'],
  ]) {
    const answer = await submit({ ...configured, ...change });
    check('actual Link route holds ' + label + ' before consumption', answer.status === 200 && answer.body.reason === reason && answer.body.ok !== true);
    check(label + ' leaves all business rows unchanged', await snapshot() === before);
  }
  check('held activation never advertises Link as the first membership path', !liveLinkMembershipOn(configured));
  const central = await queueAndSettleLiveLinkMembership({ ...configured, CANONICAL_RANKS233: canonical }, Object.freeze({}), Object.freeze({}));
  check('central entry retains the same early canonical integration hold', central.state === 'held' && central.reason === 'native-rank-integration-pending' && await snapshot() === before);

  const name = 'qualification member', guid = 'Player-6933-0000A001', source = 'addon-native-v1:' + JSON.stringify(native);
  let id = 0;
  const publish = async (o = {}) => {
    const snapshotId = ++id, rows = o.rows ?? [{ key: name, guid }];
    await env.DB.batch([
      env.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted)VALUES(?1,?2,?3,?4,?5,?6,?7)')
        .bind(snapshotId, o.exported ?? now - 20, now, o.source ?? source, o.count ?? rows.length, o.complete ?? 1, o.trusted ?? 1),
      ...rows.map(r => env.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index)VALUES(?1,?2,?2,?3,?4,8)')
        .bind(snapshotId, r.key, r.guid, 'Member')),
    ]);
  };
  const capture = () => captureLiveLinkRoster(configured, name, guid);
  check('missing native roster cannot issue an original roster capability', await capture() === null);
  for (const [label, options] of [
    ['wrong native provenance', { source: 'addon-native-v1:other' }],
    ['stale', { exported: now - 700 }], ['future', { exported: now + 30 }],
    ['incomplete', { complete: 0 }], ['untrusted', { trusted: 0 }], ['short', { count: 2 }],
    ['another name', { rows: [{ key: 'another name', guid }] }],
    ['another GUID', { rows: [{ key: name, guid: 'Player-6933-0000A002' }] }],
    ['duplicated GUID', { rows: [{ key: name, guid }, { key: 'duplicate member', guid }] }],
  ]) {
    await publish(options);
    check(label + ' roster refuses Link membership evidence', await capture() === null);
  }
  await publish();
  const cap = await capture();
  check('exact fresh complete trusted Native roster issues only read evidence', !!cap && liveLinkRosterFacts(cap).snapshotId === id);
  const fence = liveLinkRosterPredicate(configured, cap);
  const current = async () => (await env.DB.prepare('SELECT (' + fence.sql + ') AS current').bind(...fence.values).first()).current === 1;
  check('the original roster predicate admits the exact genuine D1 snapshot', await current());
  const shifted = liveLinkRosterPredicate(configured, cap, 4);
  check('composition preserves numbered binds', (await env.DB.prepare('SELECT ?1 AS a,?2 AS b,?3 AS c,(' + shifted.sql + ') AS current').bind('a', 'b', 'c', ...shifted.values).first()).current === 1);
  await publish({ trusted: 0 });
  check('a newer untrusted snapshot cannot fall back to the older good one', await capture() === null && !await current());
  const marker = 'qualification-live-link-fence';
  await env.DB.prepare('INSERT INTO site_settings(key,value,updated_at)SELECT ?1,\'candidate\',?2 WHERE ' + fence.sql.replace(/\?(\d+)/g, (_all, n) => '?' + (Number(n) + 2))).bind(marker, now, ...fence.values).run();
  check('a source change refuses the consuming write in actual D1', !await db.prepare('SELECT key FROM site_settings WHERE key=?1').bind(marker).first());
  let refusedBatch = false;
  try {
    await env.DB.batch([
      env.DB.prepare("SELECT CASE WHEN " + fence.sql + " THEN 1 ELSE json_extract('live_link_native_source_changed','$') END AS admitted").bind(...fence.values),
      env.DB.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES(?1,'unreachable',?2)").bind(marker, now),
    ]);
  } catch { refusedBatch = true; }
  check('the consuming fence rejects its entire real D1 batch after source change', refusedBatch && !await db.prepare('SELECT key FROM site_settings WHERE key=?1').bind(marker).first());
  await publish();
  const changedScope = { ...configured, VERIFY_NATIVE_SCOPE: JSON.stringify({ ...native, realm: 'Another Native Realm' }) };
  check('another realm cannot borrow the configured source', await captureLiveLinkRoster(changedScope, name, guid) === null);
  const cutoff = { ...configured, LINKS_NOT_BEFORE: String(now) };
  check('a pre-cutoff roster cannot issue Link evidence', await captureLiveLinkRoster(cutoff, name, guid) === null);
  let forged = false;
  try { liveLinkRosterPredicate(configured, Object.freeze({ ...liveLinkRosterFacts(cap) })); } catch { forged = true; }
  check('copied roster facts cannot mint a source capability', forged);
  const mutable = { ...configured }, pinned = await captureLiveLinkRoster(mutable, name, guid);
  mutable.VERIFY_NATIVE_SCOPE = changedScope.VERIFY_NATIVE_SCOPE;
  let invalidated = false;
  try { liveLinkRosterPredicate(mutable, pinned); } catch { invalidated = true; }
  check('an original source witness refuses changed configuration', invalidated);

  const subject = '800000000000000101', guild = CANONICAL_GUILD233, role = CANONICAL_RANKS233[9].roleId;
  const operation = n => n.toString(16).padStart(32, '0');
  const addIntent = async (n, state = 'pending', attempts = 0, claim = null, targetEnv = env) => {
    await targetEnv.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,created_at,expires_at,roster_id,native_guid,native_profile,request_digest)
      VALUES(?1,?2,'live_link_membership',?3,?4,1,?5,'launch230_awaiting_dispatch',?6,?7,?8,?9,?10,?11,'live-link-v1',?12)`)
      .bind(operation(n), subject, guild, role, state, attempts, claim, now, now + 300, id, guid, 'f'.repeat(64)).run();
  };
  const retire = (n, digest = 'f'.repeat(64)) => env.DB.prepare(LIVE_LINK_NO_DISPATCH_SQL)
    .bind(operation(n), subject, guild, role, null, digest, now, now + 300, id, guid).first();
  await addIntent(101);
  check('known exact attempts0 original can become held without an HTTP ACK', (await retire(101))?.id === operation(101));
  const retired = await db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(operation(101)).first();
  check('known no-dispatch receipt preserves identity and zero attempts', retired.state === 'held' && retired.reason === 'live_link_never_dispatched' && retired.attempts === 0 && retired.claim_nonce === null && retired.checked_at >= now);
  check('the held attempts0 receipt no longer blocks a fresh code', !(await db.prepare("SELECT 1 FROM role_settlements WHERE subject=?1 AND purpose='live_link_membership' AND state IN('pending','dispatching','unknown')").bind(subject).first()));
  check('lost cleanup reply is idempotent and cannot create a second receipt', await retire(101) === null);
  await addIntent(102);
  check('a mismatched original tuple cannot close another pending intent', await retire(102, 'e'.repeat(64)) === null);
  for (const [n, state, attempts, claim] of [[103, 'dispatching', 1, 'd'.repeat(32)], [104, 'unknown', 1, 'c'.repeat(32)], [105, 'settled', 0, null], [106, 'pending', 1, 'b'.repeat(32)]]) {
    await addIntent(n, state, attempts, claim);
    check(state + '/attempts' + attempts + ' retains original unresolved or terminal custody', await retire(n) === null && (await db.prepare('SELECT state,attempts,claim_nonce FROM role_settlements WHERE id=?1').bind(operation(n)).first()).state === state);
  }
  const tuple = n => [operation(n), subject, guild, role, null, 'f'.repeat(64), now, now + 300, id, guid];
  const rowState = (database, n) => database.prepare('SELECT state FROM role_settlements WHERE id=?1').bind(operation(n)).first();
  const heldCleanup = async close => { try { await close(); return false; } catch { return true; } };
  await addIntent(107);
  const closeOriginal = captureLiveLinkNoDispatch(env, tuple(107), () => {});
  check('captured original cleanup executes its pinned genuine D1 statement', (await closeOriginal())?.id === operation(107) && (await rowState(db, 107)).state === 'held');
  await addIntent(108);
  await addIntent(108, 'pending', 0, null, replacementEnv);
  const swapped = { ...env }, closeSwapped = captureLiveLinkNoDispatch(swapped, tuple(108), () => {});
  swapped.DB = replacementEnv.DB;
  check('a swapped physical database binding refuses captured cleanup', await heldCleanup(closeSwapped));
  check('binding swap leaves both original and copied foreign pending tuples unchanged', (await rowState(db, 108)).state === 'pending' && (await rowState(replacementDB, 108)).state === 'pending');
  await addIntent(109);
  let receiptCurrent = true;
  const closeInvalidReceipt = captureLiveLinkNoDispatch(env, tuple(109), () => { if (!receiptCurrent) throw Error('qualification_original_receipt_changed'); });
  receiptCurrent = false;
  check('invalid original receipt witness holds cleanup without rewriting pending', await heldCleanup(closeInvalidReceipt) && (await rowState(db, 109)).state === 'pending');
  await addIntent(110);
  const closeChangedMethod = captureLiveLinkNoDispatch(env, tuple(110), () => {});
  const descriptor = Object.getOwnPropertyDescriptor(env.DB, 'prepare');
  let foreignMethodCalls = 0, methodHeld = false;
  try {
    // Mutate the registered admission facade only. Native D1 and every query
    // remain real; the original witness must reject before the method runs.
    Object.defineProperty(env.DB, 'prepare', { ...descriptor, value() { foreignMethodCalls++; throw Error('qualification_replaced_prepare'); } });
    methodHeld = await heldCleanup(closeChangedMethod);
  } finally { Object.defineProperty(env.DB, 'prepare', descriptor); }
  check('a changed admission method holds captured cleanup before invoking the replacement', methodHeld && foreignMethodCalls === 0 && (await rowState(db, 110)).state === 'pending');
  check('Link candidate checks preserve genuine D1 foreign keys', (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0);
}
