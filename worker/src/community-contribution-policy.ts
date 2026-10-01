/**
 * .72 (1 Oct 2026): the pure contribution (tithe) policy, consolidation batch 5 of Codex's adapter map, ported from
 * Olympus Forever's src/contributions/policy.ts (frozen candidate manifest 296db2c8…; pure policy by Codex 5fb0059) with
 * ONE change: every time here is Unix SECONDS, the keeper's unit (the donor used milliseconds). No decision here sends a
 * notice, changes a role, admits or removes anyone, or asks for a game action: it plans allocations from one consistent
 * snapshot and evaluates one obligation's stage from stored facts. `final_notice` means a notice may be given, not that
 * it was; `officer_review` is never a removal instruction.
 *
 * Amounts are integer copper. MAX_COPPER_AMOUNT (2^31 - 1) is our application's input ceiling for one newly submitted
 * amount (a receipt, a policy's weekly amount), refused when exceeded, never clamped; it applies to new input only, so
 * rows stored before it stay readable up to MAX_COPPER_TOTAL (Number.MAX_SAFE_INTEGER), past which a JavaScript number
 * silently rounds: every sum formed here is checked (sum()) and refused rather than rounded.
 */
export interface ContributionPolicy {
  readonly version: string;
  readonly amountCopper: number;
  /** JavaScript UTC weekday: 0 = Sunday, 1 = Monday. */
  readonly anchorWeekday: number;
  readonly anchorHourUtc: number;
  readonly graceHours: number;
  readonly finalNoticeDays: number;
  readonly reviewDays: number;
  readonly newMemberExemptDays: number;
}

export type EvidenceState = "complete" | "partial" | "stale" | "unavailable";
export interface Receipt {
  readonly id: string;
  readonly guildScope: string;
  readonly amountCopper: number;
  readonly observedAt: number;
  readonly matchedDiscordId: string | null;
  readonly status: "matched" | "unmatched" | "disputed" | "rejected";
}
export interface Allocation {
  readonly receiptId: string;
  readonly obligationKey: string;
  readonly amountCopper: number;
  readonly reversedAt: number | null;
}
export type Stage = "not_due" | "exempt" | "paid" | "unknown" | "needs_review" | "due" | "notice_available" | "acknowledged" | "final_notice" | "officer_review" | "resolved";
export interface Obligation {
  readonly guildScope: string;
  readonly discordId: string;
  readonly periodStart: number;
  readonly dueAt: number;
  readonly amountCopper: number;
  /** The immutable policy version attached to this obligation, not the current global policy. */
  readonly policy: ContributionPolicy;
  readonly eligible: boolean;
  readonly state: "open" | "exempt" | "disputed" | "resolved";
}
export interface EvaluationInputs {
  readonly paidCopper: number;
  readonly exemption: boolean;
  readonly disputed: boolean;
  readonly evidence: EvidenceState;
  readonly acknowledgedAt: number | null;
  readonly officerContactAt: number | null;
  readonly finalNoticeAt: number | null;
  readonly finalAcknowledgedAt: number | null;
  readonly finalOfficerContactAt: number | null;
  readonly now: number;
  /** All facts/contact records must belong to this decision revision; persistence must CAS before any effect. */
  readonly revision: number;
  readonly storedRevision: number;
}
export interface AllocationResult {
  allocations: Allocation[];
  /** Unallocated balances, not proof that an unmatched/disputed/rejected receipt is spendable. */
  unallocatedCredit: { receiptId: string; amountCopper: number }[];
}
export interface EvaluationResult {
  stage: Stage;
  nextReviewAt: number | null;
}

export const MAX_COPPER_AMOUNT = 2_147_483_647;
export const MAX_COPPER_TOTAL = Number.MAX_SAFE_INTEGER;

