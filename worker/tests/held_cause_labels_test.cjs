'use strict';
// 14 Nov 2026 (the refused reload, design SYNC503 sections 2.1 and 2.7): the closed labels of src/log.ts, through the
// REAL source transpiled by TypeScript. heldCause, elapsedClass, routeClass and the sampled proof-cost line must only
// ever return members of their fixed lists, must never throw, and must never return any text of the error or the path.
// Run from the worker folder:  node tests/held_cause_labels_test.cjs
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(name, own = {}) {
  if (name === 'node:async_hooks') return require(name);
  const file = path.join(root, 'src', name.replace(/^\.\//, '') + '.ts');
  if (own[file]) return own[file].exports;
  const mod = { exports: {} };
  own[file] = mod;
  new Function('module', 'exports', 'require', transpile(file))(mod, mod.exports, (p) => load(p, own));
  return mod.exports;
}
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + (detail ? '\n    ' + detail : '')); } };

const L = load('./log');
const LABELS = new Set(L.HELD_CAUSES), ROUTES = new Set(L.ROUTE_CLASSES);
const ELAPSED = new Set(['under_100ms', 'under_500ms', 'under_2s', '2s_or_more', 'unknown']);
const SECRETS = ['Tag#1234', 'abc.def.ghi', '300000000000000093', 'site_users', 'SELECT', 'token=', 'K7Q2M9'];
const leaks = (value) => typeof value !== 'string' || SECRETS.some((s) => value.includes(s));

