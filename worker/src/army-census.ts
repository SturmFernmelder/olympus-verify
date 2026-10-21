/** Owner-authorized aggregate publishing, 20 October 2026. No character rows or reporter identity enter storage. */
import type { Env } from "./env";
import { apiJson, currentUser, originalUserSession, isSiteAdmin, PAGE_VERSION, sameOrigin, rateLimited, sign, verify, b64u } from "./site-core";
import { privacyBoundSiteEnv } from "./privacy-serving-authority";
import { communityContext, captureCommunitySubject, admitted, admittedReadAs, DB_NOW, fenceSql, FENCE_REFUSED, type CommunityContext } from "./community-context";
import { checkOriginalNativeRequest, checkOriginalNativeHeaders } from "./privacy-native-http-intrinsics";
import { readRaw, PreviewRefusal } from "./army-body";

export interface ArmySnapshot {
  format: "olympus-stat-observation-v2"; scope: "own-guild"; source: "volunteer-client";
  sourceVerified: false; membershipProof: false; addonVersion: "0.2.0";
  realmGroup: string; faction: "Alliance" | "Horde"; observedAt: number;
  guilds: [{ name: string; receivedAt: number; reportedCharacters: number | "few";
    online: number | "few" | null; classes: number[] | null; levels: number[] | null; ranks: number[] | null }];
}
const PREFIX = "army:census:v2:";
const ROOT = ["format", "scope", "source", "sourceVerified", "membershipProof", "addonVersion", "realmGroup", "faction", "observedAt", "guilds"];
const GUILD = ["name", "receivedAt", "reportedCharacters", "online", "classes", "levels", "ranks"];
const NAMES = ["Olympus", "Olympus I", "Olympus II", "Olympus III", "Olympus IV", "Olympus V", "Olympus VI", "Olympus VII", "Olympus VIII", "Olympus IX", "Olympus X"];
const HEADER_NAMES = ["Content-Type", "Content-Encoding", "Content-Length", "Origin", "Sec-Fetch-Site", "X-Olympus", "Cookie"];
function bad(code = "invalid_aggregate", status = 400): never { throw new PreviewRefusal(code, status); }
function keys(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join("|") !== expected.join("|")) bad();
}
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function slot(name: string): number { return NAMES.indexOf(name); }
export function armyKey(snapshot: ArmySnapshot): string { return PREFIX + String(slot(snapshot.guilds[0].name) + 1); }

/** Reject unknown fields rather than redact them after persistence. Bucket labels are fixed, never client-supplied names. */
export function validateArmySnapshot(value: unknown, now: number, fresh = true): ArmySnapshot {
  keys(value, ROOT);
  if (value.format !== "olympus-stat-observation-v2" || value.scope !== "own-guild" || value.source !== "volunteer-client" || value.sourceVerified !== false || value.membershipProof !== false || value.addonVersion !== "0.2.0") bad();
  // Owner names the product/realm-group scope, not a future in-game free-text realm label.
  // The browser retains the raw game label locally and sends only this fixed, explicitly confirmed identifier.
  if (value.realmGroup !== "World of Warcraft: Forever PvE" || value.faction !== "Alliance") bad("unsupported_scope");
  if (!integer(now, 0, 4102444800) || !integer(value.observedAt, 0, now) || fresh && now - value.observedAt > 86400) bad("stale_observation");
  if (!Array.isArray(value.guilds) || value.guilds.length !== 1) bad();
  const row = value.guilds[0]; keys(row, GUILD);
  if (typeof row.name !== "string" || slot(row.name) < 0 || !integer(row.receivedAt, 0, value.observedAt as number) || (value.observedAt as number) - row.receivedAt > 86400 || fresh && now - row.receivedAt > 86400) bad();
  const total = row.reportedCharacters, online = row.online;
  if (total !== "few" && !integer(total, 5, 1000)) bad();
  if (total === "few" && online !== null) bad();
  if (online !== null && online !== "few" && (!integer(online, 0, typeof total === "number" ? total : 0) || online > 0 && online < 5)) bad();
  if (typeof online === "number" && typeof total === "number" && online >= 5 && total - online > 0 && total - online < 5) bad();
  // The upload must withhold already-old online data at the server receipt clock. Historical public reads remask again.
  if ((fresh ? now : value.observedAt as number) - (row.receivedAt as number) > 900 && online !== null) bad();
  for (const [field, length] of [["classes", 9], ["levels", 7], ["ranks", 10]] as const) {
    const dist = row[field]; if (dist === null) continue;
    if (total === "few" || !Array.isArray(dist) || dist.length !== length || dist.some(n => !integer(n, 0, 1000) || n > 0 && n < 5) || dist.reduce((a: number, b: number) => a + b, 0) !== total) bad();
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1023) bad();
  return value as unknown as ArmySnapshot;
}

