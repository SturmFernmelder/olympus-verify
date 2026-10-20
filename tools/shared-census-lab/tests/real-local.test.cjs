'use strict';
const assert = require('node:assert/strict');
const { createCensusStore, CensusError, FIXTURES, CONSENT_VERSION, LOCAL_REAL_CONSENT_VERSION, FORMAT } = require('../core.cjs');
let passed = 0;
const START = 1792497600, A = FIXTURES.reporterA, B = FIXTURES.reporterB, R = FIXTURES.reader;
// Fictional names test the real-local mode without retaining a real guild observation.
const guild = () => ({ guildKey: 'local-own-guild', label: 'Local Review Guild', realmGroup: 'Local Review Realm', faction: 'Alliance', product: 'local-only' });
function check(label, operation) { operation(); passed++; console.log('PASS ' + label); }
function refused(code, operation, status) { assert.throws(operation, error => error instanceof CensusError && error.code === code && (status === undefined || error.status === status)); }
function setup(registration = guild()) { let now = START; const store = createCensusStore({ now: () => now, localRealGuild: registration }); return { store, time(value) { now = value; } }; }
const intent = (store, ctx = A) => store.createIntent(ctx, { guildKey: 'local-own-guild', consentVersion: LOCAL_REAL_CONSENT_VERSION });
const report = (created, patch = {}) => Buffer.from(JSON.stringify({ format: FORMAT, intent: created.intent, source: 'unverified-volunteer-client', sourceVerified: false, membershipProof: false, guildKey: 'local-own-guild', addonVersion: '0.1.0', observedAt: START, sourceReceivedAt: START, capturedAt: START, completeRosterClaimed: true, reportedCharacters: 100, reportedOnline: 20, ...patch }));
const row = store => store.summary(R).rows[0];
function flags(value) { assert.equal(value.syntheticOnly, false); assert.equal(value.localOnly, true); assert.equal(value.reporterIdentitySynthetic, true); }

for (const [label, registration] of [
  ['null', null], ['array', [guild()]], ['empty object', {}],
  ['extra field', { ...guild(), discordId: 'not-supported' }],
  ['symbol field', { ...guild(), [Symbol('hidden')]: true }],
  ['synthetic key', { ...guild(), guildKey: 'guild-oak' }],
  ['arbitrary key', { ...guild(), guildKey: 'another-guild' }],
  ['production product', { ...guild(), product: 'classic' }],
  ['unknown faction', { ...guild(), faction: 'Other' }],
  ['blank label', { ...guild(), label: '' }],
  ['padded label', { ...guild(), label: ' Guild' }],
  ['control label', { ...guild(), label: 'Guild\nName' }],
  ['control realm', { ...guild(), realmGroup: 'Realm\u0085Name' }],
  ['oversize utf8 label', { ...guild(), label: 'é'.repeat(65) }],
  ['unpaired surrogate', { ...guild(), realmGroup: '\ud800' }],
  ['custom prototype', Object.assign(Object.create({ hidden: true }), guild())],
  ['accessor', Object.defineProperty(guild(), 'label', { get() { throw Error('Accessor must not run'); } })]
]) check('local-real registration refuses ' + label, () => assert.throws(() => setup(registration), TypeError));

