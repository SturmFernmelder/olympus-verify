/**
 * .70 (1 Oct 2026): departure review items, consolidation batch 4b (second half) of Codex's adapter map, ported from
 * Olympus Forever's src/departures.ts onto the keeper's door, on the contract Codex set at 02:41 UTC:
 *
 *  - A departure creates a BOUNDED STAFF REVIEW ITEM only. Nothing here kicks, bans, denies, opens a case or touches a
 *    role by itself; the keeper's roster diff and the bot's own actions are untouched. An item says: this account's
 *    character left the guild (the keeper's own `characters.status = 'left'` with its `left_at`), and, where the keeper's
 *    own audit row for that departure says so, whether it was a leave or a removal (`kind`: left | removed | unknown).
 *  - Intake (cron, while `departures` is on): the keeper's confirmed departures of the last 30 days, at least five minutes
 *    old (so a departure stamped just before the read cannot land behind it), for accounts that have signed in here (the
 *    keeper rule, like trials); one item per (account, character, departure), repeats create nothing. The donor read a
 *    separate Olympus Verify database read-only; here the keeper IS that database, so no cross-database read exists.
 *  - Staff (`communityStaff`): list open items first, oldest departure first (the oldest open item is the nearest to its
 *    deletion); acknowledge, or open a restriction case from the item in the SAME batch (community-restrictions.ts
 *    restrictionCaseStatements, admitted by this write's nonce) with the staff page's default dates, only while the
 *    `restrictions` flag is on. Never one's own item. Integer revision compare-and-set; the random id is never reused and
 *    serves as the incarnation.
 *  - Lifetime (.66's rule): `retain_until` = 30 days after the departure was observed is the effective cutoff, judged by
 *    the database clock inside every read and write; the bounded purge is physical cleanup and runs whatever the flag says.
 *  - Erasure: the member's items go; a staff member is anonymized as reviewer. The account copy lists the member's items
 *    (character, kind, dates, status), never who reviewed them or the case opened (the restrictions copy lists cases).
 * Seconds in D1; ISO-8601 at the boundary. Behind `departures` in COMMUNITY_FEATURES (off).
 *
 * .73 (Codex's .70 decisions, 1 Oct 04:04 UTC): (1) the intake requalifies inside its INSERT: the account's live row,
 * the exact `characters` row still `left` at that `left_at` under that name and key, and the item's `retain_until`
 * ahead of the database clock, so an erasure before the insert cannot resurrect the account and a held candidate past
 * 30 days inserts nothing; from that instant the item is the historical event-time fact (a later rejoin or rebind is
 * not a defect and does not touch it); (2) the kind comes only from a `roster.left` row whose `details.discordId` is
 * the same account (a namesake's row never relabels it); (3) the candidate scan pages by keyset within one bounded run,
 * so permanently invalid names cannot starve later valid departures; (4) every payload is read under the reader's
 * admission: the pre-decision read and the refusal fallback are admitted reads, and the item a decision changed is read
 * inside the write's own batch (its nonce, live by the database clock).
 *
 * .76 (Codex's residual .73 CHANGES, 1 Oct 04:56 and 05:05 UTC): (1) the INSERT binds the candidate's captured site-account
 * INCARNATION (the row's `first_login` AND `session_version`, read in the scan, compared by equality), not merely that a
 * row exists, so an account erased and recreated under the same Discord id between the scan and the insert records
 * nothing (the keeper's `characters` row survives a site erasure by design; a recorded item still survives a later
 * rejoin); (2) progress across runs: a run that ends at its bounds keeps its scan position (`community_departure_scan`,
 * one row: one shared operational cursor, a departure time and a character name key, no Discord account ID) and the
 * next run continues from it, a run that scans to the end clears it, per-run bounds
 * unchanged and nothing dropped, so a long run of candidates the site cannot record never starves a later valid one.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, type SiteUser } from "./site-core";
import { admitted, admittedRead, DB_NOW, fenceSql, FENCE_REFUSED, randomToken, refusal, registerCommunityData, type CommunityContext } from "./community-context";
import { validateName } from "./community-names";
import { secondsToIso } from "./community-time";
import { cursorParts, encodeCursor } from "./community-directory";
import { isRestrictionCategory, RESTRICTION_DEFAULT_DAYS, restrictionCaseStatements } from "./community-restrictions";

export const DEPARTURE_RETENTION_S = 30 * 86400;
export const DEPARTURE_LIMITS = { pageSize: 100, intakeBatch: 500, intakePages: 10, settleSeconds: 300 } as const;
export const DEPARTURE_STATUSES = ["open", "acknowledged", "restriction_opened"] as const;
type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];
type Kind = "left" | "removed" | "unknown";
const ID = /^[A-Za-z0-9_-]{22}$/;
const DAY = 86400;
const DISPLAY = "COALESCE(u.nick, u.global_name, u.username)";
const LIVE = `d.retain_until > ${DB_NOW}`;

type Row = { id: string; discord_id: string; character_key: string; character_name: string; kind: Kind; observed_at: number; status: DepartureStatus; restriction_case_id: string | null; reviewed_at: number | null; revision: number; retain_until: number; display_name: string | null; live: number };
const SELECT = `SELECT d.id, d.discord_id, d.character_key, d.character_name, d.kind, d.observed_at, d.status, d.restriction_case_id, d.reviewed_at, d.revision, d.retain_until, ${DISPLAY} AS display_name, (${LIVE}) AS live
  FROM community_departure_reviews d LEFT JOIN site_users u ON u.discord_id = d.discord_id`;
const staffShape = (r: Row) => ({ id: r.id, discordId: r.discord_id, displayName: r.display_name, characterName: r.character_name, kind: r.kind, observedAt: secondsToIso(r.observed_at), status: r.status, restrictionCaseId: r.restriction_case_id, reviewedAt: r.reviewed_at === null ? null : secondsToIso(r.reviewed_at), revision: r.revision, retainUntil: secondsToIso(r.retain_until) });
/** .73: one item behind the reader's admission; FENCE_REFUSED when the reader lost standing since the context read. */
async function readItem(env: Env, ctx: CommunityContext, id: string): Promise<Row | null | typeof FENCE_REFUSED> {
  const out = await admittedRead(env, ctx, "applicantWrite", [env.DB.prepare(`${SELECT} WHERE d.id = ?1`).bind(id)]);
  return out === FENCE_REFUSED ? FENCE_REFUSED : ((out[0]!.results[0] as Row | undefined) ?? null);
}
/** .73: the item as this write left it, read as the write batch's last statement: the row carrying the write's nonce, live by the database clock. */
const writtenItem = (env: Env, id: string, nonce: string) => env.DB.prepare(`${SELECT} WHERE d.id = ?1 AND d.nonce = ?2 AND ${LIVE}`).bind(id, nonce);

