// Real source loader and test-local P schema; never a production migration.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require(process.env.PRIVACY129_TYPESCRIPT || 'typescript');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
const context = vm.createContext({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder,
  Uint8Array, ArrayBuffer, ReadableStream, ReadableStreamDefaultReader, console, Request, Response, Headers, URL, URLSearchParams, atob, btoa, AbortController, AbortSignal, setTimeout, clearTimeout,
  fetch() { throw Error('provider calls forbidden in privacy foundation tests'); } });
function load(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('module name refused');
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const src = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })((q) => {
    if (q === 'node:async_hooks') return require(q);
    if (!q.startsWith('./')) throw Error('external module refused');
    return load(q.slice(2));
  }, module, module.exports);
  return module.exports;
}
function port(db) {
  const prepare = sql => {
    let values = [];
    const s = { bind(...v) { values = v; return s; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { success: true, meta: { changes: 0 }, results: db.prepare(sql).all(...values) }; },
      async run() { const r = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes) }, results: [] }; },
      execute() {
        if (/^(?:SELECT|WITH)/.test(sql)) return { success: true, meta: { changes: 0 }, results: db.prepare(sql).all(...values) };
        const r = db.prepare(sql).run(...values); return { success: true, meta: { changes: Number(r.changes) }, results: [] };
      } };
    return s;
  };
  return { prepare, async batch(statements) {
    db.exec('BEGIN');
    try { const result = statements.map(s => s.execute()); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  } };
}
function fixture(planned = true) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  db.exec(fs.readFileSync(path.join(root, planned ? 'tests/fixtures/privacy-foundation129/paused-P-schema.sql' : 'schema.sql'), 'utf8'));
  const now = db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) t").get().t;
  let time = now;
  db.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('fixture clock misuse'); return String(time); });
  return { db, port: port(db), now, time: () => time, advance(seconds) { time += seconds; }, load };
}
module.exports = { load, port, fixture, root };

