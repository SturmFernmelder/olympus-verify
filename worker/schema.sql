-- olympus-verify D1 schema. Apply with: wrangler d1 execute olympus-verify --file=schema.sql
-- Names are stored normalized (ASCII-lowercased, realm stripped) in *_key columns; display forms are kept alongside.

CREATE TABLE IF NOT EXISTS members (
  discord_id     TEXT PRIMARY KEY,
  discord_name   TEXT,            -- written by the Battle.net link only (oauth.ts); see username/global_name below
  battletag      TEXT,            -- from the Discord `connections` scope (type battlenet, verified)
  bnet_conn_id   TEXT,            -- Discord's id for that connection
  linked_at      INTEGER,         -- unix seconds
  banned         INTEGER NOT NULL DEFAULT 0,   -- 1 = refuse re-link and admission
  ban_reason     TEXT,
  bnet_account_id TEXT,           -- Phase 3: Battle.net OAuth account id (wow.profile)
  bnet_linked_at INTEGER,
  username       TEXT,            -- build .41: Discord username (the unique handle), for the officers' roster window
  global_name    TEXT,            --   Discord display name, when the account has one
  names_at       INTEGER          --   when those two were last read (names.ts: interactions, site sign-ins, the cron)
);
CREATE UNIQUE INDEX IF NOT EXISTS members_battletag ON members(battletag) WHERE battletag IS NOT NULL;
-- Retention (build .48, bnet-retention.ts): battletag, bnet_conn_id and linked_at are cleared 29 days after the last
-- Battle.net login (linked_at is refreshed by every login), bnet_account_id/bnet_linked_at and bnet_characters likewise;
-- Blizzard's terms allow API data to be kept for 30 days at most. Every reader treats a stale row as absent.

-- One character name binds to at most one Discord identity (Phase 4 rule). Rebinding needs an officer unbind.
CREATE TABLE IF NOT EXISTS characters (
  name_key       TEXT PRIMARY KEY,   -- normalized
  name           TEXT NOT NULL,      -- as first seen in game / as typed
  discord_id     TEXT NOT NULL REFERENCES members(discord_id),
  status         TEXT NOT NULL,      -- pending | verified | queued | member | left | unbound
  bound_at       INTEGER NOT NULL,
  verified_at    INTEGER,
  member_since   INTEGER,
  left_at        INTEGER,
  source         TEXT,               -- whisper | mail | api
  guid           TEXT                -- the character's in-game GUID, pinned when the link first meets a roster export
                                     -- (migrations/2026-09-27-tickets-guid-relays.sql): a namesake or a recreated
                                     -- character never inherits the link, and a rename keeps it
);
CREATE INDEX IF NOT EXISTS characters_discord ON characters(discord_id);

-- /verify requests. The code itself is never stored: it is recomputed from VERIFY_SECRET + name (or nonce) + day.
-- A request code ("ticket") has no character until someone whispers it: name_key and name stay '' until then, and
-- nonce holds its three random symbols (see src/codes.ts).
CREATE TABLE IF NOT EXISTS pending (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id     TEXT NOT NULL,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  consumed_at    INTEGER,
  consumed_source TEXT,
  nonce          TEXT
);
CREATE INDEX IF NOT EXISTS pending_name ON pending(name_key, consumed_at);
CREATE INDEX IF NOT EXISTS pending_nonce ON pending(nonce, consumed_at);

-- Invites the addon should fire on its next flush (written to OlympusQueue.lua by the watcher).
CREATE TABLE IF NOT EXISTS invite_queue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  discord_id     TEXT NOT NULL,
  note           TEXT,               -- public note text the addon sets after they join (Discord ID)
  status         TEXT NOT NULL,      -- queued | written | invited | joined | expired | cancelled | declined
                                     -- 'declined' is terminal on purpose: only re-running /verify makes a new row
  created_at     INTEGER NOT NULL,
  written_at     INTEGER,
  invited_at     INTEGER,
  joined_at      INTEGER,
  approved_by    TEXT,               -- Discord ID of the officer (review mode) or 'auto'
  claimed_by     TEXT,               -- which officer's watcher currently holds this row (see migrations/2026-09-18-officer-claims.sql)
  claimed_at     INTEGER,            -- refreshed on every poll; a claim older than QUEUE_CLAIM_TTL_MINUTES is up for grabs
  attempts       INTEGER NOT NULL DEFAULT 0,  -- refusals that are the applicant's to fix; a full guild does not count
  retry_after    INTEGER,            -- getQueue skips the row until this time; a hard refusal backs off instead of retrying
  last_reason    TEXT,               -- refusalCode() in ingest.ts: guild_full | in_another_guild | offline | declined | other
  last_reason_at INTEGER,            -- when that reason was recorded; /verify-status reads both back to the applicant
  priority       INTEGER NOT NULL DEFAULT 0  -- build .41: 1 = a reserved name queued from the guild site (site-queue.ts);
                                     -- served before everything else, then by id (getQueue, waitlistPosition)
);
CREATE INDEX IF NOT EXISTS invite_queue_status ON invite_queue(status);
CREATE INDEX IF NOT EXISTS invite_queue_claim ON invite_queue(status, claimed_by, claimed_at);
CREATE INDEX IF NOT EXISTS invite_queue_order ON invite_queue(status, priority, id);

