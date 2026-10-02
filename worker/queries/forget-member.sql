-- Privacy request: delete everything that links one Discord account to a character.
-- The Privacy Policy (policies/privacy.html and /privacy on the Worker) promises this on request since 25 Sep 2026.
--
-- 1. Replace every 000000000000000000 below with the member's Discord ID
--    (Discord: Settings > Advanced > Developer Mode on, then right-click the member > Copy User ID).
-- 2. From worker\ run:  npx wrangler d1 execute olympus-verify --remote --file=queries/forget-member.sql
-- 3. Take their Guild Member role off by hand if they still have it: with no character linked, the roster sync no
--    longer manages it. If they want back in later, they simply /verify again.
--
-- Kept on purpose: the guild roster history (roster_snapshots / roster_members / roster_first_seen). It is the in-game
-- roster as each export saw it and holds character names, never Discord accounts.
-- Order matters: characters references members, so it goes first.

DELETE FROM pending         WHERE discord_id = '000000000000000000';
DELETE FROM invite_queue    WHERE discord_id = '000000000000000000';
DELETE FROM bnet_characters WHERE discord_id = '000000000000000000';
DELETE FROM characters      WHERE discord_id = '000000000000000000';
DELETE FROM rename_holds    WHERE discord_id = '000000000000000000'; -- .114: renames Blizzard required (the reapply hold)
DELETE FROM audit           WHERE actor = '000000000000000000' OR subject = '000000000000000000'
                               OR details LIKE '%"000000000000000000"%';
DELETE FROM members         WHERE discord_id = '000000000000000000';

-- Should print nothing but zeros.
SELECT (SELECT COUNT(*) FROM members WHERE discord_id = '000000000000000000')      AS members_left,
       (SELECT COUNT(*) FROM characters WHERE discord_id = '000000000000000000')   AS characters_left,
       (SELECT COUNT(*) FROM invite_queue WHERE discord_id = '000000000000000000') AS queue_left,
       (SELECT COUNT(*) FROM rename_holds WHERE discord_id = '000000000000000000') AS rename_holds_left;
