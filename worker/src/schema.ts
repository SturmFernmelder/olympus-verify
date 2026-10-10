/**
 * Columns and tables added after the first deploy, applied by the Worker itself so a deploy never depends on someone
 * remembering to run a migration first. Everything here is idempotent: a column that exists is left alone, and two
 * isolates racing to add the same column both end up fine (the loser's "duplicate column" is swallowed).
 *
 * migrations/2026-09-27-tickets-guid-relays.sql holds the same statements for anyone who prefers to apply them by
 * hand; doing so first is harmless.
 */
import type { Env } from "./env";
import { now } from "./db";
import { errorRef } from "./log";

let ready: Promise<void> | null = null;

/** Resolves once the schema this build expects is in place. Cached per isolate; retried after a failure. */
export function ensureSchema(env: Env): Promise<void> {
  if (!ready) {
    ready = migrate(env).catch((e) => {
      ready = null; // try again on the next request rather than caching the failure
      throw e;
    });
  }
  return ready;
}

/** For tests: forget that this isolate has already checked. */
export function forgetSchemaCheck() {
  ready = null;
}

/** True when the column exists. A zero-row SELECT is a plain read, which every D1 plan allows (no PRAGMA needed). */
async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  try {
    await env.DB.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).all();
    return true;
  } catch (e) {
    if (/no such column/i.test(String(e))) return false;
    throw e;
  }
}

async function addColumn(env: Env, table: string, column: string, type: string) {
  if (await hasColumn(env, table, column)) return;
  try {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } catch (e) {
    if (!/duplicate column/i.test(String(e))) throw e; // another isolate got there first
  }
}

async function migrate(env: Env) {
  // 27 Sep 2026: request codes (pending.nonce), GUID-pinned links (characters.guid), relay presence (relays, with the
  // addon version its login note reports).
  await addColumn(env, "pending", "nonce", "TEXT");
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS pending_nonce ON pending(nonce, consumed_at)").run();
  await addColumn(env, "characters", "guid", "TEXT");
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS relays (
       officer_id TEXT PRIMARY KEY,
       character  TEXT NOT NULL,
       online     INTEGER NOT NULL DEFAULT 0,
       seen_at    INTEGER NOT NULL,
       changed_at INTEGER NOT NULL,
       version    TEXT,
       addon      TEXT,
       unknown_since INTEGER
     )`,
  ).run();
  await addColumn(env, "relays", "addon", "TEXT"); // for a relays table created by an earlier build of this change
  await addColumn(env, "relays", "unknown_since", "INTEGER"); // .62 (1 Oct 2026): a watcher that cannot tell (relays.ts); migrations/2026-10-01-relays-unknown-presence.sql
  // 29 Sep 2026 (.39): the bot's pinned channel intros in Asmongold's server (intros.ts) and the one-refresh-at-a-time
  // lock. Same statements as migrations/2026-09-29-intro-posts.sql.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS intro_posts (
       guild_id   TEXT NOT NULL,
       intro_key  TEXT NOT NULL,
       parent_id  TEXT NOT NULL,
       channel_id TEXT NOT NULL,
       message_id TEXT NOT NULL,
       hash       TEXT NOT NULL,
       posted_at  INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       PRIMARY KEY (guild_id, intro_key)
     )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS intro_locks (
       guild_id TEXT PRIMARY KEY,
       holder   TEXT NOT NULL,
       until    INTEGER NOT NULL
     )`,
  ).run();
  // 30 Sep 2026 (.47): the replay ledger for signed interactions (index.ts). Same as migrations/2026-09-30-seen-interactions.sql.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS seen_interactions (id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL, response TEXT)").run();
  await addColumn(env, "seen_interactions", "response", "TEXT"); // for a table made by the first .47 build
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS seen_interactions_at ON seen_interactions(seen_at)").run();
  // 1 Oct 2026 (.50): /verify-status asks whether this account ever linked (bnet-retention.ts everLinked). Same as
  // migrations/2026-10-01-audit-actor-action.sql.
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_actor_action ON audit(actor, action)").run();
  await migrateGuildSite(env);
  // .130: a parent-bound publication disposition; a separate probe/ALTER adds at most two cold statements.
  await addColumn(env, "community_events", "publication_closed", "INTEGER NOT NULL DEFAULT 0 CHECK (publication_closed IN (0, 1))");
  await addColumn(env, "community_events", "reminder_closed", "INTEGER NOT NULL DEFAULT 0 CHECK (reminder_closed IN (0, 1))");
  await redactSettingsAudit(env);
}

/** .115 (item C): set once the historic site.settings audit rows have been rewritten to counts (redactSettingsAudit). */
export const AUDIT_TYPED_NAMES_KEY = "auditTypedNames";

/**
 * .115 (Viktor's item C, 2 Oct 2026; the one-time rewrite confirmed by the owner, 3 Oct): the dated log outlives an
 * erasure, so from .115 a settings save records the appointed roles' keys, how many names were saved and whether a notice
 * was set (site-admin.ts settingsAuditDetails), never the typed names or the notice text. This gives the site.settings
 * rows written before .115 the same shape, once: `appointed` (the JSON text of {roleKey: name}) becomes appointedRoles
 * (the sorted keys of an object, [] for anything else) and appointedNames (their count, null when it was not an object),
 * and a text `notice` becomes true or false. Rows whose details are not JSON, and every other action, are left alone.
 *
 * One batch, so the marker is written only together with the rewrite. Both UPDATEs match nothing once done, so two
 * isolates racing here end up with the same rows. The marker leaves one primary-key read per isolate start; without it
 * every start would scan the audit table, which has no index on the action alone. Every JSON function on a stored value
 * sits behind a CASE on json_valid (CASE keeps its order; AND need not), so a malformed row cannot fail the statement.
 *
 * Irreversible: the fresh verified private backup comes before the deploy that runs it (docs/deploy-checklist.md).
 * Not in migrations/2026-10-03-news-and-seats.sql: it changes rows, not the schema, and applied by hand ahead of the
 * deploy it would set the marker while .114 still writes names into the log.
 *
 * A failure is logged (errorRef) and does not fail the schema check: nothing in this build reads these rows' shape, and
 * holding the bot, the watcher and the site at 503 over a log rewrite would be the wrong trade. Without the marker the
 * next isolate start tries again. So the deploy proves nothing: the counts-only read-back (the marker, no site.settings
 * row still carrying `appointed` or a text `notice`, none that is not JSON) is a mandatory acceptance gate after every
 * deploy, roll-forward and restore (docs/deploy-checklist.md, Worker .115, rollout step 7; Codex, 3 Oct 2026,
 * 13:24 UTC). The marker records one run, not later rows: an older writer resumed after it writes the old shape again,
 * and the owner then deletes the marker so that a later start rewrites what remains. A running isolate has checked already
 * (`ready` above) and never looks again, so "a later start" is a fresh isolate: the runbook has the owner redeploy the same
 * commit and request /health once (the second review round, 3 Oct 2026).
 */