console.log('\n== the closed lists themselves ==');
check('every held label is a fixed lower-case word, optionally admission:<reason>', L.HELD_CAUSES.every((x) => /^[a-z_]+(?::[a-z0-9_]+)?$/.test(x)) && L.HELD_CAUSES.length === 12 + L.ADMISSION_REASONS.length && LABELS.size === L.HELD_CAUSES.length);
check('every route class is a fixed lower-case word', L.ROUTE_CLASSES.every((x) => /^[a-z_]+$/.test(x)) && ROUTES.has('page') && ROUTES.has('other'));
check('the lists are frozen', Object.isFrozen(L.HELD_CAUSES) && Object.isFrozen(L.ADMISSION_REASONS) && Object.isFrozen(L.ROUTE_CLASSES));
const logSource = fs.readFileSync(path.join(root, 'src', 'log.ts'), 'utf8');
check('log.ts imports nothing', !/^\s*import\b/m.test(logSource) && !/\brequire\s*\(/.test(logSource) && !/\bimport\s*\(/.test(logSource));

console.log('\n== the admission allow-list against the reason literals of privacy-write-admission.ts ==');
// Every construction must pass one closed literal; a non-literal (a variable, a template, a concatenation) fails.
function scanAdmissionReasons(source) {
  const marker = 'new PrivacyWriteAdmissionHeld(', literals = new Set(), nonLiteral = [];
  for (let i = source.indexOf(marker); i >= 0; i = source.indexOf(marker, i + 1)) {
    const rest = source.slice(i + marker.length, i + marker.length + 120), m = /^'([a-z0-9_]+)'\)/.exec(rest);
    if (m) literals.add(m[1]); else nonLiteral.push(rest.slice(0, 40));
  }
  return { literals, nonLiteral };
}
function allowListProblems(source, allow) {
  const { literals, nonLiteral } = scanAdmissionReasons(source), set = new Set(allow);
  return { missing: [...literals].filter((r) => !set.has(r)), stale: allow.filter((r) => !literals.has(r)), nonLiteral, count: literals.size };
}
const admissionSource = fs.readFileSync(path.join(root, 'src', 'privacy-write-admission.ts'), 'utf8');
const real = allowListProblems(admissionSource, L.ADMISSION_REASONS);
check('every reason literal of privacy-write-admission.ts is in the allow-list, and nothing else is', real.missing.length === 0 && real.stale.length === 0 && real.count === L.ADMISSION_REASONS.length, JSON.stringify(real));
check('every PrivacyWriteAdmissionHeld construction in privacy-write-admission.ts passes a closed literal', real.nonLiteral.length === 0, real.nonLiteral.join(' | '));
const added = allowListProblems(admissionSource + "\nthrow new PrivacyWriteAdmissionHeld('a_new_reason_nobody_listed');", L.ADMISSION_REASONS);
check('  the scan fails when a literal is missing from the allow-list', added.missing.length === 1 && added.missing[0] === 'a_new_reason_nobody_listed');
const variable = allowListProblems(admissionSource + '\nthrow new PrivacyWriteAdmissionHeld(reason);\nthrow new PrivacyWriteAdmissionHeld(`x_${y}`);', L.ADMISSION_REASONS);
check('  the scan fails when a call passes a non-literal', variable.nonLiteral.length === 2);

console.log('\n== heldCause: the documented D1 messages, word for word ==');
// Cloudflare's documented texts as recorded in the groundwork of 14 Nov 2026 (d1-classes reader), not seen in this
// project's production log. Each is tested raw, with the D1_ERROR prefix, in workerd's wrapped form (message plus
// cause) and as the cause only.
const DOCUMENTED = [
  ['D1 DB reset because its code was updated.', 'storage_reset'],
  ['Internal error while starting up D1 DB storage caused object to be reset.', 'storage_reset'],
  ['Internal error in D1 DB storage caused object to be reset.', 'storage_reset'],
  ['Network connection lost.', 'storage_network'],
  ['Replica disconnected from primary.', 'storage_transient'],
  ['Cannot resolve D1 DB due to transient issue on remote node.', 'storage_transient'],
  ["Can't read from request stream because client disconnected.", 'storage_transient'],
  ['D1 DB is overloaded. Requests queued for too long.', 'storage_overloaded'],
  ['D1 DB is overloaded. Too many requests queued.', 'storage_overloaded'],
  ['D1 DB is overloaded. Too many resources consumed within a 10 second window', 'storage_overloaded'],
  ["D1 DB's isolate exceeded its memory limit and was reset.", 'storage_limit'],
  ['D1 DB exceeded its CPU time limit and was reset.', 'storage_limit'],
  ['D1 DB storage operation exceeded timeout which caused object to be reset.', 'storage_limit'],
  ["Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan", 'storage_limit'],
  ["Your account has exceeded D1's maximum account storage limit, please contact Cloudflare", 'storage_limit'],
  ['Exceeded maximum DB size.', 'storage_limit'],
  ['D1 query result exceeded the maximum response size limit of 50 MB', 'storage_limit'],
];
for (const [text, label] of DOCUMENTED) {
  const forms = [new Error(text), new Error('D1_ERROR: ' + text), new Error('D1_ERROR: ' + text, { cause: new Error(text) }), new Error('wrapped', { cause: new Error(text) })];
  const got = forms.map((e) => L.heldCause(e));
  check(label + ': ' + text, got.every((x) => x === label), JSON.stringify(got));
}
check('a guard or proof refusal through its JSON sentinel is sql_json_refused', L.heldCause(new Error('D1_ERROR: malformed JSON: SQLITE_ERROR')) === 'sql_json_refused' && L.heldCause(new Error('D1_ERROR: malformed JSON', { cause: new Error('malformed JSON') })) === 'sql_json_refused');
check('any other D1_ message is storage_other, its text dropped', L.heldCause(new Error('D1_ERROR: no such table: site_users Tag#1234')) === 'storage_other' && L.heldCause(new Error('D1_EXEC_ERROR')) === 'storage_other' && L.heldCause(new Error('D1_TYPE_ERROR: x')) === 'storage_other');
check('a D1_ prefix only on the cause does not make storage_other', L.heldCause(new Error('wrapped', { cause: new Error('D1_ERROR: x') })) === 'other');
check('anything else is other', L.heldCause(new Error('boom Tag#1234')) === 'other' && L.heldCause(new TypeError('x')) === 'other');

console.log('\n== heldCause: the held classes ==');
const A = load('./privacy-serving-authority'), W = load('./privacy-write-admission');
const Held = A.PrivacySiteRequestHeld;
const plain = new Held(), labelled = new Held('storage_reset'), bogus = new Held('Tag#1234 SELECT'), d = Object.getOwnPropertyDescriptor(labelled, 'heldCause');
check('PrivacySiteRequestHeld keeps its message and class', plain instanceof Held && plain instanceof Error && plain.message === 'privacy_site_request_held' && labelled.message === 'privacy_site_request_held' && labelled instanceof Held);
check('  heldCause is a read-only, non-enumerable own data property, default authority', d && d.value === 'storage_reset' && !d.writable && !d.enumerable && !d.configurable && plain.heldCause === 'authority' && JSON.stringify(labelled) === '{}' && Object.keys(labelled).length === 0);
check('  a value outside the closed list becomes authority', bogus.heldCause === 'authority' && new Held(undefined).heldCause === 'authority' && new Held({ toString: () => 'storage_reset' }).heldCause === 'authority');
check('  heldCause passes the own label through unchanged', L.heldCause(labelled) === 'storage_reset' && L.heldCause(new Held('admission:read_epoch_unconfirmed')) === 'admission:read_epoch_unconfirmed' && L.heldCause(new Held('shape')) === 'shape' && L.heldCause(new Held('session')) === 'session');
check('  without a label (a witness failed) it is authority', L.heldCause(plain) === 'authority' && L.heldCause(new Error('privacy_site_request_held')) === 'authority');
const getterCalls = [];
const accessor = Object.defineProperty(new Error('privacy_site_request_held'), 'heldCause', { get() { getterCalls.push(1); return 'storage_reset'; } });
const forged = Object.defineProperty(new Error('privacy_site_request_held'), 'heldCause', { value: 'Tag#1234' });
check('  an accessor is never called and an unlisted value is never returned', L.heldCause(accessor) === 'authority' && getterCalls.length === 0 && L.heldCause(forged) === 'authority');
const AdmissionHeld = W.PrivacyWriteAdmissionHeld;
check('admission:<reason> for every listed reason of the real class', L.ADMISSION_REASONS.every((r) => L.heldCause(new AdmissionHeld(r)) === 'admission:' + r));
check('  an unlisted or extended reason is admission alone, its text dropped', L.heldCause(new AdmissionHeld('pre_seal_compatibility_requires_off')) === 'admission' && L.heldCause(new AdmissionHeld('read_epoch_unconfirmed Tag#1234')) === 'admission' && L.heldCause(new AdmissionHeld('Tag#1234')) === 'admission' && L.heldCause(new AdmissionHeld('')) === 'admission');
check('session for the original session assertion', L.heldCause(new Error('original_site_session_held')) === 'session' && L.heldCause(new Error('original_site_session_held Tag#1234')) === 'other');

console.log('\n== heldCause never throws ==');
const thrower = new Proxy({}, { get() { throw Error('trap Tag#1234'); }, getOwnPropertyDescriptor() { throw Error('trap'); }, getPrototypeOf() { throw Error('trap'); }, has() { throw Error('trap'); } });
const revocable = Proxy.revocable({}, {}); revocable.revoke();
const heldProxy = new Proxy(new Error('privacy_site_request_held'), { getOwnPropertyDescriptor() { throw Error('trap'); } });
const throwsOnMessage = Object.defineProperty(new Error('x'), 'message', { get() { throw Error('getter Tag#1234'); } });
const throwsOnCause = Object.defineProperty(new Error('wrapped'), 'cause', { get() { throw Error('getter'); } });
const cyclic = new Error('wrapped'); cyclic.cause = cyclic;
const cyclicD1 = new Error('D1_ERROR: x'); const inner = new Error('Network connection lost.', { cause: cyclicD1 }); cyclicD1.cause = inner;
const frozen = Object.freeze(new Error('D1 DB is overloaded. Too many requests queued.'));
const nonString = { message: { toString() { throw Error('x'); } } };
const longHidden = new Error('x'.repeat(2048) + 'Network connection lost.'), longSeen = new Error('Network connection lost.' + 'x'.repeat(5000));
const hostile = [thrower, revocable.proxy, heldProxy, throwsOnMessage, throwsOnCause, cyclic, cyclicD1, frozen, nonString, longHidden, longSeen,
  null, undefined, 42, 10n, Symbol('Tag#1234'), 'D1_ERROR: Network connection lost.', () => {}, Object.create(null), [], { message: 'D1 DB reset because its code was updated.' }];
const results = []; let threw = null;
for (const v of hostile) { try { results.push(L.heldCause(v)); } catch (e) { threw = e; } }
check('a Proxy, a revoked Proxy, throwing getters, a cause cycle, a frozen error and non-Error values never throw', threw === null && results.length === hostile.length, String(threw));
check('  and every result is a closed label', results.every((x) => LABELS.has(x)), JSON.stringify(results));
check('  a throwing Proxy is other; a held Proxy without a readable label is authority', results[0] === 'other' && results[1] === 'other' && results[2] === 'authority');
check('  a throwing message getter is other; a throwing cause getter falls back to the message', results[3] === 'other' && results[4] === 'other');
check('  a cyclic cause is read one level only', results[5] === 'other' && results[6] === 'storage_network');
check('  a frozen error is classified', results[7] === 'storage_overloaded');
check('  only the first 2,048 characters are read', results[9] === 'other' && results[10] === 'storage_network');
check('  a thrown string is other; a plain object with a documented message is classified by its message', results[16] === 'other' && results[20] === 'storage_reset');

console.log('\n== property check: heldCause over generated hostile text ==');
let seed = 1402; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pieces = ['D1_ERROR: ', 'D1_', 'malformed JSON', 'Network connection lost', 'D1 DB is overloaded', 'reset because its code was updated', 'privacy_site_request_held', 'privacy_write_admission_held:', 'read_epoch_unconfirmed', 'original_site_session_held', ...SECRETS, ' ', ':', '\n', '\u0000', 'storage_', 'admission:', 'x'];
const text = () => { let s = ''; const n = 1 + Math.floor(rand() * 6); for (let i = 0; i < n; i++) s += pieces[Math.floor(rand() * pieces.length)]; return s; };
let badLabel = null;
for (let i = 0; i < 5000; i++) {
  const e = rand() < 0.5 ? new Error(text()) : new Error(text(), { cause: rand() < 0.5 ? new Error(text()) : text() });
  if (rand() < 0.2) Object.defineProperty(e, 'heldCause', { value: text() });
  const label = L.heldCause(e);
  if (!LABELS.has(label) || leaks(label)) { badLabel = [e.message, label]; break; }
}
check('5,000 generated errors: every result is a member of the closed list and carries no generated text', badLabel === null, JSON.stringify(badLabel));

console.log('\n== elapsedClass ==');
check('fixed boundaries', L.elapsedClass(0) === 'under_100ms' && L.elapsedClass(99.9) === 'under_100ms' && L.elapsedClass(100) === 'under_500ms' && L.elapsedClass(499) === 'under_500ms' && L.elapsedClass(500) === 'under_2s' && L.elapsedClass(1999) === 'under_2s' && L.elapsedClass(2000) === '2s_or_more' && L.elapsedClass(1e12) === '2s_or_more');
check('  anything not a finite non-negative number is unknown', [NaN, -1, Infinity, -Infinity, '5', null, undefined, {}, 5n].every((v) => L.elapsedClass(v) === 'unknown'));
let badElapsed = null; for (let i = 0; i < 2000; i++) { const v = (rand() - 0.2) * 10 ** Math.floor(rand() * 6); if (!ELAPSED.has(L.elapsedClass(v))) { badElapsed = v; break; } }
check('  2,000 generated values are all members of the closed list', badElapsed === null, String(badElapsed));
check('clockMs never throws and gives a number', typeof L.clockMs() === 'number');

console.log('\n== routeClass ==');
const ROUTE_CASES = [
  ['/', 'page'], ['/index.html', 'page'],
  ['/api/admin/applications/300000000000000093', 'api_admin'], ['/api/admin', 'api_admin'], ['/api/admin/treasury/x', 'api_admin'],
  ['/api/me', 'api_me'], ['/api/me/erasure/status', 'api_me'], ['/api/application', 'api_application'], ['/api/application/edit', 'api_application'],
  ['/api/community/events/300000000000000093', 'api_community'], ['/api/treasury-plan/access', 'api_treasury'], ['/api/privacy/requests', 'privacy'],
  ['/api/news/x', 'api_news'], ['/api/qr/x', 'api_qr'], ['/api/army/x', 'api_army'], ['/api/board', 'api_other'], ['/api/meadow', 'api_other'],
  ['/static/wow/icon-warning.png', 'static'], ['/auth/callback', 'auth'], ['/privacy/access', 'privacy'], ['/privacy-policy', 'other'],
  ['/ingest/verify', 'ingest'], ['/queue', 'queue'], ['/queue/unverified', 'queue'], ['/interactions', 'interactions'], ['/health', 'health'],
  ['/internal/roles242/continue', 'internal'], ['/admin/guild-map', 'admin'], ['/linked-role', 'linked_role'], ['/oauth/callback', 'linked_role'],
  ['/bnet/link', 'linked_role'], ['/proof', 'proof'], ['/apiary', 'other'], ['/Tag#1234', 'other'], ['', 'other'], ['/applications', 'other'],
];
const routeBad = ROUTE_CASES.filter(([p, want]) => L.routeClass(p) !== want).map(([p, want]) => p + ' -> ' + L.routeClass(p) + ' (want ' + want + ')');
check('the route families of the routers', routeBad.length === 0, routeBad.join(' | '));
check('  a non-string path is other and nothing throws', [null, undefined, 42, {}, new Proxy({}, { get() { throw Error('x'); } })].every((v) => L.routeClass(v) === 'other'));
const segs = ['api', 'admin', 'me', 'static', 'x', '300000000000000093', 'Tag#1234', '..', '%2F', 'applications', 'K7Q2M9', ''];
let badRoute = null;
for (let i = 0; i < 5000; i++) {
  let p = rand() < 0.9 ? '/' : ''; const n = Math.floor(rand() * 5); for (let j = 0; j < n; j++) p += (j ? '/' : '') + segs[Math.floor(rand() * segs.length)] + (rand() < 0.2 ? segs[Math.floor(rand() * segs.length)] : '');
  const c = L.routeClass(p); if (!ROUTES.has(c) || leaks(c)) { badRoute = [p, c]; break; }
}
check('  5,000 generated paths: every result is a member of the closed enum and copies no segment', badRoute === null, JSON.stringify(badRoute));
const routeSource = logSource.slice(logSource.indexOf('export function routeClass'), logSource.indexOf('export function routeClass') + 600);
check('  no regular expression and no replacement in routeClass', !/\breplace\s*\(|RegExp|\/\\d|\.match\(|\.split\(/.test(routeSource));

console.log('\n== the sampled proof-cost line (design 2.5) ==');
const lines = [], realLog = console.log;
const sampled = (fn) => { console.log = (...a) => lines.push(a); try { return fn(); } finally { console.log = realLog; } };
const S = load('./log', {});
const meta = { meta: { duration: 14, rows_read: 14108 } };
sampled(() => { for (let i = 0; i < 255; i++) S.proofCostSample(meta); });
check('255 read groups log nothing', lines.length === 0);
sampled(() => S.proofCostSample(meta));
check('  the 256th logs exactly one line of fixed classes', lines.length === 1 && JSON.stringify(lines[0]) === JSON.stringify(['proof cost', 'under_50ms', 'under_100k']), JSON.stringify(lines));
sampled(() => { for (let i = 0; i < 256; i++) S.proofCostSample(undefined); });
check('  a missing meta gives unknown classes', lines.length === 2 && JSON.stringify(lines[1]) === JSON.stringify(['proof cost', 'unknown', 'unknown']));
const throwingMeta = Object.defineProperty({}, 'meta', { get() { throw Error('x'); } });
let sampleThrew = null;
sampled(() => { try { for (let i = 0; i < 256; i++) S.proofCostSample(throwingMeta); } catch (e) { sampleThrew = e; } });
check('  a throwing meta never throws and logs unknown', sampleThrew === null && lines.length === 3 && JSON.stringify(lines[2]) === JSON.stringify(['proof cost', 'unknown', 'unknown']));
console.log = () => { throw Error('console down'); };
try { for (let i = 0; i < 512; i++) S.proofCostSample(meta); } catch (e) { sampleThrew = e; } finally { console.log = realLog; }
check('  a throwing console never throws', sampleThrew === null);
const allClasses = new Set(['under_10ms', 'under_50ms', 'under_200ms', 'under_1s', '1s_or_more', 'unknown', 'under_1k', 'under_10k', 'under_100k', 'under_1m', '1m_or_more']);
check('  duration and rows classes stay in their closed lists', [0, 9.9, 10, 49, 50, 199, 200, 999, 1000, 1e9, -1, NaN, '1'].every((v) => allClasses.has(S.durationClass(v)) && allClasses.has(S.rowsReadClass(v))) && S.rowsReadClass(999) === 'under_1k' && S.rowsReadClass(1e6) === '1m_or_more' && S.durationClass(1000) === '1s_or_more');

console.log(`\n${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
