/**
 * A roster export's member effects as a durable, resumable worklist (.115, third review round; Codex, 3 Oct 2026
 * 16:48 UTC, finding A, and his child's review115/provisional-9fed-backend.md section 2).
 *
 * Why. Until now a roster export applied every member's effect inside its one /ingest/roster invocation: each promotion
 * a character and queue batch, the role writer's reads and audits, role.deferred and roster.member; each departure its
 * update, reads and audits; each GUID pin, return and first absence a statement or two of its own. The house conservatively
 * counts every attempted statement, including each statement in a batch, against 700 for a whole path (scheduled-budget.ts).
 * This bounds attempted SQL without claiming a verified provider aggregate batch meter; the role writer's call budget
 * bounds Discord requests, not this SQL model. So a complete roster
 * of 1,000 members who had all just verified (launch day) with ROLE_CALL_BUDGET 4 needed about 4,000 statement attempts,
 * failed partway, and failed after the snapshot had already been stamped complete, leaving some effects applied and
 * nothing that said which.
 *
 * What, in roster.ts with the helpers below:
 * 1. A RUN is the diff of one complete snapshot. It is inserted in the same transaction as the snapshot's complete stamp
 *    (or, for an identical re-export, right after the refresh), with the snapshot departures are judged against and the
 *    ingest's own trust decision, so it outlives the invocation that made it.
 * 2. The run is DERIVED in a bounded number of statements: the GUID pins, the returns and the first absences are applied
 *    in bulk (json_each, a statement per ROSTER_EFFECTS_PER_STATEMENT members), and every effect that needs Discord (a
 *    promotion, an officer's D: note, a confirmed departure) becomes a roster_effects row, all in one batch with the run's
 *    derived_at. Never one statement per member.
 * 3. Items are APPLIED in slices: before each one its kind's worst case (EFFECT_WORST) is admitted against what the
 *    invocation has left, counted by countStatements (bounded admission BEFORE the effect), and the item is claimed in the
 *    same transaction as its database change, so a fault before that commit leaves it pending and a fault after it never
 *    repeats it. Role grants still go through the one role writer (roles.ts grantMemberRole), within the run's call budget;
 *    a grant it defers is the role sweep's, as before.
 * 4. Every /ingest/roster (a changed export, an identical one, a retried one) and every cron run applies a slice; the
 *    cron's is a line of scheduled-budget.ts (SCHEDULED_CAPS.rosterEffectsStatements).
 * 5. A newer run SUPERSEDES an older one: a claim requires its run to be the newest and its snapshot the newest stored, so
 *    nothing of an older export is applied once a newer one exists (even one still being written), and the newer run's
 *    derivation, made from the newest roster and the current links, covers whatever is still due.
 * 6. roster_effect_runs.done_at records that a run's backlog is empty. `complete` on a snapshot only ever meant that its
 *    member rows are stored; neither it nor the fingerprint says anything about effects.
 *
 * This module holds what needs nothing from roster.ts: the statement counter, the admission arithmetic, the worst cases
 * and the SQL that names a run as current. It imports nothing that reaches Discord.
 */
import type { Env } from "./env";
import { privacyDatabaseAdmissionOverhead,privacyProviderCustodyDatabase,registerPrivacyCountedDatabase } from './privacy-serving-authority';

/** Statement attempts one invocation (or one job of the cron's) has made so far through a counted env. */
export interface StatementCount {
  used: number;
  factor?:number;
}

const RAW = Symbol("raw statement");

/**
 * The same env, its DB counting statement attempts conservatively: one per first/all/run/raw, and every statement of a
 * batch, whether or not it completes. This is our admission model, not a verified provider aggregate batch meter; nothing else
 * changes (the statements, their binds and their results are D1's own).
 */
export function countStatements(env: Env, count: StatementCount): Env {
  const overhead=privacyDatabaseAdmissionOverhead(env.DB);count.factor=1+overhead;
  const decorate=(db:D1Database,overhead:number):D1Database=>{
  const wrap = (s: D1PreparedStatement): D1PreparedStatement => {
    const w = {
      bind: (...values: unknown[]) => wrap(s.bind(...values)),
      first: (...a: unknown[]) => {
        count.used+=1+overhead;
        return (s.first as (...x: unknown[]) => Promise<unknown>)(...a);
      },
      run: () => {
        count.used+=1+overhead;
        return s.run();
      },
      all: () => {
        count.used+=1+overhead;
        return s.all();
      },
      raw: (...a: unknown[]) => {
        count.used+=1+2*overhead;
        return (s.raw as (...x: unknown[]) => Promise<unknown>)(...a);
      },
      [RAW]: s,
    };
    return w as unknown as D1PreparedStatement;
  };
  const counted = {
    prepare: (query: string) => wrap(db.prepare(query)),
    batch: (statements: D1PreparedStatement[]) => {
      count.used += statements.length+overhead;
      return db.batch(statements.map((x) => (x as unknown as { [RAW]?: D1PreparedStatement })[RAW] ?? x));
    },
    exec: (query: string) => {
      count.used++;
      return db.exec(query);
    },
    dump: () => (db as unknown as { dump: () => Promise<ArrayBuffer> }).dump(),
  };
  return counted as unknown as D1Database;};
  const counted=decorate(env.DB,overhead),native=privacyProviderCustodyDatabase(env);
  registerPrivacyCountedDatabase(counted,native===env.DB?counted:decorate(native,0),overhead);
  return {...env,DB:counted};
}

