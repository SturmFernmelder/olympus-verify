'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCensusStore, CensusError, FIXTURES, CONSENT_VERSION, FORMAT, parseStrictJSON } = require('../core.cjs');
let passed = 0;
function check(label, operation) { operation(); passed++; console.log('PASS ' + label); }
function error(code, operation, status) { assert.throws(operation, value => value instanceof CensusError && value.code === code && (status === undefined || value.status === status)); }
const A = FIXTURES.reporterA, B = FIXTURES.reporterB, R = FIXTURES.reader, START = 1792497600;
function setup() { let time = START; const store = createCensusStore({ now: () => time }); return { store, time: value => { time = value; } }; }
function intent(store, ctx = A, guildKey = 'guild-oak') { return store.createIntent(ctx, { guildKey, consentVersion: CONSENT_VERSION }); }
function report(created, patch = {}) { return { format: FORMAT, intent: created.intent, source: 'unverified-volunteer-client', sourceVerified: false, membershipProof: false, guildKey: created.guildKey, addonVersion: '0.1.0', observedAt: START, sourceReceivedAt: START, capturedAt: START, completeRosterClaimed: true, reportedCharacters: 100, reportedOnline: 20, ...patch }; }
const bytes = value => Buffer.from(JSON.stringify(value));
const row = (store, key = 'guild-oak') => store.summary(R).rows.find(value => value.guildKey === key);

check('strict parser preserves harmless primitives without coercion', () => {
  const result = parseStrictJSON(Buffer.from('{"a":true,"b":null,"c":42,"d":"safe"}'));
  assert.equal(Object.getPrototypeOf(result), null); assert.equal(result.a, true); assert.equal(result.b, null); assert.equal(result.c, 42); assert.equal(result.d, 'safe');
});
for (const [label, input, code] of [
  ['duplicate root keys', '{"a":1,"a":2}', 'duplicate_key'],
  ['escaped duplicate keys', '{"a":1,"\\u0061":2}', 'duplicate_key'],
  ['nested duplicates', '{"a":{"b":1,"b":2}}', 'duplicate_key'],
  ['unpaired high surrogate', '{"a":"\\ud800"}', 'invalid_unicode'],
  ['unpaired low surrogate', '{"a":"\\udc00"}', 'invalid_unicode'],
  ['overflowed exponent', '{"a":1e999}', 'invalid_json'],
  ['NaN token', '{"a":NaN}', 'invalid_json'],
  ['trailing bytes', '{"a":1}x', 'invalid_json'],
  ['UTF8 BOM', '\ufeff{}', 'invalid_json'],
  ['control character', '{"a":"\u0001"}', 'invalid_json'],
  ['trailing comma', '{"a":1,}', 'invalid_json'],
  ['leading zero', '{"a":01}', 'invalid_json'],
  ['missing colon', '{"a" 1}', 'invalid_json']
]) check('strict parser rejects ' + label, () => error(code, () => parseStrictJSON(Buffer.from(input)), 400));
check('strict parser rejects invalid UTF8 rather than replacing bytes', () => error('invalid_utf8', () => parseStrictJSON(Buffer.from([0xc0, 0xaf])), 400));
check('strict parser accepts paired scalar Unicode and escaped quote', () => assert.equal(parseStrictJSON(Buffer.from('{"a":"\\ud83d\\ude00\\\""}')).a, '😀"'));
check('strict parser rejects nonbyte input and oversize bodies', () => { error('body_bytes_required', () => parseStrictJSON('{}'), 400); error('body_size', () => parseStrictJSON(Buffer.alloc(4097, 32)), 413); });

