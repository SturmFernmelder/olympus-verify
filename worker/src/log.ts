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
  const status = (e as { status?: unknown })?.status;
  const bounded = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? `(${status})` : "";
  return `${categorize(e)}${bounded}`;
}

/** The category is decided by the error's kind, never by copying any of its text. */
function categorize(e: unknown): ErrorCategory {
  if (!(e instanceof Error)) return "thrown";
  if (typeof (e as { status?: unknown }).status === "number") return "upstream"; // DiscordError and any fetch-shaped failure
  if (e.message.startsWith("D1_")) return "d1"; // D1_ERROR, D1_TYPE_ERROR, D1_EXEC_ERROR: a prefix test, the text is dropped
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