export const HOUR = 3600;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
/** The latest valid timestamp in seconds (the end of the JavaScript Date range); every date read or derived is at most this. */
export const DATE_LIMIT = 8_640_000_000_000;
export const DEFAULT_CONTRIBUTION_POLICY: Readonly<ContributionPolicy> = Object.freeze({
  version: "v1",
  amountCopper: 10_000,
  anchorWeekday: 1,
  anchorHourUtc: 0,
  graceHours: 0,
  finalNoticeDays: 7,
  reviewDays: 7,
  newMemberExemptDays: 14,
});

type Failure =
  | "invalid_policy"
  | "invalid_timestamp"
  | "overflow"
  | "invalid_identity"
  | "invalid_obligation"
  | "invalid_receipt"
  | "invalid_allocation"
  | "invalid_inputs"
  | "conflicting_policy"
  | "conflicting_obligation"
  | "conflicting_receipt"
  | "conflicting_allocation"
  | "unknown_allocation_reference"
  | "allocation_owner_mismatch"
  | "overallocated_receipt"
  | "overallocated_obligation";
function fail(code: Failure): never {
  throw new RangeError(`contribution_${code}`);
}
function integer(value: number, min: number, max: number, code: Failure): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code);
}
function timestamp(value: number): void {
  integer(value, 1, DATE_LIMIT, "invalid_timestamp");
}
function copper(value: number, min = 0): void {
  integer(value, min, MAX_COPPER_TOTAL, "invalid_inputs");
}
function identity(value: string): void {
  if (typeof value !== "string" || !value.length || value.length > 128 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail("invalid_identity");
}
function discord(value: string): void {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) fail("invalid_identity");
}
function sum(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) fail("overflow");
  return result;
}
function after(at: number, duration: number): number {
  const result = sum(at, duration);
  if (result < 1 || result > DATE_LIMIT) fail("overflow");
  return result;
}
/** A stored policy (an obligation's pinned version): any weekly amount a writer once accepted, up to MAX_COPPER_TOTAL. */
function parsePolicy(policy: ContributionPolicy): void {
  if (!policy || typeof policy.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(policy.version)) fail("invalid_policy");
  integer(policy.amountCopper, 1, MAX_COPPER_TOTAL, "invalid_policy");
  integer(policy.anchorWeekday, 0, 6, "invalid_policy");
  integer(policy.anchorHourUtc, 0, 23, "invalid_policy");
  integer(policy.graceHours, 0, Math.floor(DATE_LIMIT / HOUR), "invalid_policy");
  integer(policy.finalNoticeDays, 1, Math.floor(DATE_LIMIT / DAY), "invalid_policy");
  integer(policy.reviewDays, 1, Math.floor(DATE_LIMIT / DAY), "invalid_policy");
  integer(policy.newMemberExemptDays, 0, Math.floor(DATE_LIMIT / DAY), "invalid_policy");
}
/** A newly submitted policy: a stored policy's rules plus our application input ceiling (MAX_COPPER_AMOUNT). */
function validatePolicy(policy: ContributionPolicy): void {
  parsePolicy(policy);
  integer(policy.amountCopper, 1, MAX_COPPER_AMOUNT, "invalid_policy");
}
function policySignature(policy: ContributionPolicy): string {
  return JSON.stringify([policy.version, policy.amountCopper, policy.anchorWeekday, policy.anchorHourUtc, policy.graceHours, policy.finalNoticeDays, policy.reviewDays, policy.newMemberExemptDays]);
}

/** The UTC anchor at or before ts; daylight saving and the machine's locale have no effect. For new input. */
export function periodStart(ts: number, policy: ContributionPolicy): number {
  timestamp(ts);
  validatePolicy(policy);
  return anchorAt(ts, policy);
}
/** periodStart's arithmetic, for a timestamp and policy already validated or parsed. */
function anchorAt(ts: number, policy: ContributionPolicy): number {
  const start = weekStart(ts, policy);
  timestamp(start);
  return start;
}
/** The anchor at or before a valid ts, not yet checked: before the first anchor after the epoch it is negative. */
function weekStart(ts: number, policy: ContributionPolicy): number {
  const date = new Date(ts * 1000);
  const midnight = ts - date.getUTCHours() * HOUR - date.getUTCMinutes() * 60 - date.getUTCSeconds();
  const start = midnight - ((date.getUTCDay() - policy.anchorWeekday + 7) % 7) * DAY + policy.anchorHourUtc * HOUR;
  return start > ts ? start - WEEK : start;
}

