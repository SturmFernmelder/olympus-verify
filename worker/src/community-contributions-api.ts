/**
 * .75 (1 Oct 2026): the HTTP layer of the contribution (tithe) ledger, consolidation batch 5 of Codex's adapter map
 * (the donor's src/contributions/routes.ts, frozen candidate manifest 296db2c8…), on the keeper's door:
 *  - GET /api/community/contributions/me: the member's own ledger (their weeks with paid sums, the stage the pure policy
 *    evaluates and the acknowledgement it calls for; their matched receipts without payer names, source ids or who
 *    recorded them), the policy, and their mail reference with the officer character to mail (a lookup aid for the
 *    officer matching an in-game mail, never payment proof: the officer still records the receipt). applicantWrite: a
 *    signed-in account in good standing; neither roster proof nor a Battle.net link is required to read one's own
 *    records (the keeper's rule, unlike the donor's admission).
 *  - POST /api/community/contributions/acknowledge {obligationId, kind, expectedRevision}: the member's own
 *    acknowledgement of a notice, recorded as a contact fact only when the evaluation calls for it.
 *  - GET/POST /api/admin/community/contributions (SITE_ADMINS, communityStaff through community-routes.ts): one member's
 *    ledger; the staff actions obligation, receipt, allocate, void, reverse, state, contact, evidence, removal, each one
 *    fenced batch in community-contributions.ts, never about the acting admin's own account (own_record), each audited
 *    as community.contribution_<action> with the fixed result only.
 * Every read runs under the acting session's admission (the ledger's readAs); a write's answer carries the ledger as a
 * NEW admitted read after the write, and when the reader lost standing meanwhile the write stands and the answer is a
 * fixed acknowledgment with the ledger withheld (Codex's rule of 1 Oct 03:55 UTC). Writes need the current page
 * (X-Olympus), the flag `contributions`, CONTRIBUTIONS_MODE = "ledger" and a finite retention (503
 * contributions_disabled otherwise). Nothing here notifies anyone, changes a role or opens a restriction case: `removal`
 * records that an officer resolved a week after an in-game removal and may LINK an existing case (community-restrictions.ts).
 */
import type { Env } from "./env";
import { PrivacySiteRequestHeld } from "./privacy-serving-authority";
import { audit, now } from "./db";
import { apiJson, PAGE_VERSION, rateLimited, readJson, type SiteUser } from "./site-core";
import { refusal, type CommunityContext } from "./community-context";
import { configuredOfficers } from "./relays";
import { secondsToIso, isoToSeconds } from "./community-time";
import * as L from "./community-contributions";
import { DEFAULT_CONTRIBUTION_POLICY, MAX_COPPER_AMOUNT, type ContributionPolicy, type EvidenceState } from "./community-contribution-policy";

const DISCORD_ID = /^\d{17,20}$/;
const ID22 = /^[A-Za-z0-9_-]{22}$/;
const featureOff = () => apiJson({ error: "feature_disabled", message: "This part of the site is not switched on." }, 503);
const needPage = (request: Request) => (request.headers.get("X-Olympus") !== PAGE_VERSION ? apiJson({ error: "reload", message: "The site has been updated since this page was opened. Reload the page, then try again." }, 409) : null);
const text = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const iso = (s: number | null) => (s === null ? null : secondsToIso(s));

class Bad extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
function timeOf(raw: unknown, code: string): number {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)) throw new Bad(code);
  try {
    return isoToSeconds(raw, "exact");
  } catch {
    throw new Bad(code);
  }
}

const CONFLICTS = new Set(["receipt_conflict", "contribution_limit", "policy_conflict", "policy_anchor_change", "past_retention", "ledger_inconsistent"]);
/** The ledger's errors as answers (a refusal re-reads the facts); anything else is the caller's. */
async function answer(e: unknown, request: Request, env: Env): Promise<Response> {
  if (e instanceof Bad) return apiJson({ error: e.code }, e.status);
  if (!(e instanceof L.ContributionError)) throw e;
  switch (e.code) {
    case "reader_refused":
    case "standing_lost":
      return refusal(env, request, "applicantWrite");
    case "session_expired":
      return apiJson({ error: "signed_out", message: "You are signed out. Sign in with Discord again." }, 401);
    case "contributions_disabled":
      return apiJson({ error: "contributions_disabled", message: "The contribution ledger is not switched on." }, 503);
    case "not_found":
      return apiJson({ error: "not_found" }, 404);
    case "contribution_overflow":
      return apiJson({ error: "contribution_overflow", message: "An amount in this ledger is outside the range this software represents exactly; an officer must repair it before it can be shown." }, 409);
    default:
      return apiJson({ error: e.code }, CONFLICTS.has(e.code) ? 409 : 400);
  }
}

