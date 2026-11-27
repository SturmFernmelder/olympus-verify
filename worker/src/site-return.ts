/** Same-origin member landing pages carried by the site's ordinary Discord sign-in. */
const ROUTES = new Set([
  "apply", "army", "community/calendar", "community/raid-teams", "community/workshop", "governance",
  "guild-rosters", "guides/tools/attunements", "organization", "resources", "roles", "vote",
]);
const CALENDAR_EVENT = /^community\/calendar\/[A-Za-z0-9_-]{22}(?:\/roster)?$/;
const CALENDAR_EVENT_LENGTH = "community/calendar/".length + 22;

function safeReturn(value: unknown): string | null {
  return typeof value === "string" && (ROUTES.has(value) || ((value.length === CALENDAR_EVENT_LENGTH || value.length === CALENDAR_EVENT_LENGTH + "/roster".length) && CALENDAR_EVENT.test(value))) ? value : null;
}

function oneReturn(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? safeReturn(values[0]) : null;
}

export const siteEntryReturn = (url: URL): string | null => url.pathname === "/" ? oneReturn(url.searchParams, "to") : null;
export const siteLoginReturn = (url: URL): string | null => oneReturn(url.searchParams, "return");
export function siteReturnLocation(route: string | null): string {
  const accepted = safeReturn(route);
  return accepted ? "/#/" + accepted : "/";
}

export function siteLoginLocation(route: string | null, consent = false): string {
  const query = new URLSearchParams();
  const accepted = safeReturn(route);
  if (consent) query.set("consent", "1");
  if (accepted) query.set("return", accepted);
  return "/auth/login" + (query.size ? "?" + query : "");
}

/** Read only after the callback has verified the existing host-bound OAuth state MAC. */
export function siteReturnFromVerifiedState(state: string, at: number): string | null {
  if (!state.endsWith("n") && !state.endsWith("c")) return null;
  try {
    const { issuedAt, returnTo } = JSON.parse(atob(state.slice(0, -1).replace(/-/g, "+").replace(/_/g, "/")));
    return Number.isSafeInteger(issuedAt) && issuedAt > at - 600 && issuedAt <= at ? safeReturn(returnTo) : null;
  } catch {
    return null;
  }
}

/** The caller supplies the site host already admitted by the Discord destination guard. */
export function siteMemberLink(host: string, route: string): string {
  const accepted = safeReturn(route);
  return "https://" + host + "/" + (accepted ? "?to=" + encodeURIComponent(accepted) : "");
}