check('contract is private synthetic-only with three fixed sources and no viewer install', () => {
  const { store } = setup(); const contract = store.contract(R); assert.equal(contract.audience, 'private'); assert.equal(contract.syntheticOnly, true); assert.equal(contract.canReport, false); assert.deepEqual(contract.allowedGuildKeys, []); assert.equal(contract.guilds.length, 3); assert.equal(store.contract(A).canReport, true); assert.equal(row(store, 'guild-unreported').state, 'unavailable'); store.close();
});
check('anonymous reader cannot read contract summary or create intent', () => {
  const { store } = setup(); for (const call of [() => store.contract(null), () => store.summary(null), () => store.createIntent(null, {})]) error('context_required', call, 401); error('access_refused', () => intent(store, R), 403); store.close();
});
check('intent requires exact consent and closed registry scope', () => {
  const { store } = setup(); error('intent_contract', () => store.createIntent(A, { guildKey: 'guild-oak', consentVersion: 'wrong' })); error('intent_contract', () => intent(store, A, 'unregistered')); error('intent_contract', () => store.createIntent(A, { guildKey: 'guild-oak', consentVersion: CONSENT_VERSION, extra: 1 })); store.close();
});
check('random intent is bounded and pending with no count payload', () => {
  const { store } = setup(); const created = intent(store); assert.match(created.intent, /^[0-9a-f]{32}$/); assert.equal(created.expiresAt - created.issuedAt, 300); assert.equal(store.outcome(A, created.intent).state, 'pending'); assert.equal(store.inspect().contentPayloads, 0); assert.notEqual(intent(store).intent, created.intent); store.close();
});
check('exact accepted bytes recover one private receipt and do not spend attempts twice', () => {
  const { store } = setup(); const created = intent(store), raw = bytes(report(created)); const accepted = store.submit(A, raw); const counts = store.inspect();
  assert.equal(accepted.state, 'accepted'); assert.deepEqual(store.submit(A, raw), accepted); assert.deepEqual(store.inspect(), counts); assert.deepEqual(store.outcome(A, created.intent).receipt, accepted); assert.equal(accepted.reporterAccountAssociated, true); assert.equal(accepted.gameIdentityProven, false); assert.equal(store.receipt(A, accepted.receiptId).receiptId, accepted.receiptId); store.close();
});
check('lost-response recovery by original intent reveals no foreign receipt', () => {
  const { store } = setup(); const created = intent(store), accepted = store.submit(A, bytes(report(created)));
  error('outcome_unavailable', () => store.outcome(B, created.intent), 404); error('outcome_unavailable', () => store.receipt(B, accepted.receiptId), 404); error('outcome_unavailable', () => store.withdraw(B, accepted.receiptId), 404); assert.equal(store.outcome(A, created.intent).state, 'accepted'); store.close();
});
check('changed reuse of original intent refuses bytes rather than adopting a report', () => {
  const { store } = setup(); const created = intent(store), original = bytes(report(created)); const accepted = store.submit(A, original); error('intent_reused', () => store.submit(A, bytes(report(created, { reportedOnline: 21 }))), 409); error('intent_reused', () => store.submit(A, Buffer.from(' ' + original.toString())), 409); assert.equal(store.receipt(A, accepted.receiptId).state, 'accepted'); store.close();
});
for (const [label, patch, code] of [
  ['unknown personal field', { discordId: 'synthetic' }, 'report_shape'],
  ['missing field', { capturedAt: undefined }, 'report_shape'],
  ['claimed verified source', { sourceVerified: true }, 'report_contract'],
  ['claimed membership proof', { membershipProof: true }, 'report_contract'],
  ['wrong format', { format: 'OLG1' }, 'report_contract'],
  ['wrong addon', { addonVersion: 'unreviewed' }, 'report_contract'],
  ['incomplete roster', { completeRosterClaimed: false }, 'report_contract'],
  ['unregistered guild', { guildKey: 'Synthetic Oak' }, 'guild_scope'],
  ['zero guild size', { reportedCharacters: 0 }, 'member_count'],
  ['unmasked small guild', { reportedCharacters: 4 }, 'member_count'],
  ['overlarge guild', { reportedCharacters: 1001 }, 'member_count'],
  ['coerced total', { reportedCharacters: '100' }, 'member_count'],
  ['small total online', { reportedCharacters: 'few', reportedOnline: 'few' }, 'small_total'],
  ['unmasked small online', { reportedOnline: 4 }, 'online_count'],
  ['online above size', { reportedOnline: 101 }, 'online_count'],
  ['small complement', { reportedOnline: 98 }, 'small_complement'],
  ['fractional time', { capturedAt: START + 0.1 }, 'report_time'],
  ['negative time', { sourceReceivedAt: -1 }, 'report_time'],
  ['future time beyond bound', { capturedAt: START + 61 }, 'report_time'],
  ['unordered source time', { sourceReceivedAt: START + 1 }, 'report_time'],
  ['expired total', { sourceReceivedAt: START - 86400, observedAt: START - 86400, reportedOnline: null }, 'source_expired'],
  ['stale online', { sourceReceivedAt: START - 901, observedAt: START - 901 }, 'online_expired']
]) check('closed report rejects ' + label, () => {
  const { store } = setup(); const created = intent(store); error(code, () => store.submit(A, bytes(report(created, patch))), 400); assert.equal(store.inspect().receipts, 0); assert.equal(store.inspect().contentPayloads, 0); assert.equal(store.inspect().attempts, 1); store.close();
});
check('intent is bound to original session incarnation account and guild', () => {
  const { store } = setup(); const created = intent(store); error('intent_unavailable', () => store.submit(B, bytes(report(created))), 404); error('intent_binding', () => store.submit(A, bytes(report(created, { guildKey: 'guild-pine' }))), 409); assert.equal(store.inspect().receipts, 0); store.close();
});
for (const [label, patch] of [
  ['small guild with unavailable online', { reportedCharacters: 'few', reportedOnline: null }],
  ['masked online', { reportedOnline: 'few' }],
  ['genuine zero online', { reportedOnline: 0 }],
  ['explicit unavailable online', { reportedOnline: null }],
  ['exact full guild', { reportedCharacters: 1000, reportedOnline: 1000 }],
  ['exact five offline complement', { reportedCharacters: 100, reportedOnline: 95 }],
  ['source exactly900seconds old', { observedAt: START - 900, sourceReceivedAt: START - 900 }]
]) check('closed report accepts ' + label + ' without coercion or suppression recovery', () => {
  const { store } = setup(); const current = report(intent(store), patch); store.submit(A, bytes(current)); const projected = row(store); assert.equal(projected.reportedCharacters, current.reportedCharacters); assert.equal(projected.reportedOnline, current.reportedOnline); store.close();
});
check('equal source content deduplicates but each reporter owns a distinct receipt', () => {
  const { store } = setup(); const a = store.submit(A, bytes(report(intent(store, A)))), b = store.submit(B, bytes(report(intent(store, B))));
  assert.notEqual(a.receiptId, b.receiptId); assert.notEqual(a.intent, b.intent); assert.equal(store.inspect().contents, 1); assert.equal(store.inspect().receipts, 2); assert.equal(row(store).state, 'reported'); assert.equal(row(store).reportedCharacters, 100); assert.equal(row(store).expiresAt, a.expiresAt); assert.equal(Object.hasOwn(row(store), 'reporterCount'), false); assert.equal(JSON.stringify(store.summary(R)).includes('reporter-a'), false); store.close();
});
check('withdrawing own equal contribution cannot remove another reporter consent', () => {
  const { store } = setup(); const a = store.submit(A, bytes(report(intent(store, A)))), b = store.submit(B, bytes(report(intent(store, B)))); store.withdraw(A, a.receiptId); assert.equal(row(store).state, 'reported'); assert.equal(store.receipt(B, b.receiptId).state, 'accepted'); assert.equal(store.receipt(A, a.receiptId).state, 'withdrawn'); store.withdraw(B, b.receiptId); assert.equal(row(store).state, 'unavailable'); assert.equal(store.inspect().contentPayloads, 0); assert.equal(store.inspect().contents, 1); store.close();
});
check('own withdrawn retry returns withdrawn outcome without restoring counts', () => {
  const { store } = setup(); const created = intent(store), raw = bytes(report(created)); const a = store.submit(A, raw); store.withdraw(A, a.receiptId); assert.equal(store.submit(A, raw).state, 'withdrawn'); assert.equal(row(store).state, 'unavailable'); assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('conflicting current content withholds every count and no reporter identity', () => {
  const { store } = setup(); store.submit(A, bytes(report(intent(store, A)))); const b = store.submit(B, bytes(report(intent(store, B), { reportedCharacters: 110 })));
  const current = row(store); assert.equal(current.state, 'conflicted'); assert.equal(current.reportedCharacters, null); assert.equal(current.reportedOnline, null); assert.equal(current.observedAt, null); assert.equal(current.sourceReceivedAt, null); assert.equal(current.expiresAt, START + 86400); const projected = JSON.stringify(store.summary(R)); assert.equal(projected.includes('110'), false); assert.equal(projected.includes('content_digest'), false); assert.equal(projected.includes('receiptId'), false); store.withdraw(B, b.receiptId); assert.equal(row(store).reportedCharacters, 100); store.close();
});
check('latest per account guild replaces own contribution without affecting another guild', () => {
  const { store, time } = setup(); const a = store.submit(A, bytes(report(intent(store)))); store.submit(A, bytes(report(intent(store, A, 'guild-pine'), { reportedCharacters: 80 })));
  time(START + 300); const next = store.submit(A, bytes(report(intent(store), { observedAt: START + 300, sourceReceivedAt: START + 300, capturedAt: START + 300, reportedCharacters: 120 })));
  assert.equal(store.receipt(A, a.receiptId).state, 'superseded'); assert.equal(store.receipt(A, next.receiptId).state, 'accepted'); assert.equal(row(store).reportedCharacters, 120); assert.equal(row(store, 'guild-pine').reportedCharacters, 80); store.close();
});
check('acceptance interval includes withdrawn and superseded records and opens at exact300', () => {
  const { store, time } = setup(); const a = store.submit(A, bytes(report(intent(store)))); store.withdraw(A, a.receiptId); time(START + 299); const created = intent(store); error('accepted_interval', () => store.submit(A, bytes(report(created))), 429); time(START + 300); assert.equal(store.submit(A, bytes(report(created))).state, 'accepted'); store.close();
});
check('twelve rejected attempts exhaust hourly budget and exact retry remains recoverable', () => {
  const { store, time } = setup(); const created = intent(store), raw = bytes(report(created)); store.submit(A, raw);
  for (let i = 0; i < 11; i++) error('invalid_json', () => store.submit(A, Buffer.from('bad')), 400);
  assert.equal(store.inspect().attempts, 12); error('attempt_limit', () => store.submit(A, Buffer.from('bad')), 429); assert.equal(store.submit(A, raw).state, 'accepted'); time(START + 3600); error('invalid_json', () => store.submit(A, Buffer.from('bad')), 400); assert.equal(store.inspect().attempts, 1); store.close();
});
check('unconsumed intent expires exactly at300 and cannot be adopted', () => {
  const { store, time } = setup(); const created = intent(store); time(START + 300); assert.equal(store.outcome(A, created.intent).state, 'expired'); error('intent_expired', () => store.submit(A, bytes(report(created))), 409); assert.equal(store.inspect().receipts, 0); store.close();
});
check('online remains at exact900 and disappears at901 without a new receipt', () => {
  const { store, time } = setup(); const a = store.submit(A, bytes(report(intent(store)))); time(START + 900); assert.equal(row(store).reportedOnline, 20); time(START + 901); assert.equal(row(store).reportedOnline, null); assert.equal(row(store).reportedCharacters, 100); assert.equal(store.receipt(A, a.receiptId).receivedAt, START); store.close();
});
check('future bound60 accepted but content expiry anchored original receipt', () => {
  const { store } = setup(); const a = store.submit(A, bytes(report(intent(store), { observedAt: START + 60, sourceReceivedAt: START + 60, capturedAt: START + 60 }))); assert.equal(a.expiresAt, START + 86400); store.close();
});
check('accepted near-future source stays unavailable until observed time rather than claiming future presence', () => {
  const { store, time } = setup(); store.submit(A, bytes(report(intent(store), { observedAt: START + 60, sourceReceivedAt: START + 60, capturedAt: START + 60 }))); assert.equal(row(store).state, 'unavailable'); time(START + 59); assert.equal(row(store).state, 'unavailable'); time(START + 60); assert.equal(row(store).reportedCharacters, 100); store.close();
});
check('read-time exclusive hard expiry hides content even before cleanup runs', () => {
  const { store, time } = setup(); const a = store.submit(A, bytes(report(intent(store), { sourceReceivedAt: START - 1, observedAt: START - 1 }))); time(START + 86398); assert.equal(row(store).state, 'reported'); time(START + 86399); assert.equal(row(store).state, 'unavailable'); assert.equal(store.receipt(A, a.receiptId).state, 'expired'); assert.equal(store.inspect().contentPayloads, 1); store.cleanup(); assert.equal(store.inspect().contentPayloads, 0); store.close();
});
check('second receipt never extends original first-receipt content deadline', () => {
  const { store, time } = setup(); const patch = { observedAt: START + 60, sourceReceivedAt: START + 60, capturedAt: START + 60 }; const a = store.submit(A, bytes(report(intent(store, A), patch)));
  time(START + 30); const b = store.submit(B, bytes(report(intent(store, B), patch))); assert.equal(a.expiresAt, b.expiresAt); assert.equal(b.receivedAt, START + 30); time(START + 86400); assert.equal(row(store).state, 'unavailable'); assert.equal(store.receipt(B, b.receiptId).state, 'expired'); store.close();
});
check('count-free tombstone bounds reintroduction after all contributions withdraw', () => {
  const { store, time } = setup(); const patch = { observedAt: START + 60, sourceReceivedAt: START + 60, capturedAt: START + 60 }; const a = store.submit(A, bytes(report(intent(store, A), patch))); store.withdraw(A, a.receiptId); assert.equal(store.inspect().contentPayloads, 0); time(START + 30); const b = store.submit(B, bytes(report(intent(store, B), patch))); assert.equal(b.expiresAt, a.expiresAt); assert.equal(store.receipt(A, a.receiptId).state, 'withdrawn'); assert.equal(row(store).state, 'unavailable'); time(START + 60); assert.equal(row(store).state, 'reported'); store.close();
});
check('cleanup cannot resurrect a future-admitted content group after its original first-receipt expiry', () => {
  const { store, time } = setup(); const patch = { observedAt: START + 60, sourceReceivedAt: START + 60, capturedAt: START + 60, reportedOnline: null }; const a = store.submit(A, bytes(report(intent(store, A), patch))); time(a.expiresAt + 1); store.cleanup(); assert.equal(store.inspect().contentPayloads, 0); assert.equal(row(store).state, 'unavailable'); error('content_expired', () => store.submit(B, bytes(report(intent(store, B), patch))), 409); time(START + 86460); store.cleanup(); assert.equal(store.inspect().contents, 0); store.close();
});
for (const [label, patch, code] of [
  ['Native hold', { held: true }, 'native_hold'],
  ['read revocation', { canRead: false }, 'access_refused'],
  ['session rotation', { sessionId: 'session-new' }, 'stale_context'],
  ['incarnation rotation', { incarnation: 'native-new' }, 'stale_context']
]) check('fresh fence refuses ' + label + ' and excludes old contribution', () => {
  const { store } = setup(); const created = intent(store), a = store.submit(A, bytes(report(created))); store.setAccount(A.accountId, patch);
  for (const operation of [() => store.contract(A), () => store.createIntent(A, { guildKey: 'guild-pine', consentVersion: CONSENT_VERSION }), () => store.submit(A, bytes(report(created))), () => store.outcome(A, created.intent), () => store.receipt(A, a.receiptId), () => store.withdraw(A, a.receiptId)]) error(code, operation);
  assert.equal(row(store).state, 'unavailable'); store.close();
});
check('report revocation blocks writes while preserving admitted own outcome read', () => {
  const { store } = setup(); const created = intent(store), a = store.submit(A, bytes(report(created))); store.setAccount(A.accountId, { canReport: false }); error('access_refused', () => store.submit(A, bytes(report(created))), 403); error('access_refused', () => intent(store)); assert.equal(store.receipt(A, a.receiptId).state, 'accepted'); assert.equal(row(store).state, 'unavailable'); store.close();
});
check('write rechecks context inside transaction rather than trusting preflight tuple', () => {
  const { store } = setup(); let reads = 0; const changing = { accountId: A.accountId, get sessionId() { return ++reads <= 2 ? A.sessionId : 'session-changed'; }, incarnation: A.incarnation };
  error('stale_context', () => store.createIntent(changing, { guildKey: 'guild-oak', consentVersion: CONSENT_VERSION }), 401); assert.equal(store.inspect().intents, 0); store.close();
});
check('erasure removes own receipts intents and attempts without deleting others', () => {
  const { store } = setup(); const a = store.submit(A, bytes(report(intent(store, A)))), b = store.submit(B, bytes(report(intent(store, B)))); store.eraseAccount(A.accountId); error('stale_context', () => store.receipt(A, a.receiptId)); error('fixture_erased', () => store.setAccount(A.accountId, { held: false })); assert.equal(store.receipt(B, b.receiptId).state, 'accepted'); assert.equal(row(store).state, 'reported'); assert.equal(store.inspect().receipts, 1); store.eraseAccount(B.accountId); assert.equal(store.inspect().receipts, 0); assert.equal(store.inspect().intents, 0); assert.equal(store.inspect().attempts, 0); assert.equal(store.inspect().contentPayloads, 0); assert.equal(row(store).state, 'unavailable'); store.close();
});
check('cleanup removes expired outcomes and report payloads at finite retention', () => {
  const { store, time } = setup(); const created = intent(store), a = store.submit(A, bytes(report(created))); time(START + 86400); store.cleanup(); assert.equal(store.inspect().intents, 0); assert.equal(store.inspect().receipts, 0); assert.equal(store.inspect().contents, 0); assert.equal(store.inspect().attempts, 0); error('outcome_unavailable', () => store.outcome(A, created.intent)); error('outcome_unavailable', () => store.receipt(A, a.receiptId)); store.close();
});
check('clock rollback and invalid clock fail closed', () => {
  const { store, time } = setup(); store.contract(A); time(START - 1); error('clock_rollback', () => store.summary(R), 503); store.close(); const bad = createCensusStore({ now: () => NaN }); error('clock_invalid', () => bad.contract(A), 503); bad.close();
});
check('inspect is count-only and close is idempotent', () => {
  const { store } = setup(); store.submit(A, bytes(report(intent(store)))); assert.deepEqual(Object.keys(store.inspect()).sort(), ['accounts', 'attempts', 'contentPayloads', 'contents', 'intents', 'receipts']); assert.ok(Object.values(store.inspect()).every(Number.isSafeInteger)); store.close(); store.close(); error('store_closed', () => store.inspect(), 503);
});
check('core uses only in-memory sqlite and no filesystem provider or game APIs', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../core.cjs'), 'utf8'); assert.equal((source.match(/new DatabaseSync\(':memory:'\)/g) || []).length, 1); assert.doesNotMatch(source, /require\(['"](?:node:)?(?:fs|http|https|net|child_process)['"]\)|\bfetch\s*\(/); assert.ok(Object.isFrozen(FIXTURES));
});
console.log('\n' + passed + '/' + passed + ' synthetic census domain checks passed');
