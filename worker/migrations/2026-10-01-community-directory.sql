-- Build .57 (1 October 2026): the member directory and crafting offers (worker/src/community-directory.ts). The Worker
-- applies the same statements itself at first request (src/schema.ts); this file is the record. Additive only.

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
