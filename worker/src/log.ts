/**
 * .51 (1 Oct 2026): what a failure may say in the Worker's log.
 *
 * Workers Logs are on since .49 (wrangler.toml [observability]), so everything console.* writes is kept by the
 * provider, and an upstream or D1 message can carry a table name, a host, a code, a token fragment or a BattleTag
 * (Codex's review of .49, 1 Oct 00:04 UTC). A failure is therefore logged as one of a fixed set of categories, plus
 * the HTTP status when the error carries one (bounded to 100-599). Nothing derived from the message or the error's
 * name is written: a digest of either would be a long-lived derived identifier when the text holds a tag, and
 * reversible by trial when it holds a short code (Codex, 00:42 UTC). The route label and the request id that the
 * callers log beside it are the correlation; the message itself stays in the thrown error for the code that catches it.
 */
export type ErrorCategory = "upstream" | "d1" | "timeout" | "aborted" | "type" | "syntax" | "range" | "error" | "thrown";

export function errorRef(e: unknown): string {
  try {
    const status = (e as { status?: unknown })?.status;
    const bounded = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? `(${status})` : "";
    return `${categorize(e)}${bounded}`;
  } catch { return "thrown"; } // A hostile getter or Proxy cannot replace the caller's response.
}

/** The category is decided by the error's kind, never by copying any of its text. */
function categorize(e: unknown): ErrorCategory {
  if (!(e instanceof Error)) return "thrown";
  if (typeof (e as { status?: unknown }).status === "number") return "upstream"; // DiscordError and any fetch-shaped failure
  if (typeof e.message === "string" && e.message.startsWith("D1_")) return "d1"; // D1_ERROR, D1_TYPE_ERROR, D1_EXEC_ERROR: a prefix test, the text is dropped
  switch (e.name) {
    case "TimeoutError":
      return "timeout";
    case "AbortError":
      return "aborted";
    case "TypeError":
      return "type";
    case "SyntaxError":
      return "syntax";
    case "RangeError":
      return "range";
    default:
      return "error";
  }
}

/** A Discord custom_id without its payload: the part after the first colon carries user or row ids. */
export const idNamespace = (id: string | undefined): string => (id ?? "").split(":")[0];

/** A request path for the log: the pathname only (never the query), cut short. */
export const logPath = (path: string): string => path.slice(0, 64);

/**
 * 14 Nov 2026 (the refused reload): why a request was held, as one label of a closed list. The message and one level
 * of cause.message are read (each cut to 2,048 characters). A leading D1 prefix ("D1_ERROR: " and the like) is set
 * aside and the rest must START with one of the fixed texts below, so text quoted later in a message (an upstream
 * body) cannot select a label. Only the label leaves this function: no message, name, digest, SQL, bind, id or path.
 * It never throws. The admission reasons and the trigger refusals are written out by hand from the literals of
 * privacy-write-admission.ts and of RAISE(ABORT,'...') in src (tests/held_cause_labels_test.cjs fails when they drift).
 * The purpose a bound layer logs is the layer that caught the failure, not the guard that refused.
 */
export const ADMISSION_REASONS = Object.freeze([
  "alias_original_required", "column", "counted_requires_central_owned_alias", "current_schema_unconfirmed", "dump",
  "epoch_requires_separate_closed_transition", "exec", "first_changes_requires_closed_constructor", "foreign_native_statement",
  "foreign_statement_scope", "known_commit_reply_unconfirmed", "method_descriptor", "original_cost_context_lost",
  "original_cost_group", "original_cost_overflow", "original_epoch_required", "original_group_changed",
  "original_method_changed", "plan_too_large", "purpose", "raw_epoch_boundary_unqualified", "raw_options",
  "read_epoch_unconfirmed", "session", "unqualified_layout", "unregistered_database", "unsupported_bind",
  "unsupported_constructor",
] as const);
/** The RAISE(ABORT,'...') texts of the schema's triggers: a statement refused by a trigger, not a storage failure. */
export const TRIGGER_REFUSALS = Object.freeze([
  "active_rejection_reference_held", "beta_challenge_window_immutable", "beta_dispatch_seal_immutable", "beta_key_window_immutable",
  "beta_proof_window_immutable", "beta_request_window_immutable", "beta_window_immutable", "original_account_incarnation_changed",
  "privacy_epoch_control_delete_refused", "privacy_write_admission_required", "rejection_decision_immutable",
  "rejection_expiry_control_held", "rejection_expiry_control_immutable", "rejection_expiry_page_held", "rejection_reference_held",
  "rejection_tuple_held", "surviving_rejection_owner_held",
] as const);
const BASE_CAUSES = Object.freeze(["authority", "shape", "admission", "session", "user_held", "sql_json_refused", "sql_trigger_refused",
  "storage_limit", "storage_reset", "storage_network", "storage_transient", "storage_overloaded", "storage_other", "other"] as const);