/** Whether ts is itself a week anchor under a newly submitted policy; a time periodStart cannot handle is simply not one. */
export function isPeriodStart(ts: number, policy: ContributionPolicy): boolean {
  validatePolicy(policy);
  if (!Number.isSafeInteger(ts) || ts < 1 || ts > DATE_LIMIT) return false;
  return weekStart(ts, policy) === ts;
}

/** First complete weekly period after the new-member exemption; no partial-week backcharge. */
export function firstEligiblePeriod(joinedAt: number, policy: ContributionPolicy): number {
  timestamp(joinedAt);
  validatePolicy(policy);
  const exemptionEnds = after(joinedAt, policy.newMemberExemptDays * DAY);
  const start = periodStart(exemptionEnds, policy);
  return start === exemptionEnds ? start : after(start, WEEK);
}

/** A main/character or policy-version change cannot create another obligation for the same member/week. */
export function obligationKey(guildScope: string, discordId: string, start: number): string {
  identity(guildScope);
  discord(discordId);
  timestamp(start);
  return JSON.stringify([guildScope, discordId, start]);
}
function validateObligation(obligation: Obligation): string {
  if (!obligation || typeof obligation.eligible !== "boolean" || !["open", "exempt", "disputed", "resolved"].includes(obligation.state)) fail("invalid_obligation");
  const key = obligationKey(obligation.guildScope, obligation.discordId, obligation.periodStart);
  parsePolicy(obligation.policy); // a stored row: its pinned policy is parsed, not re-validated as new input
  timestamp(obligation.dueAt);
  if (obligation.amountCopper !== obligation.policy.amountCopper || anchorAt(obligation.periodStart, obligation.policy) !== obligation.periodStart || obligation.dueAt !== after(obligation.periodStart, WEEK)) fail("invalid_obligation");
  return key;
}
function validateReceipt(receipt: Receipt): void {
  if (!receipt || !["matched", "unmatched", "disputed", "rejected"].includes(receipt.status)) fail("invalid_receipt");
  identity(receipt.id);
  identity(receipt.guildScope);
  copper(receipt.amountCopper, 1); // up to MAX_COPPER_TOTAL: a receipt stored before the input ceiling stays plannable
  timestamp(receipt.observedAt);
  if (receipt.matchedDiscordId !== null) discord(receipt.matchedDiscordId);
  if ((receipt.status === "matched" && receipt.matchedDiscordId === null) || (receipt.status === "unmatched" && receipt.matchedDiscordId !== null)) fail("invalid_receipt");
}
function unique<T>(map: Map<string, { value: T; signature: string }>, key: string, value: T, signature: string, error: Failure): void {
  const previous = map.get(key);
  if (previous && previous.signature !== signature) fail(error);
  if (!previous) map.set(key, { value, signature });
}
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Plans new allocation DELTAS from one complete, consistent ledger snapshot. Existing reviewed allocations are preserved,
 * including those on obligations that later became exempt/resolved. A reversal releases its amount. Persistence must
 * apply deltas atomically under a revision check and journal reversals/top-ups; retrying a delta blindly is unsafe.
 */