-- Full roster exports from the addon's SavedVariables (or, Phase 3, the guild API). Newest wins.
CREATE TABLE IF NOT EXISTS roster_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  exported_at    INTEGER NOT NULL,   -- addon time() at export
  received_at    INTEGER NOT NULL,
  source         TEXT NOT NULL,      -- addon | api
  member_count   INTEGER NOT NULL,
  content_hash   TEXT                -- fingerprint of who/rank/note; an identical export reuses this row instead of rewriting every member
);
CREATE TABLE IF NOT EXISTS roster_members (
  snapshot_id    INTEGER NOT NULL REFERENCES roster_snapshots(id) ON DELETE CASCADE,
  name_key       TEXT NOT NULL,
  name           TEXT NOT NULL,
  rank           TEXT,
  rank_index     INTEGER,
  level          INTEGER,
  class          TEXT,
  public_note    TEXT,
  officer_note   TEXT,
  guid           TEXT,
  last_online    INTEGER,
  PRIMARY KEY (snapshot_id, name_key)
);

-- When each character first appeared on an exported roster (see migrations/2026-09-25-first-seen.sql). The game gives
-- addons no join date; this is what the unverified-removal grace period is measured from.
CREATE TABLE IF NOT EXISTS roster_first_seen (
  name_key   TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

-- Officers' clients that can take a whisper right now. Each watcher reports on its /queue poll whether its game
-- client is in the world; /verify then names an officer who is actually online (src/relays.ts).
CREATE TABLE IF NOT EXISTS relays (
  officer_id     TEXT PRIMARY KEY,   -- the watcher's claim identity (normalized officer character)
  character      TEXT NOT NULL,      -- display name to whisper, e.g. "Fern Melder"
  online         INTEGER NOT NULL DEFAULT 0,
  seen_at        INTEGER NOT NULL,   -- last report written (refreshed at least every few minutes while nothing changes)
  changed_at     INTEGER NOT NULL,   -- when online last flipped
  version        TEXT,               -- the watcher's version
  addon          TEXT,               -- the addon's version, from its signed login note; request codes wait for 0.6.0+
  unknown_since  INTEGER             -- .62 (1 Oct 2026): set while the watcher's latest report could not tell whether the client is in the world; NULL once a report states it
);

CREATE TABLE IF NOT EXISTS audit (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             INTEGER NOT NULL,
  actor          TEXT NOT NULL,      -- discord id, 'watcher', 'system', 'cron'
  action         TEXT NOT NULL,
  subject        TEXT,               -- character name / discord id
  details        TEXT                -- JSON
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);
CREATE INDEX IF NOT EXISTS audit_actor_action ON audit(actor, action); -- .50: /verify-status asks "did this account ever link?"

-- Phase 3: characters reported by the Battle.net profile API for a linked account.
CREATE TABLE IF NOT EXISTS bnet_characters (
  discord_id     TEXT NOT NULL,
  character_id   TEXT NOT NULL,
  name           TEXT NOT NULL,
  realm_or_ruleset TEXT,
  level          INTEGER,
  fetched_at     INTEGER NOT NULL,
  PRIMARY KEY (discord_id, character_id)
);

-- Build .39 (29 Sep 2026): the bot's pinned channel intros in Asmongold's server (src/intros.ts). One row per intro:
-- where the bot posted it and a hash of the text it posted, so /olympus-intros refresh edits only what changed and
-- notices a deleted or unpinned one. For a forum intro, channel_id and message_id are both the forum post's id.
CREATE TABLE IF NOT EXISTS intro_posts (
  guild_id       TEXT NOT NULL,
  intro_key      TEXT NOT NULL,
  parent_id      TEXT NOT NULL,        -- the configured channel or forum (INTROS_CHANNELS)
  channel_id     TEXT NOT NULL,        -- where the message lives: that channel, or the forum post
  message_id     TEXT NOT NULL,
  hash           TEXT NOT NULL,
  posted_at      INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (guild_id, intro_key)
);

-- One refresh at a time per server; a lock older than two minutes is taken over (a crashed run frees itself).
CREATE TABLE IF NOT EXISTS intro_locks (
  guild_id       TEXT PRIMARY KEY,
  holder         TEXT NOT NULL,
  until          INTEGER NOT NULL
);

-- Build .41 (29 Sep 2026): the guild site on SITE_HOST (src/site*.ts). Sign-in with Discord, members of SITE_GUILD_ID
-- (Asmongold's server) only. Same statements as migrations/2026-09-29-guild-site.sql; the Worker creates them itself.
CREATE TABLE IF NOT EXISTS site_users (
  discord_id      TEXT PRIMARY KEY,
  username        TEXT,
  global_name     TEXT,               -- Discord display name
  nick            TEXT,               -- nickname in SITE_GUILD_ID at the last check
  avatar          TEXT,               -- avatar hash on Discord's CDN (server avatar preferred)
  account_created INTEGER,            -- from the account id (a Discord snowflake)
  server_joined   INTEGER,            -- joined SITE_GUILD_ID
  first_login     INTEGER NOT NULL,
  last_login      INTEGER NOT NULL,
  checked_at      INTEGER,            -- last membership check (sign-in, or the bot's hourly re-check on a save)
  in_server       INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,   -- bumped on sign-out: every older session cookie stops working
  denied          INTEGER NOT NULL DEFAULT 0,   -- 1 = permanently denied (joke or abusive application)
  denied_reason   TEXT,
  denied_at       INTEGER,
  denied_by       TEXT
);

CREATE TABLE IF NOT EXISTS site_applications (
  discord_id  TEXT PRIMARY KEY,
  position    TEXT NOT NULL,          -- site-data.ts POSITIONS (the first choice)
  class_lead  TEXT,                   -- the class, for a Class Lead application
  backup1     TEXT,                   -- .43: second and third choice, as role keys (officer, class_lead:mage, ...)
  backup2     TEXT,
  fallback    INTEGER NOT NULL DEFAULT 1,  -- still wants a place as a member if not picked for this
  character   TEXT,                   -- main character as typed ("First Last")
  char_key    TEXT,
  class       TEXT,
  role        TEXT,                   -- tank | healer | dps | flex
  region      TEXT,
  avail       TEXT,                   -- .43: when they can play, 168 UTC hours of a week as 42 hex digits
  avail_tz    TEXT,                   --      and the time zone they filled the grid in (display only)
  fit_na      INTEGER,                --      NA and EU raid evenings a week, from the grid (the board's filter)
  fit_eu      INTEGER,
  board_at    INTEGER,                -- .43: agreed to the leadership application being on the voting board
  answers     TEXT NOT NULL,          -- JSON: the free-text answers (site-data.ts QUESTIONS)
  status      TEXT NOT NULL,          -- submitted | reviewing | accepted | declined | withdrawn
  admin_note  TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS site_applications_position ON site_applications(position, status);

-- Nominations for senior roles. Nobody but SITE_ADMINS ever sees a count.
CREATE TABLE IF NOT EXISTS site_votes (
  voter_id      TEXT NOT NULL,
  ballot        TEXT NOT NULL,        -- site-data.ts ballots(), e.g. officer or class_lead:mage
  slot          INTEGER NOT NULL,     -- 1..seats of that ballot
  nominee_kind  TEXT NOT NULL,        -- discord | name (someone not on Discord, typed by hand)
  nominee_key   TEXT NOT NULL,        -- Discord id, or the typed name normalized
  nominee_label TEXT NOT NULL,        -- as shown when chosen
  reason        TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (voter_id, ballot, slot)
);
CREATE INDEX IF NOT EXISTS site_votes_tally ON site_votes(ballot, nominee_kind, nominee_key);
CREATE INDEX IF NOT EXISTS site_votes_nominee ON site_votes(nominee_kind, nominee_key);

CREATE TABLE IF NOT EXISTS site_friends (
  owner_id     TEXT NOT NULL,
  friend_kind  TEXT NOT NULL,         -- discord | name
  friend_key   TEXT NOT NULL,
  friend_label TEXT NOT NULL,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (owner_id, friend_kind, friend_key)
);
CREATE INDEX IF NOT EXISTS site_friends_friend ON site_friends(friend_kind, friend_key);

-- Character names people reserved in Blizzard's name reservation, entered on the site. An admin approves the ones
-- promised a seat; approved names go to the top of the invite queue at launch (site-queue.ts). The code whisper still
-- links Discord: a queue row never links anyone by itself.
CREATE TABLE IF NOT EXISTS site_reserved (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,          -- normalizeCharacter(name)
  status      TEXT NOT NULL,          -- claimed | approved | queued | in_guild | released
  created_at  INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER,
  queue_id    INTEGER,                -- the invite_queue row carrying it
  queued_at   INTEGER,
  released_by TEXT,                   -- the owner, an admin, or 'system'
  released_at INTEGER
);
CREATE INDEX IF NOT EXISTS site_reserved_owner ON site_reserved(owner_id, status);
CREATE INDEX IF NOT EXISTS site_reserved_name ON site_reserved(name_key, status);
CREATE INDEX IF NOT EXISTS site_reserved_status ON site_reserved(status, id);

-- Admin-editable settings (reservation time, launch time, open/closed switches). Defaults live in site-data.ts.
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Build .43 (30 Sep 2026): the voting board. Leadership applications are listed by role on the site's Vote page and
-- members vote for (+1) or against (-1) each one; nobody but SITE_ADMINS sees a count. Same as
-- migrations/2026-09-30-board.sql; the Worker creates it itself.
CREATE TABLE IF NOT EXISTS site_board_votes (
  voter_id     TEXT NOT NULL,
  candidate_id TEXT NOT NULL,         -- the applicant's Discord id
  role_key     TEXT NOT NULL,         -- site-data.ts BALLOTS key: the role they are listed under
  vote         INTEGER NOT NULL,      -- 1 | -1
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (voter_id, candidate_id, role_key)
);
CREATE INDEX IF NOT EXISTS site_board_votes_tally ON site_board_votes(role_key, candidate_id);
CREATE INDEX IF NOT EXISTS site_board_votes_candidate ON site_board_votes(candidate_id);

-- Build .47 (30 Sep 2026): replay ledger for signed Discord interactions (src/index.ts). An interaction id is inserted
-- before the command runs and refused (409) if it is already there; the cron forgets ids older than an hour. The
-- Worker creates it itself (src/schema.ts); migrations/2026-09-30-seen-interactions.sql is the same statement.
CREATE TABLE IF NOT EXISTS seen_interactions (
  id             TEXT PRIMARY KEY,   -- Discord's interaction id (a snowflake)
  seen_at        INTEGER NOT NULL,   -- unix seconds
  response       TEXT                -- the handler's answer as JSON {status, body}; NULL while it runs (a repeat then gets 409)
);
CREATE INDEX IF NOT EXISTS seen_interactions_at ON seen_interactions(seen_at);

-- Build .56 (1 Oct 2026): the community modules ported from Olympus Forever (worker/src/community-*.ts: ). One opaque,
-- random, stable reference per member: what directory profiles, crafting results and attendance lists show to other
-- members instead of a Discord id (the donor's member_refs). Created inside a member's first admitted community write,
-- deleted with the account (site-admin.ts deleteSiteData). Same as migrations/2026-10-01-community-refs.sql.
CREATE TABLE IF NOT EXISTS community_refs (
  discord_id TEXT PRIMARY KEY,
  ref        TEXT NOT NULL UNIQUE CHECK (length(ref) = 22),   -- 16 random bytes, base64url
  created_at INTEGER NOT NULL                                  -- unix seconds
);

-- Build .57 (1 Oct 2026): the member directory and crafting offers (worker/src/community-directory.ts), ported from
-- Olympus Forever's member_profiles / member_professions / member_alt_claims / member_craft_offers. Opt-in (`listed`),
-- shown to other members only while the owner still qualifies at read time; names are labels keyed by the full name
-- (community-names.ts communityKey; a hyphen is never a cut) with `proof` saying whether the keeper's own records bound
-- that exact name to this account when it was saved ('keeper') or not ('self'); a profile whose owner stops qualifying
-- is deleted 30 days later (departed_at). All timestamps unix seconds. Same as
-- migrations/2026-10-01-community-directory.sql; the Worker creates them itself.
CREATE TABLE IF NOT EXISTS community_profiles (
  discord_id      TEXT PRIMARY KEY,
  ref             TEXT NOT NULL UNIQUE CHECK (length(ref) = 22),   -- the member's ref (community_refs holds the same value)
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1), -- compare-and-set on every save
  listed          INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1)),
  main_name       TEXT CHECK (main_name IS NULL OR length(main_name) BETWEEN 2 AND 40),
  main_key        TEXT,                                            -- communityKey(main_name)
  main_source     TEXT CHECK (main_source IN ('self', 'keeper')),
  main_updated_at INTEGER,
  raid_role       TEXT CHECK (raid_role IN ('tank', 'healer', 'damage')),
  role_updated_at INTEGER,
  departed_at     INTEGER,                                         -- set when the owner stopped qualifying; cleared on return
  write_nonce     TEXT,                                            -- random per write: the rest of the batch requires it
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  CHECK ((main_name IS NULL) = (main_key IS NULL) AND (main_name IS NULL) = (main_source IS NULL) AND (main_name IS NULL) = (main_updated_at IS NULL)),
  CHECK ((raid_role IS NULL) = (role_updated_at IS NULL))
);
CREATE INDEX IF NOT EXISTS community_profiles_listed ON community_profiles(listed);
CREATE INDEX IF NOT EXISTS community_profiles_departed ON community_profiles(departed_at);
CREATE INDEX IF NOT EXISTS community_profiles_main_key ON community_profiles(main_key);

CREATE TABLE IF NOT EXISTS community_professions (                 -- at most four per member (the save replaces the set)
  discord_id TEXT NOT NULL,
  profession TEXT NOT NULL CHECK (profession IN ('alchemy', 'blacksmithing', 'enchanting', 'engineering', 'herbalism', 'leatherworking', 'mining', 'skinning', 'tailoring', 'cooking', 'fishing', 'first_aid')),
  skill      INTEGER CHECK (skill IS NULL OR skill BETWEEN 0 AND 450),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (discord_id, profession)
);

CREATE TABLE IF NOT EXISTS community_alt_claims (                  -- at most ten per member; labels, never proof of control
  discord_id  TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  name_key    TEXT NOT NULL,                                       -- communityKey(name)
  status      TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'officer_confirmed', 'rejected')),
  proof       TEXT NOT NULL DEFAULT 'self' CHECK (proof IN ('self', 'keeper')),
  claimed_at  INTEGER NOT NULL,
  reviewed_by TEXT,                                                -- the reviewing admin: staff-only, cleared when that account is erased
  reviewed_at INTEGER,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (discord_id, name_key)
);
CREATE INDEX IF NOT EXISTS community_alt_claims_key ON community_alt_claims(name_key);
CREATE INDEX IF NOT EXISTS community_alt_claims_status ON community_alt_claims(status);
CREATE INDEX IF NOT EXISTS community_alt_claims_reviewer ON community_alt_claims(reviewed_by);

CREATE TABLE IF NOT EXISTS community_craft_offers (                -- at most fifty per member; self-reported, no game check
  discord_id  TEXT NOT NULL,
  profession  TEXT NOT NULL CHECK (profession IN ('alchemy', 'blacksmithing', 'enchanting', 'engineering', 'herbalism', 'leatherworking', 'mining', 'skinning', 'tailoring', 'cooking', 'fishing', 'first_aid')),
  recipe_name TEXT NOT NULL CHECK (length(recipe_name) BETWEEN 2 AND 60),
  recipe_key  TEXT NOT NULL CHECK (length(recipe_key) BETWEEN 2 AND 60),  -- lowercased name; unique per member across professions
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (discord_id, recipe_key)
);
CREATE INDEX IF NOT EXISTS community_craft_offers_key ON community_craft_offers(recipe_key);
CREATE INDEX IF NOT EXISTS community_craft_offers_profession ON community_craft_offers(profession, recipe_key);

-- Build .59 (1 Oct 2026): the guild calendar with sign-ups, capacity and attendance (worker/src/community-events.ts),
-- ported from Olympus Forever's guild_events / guild_event_signups / guild_event_changes / event_attendance. Organizers
-- (SITE_ADMINS or COMMUNITY_ORGANIZERS, confirmed guild members) create, edit and cancel; confirmed members answer.
-- Capacity is judged inside the RSVP statement; the calendar's distinct members are bounded (COMMUNITY_DIRECTORY_LIMIT);
-- an event and everything under it go 30 days after it ends (retain_until). All timestamps unix seconds. Same as
-- migrations/2026-10-01-community-events.sql; the Worker creates them itself.
CREATE TABLE IF NOT EXISTS community_events (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 22),          -- the creating operation's id (a retried create applies once)
  op_id                 TEXT NOT NULL,
  op_hash               TEXT,                                               -- what the create wrote, hashed: a replay is compared with this
  title                 TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  details               TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 500),
  starts_at             INTEGER NOT NULL CHECK (starts_at > 0),
  duration_min          INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 720),
  ends_at               INTEGER NOT NULL CHECK (ends_at = starts_at + duration_min * 60),
  capacity              INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100),
  role_targets          TEXT CHECK (role_targets IS NULL OR json_valid(role_targets)), -- {"tank":n,"healer":n,"damage":n}
  status                TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by            TEXT,                                               -- NULL once the creator's account is erased
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  signup_generation     INTEGER NOT NULL DEFAULT 0 CHECK (signup_generation >= 0),     -- moves with every answer and erase
  attendance_generation INTEGER NOT NULL DEFAULT 0 CHECK (attendance_generation >= 0), -- moves with every attendance write
  nonce                 TEXT,                                               -- per organizer write: admits the rest of its batch
  attendance_nonce      TEXT,                                               -- per attendance write
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  retain_until          INTEGER NOT NULL                                    -- ends_at + 30 days; a cancellation brings it forward
);
CREATE UNIQUE INDEX IF NOT EXISTS community_events_op ON community_events(created_by, op_id);
CREATE INDEX IF NOT EXISTS community_events_window ON community_events(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS community_events_retain ON community_events(retain_until);

CREATE TABLE IF NOT EXISTS community_event_signups (               -- one effective answer per member and event
  event_id       TEXT NOT NULL,
  discord_id     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('yes', 'tentative', 'no')),
  character_name TEXT CHECK (character_name IS NULL OR length(character_name) BETWEEN 2 AND 40),
  character_key  TEXT,                                             -- communityKey(character_name)
  raid_role      TEXT CHECK (raid_role IS NULL OR raid_role IN ('tank', 'healer', 'damage')),
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  rsvp_starts_at INTEGER NOT NULL,                                 -- the start the member answered for (changedSinceRsvp)
  updated_at     INTEGER NOT NULL,
  write_nonce    TEXT,
  PRIMARY KEY (event_id, discord_id),
  CHECK ((character_name IS NULL) = (character_key IS NULL))
);
CREATE INDEX IF NOT EXISTS community_event_signups_member ON community_event_signups(discord_id);
CREATE INDEX IF NOT EXISTS community_event_signups_status ON community_event_signups(event_id, status);