const policyDto = (p: ContributionPolicy = DEFAULT_CONTRIBUTION_POLICY) => ({ version: p.version, amountCopper: p.amountCopper, anchorWeekday: p.anchorWeekday, anchorHourUtc: p.anchorHourUtc, graceHours: p.graceHours, finalNoticeDays: p.finalNoticeDays, reviewDays: p.reviewDays, newMemberExemptDays: p.newMemberExemptDays });

type View = Awaited<ReturnType<typeof L.ledgerView>>;
/** The display DTO. The member's own copy omits receipt ids, source ids, payer names and who recorded (minimization); staff see them. */
function viewDto(v: View, staff: boolean) {
  return {
    revision: v.revision,
    complete: v.complete,
    obligations: v.obligations.map((o) => ({
      id: o.row.id,
      periodStart: secondsToIso(o.row.period_start),
      dueAt: secondsToIso(o.row.due_at),
      policyVersion: o.row.version,
      amountCopper: o.row.amount_copper,
      paidCopper: o.row.paid,
      eligible: o.row.eligible === 1,
      state: o.row.state,
      stage: o.stage,
      evidence: o.evidence,
      nextReviewAt: iso(o.nextReviewAt),
      canAcknowledge: o.canAcknowledge,
      acknowledgedAt: iso(o.row.acknowledged_at),
      officerContactAt: iso(o.row.officer_contact_at),
      finalNoticeAt: iso(o.row.final_notice_at),
      finalAcknowledgedAt: iso(o.row.final_acknowledged_at),
      finalOfficerContactAt: iso(o.row.final_officer_contact_at),
      revision: o.row.revision,
    })),
    receipts: v.receipts.map((r) => ({
      ...(staff ? { id: r.row.id, sourceId: r.row.source_id, payerName: r.row.payer_name, recordedBy: r.row.observer_discord_id } : {}),
      source: r.row.source,
      amountCopper: r.row.amount_copper,
      allocatedCopper: r.allocatedCopper,
      retiredCopper: r.retiredCopper,
      unallocatedCopper: r.unallocatedCopper,
      observedAt: secondsToIso(r.row.observed_at),
      status: r.row.status,
      voidedAt: iso(r.row.voided_at),
    })),
    unallocatedCopper: v.unallocatedCopper,
  };
}

/** The answer to a write: the result, plus the ledger as a NEW admitted read; a reader who lost standing meanwhile gets the acknowledgment with the ledger withheld (the write stands). */
async function withLedger(env: Env, body: Record<string, unknown>, scope: string, id: string, fence: L.SessionFence, staff: boolean, at: number): Promise<Response> {
  try {
    return apiJson({ ...body, ledger: viewDto(await L.ledgerView(env, scope, id, at, fence), staff) });
  } catch (e) {
    if (e instanceof PrivacySiteRequestHeld || e instanceof L.ContributionError && (e.code === "reader_refused" || e.code === "contribution_overflow")) {
      // The primary mutation has already returned its durable result. Original admission still
      // controls the fresh read; withholding it must not disclose allocations or credit details.
      const known = body.result && typeof body.result === 'object' && !Array.isArray(body.result)
        ? body.result as Record<string, unknown> : {};
      const result: Record<string, unknown> = {};
      if (typeof known.status === 'string' && known.status.length <= 64) result.status = known.status;
      if (typeof known.id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(known.id) || Number.isSafeInteger(known.id) && (known.id as number) > 0) result.id = known.id;
      if (typeof known.created === 'boolean') result.created = known.created;
      return apiJson({ ok: body.ok === true, result, ledger: null, withheld: e instanceof PrivacySiteRequestHeld ? 'reader_refused' : e.code });
    }
    throw e;
  }
}

/** GET /api/community/contributions/me */
export async function contributionsMe(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("contributions")) return featureOff();
  if (!ctx.capabilities.applicantWrite) return refusal(env, request, "applicantWrite");
  const me = ctx.subject!, scope = L.contributionScope(env);
  try {
    const view = await L.ledgerView(env, scope, me.discordId, now(), me);
    return apiJson({
      enabled: true,
      writable: L.contributionsWritable(env),
      scope,
      policy: policyDto(),
      mailReference: { reference: await L.mailReference(env, scope, me.discordId), recipient: configuredOfficers(env)[0] ?? null, note: "Put the reference in the mail's subject so the officer can match it to you. It is a lookup aid, not proof of payment: the officer records the receipt." },
      ledger: viewDto(view, false),
    });
  } catch (e) {
    return answer(e, request, env);
  }
}

