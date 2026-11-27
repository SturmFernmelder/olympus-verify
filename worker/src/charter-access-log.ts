import { heldCause, isHeldCause } from './log';

type Attempt = 'initial' | 'auto_retry' | 'manual_retry';
type Stage = 'admission' | 'session_proof' | 'session_row' | 'membership' | 'schema' | 'directory';
export interface CharterAccessTrace {
  readonly attempt: Attempt;
  stage: Stage;
  detail: string;
}

// The server uses this client hint only for diagnostics. Keep the trace on the exact
// request dispatched by the serving boundary; concurrent reads may be for different views.
const traces = new WeakMap<Request, CharterAccessTrace>();
export function beginCharterAccess(request: Request, site: boolean, pathname: string): CharterAccessTrace | undefined {
  if (!site || pathname !== '/api/community/raid-teams') return;
  try {
    if (request.method !== 'GET') return;
    const attempt = request.headers.get('X-Olympus-Charter-Check');
    if (attempt !== 'initial' && attempt !== 'auto_retry' && attempt !== 'manual_retry') return;
    const trace: CharterAccessTrace = { attempt, stage: 'admission', detail: 'none' };
    traces.set(request, trace);
    return trace;
  } catch { return; }
}

export function charterAccessTrace(request: Request): CharterAccessTrace | undefined {
  return traces.get(request);
}

// Emit only literals from the classifier. SQLite messages can embed SQL, identifiers
// and bound data; even their hashes would become persistent correlators.
function databaseDetail(text: string) {
  if (text.startsWith('D1_TYPE_ERROR:')) return 'd1_type';
  if (text.startsWith('D1_COLUMN_NOTFOUND:')) return 'd1_column_not_found';
  const body = text.replace(/^D1_(?:ERROR|EXEC_ERROR):\s*/, '');
  if (body.startsWith('no such table:')) return 'sqlite_missing_table';
  if (body.startsWith('no such column:')) return 'sqlite_missing_column';
  if (body.startsWith('database is locked') || /(?:^|: )SQLITE_BUSY$/.test(body)) return 'sqlite_busy';
  if (body.startsWith('database table is locked') || /(?:^|: )SQLITE_LOCKED$/.test(body)) return 'sqlite_locked';
  if (body.startsWith('too many SQL variables')) return 'sqlite_variable_limit';
  if (body.startsWith('database schema has changed') || /(?:^|: )SQLITE_SCHEMA$/.test(body)) return 'sqlite_schema';
  if (/(?:^|: )SQLITE_IOERR$/.test(body)) return 'sqlite_io';
  if (/(?:^|: )SQLITE_CORRUPT$/.test(body)) return 'sqlite_corrupt';
  if (/(?:^|: )SQLITE_ERROR$/.test(body)) return 'sqlite_error';
  if (text.startsWith('D1_EXEC_ERROR:')) return 'd1_execution';
}

// The authority boundary discards the original exception. Carry only the fixed
// diagnostic category across it, with the same lifetime as the replacement error.
type DatabaseDetail = NonNullable<ReturnType<typeof databaseDetail>>;
const wrappedDetails = new WeakMap<Error, DatabaseDetail>();
function inspectDatabaseError(error: unknown): DatabaseDetail | undefined {
  let item = error;
  let general: DatabaseDetail | undefined;
  for (let depth = 0; depth < 3 && item != null; depth++) {
    const message = typeof item === 'string' ? item : (item as Error).message;
    if (typeof message === 'string') {
      const detail = databaseDetail(message.slice(0, 2048));
      if (detail === 'sqlite_error' || detail === 'd1_execution') general ??= detail;
      else if (detail) return detail;
    }
    item = (item as Error).cause;
  }
  return general;
}
export function retainCharterDatabaseDetail(wrapper: Error, original: unknown): void {
  try {
    const detail = inspectDatabaseError(original);
    if (detail) wrappedDetails.set(wrapper, detail);
  } catch { /* diagnostics are optional */ }
}

export function noteCharterError(trace: CharterAccessTrace | undefined, error: unknown, knownCause?: string): void {
  if (!trace || trace.detail !== 'none') return;
  try {
    const cause = isHeldCause(knownCause) ? knownCause : heldCause(error);
    if (cause !== 'd1_other' && cause !== 'other') { trace.detail = cause; return; }
    trace.detail = wrappedDetails.get(error as Error) ?? inspectDatabaseError(error)
      ?? (cause === 'd1_other' ? 'd1_unclassified' : 'unclassified');
  } catch { trace.detail = 'unclassified'; }
}

export function finishCharterAccess(trace: CharterAccessTrace | undefined, response: Response): Response {
  if (trace) {
    try {
      if (response.status >= 500) console.error('charter access check', trace.attempt, response.status, trace.stage, trace.detail);
      else console.info('charter access check', trace.attempt, response.status, trace.stage, trace.detail);
    } catch {}
  }
  return response;
}
