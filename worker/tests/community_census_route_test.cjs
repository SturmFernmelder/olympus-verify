// Prepared, not executed. Existing privacy129 NativeSQLite/current-entry issuer family.
// Install this test with the reviewed source overlay; no replacement D1, session signer,
// clock, admission, module export or production config. Whole fetch-entry proof is separate.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require(process.env.PRIVACY129_TYPESCRIPT || 'typescript');
const entry = require('./helpers/privacy129_fixture.cjs');
const root = path.resolve(__dirname, '..');
const SUBJECT = '300000000000000002';
const URL_BASE = 'https://guild.example/api/community/census/preview';
const encoder = new TextEncoder();
let checks = 0;
function check(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }

function sourceGraph(logs) {
  const cache = new Map();
  const context = vm.createContext({ crypto: require('node:crypto').webcrypto,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader,
    Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal,
    setTimeout, clearTimeout, console: { log: (...v) => logs.push(v), error: (...v) => logs.push(v), warn: (...v) => logs.push(v) },
    fetch() { throw Error('provider call forbidden in census component fixture'); } });
  function load(name) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('fixture module name refused');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })(q => {
      if (q === 'node:async_hooks') return require(q);
      if (!q.startsWith('./')) throw Error('external source dependency refused');
      return load(q.slice(2));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

async function fresh() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const now = db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS t").get().t;
  // Actual SQLite and original Date clock. No strftime override and no replacement Date.
  entry.installCurrentEntryEpoch(db, { now });
  const logs = [], load = sourceGraph(logs), hooks = {};
  const native = entry.originalNativePort(db, { beforeBatch: plan => hooks.beforeBatch?.(plan) });
  const rawEnv = entry.currentEntryEnvironment({ DB: native,
    COOKIE_SECRET: 'census-component-cookie-secret-only-0123456789',
    VERIFY_SECRET: 'census-component-verification-secret-only', SITE_HOST: 'guild.example',
    SITE_GUILD_ID: '236932545793490944', GUILD_ID: '1549537348516188200',
    DISCORD_APP_ID: '1550176895671341076', SITE_ADMINS: '', COMMUNITY_ORGANIZERS: '',
    COMMUNITY_FEATURES: 'census', PUBLIC_BASE_URL: 'https://verify.example' });
  const writer = load('privacy-write-admission').createPrivacyWriteAdmissionDatabase(native, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = { ...rawEnv, DB: writer };
  const setupWrite = (sql, ...args) => writer.prepare(sql).bind(...args).run();
  await setupWrite('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server,denied,session_version) VALUES(?,?,?,?,1,0,1)', SUBJECT, 'census-fixture', now, now);
  await setupWrite('INSERT INTO members(discord_id) VALUES(?)', SUBJECT);
  await setupWrite("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)", 'fictional witness', 'Fictional Witness', SUBJECT, now);
  const issued = await entry.issueOriginalEntryCookie(load, db, rawEnv, SUBJECT);
  const core = load('site-core'), community = load('community-context'), authority = load('privacy-serving-authority');
  const route = load('community-census-route');
  function request(body, options = {}) {
    return new Request(URL_BASE + (options.query || ''), { method: options.method || 'POST',
      headers: { Cookie: issued.cookie, Origin: 'https://guild.example', 'X-Olympus': core.PAGE_VERSION,
        'Content-Type': 'application/json', ...options.headers },
      ...(options.method === 'GET' ? {} : { body, duplex: 'half' }) });
  }
  async function prepare(req, overrides = {}) {
    const selected = { ...env, ...overrides };
    const session = await core.readSession(selected, req);
    if (!session) throw Error('fixture original signed session not read');
    const bound = authority.privacyBoundSiteEnv(selected, session);
    const ctx = await community.communityContext(bound, req);
    if (!ctx.subject) throw Error('fixture original community subject missing');
    return { ctx, bound };
  }
  async function invoke(req, options = {}) {
    const prepared = await prepare(req, options.env);
    const before = native.nativeTrace.length;
    await options.afterPrepare?.(prepared.ctx);
    const response = await route.censusPreview(req, prepared.bound, prepared.ctx);
    const trace = native.nativeTrace.slice(before);
    check('preview uses no census/provider persistence statements', trace.every(row => /^\s*(SELECT|WITH)\b/.test(row.sql)));
    check('preview logs no payload or custody details', logs.length === 0);
    return { response, body: await response.json(), trace, ...prepared };
  }
  return { db, now, logs, load, hooks, native, setupWrite, request, prepare, invoke, route, env };
}

function snapshot(now, guilds = []) { return { format: 'olympus-census-v1', addonVersion: 'fixture-1',
  realmGroup: 'Fictional Realm', faction: 'Alliance', observedAt: now,
  source: 'community-observation', membershipProof: false, guilds }; }
function chunks(parts, onPull) {
  let index = 0;
  return new ReadableStream({ async pull(controller) {
    await onPull?.(index);
    if (index < parts.length) controller.enqueue(parts[index++]); else controller.close();
  } }, { highWaterMark: 0 });
}
async function caseWith(name, run) {
  const f = await fresh();
  try { await run(f); console.log('CASE ' + name); } finally { f.db.close(); }
}

(async () => {
  await caseWith('valid and maximum-width DTO', async f => {
    const names = Array.from({ length: 300 }, (_, i) => String(i).padStart(3, '0') + '\\"'.repeat(62) + 'x');
    const guilds = names.map(name => ({ name, reportedCharacters: 1000, receivedAt: f.now,
      fresh: true, counted: true, online: 1000 }));
    const out = await f.invoke(f.request(JSON.stringify(snapshot(f.now, guilds))));
    check('300 rows stay unsigned, ephemeral and complete', out.response.status === 200 &&
      out.body.persisted === false && out.body.sourceVerified === false && out.body.membershipProof === false && out.body.snapshot.guilds.length === 300);
    check('receipt is real DB seconds with the single original atReceipt clock', Number.isSafeInteger(out.body.receiptNow) && out.body.receiptNow >= f.now && out.body.atReceipt.receiptNow === out.body.receiptNow);
    check('closed response has no session, subject or raw input', Object.keys(out.body).sort().join(',') === 'atReceipt,format,membershipProof,persisted,receiptNow,snapshot,sourceVerified');
    check('max-width fixture response fits independent byte ceiling', encoder.encode(JSON.stringify(out.body)).length <= 524288);
    check('response keeps cache/security headers', out.response.headers.get('Cache-Control')?.includes('no-store') && out.response.headers.get('X-Content-Type-Options') === 'nosniff');
    const clocks = out.trace.filter(row => row.sql === "SELECT CAST(strftime('%s','now') AS INTEGER) AS receipt_now");
    check('receipt clock is issued once after complete body', clocks.length === 1);
  });
  await caseWith('headers and feature gates', async f => {
    const body = JSON.stringify(snapshot(f.now));
    for (const [name, options, status, error] of [
      ['query', { query: '?ignored=1' }, 400, 'bad_request'],
      ['wrong origin', { headers: { Origin: 'https://other.example' } }, 403, 'bad_origin'],
      ['old page', { headers: { 'X-Olympus': '1' } }, 409, 'reload'],
      ['wrong media type', { headers: { 'Content-Type': 'text/plain' } }, 415, 'unsupported_content_type'],
      ['compression', { headers: { 'Content-Encoding': 'gzip' } }, 415, 'unsupported_content_encoding'],
      ['invalid length', { headers: { 'Content-Length': '-1' } }, 400, 'invalid_content_length'],
      ['oversized declaration', { headers: { 'Content-Length': '327681' } }, 413, 'body_too_large'],
      ['method', { method: 'GET' }, 405, 'method_not_allowed'],
    ]) {
      const out = await f.invoke(f.request(body, options));
      check(name + ' refuses before preview SQL', out.response.status === status && out.body.error === error && out.trace.length === 0);
    }
    const off = await f.invoke(f.request(body), { env: { COMMUNITY_FEATURES: '' } });
    check('absent census token is OFF', off.response.status === 404 && off.trace.length === 0);
    let hasCalls = 0;
    const encodingRequest = f.request(body, { headers: { 'Content-Encoding': 'gzip' } });
    Object.defineProperty(encodingRequest.headers, 'has', { value: () => {
      hasCalls++; throw Error('uncaptured Headers.has must not be invoked');
    } });
    const encoded = await f.invoke(encodingRequest);
    check('present encoding uses protected get without invoking an own has trap',
      encoded.response.status === 415 && encoded.body.error === 'unsupported_content_encoding' && hasCalls === 0 && encoded.trace.length === 0);
  });
  await caseWith('exact bytes and raw parser semantics', async f => {
    const raw = JSON.stringify(snapshot(f.now));
    const limit = raw + ' '.repeat(327680 - encoder.encode(raw).length);
    const exact = await f.invoke(f.request(limit));
    check('327680 actual bytes are accepted inclusively', exact.response.status === 200);
    for (const body of [limit + ' ', chunks([encoder.encode(limit), encoder.encode(' ')])]) {
      const over = await f.invoke(f.request(body, { headers: { 'Content-Length': '1' } }));
      check('lying length cannot admit 327681 streamed bytes', over.response.status === 413 && over.body.error === 'body_too_large');
    }
    for (const [label, rawBody, error] of [
      ['BOM', '\ufeff' + raw, 'invalid_census'],
      ['duplicate decoded key', raw.replace('"format":', '"f\\u006frmat":"olympus-census-v1","format":'), 'invalid_census'],
      ['fractional lexical timestamp', raw.replace('"observedAt":' + f.now, '"observedAt":' + f.now + '.0000000000000001'), 'invalid_census'],
      ['malformed UTF-8', new Uint8Array([0xc3, 0x28]), 'invalid_utf8'],
    ]) {
      const out = await f.invoke(f.request(rawBody));
      check(label + ' is refused without partial rows', out.response.status === 400 && out.body.error === error && Object.keys(out.body).length === 1);
    }
    const split = encoder.encode(JSON.stringify({ ...snapshot(f.now), realmGroup: 'Fictional \u00e9' }));
    const at = split.indexOf(0xc3);
    const out = await f.invoke(f.request(chunks([split.slice(0, at + 1), split.slice(at + 1)])));
    check('split multibyte UTF-8 is decoded as one stream', out.response.status === 200 && out.body.snapshot.realmGroup === 'Fictional \u00e9');
  });
  await caseWith('shared soft limiter', async f => {
    for (let i = 0; i < 13; i++) {
      const out = await f.invoke(f.request(JSON.stringify(snapshot(f.now))));
      check('constant bucket request ' + (i + 1), i < 12 ? out.response.status === 200 : out.response.status === 429 && out.body.error === 'slow_down');
    }
  });
  await caseWith('real anonymous and unconfirmed contexts', async f => {
    const anonymous = new Request(URL_BASE, { method: 'POST', headers: {
      Origin: 'https://guild.example', 'X-Olympus': '2', 'Content-Type': 'application/json',
    }, body: JSON.stringify(snapshot(f.now)) });
    const actualContext = await f.load('community-context').communityContext(f.env, anonymous);
    const response = await f.route.censusPreview(anonymous, f.env, actualContext);
    check('real anonymous context has no preview access', actualContext.subject === null && response.status === 401);
    await f.setupWrite("UPDATE characters SET status='pending' WHERE discord_id=?", SUBJECT);
    const out = await f.invoke(f.request(JSON.stringify(snapshot(f.now))));
    check('real unconfirmed context refuses before body probes', out.response.status === 403 && out.body.error === 'guild_unconfirmed' && out.trace.length === 0);
  });
  await caseWith('last-row refusal and historical receipt freshness', async f => {
    const guilds = Array.from({ length: 300 }, (_, i) => ({ name: 'Fictional Guild ' + i,
      reportedCharacters: 10, receivedAt: f.now, fresh: true, counted: true, online: 5 }));
    guilds[299].online = 11;
    const invalid = await f.invoke(f.request(JSON.stringify(snapshot(f.now, guilds))));
    check('bad row 300 refuses the whole preview', invalid.response.status === 400 && invalid.body.error === 'invalid_census' && !Object.hasOwn(invalid.body, 'snapshot'));
    const old = f.now - 604801;
    const historical = await f.invoke(f.request(JSON.stringify(snapshot(old, [{ name: 'Historical Guild',
      reportedCharacters: 10, receivedAt: old, fresh: true, counted: true, online: 5 }]))));
    check('valid historical export is not promoted to current presence', historical.response.status === 200 &&
      historical.body.snapshot.guilds[0].fresh === true && historical.body.atReceipt.guilds[0].fresh === false &&
      historical.body.atReceipt.guilds[0].counted === false && historical.body.atReceipt.guilds[0].retained === false);
  });
  await caseWith('native receipt failure remains a failure', async f => {
    let fired = false;
    f.hooks.beforeBatch = plan => {
      if (plan.some(s => s.statement === "SELECT CAST(strftime('%s','now') AS INTEGER) AS receipt_now")) {
        fired = true; f.hooks.beforeBatch = null; throw Error('fictional native receipt reply lost');
      }
    };
    const req = f.request(JSON.stringify(snapshot(f.now))), prepared = await f.prepare(req);
    await assert.rejects(f.route.censusPreview(req, prepared.bound, prepared.ctx),
      error => error instanceof f.load('privacy-serving-authority').PrivacySiteRequestHeld);
    check('unknown native receipt is not converted into local success or ordinary JSON', fired);
    check('receipt failure logs no payload', f.logs.length === 0);
  });
  for (const [label, sql, args] of [
    ['session revocation', 'UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', [SUBJECT]],
    ['standing loss', 'UPDATE site_users SET in_server=0 WHERE discord_id=?', [SUBJECT]],
    ['ban', 'UPDATE members SET banned=1 WHERE discord_id=?', [SUBJECT]],
    ['roster loss', "UPDATE characters SET status='pending' WHERE discord_id=?", [SUBJECT]],
    ['generation replacement', 'UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?', ['f'.repeat(32), SUBJECT]],
    ['incarnation replacement', null, []], // Native birth is immutable: established admitted delete/recreate below.
  ]) for (const boundary of ['body', 'receipt']) await caseWith(label + ' at ' + boundary, async f => {
    let entered = false, completed = false;
    let originalCapture;
    const mutate = async () => {
      if (entered) return;
      entered = true; // Disarm before the competing admitted write, never inside its transaction.
      if (label === 'incarnation replacement') {
        assert.ok(originalCapture, 'original request authority was captured before the first mutation pull');
        const witness = () => ({
          user: f.db.prepare('SELECT * FROM site_users WHERE discord_id=?').get(SUBJECT),
          subject: f.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(SUBJECT),
          members: f.db.prepare('SELECT * FROM members WHERE discord_id=? ORDER BY discord_id').all(SUBJECT),
          characters: f.db.prepare('SELECT * FROM characters WHERE discord_id=? ORDER BY name_key').all(SUBJECT),
          applications: f.db.prepare('SELECT * FROM site_applications WHERE discord_id=? ORDER BY role').all(SUBJECT),
        });
        const before = witness(), original = originalCapture.subject, session = originalCapture.session;
        assert.equal(before.user.discord_id, original.discordId);
        assert.equal(before.user.session_version, original.sessionVersion);
        assert.equal(before.user.account_incarnation, original.accountIncarnation);
        assert.equal(before.subject.subject_id, original.discordId);
        assert.equal(before.subject.generation, original.privacyGeneration);
        assert.equal(before.subject.state, 'active');
        assert.deepEqual([session.u, session.v, session.e, session.g, session.n], originalCapture.tuple);
        assert.equal(session.u, original.discordId);
        assert.equal(session.v, original.sessionVersion);
        assert.equal(session.g, original.privacyGeneration);
        assert.equal(session.n, original.accountIncarnation);
        assert.equal(before.applications.length, 0, 'original surviving-rejection owner guard remains applicable');
        const preservedFields = ['discord_id', 'username', 'global_name', 'nick', 'avatar', 'account_created',
          'server_joined', 'first_login', 'last_login', 'checked_at', 'in_server', 'session_version', 'denied',
          'denied_reason', 'denied_at', 'denied_by', 'rejection_event_id', 'rejection_subject_key',
          'rejection_scope', 'rejection_window_expired'];
        assert.deepEqual(Object.keys(before.user).sort(), [...preservedFields, 'account_incarnation'].sort());
        const traceBefore = f.native.nativeTrace.length, groupBefore = f.native.nativeGroups.length;
        const results = await f.env.DB.batch([
          f.env.DB.prepare('DELETE FROM site_users WHERE discord_id=?1 AND account_incarnation=?2')
            .bind(SUBJECT, original.accountIncarnation),
          f.env.DB.prepare('INSERT INTO site_users(discord_id,username,global_name,nick,avatar,account_created,server_joined,first_login,last_login,checked_at,in_server,session_version,denied,denied_reason,denied_at,denied_by,rejection_event_id,rejection_subject_key,rejection_scope,rejection_window_expired) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)')
            .bind(...preservedFields.map(field => before.user[field])),
        ]);
        const traceAfter = f.native.nativeTrace.length, groupAfter = f.native.nativeGroups.length;
        assert.equal(results.length, 2, 'original admitted batch acknowledged both payload results');
        assert.ok(results.every(result => result.success === true && result.meta.changes === 1),
          'original admitted delete and insert each changed exactly one row');
        const after = witness();
        assert.match(after.user.account_incarnation, /^[0-9a-f]{32}$/);
        assert.notEqual(after.user.account_incarnation, before.user.account_incarnation);
        assert.deepEqual({ ...after.user, account_incarnation: before.user.account_incarnation }, { ...before.user });
        for (const key of ['subject', 'members', 'characters', 'applications']) assert.deepEqual(after[key], before[key]);
        assert.equal(originalCapture.request.headers.get('Cookie'), originalCapture.cookie);
        assert.equal(originalCapture.ctx.subject, originalCapture.subject);
        assert.equal(originalCapture.ctx.subject.originalSession, originalCapture.session);
        assert.deepEqual([session.u, session.v, session.e, session.g, session.n], originalCapture.tuple);
        // Whole original arrays stay intact. These are actual setup ordinals/results,
        // separate from route cost; no SQL filtering/reset or source-derived pass count.
        console.log('CENSUS_RECREATION_NATIVE ' + JSON.stringify({ boundary,
          traceBefore, traceAfter, groupBefore, groupAfter,
          nativeTrace: f.native.nativeTrace.slice(traceBefore, traceAfter),
          nativeGroups: f.native.nativeGroups.slice(groupBefore, groupAfter),
          acknowledgements: results, before, after,
          originalCookieUnchanged: true, originalSubjectReferenceUnchanged: true,
          originalSessionReferenceAndTupleUnchanged: true }));
      } else {
        const result = await f.setupWrite(sql, ...args);
        assert.equal(result.meta.changes, 1, 'competing admitted mutation changed its original row');
      }
      completed = true;
    };
    let body = JSON.stringify(snapshot(f.now));
    if (boundary === 'body') body = chunks([encoder.encode(body)], index => index === 0 ? mutate() : undefined);
    else f.hooks.beforeBatch = async plan => {
      if (plan.some(s => s.statement === "SELECT CAST(strftime('%s','now') AS INTEGER) AS receipt_now")) {
        f.hooks.beforeBatch = null; await mutate();
      }
    };
    const req = f.request(body), prepared = await f.prepare(req);
    const originalSubject = prepared.ctx.subject, originalSession = originalSubject.originalSession;
    originalCapture = Object.freeze({ request: req, cookie: req.headers.get('Cookie'), ctx: prepared.ctx,
      subject: originalSubject, session: originalSession,
      tuple: Object.freeze([originalSession.u, originalSession.v, originalSession.e, originalSession.g, originalSession.n]) });
    let response = null, failure = null, returned = null;
    try { response = await f.route.censusPreview(req, prepared.bound, prepared.ctx); }
    catch (error) { failure = error; }
    if (response) returned = await response.json();
    check('original admitted competing mutation completed', completed);
    const Held = f.load('privacy-serving-authority').PrivacySiteRequestHeld;
    check('changed original authority has an exact known refusal or typed custody hold',
      failure ? failure instanceof Held : response?.status === 403 && returned?.error === 'guild_access_changed');
    if (label === 'incarnation replacement') {
      check('incarnation ' + boundary + ' retains the exact original session custody refusal',
        failure instanceof Held && failure.message === 'privacy_site_request_held' && response === null && returned === null);
      console.log('CENSUS_INCARNATION_REFUSAL ' + JSON.stringify({ boundary,
        sameGraphPrivacySiteRequestHeld: failure instanceof Held, message: failure.message,
        responseNull: response === null, returnedNull: returned === null }));
    }
    check('no census response was adopted on changed authority', !returned || !Object.hasOwn(returned, 'snapshot'));
    check('custody refusal does not log input', f.logs.length === 0);
  });
  await caseWith('subject and header replacement while body waits', async f => {
    let ctx;
    const body = chunks([encoder.encode(JSON.stringify(snapshot(f.now)))], async () => { ctx.subject = { ...ctx.subject }; });
    const req = f.request(body), prepared = await f.prepare(req); ctx = prepared.ctx;
    await assert.rejects(f.route.censusPreview(req, prepared.bound, ctx), error => error.message === 'privacy_community_original_held');
    check('same-valued replacement subject is not adopted', true);
    const req2 = f.request(chunks([encoder.encode(JSON.stringify(snapshot(f.now)))], async () => { req2.headers.set('X-Olympus', '1'); }));
    const second = await f.prepare(req2);
    await assert.rejects(f.route.censusPreview(req2, second.bound, second.ctx), error => error.message === 'census_original_request_held');
    check('mutated original request header is not adopted', true);
  });
  for (const mode of ['cancel-never-acknowledges', 'cancel-rejects', 'late-packet']) await caseWith(mode, async f => {
    let pulls = 0, cancels = 0, controller;
    const body = new ReadableStream({ start(c) { controller = c; }, pull() { pulls++; }, cancel() {
      cancels++;
      if (mode === 'cancel-rejects') return Promise.reject(Error('fictional cancellation refusal'));
      return new Promise(() => {});
    } }, { highWaterMark: 0 });
    const start = Date.now();
    const out = await f.invoke(f.request(body));
    const elapsed = Date.now() - start;
    check('fixed five-second timeout survives unacknowledged cancellation', out.response.status === 408 && out.body.error === 'body_timeout' && elapsed >= 5000 && elapsed < 10000);
    check('original reader used once and cancellation attempted once', pulls === 1 && cancels === 1);
    if (mode === 'late-packet') {
      // Native cancellation closes the original stream; no replacement reader or route retry.
      assert.throws(() => controller.enqueue(encoder.encode(JSON.stringify(snapshot(f.now)))));
      check('late packet cannot append or produce a second preview', !Object.hasOwn(out.body, 'snapshot'));
    }
  });
  console.log(checks + '/' + checks + ' census component checks passed');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