export function allocate(obligations: readonly Obligation[], receipts: readonly Receipt[], existingAllocations: readonly Allocation[], now: number): AllocationResult {
  timestamp(now);
  if (!Array.isArray(obligations) || !Array.isArray(receipts) || !Array.isArray(existingAllocations)) fail("invalid_inputs");
  const obligationMap = new Map<string, { value: Obligation; signature: string }>();
  const receiptMap = new Map<string, { value: Receipt; signature: string }>();
  const allocationMap = new Map<string, { value: Allocation; signature: string }>();
  const policies = new Map<string, string>();
  for (const obligation of obligations) {
    const key = validateObligation(obligation);
    const signature = policySignature(obligation.policy);
    const policyKey = JSON.stringify([obligation.guildScope, obligation.policy.version]);
    if (policies.has(policyKey) && policies.get(policyKey) !== signature) fail("conflicting_policy");
    policies.set(policyKey, signature);
    unique(obligationMap, key, obligation, JSON.stringify([signature, obligation.dueAt, obligation.amountCopper, obligation.eligible, obligation.state]), "conflicting_obligation");
  }
  for (const receipt of receipts) {
    validateReceipt(receipt);
    unique(receiptMap, receipt.id, receipt, JSON.stringify([receipt.guildScope, receipt.amountCopper, receipt.observedAt, receipt.matchedDiscordId, receipt.status]), "conflicting_receipt");
  }
  for (const allocation of existingAllocations) {
    if (!allocation) fail("invalid_allocation");
    identity(allocation.receiptId);
    if (typeof allocation.obligationKey !== "string") fail("invalid_allocation");
    copper(allocation.amountCopper, 1);
    if (allocation.reversedAt !== null) {
      timestamp(allocation.reversedAt);
      if (allocation.reversedAt > now) fail("invalid_allocation");
    }
    unique(allocationMap, JSON.stringify([allocation.receiptId, allocation.obligationKey]), allocation, JSON.stringify([allocation.amountCopper, allocation.reversedAt]), "conflicting_allocation");
  }
  const spent = new Map<string, number>();
  const paid = new Map<string, number>();
  for (const { value: allocation } of allocationMap.values()) {
    const receipt = receiptMap.get(allocation.receiptId)?.value;
    const obligation = obligationMap.get(allocation.obligationKey)?.value;
    if (!receipt || !obligation) fail("unknown_allocation_reference");
    if (receipt.guildScope !== obligation.guildScope || receipt.matchedDiscordId !== obligation.discordId) fail("allocation_owner_mismatch");
    if (allocation.reversedAt !== null && allocation.reversedAt < receipt.observedAt) fail("invalid_allocation");
    if (allocation.amountCopper > receipt.amountCopper) fail("overallocated_receipt");
    if (allocation.amountCopper > obligation.amountCopper) fail("overallocated_obligation");
    if (allocation.reversedAt !== null) continue;
    if (receipt.observedAt > now) fail("invalid_allocation"); // existing spending cannot consume a future observation
    spent.set(receipt.id, sum(spent.get(receipt.id) ?? 0, allocation.amountCopper));
    paid.set(allocation.obligationKey, sum(paid.get(allocation.obligationKey) ?? 0, allocation.amountCopper));
  }
  let totalReceipts = 0;
  for (const { value: receipt } of receiptMap.values()) {
    totalReceipts = sum(totalReceipts, receipt.amountCopper);
    if ((spent.get(receipt.id) ?? 0) > receipt.amountCopper) fail("overallocated_receipt");
  }
  for (const [key, { value: obligation }] of obligationMap) {
    if ((paid.get(key) ?? 0) > obligation.amountCopper) fail("overallocated_obligation");
  }
  const payable = [...obligationMap.entries()]
    .filter(([, { value: item }]) => item.eligible && item.state === "open" && item.dueAt <= now)
    .sort(([keyA, { value: a }], [keyB, { value: b }]) => a.periodStart - b.periodStart || compare(keyA, keyB));
  const orderedReceipts = [...receiptMap.values()].map(({ value }) => value).sort((a, b) => a.observedAt - b.observedAt || compare(a.id, b.id));
  const result: AllocationResult = { allocations: [], unallocatedCredit: [] };
  for (const receipt of orderedReceipts) {
    let remaining = receipt.amountCopper - (spent.get(receipt.id) ?? 0);
    if (receipt.status === "matched" && receipt.observedAt <= now) {
      for (const [key, { value: obligation }] of payable) {
        if (!remaining) break;
        if (receipt.guildScope !== obligation.guildScope || receipt.matchedDiscordId !== obligation.discordId) continue;
        const amount = Math.min(remaining, obligation.amountCopper - (paid.get(key) ?? 0));
        if (!amount) continue;
        result.allocations.push({ receiptId: receipt.id, obligationKey: key, amountCopper: amount, reversedAt: null });
        remaining -= amount;
        paid.set(key, sum(paid.get(key) ?? 0, amount));
      }
    }
    if (remaining) result.unallocatedCredit.push({ receiptId: receipt.id, amountCopper: remaining });
  }
  return result;
}

