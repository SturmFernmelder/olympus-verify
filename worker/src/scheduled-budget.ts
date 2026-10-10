/**
 * The scheduled invocation's D1 statement budget, in one place (.115; Codex's finding of 3 Oct 2026 13:26 UTC and his
 * review115/scheduled-query-budget.md).
 *
 * Our conservative accounting charges EVERY attempted SQL statement, including each statement of a `DB.batch`.
 * Cloudflare documents 1,000 queries per invocation on Paid and 50 on Free, but its batch guidance does not prove the
 * aggregate metering rule. One cron tick is ONE invocation: index.ts `scheduled()` awaits
 * `ensureSchema` and hands every job below to `ctx.waitUntil`, which is not a separate invocation, so all of them share
 * the one limit. Before .115 the weekly obligation opener alone could issue 1 + 6 x 200 = 1,201 statements and the
 * profile cleanup 604, so a large backlog could exhaust the limit and fail whatever ran last.
 *
 * Each workload that grows with the data is capped per run here, and every capped job continues deterministically on the
 * next run (the cron runs every 30 minutes):
 * - the role sweep's accounts (restore.ts): its promotion watermark and rotation cursor, as before;
 * - the Discord-name refresh (names.ts): the stalest names first, a refreshed row moves to the back;
 * - the expired directory profiles (community-directory.ts): oldest departure first, an erased profile is gone;
 * - the week's obligations (community-contributions.ts): Discord id order among the accounts without this week's row, a
 *   created row drops out of the scan; an id the opener would skip is excluded in the scan itself, so it never holds a slot.
 *
 * `SCHEDULED_BUDGET` gives every job's worst case in statements with every community feature on, every conditional audit
 * written and every failure path that still dispatches a statement charged in our model, even one D1 refuses.
 * The caps keep the sum under `SCHEDULED_STATEMENT_TARGET`, which leaves room below the Paid limit for D1's own
 * retries and for writers later builds add; a new scheduled job, a new column or a raised cap changes this table first.
 * `tests/scheduled_budget_test.cjs` runs the real `scheduled()` over a D1 that counts each batched statement, with every
 * capped workload past its cap, cold and warm schema, and holds each job and the whole run to these numbers; the role
 * sweep's per-account costs are measured exactly there (review of 3 Oct 2026), since its line is a bound the run's Discord
 * call budget never lets it reach.
 *
 * This is an admission model, not a measured provider aggregate count. The .115 deploy gate rechecks Cloudflare's limits,
 * because the earlier task log overstated what the batch documentation establishes, and because
 * the house's 18 September history (a thousand-row export in batches on the Free plan's 50) suggested a batch might
 * count once. If a batch counted once, this table would remain a deliberately conservative bound. We use the model for every
 * invocation, not only the cron's: /ingest/roster writes an export's member rows through json_each, a statement per 50
 * members, so a changed full-guild export stays at or below roster.ts ROSTER_INGEST_STATEMENTS_FULL_GUILD
 * (guild_seats_test), and its member effects (promotions, departures, an officer's D: note) go through a durable worklist
 * applied in admitted slices, counted against ROSTER_INGEST_STATEMENTS below (roster-effects.ts; Codex, 3 Oct 2026
 * 16:48 UTC, finding A: a full roster of members who had all just verified needed about 4,000 attempts in one go).
 *
 * Not the entry module, so its scalar exports are fine (index.ts exports functions only: .51).
 */

/** Documented Paid query allowance; our admission model conservatively charges each attempted batch statement. */
export const D1_STATEMENTS_PER_INVOCATION = 1000;
/** The whole scheduled run's worst case stays at or below this (the .115 acceptance target, task log 3 Oct 2026 13:36 UTC). */
export const SCHEDULED_STATEMENT_TARGET = 700;