class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
const bad = (e: unknown): Response | null => (e instanceof Bad ? apiJson({ error: e.code }, e.status) : null);
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);
const conflict = (error: string, row: Row | null) => apiJson({ error, ...(row ? { departure: staffShape(row) } : {}) }, 409);

/**
 * Cron: one bounded pass over the keeper's confirmed departures of the last 30 days, at least five minutes old. The kind
 * comes from the keeper's own `roster.left` audit row for that character of that SAME account around that time (its
 * `how` is the relayed chat line or "roster diff"); anything else is 'unknown'. Items are created for accounts that have
 * signed in here; a repeat (same account, character and departure) creates nothing. .73: the candidate scan pages by
 * keyset within the run (a name the site cannot show exactly is skipped, never starving later candidates), and the
 * insert requalifies every candidate inside its own statement. Returns the number created. `pageSize` is a test seam.
 */
export async function departureIntake(env: Env, at = now(), pageSize = DEPARTURE_LIMITS.intakeBatch): Promise<number> {
  const since = at - DEPARTURE_RETENTION_S, until = at - DEPARTURE_LIMITS.settleSeconds;
  type Candidate = { name_key: string; name: string; discord_id: string; left_at: number; first_login: number; session_version: number; kind: Kind };
  const items: { id: string; d: string; k: string; n: string; rn: string; p: string; kind: Kind; o: number; fl: number; sv: number }[] = [];
  // .76: continue where the last bounded run stopped (if that position is still inside the window), else from the start
  const stored = await env.DB.prepare("SELECT left_at, name_key FROM community_departure_scan WHERE id = 1 AND left_at > ?1").bind(since).first<{ left_at: number; name_key: string }>();
  let after: { left_at: number; name_key: string } | null = stored ?? null;
  let exhausted = false;
  for (let page = 0; page < DEPARTURE_LIMITS.intakePages && items.length < pageSize; page++) {
    const rows: D1Result<Candidate> = await env.DB.prepare(
      `SELECT c.name_key, c.name, c.discord_id, c.left_at, u.first_login, u.session_version,
              COALESCE((SELECT CASE WHEN instr(json_extract(a.details, '$.how'), 'kicked') > 0 THEN 'removed' WHEN instr(json_extract(a.details, '$.how'), 'left') > 0 THEN 'left' ELSE 'unknown' END
                        FROM audit a WHERE a.action = 'roster.left' AND a.subject = c.name AND json_extract(a.details, '$.discordId') = c.discord_id
                          AND a.ts BETWEEN c.left_at - 600 AND c.left_at + 600 ORDER BY a.ts DESC LIMIT 1), 'unknown') AS kind
       FROM characters c JOIN site_users u ON u.discord_id = c.discord_id
       WHERE c.status = 'left' AND typeof(c.left_at) = 'integer' AND c.left_at > ?1 AND c.left_at <= ?2
         AND (?4 = 0 OR c.left_at > ?5 OR (c.left_at = ?5 AND c.name_key > ?6))
         AND NOT EXISTS (SELECT 1 FROM community_departure_reviews d WHERE d.discord_id = c.discord_id AND d.proof_key = c.name_key AND d.observed_at = c.left_at)
       ORDER BY c.left_at, c.name_key LIMIT ?3`,
    ).bind(since, until, pageSize, after ? 1 : 0, after?.left_at ?? 0, after?.name_key ?? "").all<Candidate>();
    for (const r of rows.results) {
      const v = validateName(r.name);
      if (!v.ok || v.proofKey !== r.name_key || !/^\d{17,20}$/.test(r.discord_id) || items.length >= pageSize) continue; // a name the site cannot show exactly is not an item
      items.push({ id: randomToken(), d: r.discord_id, k: v.key, n: v.name, rn: r.name, p: r.name_key, kind: r.kind, o: r.left_at, fl: r.first_login, sv: r.session_version });
    }
    const last: Candidate | undefined = rows.results.at(-1);
    if (rows.results.length < pageSize || !last) {
      exhausted = true;
      break;
    }
    after = { left_at: last.left_at, name_key: last.name_key };
  }
  // .76: the position for the next run (a run that reached its bounds), or none (a run that scanned to the end)
  await (exhausted || !after
    ? env.DB.prepare("DELETE FROM community_departure_scan WHERE id = 1").run()
    : env.DB.prepare("INSERT INTO community_departure_scan (id, left_at, name_key, updated_at) VALUES (1, ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET left_at = excluded.left_at, name_key = excluded.name_key, updated_at = excluded.updated_at").bind(after.left_at, after.name_key, at).run());
  if (items.length === 0) return 0;
  const f = (name: string) => `json_extract(j.value, '$.${name}')`;
  // .73/.76: requalified inside the insert: the account's row as captured (its incarnation: first sign-in and session version), the exact departure row as the keeper still holds it, the lifetime ahead by the database clock
  const res = await env.DB.prepare(
    `INSERT INTO community_departure_reviews (id, discord_id, character_key, character_name, proof_key, kind, observed_at, status, created_at, revision, retain_until)
     SELECT ${f("id")}, ${f("d")}, ${f("k")}, ${f("n")}, ${f("p")}, ${f("kind")}, ${f("o")}, 'open', ?2, 1, ${f("o")} + ?3 FROM json_each(?1) j
     WHERE EXISTS (SELECT 1 FROM site_users u WHERE u.discord_id = ${f("d")} AND u.first_login = ${f("fl")} AND u.session_version = ${f("sv")})
       AND EXISTS (SELECT 1 FROM characters c WHERE c.discord_id = ${f("d")} AND c.name_key = ${f("p")} AND c.name = ${f("rn")} AND c.status = 'left' AND c.left_at = ${f("o")})
       AND ${f("o")} + ?3 > ${DB_NOW}
     ON CONFLICT DO NOTHING`,
  ).bind(JSON.stringify(items), at, DEPARTURE_RETENTION_S).run();
  const n = res.meta?.changes ?? 0;
  if (n) await audit(env, "cron", "community.departures_recorded", undefined, { created: n });
  return n;
}

