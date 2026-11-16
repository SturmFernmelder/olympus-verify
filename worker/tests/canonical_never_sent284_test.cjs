/* Product audit facts: Node SQLite data matrix, then Python depth-100 prepare.
 * Neither check is Native writer acceptance; no provider or writer capability. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { buildSync } = require('esbuild');
const worker = path.resolve(__dirname, '..');
const entry = [
  "export {canonicalNeverSentDeleteAuditFacts284} from './src/role-settlements.ts';",
  "export {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233,NATIVE_CANONICAL_INDEX233} from './src/canonical-ranks233.ts';",
  "export {NATIVE_RANK_PROFILE232,NATIVE_RANK_NAMES232} from './src/native-rank-reconciliation232.ts';",
  "export {NATIVE_RANK_SCHEMES} from './src/native-rank-constants.ts';",
  "export {CANONICAL_MIGRATION_PROFILE233} from './src/canonical-migration233.ts';",
].join('\n');
const output = buildSync({ stdin: { contents: entry, resolveDir: worker, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022', logLevel: 'silent' });
const module284 = { exports: {} };
new Function('module', 'exports', 'require', output.outputFiles[0].text)(module284, module284.exports, require);
const m = module284.exports, db = new DatabaseSync(':memory:');
const schemaSQL = fs.readFileSync(path.join(worker, 'schema.sql'), 'utf8');
db.exec(schemaSQL);
const clock = Number(db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS n").get().n);
const subject = '300000000000000021', generation = 'f'.repeat(32), parentId = 'a'.repeat(32), childId = 'b'.repeat(32), guid = 'Player-4613-0ABCDEF1';
const role = m.CANONICAL_RANKS233[m.NATIVE_CANONICAL_INDEX233[3]].roleId;
const columns = ['id', 'subject', 'purpose', 'proof_id', 'guild_id', 'role_id', 'desired', 'state', 'reason', 'claim_nonce', 'subject_generation', 'request_digest', 'roster_id', 'native_guid', 'native_profile', 'native_rank', 'native_rank_name', 'attempts', 'created_at', 'expires_at', 'checked_at'];
const insert = db.prepare(`INSERT INTO role_settlements(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
const put = row => insert.run(...columns.map(k => row[k]));
const parent = () => ({ id: parentId, subject, purpose: 'canonical_routine233', proof_id: null, guild_id: m.CANONICAL_GUILD233, role_id: role, desired: 1, state: 'settled', reason: 'canonical233_put_acknowledged_and_confirmed', claim_nonce: 'c'.repeat(32), subject_generation: generation, request_digest: 'd'.repeat(64), roster_id: 1, native_guid: guid, native_profile: m.CANONICAL_PROFILE233, native_rank: 3, native_rank_name: m.NATIVE_RANK_NAMES232[3], attempts: 1, created_at: clock - 240, expires_at: clock + 60, checked_at: clock - 239 });
const child = () => ({ id: childId, subject, purpose: 'canonical_routine233', proof_id: null, guild_id: m.CANONICAL_GUILD233, role_id: role, desired: 0, state: 'held', reason: 'canonical233_never_dispatched', claim_nonce: 'e'.repeat(32), subject_generation: generation, request_digest: parentId, roster_id: 2, native_guid: guid, native_profile: m.CANONICAL_PROFILE233, native_rank: 2, native_rank_name: m.NATIVE_RANK_NAMES232[2], attempts: 1, created_at: clock - 150, expires_at: clock + 150, checked_at: clock - 29 });
const auditQuery = `WITH ${m.canonicalNeverSentDeleteAuditFacts284()} SELECT CASE WHEN EXISTS(SELECT 1 FROM audit_no_effect284 n WHERE n.receipt_row=original_r.rowid) THEN 1 ELSE 0 END AS no_effect FROM role_settlements original_r WHERE original_r.id=?4`;
const observeAudit = db.prepare(auditQuery);
let passed = 0;
function check(name, expected, change = () => {}) {
  db.exec('BEGIN');
  try {
    const p = parent(), c = child(); change(p, c);
    db.prepare('INSERT INTO members(discord_id) VALUES(?)').run(subject);
    db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?,?,?,?,?,?)').run('fixture', 'Fixture', subject, 'member', clock - 1000, guid);
    put(p); put(c);
    const before = JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all());
    assert.equal(observeAudit.get(JSON.stringify([c.subject]), c.guild_id, JSON.stringify([c.role_id]), c.id).no_effect, expected ? 1 : 0, name + ': product read-only audit facts');
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM role_settlements ORDER BY id').all()), before, name + ': original receipts changed');
    passed++;
  } finally { db.exec('ROLLBACK'); }
}
check('v1: real final-read reply after original 120-second preview; no physical dispatch', true);
for (const scheme of m.NATIVE_RANK_SCHEMES) {
  check('exact reviewed child profile ' + scheme.canonicalProfile + ' retains older v1 ACK provenance', true, (_, c) => { c.native_profile = scheme.canonicalProfile; c.native_rank_name = scheme.names[c.native_rank]; });
  check('wrong native name for reviewed child profile ' + scheme.canonicalProfile, false, (_, c) => { c.native_profile = scheme.canonicalProfile; c.native_rank_name = 'Not a native rank'; });
}
check('genuine no-send receipt may be recorded after native claim expiry too', true, (_, c) => { c.expires_at = c.created_at + 100; });
check('independent cleanup source has deliberate all-null native primary', true, (_, c) => { c.native_guid = c.native_rank = c.native_rank_name = null; });
check('retained consumed physical ACK is an original parent', true, p => { p.purpose = 'canonical_consumed233'; });
check('strict migration physical ACK parent', true, p => { p.purpose = 'canonical_migration233'; p.native_profile = m.CANONICAL_MIGRATION_PROFILE233; p.reason = 'canonical233_migration_put_acknowledged_and_confirmed'; p.roster_id = p.native_guid = p.native_rank = p.native_rank_name = null; });
check('strict native physical ACK parent with bound original GUID', true, p => { p.purpose = 'staff_roster_rank'; p.native_profile = m.NATIVE_RANK_PROFILE232; p.reason = 'native232_put_acknowledged_and_confirmed'; });
check('old shared-member physical ACK parent', true, (p, c) => { p.role_id = c.role_id = m.CANONICAL_RANKS233[9].roleId; p.purpose = 'launch_membership230'; p.native_profile = 'prime-native-230'; p.reason = 'launch230_put_acknowledged_and_confirmed'; p.native_rank = p.native_rank_name = null; });
const childNegatives = {
  'short child id': { id: 'b'.repeat(31) }, 'uppercase child id': { id: 'B'.repeat(32) },
  'missing nonce': { claim_nonce: null }, 'short nonce': { claim_nonce: 'e'.repeat(31) }, 'uppercase nonce': { claim_nonce: 'E'.repeat(32) }, 'NUL nonce': { claim_nonce: 'e'.repeat(31) + '\0' },
  'unknown profile': { native_profile: 'unreviewed-profile' }, 'wrong purpose': { purpose: 'canonical_consumed233' }, 'wrong reason': { reason: 'native232_provider_outcome_unknown' },
  'unknown state': { state: 'unknown' }, 'dispatching state': { state: 'dispatching' }, 'settled DELETE ACK': { state: 'settled', reason: 'canonical233_delete_acknowledged_and_confirmed' },
  'unclaimed pending': { state: 'pending', attempts: 0 }, 'unattempted held': { attempts: 0 }, 'PUT instead of DELETE': { desired: 1 }, 'unexpected proof': { proof_id: '1'.repeat(32) },
  'parent digest missing': { request_digest: null }, 'parent digest too long': { request_digest: parentId + 'a' }, 'parent digest not hex': { request_digest: 'x'.repeat(32) }, 'parent absent': { request_digest: '2'.repeat(32) }, 'self parent': { request_digest: childId },
  'foreign subject': { subject: '300000000000000022' }, 'foreign guild': { guild_id: '300000000000000023' }, 'foreign generation': { subject_generation: '3'.repeat(32) }, 'different role': { role_id: m.CANONICAL_RANKS233[1].roleId },
  'invalid subject': { subject: 'not-a-discord-user' }, 'invalid generation': { subject_generation: 'bad' }, 'zero birth': { created_at: 0 }, 'future check': { checked_at: clock + 3600 }, 'check before birth': { checked_at: clock - 151 },
  'oversized original expiry': { expires_at: clock + 151 }, 'expiry before birth': { expires_at: clock - 151 }, 'missing checked timestamp': { checked_at: null }, 'missing roster': { roster_id: null }, 'missing GUID alone': { native_guid: null },
  'wrong native name': { native_rank_name: 'Steward' }, 'out of range native rank': { native_rank: 10 }, 'NUL GUID': { native_guid: guid + '\0' }, 'non-ASCII GUID': { native_guid: 'Player-4613-äBCD' },
  'bad GUID prefix': { native_guid: 'Creature-4613-0ABCDEF1' }, 'bad GUID realm': { native_guid: 'Player-hello-0ABCDEF1' }, 'bad GUID identifier': { native_guid: 'Player-4613-nothex' },
};
for (const [name, edits] of Object.entries(childNegatives)) check(name, false, (_, c) => Object.assign(c, edits));
const parentNegatives = {
  'parent observed present only': { attempts: 0, claim_nonce: null, reason: 'canonical233_observed_without_dispatch' }, 'parent unknown physical outcome': { state: 'unknown', reason: 'native232_provider_outcome_unknown' },
  'parent never dispatched': { state: 'held', reason: 'canonical233_never_dispatched' }, 'parent DELETE ACK': { desired: 0, reason: 'canonical233_delete_acknowledged_and_confirmed' },
  'parent wrong purpose': { purpose: 'arbitrary_purpose' }, 'parent unknown profile': { native_profile: 'unreviewed-profile' }, 'parent nonce absent': { claim_nonce: null }, 'parent digest malformed': { request_digest: 'd'.repeat(63) },
  'parent native role not source mapped': { native_rank: 8, native_rank_name: 'Member' }, 'parent source name wrong': { native_rank_name: 'Steward' },
  'parent ACK after expiry': { checked_at: clock + 61 }, 'parent ACK after child birth': { checked_at: clock - 149 },
};
for (const [name, edits] of Object.entries(parentNegatives)) check(name, false, p => Object.assign(p, edits));
check('null generation agrees only with null parent', true, (p, c) => { p.subject_generation = c.subject_generation = null; });
check('copied current generation does not match historical null parent', false, p => { p.subject_generation = null; });
assert.equal(passed, 67, 'all original audit data cases remain covered');
db.close();

// Compile the exact same query against the actual schema at D1's depth limit.
// EXPLAIN emits bytecode only: no receipt, claim or other business SQL is stepped.
const python = [
  'import hashlib, json, sqlite3, sys',
  'payload = json.load(sys.stdin)',
  'db = sqlite3.connect(":memory:", cached_statements=0)',
  'try:',
  '    db.executescript(payload["schemaSQL"])',
  '    db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, 100)',
  '    assert db.getlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH) == 100',
  '    program = db.execute("EXPLAIN " + payload["sql"], payload["params"]).fetchall()',
  '    assert len(program) > 0',
  '    print(json.dumps({"check": "product-audit-explain-only", "expressionDepth": 100, "cachedStatements": 0, "queryExecuted": False, "sqlSHA256": hashlib.sha256(payload["sql"].encode("utf-8")).hexdigest(), "sqlBytes": len(payload["sql"].encode("utf-8")), "parameters": len(payload["params"])}))',
  'finally:',
  '    db.close()',
].join('\n');
const prepareInput = JSON.stringify({ schemaSQL, sql: auditQuery, params: [JSON.stringify([subject]), m.CANONICAL_GUILD233, JSON.stringify([role]), childId] });
let prepared, interpreter;
for (const executable of ['python', 'python3']) {
  const run = cp.spawnSync(executable, ['-c', python], { input: prepareInput, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 2e6 });
  if (run.error?.code === 'ENOENT') continue;
  assert.ifError(run.error);
  assert.equal(run.signal, null, 'Python EXPLAIN-only prepare was interrupted');
  assert.equal(run.status, 0, 'Python depth-100 EXPLAIN-only prepare failed: ' + run.stderr);
  prepared = JSON.parse(run.stdout); interpreter = executable; break;
}
assert(prepared, 'an existing Python interpreter with SQLite setlimit is required');
assert.equal(prepared.check, 'product-audit-explain-only');
assert.equal(prepared.expressionDepth, 100);
assert.equal(prepared.cachedStatements, 0);
assert.equal(prepared.queryExecuted, false);
assert.equal(prepared.sqlSHA256, crypto.createHash('sha256').update(auditQuery).digest('hex'));
assert.equal(prepared.sqlBytes, Buffer.byteLength(auditQuery));
assert.equal(prepared.parameters, 4);
console.log(JSON.stringify({ result: 'PASS', nodeSqliteDataMatrixCases: passed, pythonDepth100Prepare: { ...prepared, interpreter }, providerCalls: 0, writerNativeAcceptance: false, nodeInterpreter: process.version }));