/** `final_notice` means available/pending contact, not delivered. `officer_review` is never a removal instruction. */
export function evaluate(obligation: Obligation, inputs: EvaluationInputs): EvaluationResult {
  validateObligation(obligation);
  if (!inputs || typeof inputs.exemption !== "boolean" || typeof inputs.disputed !== "boolean" || !["complete", "partial", "stale", "unavailable"].includes(inputs.evidence)) fail("invalid_inputs");
  copper(inputs.paidCopper);
  integer(inputs.revision, 0, Number.MAX_SAFE_INTEGER, "invalid_inputs");
  integer(inputs.storedRevision, 0, Number.MAX_SAFE_INTEGER, "invalid_inputs");
  timestamp(inputs.now);
  const contacts = [inputs.acknowledgedAt, inputs.officerContactAt, inputs.finalNoticeAt, inputs.finalAcknowledgedAt, inputs.finalOfficerContactAt];
  for (const contact of contacts) if (contact !== null) timestamp(contact);
  const result = (stage: Stage, nextReviewAt: number | null = null): EvaluationResult => ({ stage, nextReviewAt });
  if (inputs.revision !== inputs.storedRevision) return result("needs_review");
  if (inputs.disputed || obligation.state === "disputed") return result("needs_review");
  if (obligation.state === "resolved") return result("resolved");
  if (inputs.exemption || obligation.state === "exempt") return result("exempt");
  if (inputs.paidCopper >= obligation.amountCopper) return result("paid");
  if (!obligation.eligible || inputs.evidence !== "complete") return result("unknown");
  const policy = obligation.policy;
  const availableAt = after(obligation.dueAt, policy.graceHours * HOUR);
  if (contacts.some((contact) => contact !== null && (contact > inputs.now || contact < availableAt))) return result("needs_review");
  if (inputs.now < obligation.dueAt) return result("not_due", availableAt);
  if (inputs.now < availableAt) return result("due", availableAt);
  const initialContacts = [inputs.acknowledgedAt, inputs.officerContactAt].filter((at): at is number => at !== null);
  const finalContacts = [inputs.finalAcknowledgedAt, inputs.finalOfficerContactAt].filter((at): at is number => at !== null);
  if (!initialContacts.length) return result(inputs.finalNoticeAt !== null || finalContacts.length ? "needs_review" : "notice_available");
  const finalAvailableAt = after(Math.min(...initialContacts), policy.finalNoticeDays * DAY);
  if (inputs.finalNoticeAt !== null && inputs.finalNoticeAt < finalAvailableAt) return result("needs_review");
  if (finalContacts.length && (inputs.finalNoticeAt === null || finalContacts.some((at) => at < inputs.finalNoticeAt!))) return result("needs_review");
  if (inputs.now < finalAvailableAt) return result("acknowledged", finalAvailableAt);
  if (inputs.finalNoticeAt === null || !finalContacts.length) return result("final_notice");
  const reviewAt = after(Math.min(...finalContacts), policy.reviewDays * DAY);
  return inputs.now < reviewAt ? result("final_notice", reviewAt) : result("officer_review");
}
