// Build .186 (Olympus Link, Phase 1a; the reviewed integration plan of 21 Oct 2026, section 4.1): writes
// src/link-core.ts from the pristine upstream file in vendor/olympus-link/, which is never edited by hand.
//
//   node scripts/build-link-core.mjs           regenerate src/link-core.ts
//   node scripts/build-link-core.mjs --check   fail when a vendored file's SHA-256 or the generated file drifts
//
// The three vendored files are byte-pinned to dnl-gentile/olympus-addon at the commit below (MIT). The generated module
// is upstream's body plus six reviewed patch groups, each expressed as exact replacements that must match a fixed number of
// times or the build fails, so an upstream change can never be patched silently:
//   P1 database(): LINK_DB only. Upstream falls back to env.DB, and both schemas have a `members` table that
//      forgetUser deletes from; a missing binding must never point Link at the bot's own database.
//   P2 upstream's nine console.error sites print a fixed stage and errorRef(err) only (log.ts, the .51 logging rule): no
//      code R, Discord id, message or stack reaches Workers Logs. P4 retires release_code and adds finalize_link and
//      finalize_read: ten P4 sites; P5 adds three guarded-deletion sites, all in that form.
//   P3 discordUser(): no globalThis.fetch default. The caller injects credentialFetch (discord.ts: no redirects, an
//      8 s deadline); without one it throws link_fetch_missing instead of calling Discord with a bare fetch.
//   P4 role settlement: confirmed finalization, bounded player cleanup, transactional reports, lost-race undo and settled listings.
//   P5 persistent deletion admission: atomic claim exclusion, exact owned cleanup/release, second demote before release; no TTL recovery.
//   P6 code issuance retains corrected .194's atomic quotas unchanged.
// Only the deletion pending predicate is age-bounded; confirmer/key/listing authority stays conservative at every age.
// Limit values, signature/authentication checks and clocks stay upstream's. HEADER names superseded upstream comments.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UPSTREAM = Object.freeze({ repository: "dnl-gentile/olympus-addon", commit: "d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2" });
/** Vendored file -> its upstream path and SHA-256 at UPSTREAM.commit. */
export const VENDOR_PINS = Object.freeze({
  "link-core.mjs": Object.freeze({ upstream: "web/worker/link-core.mjs", bytes: 81304, sha256: "53f05c183f96363f696dc6040fd3fb27fd11406f09b7bd908a7f579e72cb0e11" }),
  "schema.sql": Object.freeze({ upstream: "web/worker/schema.sql", bytes: 7325, sha256: "a141dc14987bb834004473694e09c363f6a58cebd01952775e0d0099901657c9" }),
  "LICENSE": Object.freeze({ upstream: "LICENSE", bytes: 1083, sha256: "a78bf4300e7768b9cc6d047816efe6a726f64c400e7e1a30d5a559757b892328" }),
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const P2_SITES = [
  ["console.error('olympus-link: could not release code', b.R, e && e.stack ? e.stack : e);", "console.error('olympus-link', 'release_code', errorRef(e));"],
  ["console.error('olympus-link: could not record the link', b.R, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'record_link', errorRef(err));"],
  ["console.error('olympus-link: could not undo the link', b.R, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'undo_link', errorRef(err));"],
  ["console.error('olympus-link: promote failed for', discordId, err && err.stack ? err.stack : err);", "console.error('olympus-link', 'promote', errorRef(err));"],
  ["console.error('olympus-link: Discord oauth2/@me fetch failed:', err && err.message ? err.message : err);", "console.error('olympus-link', 'discord_user_fetch', errorRef(err));"],
  ["console.error('olympus-link: could not log', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'log_proof', errorRef(err));"],
  ["console.error('olympus-link: /proof', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'proof', errorRef(err));"],
  ["console.error('olympus-link: inbox entry', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'inbox_entry', errorRef(err));"],
  ["console.error('olympus-link: inbox log', err && err.stack ? err.stack : err);", "console.error('olympus-link', 'inbox_log', errorRef(err));"],
];

// P4 keeps a role outcome pending durably in the existing codes.used column (reserved state 0, not an event time).
// Only acknowledged promotion finalizes to the original Unix-second timestamp. No role or uncertain write is retried.
const PENDING_ROLE_PATCHES = Object.freeze([
  Object.freeze({
    id: "P4.1",
    find: "\tif (code.used !== null && code.used !== undefined) {",
    replace: "\tif (code.used === 0) return { verdict: pendingRole(b.R) };\n\tif (code.used !== null && code.used !== undefined) {",
    count: 1,
  }),
  Object.freeze({
    id: "P4.2",
    find: "\tconst claim = await DB.prepare('UPDATE codes SET used = ? WHERE r = ? AND used IS NULL').bind(t, b.R).run();\n\tif (!claim.meta || claim.meta.changes !== 1) return reject('code-used', 'This code was already used.', b.R);",
    replace: [
      "\tconst claim = await DB.prepare('UPDATE codes SET used = ? WHERE r = ? AND used IS NULL AND NOT EXISTS (SELECT 1 FROM limits WHERE k = ?)').bind(0, b.R, deleteKey).run();",
      "\tif (!claim || claim.success !== true || !claim.meta || claim.meta.changes !== 1) {",
      "\t\t// One classification snapshot: a deleted or still-unused code is never reported as code-used.",
      "\t\tlet state;",
      "\t\ttry {",
      "\t\t\tstate = await DB.prepare('SELECT used, EXISTS (SELECT 1 FROM limits WHERE k = ?) AS held FROM codes WHERE r = ?').bind(deleteKey, b.R).first();",
      "\t\t} catch {",
      "\t\t\treturn pendingRole(b.R);",
      "\t\t}",
      "\t\tif (!state) return reject('unknown-code', 'This link was made with a code the bot never issued.', b.R);",
      "\t\tif (![0, 1].includes(state.held)) return pendingRole(b.R);",
      "\t\tif (state.held === 1) return deletionHeld(false, b.R);",
      "\t\tif (state.used === 0) return pendingRole(b.R);",
      "\t\tif (state.used === null || state.used === undefined) return failure('server', 'The link could not be recorded: send it again in a minute.', { R: b.R });",
      "\t\treturn reject('code-used', 'This code was already used.', b.R);",
      "\t}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.3",
    find: [
      "\t} catch (err) {",
      "\t\t// Nothing was written (a batch is all or nothing): the code only is released.",
      "\t\ttry {",
      "\t\t\tawait DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ?').bind(b.R, t).run();",
      "\t\t} catch (e) {",
      "\t\t\tconsole.error('olympus-link', 'release_code', errorRef(e));",
      "\t\t}",
      "\t\tconst holder = await DB.prepare('SELECT discord_id FROM members WHERE character = ?').bind(b.requester).first();",
      "\t\tif (holder && holder.discord_id !== code.discord_id) return linkedElsewhere(b);",
      "\t\tconsole.error('olympus-link', 'record_link', errorRef(err));",
      "\t\treturn failure('server', 'The link could not be recorded: send it again in a minute.', { R: b.R });",
      "\t}",
    ].join("\n"),
    replace: [
      "\t} catch (err) {",
      "\t\t// A lost acknowledgement can follow a committed batch. Keep the claim pending; never release it on an unknown result.",
      "\t\tconsole.error('olympus-link', 'record_link', errorRef(err));",
      "\t\treturn pendingRole(b.R);",
      "\t}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.4",
    find: "\tif (!changed(wrote[wrote.length - 1])) {\n\t\tawait undo(DB, x, t, first);\n\t\treturn linkedElsewhere(b);\n\t}",
    replace: "\tif (!changed(wrote[wrote.length - 1])) {\n\t\tif (!(await undo(DB, x, t, first))) return pendingRole(b.R);\n\t\treturn linkedElsewhere(b);\n\t}",
    count: 1,
  }),
  Object.freeze({
    id: "P4.5",
    find: "\tif (!role.ok) {\n\t\tawait undo(DB, x, t, first);",
    replace: "\tif (!role.ok) {\n\t\tif (!(await undo(DB, x, t, first))) return pendingRole(b.R);",
    count: 1,
  }),
  Object.freeze({
    id: "P4.6",
    find: "\treturn { ...linkedAnswer(v, 'linked', `${b.requester} is now linked to @${code.username}.`), characters: await charactersOf(env, code.discord_id) };",
    replace: "\tif (!(await finishLink(DB, b.R, t))) return pendingRole(b.R);\n\treturn { ...linkedAnswer(v, 'linked', `${b.requester} is now linked to @${code.username}.`), characters: await charactersOf(env, code.discord_id) };",
    count: 1,
  }),
  Object.freeze({
    id: "P4.7",
    find: "const changed = (r) => !!(r && r.meta && Number(r.meta.changes) > 0);",
    replace: [
      "function pendingRole(R) {",
      "\treturn failure('server', 'The role outcome is not confirmed. Wait for the current request; if this continues, ask the bot keeper to review it or request a new code.', { R });",
      "}",
      "",
      "// Exactly one finalization attempt after acknowledged promotion. Unknown or no-change results require readback, never a resend.",
      "async function finishLink(DB, R, t) {",
      "\ttry {",
      "\t\tconst result = await DB.prepare('UPDATE codes SET used = ? WHERE r = ? AND used = 0').bind(t, R).run();",
      "\t\tif (changed(result)) return true;",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'finalize_link', errorRef(err));",
      "\t}",
      "\ttry {",
      "\t\tconst row = await DB.prepare('SELECT used FROM codes WHERE r = ?').bind(R).first();",
      "\t\treturn !!row && row.used === t;",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'finalize_read', errorRef(err));",
      "\t\treturn false;",
      "\t}",
      "}",
      "",
      "const changed = (r) => !!(r && r.meta && Number(r.meta.changes) > 0);",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.8",
    find: [
      "async function undo(DB, x, t, first) {",
      "\tconst { b, code, owned } = x;",
      "\ttry {",
      "\t\tawait DB.batch([",
      "\t\t\towned",
      "\t\t\t\t? DB.prepare('UPDATE members SET guild = ?, gv = ?, faction = ?, r = ?, linked = ? WHERE character = ? AND discord_id = ? AND r = ?').bind(owned.guild, owned.gv, owned.faction, owned.r, owned.linked, b.requester, code.discord_id, b.R)",
      "\t\t\t\t: DB.prepare('DELETE FROM members WHERE character = ? AND discord_id = ? AND r = ?').bind(b.requester, code.discord_id, b.R),",
      "\t\t\tDB.prepare('DELETE FROM used WHERE r = ? AND t = ?').bind(b.R, t),",
      "\t\t\t...first.map((c) => DB.prepare('DELETE FROM council_keys WHERE public_key = ? AND character = ? AND first_seen = ?').bind(c.key.public_key, c.key.character, t)),",
      "\t\t\tDB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ?').bind(b.R, t),",
      "\t\t]);",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'undo_link', errorRef(err));",
      "\t}",
      "}",
    ].join("\n"),
    replace: [
      "async function undo(DB, x, t, first) {",
      "\tconst { b, code, owned } = x;",
      "\ttry {",
      "\t\tconst undone = await DB.batch([",
      "\t\t\towned",
      "\t\t\t\t? DB.prepare('UPDATE members SET guild = ?, gv = ?, faction = ?, r = ?, linked = ? WHERE character = ? AND discord_id = ? AND r = ?').bind(owned.guild, owned.gv, owned.faction, owned.r, owned.linked, b.requester, code.discord_id, b.R)",
      "\t\t\t\t: DB.prepare('DELETE FROM members WHERE character = ? AND discord_id = ? AND r = ?').bind(b.requester, code.discord_id, b.R),",
      "\t\t\tDB.prepare('DELETE FROM used WHERE r = ? AND t = ?').bind(b.R, t),",
      "\t\t\t...first.map((c) => DB.prepare('DELETE FROM council_keys WHERE public_key = ? AND character = ? AND first_seen = ?').bind(c.key.public_key, c.key.character, t)),",
      "\t\t\t// A newer pending member may still roll back to this code: release only after our own rollback destination is present.",
      "\t\t\towned",
      "\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND EXISTS (SELECT 1 FROM members WHERE character = ? AND discord_id = ? AND r = ? AND linked = ?)').bind(b.R, 0, b.requester, code.discord_id, owned.r, owned.linked)",
      "\t\t\t\t: DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND NOT EXISTS (SELECT 1 FROM members WHERE character = ?)').bind(b.R, 0, b.requester),",
      "\t\t]);",
      "\t\treturn changed(undone[undone.length - 1]);",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'undo_link', errorRef(err));",
      "\t}",
      "}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.9",
    find: "\t\tconst mine = await DB.prepare('SELECT 1 AS x FROM members WHERE character = ? AND discord_id = ?').bind(p.confirmer, key.owner_discord_id).first();",
    replace: "\t\tconst mine = await DB.prepare('SELECT 1 AS x FROM members WHERE character = ? AND discord_id = ? AND NOT EXISTS (SELECT 1 FROM codes WHERE codes.r = members.r AND codes.used = 0)').bind(p.confirmer, key.owner_discord_id).first();",
    count: 1,
  }),
  Object.freeze({
    id: "P4.10",
    find: "\tif (!bootstrap && !(await DB.prepare('SELECT 1 AS x FROM members WHERE character = ? AND discord_id = ?').bind(character, owner).first())) {",
    replace: "\tif (!bootstrap && !(await DB.prepare('SELECT 1 AS x FROM members WHERE character = ? AND discord_id = ? AND NOT EXISTS (SELECT 1 FROM codes WHERE codes.r = members.r AND codes.used = 0)').bind(character, owner).first())) {",
    count: 1,
  }),
  Object.freeze({
    id: "P4.11",
    find: "\t\tDB.prepare('DELETE FROM codes WHERE exp < ?').bind(t - LINK.DELIVERY_GRACE),",
    replace: "\t\tDB.prepare('DELETE FROM codes WHERE exp < ? AND used IS NOT 0').bind(t - LINK.DELIVERY_GRACE),",
    count: 1,
  }),
  Object.freeze({
    id: "P4.12",
    find: [
      "\t\t\tx.owned",
      "\t\t\t\t? DB.prepare(",
      "\t\t\t\t\t\t'INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?) ' +",
      "\t\t\t\t\t\t\t'ON CONFLICT(character) DO UPDATE SET guild = excluded.guild, gv = excluded.gv, faction = excluded.faction, r = excluded.r, linked = excluded.linked WHERE members.discord_id = excluded.discord_id',",
      "\t\t\t\t\t).bind(b.requester, code.discord_id, b.guild, x.gv, b.faction, b.R, t)",
      "\t\t\t\t: DB.prepare('INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(b.requester, code.discord_id, b.guild, x.gv, b.faction, b.R, t),",
    ].join("\n"),
    replace: [
      "\t\t\tx.owned",
      "\t\t\t\t? DB.prepare('UPDATE members SET guild = ?, gv = ?, faction = ?, r = ?, linked = ? WHERE character = ? AND discord_id = ? AND r = ? AND linked = ? AND EXISTS (SELECT 1 FROM codes WHERE r = ? AND discord_id = ? AND used = 0)').bind(b.guild, x.gv, b.faction, b.R, t, b.requester, code.discord_id, x.owned.r, x.owned.linked, b.R, code.discord_id)",
      "\t\t\t\t: DB.prepare('INSERT INTO members (character, discord_id, guild, gv, faction, r, linked) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM codes WHERE r = ? AND discord_id = ? AND used = 0)').bind(b.requester, code.discord_id, b.guild, x.gv, b.faction, b.R, t, b.R, code.discord_id),",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.13",
    find: "\tconst gone = await forgetUser(env, id, t);\n\tif (!gone.ok) return gone;",
    replace: [
      "\tconst gone = await forgetUser(env, id, t, { requireSettled: true });",
      "\tif (!gone.ok) return gone;",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.14",
    find: [
      "export async function forgetUser(env, discordId, t = now()) {",
      "\tconst id = String(discordId);",
      "\tif (!DISCORD_ID_RE.test(id)) return failure('format', 'A Discord id: digits only.');",
      "\tconst DB = database(env);",
      "\tconst characters = await charactersOf(env, id);",
      "\tconst keys = (await DB.prepare('SELECT key_id FROM keys WHERE owner_discord_id = ? AND revoked = 0').bind(id).all()).results || [];",
      "\tconst codes = 'SELECT r FROM codes WHERE discord_id = ?';",
      "\tconst links = 'SELECT r FROM members WHERE discord_id = ?';",
      "\tconst mine = 'SELECT character FROM members WHERE discord_id = ?';",
    ].join("\n"),
    replace: [
      "export async function forgetUser(env, discordId, t = now(), { requireSettled = false, admission = null, pendingLive = null } = {}) {",
      "\tconst id = String(discordId);",
      "\tif (!DISCORD_ID_RE.test(id)) return failure('format', 'A Discord id: digits only.');",
      "\tconst DB = database(env);",
      "\tconst codes = 'SELECT r FROM codes WHERE discord_id = ?';",
      "\tconst links = 'SELECT r FROM members WHERE discord_id = ?';",
      "\tconst mine = 'SELECT character FROM members WHERE discord_id = ?';",
      "\tif (requireSettled) {",
      "\t\t// One snapshot reports the rows actually deleted. The same captured live bound controls admission and every write.",
      "\t\t// Codes go last because the earlier r IN (codes) subqueries read them; reporting SELECTs do not mutate ownership.",
      "\t\tconst live = pendingLive === null ? deletionPendingLive(t) : pendingLive;",
      "\t\tif (!Number.isSafeInteger(live)) return deletionHeld();",
      "\t\tconst ownership = admission ? 'EXISTS (SELECT 1 FROM limits WHERE k = ? AND n = ? AND until = ?)' : '1';",
      "\t\tconst ownerArgs = admission ? [admission.key, admission.token, admission.at] : [];",
      "\t\tconst guard = 'NOT EXISTS (SELECT 1 FROM codes pending WHERE pending.discord_id = ? AND pending.used = 0 AND pending.exp >= ?) AND ' + ownership;",
      "\t\tconst result = await DB.batch([",
      "\t\t\tDB.prepare('SELECT EXISTS (SELECT 1 FROM codes WHERE discord_id = ? AND used = 0 AND exp >= ?) AS pending, ' + ownership + ' AS owned').bind(id, live, ...ownerArgs),",
      "\t\t\tDB.prepare('SELECT character FROM members WHERE discord_id = ? ORDER BY linked').bind(id),",
      "\t\t\tDB.prepare('SELECT key_id FROM keys WHERE owner_discord_id = ? AND revoked = 0').bind(id),",
      "\t\t\tDB.prepare(`DELETE FROM used WHERE (r IN (${codes}) OR r IN (${links})) AND ${guard}`).bind(id, id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`DELETE FROM inbox_uploads WHERE (discord_id = ? OR r IN (${codes}) OR requester IN (${mine}) OR from_character IN (${mine})) AND ${guard}`).bind(id, id, id, id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`DELETE FROM council_keys WHERE character IN (${mine}) AND ${guard}`).bind(id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`INSERT OR IGNORE INTO revoked_keys (key_id, revoked_at) SELECT key_id, COALESCE(revoked_at, ?) FROM keys WHERE owner_discord_id = ? AND ${guard}`).bind(t, id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`DELETE FROM keys WHERE owner_discord_id = ? AND ${guard}`).bind(id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`DELETE FROM members WHERE discord_id = ? AND ${guard}`).bind(id, id, live, ...ownerArgs),",
      "\t\t\tDB.prepare(`DELETE FROM codes WHERE discord_id = ? AND ${guard}`).bind(id, id, live, ...ownerArgs),",
      "\t\t]);",
      "\t\tconst rows = (i) => (Array.isArray(result) && result[i] ? result[i].results : null);",
      "\t\tconst pending = rows(0), characterRows = rows(1), keyRows = rows(2);",
      "\t\tif (!Array.isArray(result) || result.length !== 10 || !result.every((r) => r && r.success === true) || !Array.isArray(pending) || pending.length !== 1 || !pending[0] || ![0, 1].includes(pending[0].pending) || ![0, 1].includes(pending[0].owned) || !Array.isArray(characterRows) || !characterRows.every((r) => r && typeof r.character === 'string') || !Array.isArray(keyRows) || !keyRows.every((r) => r && typeof r.key_id === 'string')) {",
      "\t\t\treturn failure('server', 'The deletion outcome could not be confirmed. Ask the bot keeper to review it before trying again.');",
      "\t\t}",
      "\t\tif (pending[0].owned !== 1) return failure('server', 'This deletion no longer owns its admission; no link data was deleted. Ask the bot keeper to review it.');",
      "\t\tif (pending[0].pending === 1) return deletionPending();",
      "\t\treturn { ok: true, status: 'ok', discord_id: id, characters: characterRows.map((r) => r.character), keys: keyRows.map((k) => k.key_id) };",
      "\t}",
      "\tconst characters = await charactersOf(env, id);",
      "\tconst keys = (await DB.prepare('SELECT key_id FROM keys WHERE owner_discord_id = ? AND revoked = 0').bind(id).all()).results || [];",
    ].join("\n"),
    count: 1,
  }),
  // .195: a lost race for a new character is a definite no-change result for its member row (the record batch commits its
  // proofs and council keys, which undo takes back, but no member row), so it reaches undo instead of an unknown error
  // that holds the code forever; P4.20-P4.22 settle its code and answer.
  Object.freeze({
    id: "P4.15",
    find: "WHERE EXISTS (SELECT 1 FROM codes WHERE r = ? AND discord_id = ? AND used = 0)').bind(b.requester, code.discord_id, b.guild, x.gv, b.faction, b.R, t, b.R, code.discord_id),",
    replace: "WHERE EXISTS (SELECT 1 FROM codes WHERE r = ? AND discord_id = ? AND used = 0) ON CONFLICT(character) DO NOTHING').bind(b.requester, code.discord_id, b.guild, x.gv, b.faction, b.R, t, b.R, code.discord_id),",
    count: 1,
  }),
  Object.freeze({
    id: "P4.16",
    find: [
      "\t\t\t// A newer pending member may still roll back to this code: release only after our own rollback destination is present.",
      "\t\t\towned",
      "\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND EXISTS (SELECT 1 FROM members WHERE character = ? AND discord_id = ? AND r = ? AND linked = ?)').bind(b.R, 0, b.requester, code.discord_id, owned.r, owned.linked)",
      "\t\t\t\t: DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND NOT EXISTS (SELECT 1 FROM members WHERE character = ?)').bind(b.R, 0, b.requester),",
    ].join("\n"),
    replace: [
      "\t\t\t// A newer pending member may still roll back to this code: release only after our own rollback destination is present.",
      "\t\t\t// A new character's destination is no row: none may hold this code, nor any of this account's for the character",
      "\t\t\t// (a same-account claim that replaced ours may restore it); another account's row never rolls back to it.",
      "\t\t\towned",
      "\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND EXISTS (SELECT 1 FROM members WHERE character = ? AND discord_id = ? AND r = ? AND linked = ?)').bind(b.R, 0, b.requester, code.discord_id, owned.r, owned.linked)",
      "\t\t\t\t: DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND NOT EXISTS (SELECT 1 FROM members WHERE r = ?) AND NOT EXISTS (SELECT 1 FROM members WHERE character = ? AND discord_id = ?)').bind(b.R, 0, b.R, b.requester, code.discord_id),",
    ].join("\n"),
    count: 1,
  }),
  // .195: the page's 'linked' and 'already' answers list settled characters only, by the predicate the confirmer and key
  // checks use; forgetUser's report stays inclusive (it lists every row it deletes).
  Object.freeze({
    id: "P4.17",
    find: [
      "// The characters linked to a Discord account, oldest first.",
      "export async function charactersOf(env, discordId) {",
      "\tconst rows = (await database(env).prepare('SELECT character FROM members WHERE discord_id = ? ORDER BY linked').bind(String(discordId)).all()).results || [];",
    ].join("\n"),
    replace: [
      "// The characters linked to a Discord account, oldest first. { settled: true }: only those whose role outcome is",
      "// confirmed (no pending code holds the row), as the confirmer and key checks count them.",
      "export async function charactersOf(env, discordId, { settled = false } = {}) {",
      "\tconst held = settled ? ' AND NOT EXISTS (SELECT 1 FROM codes WHERE codes.r = members.r AND codes.used = 0)' : '';",
      "\tconst rows = (await database(env).prepare(`SELECT character FROM members WHERE discord_id = ?${held} ORDER BY linked`).bind(String(discordId)).all()).results || [];",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.18",
    find: "\t\treturn { ...linkedAnswer(v, 'already', v.message), characters: await charactersOf(env, code.discord_id) };",
    replace: "\t\treturn { ...linkedAnswer(v, 'already', v.message), characters: await charactersOf(env, code.discord_id, { settled: true }) };",
    count: 1,
  }),
  Object.freeze({
    id: "P4.19",
    find: "\treturn { ...linkedAnswer(v, 'linked', `${b.requester} is now linked to @${code.username}.`), characters: await charactersOf(env, code.discord_id) };",
    replace: "\treturn { ...linkedAnswer(v, 'linked', `${b.requester} is now linked to @${code.username}.`), characters: await charactersOf(env, code.discord_id, { settled: true }) };",
    count: 1,
  }),
  // .195 review round 1: a record batch that committed without its member row wrote no row that holds or could restore its
  // code (a code is released only once nothing can roll back to it), so undo releases it on that alone, whoever won the
  // race; the answer is upstream's for a lost race: linked-elsewhere when another account holds the character, otherwise
  // "send it again" (the account's own other code won, or the owned snapshot moved). A promote failure keeps P4.8/P4.16.
  Object.freeze({
    id: "P4.20",
    find: "\tif (!changed(wrote[wrote.length - 1])) {\n\t\tif (!(await undo(DB, x, t, first))) return pendingRole(b.R);\n\t\treturn linkedElsewhere(b);\n\t}",
    replace: [
      "\tif (!changed(wrote[wrote.length - 1])) {",
      "\t\t// This link wrote no member row (a lost race, or its owned snapshot moved): undo releases its code once no row holds",
      "\t\t// it, and the answer follows the character's holder now, as upstream's lost race answered.",
      "\t\tif (!(await undo(DB, x, t, first, true))) return pendingRole(b.R);",
      "\t\tlet holder = null;",
      "\t\ttry {",
      "\t\t\tholder = await DB.prepare('SELECT discord_id FROM members WHERE character = ?').bind(b.requester).first();",
      "\t\t} catch {",
      "\t\t\tholder = null;",
      "\t\t}",
      "\t\tif (holder && holder.discord_id !== code.discord_id) return linkedElsewhere(b);",
      "\t\treturn failure('server', 'The link could not be recorded: send it again in a minute.', { R: b.R });",
      "\t}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P4.21",
    find: "async function undo(DB, x, t, first) {",
    replace: "async function undo(DB, x, t, first, wroteNothing = false) {",
    count: 1,
  }),
  Object.freeze({
    id: "P4.22",
    find: "\t\t\t// (a same-account claim that replaced ours may restore it); another account's row never rolls back to it.\n\t\t\towned\n\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL",
    replace: [
      "\t\t\t// (a same-account claim that replaced ours may restore it); another account's row never rolls back to it.",
      "\t\t\t// A link that wrote no member row (wroteNothing) left nothing to restore: its code goes unless a row holds it.",
      "\t\t\twroteNothing",
      "\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL WHERE r = ? AND used = ? AND NOT EXISTS (SELECT 1 FROM members WHERE r = ?)').bind(b.R, 0, b.R)",
      "\t\t\t\t: owned",
      "\t\t\t\t? DB.prepare('UPDATE codes SET used = NULL",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P5.1",
    find: [
      "\tconst { b, code } = x;",
      "\tif (v.already) {",
      "\t\treturn { ...linkedAnswer(v, 'already', v.message), characters: await charactersOf(env, code.discord_id, { settled: true }) };",
      "\t}",
    ].join("\n"),
    replace: [
      "\tconst { b, code } = x;",
      "\tconst deleteKey = await deletionAdmissionKey(code.discord_id);",
      "\tif (v.already) {",
      "\t\t// Revalidate the exact settled association and the deletion guard together; examine's result may be stale.",
      "\t\tconst state = await DB.prepare('SELECT EXISTS (SELECT 1 FROM codes c JOIN members m ON m.r = c.r AND m.discord_id = c.discord_id WHERE c.r = ? AND c.used = ? AND m.character = ?) AS settled, EXISTS (SELECT 1 FROM limits WHERE k = ?) AS held').bind(b.R, code.used, b.requester, deleteKey).first();",
      "\t\tif (state && state.held === 1) return deletionHeld(false, b.R);",
      "\t\tif (!state || state.settled !== 1 || state.held !== 0) return pendingRole(b.R);",
      "\t\treturn { ...linkedAnswer(v, 'already', v.message), characters: await charactersOf(env, code.discord_id, { settled: true }) };",
      "\t}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P5.2",
    find: [
      "export async function forgetOwnLink(env, user, { demote, t = now() } = {}) {",
      "\tconst id = String(user && user.id);",
      "\tif (!DISCORD_ID_RE.test(id)) return failure('login', 'Sign in with Discord first.');",
    ].join("\n"),
    replace: [
      "function deletionPendingLive(t) {",
      "\t// Only pending proof markers have this existing .195 bound. Persistent deletion admissions still have no TTL.",
      "\tconst STUCK = 3600;",
      "\treturn Math.floor(t) - LINK.DELIVERY_GRACE - STUCK;",
      "}",
      "",
      "async function deletionAdmissionKey(id) {",
      "\t// Stable across seed rotations: this is a linkable coordination pseudonym, not a confidential limiter key.",
      "\treturn `delete:${bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`olympus-link-delete~${id}`))))}`;",
      "}",
      "",
      "function deletionPending() {",
      "\treturn failure('server', 'A link role change is still pending; no link data was deleted. Try again later (this can last until about eight days after the link code was issued), or ask the bot keeper to review it.');",
      "}",
      "",
      "function deletionHeld(dataDeleted = false, R) {",
      "\tconst message = dataDeleted",
      "\t\t? 'Your link data was deleted, but the final role-removal outcome or completion could not be confirmed. No role change will be retried automatically; ask the bot keeper to review it.'",
      "\t\t: 'Another deletion may be running, or its outcome is unconfirmed. No role change will be retried automatically; if the outcome stays unclear, ask the bot keeper to review it.';",
      "\treturn failure('server', message, R ? { R } : {});",
      "}",
      "",
      "async function admitDeletion(DB, id, t, live) {",
      "\tif (!Number.isSafeInteger(t) || !Number.isSafeInteger(live)) return null;",
      "\tconst random = crypto.getRandomValues(new Uint32Array(2));",
      "\tconst token = (random[0] & 0xfffff) * 0x100000000 + random[1] + 1;",
      "\tconst key = await deletionAdmissionKey(id);",
      "\ttry {",
      "\t\t// One atomic write excludes another deletion and every still-live claim. No TTL takeover or guard retry.",
      "\t\tconst result = await DB.prepare('INSERT OR IGNORE INTO limits (k, until, n) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM codes WHERE discord_id = ? AND used = 0 AND exp >= ?)').bind(key, t, token, id, live).run();",
      "\t\tif (result && result.success === true && result.meta && result.meta.changes === 1) return { key, token, at: t };",
      "\t\treturn result && result.success === true && result.meta && result.meta.changes === 0 ? { refused: true, key } : null;",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'delete_admit', errorRef(err));",
      "\t\treturn null;",
      "\t}",
      "}",
      "",
      "async function releaseDeletion(DB, admission) {",
      "\ttry {",
      "\t\t// The final operation: an unknown acknowledgement is never retried or followed by role work.",
      "\t\tconst result = await DB.prepare('DELETE FROM limits WHERE k = ? AND n = ? AND until = ?').bind(admission.key, admission.token, admission.at).run();",
      "\t\treturn !!(result && result.success === true && result.meta && result.meta.changes === 1);",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'delete_release', errorRef(err));",
      "\t\treturn false;",
      "\t}",
      "}",
      "",
      "export async function forgetOwnLink(env, user, { demote, t = now() } = {}) {",
      "\tconst id = String(user && user.id);",
      "\tif (!DISCORD_ID_RE.test(id)) return failure('login', 'Sign in with Discord first.');",
      "\tconst DB = database(env);",
      "\tconst live = deletionPendingLive(t);",
      "\tconst admission = await admitDeletion(DB, id, t, live);",
      "\tif (!admission) return deletionHeld();",
      "\tif (admission.refused) {",
      "\t\t// A diagnostic snapshot chooses only wording; it never admits deletion or a proof after a refused acquisition.",
      "\t\ttry {",
      "\t\t\tconst state = await DB.prepare('SELECT EXISTS (SELECT 1 FROM limits WHERE k = ?) AS held, EXISTS (SELECT 1 FROM codes WHERE discord_id = ? AND used = 0 AND exp >= ?) AS pending').bind(admission.key, id, live).first();",
      "\t\t\tif (state && state.held === 0 && state.pending === 1) return deletionPending();",
      "\t\t} catch {}",
      "\t\treturn deletionHeld();",
      "\t}",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P5.3",
    find: [
      "\t\tif (!role.ok && role.reason !== 'not-in-server') return failure('discord', 'Discord did not take the role change: try again in a minute.');",
      "\t}",
      "\tconst gone = await forgetUser(env, id, t, { requireSettled: true });",
      "\tif (!gone.ok) return gone;",
    ].join("\n"),
    replace: [
      "\t\tif (!role.ok && role.reason !== 'not-in-server') {",
      "\t\t\t// Only a returned, explicit no-application result can release admission without cleanup.",
      "\t\t\tif (role.notApplied === true && await releaseDeletion(DB, admission)) return failure('discord', 'Discord did not take the role change: try again in a minute.');",
      "\t\t\treturn deletionHeld();",
      "\t\t}",
      "\t}",
      "\tlet gone;",
      "\ttry {",
      "\t\tgone = await forgetUser(env, id, t, { requireSettled: true, admission, pendingLive: live });",
      "\t} catch (err) {",
      "\t\tconsole.error('olympus-link', 'delete_cleanup', errorRef(err));",
      "\t\treturn deletionHeld();",
      "\t}",
      "\tif (!gone.ok) return gone;",
      "\t// Keep the exact admission through the second removal; releasing first could strip a newly admitted proof's role.",
      "\tif (typeof demote === 'function') {",
      "\t\tconst again = await promoted(demote, id);",
      "\t\tif (!again.ok && again.reason !== 'not-in-server') {",
      "\t\t\tif (again.notApplied === true && await releaseDeletion(DB, admission)) return failure('discord', 'Your link data was deleted, but Discord did not take the role change: press delete again in a minute.');",
      "\t\t\treturn deletionHeld(true);",
      "\t\t}",
      "\t}",
      "\tif (!(await releaseDeletion(DB, admission))) return deletionHeld(true);",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P5.4",
    find: "\t\tDB.prepare('DELETE FROM limits WHERE until <= ?').bind(t),",
    replace: [
      "\t\t// Admission rows have no TTL: until records admission time and must never authorize reclaiming a delayed DELETE.",
      "\t\tDB.prepare(\"DELETE FROM limits WHERE until <= ? AND k NOT LIKE 'delete:%'\").bind(t),",
    ].join("\n"),
    count: 1,
  }),
  Object.freeze({
    id: "P5.5",
    find: "\tif (r && typeof r === 'object' && r.ok === false) return { ok: false, reason: r.reason === 'not-in-server' ? 'not-in-server' : 'discord' };",
    replace: "\tif (r && typeof r === 'object' && r.ok === false) return { ok: false, reason: r.reason === 'not-in-server' ? 'not-in-server' : 'discord', notApplied: r.notApplied === true };",
    count: 1,
  }),
]);

/** Each patch: the exact upstream text, its replacement, and how many times the text must occur. */
export const PATCHES = Object.freeze([
  Object.freeze({
    id: "P1",
    find: "const database = (env) => env.LINK_DB || env.DB;",
    replace: "const database = (env) => {\n\tif (!env || !env.LINK_DB) throw new Error('link_db_missing');\n\treturn env.LINK_DB;\n};",
    count: 1,
  }),
  ...P2_SITES.map(([find, replace], i) => Object.freeze({ id: `P2.${i + 1}`, find, replace, count: 1 })),
  Object.freeze({
    id: "P3",
    find: "export async function discordUser(accessToken, { clientId, fetchImpl = globalThis.fetch } = {}) {\n\tif (!DISCORD_ID_RE.test(String(clientId || ''))) throw new Error('Olympus Link: set DISCORD_CLIENT_ID to your Discord application\\'s id');\n",
    replace: "export async function discordUser(accessToken, { clientId, fetchImpl } = {}) {\n\tif (!DISCORD_ID_RE.test(String(clientId || ''))) throw new Error('Olympus Link: set DISCORD_CLIENT_ID to your Discord application\\'s id');\n\tif (typeof fetchImpl !== 'function') throw new Error('link_fetch_missing');\n",
    count: 1,
  }),
  ...PENDING_ROLE_PATCHES,
  Object.freeze({
    id: "P6.1",
    find: [
      "\t\t\tawait DB.batch([",
      "\t\t\t\tDB.prepare('INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(R, id, username, mode, T, t, exp, token, source),",
      "\t\t\t\tcountOne(DB, perDay, 86400, t),",
      "\t\t\t]);",
      "\t\t\treturn codeSuccess({ token, exp, mode, R, T });",
    ].join("\n"),
    replace: [
      "\t\t\t// The earlier reads are only fast refusals. Both quota predicates are rechecked by this write.",
      "\t\t\tconst issued = await DB.batch([",
      "\t\t\t\tDB.prepare('INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM codes WHERE discord_id = ? AND created > ?) < ? AND NOT EXISTS (SELECT 1 FROM limits WHERE k = ? AND until > ? AND n >= ?)').bind(R, id, username, mode, T, t, exp, token, source, id, t - 86400, LINK.CODES_PER_DAY, perDay, t, LINK.CODES_PER_DAY),",
      "\t\t\t\t// changes() belongs to the immediately preceding INSERT in this same transaction; no skipped code is charged.",
      "\t\t\t\tDB.prepare('INSERT INTO limits (k, until, n) SELECT ?, ?, 1 WHERE changes() = 1 ON CONFLICT(k) DO UPDATE SET n = CASE WHEN limits.until > ? THEN limits.n + 1 ELSE 1 END, until = CASE WHEN limits.until > ? THEN limits.until ELSE excluded.until END').bind(perDay, t + 86400, t, t),",
      "\t\t\t]);",
      "\t\t\tif (!Array.isArray(issued) || issued.length !== 2 || !issued.every((r) => r && r.success === true && r.meta && [0, 1].includes(r.meta.changes)) || issued[0].meta.changes !== issued[1].meta.changes) throw new Error('could not confirm code quota admission');",
      "\t\t\tif (issued[0].meta.changes === 0) return codeFailure('limit');",
      "\t\t\treturn codeSuccess({ token, exp, mode, R, T });",
    ].join("\n"),
    count: 1,
  }),
]);

export const HEADER = [
  "// @ts-nocheck",
  "// GENERATED by worker/scripts/build-link-core.mjs from worker/vendor/olympus-link/link-core.mjs -- never edit by hand.",
  "// `npm run build:link-core` regenerates it; `npm run check:link-core` (part of `npm test`) fails on any drift.",
  `// Upstream: ${UPSTREAM.repository} web/worker/link-core.mjs at commit ${UPSTREAM.commit}`,
  `// (SHA-256 ${VENDOR_PINS["link-core.mjs"].sha256}).`,
  "// Copyright (c) 2026 Olympus addon contributors. MIT License: the full notice is worker/vendor/olympus-link/LICENSE",
  "// and is kept with every copy, as it requires.",
  "// Build .186 reviewed patches, each an exact single replacement (the generator lists them):",
  "//   P1 database(): LINK_DB only, never env.DB (throws link_db_missing). The comment below that says",
  "//      \"DB when there is no LINK_DB\" is upstream's and no longer applies here.",
  "//   P2 upstream's nine console.error sites print a fixed stage and errorRef(err) only (log.ts): no R, id, message or stack.",
  "//      P4 has ten sites after retiring release_code and adding finalize_link/finalize_read; P5 adds three, all in that form.",
  "//   P3 discordUser(): the caller injects fetchImpl (credentialFetch); there is no globalThis.fetch default.",
  "//   P4 codes.used=0 is pending: unknown record/undo outcomes never release it; promotion alone cannot finalize it.",
  "//      Lost-race no-member batches undo their own effects and release only a code no row can restore; settled-only lists exclude pending authority.",
  "//      Guarded player deletion uses used=0 AND exp>=live, live=t-DELIVERY_GRACE-3600, with the same captured t/live at admission and cleanup.",
  "//      Its ten-result batch reads pending/ownership and report rows, then guards every mutation; codes go last.",
  "//   P5 admission atomically excludes live claims; claims exclude admission and already revalidates exact settlement plus no guard in one snapshot.",
  "//      Keep the stable pseudonymous guard through acknowledged cleanup and a second role removal, then release its exact key/token/time once LAST.",
  "//      Returned notApplied can release after a definite refusal; uncertain cleanup/role/release remains held, with no retry or recovery implementation.",
  "//      until is bookkeeping, never a TTL; prune excludes delete: rows. Pending claims have a bound, but deletion guards do not.",
  "//      Confirmer/key and settled-list authority deliberately remain unbounded; this deletion-only bound is not an authority shortcut.",
  "//      checkProof is an unwired preflight; MUST NOT wire its already result to a status answer: only acceptProof revalidates the admission guard.",
  "//   P6 corrected .194 atomic issuance quotas and exact paired acknowledgement checks are retained unchanged.",
  "//   These patches supersede upstream comments below: retry/free-code statements hold only after an acknowledged undo;",
  "//      forgetOwnLink first-removal \"nothing is deleted\" wording does not describe the second removal; unknown cleanup may have committed.",
  "//      A later press cannot clear an uncertain persistent admission. Raw operator forgetUser remains separate and ignores pending/admission state.",
  "//      The Nothing-kept player text excludes retained main-DB role audits and limiter/coordination rows; Phase1b privacy/recovery remains blocked.",
  "// Upstream limit values, signature/authentication checks and clocks stay unchanged. Only worker/src/link.ts loads this module, by dynamic import, behind its gate;",
  "// src/index.ts never re-exports it (LINK and PROOF_REASONS are scalar exports, which workerd refuses in an entry).",
  "import { errorRef } from './log';",
  "",
].join("\n");

/** The generated module for the given upstream text; throws when the pin or any patch does not hold exactly. */
export function generate(upstreamText) {
  const bytes = Buffer.from(upstreamText, "utf8");
  if (bytes.length !== VENDOR_PINS["link-core.mjs"].bytes || sha256(bytes) !== VENDOR_PINS["link-core.mjs"].sha256) {
    throw new Error("link-core upstream pin mismatch: vendor/olympus-link/link-core.mjs is not the reviewed upstream file");
  }
  let out = upstreamText;
  for (const p of PATCHES) {
    const found = out.split(p.find).length - 1;
    if (found !== p.count) throw new Error(`link-core patch ${p.id} matched ${found} times, expected ${p.count}`);
    out = out.split(p.find).join(p.replace);
  }
  return HEADER + out;
}

/** Checks every vendored file against its pin; returns the problems (empty when all hold). */
export function vendorProblems(vendorDir) {
  const problems = [];
  for (const [name, pin] of Object.entries(VENDOR_PINS)) {
    let bytes;
    try {
      bytes = readFileSync(join(vendorDir, name));
    } catch {
      problems.push(`${name}: missing`);
      continue;
    }
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) problems.push(`${name}: SHA-256 drift`);
  }
  return problems;
}

function main(args) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const vendorDir = join(root, "vendor", "olympus-link"), target = join(root, "src", "link-core.ts");
  const check = args.includes("--check");
  const problems = vendorProblems(vendorDir);
  if (problems.length) {
    console.error("link-core: vendored upstream files drifted:\n  " + problems.join("\n  "));
    return 1;
  }
  const generated = generate(readFileSync(join(vendorDir, "link-core.mjs"), "utf8"));
  if (check) {
    let current = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = null;
    }
    if (current !== generated) {
      console.error("link-core: src/link-core.ts is not what scripts/build-link-core.mjs generates; run npm run build:link-core");
      return 1;
    }
    console.log(`link-core: vendored files match their pins and src/link-core.ts is current (${PATCHES.length} patches)`);
    return 0;
  }
  writeFileSync(target, generated);
  console.log(`link-core: wrote src/link-core.ts (${PATCHES.length} patches)`);
  return 0;
}

// Run only when invoked as a script; the tests import generate() and the pins without writing anything. Both sides go
// through realpath: Node gives import.meta.url as the real path, so a run through a junction or a symlink (argv[1] is
// then the link) would otherwise look like an import, and --check would do nothing and exit 0.
function invokedAsScript() {
  if (!process.argv[1]) return false;
  let self, invoked;
  try {
    self = realpathSync(fileURLToPath(import.meta.url));
    invoked = realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
  return process.platform === "win32" ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
}
if (invokedAsScript()) process.exitCode = main(process.argv.slice(2));
