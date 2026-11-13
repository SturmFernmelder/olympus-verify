// Per-request physical D1 statement counter and query-plan check for the bounded qualification (Evergreen 12 Nov 2026,
// CL2-024). The directive asks the gate to assert D1 statement limits and query plans on the 1,000-member fixture;
// before this the gate bound raw Miniflare D1 with no counting wrapper at all.
//
// The counter sits UNDER the privacy write-admission layer, in the place of the genuine binding, so it sees exactly the
// physical statements that reach D1: admission proofs, headers and clears included, one per batch element. It never
// changes a statement, a bind or a result, and it refuses a statement it did not prepare, so it cannot hide traffic.

/** Wrap a genuine D1 binding. `start()` clears the log and begins counting; `stop()` ends it and returns the log. */
export function countingD1(genuine) {
  const own = new WeakMap(), log = [];
  let counting = false;
  const record = (sql, values) => { if (counting) log.push({sql, values}); };
  const statement = (inner, sql, values) => {
    // Plain data-property methods: the admission layer checks method descriptors and rejects accessors.
    const wrapper = {
      bind(...next) { return statement(inner.bind(...next), sql, next); },
      all() { record(sql, values); return inner.all(); },
      run() { record(sql, values); return inner.run(); },
      first(column) { record(sql, values); return column === undefined ? inner.first() : inner.first(column); },
      raw(options) { record(sql, values); return inner.raw(options); },
    };
    own.set(wrapper, {inner, sql, values});
    return wrapper;
  };
  const native = {
    prepare(sql) { return statement(genuine.prepare(sql), sql, []); },
    batch(list) {
      const inner = list.map(item => {
        const found = own.get(item);
        if (!found) throw Error('statement_budget_foreign_statement');
        record(found.sql, found.values);
        return found.inner;
      });
      return genuine.batch(inner);
    },
    exec() { throw Error('statement_budget_exec_uncounted'); },
    dump() { throw Error('statement_budget_dump_uncounted'); },
  };
  return {
    native,
    start() { log.length = 0; counting = true; },
    stop() { counting = false; return log.slice(); },
  };
}

// Words that can follow a table name in FROM/JOIN and are not an alias.
const NOT_ALIAS = new Set(['where', 'on', 'join', 'left', 'right', 'full', 'inner', 'outer', 'cross', 'group', 'order', 'limit',
  'using', 'natural', 'indexed', 'not', 'set', 'values', 'select', 'union', 'except', 'intersect', 'having', 'window',
  'returning', 'default', 'as']);

/**
 * Run EXPLAIN QUERY PLAN for every logged statement that names a table, with its original binds, on the genuine binding
 * (EXPLAIN never executes the statement), and return every plan row that reads a whole physical table. SQLite reports
 * those as `SCAN <table or alias>` (optionally `USING [COVERING] INDEX ...`); an indexed lookup is `SEARCH ...`.
 *
 * `tables` limits the check to the named tables; leave it out (12 Nov review of CL2-024) to check every table in the
 * database, so a scan of a table nobody thought to list cannot pass unseen. A `SCAN` of a common table expression, a
 * derived table, a virtual table (json_each) or a constant row is not a table read. Any other `SCAN` target that cannot be
 * resolved to a table is returned in `unresolved`, and the caller must fail on it, so a gap in the alias parsing fails
 * closed instead of hiding a scan.
 */
export async function fullScans(genuine, log, tables) {
  const physical = tables ? tables.map(t => t.toLowerCase())
    : (await genuine.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'").all()).results.map(r => String(r.name).toLowerCase());
  // The schema catalogue counts as a table: the admission schema proof reads it on every request.
  if (!tables) physical.push('sqlite_master', 'sqlite_schema');
  const known = new Set(physical), plans = new Map(), scans = [], unresolved = [];
  let explained = 0;
  // Every physical statement counts, a repeated one included: a request that sends the same read twice scans twice.
  // (Deduplicating by statement and binds made the count depend on whether the clock ticked between the two sends.)
  for (const {sql, values} of log) {
    const lower = sql.toLowerCase();
    if (!physical.some(name => new RegExp('\\b' + name + '\\b').test(lower))) continue;
    const key = sql + '\u0000' + JSON.stringify(values.map(v => v instanceof ArrayBuffer ? '[blob]' : v));
    if (!plans.has(key)) {
      const prepared = genuine.prepare('EXPLAIN QUERY PLAN ' + sql);
      plans.set(key, (await (values.length ? prepared.bind(...values) : prepared).all()).results);
    }
    const rows = plans.get(key);
    explained++;
    // An alias in the plan (SCAN rm) is resolved through the statement's own FROM, JOIN and comma-join clauses
    // ("FROM a, roster_members rm" and "FROM a,roster_members rm" included). Common table expressions, aliases of them
    // (FROM snapshot s) and derived tables (FROM (SELECT ...) AS x) are recorded so their scans are not counted as
    // table reads; the table reads inside them appear as their own plan rows.
    const aliases = new Map(physical.map(name => [name, name])), ctes = new Set();
    for (const match of lower.matchAll(/(?:\bwith(?:\s+recursive)?\s+|,\s*)([a-z_][a-z0-9_]*)(?:\s*\([^)]*\))?\s+as\s*(?:not\s+)?(?:materialized\s*)?\(/g)) ctes.add(match[1]);
    for (const match of lower.matchAll(/\)\s*(?:as\s+)?([a-z_][a-z0-9_]*)/g)) if (!NOT_ALIAS.has(match[1])) ctes.add(match[1]);
    for (const match of lower.matchAll(/(?:\bfrom\s+|\bjoin\s+|,\s*)([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/g)) {
      if (!match[2] || NOT_ALIAS.has(match[2])) continue;
      if (known.has(match[1])) aliases.set(match[2], match[1]);
      else if (ctes.has(match[1])) ctes.add(match[2]);
    }
    for (const row of rows) {
      const detail = String(row.detail ?? '');
      const scan = detail.match(/^SCAN (?:TABLE )?(?:(?:main|temp)\.)?([A-Za-z_][A-Za-z0-9_]*)/);
      if (!scan) continue;
      const name = scan[1].toLowerCase();
      // A name that is both an alias and a CTE counts as a table scan: the ambiguity fails closed.
      if (aliases.has(name)) scans.push({table: aliases.get(name), detail, sql: sql.slice(0, 240)});
      else if (ctes.has(name) || /VIRTUAL TABLE/.test(detail) || name === 'constant') continue;
      else if (!tables) unresolved.push({detail, sql: sql.slice(0, 240)}); // a narrowed check ignores other tables
    }
  }
  return {explained, scans, unresolved};
}

/** Count scans as `table: detail` -> occurrences, for an exact comparison with a recorded allow-list. */
export function scanCounts(scans) {
  const counts = {};
  for (const {table, detail} of scans) counts[table + ': ' + detail] = (counts[table + ': ' + detail] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