/** Per-run caps the jobs read from here. */
export const SCHEDULED_CAPS = {
  /** restore.ts: accounts one Guild Member sweep may check; ROLE_SWEEP_PER_RUN is clamped to it (configured 10; the clamp was 50). */
  roleSweepAccounts: 1,
  /** restore.ts BANNED_PER_RUN: banned or held accounts the sweep re-checks (unchanged; the test checks the two agree). */
  roleSweepBanned: 2,
  /** names.ts: linked members whose Discord names one run re-reads; NAMES_PER_RUN is clamped to it (configured 5; unchanged). */
  namesPerRun: 5,
  /** community-directory.ts: profiles thirty days departed that one run erases (was 100); the rest go in the next runs. */
  profilesPerRun: 1,
  /** community-contributions.ts: weekly obligations one run opens (was 200); the rest open in the next runs. */
  obligationsPerRun: 8,
  /**
   * roster.ts continueRosterEffects: the statement attempts one cron run may spend on the roster's pending member effects
   * (Codex, 3 Oct 2026 16:48 UTC, finding A). Each item is admitted at its kind's worst case before it starts
   * (roster-effects.ts EFFECT_WORST), so this is the job's bound; the ingest that made the worklist, and every later
   * export, apply larger slices in their own invocations.
   */
  rosterEffectsStatements: 64,
} as const;

const C = SCHEDULED_CAPS;

/**
 * Worst case per job, in statements, in the order scheduled() starts them. `rule` says what is counted. The fixed costs
 * are read from the source: a job whose statements change changes its line here.
 */
/**
 * The schema check's worst case: 5 column probes + 5 ALTERs, 7 single CREATEs, the site batch (99 tables and indexes + 2
 * legacy updates; the roster effects' two tables since the third .115 review round), the column batch failing (16
 * attempted), then 14 probes + 14 ALTERs + 2 indexes, the two publication/reminder closure probes/ALTERs, the marker read + the 3-statement rewrite. Every invocation that
 * reaches D1 may pay it once (a fresh isolate), so the allowances below are measured from it.
 */
const SCHEMA_WORST = 10 + 7 + 101 + 16 + 28 + 2 + 4 + 4 + 19 + 8;