/** POST /api/community/contributions/acknowledge {obligationId, kind: 'acknowledged' | 'final_acknowledged', expectedRevision} */
export async function contributionsAcknowledge(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  if (!ctx.features.has("contributions")) return featureOff();
  if (!ctx.capabilities.applicantWrite) return refusal(env, request, "applicantWrite");
  const reload = needPage(request);
  if (reload) return reload;
  const me = ctx.subject!, scope = L.contributionScope(env);
  if (rateLimited(`cta:${me.discordId}`, 30, 60)) return apiJson({ error: "slow_down" }, 429);
  const body = await readJson(request);
  if (body === null) return apiJson({ error: "bad_request", message: "That request could not be read." }, 400);
  try {
    for (const k of Object.keys(body)) if (!["obligationId", "kind", "expectedRevision"].includes(k)) throw new Bad("invalid_request");
    const { obligationId, kind, expectedRevision } = body;
    if (!safeInt(obligationId) || obligationId < 1) throw new Bad("invalid_request");
    if (kind !== "acknowledged" && kind !== "final_acknowledged") throw new Bad("invalid_kind");
    if (!text(expectedRevision, 80)) throw new Bad("invalid_revision");
    const at = now();
    const evidence = await L.obligationEvidence(env, scope, me.discordId, obligationId, me);
    const result = await L.recordContact(env, { guildScope: scope, discordId: me.discordId, obligationId, kind, evidence, expectedRevision, actor: `member:${me.discordId}`, fence: me }, at);
    if (result === "recorded") await audit(env, me.discordId, "community.contribution_acknowledged", me.discordId, { kind }).catch(() => {});
    return withLedger(env, { ok: result === "recorded", result: { status: result } }, scope, me.discordId, me, false, at);
  } catch (e) {
    return answer(e, request, env);
  }
}

/** GET /api/admin/community/contributions?discordId= → one member's ledger as staff see it, the policy, their mail reference. */
export async function adminContributions(request: Request, env: Env, ctx: CommunityContext, url: URL): Promise<Response> {
  if (!ctx.features.has("contributions")) return featureOff();
  const id = url.searchParams.get("discordId");
  if (id === null || !DISCORD_ID.test(id)) return apiJson({ error: "invalid_request" }, 400);
  const scope = L.contributionScope(env);
  try {
    const view = await L.ledgerView(env, scope, id, now(), ctx.subject!);
    return apiJson({ enabled: true, writable: L.contributionsWritable(env), scope, policy: policyDto(), mailReference: await L.mailReference(env, scope, id), ledger: viewDto(view, true) });
  } catch (e) {
    return answer(e, request, env);
  }
}

const NOT_OK = new Set(["stale", "nothing", "already_voided", "already_recorded", "facts_stale", "facts_changed", "not_applicable", "not_in_officer_review", "case_conflict"]);