CREATE TABLE IF NOT EXISTS community_event_changes (               -- edit history: action, who, when, which fields; no values
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  action   TEXT NOT NULL CHECK (action IN ('created', 'updated', 'cancelled')),
  actor    TEXT,                                                   -- NULL once that account is erased
  at       INTEGER NOT NULL,
  fields   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fields))
);
CREATE INDEX IF NOT EXISTS community_event_changes_event ON community_event_changes(event_id);
CREATE INDEX IF NOT EXISTS community_event_changes_actor ON community_event_changes(actor);

CREATE TABLE IF NOT EXISTS community_event_attendance (            -- recorded by an organizer after the start; missing = unknown
  event_id    TEXT NOT NULL,
  discord_id  TEXT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('present', 'absent', 'excused', 'unknown')),
  source      TEXT NOT NULL DEFAULT 'officer' CHECK (source IN ('officer', 'observed')), -- 'observed' reserved; no route accepts a source
  reason_code TEXT CHECK (reason_code IS NULL OR (reason_code IN ('late', 'left_early') AND state = 'present')),
  recorded_by TEXT,                                                -- NULL once the recorder's account is erased
  recorded_at INTEGER NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  write_nonce TEXT,
  PRIMARY KEY (event_id, discord_id)
);
CREATE INDEX IF NOT EXISTS community_event_attendance_member ON community_event_attendance(discord_id);
CREATE INDEX IF NOT EXISTS community_event_attendance_recorder ON community_event_attendance(recorded_by);