async function redactSettingsAudit(env: Env) {
  try {
    if (await env.DB.prepare("SELECT 1 AS done FROM site_settings WHERE key = ?1").bind(AUDIT_TYPED_NAMES_KEY).first()) return;
    await env.DB.batch([
      env.DB.prepare(REDACT_APPOINTED),
      env.DB.prepare(REDACT_NOTICE),
      env.DB.prepare("INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, NULL) ON CONFLICT(key) DO NOTHING").bind(AUDIT_TYPED_NAMES_KEY, "115", now()),
    ]);
  } catch (e) {
    console.error("settings audit rewrite failed", errorRef(e));
  }
}

const APPOINTED_OF = "json_extract(details, '$.appointed')";
const APPOINTED_IS_OBJECT = `CASE WHEN json_valid(${APPOINTED_OF}) THEN json_type(${APPOINTED_OF}) = 'object' ELSE 0 END`;
const REDACT_APPOINTED = `UPDATE audit SET details = json_remove(json_set(details,
     '$.appointedRoles', json(CASE WHEN ${APPOINTED_IS_OBJECT} THEN (SELECT json_group_array(key) FROM (SELECT key FROM json_each(${APPOINTED_OF}) ORDER BY key)) ELSE '[]' END),
     '$.appointedNames', CASE WHEN ${APPOINTED_IS_OBJECT} THEN (SELECT COUNT(*) FROM json_each(${APPOINTED_OF})) ELSE NULL END),
   '$.appointed')
  WHERE action = 'site.settings' AND CASE WHEN json_valid(details) THEN json_type(details, '$.appointed') IS NOT NULL ELSE 0 END`;
const REDACT_NOTICE = `UPDATE audit SET details = json_set(details, '$.notice', json(CASE WHEN length(json_extract(details, '$.notice')) > 0 THEN 'true' ELSE 'false' END))
  WHERE action = 'site.settings' AND CASE WHEN json_valid(details) THEN json_type(details, '$.notice') = 'text' ELSE 0 END`;

/**
 * 29 Sep 2026 (.41): the guild site on SITE_HOST (site.ts), the Discord names shown for linked members (names.ts), and
 * the reserved-name priority in the invite queue. Same statements as migrations/2026-09-29-guild-site.sql.
 * 30 Sep 2026 (.43): backup choices, the availability grid, the voting board and the NA/EU raid roles; the same as
 * migrations/2026-09-30-board.sql.
 *
 * Two round trips once everything exists: the tables and indexes in one batch (all IF NOT EXISTS), then one batch that
 * reads every new column. D1 runs a batch as one transaction and fails it as a whole, so a missing column shows up as
 * that batch failing, and only then are the columns checked and added one at a time. The site can bring many isolates,
 * and each one runs this once.
 */
async function migrateGuildSite(env: Env) {
  // The tables, then (.43) the old single Raid Leader and Raid Assist moved to NA or EU. Those UPDATEs match nothing
  // once done, and the position and ballot indexes make that a lookup, so they run with every isolate's check.
  await env.DB.batch([...SITE_SCHEMA, ...LEGACY_ROLES].map((sql) => env.DB.prepare(sql)));
  // The index needs invite_queue.priority, so it rides in the column batch: present columns, index made or kept.
  // .115: so does the roster_snapshots.first_received_at index.
  const columnsAndIndex = () => [
    ...NEW_COLUMNS.map(([table, column]) => env.DB.prepare(`SELECT ${column} FROM ${table} LIMIT 0`)),
    env.DB.prepare(QUEUE_ORDER_INDEX),
    env.DB.prepare(ROSTER_FIRST_INDEX),
  ];
  try {
    await env.DB.batch(columnsAndIndex());
    return;
  } catch {
    /* at least one column is missing: add them one by one below */
  }
  for (const [table, column, type] of NEW_COLUMNS) await addColumn(env, table, column, type);
  await env.DB.prepare(QUEUE_ORDER_INDEX).run();
  await env.DB.prepare(ROSTER_FIRST_INDEX).run();
}

const QUEUE_ORDER_INDEX = "CREATE INDEX IF NOT EXISTS invite_queue_order ON invite_queue(status, priority, id)";
// .115 (2 Oct 2026, item B): when each exact roster first arrived; migrations/2026-10-03-news-and-seats.sql.
const ROSTER_FIRST_INDEX = "CREATE INDEX IF NOT EXISTS roster_snapshots_first ON roster_snapshots(first_received_at)";