type Row = { value: string; updated_at: number; updated_by: string | null };
const snapshotStatement = (env: Env, key: string) => env.DB.prepare("SELECT value, updated_at, updated_by FROM site_settings WHERE key = ?1").bind(key);
const digest = async (text: string) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
function parsed(row: Row, now: number): ArmySnapshot | null {
  try { if (row.updated_by !== null || row.value.length > 1023) return null; const v = validateArmySnapshot(JSON.parse(row.value), now, false); if (v.observedAt !== row.updated_at || JSON.stringify(v) !== row.value) return null; return v; } catch { return null; }
}
export async function armyPublic(request: Request, env: Env): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return apiJson({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
  if (new URL(request.url).search) return apiJson({ error: "bad_request" }, 400);
  const out = await env.DB.batch([env.DB.prepare(`SELECT ${DB_NOW} AS now`), env.DB.prepare("SELECT key, value, updated_at, updated_by FROM site_settings WHERE key GLOB 'army:census:v2:*' ORDER BY CAST(SUBSTR(key,16) AS INTEGER),key LIMIT 12")]);
  const now = (out[0]?.results?.[0] as { now: number } | undefined)?.now;
  if (!integer(now, 0, 4102444800)) return apiJson({ error: "clock_held" }, 503);
  const snapshots: ArmySnapshot[] = [];
  for (const row of out[1]?.results ?? []) {
    const stored = row as Row & { key: string }, value = parsed(stored, now);
    if (!value || stored.key !== armyKey(value)) return apiJson({ error: "aggregate_held" }, 503);
    const copy = JSON.parse(JSON.stringify(value)) as ArmySnapshot;
    if (now - copy.guilds[0].receivedAt > 900) copy.guilds[0].online = null;
    snapshots.push(copy);
  }
  const response = apiJson({ format: "olympus-army-public-v1", now, snapshots });
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

type Reporter = { env: Env; ctx: CommunityContext; check: () => void };
export async function armyReporter(request: Request, env: Env): Promise<Reporter | Response> {
  checkOriginalNativeRequest(request); checkOriginalNativeHeaders(request.headers);
  const user = await currentUser(env, request);
  if (!user) return apiJson({ error: "signed_out" }, 401);
  if (!isSiteAdmin(env, user.discord_id) || !user.in_server || user.denied) return apiJson({ error: "forbidden" }, 403);
  env = privacyBoundSiteEnv(env, originalUserSession(user));
  const ctx = await communityContext(env, request);
  if (!ctx.subject || !ctx.capabilities.communityStaff || ctx.facts.banned) return apiJson({ error: "forbidden" }, 403);
  const subject = ctx.subject, capture = captureCommunitySubject(subject), url = request.url, method = request.method, headers = request.headers, values = HEADER_NAMES.map(h => headers.get(h)), admins = env.SITE_ADMINS;
  const check = () => { capture.check(); checkOriginalNativeRequest(request); checkOriginalNativeHeaders(headers);
    if (ctx.subject !== subject || request.url !== url || request.method !== method || request.headers !== headers || HEADER_NAMES.some((h, i) => headers.get(h) !== values[i]) || env.SITE_ADMINS !== admins || !isSiteAdmin(env, subject.discordId)) throw Error("army_original_request_held"); };
  check(); return { env, ctx, check };
}
async function read(reporter: Reporter, key?: string) {
  reporter.check(); const s = reporter.ctx.subject!;
  const result = await admittedReadAs(reporter.env, s, "applicantWrite", [reporter.env.DB.prepare(`SELECT ${DB_NOW} AS now, EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AS banned`).bind(s.discordId), ...(key ? [snapshotStatement(reporter.env, key)] : [])]);
  reporter.check(); if (result === FENCE_REFUSED) bad("account_changed", 403);
  const clock = result[0]?.results?.[0] as { now: number; banned: number } | undefined;
  if (!clock || !integer(clock.now, 0, 4102444800)) bad("clock_held", 503);
  if (clock.banned) bad("forbidden", 403);
  const row = (result[1]?.results?.[0] ?? null) as Row | null;
  if (row && (!parsed(row, clock.now) || !key || armyKey(parsed(row, clock.now)!) !== key)) bad("aggregate_held", 503);
  return { now: clock.now, row };
}
type Claims = { issued: number; expires: number; digest: string; key: string; previous: string | null };
async function token(reporter: Reporter, claims: Claims): Promise<string> {
  const text = b64u(new TextEncoder().encode(JSON.stringify(claims)));
  reporter.check(); const mac = await sign(reporter.env.COOKIE_SECRET!, "army-publish-v1", text + "|" + JSON.stringify(reporter.ctx.subject!.originalSession)); reporter.check(); return text + "." + mac;
}
async function claimsFor(reporter: Reporter, value: unknown, snapshot: ArmySnapshot, now: number, allowExpired = false): Promise<Claims> {
  if (typeof value !== "string" || value.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) bad("invalid_preview");
  const [text, mac] = value.split(".") as [string, string];
  reporter.check(); const ok = await verify(reporter.env.COOKIE_SECRET!, "army-publish-v1", text + "|" + JSON.stringify(reporter.ctx.subject!.originalSession), mac); reporter.check();
  if (!ok) bad("invalid_preview", 403);
  let c: unknown; try { c = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4)), ch => ch.charCodeAt(0)))); } catch { bad("invalid_preview"); }
  keys(c, ["issued", "expires", "digest", "key", "previous"]);
  if (!integer(c.issued, 0, now) || !integer(c.expires, c.issued, c.issued + 900) || !allowExpired && c.expires <= now || c.key !== armyKey(snapshot) || c.digest !== await digest(JSON.stringify(snapshot)) || c.previous !== null && (typeof c.previous !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(c.previous))) bad("preview_expired", 409);
  reporter.check(); return c as unknown as Claims;
}