-- Build .61 (1 Oct 2026): trial reviews (worker/src/community-trials.ts), ported from Olympus Forever's trial_reviews.
-- A staff record about a member (start, review due, extended, passed or ended with a fixed reason); descriptive only:
-- nothing here changes a role, membership or admission. Opened only for an account that has signed in here; erasure
-- deletes the member's trials and anonymizes them as sponsor, creator or reviewer; a concluded trial goes 30 days after
-- its conclusion, an open one 30 days after its review was due (retain_until). Unix seconds. Same as
-- migrations/2026-10-01-community-trials.sql; the Worker creates it itself.
CREATE TABLE IF NOT EXISTS community_trials (
  id                 TEXT PRIMARY KEY CHECK (length(id) = 22),   -- the creating operation's id
  op_id              TEXT NOT NULL,
  op_hash            TEXT,                                        -- what the create wrote, hashed: a replay is compared with this
  discord_id         TEXT NOT NULL,                               -- the member on trial
  sponsor_discord_id TEXT,                                        -- never the member; NULL once that account is erased
  started_at         INTEGER NOT NULL,
  review_due_at      INTEGER NOT NULL CHECK (review_due_at > started_at),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'passed', 'ended')),
  outcome_reason     TEXT,                                        -- review_passed | withdrew | inactive | staff_decision
  concluded_at       INTEGER,
  created_by         TEXT,                                        -- the admin; NULL once erased
  updated_by         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  incarnation        TEXT NOT NULL,                               -- random per row: a decision never lands on a row that reused the id
  revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce              TEXT,                                        -- per write: admits the audit row
  retain_until       INTEGER NOT NULL,
  CHECK ((status IN ('active', 'extended') AND outcome_reason IS NULL AND concluded_at IS NULL)
      OR (status = 'passed' AND COALESCE(outcome_reason, '') = 'review_passed' AND concluded_at IS NOT NULL)
      OR (status = 'ended' AND COALESCE(outcome_reason, '') IN ('withdrew', 'inactive', 'staff_decision') AND concluded_at IS NOT NULL)),
  CHECK (sponsor_discord_id IS NULL OR sponsor_discord_id <> discord_id)
);
-- .66: one open trial per member is judged inside the insert at database time, so an open trial past its lifetime does
-- not block a new one; the .61 partial unique index community_trials_open is dropped (migrations/2026-10-01-community-trials-open.sql).
CREATE INDEX IF NOT EXISTS community_trials_member ON community_trials(discord_id);
CREATE INDEX IF NOT EXISTS community_trials_due ON community_trials(review_due_at);
CREATE INDEX IF NOT EXISTS community_trials_retain ON community_trials(retain_until);
CREATE INDEX IF NOT EXISTS community_trials_sponsor ON community_trials(sponsor_discord_id);