// Current entry-suite compatibility: reuse the actual Native epoch installer and
// sole OAuth PROFILE issuer. These are explicit fixture SETUP operations, never
// a replacement session formatter or a per-request refresh of membership facts.
const ENTRY_EPOCH = 'a'.repeat(32);
const ENTRY_METADATA = Object.freeze({id:'11111111-2222-3333-4444-555555555555',tag:'existing-entry-suite',timestamp:'2026-10-13T00:00:00Z'});
function installCurrentEntryEpoch(db, options = {}) {
  const installer = require('../../scripts/install-rejection-provenance-epoch.cjs');
  const layout = options.layout || 'canonical', epoch = options.epoch || ENTRY_EPOCH;
  const profile = layout === 'canonical' ? installer.manifest.canonical : installer.manifest.recordedLive;
  if (!['canonical','recorded-live-20261010'].includes(layout)) throw Error('entry layout refused');
  for (const table of profile.tables) db.exec(table.sql);
  for (const index of profile.indexes) db.exec(index.sql);
  db.exec(profile.slotSQL);
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)").run();
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?)").run(options.now === undefined ? Math.floor(Date.now()/1000) : options.now);
  const installed = installer.installFixtureEpoch(db,layout,epoch);
  return Object.freeze({layout,epoch,installed,metadata:ENTRY_METADATA});
}
function originalNativePort(db, hooks = {}) {
  const records = new WeakMap(), nativeTrace = [], nativeGroups = [];
  function execute(handle) {
    const record = records.get(handle);
    if (!record) throw Error('only original entry Native statement');
    const {sql,params} = record;
    hooks.statement?.(sql,params);
    nativeTrace.push({sql,params:params.slice()});
    const statement = db.prepare(sql), read = statement.columns().length > 0;
    const sqliteParams = params.map(value=>Array.isArray(value) ? new Uint8Array(value) : value);
    if (read) {
      hooks.beforeRead?.(sql,params);
      const results = hooks.readStatement ? hooks.readStatement(statement,sqliteParams) : statement.all(...sqliteParams);
      hooks.afterRead?.(sql,params,results[0] ?? null);
      return {success:true,results,meta:{changes:/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql) ? Number(db.prepare('SELECT changes() n').get().n) : 0}};
    }
    const result = statement.run(...sqliteParams);
    return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
  }
  function prepare(sql, input = []) {
    if (typeof sql !== 'string' || input.some(value=>value === undefined)) throw Error('entry Native input refused');
    // Wrangler's bound-statement view exposes BLOBs as number arrays. Preserve
    // that view for source custody; convert only at the SQLite execution edge.
    const params = input.map(value=>Array.isArray(value) ? value.slice() : value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : value);
    const statement = {statement:sql,sql,params,_sql:sql,
      bind(...values) { return prepare(sql,values); },
      async first(column) { hooks.count?.(); const row=execute(statement).results[0] ?? null; return column && row !== null ? row[column] ?? null : row; },
      async all() { hooks.count?.(); return execute(statement); },
      async run() { hooks.count?.(); return execute(statement); },
      _exec() { return execute(statement); },
    };
    records.set(statement,{sql,params});
    return statement;
  }
  const native = {prepare,async batch(plan) {
    if (!Array.isArray(plan) || plan.some(statement=>!records.has(statement))) throw Error('entry Native batch refused');
    hooks.count?.(); await hooks.beforeBatch?.(plan);
    // A competing admitted fixture write finishes before this Native transaction.
    // It cannot be interleaved inside an atomic provider batch.
    for (const statement of plan) {
      const record=records.get(statement);
      if (!/^\s*(SELECT|WITH)\b/i.test(record.sql)) await hooks.beforeRun?.(record.sql,record.params);
    }
    nativeGroups.push(plan.map(statement=>({sql:records.get(statement).sql,params:records.get(statement).params.slice()})));
    db.exec('BEGIN');
    let result;
    try { result=plan.map((statement,index)=>{hooks.step?.(index,records.get(statement).sql,records.get(statement).params);return execute(statement);});db.exec('COMMIT'); }
    catch(error) { db.exec('ROLLBACK');throw error; }
    await hooks.afterBatch?.(plan,result);
    return result;
  }};
  Object.defineProperties(native,{nativeTrace:{value:nativeTrace},nativeGroups:{value:nativeGroups}});
  return native;
}
function currentEntryEnvironment(env, options = {}) {
  return {...env,DISCORD_CLIENT_SECRET:env.DISCORD_CLIENT_SECRET || 'existing-entry-test-client-only',
    PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:options.layout || 'canonical',
    PRIVACY_WRITE_ADMISSION_EPOCH:options.epoch || ENTRY_EPOCH,
    PRIVACY_ERASURE_ENABLED:'false',CF_VERSION_METADATA:ENTRY_METADATA};
}
async function issueOriginalEntryCookie(loadSource, db, env, subject) {
  const account=db.prepare('SELECT * FROM site_users WHERE discord_id=?').get(subject);
  if (!account) throw Error('original entry cookie requires a real setup account');
  const oauth=loadSource('privacy-serving-site-oauth'), data=loadSource('site-data'), core=loadSource('site-core');
  const user={id:subject,username:account.username || 'entry-user',global_name:account.global_name ?? null};
  const capture=db.prepare('SELECT subject_id AS subject,generation AS subjectGeneration,state,revision FROM privacy_subjects WHERE subject_id=?').get(subject) ?? null;
  const matches=[...fs.readFileSync(path.join(root,'src/site.ts'),'utf8').matchAll(/const privacyWrite = Object\.freeze\(\{sql:\s*`([^`]+)`/g)];
  if(matches.length!==1)throw Error('sole source PROFILE changed');
  const origin=oauth.captureSiteOAuthOrigin(new Request('https://'+env.SITE_HOST+'/auth/callback?code=original_entry_fixture'),env);
  const at=loadSource('db').now();
  oauth.captureSiteOAuthAccount(origin,user,capture,at);
  const reply=await oauth.dispatchSiteOAuthProfile(origin,Object.freeze({sql:matches[0][1],binds:Object.freeze([
    subject,user.username,user.global_name,account.nick ?? null,account.avatar ?? null,
    data.snowflakeTime(subject),account.server_joined ?? null,at,Math.max(2,account.session_version),
  ])}));
  const cookie=(await oauth.signSiteOAuthCookie(origin,reply)).split(';')[0];
  const admitted=loadSource('privacy-write-admission').createPrivacyWriteAdmissionDatabase(env.DB,'writer',env.PRIVACY_WRITE_ADMISSION_LAYOUT,env.PRIVACY_WRITE_ADMISSION_EPOCH);
  const session=await core.readSession({...env,DB:admitted},new Request('https://'+env.SITE_HOST+'/original-entry-session',{headers:{Cookie:cookie}}));
  if(!session || session.u!==subject || !session.n || !session.g)throw Error('actual original entry session missing');
  loadSource('privacy-site-session-incarnation').assertOriginalSiteSessionRead(session);
  return Object.freeze({cookie,session});
}
Object.assign(module.exports,{ENTRY_EPOCH,ENTRY_METADATA,installCurrentEntryEpoch,originalNativePort,currentEntryEnvironment,issueOriginalEntryCookie});