/** POST /api/admin/community/contributions {action, ...}: one staff action, one fenced batch in the ledger, audited by its fixed result. */
export async function adminContributionAction(request: Request, env: Env, ctx: CommunityContext, admin: SiteUser, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.features.has("contributions")) return featureOff();
  const reload = needPage(request);
  if (reload) return reload;
  if (rateLimited(`ctw:${admin.discord_id}`, 60, 60)) return apiJson({ error: "slow_down" }, 429);
  const me = admin.discord_id, fence = ctx.subject!, scope = L.contributionScope(env), at = now(), actor = `staff:${me}`;
  try {
    if (!L.contributionsWritable(env)) throw new L.ContributionError("contributions_disabled");
    const { action } = body;
    const keys = (allowed: string[]) => {
      for (const k of Object.keys(body)) if (!["action", ...allowed].includes(k)) throw new Bad("invalid_request");
    };
    const target = (): string => {
      const v = body.discordId;
      if (!text(v) || !DISCORD_ID.test(v)) throw new Bad("invalid_discord_id");
      if (v === me) throw new Bad("own_record", 409); // never one's own ledger, owner or not
      return v;
    };
    const revision = (): string => {
      if (!text(body.expectedRevision, 80)) throw new Bad("invalid_revision");
      return body.expectedRevision;
    };
    const obligationId = (): number => {
      if (!safeInt(body.obligationId) || body.obligationId < 1) throw new Bad("invalid_request");
      return body.obligationId;
    };
    const receiptId = (): string => {
      if (!text(body.receiptId) || !ID22.test(body.receiptId)) throw new Bad("invalid_request");
      return body.receiptId;
    };
    let result: unknown;
    let subject: string | null = null;
    if (action === "obligation") {
      keys(["discordId", "periodStart", "eligible"]);
      subject = target();
      const start = timeOf(body.periodStart, "invalid_period");
      if (body.eligible !== undefined && typeof body.eligible !== "boolean") throw new Bad("invalid_request");
      result = await L.createObligation(env, { guildScope: scope, discordId: subject, periodStart: start, eligible: (body.eligible as boolean | undefined) ?? true, fence }, at);
    } else if (action === "receipt") {
      keys(["source", "sourceId", "payerName", "amountCopper", "observedAt", "matchedDiscordId", "status"]);
      const matched = (body.matchedDiscordId ?? null) as unknown;
      if (matched !== null && (!text(matched) || !DISCORD_ID.test(matched))) throw new Bad("invalid_discord_id");
      if (matched === me) throw new Bad("own_record", 409);
      if (!safeInt(body.amountCopper) || body.amountCopper < 1 || body.amountCopper > MAX_COPPER_AMOUNT) throw new Bad("invalid_amount");
      subject = matched as string | null;
      result = await L.recordReceipt(
        env,
        { guildScope: scope, source: body.source as L.ReceiptInput["source"], sourceId: body.sourceId as string, payerName: (body.payerName ?? null) as string | null, amountCopper: body.amountCopper, observedAt: timeOf(body.observedAt, "invalid_observed_at"), observerDiscordId: me, matchedDiscordId: subject, status: body.status as L.ReceiptInput["status"] },
        at,
        fence,
      );
    } else if (action === "allocate") {
      keys(["discordId"]);
      subject = target();
      result = await L.applyAllocations(env, scope, subject, actor, at, fence);
    } else if (action === "void") {
      keys(["discordId", "receiptId", "expectedRevision"]);
      subject = target();
      result = await L.voidReceipt(env, { guildScope: scope, discordId: subject, receiptId: receiptId(), expectedRevision: revision(), actor, fence }, at);
    } else if (action === "reverse") {
      keys(["discordId", "receiptId", "obligationId", "expectedRevision"]);
      subject = target();
      result = await L.reverseAllocation(env, { guildScope: scope, discordId: subject, receiptId: receiptId(), obligationId: obligationId(), expectedRevision: revision(), actor, fence }, at);
    } else if (action === "state") {
      keys(["discordId", "obligationId", "state", "expectedRevision"]);
      subject = target();
      if (!["open", "exempt", "disputed", "resolved"].includes(body.state as string)) throw new Bad("invalid_state");
      result = await L.setObligationState(env, { guildScope: scope, discordId: subject, obligationId: obligationId(), state: body.state as "open" | "exempt" | "disputed" | "resolved", expectedRevision: revision(), actor, fence }, at);
    } else if (action === "contact") {
      keys(["discordId", "obligationId", "kind", "expectedRevision"]);
      subject = target();
      if (!["officer_contact", "final_notice", "final_officer_contact"].includes(body.kind as string)) throw new Bad("invalid_kind");
      const oid = obligationId();
      const evidence = await L.obligationEvidence(env, scope, subject, oid, fence);
      result = await L.recordContact(env, { guildScope: scope, discordId: subject, obligationId: oid, kind: body.kind as L.ContactKind, evidence, expectedRevision: revision(), actor, fence }, at);
    } else if (action === "evidence") {
      keys(["periodStart", "state"]);
      if (!(L.EVIDENCE_STATES as readonly unknown[]).includes(body.state)) throw new Bad("invalid_evidence");
      await L.attestEvidence(env, { guildScope: scope, periodStart: timeOf(body.periodStart, "invalid_period"), state: body.state as EvidenceState, fence }, at);
      await audit(env, me, "community.contribution_evidence", undefined, { state: body.state }).catch(() => {});
      return apiJson({ ok: true, result: { status: "attested" } });
    } else if (action === "removal") {
      keys(["discordId", "obligationId", "expectedRevision", "caseId"]);
      subject = target();
      const caseId = (body.caseId ?? null) as unknown;
      if (caseId !== null && (!text(caseId) || !ID22.test(caseId))) throw new Bad("invalid_request");
      result = await L.recordRemoval(env, { guildScope: scope, discordId: subject, obligationId: obligationId(), expectedRevision: revision(), caseId: caseId as string | null, staffId: me, fence }, at);
    } else throw new Bad("invalid_action");
    const summary = typeof result === "string" ? result : (result as { status?: string }).status ?? ((result as { created?: boolean }).created === false ? "replay" : "created");
    await audit(env, me, `community.contribution_${action}`, subject ?? undefined, { result: summary }).catch(() => {});
    const payload: Record<string, unknown> = { ok: !NOT_OK.has(summary), result: typeof result === "string" ? { status: result } : result };
    return subject ? withLedger(env, payload, scope, subject, fence, true, at) : apiJson(payload);
  } catch (e) {
    return answer(e, request, env);
  }
}