-- Build .69 (1 Oct 2026): restriction cases, their watch-list and the member-level retention period (worker/src/community-restrictions.ts),
-- ported from Olympus Forever's restriction_cases / restriction_case_characters on the keeper's contract: staff records and
-- review evidence only, no role, admission or site effect. A case is about a Discord id and survives the member's erasure
-- while active (like the bot's ban reason); its acknowledgement does not. Unix seconds. The Worker creates these itself
-- (src/schema.ts); migrations/2026-10-01-community-restrictions.sql holds the same statements.
CREATE TABLE IF NOT EXISTS community_restriction_cases (
  id              TEXT PRIMARY KEY CHECK (length(id) = 22),  -- the staff page's operation id: a retried create applies once
  discord_id      TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('ban', 'conduct_removal', 'tithe_removal')),
  set_by          TEXT NOT NULL,                             -- 'erased' once that staff member's account is erased
  set_at          INTEGER NOT NULL,
  review_at       INTEGER NOT NULL,
  expires_at      INTEGER,                                   -- NULL only for a ban, which has a review date instead
  appeal_status   TEXT NOT NULL DEFAULT 'none' CHECK (appeal_status IN ('none', 'requested', 'upheld', 'overturned')),
  review_outcome  TEXT CHECK (review_outcome IN ('continued', 'lifted')),
  reviewed_at     INTEGER,
  reviewed_by     TEXT,
  acknowledged_at INTEGER,                                   -- an officer recorded that the member's return was reviewed
  acknowledged_by TEXT,
  resolved_at     INTEGER,
  resolved_by     TEXT,
  updated_at      INTEGER NOT NULL,
  updated_by      TEXT,
  retain_until    INTEGER,                                   -- the expiry; a resolution sets 30 days on; NULL for an unresolved ban
  incarnation     TEXT NOT NULL,                             -- random per row: a decision never lands on a row that reused the id
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce           TEXT,
  CHECK ((category = 'ban') = (expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS community_restriction_cases_member ON community_restriction_cases(discord_id);
CREATE INDEX IF NOT EXISTS community_restriction_cases_review ON community_restriction_cases(review_at);
CREATE INDEX IF NOT EXISTS community_restriction_cases_retain ON community_restriction_cases(retain_until);

-- The watch-list: the case member's own characters as the keeper's `characters` held them at the addition (exact
-- provenance: the proof key, the full name, the pinned GUID), added only by an explicit staff action. Review at most 90
-- days after the addition or the last documented renewal; expiry at the member's period deadline, capped at the case's.
CREATE TABLE IF NOT EXISTS community_restriction_characters (
  case_id         TEXT NOT NULL,
  character_key   TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),  -- the community key (full name)
  character_name  TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
  proof_key       TEXT NOT NULL,                             -- the keeper's characters.name_key
  guid            TEXT,                                      -- characters.guid as pinned at the addition
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
);
CREATE INDEX IF NOT EXISTS community_restriction_characters_key ON community_restriction_characters(proof_key);
CREATE INDEX IF NOT EXISTS community_restriction_characters_expiry ON community_restriction_characters(expires_at);

-- PRIV-4 in the keeper's form: ONE watch-list retention period per MEMBER (12 months from the first addition or the
-- last documented renewal), alive while any unresolved case of theirs exists. No per-row or per-case clock can restart it.
CREATE TABLE IF NOT EXISTS community_restriction_periods (
  discord_id      TEXT PRIMARY KEY,
  opened_at       INTEGER NOT NULL,
  retain_until    INTEGER NOT NULL,
  renewed_at      INTEGER,
  renewal_reason  TEXT CHECK (renewal_reason IN ('ongoing_risk', 'appeal_pending', 'repeat_return')),
  nonce           TEXT
);

-- Build .70 (1 Oct 2026): departure review items (worker/src/community-departures.ts), ported from Olympus Forever's
-- departure_reviews. One bounded staff review item per confirmed departure (the keeper's own characters.status 'left'
-- with its left_at) of an account that has signed in here; a kick or a leave as the keeper's own audit row says, else
-- unknown. Nothing here changes a role, membership or a case by itself; an admin may acknowledge the item or open a
-- restriction case from it. 30 days after the departure the item is gone (retain_until, the effective cutoff). Unix
-- seconds. The Worker creates it itself (src/schema.ts); migrations/2026-10-01-community-departures.sql is the record.
CREATE TABLE IF NOT EXISTS community_departure_reviews (
  id                  TEXT PRIMARY KEY CHECK (length(id) = 22),   -- random, never reused: also the row's incarnation
  discord_id          TEXT NOT NULL,
  character_key       TEXT NOT NULL CHECK (length(character_key) BETWEEN 2 AND 160),   -- the community key (full name)
  character_name      TEXT NOT NULL CHECK (length(character_name) BETWEEN 2 AND 40),
  proof_key           TEXT NOT NULL,                              -- the keeper's characters.name_key
  kind                TEXT NOT NULL CHECK (kind IN ('left', 'removed', 'unknown')),
  observed_at         INTEGER NOT NULL,                           -- characters.left_at
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'restriction_opened')),
  restriction_case_id TEXT,
  reviewed_by         TEXT,                                       -- NULL once that admin's account is erased
  reviewed_at         INTEGER,
  created_at          INTEGER NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce               TEXT,
  retain_until        INTEGER NOT NULL,
  CHECK ((status = 'open') = (reviewed_at IS NULL)),
  CHECK ((status = 'restriction_opened') = (restriction_case_id IS NOT NULL)),
  UNIQUE (discord_id, proof_key, observed_at)
);
CREATE INDEX IF NOT EXISTS community_departure_reviews_status ON community_departure_reviews(status, observed_at);
CREATE INDEX IF NOT EXISTS community_departure_reviews_retain ON community_departure_reviews(retain_until);