check('explicit local registration is copied and cannot adopt later caller edits', () => {
  const input = guild(), { store } = setup(input); input.label = 'Changed'; input.realmGroup = 'Changed';
  const contract = store.contract(A); flags(contract); assert.equal(contract.consentVersion, LOCAL_REAL_CONSENT_VERSION); assert.notEqual(contract.consentVersion, CONSENT_VERSION);
  assert.deepEqual(contract.allowedGuildKeys, ['local-own-guild']); assert.deepEqual(contract.guilds, [guild()]);
  contract.guilds[0].label = 'Browser edit'; contract.allowedGuildKeys.push('guild-oak'); assert.deepEqual(store.contract(A).guilds, [guild()]); assert.deepEqual(store.contract(A).allowedGuildKeys, ['local-own-guild']);
  assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('bounded Unicode and Horde remain labels rather than identity proof', () => {
  const { store } = setup({ ...guild(), label: 'Guild 😀', realmGroup: 'Réalm', faction: 'Horde' });
  assert.equal(row(store).label, 'Guild 😀'); assert.equal(row(store).faction, 'Horde'); assert.equal(store.summary(R).sourceVerified, false); assert.equal(store.summary(R).membershipProof, false); assert.equal(store.summary(R).gameIdentityProven, false); store.close();
});
check('default synthetic registry and DTO shape remain unchanged', () => {
  const store = createCensusStore({ now: () => START }); const contract = store.contract(A);
  assert.equal(contract.syntheticOnly, true); assert.equal(Object.hasOwn(contract, 'localOnly'), false); assert.equal(Object.hasOwn(contract, 'reporterIdentitySynthetic'), false); assert.equal(contract.consentVersion, CONSENT_VERSION);
  assert.deepEqual(contract.allowedGuildKeys, ['guild-oak', 'guild-pine']); assert.equal(contract.guilds.length, 3); assert.equal(contract.guilds[0].product, 'synthetic-only'); store.close();
});
check('real-local and synthetic stores cannot read or adopt each other outcomes', () => {
  const { store } = setup(), synthetic = createCensusStore({ now: () => START }); const created = intent(store);
  refused('outcome_unavailable', () => synthetic.outcome(A, created.intent), 404); assert.equal(synthetic.inspect().intents, 0); assert.equal(store.inspect().intents, 1); store.close(); synthetic.close();
});
check('only explicit local consent and registered guild can prepare an intent', () => {
  const { store } = setup();
  refused('intent_contract', () => store.createIntent(A, { guildKey: 'local-own-guild', consentVersion: CONSENT_VERSION }), 400);
  refused('intent_contract', () => store.createIntent(A, { guildKey: 'guild-oak', consentVersion: LOCAL_REAL_CONSENT_VERSION }), 400);
  refused('access_refused', () => intent(store, R), 403); assert.deepEqual(store.contract(R).allowedGuildKeys, []);
  const created = intent(store); flags(created); flags(store.outcome(A, created.intent)); assert.equal(created.expiresAt - created.issuedAt, 300); store.close();
});
check('receipt honestly disclaims real account association while retaining fixture ownership', () => {
  const { store } = setup(), created = intent(store), raw = report(created), receipt = store.submit(A, raw);
  for (const value of [receipt, store.receipt(A, receipt.receiptId), store.outcome(A, created.intent), store.summary(R)]) flags(value);
  assert.equal(receipt.reporterAccountAssociated, false); assert.equal(receipt.syntheticReporterAssociated, true); assert.equal(receipt.sourceVerified, false); assert.equal(receipt.membershipProof, false); assert.equal(receipt.gameIdentityProven, false);
  assert.deepEqual(store.submit(A, raw), receipt); assert.equal(store.inspect().attempts, 1); assert.equal(store.inspect().receipts, 1);
  refused('outcome_unavailable', () => store.outcome(B, created.intent), 404); refused('outcome_unavailable', () => store.withdraw(B, receipt.receiptId), 404); store.close();
});
for (const [label, patch, code] of [
  ['synthetic scope', { guildKey: 'guild-oak' }, 'guild_scope'],
  ['identity field', { discordId: 'not-supported' }, 'report_shape'],
  ['verified source', { sourceVerified: true }, 'report_contract'],
  ['membership proof', { membershipProof: true }, 'report_contract'],
  ['small exact total', { reportedCharacters: 4 }, 'member_count'],
  ['small online', { reportedOnline: 4 }, 'online_count'],
  ['small remainder', { reportedOnline: 98 }, 'small_complement'],
  ['small total with online', { reportedCharacters: 'few', reportedOnline: 0 }, 'small_total'],
  ['expired source', { sourceReceivedAt: START - 86400, observedAt: START - 86400, reportedOnline: null }, 'source_expired'],
  ['stale online', { sourceReceivedAt: START - 901, observedAt: START - 901 }, 'online_expired'],
  ['future source', { sourceReceivedAt: START + 61, observedAt: START + 61, capturedAt: START + 61 }, 'report_time']
]) check('local-real report still refuses ' + label, () => {
  const { store } = setup(); refused(code, () => store.submit(A, report(intent(store), patch)), 400); assert.equal(store.inspect().receipts, 0); assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('masked counts and original source/capture times are retained', () => {
  const { store } = setup(); const created = intent(store); store.submit(A, report(created, { reportedCharacters: 'few', reportedOnline: null, observedAt: START - 10, sourceReceivedAt: START - 20 }));
  assert.equal(row(store).reportedCharacters, 'few'); assert.equal(row(store).reportedOnline, null); assert.equal(row(store).observedAt, START - 10); assert.equal(row(store).sourceReceivedAt, START - 20); assert.equal(row(store).expiresAt, START - 20 + 86400); store.close();
});
check('withdrawal clears real-local payload without affecting another independent receipt', () => {
  const { store } = setup(); const a = store.submit(A, report(intent(store))), b = store.submit(B, report(intent(store, B)));
  assert.equal(store.withdraw(A, a.receiptId).state, 'withdrawn'); assert.equal(row(store).state, 'reported'); assert.equal(store.receipt(B, b.receiptId).state, 'accepted');
  store.withdraw(B, b.receiptId); assert.equal(row(store).state, 'unavailable'); assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('conflicting real-local reports stay unavailable rather than being added', () => {
  const { store } = setup(); store.submit(A, report(intent(store))); store.submit(B, report(intent(store, B), { reportedCharacters: 150, reportedOnline: 25 }));
  assert.equal(row(store).state, 'conflicted'); assert.equal(row(store).reportedCharacters, null); assert.equal(row(store).reportedOnline, null); store.close();
});
check('unchanged real-local online and hard source expiry clear projected counts', () => {
  const { store, time } = setup(); store.submit(A, report(intent(store))); time(START + 901); assert.equal(row(store).reportedOnline, null); assert.equal(row(store).reportedCharacters, 100);
  time(START + 86400); store.cleanup(); assert.equal(row(store).state, 'unavailable'); assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('local-real admission holds and session rotation still prevent access', () => {
  const { store } = setup(); const created = intent(store); store.setAccount(A.accountId, { held: true }); refused('native_hold', () => store.submit(A, report(created)), 423);
  store.setAccount(A.accountId, { held: false, sessionId: 'new-session' }); refused('stale_context', () => store.outcome(A, created.intent), 401); store.close();
});
check('real-local original intent expires rather than extending consent', () => {
  const { store, time } = setup(), created = intent(store); time(START + 300); refused('intent_expired', () => store.submit(A, report(created)), 409); assert.equal(store.outcome(A, created.intent).state, 'expired'); assert.equal(store.inspect().receipts, 0); store.close();
});
console.log(`${passed} passed, 0 failed`);