/** GET /api/admin/community/departures[?status=][&cursor=] → {departures, nextCursor}: live items, open first, oldest departure first. */
export async function listDepartures(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  if (!ctx.features.has("departures")) return featureOff();
  try {
    const status = url.searchParams.get("status") ?? "";
    if (status !== "" && !(DEPARTURE_STATUSES as readonly string[]).includes(status)) throw new Bad("invalid_status");
    const parts = cursorParts(url.searchParams.get("cursor"));
    if (parts === "invalid") throw new Bad("invalid_cursor");
    let after: { reviewed: number; observed: number; id: string } | null = null;
    if (parts) {
      const [version, kind, cStatus, reviewed, observed, id] = parts;
      if (parts.length !== 6 || version !== 1 || kind !== "departures" || cStatus !== status || (reviewed !== 0 && reviewed !== 1) || !safeInt(observed) || !text(id) || !ID.test(id)) throw new Bad("invalid_cursor");
      after = { reviewed, observed, id };
    }
    const reviewed = "(d.status <> 'open')";
    const out = await admittedRead(env, ctx, "applicantWrite", [
      env.DB.prepare(
        `${SELECT} WHERE ${LIVE} AND (?1 = '' OR d.status = ?1) AND (?2 = 0 OR ${reviewed} > ?3 OR (${reviewed} = ?3 AND (d.observed_at > ?4 OR (d.observed_at = ?4 AND d.id > ?5))))
         ORDER BY ${reviewed}, d.observed_at, d.id LIMIT ?6`,
      ).bind(status, after ? 1 : 0, after?.reviewed ?? 0, after?.observed ?? 0, after?.id ?? "", DEPARTURE_LIMITS.pageSize + 1),
    ]);
    if (out === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    const all = out[0]!.results as Row[];
    const page = all.slice(0, DEPARTURE_LIMITS.pageSize);
    const last = page.at(-1);
    return apiJson({ departures: page.map(staffShape), nextCursor: all.length > DEPARTURE_LIMITS.pageSize && last ? encodeCursor([1, "departures", status, last.status === "open" ? 0 : 1, last.observed_at, last.id]) : null });
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/**
 * POST /api/admin/community/departures/update {id, revision, action: 'acknowledge' | 'open_restriction', category?} →
 * {departure, restrictionCaseId}. open_restriction records a restriction case in the SAME batch, with the staff page's
 * default dates (RESTRICTION_DEFAULT_DAYS), admitted by this write's nonce; 503 restrictions_disabled while that flag is
 * off. Only a live, open item changes.
 */
export async function updateDeparture(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("departures")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  if (rateLimited(`cdp:${admin.discord_id}`, 60, 60)) return apiJson({ error: "slow_down" }, 429);
  try {
    for (const k of Object.keys(body)) if (!["id", "revision", "action", "category"].includes(k)) throw new Bad("invalid_request");
    const { id, revision, action, category } = body;
    if (!text(id) || !ID.test(id)) throw new Bad("invalid_id");
    if (!safeInt(revision) || revision < 1) throw new Bad("invalid_revision");
    if (action !== "acknowledge" && action !== "open_restriction") throw new Bad("invalid_action");
    if (action === "acknowledge" && category !== undefined) throw new Bad("invalid_request");
    const cat = isRestrictionCategory(category) ? category : null;
    if (action === "open_restriction" && cat === null) throw new Bad("invalid_category");
    if (action === "open_restriction" && !ctx.features.has("restrictions")) return apiJson({ error: "restrictions_disabled" }, 503);
    const at = now();
    const current = await readItem(env, ctx, id); // .73: the pre-decision state, behind the reader's admission
    if (current === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!current || current.live !== 1) return apiJson({ error: "not_found" }, 404);
    if (current.discord_id === admin.discord_id) return conflict("own_record", current);
    if (current.revision !== revision) return conflict("stale_revision", current);
    if (current.status !== "open") return conflict("departure_reviewed", current);
    const me = admin.discord_id, nonce = randomToken();
    const caseId = action === "open_restriction" ? randomToken() : null;
    const ITEM_ADMITTED = (p1: number, p2: number) => `EXISTS (SELECT 1 FROM community_departure_reviews x WHERE x.id = ?${p1} AND x.nonce = ?${p2})`;
    const caseStatements = caseId === null
      ? []
      : restrictionCaseStatements(
          env,
          { caseId, discordId: current.discord_id, staffId: me, category: cat!, reviewAt: at + RESTRICTION_DEFAULT_DAYS[cat!].review * DAY, expiresAt: RESTRICTION_DEFAULT_DAYS[cat!].expiry === null ? null : at + RESTRICTION_DEFAULT_DAYS[cat!].expiry! * DAY },
          ITEM_ADMITTED,
          [id, nonce],
          at,
        );
    // ?1 id, ?2 revision, ?3 member, ?4 status, ?5 case, ?6 me, ?7 now, ?8 nonce, ?9 version, ?10 expiry (the fence)
    const out = await admitted(env, ctx, [
      env.DB.prepare(
        `UPDATE community_departure_reviews SET status = ?4, restriction_case_id = ?5, reviewed_by = ?6, reviewed_at = ?7, revision = revision + 1, nonce = ?8
         WHERE id = ?1 AND revision = ?2 AND status = 'open' AND retain_until > ${DB_NOW} AND discord_id = ?3 AND discord_id <> ?6 AND ${fenceSql("applicantWrite", 6, 9, 10)}`,
      ).bind(id, revision, current.discord_id, caseId === null ? "acknowledged" : "restriction_opened", caseId, me, at, nonce, ctx.subject!.sessionVersion, ctx.subject!.expiresAt),
      env.DB.prepare("INSERT INTO audit (ts, actor, action, subject, details) SELECT ?1, ?2, ?3, discord_id, ?4 FROM community_departure_reviews WHERE id = ?5 AND nonce = ?6").bind(at, me, caseId === null ? "community.departure_acknowledged" : "community.departure_restriction_opened", JSON.stringify(caseId === null ? { kind: current.kind } : { kind: current.kind, category }), id, nonce),
      ...caseStatements,
      writtenItem(env, id, nonce), // .73: the payload, in the write's own transaction, live by the database clock
    ]);
    if (out !== FENCE_REFUSED) {
      const written = out.at(-1)!.results[0] as Row | undefined;
      return apiJson({ departure: written ? staffShape(written) : null, restrictionCaseId: caseId });
    }
    const row = await readItem(env, ctx, id); // .73: the refusal explained from an admitted read
    if (row === FENCE_REFUSED) return refusal(env, request, "applicantWrite");
    if (!row || row.live !== 1) return apiJson({ error: "not_found" }, 404);
    if (row.revision !== revision) return conflict("stale_revision", row);
    if (row.status !== "open") return conflict("departure_reviewed", row);
    return refusal(env, request, "applicantWrite");
  } catch (e) {
    return bad(e) ?? Promise.reject(e);
  }
}

/** Cron step, whatever the flag says: physical cleanup of items past their lifetime; bounded; the backlog is reported. */
export async function sweepCommunityDepartures(env: Env, at = now(), limit = 100): Promise<{ deleted: number; remaining: number }> {
  const [r, left] = await env.DB.batch([
    env.DB.prepare("DELETE FROM community_departure_reviews WHERE id IN (SELECT id FROM community_departure_reviews WHERE retain_until <= ?1 ORDER BY retain_until, id LIMIT ?2)").bind(at, limit),
    env.DB.prepare("SELECT COUNT(*) AS n FROM community_departure_reviews WHERE retain_until <= ?1").bind(at),
  ]);
  const deleted = r?.meta?.changes ?? 0, remaining = (left?.results[0] as { n: number } | undefined)?.n ?? 0;
  if (deleted || remaining) await audit(env, "cron", "community.departures_expired", undefined, { deleted, remaining });
  return { deleted, remaining };
}

registerCommunityData(
  "departures",
  (env, id) => [
    env.DB.prepare("DELETE FROM community_departure_reviews WHERE discord_id = ?1").bind(id),
    env.DB.prepare("UPDATE community_departure_reviews SET reviewed_by = NULL WHERE reviewed_by = ?1").bind(id),
  ],
  (env, id) => ({
    // .74: a plan, run in the copy's one admitted batch
    statements: [env.DB.prepare(`SELECT d.character_name, d.kind, d.observed_at, d.status, d.reviewed_at, d.retain_until FROM community_departure_reviews d WHERE d.discord_id = ?1 AND ${LIVE} ORDER BY d.observed_at, d.id`).bind(id)],
    shape: ([rows]) => ({
      departures: (rows!.results as { character_name: string; kind: Kind; observed_at: number; status: DepartureStatus; reviewed_at: number | null; retain_until: number }[]).map((r) => ({ characterName: r.character_name, kind: r.kind, observedAt: secondsToIso(r.observed_at), status: r.status, reviewedAt: r.reviewed_at === null ? null : secondsToIso(r.reviewed_at), retainUntil: secondsToIso(r.retain_until) })),
    }),
  }),
);