const admissionLabels = new Map<string, string>(ADMISSION_REASONS.map((r) => [r, `admission:${r}`]));
export const HELD_CAUSES: readonly string[] = Object.freeze([...BASE_CAUSES, ...admissionLabels.values()]);
export type HeldCause = string;
const heldCauseSet = new Set<string>(HELD_CAUSES);
export const isHeldCause = (value: unknown): value is HeldCause => typeof value === "string" && heldCauseSet.has(value);
/** Whether the actual failed database group wrote; provenance is private to the bound database module. */
export const HELD_GROUPS = Object.freeze(["read", "write", "unknown"] as const);
export type HeldGroup = (typeof HELD_GROUPS)[number];
export const isHeldGroup = (value: unknown): value is HeldGroup => value === "read" || value === "write" || value === "unknown";
/**
 * The only labels for which a held GET or HEAD read group is answered read_unavailable: the classes Cloudflare lists
 * as safe to retry (reset, lost connection, transient remote). Overload, limits, any other D1 text, refusals and
 * unknown text keep the existing answer.
 */
export const READ_UNAVAILABLE_CAUSES = Object.freeze(["storage_reset", "storage_network", "storage_transient"] as const);
export function readUnavailable(label: unknown, group: unknown, method: unknown): boolean {
  return (method === "GET" || method === "HEAD") && group === "read" && (READ_UNAVAILABLE_CAUSES as readonly unknown[]).includes(label);
}
const TEXT_LIMIT = 2048;
/** Fixed starts of the text after any D1 prefix, in this order; the first that starts the message or the cause wins. */
const TEXT_RULES: readonly (readonly [string, readonly string[]])[] = Object.freeze([
  ["sql_json_refused", ["malformed JSON"]],
  ["sql_trigger_refused", TRIGGER_REFUSALS],
  ["storage_limit", ["D1 DB storage operation exceeded timeout", "D1 DB exceeded its CPU time limit", "D1 DB's isolate exceeded its memory limit",
    "D1 query result exceeded the maximum response size", "Your account has exceeded D1's", "Exceeded maximum DB size"]],
  ["storage_reset", ["D1 DB reset because its code was updated", "Internal error while starting up D1 DB storage caused object to be reset",
    "Internal error in D1 DB storage caused object to be reset"]],
  ["storage_network", ["Network connection lost"]],
  ["storage_transient", ["Cannot resolve D1 DB due to transient issue", "Replica disconnected from primary", "Can't read from request stream"]],
  ["storage_overloaded", ["D1 DB is overloaded"]],
] as const);
/** "D1_ERROR: text" (any D1_ code of capitals and underscores) gives "text"; anything else is returned unchanged. */
function afterD1Prefix(text: string): string {
  if (!text.startsWith("D1_")) return text;
  const end = text.indexOf(": ");
  if (end < 3 || end > 40) return text;
  for (let i = 3; i < end; i++) { const c = text.charCodeAt(i); if (!(c >= 65 && c <= 90) && c !== 95) return text; }
  return text.slice(end + 2);
}

/** One property of a value, read inside a try: a string cut short, or null. A getter or Proxy trap that throws is null. */
function textOf(value: unknown, key: "message"): string | null {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return null;
    const text = (value as Record<string, unknown>)[key];
    return typeof text === "string" ? text.slice(0, TEXT_LIMIT) : null;
  } catch { return null; }
}
function causeOf(value: unknown): unknown {
  try {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
    return (value as { cause?: unknown }).cause;
  } catch { return undefined; }
}
function textRule(message: string | null, cause: string | null): HeldCause | null {
  const m = message === null ? null : afterD1Prefix(message), c = cause === null ? null : afterD1Prefix(cause);
  for (const [label, starts] of TEXT_RULES) {
    for (const start of starts) if (m?.startsWith(start) || c?.startsWith(start)) return label;
  }
  if (message?.startsWith("D1_")) return "storage_other";
  return null;
}

