// Real source loader and test-local P schema; never a production migration.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require(process.env.PRIVACY129_TYPESCRIPT || 'typescript');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const cache = new Map();
const context = vm.createContext({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder,
  Uint8Array, console, Request, Response, Headers, URL, atob, btoa, AbortController, setTimeout, clearTimeout,
  fetch() { throw Error('provider calls forbidden in privacy foundation tests'); } });
function load(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('module name refused');
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const src = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext('(function(require,module,exports){' + js + '\n})', context, { filename: name })((q) => {
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