export const SCHEDULED_BUDGET: ReadonlyArray<{ job: string; worst: number; rule: string }> = [
  {
    job: "ensureSchema",
    worst: SCHEMA_WORST,
    rule: "cold, every column reported missing and the audit rewrite pending (warm: 0; cold on a current database: 132, or 135 before the rewrite; reminder table/index add two and closure probe/ALTER at most two)",
  },
  { job: "sweepInviteQueue", worst: 4, rule: "two updates, the queue.swept audit, the staff_notice.failed audit when the notice cannot be posted" },
  {
    job: "sweepMemberRoles",
    // 6 reads before the accounts, the banned selection, the budget audit, the sweep audit, the sweep_failed audit;
    // per account at most 4 ban/hold reads and 3 audit attempts (the failure path; the success path is 5); per banned or
    // held account 2 reads and 2 audit attempts. scheduled_budget_test measures 7, 5 and 4 exactly (review of 3 Oct 2026);
    // the call budget (at most 50 requests) stops a failure run at 11 accounts, so 20 is the account cap's bound
    worst: 10 + 40 * C.roleSweepAccounts + 12 * C.roleSweepBanned,
    rule: "10 fixed + conservative central generation/queue/settlement and legacy guard envelope40 per account +12 per banned/held account; joined QR activation requires actual max-path composition gate",
  },
  {
    job: "continueRosterEffects",
    worst: C.rosterEffectsStatements,
    rule: "the newest run's pending items, each admitted at its kind's worst case before it starts (roster-effects.ts), with the selection, the end-of-slice batch, a failure's audit and the notices' read",
  },
  { job: "refreshNames", worst: 1 + C.namesPerRun, rule: "one selection + one update per account (at most namesPerRun)" },
  { job: "autoQueueReserved", worst: 1 + 1 + 4 * (1 + 5) + 1, rule: "the settings, the held count, four rounds of a selection and a 5-statement batch, the audit" },
  { job: "purgeSeenInteractions", worst: 1, rule: "one delete" },
  { job: "purgeBattleNetData", worst: 4 + 1, rule: "a 4-statement batch + the audit" },
  { job: "sweepRenameHolds", worst: 1, rule: "one delete" },
  { job: "sweepCommunityProfiles", worst: 2 + 1 + 6 * C.profilesPerRun + 1, rule: "the departure batch (2), the selection, a 6-statement erase per profile (at most profilesPerRun), the audit" },
  { job: "sweepCommunityEvents", worst: 8 + 1, rule: "an 8-statement batch including finite publication/reminder closure and disposal + the audit" },
  { job: "runEventReminders", worst: 6, rule: "one due selection, attempted-candidate rotation, conditional claim, final current proof, settlement and conditional audit; one candidate, no automatic resend" },
  { job: "sweepCommunityTrials", worst: 2 + 1, rule: "a 2-statement batch + the audit" },
  { job: "sweepCommunityRestrictions", worst: 4 + 1, rule: "a 4-statement batch + the audit" },
  { job: "departureIntake", worst: 1 + 10 + 1 + 1 + 1, rule: "the stored position, at most 10 scan pages (DEPARTURE_LIMITS.intakePages), the position write, the insert, the audit" },
  { job: "sweepCommunityDepartures", worst: 2 + 1, rule: "a 2-statement batch + the audit" },
  { job: "openWeeklyObligations", worst: 1 + 2 + 4 * C.obligationsPerRun, rule: "the scan, the policy once per run (2), per account the insert batch (2) and its read-back (2), at most obligationsPerRun" },
  { job: "sweepCommunityContributions", worst: 11, rule: "one 11-statement batch" },
  { job: "sweepCommunityPrivacy", worst: 3, rule: "one 3-statement batch" },
  { job: "newsCron", worst: 4 + 1 + 1 + 4 + 5 + 1, rule: "the cleanup batch (4) + its audit, the settings read when the cleanup failed, the ids batch (4), the counts batch (4 anti-joins + 1), the compare-and-set" },
  { job: "runOfficerDigest", worst: 1 + 1 + 2 + 7 + 1 + 2, rule: "the state, the lease, one cleanup write with its audit, the 7 counts, the frozen intent, the settle with its audit" },
  {job:'runServingErasureJob',worst:140,rule:'one oldest current job, native inactive admission fallback, up to2 expired role debts GET-only, two message pages of5, catalog plus atomic serving erase; completed-account message cleanup shares this envelope'},
  {job:'sweepServingRetention',worst:18,rule:'fixed18-statement native batch, each deterministic selection capped1000; terminal provider receipts expire, unresolved external/recovery custody remains explicit'},
];

/** The sum of the table: the whole scheduled invocation's worst case. */
export const SCHEDULED_WORST_CASE = SCHEDULED_BUDGET.reduce((n, j) => n + j.worst, 0);

/**
 * .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): the other invocations that apply roster effects hold
 * themselves to the same target, counting every statement attempt they make (roster-effects.ts countStatements) and
 * admitting each effect at its worst case before it starts. /ingest/roster: the target less a cold schema check, the one
 * other thing that invocation sends to D1 (the watcher's bearer is checked without it).
 */
export const ROSTER_INGEST_STATEMENTS = SCHEDULED_STATEMENT_TARGET - SCHEMA_WORST;
/**
 * /olympus-admin sync (roster.ts syncFromLatest): the target less a cold schema check and 20 for the interaction's own
 * statements around it (its ledger row and a re-read, the stored answer, the Discord names, the vouch and its audit: 6).
 */
export const ROSTER_SYNC_STATEMENTS = SCHEDULED_STATEMENT_TARGET - SCHEMA_WORST - 20;