const NEW_COLUMNS: Array<[string, string, string]> = [
  ["members", "username", "TEXT"],        // Discord username (the unique handle)
  ["members", "global_name", "TEXT"],     // Discord display name, when set
  ["members", "names_at", "INTEGER"],     // when those two were last read
  ["invite_queue", "priority", "INTEGER NOT NULL DEFAULT 0"], // 1 = a reserved name the site queued (site-queue.ts)
  // .43 (30 Sep 2026): two backup choices and the weekly availability grid (site-data.ts).
  ["site_applications", "backup1", "TEXT"],
  ["site_applications", "backup2", "TEXT"],
  ["site_applications", "avail", "TEXT"],
  ["site_applications", "avail_tz", "TEXT"],
  ["site_applications", "fit_na", "INTEGER"],
  ["site_applications", "fit_eu", "INTEGER"],
  ["site_applications", "board_at", "INTEGER"],
  // .115 (guild-seats.ts, site-news.ts): whether a roster export was trusted against the last trusted one, whether all
  // of its member rows are in, and when that exact roster first arrived (roster.ts); migrations/2026-10-03-news-and-seats.sql.
  ["roster_snapshots", "trusted", "INTEGER"],
  ["roster_snapshots", "complete", "INTEGER"],
  ["roster_snapshots", "first_received_at", "INTEGER"],
];

/**
 * .43: Raid Leader and Raid Assist became NA and EU roles. An application goes by the region its applicant gave (Europe
 * to EU, anywhere else to NA); a nomination goes by the nominee's own application when there is one, otherwise NA.
 */
const LEGACY_ROLES = [
  `UPDATE site_applications SET position = position || CASE WHEN region = 'eu' THEN '_eu' ELSE '_na' END
    WHERE position IN ('raid_leader', 'raid_assist')`,
  `UPDATE site_votes SET ballot = 'raid_leader' || CASE WHEN EXISTS (
       SELECT 1 FROM site_applications a WHERE site_votes.nominee_kind = 'discord' AND a.discord_id = site_votes.nominee_key AND a.region = 'eu')
     THEN '_eu' ELSE '_na' END
    WHERE ballot = 'raid_leader'`,
];