/** What an invocation may still spend: its limit, less what it has spent, less what it must keep for later (`reserve`). */
export interface Admission {
  count: StatementCount;
  limit: number;
}
export const room = (a: Admission, reserve: number): number => Math.floor((a.limit-a.count.used)/(a.count.factor??1))-reserve;

/**
 * Each kind's worst case in statement attempts, its claim batch included; an attempt D1 refuses counts too, and a refused
 * audit is what makes a path longest. roster_effects_test measures the costliest paths one item apart.
 * - promote: the claim batch (3: the claim, the character, the invite queue); the grant through the role writer at its
 *   costliest (7: the ban and the hold read before the PUT and again after it, a hold landing during the PUT, its
 *   removal's audit and the pending record both refused, and the promotion's role.add_failed; every other outcome costs
 *   less); a failed nickname's audit (1); roster.member (1); the welcome notice (3: a member's own audit when it is
 *   suppressed, refused or has no channel, and its post's share of the cap's read and audit, at most one post a member).
 * - note: the same with two more statements in the claim batch (another account's dead row set aside, the link made).
 * - depart: the claim batch (2: the claim, status left); then the remaining-characters count, a failed removal's
 *   audit, a failed member read's audit and roster.left (4). A roster departure posts no notice.
 */
export const EFFECT_WORST = { promote: 20, note: 22, depart: 7 } as const;
/** Durable central roles and bot-qualified message custody replace the old direct effects. Root's
 * joined gate must measure these envelopes against the exact composed central source before ON. */
export const SERVING_EFFECT_WORST = {promote:40,note:42,depart:25} as const;
export function effectWorst(env:Env){return env.PRIVACY_ERASURE_ENABLED==='true'?SERVING_EFFECT_WORST:EFFECT_WORST;}
/**
 * The same when the run's Discord-call budget can no longer afford a grant (roles.ts affords(calls, GRANT_CALLS) is false):
 * the writer returns "budget" before any read, writing role.budget_exhausted at most once (counted here each time), and the
 * promotion writes role.deferred (and role.add_failed when that is refused). The call budget only shrinks within a run, so
 * once this applies it applies to the rest of the run.
 */
export const EFFECT_DEFERRED_WORST = { promote: 16, note: 18 } as const;
/** A slice's own statements: the selection, the end batch (done items removed, the run's done_at), a failure's audit. */
export const SLICE_FIXED = 4;
/** The notices' flush reads the post cap once and, when a write of its own is refused, records notice.flush_failed (dm.ts);
 *  everything else it writes is counted per item above. */
export const NOTICE_FLUSH_FIXED = 2;
/** SQL still owed by dm.ts's buffered notices. Each item can occupy its own post: the member's audit, the cap/failure
 *  read, and the cap audit (or the posted audit followed by a failed audit). The flush's one cap read and failure audit
 *  are reserved separately above. Count this debt before admitting another effect, not only when finally flushes. */
export const noticeStatementsPending = (batch: { items: unknown[] }): number => 5 * batch.items.length;

/**
 * Identity effects (roster.ts reconcileIdentities) admitted the same way: a release is its guarded batch (2), departure
 * follow-up (4) and release audit (1), within the previous allowance of 8. A rename is waiting (auditOnce, 2), moved (its
 * guarded batch and audit, 5) or blocked (its guarded batch and auditOnce, 6). The batch reads the expected binding before
 * mutating it, so a stale export neither moves the link nor archives a different account's target row. The swap report
 * and the held-releases report are each at most a read and an audit, once.
 */
export const RELEASE_WORST = 9;
export const RENAME_WORST = 6;
export const IDENTITY_FIXED = 4;

/** Members one bulk statement carries (pins, returns, first absences, items, namesake sightings): well under D1's limits. */
export const ROSTER_EFFECTS_PER_STATEMENT = 500;
const chunks = (n: number) => Math.ceil(n / ROSTER_EFFECTS_PER_STATEMENT);
/** The derivation batch's statements for a roster of `rows` members and `bound` links: three housekeeping statements,
 *  the pins, the returns (audit and update), the first absences (audit and update), the items and derived_at. */
export const derivationWorst = (rows: number, bound: number): number => 3 + chunks(rows) + 2 * chunks(rows) + 2 * chunks(bound) + chunks(rows + bound) + 1;
/** The namesake sightings' audit rows, written in bulk before any admitted identity effect. */
export const sightingsWorst = (rows: number): number => chunks(rows);

/** Split a list into the bulk statements' parts. */
export function inParts<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += ROSTER_EFFECTS_PER_STATEMENT) out.push(list.slice(i, i + ROSTER_EFFECTS_PER_STATEMENT));
  return out;
}

/**
 * The run bound as ?1 is the newest run and its snapshot the newest stored, complete with its stated number of rows.
 * Every derivation statement and every claim carries it, so an older run's effects stop the moment a newer snapshot exists,
 * even one still being written, and resume
 * only if that snapshot is taken back out (roster.ts removes a snapshot whose rows failed).
 */
export const RUN_IS_CURRENT =
  `?1 = (SELECT MAX(id) FROM roster_effect_runs) AND EXISTS (SELECT 1 FROM roster_effect_runs r
    JOIN roster_snapshots s ON s.id = r.snapshot_id
    WHERE r.id = ?1 AND s.id = (SELECT MAX(id) FROM roster_snapshots) AND s.complete = 1
      AND s.member_count = (SELECT COUNT(*) FROM roster_members WHERE snapshot_id = s.id))`;
/** Finished runs are kept this long for the staff's questions (counts and times only), then removed by a later derivation. */
export const RUN_HISTORY_S = 14 * 86400;