-- Build .75 (1 Oct 2026): the contribution (tithe) ledger (worker/src/community-contributions.ts), ported from Olympus
-- Forever's contributions (eight tables, prefixed together). Integer copper; every amount sum the Worker forms is guarded
-- against the range a JavaScript number keeps exactly. A member row carries the random incarnation and the revision every
-- write compares; an obligation is one member's week under an immutable policy version; a receipt is one observed payment
-- (idempotent on source and source id); the allocation journal is append-only (a reversal is a negative row); horizons keep
-- purged weeks and observations from being recorded again; evidence is an officer's attestation of one week's payment
-- records; decisions are the dated staff facts about one week. Every personal row carries retain_until fixed from the
-- retention in force when it was written. Nothing here notifies, sanctions or changes a role. Unix seconds. The Worker
-- creates them itself (src/schema.ts); migrations/2026-10-01-community-contributions.sql is the record.
CREATE TABLE IF NOT EXISTS community_contribution_policies (
  version                TEXT PRIMARY KEY,
  amount_copper          INTEGER NOT NULL CHECK (amount_copper > 0),
  anchor_weekday         INTEGER NOT NULL CHECK (anchor_weekday BETWEEN 0 AND 6),
  anchor_hour_utc        INTEGER NOT NULL CHECK (anchor_hour_utc BETWEEN 0 AND 23),
  grace_hours            INTEGER NOT NULL CHECK (grace_hours >= 0),
  final_notice_days      INTEGER NOT NULL CHECK (final_notice_days >= 1),
  review_days            INTEGER NOT NULL CHECK (review_days >= 1),
  new_member_exempt_days INTEGER NOT NULL CHECK (new_member_exempt_days >= 0),
  created_at             INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_contribution_members (
  guild_scope  TEXT NOT NULL,
  discord_id   TEXT NOT NULL,
  incarnation  TEXT NOT NULL CHECK (length(incarnation) = 22),
  revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  nonce        TEXT,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (guild_scope, discord_id)
);
CREATE TABLE IF NOT EXISTS community_contribution_obligations (
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
);
CREATE INDEX IF NOT EXISTS community_contribution_obligations_retain ON community_contribution_obligations(retain_until);
CREATE TABLE IF NOT EXISTS community_contribution_receipts (
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
);
CREATE INDEX IF NOT EXISTS community_contribution_receipts_member ON community_contribution_receipts(guild_scope, matched_discord_id);
CREATE INDEX IF NOT EXISTS community_contribution_receipts_retain ON community_contribution_receipts(retain_until);
CREATE TABLE IF NOT EXISTS community_contribution_allocation_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id      TEXT NOT NULL,
  obligation_id   INTEGER NOT NULL,
  amount_copper   INTEGER NOT NULL CHECK (amount_copper <> 0),
  member_revision INTEGER NOT NULL,
  nonce           TEXT NOT NULL,
  actor           TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_receipt ON community_contribution_allocation_events(receipt_id);
CREATE INDEX IF NOT EXISTS community_contribution_allocation_events_week ON community_contribution_allocation_events(obligation_id);
CREATE TABLE IF NOT EXISTS community_contribution_horizons (
  guild_scope TEXT NOT NULL,
  kind        TEXT NOT NULL,
  horizon     INTEGER NOT NULL,
  PRIMARY KEY (guild_scope, kind)
);
CREATE TABLE IF NOT EXISTS community_contribution_evidence (
  guild_scope  TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  state        TEXT NOT NULL CHECK (state IN ('complete', 'partial', 'stale', 'unavailable')),
  attested_at  INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  nonce        TEXT,
  PRIMARY KEY (guild_scope, period_start)
);
CREATE TABLE IF NOT EXISTS community_contribution_decisions (
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
);
CREATE INDEX IF NOT EXISTS community_contribution_decisions_member ON community_contribution_decisions(guild_scope, discord_id);
CREATE INDEX IF NOT EXISTS community_contribution_decisions_retain ON community_contribution_decisions(retain_until);

-- Build .76 (1 Oct 2026): where the departure intake's bounded scan stopped (worker/src/community-departures.ts), so the
-- next cron run continues from there and a long run of candidates the site cannot record never starves a later valid
-- departure; kept when a run ends at its bounds, cleared once a run scans to the end. One row: one shared operational
-- cursor (a departure time and a character name key), no Discord account ID. The Worker creates it itself (src/schema.ts);
-- migrations/2026-10-01-community-departure-scan.sql is the record.
CREATE TABLE IF NOT EXISTS community_departure_scan (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  left_at    INTEGER NOT NULL,
  name_key   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Build .82 (1 Oct 2026): the private request intake (worker/src/community-privacy-intake.ts), ported from Olympus
-- Forever's privacy_cases/privacy_case_messages/privacy_case_operations. A case is a manually handled private
-- conversation for someone who can no longer reach Discord: no sign-in, no email, no IP; the requester holds a
-- browser-generated case id and code (only the code's SHA-256 is stored); it never proves who owns an account and never
-- exports, deletes or changes anything by itself. Retention is fixed per case at creation (retention_days) and
-- retain_until is the effective cutoff by the database clock; the cleanup cron deletes expired cases. The operations
-- table keys each staff action by the id the admin page generates so a replay never reapplies. Unix seconds. The Worker
-- creates them itself (src/schema.ts); migrations/2026-10-01-community-privacy-intake.sql is the record.
CREATE TABLE IF NOT EXISTS community_privacy_cases (
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
);
CREATE INDEX IF NOT EXISTS community_privacy_cases_retain ON community_privacy_cases(retain_until);
CREATE INDEX IF NOT EXISTS community_privacy_cases_created ON community_privacy_cases(created_at);
CREATE INDEX IF NOT EXISTS community_privacy_cases_open ON community_privacy_cases(closed_at);
CREATE TABLE IF NOT EXISTS community_privacy_messages (
  case_id    TEXT NOT NULL,
  message_id TEXT NOT NULL CHECK (length(message_id) = 22),
  author     TEXT NOT NULL CHECK (author IN ('requester', 'staff')),
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  text_hash  TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (case_id, message_id)
);
CREATE INDEX IF NOT EXISTS community_privacy_messages_order ON community_privacy_messages(case_id, created_at);
CREATE TABLE IF NOT EXISTS community_privacy_operations (
  case_id      TEXT NOT NULL,
  op_id        TEXT NOT NULL CHECK (length(op_id) = 22),
  payload_hash TEXT NOT NULL,
  nonce        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (case_id, op_id)
);

-- Build .114 (2 Oct 2026, Viktor's item 9): renames Blizzard required. The roster already follows a renamed character
-- by its GUID and keeps the link (roster.ts moveBinding, audit 'roster.renamed'); nothing in the roster says WHY a
-- character was renamed. When a site administrator marks a rename as required by Blizzard (rename-review.ts), that one
-- character is unbound and verified again and the member applies again; Guild Member is removed and later grants are
-- held (roles.ts) while a row here is in state 'reapply' and no other member character of the account supports the role,
-- until an administrator approves ('approved', only after the new application was accepted and the character verified
-- again) or withdraws the decision ('cancelled'). A closed row is deleted thirty days after it was closed (the cron). Bot data: erased by
-- hand with queries/forget-member.sql, listed in the member's copy. Unix seconds. The Worker creates it itself
-- (src/schema.ts); migrations/2026-10-02-rename-holds.sql is the record.
CREATE TABLE IF NOT EXISTS rename_holds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id  TEXT NOT NULL,
  old_name    TEXT NOT NULL,
  new_name    TEXT NOT NULL,
  char_key    TEXT NOT NULL,     -- the renamed character's name key when decided (codes.ts normalizeCharacter)
  guid        TEXT,              -- its in-game identifier, when the roster had pinned one
  nonce       TEXT NOT NULL,     -- binds the decision's batch to its own row
  audit_id    INTEGER,           -- the roster.renamed audit row the decision was made from
  state       TEXT NOT NULL CHECK (state IN ('reapply', 'approved', 'cancelled')),
  decided_by  TEXT NOT NULL,     -- the administrator's Discord id
  decided_at  INTEGER NOT NULL,
  closed_by   TEXT,
  closed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS rename_holds_account ON rename_holds(discord_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS rename_holds_audit ON rename_holds(audit_id) WHERE audit_id IS NOT NULL;