export function heldCause(e: unknown): HeldCause {
  try {
    const message = textOf(e, "message");
    if (message === "privacy_site_request_held") return "authority"; // Trusted bound-failure facts live only in their owning module.
    if (message !== null && message.startsWith("privacy_write_admission_held:")) {
      return admissionLabels.get(message.slice("privacy_write_admission_held:".length)) ?? "admission";
    }
    if (message === "original_site_session_held") return "session";
    if (message === "privacy_original_user_held") return "user_held";
    return textRule(message, textOf(causeOf(e), "message")) ?? "other";
  } catch { return "other"; }
}

export type ElapsedClass = "under_100ms" | "under_500ms" | "under_2s" | "2s_or_more" | "unknown";
export function elapsedClass(ms: unknown): ElapsedClass {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "unknown";
  return ms < 100 ? "under_100ms" : ms < 500 ? "under_500ms" : ms < 2000 ? "under_2s" : "2s_or_more";
}
/** Milliseconds for elapsedClass only; NaN (class unknown) if the clock cannot be read. */
export function clockMs(): number {
  try { return Date.now(); } catch { return NaN; }
}

/**
 * The route family of a request path, as one label of a closed list, from fixed prefixes. No part of the path is
 * copied (admin paths carry Discord ids). Built from the routers of index.ts, site.ts, site-api.ts, site-admin.ts,
 * community-routes.ts, site-treasury-access.ts and ingest.ts.
 */
const ROUTE_PREFIXES: readonly (readonly [string, string])[] = Object.freeze([
  ["/api/admin", "api_admin"], ["/api/me", "api_me"], ["/api/application", "api_application"],
  ["/api/community", "api_community"], ["/api/treasury-plan", "api_treasury"], ["/api/privacy", "privacy"],
  ["/api/news", "api_news"], ["/api/qr", "api_qr"], ["/api/army", "api_army"], ["/api", "api_other"],
  ["/static", "static"], ["/auth", "auth"], ["/privacy", "privacy"], ["/ingest", "ingest"], ["/queue", "queue"],
  ["/interactions", "interactions"], ["/health", "health"], ["/internal", "internal"], ["/admin", "admin"],
  ["/linked-role", "linked_role"], ["/oauth/callback", "linked_role"], ["/bnet/link", "linked_role"], ["/proof", "proof"],
] as const);
export const ROUTE_CLASSES: readonly string[] = Object.freeze([...new Set([...ROUTE_PREFIXES.map(([, label]) => label), "page", "other"])]);
export function routeClass(path: unknown): string {
  try {
    if (typeof path !== "string") return "other";
    if (path === "/" || path === "/index.html") return "page";
    for (const [prefix, label] of ROUTE_PREFIXES) {
      if (path === prefix || (path.startsWith(prefix) && path.charAt(prefix.length) === "/")) return label;
    }
    return "other";
  } catch { return "other"; }
}

/**
 * Design 2.5: the cost of the per-read schema proof in production, for one read group in 256 of an isolate, from the
 * proof statement's own result meta (duration, rows_read) in fixed classes. It never throws and changes nothing.
 */
let proofCostGroups = 0;
export type DurationClass = "under_10ms" | "under_50ms" | "under_200ms" | "under_1s" | "1s_or_more" | "unknown";
export type RowsReadClass = "under_1k" | "under_10k" | "under_100k" | "under_1m" | "1m_or_more" | "unknown";
export function durationClass(ms: unknown): DurationClass {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "unknown";
  return ms < 10 ? "under_10ms" : ms < 50 ? "under_50ms" : ms < 200 ? "under_200ms" : ms < 1000 ? "under_1s" : "1s_or_more";
}
export function rowsReadClass(rows: unknown): RowsReadClass {
  if (typeof rows !== "number" || !Number.isFinite(rows) || rows < 0) return "unknown";
  return rows < 1e3 ? "under_1k" : rows < 1e4 ? "under_10k" : rows < 1e5 ? "under_100k" : rows < 1e6 ? "under_1m" : "1m_or_more";
}
export function proofCostSample(proofResult: unknown): void {
  try {
    proofCostGroups = (proofCostGroups + 1) % 256;
    if (proofCostGroups !== 0) return;
    let duration: unknown, rows: unknown;
    try {
      const meta = proofResult !== null && typeof proofResult === "object" ? (proofResult as { meta?: unknown }).meta : undefined;
      if (meta !== null && typeof meta === "object") { duration = (meta as { duration?: unknown }).duration; rows = (meta as { rows_read?: unknown }).rows_read; }
    } catch { duration = undefined; rows = undefined; }
    console.log("proof cost", durationClass(duration), rowsReadClass(rows));
  } catch { /* a log line never changes the read group */ }
}