export const SITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS site_users (
     discord_id      TEXT PRIMARY KEY,
     username        TEXT,
     global_name     TEXT,
     nick            TEXT,
     avatar          TEXT,
     account_created INTEGER,
     server_joined   INTEGER,
     first_login     INTEGER NOT NULL,
     last_login      INTEGER NOT NULL,
     checked_at      INTEGER,
     in_server       INTEGER NOT NULL DEFAULT 1,
     session_version INTEGER NOT NULL DEFAULT 1,
     denied          INTEGER NOT NULL DEFAULT 0,
     denied_reason   TEXT,
     denied_at       INTEGER,
     denied_by       TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS site_applications (
     discord_id  TEXT PRIMARY KEY,
     position    TEXT NOT NULL,
     class_lead  TEXT,
     backup1     TEXT,
     backup2     TEXT,
     fallback    INTEGER NOT NULL DEFAULT 1,
     character   TEXT,
     char_key    TEXT,
     class       TEXT,
     role        TEXT,
     region      TEXT,
     avail       TEXT,
     avail_tz    TEXT,
     fit_na      INTEGER,
     fit_eu      INTEGER,
     board_at    INTEGER,
     answers     TEXT NOT NULL,
     status      TEXT NOT NULL,
     admin_note  TEXT,
     reviewed_by TEXT,
     reviewed_at INTEGER,
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS site_applications_position ON site_applications(position, status)",
  `CREATE TABLE IF NOT EXISTS site_votes (
     voter_id      TEXT NOT NULL,
     ballot        TEXT NOT NULL,
     slot          INTEGER NOT NULL,
     nominee_kind  TEXT NOT NULL,
     nominee_key   TEXT NOT NULL,
     nominee_label TEXT NOT NULL,
     reason        TEXT,
     created_at    INTEGER NOT NULL,
     updated_at    INTEGER NOT NULL,
     PRIMARY KEY (voter_id, ballot, slot)
   )`,
  "CREATE INDEX IF NOT EXISTS site_votes_tally ON site_votes(ballot, nominee_kind, nominee_key)",
  "CREATE INDEX IF NOT EXISTS site_votes_nominee ON site_votes(nominee_kind, nominee_key)", // .43: "you were nominated" on sign-in
  `CREATE TABLE IF NOT EXISTS site_friends (
     owner_id     TEXT NOT NULL,
     friend_kind  TEXT NOT NULL,
     friend_key   TEXT NOT NULL,
     friend_label TEXT NOT NULL,
     note         TEXT,
     created_at   INTEGER NOT NULL,
     PRIMARY KEY (owner_id, friend_kind, friend_key)
   )`,
  "CREATE INDEX IF NOT EXISTS site_friends_friend ON site_friends(friend_kind, friend_key)",
  `CREATE TABLE IF NOT EXISTS site_reserved (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     owner_id    TEXT NOT NULL,
     name        TEXT NOT NULL,
     name_key    TEXT NOT NULL,
     status      TEXT NOT NULL,
     created_at  INTEGER NOT NULL,
     approved_by TEXT,
     approved_at INTEGER,
     queue_id    INTEGER,
     queued_at   INTEGER,
     released_by TEXT,
     released_at INTEGER
   )`,
  "CREATE INDEX IF NOT EXISTS site_reserved_owner ON site_reserved(owner_id, status)",
  "CREATE INDEX IF NOT EXISTS site_reserved_name ON site_reserved(name_key, status)",
  "CREATE INDEX IF NOT EXISTS site_reserved_status ON site_reserved(status, id)",
  `CREATE TABLE IF NOT EXISTS site_settings (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     updated_by TEXT
   )`,
  // .43: the voting board. One row per voter, applicant and role: +1 for, -1 against (no row = no vote).
  `CREATE TABLE IF NOT EXISTS site_board_votes (
     voter_id     TEXT NOT NULL,
     candidate_id TEXT NOT NULL,
     role_key     TEXT NOT NULL,
     vote         INTEGER NOT NULL,
     created_at   INTEGER NOT NULL,
     updated_at   INTEGER NOT NULL,
     PRIMARY KEY (voter_id, candidate_id, role_key)
   )`,
  "CREATE INDEX IF NOT EXISTS site_board_votes_tally ON site_board_votes(role_key, candidate_id)",
  "CREATE INDEX IF NOT EXISTS site_board_votes_candidate ON site_board_votes(candidate_id)",
  // .56 (1 Oct 2026): the community modules' first table (community-refs.ts). Same as migrations/2026-10-01-community-refs.sql.
  `CREATE TABLE IF NOT EXISTS community_refs (
     discord_id TEXT PRIMARY KEY,
     ref        TEXT NOT NULL UNIQUE CHECK (length(ref) = 22),
     created_at INTEGER NOT NULL
   )`,
  // .57 (1 Oct 2026): the member directory and crafting offers (community-directory.ts). Same as migrations/2026-10-01-community-directory.sql.
  `CREATE TABLE IF NOT EXISTS community_profiles (
     discord_id      TEXT PRIMARY KEY,
     ref             TEXT NOT NULL UNIQUE CHECK (length(ref) = 22),
     revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     listed          INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1)),
     main_name       TEXT CHECK (main_name IS NULL OR length(main_name) BETWEEN 2 AND 40),
     main_key        TEXT,
     main_source     TEXT CHECK (main_source IN ('self', 'keeper')),
     main_updated_at INTEGER,
     raid_role       TEXT CHECK (raid_role IN ('tank', 'healer', 'damage')),
     role_updated_at INTEGER,
     departed_at     INTEGER,
     write_nonce     TEXT,
     created_at      INTEGER NOT NULL,
     updated_at      INTEGER NOT NULL,
     CHECK ((main_name IS NULL) = (main_key IS NULL) AND (main_name IS NULL) = (main_source IS NULL) AND (main_name IS NULL) = (main_updated_at IS NULL)),
     CHECK ((raid_role IS NULL) = (role_updated_at IS NULL))
   )`,
  "CREATE INDEX IF NOT EXISTS community_profiles_listed ON community_profiles(listed)",
  "CREATE INDEX IF NOT EXISTS community_profiles_departed ON community_profiles(departed_at)",
  "CREATE INDEX IF NOT EXISTS community_profiles_main_key ON community_profiles(main_key)",
  `CREATE TABLE IF NOT EXISTS community_professions (
     discord_id TEXT NOT NULL,
     profession TEXT NOT NULL CHECK (profession IN ('alchemy', 'blacksmithing', 'enchanting', 'engineering', 'herbalism', 'leatherworking', 'mining', 'skinning', 'tailoring', 'cooking', 'fishing', 'first_aid')),
     skill      INTEGER CHECK (skill IS NULL OR skill BETWEEN 0 AND 450),
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (discord_id, profession)
   )`,
  `CREATE TABLE IF NOT EXISTS community_alt_claims (
     discord_id  TEXT NOT NULL,
     name        TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
     name_key    TEXT NOT NULL,
     status      TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'officer_confirmed', 'rejected')),
     proof       TEXT NOT NULL DEFAULT 'self' CHECK (proof IN ('self', 'keeper')),
     claimed_at  INTEGER NOT NULL,
     reviewed_by TEXT,
     reviewed_at INTEGER,
     updated_at  INTEGER NOT NULL,
     PRIMARY KEY (discord_id, name_key)
   )`,
  "CREATE INDEX IF NOT EXISTS community_alt_claims_key ON community_alt_claims(name_key)",
  "CREATE INDEX IF NOT EXISTS community_alt_claims_status ON community_alt_claims(status)",
  "CREATE INDEX IF NOT EXISTS community_alt_claims_reviewer ON community_alt_claims(reviewed_by)",
  `CREATE TABLE IF NOT EXISTS community_craft_offers (
     discord_id  TEXT NOT NULL,
     profession  TEXT NOT NULL CHECK (profession IN ('alchemy', 'blacksmithing', 'enchanting', 'engineering', 'herbalism', 'leatherworking', 'mining', 'skinning', 'tailoring', 'cooking', 'fishing', 'first_aid')),
     recipe_name TEXT NOT NULL CHECK (length(recipe_name) BETWEEN 2 AND 60),
     recipe_key  TEXT NOT NULL CHECK (length(recipe_key) BETWEEN 2 AND 60),
     updated_at  INTEGER NOT NULL,
     PRIMARY KEY (discord_id, recipe_key)
   )`,
  "CREATE INDEX IF NOT EXISTS community_craft_offers_key ON community_craft_offers(recipe_key)",
  "CREATE INDEX IF NOT EXISTS community_craft_offers_profession ON community_craft_offers(profession, recipe_key)",
  // .59 (1 Oct 2026): the guild calendar (community-events.ts). Same as migrations/2026-10-01-community-events.sql.
  `CREATE TABLE IF NOT EXISTS community_events (
     id                    TEXT PRIMARY KEY CHECK (length(id) = 22),
     op_id                 TEXT NOT NULL,
     op_hash               TEXT,
     title                 TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
     details               TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
     starts_at             INTEGER NOT NULL CHECK (starts_at > 0),
     duration_min          INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 720),
     ends_at               INTEGER NOT NULL CHECK (ends_at = starts_at + duration_min * 60),
     capacity              INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100),
     role_targets          TEXT CHECK (role_targets IS NULL OR json_valid(role_targets)),
     status                TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
     created_by            TEXT,
     revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     signup_generation     INTEGER NOT NULL DEFAULT 0 CHECK (signup_generation >= 0),
     attendance_generation INTEGER NOT NULL DEFAULT 0 CHECK (attendance_generation >= 0),
     nonce                 TEXT,
     attendance_nonce      TEXT,
     publication_closed    INTEGER NOT NULL DEFAULT 0 CHECK (publication_closed IN (0, 1)),
     reminder_closed       INTEGER NOT NULL DEFAULT 0 CHECK (reminder_closed IN (0, 1)),
     created_at            INTEGER NOT NULL,
     updated_at            INTEGER NOT NULL,
     retain_until          INTEGER NOT NULL
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS community_events_op ON community_events(created_by, op_id)",
  "CREATE INDEX IF NOT EXISTS community_events_window ON community_events(starts_at, ends_at)",
  "CREATE INDEX IF NOT EXISTS community_events_retain ON community_events(retain_until)",
  `CREATE TABLE IF NOT EXISTS community_event_signups (
     event_id       TEXT NOT NULL,
     discord_id     TEXT NOT NULL,
     status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),
     character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),
     character_key  TEXT,
     raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),
     revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     rsvp_starts_at INTEGER NOT NULL,
     updated_at     INTEGER NOT NULL,
     write_nonce    TEXT,
     PRIMARY KEY (event_id, discord_id),
     CHECK ((character_name IS NULL) = (character_key IS NULL))
   )`,
  "CREATE INDEX IF NOT EXISTS community_event_signups_member ON community_event_signups(discord_id)",
  "CREATE INDEX IF NOT EXISTS community_event_signups_status ON community_event_signups(event_id, status)",
  `CREATE TABLE IF NOT EXISTS community_event_changes (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     event_id TEXT NOT NULL,
     action   TEXT NOT NULL CHECK (action IN ('created', 'updated', 'cancelled')),
     actor    TEXT,
     at       INTEGER NOT NULL,
     fields   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields))
   )`,
  "CREATE INDEX IF NOT EXISTS community_event_changes_event ON community_event_changes(event_id)",
  "CREATE INDEX IF NOT EXISTS community_event_changes_actor ON community_event_changes(actor)",
  `CREATE TABLE IF NOT EXISTS community_event_attendance (
     event_id    TEXT NOT NULL,
     discord_id  TEXT NOT NULL,
     state       TEXT NOT NULL CHECK (state IN ('present', 'absent', 'excused', 'unknown')),
     source      TEXT NOT NULL DEFAULT 'officer' CHECK (source IN ('officer', 'observed')),
     reason_code TEXT CHECK (reason_code IS NULL OR (reason_code IN ('late', 'left_early') AND state = 'present')),
     recorded_by TEXT,
     recorded_at INTEGER NOT NULL,
     revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     write_nonce TEXT,
     PRIMARY KEY (event_id, discord_id)
   )`,
  "CREATE INDEX IF NOT EXISTS community_event_attendance_member ON community_event_attendance(discord_id)",
  "CREATE INDEX IF NOT EXISTS community_event_attendance_recorder ON community_event_attendance(recorded_by)",
  // .61 (1 Oct 2026): trial reviews (community-trials.ts). Same as migrations/2026-10-01-community-trials.sql.
  `CREATE TABLE IF NOT EXISTS community_trials (
     id                 TEXT PRIMARY KEY CHECK (length(id) = 22),
     op_id              TEXT NOT NULL,
     op_hash            TEXT,
     discord_id         TEXT NOT NULL,
     sponsor_discord_id TEXT,
     started_at         INTEGER NOT NULL,
     review_due_at      INTEGER NOT NULL CHECK (review_due_at > started_at),
     status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'passed', 'ended')),
     outcome_reason     TEXT,
     concluded_at       INTEGER,
     created_by         TEXT,
     updated_by         TEXT,
     created_at         INTEGER NOT NULL,
     updated_at         INTEGER NOT NULL,
     incarnation        TEXT NOT NULL,
     revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     nonce              TEXT,
     retain_until       INTEGER NOT NULL,
     CHECK ((status IN ('active', 'extended') AND outcome_reason IS NULL AND concluded_at IS NULL)
         OR (status = 'passed' AND COALESCE(outcome_reason, '') = 'review_passed' AND concluded_at IS NOT NULL)
         OR (status = 'ended' AND COALESCE(outcome_reason, '') IN ('withdrew', 'inactive', 'staff_decision') AND concluded_at IS NOT NULL)),
     CHECK (sponsor_discord_id IS NULL OR sponsor_discord_id <> discord_id)
   )`,
  "DROP INDEX IF EXISTS community_trials_open", // .66: open-uniqueness is judged inside the insert at database time (an expired open trial must not block)
  // .69 (1 Oct 2026): restriction cases, their watch-list and the member-level retention period (community-restrictions.ts).
  // Same as migrations/2026-10-01-community-restrictions.sql.
  `CREATE TABLE IF NOT EXISTS community_restriction_cases (
     id              TEXT PRIMARY KEY CHECK (length(id) = 22),
     discord_id      TEXT NOT NULL,
     category        TEXT NOT NULL CHECK (category IN ('ban', 'conduct_removal', 'tithe_removal')),
     set_by          TEXT NOT NULL,
     set_at          INTEGER NOT NULL,
     review_at       INTEGER NOT NULL,
     expires_at      INTEGER,
     appeal_status   TEXT NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none', 'requested', 'upheld', 'overturned')),
     review_outcome  TEXT CHECK (review_outcome IN ('continued', 'lifted')),
     reviewed_at     INTEGER,
     reviewed_by     TEXT,
     acknowledged_at INTEGER,
     acknowledged_by TEXT,
     resolved_at     INTEGER,
     resolved_by     TEXT,
     updated_at      INTEGER NOT NULL,
     updated_by      TEXT,
     retain_until    INTEGER,
     incarnation     TEXT NOT NULL,
     revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     nonce           TEXT,
     CHECK ((category = 'ban') = (expires_at IS NULL))
   )`,
  "CREATE INDEX IF NOT EXISTS community_restriction_cases_member ON community_restriction_cases(discord_id)",
  "CREATE INDEX IF NOT EXISTS community_restriction_cases_review ON community_restriction_cases(review_at)",
  "CREATE INDEX IF NOT EXISTS community_restriction_cases_retain ON community_restriction_cases(retain_until)",
  `CREATE TABLE IF NOT EXISTS community_restriction_characters (
     case_id         TEXT NOT NULL,
     character_key   TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),
     character_name  TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
     proof_key       TEXT NOT NULL,
     guid            TEXT,
     added_at        INTEGER NOT NULL,
     added_by        TEXT,
     review_at       INTEGER NOT NULL,
     expires_at      INTEGER NOT NULL,
     renewed_at      INTEGER,
     renewed_by      TEXT,
     renewal_reason  TEXT CHECK (renewal_reason IN ('ongoing_risk', 'appeal_pending', 'repeat_return')),
     revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     CHECK (review_at >= added_at AND review_at <= expires_at),
     CHECK ((renewed_at IS NULL) = (renewal_reason IS NULL)),
     PRIMARY KEY (case_id, character_key)
   )`,
  "CREATE INDEX IF NOT EXISTS community_restriction_characters_key ON community_restriction_characters(proof_key)",
  "CREATE INDEX IF NOT EXISTS community_restriction_characters_expiry ON community_restriction_characters(expires_at)",
  `CREATE TABLE IF NOT EXISTS community_restriction_periods (
     discord_id      TEXT PRIMARY KEY,
     opened_at       INTEGER NOT NULL,
     retain_until    INTEGER NOT NULL,
     renewed_at      INTEGER,
     renewal_reason  TEXT CHECK (renewal_reason IN ('ongoing_risk', 'appeal_pending', 'repeat_return')),
     nonce           TEXT
   )`,
  // .70 (1 Oct 2026): departure review items (community-departures.ts). Same as migrations/2026-10-01-community-departures.sql.
  `CREATE TABLE IF NOT EXISTS community_departure_reviews (
     id                  TEXT PRIMARY KEY CHECK (length(id) = 22),
     discord_id          TEXT NOT NULL,
     character_key       TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),
     character_name      TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
     proof_key           TEXT NOT NULL,
     kind                TEXT NOT NULL CHECK (kind IN ('left', 'removed', 'unknown')),
     observed_at         INTEGER NOT NULL,
     status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'restriction_opened')),
     restriction_case_id TEXT,
     reviewed_by         TEXT,
     reviewed_at         INTEGER,
     created_at          INTEGER NOT NULL,
     revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     nonce               TEXT,
     retain_until        INTEGER NOT NULL,
     CHECK ((status = 'open') = (reviewed_at IS NULL)),
     CHECK ((status = 'restriction_opened') = (restriction_case_id IS NOT NULL)),
     UNIQUE (discord_id, proof_key, observed_at)
   )`,
  "CREATE INDEX IF NOT EXISTS community_departure_reviews_status ON community_departure_reviews(status, observed_at)",
  "CREATE INDEX IF NOT EXISTS community_departure_reviews_retain ON community_departure_reviews(retain_until)",
  "CREATE INDEX IF NOT EXISTS community_trials_member ON community_trials(discord_id)",
  "CREATE INDEX IF NOT EXISTS community_trials_due ON community_trials(review_due_at)",
  "CREATE INDEX IF NOT EXISTS community_trials_retain ON community_trials(retain_until)",
  "CREATE INDEX IF NOT EXISTS community_trials_sponsor ON community_trials(sponsor_discord_id)",
  // .82 (1 Oct 2026): the private request intake (community-privacy-intake.ts). Same as migrations/2026-10-01-community-privacy-intake.sql.
  `CREATE TABLE IF NOT EXISTS community_privacy_cases (
     case_id        TEXT PRIMARY KEY CHECK (length(case_id) = 22),
     code_hash      TEXT NOT NULL CHECK (length(code_hash) = 64),
     payload_hash   TEXT NOT NULL,
     kind           TEXT NOT NULL CHECK (kind IN ('access', 'deletion', 'correction', 'objection', 'other')),
     subject_hint   TEXT CHECK (subject_hint IS NULL OR length(subject_hint) <= 64),
     character_hint TEXT CHECK (character_hint IS NULL OR length(character_hint) <= 64),
     status         TEXT NOT NULL CHECK (status IN ('received', 'in_review', 'needs_verification', 'completed', 'declined')),
     retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
     retain_until   INTEGER NOT NULL,
     created_at     INTEGER NOT NULL,
     updated_at     INTEGER NOT NULL,
     closed_at      INTEGER
   )`,
  "CREATE INDEX IF NOT EXISTS community_privacy_cases_retain ON community_privacy_cases(retain_until)",
  "CREATE INDEX IF NOT EXISTS community_privacy_cases_created ON community_privacy_cases(created_at)",
  "CREATE INDEX IF NOT EXISTS community_privacy_cases_open ON community_privacy_cases(closed_at)",
  `CREATE TABLE IF NOT EXISTS community_privacy_messages (
     case_id    TEXT NOT NULL,
     message_id TEXT NOT NULL CHECK (length(message_id) = 22),
     author     TEXT NOT NULL CHECK (author IN ('requester', 'staff')),
     text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
     text_hash  TEXT NOT NULL,
     nonce      TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (case_id, message_id)
   )`,
  "CREATE INDEX IF NOT EXISTS community_privacy_messages_order ON community_privacy_messages(case_id, created_at)",
  `CREATE TABLE IF NOT EXISTS community_privacy_operations (
     case_id      TEXT NOT NULL,
     op_id        TEXT NOT NULL CHECK (length(op_id) = 22),
     payload_hash TEXT NOT NULL,
     nonce        TEXT NOT NULL,
     created_at   INTEGER NOT NULL,
     PRIMARY KEY (case_id, op_id)
   )`,
  // .76 (1 Oct 2026): the departure intake's scan position (community-departures.ts). Same as migrations/2026-10-01-community-departure-scan.sql.
  `CREATE TABLE IF NOT EXISTS community_departure_scan (
     id         INTEGER PRIMARY KEY CHECK (id = 1),
     left_at    INTEGER NOT NULL,
     name_key   TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  // .75 (1 Oct 2026): the contribution ledger (community-contributions.ts). Same as migrations/2026-10-01-community-contributions.sql.
  `CREATE TABLE IF NOT EXISTS community_contribution_policies (
     version                TEXT PRIMARY KEY,
     amount_copper          INTEGER NOT NULL CHECK (amount_copper > 0),
     anchor_weekday         INTEGER NOT NULL CHECK (anchor_weekday BETWEEN 0 AND 6),
     anchor_hour_utc        INTEGER NOT NULL CHECK (anchor_hour_utc BETWEEN 0 AND 23),
     grace_hours            INTEGER NOT NULL CHECK (grace_hours >= 0),
     final_notice_days      INTEGER NOT NULL CHECK (final_notice_days >= 1),
     review_days            INTEGER NOT NULL CHECK (review_days >= 1),
     new_member_exempt_days INTEGER NOT NULL CHECK (new_member_exempt_days >= 0),
     created_at             INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS community_contribution_members (
     guild_scope  TEXT NOT NULL,
     discord_id   TEXT NOT NULL,
     incarnation  TEXT NOT NULL CHECK (length(incarnation) = 22),
     revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     nonce        TEXT,
     updated_at   INTEGER NOT NULL,
     PRIMARY KEY (guild_scope, discord_id)
   )`,
  `CREATE TABLE IF NOT EXISTS community_contribution_obligations (
     id                       INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_scope              TEXT NOT NULL,
     discord_id               TEXT NOT NULL,
     period_start             INTEGER NOT NULL,
     due_at                   INTEGER NOT NULL,
     policy_version           TEXT NOT NULL REFERENCES community_contribution_policies(version),
     amount_copper            INTEGER NOT NULL CHECK (amount_copper > 0),
     eligible                 INTEGER NOT NULL CHECK (eligible IN (0, 1)),
     state                    TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'exempt', 'disputed', 'resolved')),
     acknowledged_at          INTEGER,
     officer_contact_at       INTEGER,
     final_notice_at          INTEGER,
     final_acknowledged_at    INTEGER,
     final_officer_contact_at INTEGER,
     revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     facts_revision           INTEGER NOT NULL DEFAULT 1 CHECK (facts_revision >= 1),
     removal_case_id          TEXT,
     retain_until             INTEGER NOT NULL,
     op_nonce                 TEXT,
     created_at               INTEGER NOT NULL,
     updated_at               INTEGER NOT NULL,
     UNIQUE (guild_scope, discord_id, period_start)
   )`,
  "CREATE INDEX IF NOT EXISTS community_contribution_obligations_retain ON community_contribution_obligations(retain_until)",
  `CREATE TABLE IF NOT EXISTS community_contribution_receipts (
     id                  TEXT PRIMARY KEY CHECK (length(id) = 22),
     guild_scope         TEXT NOT NULL,
     source              TEXT NOT NULL CHECK (source IN ('officer_manual', 'mail', 'bank_log')),
     source_id           TEXT NOT NULL,
     payload_hash        TEXT NOT NULL,
     payer_name          TEXT,
     amount_copper       INTEGER NOT NULL CHECK (amount_copper > 0),
     retired_copper      INTEGER NOT NULL DEFAULT 0 CHECK (retired_copper >= 0),
     observed_at         INTEGER NOT NULL,
     observer_discord_id TEXT,
     matched_discord_id  TEXT,
     status              TEXT NOT NULL CHECK (status IN ('matched', 'unmatched', 'disputed', 'rejected')),
     voided_at           INTEGER,
     retain_until        INTEGER NOT NULL,
     created_at          INTEGER NOT NULL,
     UNIQUE (guild_scope, source, source_id)
   )`,
  "CREATE INDEX IF NOT EXISTS community_contribution_receipts_member ON community_contribution_receipts(guild_scope, matched_discord_id)",
  "CREATE INDEX IF NOT EXISTS community_contribution_receipts_retain ON community_contribution_receipts(retain_until)",
  `CREATE TABLE IF NOT EXISTS community_contribution_allocation_events (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     receipt_id      TEXT NOT NULL,
     obligation_id   INTEGER NOT NULL,
     amount_copper   INTEGER NOT NULL CHECK (amount_copper <> 0),
     member_revision INTEGER NOT NULL,
     nonce           TEXT NOT NULL,
     actor           TEXT NOT NULL,
     created_at      INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_receipt ON community_contribution_allocation_events(receipt_id)",
  "CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_week ON community_contribution_allocation_events(obligation_id)",
  `CREATE TABLE IF NOT EXISTS community_contribution_horizons (
     guild_scope TEXT NOT NULL,
     kind        TEXT NOT NULL,
     horizon     INTEGER NOT NULL,
     PRIMARY KEY (guild_scope, kind)
   )`,
  `CREATE TABLE IF NOT EXISTS community_contribution_evidence (
     guild_scope  TEXT NOT NULL,
     period_start INTEGER NOT NULL,
     state        TEXT NOT NULL CHECK (state IN ('complete', 'partial', 'stale', 'unavailable')),
     attested_at  INTEGER NOT NULL,
     retain_until INTEGER NOT NULL,
     nonce        TEXT,
     PRIMARY KEY (guild_scope, period_start)
   )`,
  `CREATE TABLE IF NOT EXISTS community_contribution_decisions (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     guild_scope     TEXT NOT NULL,
     discord_id      TEXT NOT NULL,
     obligation_id   INTEGER NOT NULL,
     action          TEXT NOT NULL,
     actor           TEXT NOT NULL,
     member_revision INTEGER NOT NULL,
     nonce           TEXT NOT NULL,
     at              INTEGER NOT NULL,
     retain_until    INTEGER NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS community_contribution_decisions_member ON community_contribution_decisions(guild_scope, discord_id)",
  "CREATE INDEX IF NOT EXISTS community_contribution_decisions_retain ON community_contribution_decisions(retain_until)",
  // .114 (2 Oct 2026): renames Blizzard required (rename-review.ts). Same as migrations/2026-10-02-rename-holds.sql.
  `CREATE TABLE IF NOT EXISTS rename_holds (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     discord_id  TEXT NOT NULL,
     old_name    TEXT NOT NULL,
     new_name    TEXT NOT NULL,
     char_key    TEXT NOT NULL,
     guid        TEXT,
     nonce       TEXT NOT NULL,
     audit_id    INTEGER,
     state       TEXT NOT NULL CHECK (state IN ('reapply', 'approved', 'cancelled')),
     decided_by  TEXT NOT NULL,
     decided_at  INTEGER NOT NULL,
     closed_by   TEXT,
     closed_at   INTEGER
   )`,
  "CREATE INDEX IF NOT EXISTS rename_holds_account ON rename_holds(discord_id, state)",
  "CREATE UNIQUE INDEX IF NOT EXISTS rename_holds_audit ON rename_holds(audit_id) WHERE audit_id IS NOT NULL",
  // .115 (2 Oct 2026, Viktor's item A): News notices and their operation ledger (site-news.ts). Same as
  // migrations/2026-10-03-news-and-seats.sql.
  `CREATE TABLE IF NOT EXISTS site_news_notices (
     id           TEXT PRIMARY KEY CHECK (length(id) = 22),
     op_hash      TEXT NOT NULL,
     title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
     body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
     revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
     nonce        TEXT,
     created_by   TEXT,
     created_at   INTEGER NOT NULL,
     updated_by   TEXT,
     updated_at   INTEGER NOT NULL,
     retain_until INTEGER NOT NULL,
     CHECK (retain_until > created_at AND retain_until <= created_at + 7776000)
   )`,
  "CREATE INDEX IF NOT EXISTS site_news_notices_order ON site_news_notices(created_at)",
  "CREATE INDEX IF NOT EXISTS site_news_notices_retain ON site_news_notices(retain_until)",
  "CREATE INDEX IF NOT EXISTS site_news_notices_created_by ON site_news_notices(created_by)",
  "CREATE INDEX IF NOT EXISTS site_news_notices_updated_by ON site_news_notices(updated_by)",
  `CREATE TABLE IF NOT EXISTS site_news_ops (
     id          TEXT PRIMARY KEY CHECK (length(id) = 22),
     nonce       TEXT NOT NULL,
     created_by  TEXT,
     created_at  INTEGER NOT NULL,
     purge_after INTEGER NOT NULL CHECK (purge_after > created_at)
   )`,
  "CREATE INDEX IF NOT EXISTS site_news_ops_purge ON site_news_ops(purge_after)",
  "CREATE INDEX IF NOT EXISTS site_news_ops_created_by ON site_news_ops(created_by)",
  // Owner raid task 3/9 (10 Oct 2026): exact finite publication custody, not a new cron writer.
  `CREATE TABLE IF NOT EXISTS community_event_deliveries (
    event_id TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose = 'publication'),
    event_revision INTEGER NOT NULL CHECK (event_revision >= 1),
    starts_at INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),
    payload_hash TEXT,
    op_id TEXT NOT NULL CHECK (length(op_id) = 22),
    claim_nonce TEXT NOT NULL CHECK (length(claim_nonce) = 22),
    state TEXT NOT NULL CHECK (state IN ('claimed','posted','refused','unknown','removed')),
    cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),
    actor TEXT,
    session_version INTEGER,
    session_expires INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    retain_until INTEGER NOT NULL,
    result_code TEXT,
    PRIMARY KEY (event_id,purpose)
  )`,
  "CREATE INDEX IF NOT EXISTS community_event_deliveries_retain ON community_event_deliveries(retain_until)",
  `CREATE TABLE IF NOT EXISTS community_event_reminders (
  event_id TEXT PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,
  event_revision INTEGER NOT NULL CHECK (event_revision >= 1),
  starts_at INTEGER NOT NULL,
  actor TEXT,
  consent_version INTEGER,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  host TEXT NOT NULL,
  op_id TEXT NOT NULL CHECK (length(op_id) = 22),
  claim_nonce TEXT,
  state TEXT NOT NULL CHECK (state IN ('armed','claimed','posted','refused','unknown','cancelled','removed')),
  message_id TEXT,
  frozen_content TEXT CHECK (frozen_content IS NULL OR length(frozen_content) <= 1024),
  cleanup_requested INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_requested IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  retain_until INTEGER NOT NULL
)`,
  "CREATE INDEX IF NOT EXISTS community_event_reminders_due ON community_event_reminders(state,last_attempt_at,starts_at,event_id)",
  // .115, third review round: a roster export's durable member effects (migrations/2026-10-03-roster-effects.sql).
  `CREATE TABLE IF NOT EXISTS roster_effect_runs (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     snapshot_id      INTEGER NOT NULL,
     prev_snapshot_id INTEGER,
     removals         INTEGER NOT NULL,
     created_at       INTEGER NOT NULL,
     derived_at       INTEGER,
     items            INTEGER,
     done_at          INTEGER,
     superseded_at    INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS roster_effects (
     run_id     INTEGER NOT NULL,
     seq        INTEGER NOT NULL,
     kind       TEXT NOT NULL CHECK (kind IN ('promote', 'note', 'depart')),
     name_key   TEXT NOT NULL,
     name       TEXT NOT NULL,
     discord_id TEXT NOT NULL,
     guid       TEXT,
     done_at    INTEGER,
     claim      TEXT,
     PRIMARY KEY (run_id, seq)
   )`,
];