export async function armyPrivate(request: Request, env: Env, path: string): Promise<Response> {
  try {
    if (!(["/api/army/reporter", "/api/army/preview", "/api/army/publish", "/api/army/outcome"] as string[]).includes(path)) return apiJson({ error: "not_found" }, 404);
    if (new URL(request.url).search) return apiJson({ error: "bad_request" }, 400);
    const expected = path.endsWith("/reporter") ? "GET" : "POST";
    if (request.method !== expected) return apiJson({ error: "method_not_allowed" }, 405, { Allow: expected });
    const reporter = await armyReporter(request, env); if (reporter instanceof Response) return reporter;
    if (expected === "GET") { const state = await read(reporter); return apiJson({ format: "olympus-army-reporter-v1", canPublish: true, now: state.now }); }
    if (!sameOrigin(request)) return apiJson({ error: "bad_origin" }, 403);
    if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload" }, 409);
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get("Content-Type") ?? "") || request.headers.has("Content-Encoding")) return apiJson({ error: "unsupported_content_type" }, 415);
    const length = request.headers.get("Content-Length");
    if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || !integer(Number(length), 0, 8192))) return apiJson({ error: "body_too_large" }, 413);
    await read(reporter); reporter.check();
    if (rateLimited("army-publish:" + reporter.ctx.subject!.discordId, 20, 60)) return apiJson({ error: "slow_down" }, 429);
    const raw = await readRaw(request, reporter.check); reporter.check();
    let body: unknown; try { body = JSON.parse(raw); } catch { bad(); }
    const preview = path.endsWith("/preview"), outcome = path.endsWith("/outcome");
    keys(body, preview ? ["snapshot"] : outcome ? ["snapshot", "previewToken"] : ["snapshot", "previewToken", "confirm"]);
    if (JSON.stringify(body) !== raw) bad();
    const clock = await read(reporter), snapshot = validateArmySnapshot(body.snapshot, clock.now, !outcome), key = armyKey(snapshot), value = JSON.stringify(snapshot), current = await read(reporter, key);
    if (preview) {
      const expiresAt = Math.min(current.now + 900, snapshot.observedAt + 86400, snapshot.guilds[0].receivedAt + 86400);
      const previewToken = await token(reporter, { issued: current.now, expires: expiresAt, digest: await digest(value), key, previous: current.row ? await digest(current.row.value) : null });
      return apiJson({ format: "olympus-army-preview-v1", snapshot, previewToken, expiresAt, now: current.now, persisted: false });
    }
    const claims = await claimsFor(reporter, body.previewToken, snapshot, current.now, outcome);
    if (outcome) return apiJson({ state: current.row?.value === value ? "published" : current.row && current.row.updated_at >= snapshot.observedAt ? "superseded" : "not_current" });
    if (body.confirm !== "PUBLISH") bad("confirm_required");
    if (current.row?.value === value) return apiJson({ state: "published", snapshot });
    if ((current.row ? await digest(current.row.value) : null) !== claims.previous || current.row && current.row.updated_at >= snapshot.observedAt) bad("snapshot_changed", 409);
    const s = reporter.ctx.subject!; reporter.check();
    const out = await admitted(reporter.env, reporter.ctx, [reporter.env.DB.prepare(
      `INSERT INTO site_settings (key,value,updated_at,updated_by)
       SELECT ?4,?5,?7,NULL WHERE ${fenceSql("applicantWrite", 1, 2, 3, s.privacyGeneration, s.accountIncarnation)}
       AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1)
       AND (SELECT value FROM site_settings WHERE key=?4) IS ?6
       AND COALESCE((SELECT updated_at FROM site_settings WHERE key=?4),-1) < ?7
       AND ?7<=${DB_NOW} AND ?7>=${DB_NOW}-86400 AND ?8>${DB_NOW}
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=NULL`,
    ).bind(s.discordId, s.sessionVersion, s.expiresAt, key, value, current.row?.value ?? null, snapshot.observedAt, claims.expires)]);
    reporter.check(); if (out === FENCE_REFUSED) bad("snapshot_or_account_changed", 409);
    return apiJson({ state: "published", snapshot });
  } catch (e) { if (e instanceof PreviewRefusal) return apiJson({ error: e.code }, e.status); throw e; }
}
