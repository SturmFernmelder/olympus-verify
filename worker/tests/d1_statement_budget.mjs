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

/**
 * Run EXPLAIN QUERY PLAN for every logged statement that names one of `tables`, with its original binds, on the genuine
 * binding (EXPLAIN never executes the statement). Returns the plan rows that read a whole table: SQLite reports those as
 * `SCAN <table>` (optionally `USING ... INDEX`) and an indexed lookup as `SEARCH <table> USING ...`.
 */
export async function fullScans(genuine, log, tables) {
  const names = tables.map(t => t.toLowerCase()), seen = new Set(), scans = [];
  let explained = 0;
  for (const {sql, values} of log) {
    const lower = sql.toLowerCase();
    if (!names.some(name => new RegExp('\\b' + name + '\\b').test(lower))) continue;
    const key = sql + '\u0000' + JSON.stringify(values.map(v => v instanceof ArrayBuffer ? '[blob]' : v));
    if (seen.has(key)) continue;
    seen.add(key);
    const prepared = genuine.prepare('EXPLAIN QUERY PLAN ' + sql);
    const rows = (await (values.length ? prepared.bind(...values) : prepared).all()).results;
    explained++;
    // An alias in the plan (SCAN rm) is resolved through the statement's own FROM/JOIN clauses.
    const aliases = new Map(names.map(name => [name, name]));
    for (const match of lower.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/g)) {
      if (names.includes(match[1]) && match[2] && !['where', 'on', 'join', 'left', 'inner', 'cross', 'group', 'order', 'limit', 'using', 'natural', 'indexed', 'not'].includes(match[2])) aliases.set(match[2], match[1]);
    }
    for (const row of rows) {
      const detail = String(row.detail ?? '');
      const scan = detail.match(/^SCAN (?:TABLE )?([A-Za-z_][A-Za-z0-9_]*)/);
      if (scan && aliases.has(scan[1].toLowerCase())) scans.push({table: aliases.get(scan[1].toLowerCase()), detail, sql: sql.slice(0, 240)});
    }
  }
  return {explained, scans};
}
