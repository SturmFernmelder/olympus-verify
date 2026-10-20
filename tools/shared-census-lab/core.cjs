'use strict';

// Process-local domain only, synthetic by default. A strict one-guild real-data
// opt-in still uses fictional reporter identities and no provider/application bindings.
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHash } = require('node:crypto');
const FORMAT = 'olympus-shared-census-observation-v1';
const CONSENT_VERSION = 'synthetic-census-v1';
const LOCAL_REAL_CONSENT_VERSION = 'local-real-census-v1';
const FIXTURES = Object.freeze({
  reporterA: Object.freeze({ accountId: 'reporter-a', sessionId: 'session-a', incarnation: 'native-a' }),
  reporterB: Object.freeze({ accountId: 'reporter-b', sessionId: 'session-b', incarnation: 'native-b' }),
  reader: Object.freeze({ accountId: 'reader', sessionId: 'session-reader', incarnation: 'native-reader' })
});
const GUILDS = Object.freeze([
  Object.freeze({ guildKey: 'guild-oak', label: 'Synthetic Oak', realmGroup: 'Synthetic Realm', product: 'synthetic-only', faction: 'Alliance' }),
  Object.freeze({ guildKey: 'guild-pine', label: 'Synthetic Pine', realmGroup: 'Synthetic Realm', product: 'synthetic-only', faction: 'Alliance' }),
  Object.freeze({ guildKey: 'guild-unreported', label: 'Synthetic Unreported', realmGroup: 'Synthetic Realm', product: 'synthetic-only', faction: 'Alliance' })
]);
const KEYS = ['format', 'intent', 'source', 'sourceVerified', 'membershipProof', 'guildKey', 'addonVersion', 'observedAt', 'sourceReceivedAt', 'capturedAt', 'completeRosterClaimed', 'reportedCharacters', 'reportedOnline'];
class CensusError extends Error {
  constructor(status, code) { super(code); this.name = 'CensusError'; this.status = status; this.code = code; }
}
const refuse = (status, code) => { throw new CensusError(status, code); };
const digest = value => createHash('sha256').update(value).digest('hex');
const id = () => randomBytes(16).toString('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const opaque = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

// JSON.parse alone loses duplicate keys. Parse a bounded grammar before shape validation.
function strictJson(buffer) {
  if (!Buffer.isBuffer(buffer)) refuse(400, 'body_bytes_required');
  if (!buffer.length || buffer.length > 4096) refuse(413, 'body_size');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); } catch { refuse(400, 'invalid_utf8'); }
  let position = 0, nodes = 0;
  const bad = () => refuse(400, 'invalid_json');
  const whitespace = () => { while (/[\x20\x09\x0a\x0d]/.test(source[position] || '\u0000')) position++; };
  function string() {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, position)); } catch { bad(); }
        for (let i = 0; i < value.length; i++) {
          const code = value.charCodeAt(i);
          if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) refuse(400, 'invalid_unicode'); }
          else if (code >= 0xdc00 && code <= 0xdfff) refuse(400, 'invalid_unicode');
        }
        return value;
      }
      if (character.charCodeAt(0) < 32) bad();
      if (character === '\\') { if (position >= source.length) bad(); position++; }
    }
    bad();
  }
  function value(depth) {
    if (depth > 8 || ++nodes > 256) bad();
    whitespace();
    const character = source[position];
    if (character === '"') return string();
    if (character === '{') {
      position++; whitespace(); const object = Object.create(null), seen = new Set();
      if (source[position] === '}') { position++; return object; }
      while (position < source.length) {
        if (source[position] !== '"') bad();
        const key = string(); if (seen.has(key)) refuse(400, 'duplicate_key'); seen.add(key);
        whitespace(); if (source[position++] !== ':') bad(); object[key] = value(depth + 1); whitespace();
        const delimiter = source[position++]; if (delimiter === '}') return object; if (delimiter !== ',') bad(); whitespace();
      }
      bad();
    }
    if (character === '[') {
      position++; whitespace(); const array = [];
      if (source[position] === ']') { position++; return array; }
      while (position < source.length) { array.push(value(depth + 1)); whitespace(); const delimiter = source[position++]; if (delimiter === ']') return array; if (delimiter !== ',') bad(); }
      bad();
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) if (source.startsWith(token, position)) { position += token.length; return result; }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(position));
    if (!match) bad(); position += match[0].length;
    const result = Number(match[0]); if (!Number.isFinite(result)) bad(); return result;
  }
  const result = value(0); whitespace(); if (position !== source.length) bad(); return result;
}

function validate(report, at, allowedGuildKeys) {
  if (!report || Array.isArray(report) || typeof report !== 'object' || Object.keys(report).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(report, key)) || Object.keys(report).some(key => !KEYS.includes(key))) refuse(400, 'report_shape');
  if (report.format !== FORMAT || report.source !== 'unverified-volunteer-client' || report.sourceVerified !== false || report.membershipProof !== false || report.addonVersion !== '0.1.0' || report.completeRosterClaimed !== true || !opaque(report.intent)) refuse(400, 'report_contract');
  if (!allowedGuildKeys.includes(report.guildKey)) refuse(400, 'guild_scope');
  const { sourceReceivedAt: received, observedAt: observed, capturedAt: captured, reportedCharacters: members, reportedOnline: online } = report;
  if (![received, observed, captured].every(integer) || received > observed || observed > captured || [received, observed, captured].some(time => time > at + 60)) refuse(400, 'report_time');
  // Exclusive hard expiry: an observation cannot enter current view at its expiry instant.
  if (at - received >= 86400 || at - observed >= 86400) refuse(400, 'source_expired');
  if (members !== 'few' && (!integer(members) || members < 5 || members > 1000)) refuse(400, 'member_count');
  if (members === 'few' && online !== null) refuse(400, 'small_total');
  if (online !== null && online !== 'few' && (!integer(online) || online !== 0 && online < 5 || online > members)) refuse(400, 'online_count');
  if (typeof members === 'number' && typeof online === 'number' && online >= 5 && members - online >= 1 && members - online <= 4) refuse(400, 'small_complement');
  if (at - received > 900 && online !== null) refuse(400, 'online_expired');
  return report;
}

function localGuild(value) {
  const keys = ['guildKey', 'label', 'realmGroup', 'faction', 'product'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) || value.guildKey !== 'local-own-guild' || value.product !== 'local-only' || !['Alliance', 'Horde'].includes(value.faction)) throw new TypeError('One strict local-only guild registration required');
  for (const key of ['label', 'realmGroup']) {
    const text = value[key];
    if (typeof text !== 'string' || !text || text.trim() !== text || Buffer.byteLength(text, 'utf8') > 128 || /[\u0000-\u001f\u007f-\u009f]/.test(text)) throw new TypeError('Bounded local guild labels required');
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) { const next = text.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('Local guild labels require Unicode scalars'); }
      else if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError('Local guild labels require Unicode scalars');
    }
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}

function createCensusStore({ now = () => Math.floor(Date.now() / 1000), localRealGuild } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const realLocal = localRealGuild !== undefined;
  const guilds = realLocal ? Object.freeze([localGuild(localRealGuild)]) : GUILDS;
  const allowedGuildKeys = realLocal ? ['local-own-guild'] : ['guild-oak', 'guild-pine'];
  const consentVersion = realLocal ? LOCAL_REAL_CONSENT_VERSION : CONSENT_VERSION;
  const domain = realLocal ? Object.freeze({ syntheticOnly: false, localOnly: true, reporterIdentitySynthetic: true }) : Object.freeze({ syntheticOnly: true });
  const db = new DatabaseSync(':memory:');
  let closed = false, lastTime = 0;
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, incarnation TEXT NOT NULL, can_read INTEGER NOT NULL, can_report INTEGER NOT NULL, held INTEGER NOT NULL, erased INTEGER NOT NULL);
    CREATE TABLE intents (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, session_id TEXT NOT NULL, incarnation TEXT NOT NULL, guild_key TEXT NOT NULL, consent TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, digest TEXT, receipt_id TEXT);
    CREATE TABLE contents (digest TEXT PRIMARY KEY, guild_key TEXT NOT NULL, observed_at INTEGER NOT NULL, source_received_at INTEGER NOT NULL, characters TEXT, online TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE receipts (id TEXT PRIMARY KEY, intent_id TEXT UNIQUE NOT NULL, account_id TEXT NOT NULL, session_id TEXT NOT NULL, incarnation TEXT NOT NULL, guild_key TEXT NOT NULL, content_digest TEXT NOT NULL, received_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE attempts (account_id TEXT NOT NULL, at INTEGER NOT NULL);`);
  for (const [key, ctx] of Object.entries(FIXTURES)) db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,0,0)').run(ctx.accountId, ctx.sessionId, ctx.incarnation, 1, key === 'reader' ? 0 : 1);
  function clock() {
    if (closed) refuse(503, 'store_closed');
    const at = now(); if (!integer(at) || at > 253402300799) refuse(503, 'clock_invalid');
    if (at < lastTime) refuse(503, 'clock_rollback'); lastTime = at; return at;
  }
  function guard(ctx, report = false) {
    if (!ctx || !identifier(ctx.accountId) || !identifier(ctx.sessionId) || !identifier(ctx.incarnation)) refuse(401, 'context_required');
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(ctx.accountId);
    if (!account || account.erased || account.session_id !== ctx.sessionId || account.incarnation !== ctx.incarnation) refuse(401, 'stale_context');
    if (account.held) refuse(423, 'native_hold');
    if (!account.can_read || report && !account.can_report) refuse(403, 'access_refused');
    return account;
  }
  function transaction(ctx, report, operation) {
    guard(ctx, report); db.exec('BEGIN IMMEDIATE');
    try { guard(ctx, report); const result = operation(); guard(ctx, report); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const eligible = `r.state='accepted' AND r.expires_at>? AND a.erased=0 AND a.held=0 AND a.can_read=1 AND a.can_report=1 AND r.session_id=a.session_id AND r.incarnation=a.incarnation`;
  function prune(at) {
    db.prepare(`UPDATE contents SET characters=NULL,online=NULL WHERE expires_at<=? OR NOT EXISTS (SELECT 1 FROM receipts r JOIN accounts a ON a.id=r.account_id WHERE r.content_digest=contents.digest AND ${eligible})`).run(at, at);
  }
  function sweep(at) {
    prune(at);
    db.prepare('DELETE FROM attempts WHERE at<=?').run(at - 3600);
    db.prepare('DELETE FROM intents WHERE issued_at<=? OR (receipt_id IS NULL AND expires_at<=?)').run(at - 86400, at);
    db.prepare('DELETE FROM receipts WHERE received_at<=?').run(at - 86400);
    // A source admitted up to60s in the future can outlive its first-receipt cap.
    // Keep only the count-free deadline tombstone until that source also expires,
    // so deleting a receipt cannot let identical content re-enter with a later cap.
    db.prepare('DELETE FROM contents WHERE expires_at<=? AND source_received_at+86400<=?').run(at, at);
  }
  function owned(ctx, table, key, value) {
    if (!opaque(value)) refuse(404, 'outcome_unavailable');
    const row = db.prepare(`SELECT * FROM ${table} WHERE ${key}=?`).get(value);
    if (!row || row.account_id !== ctx.accountId || row.session_id !== ctx.sessionId || row.incarnation !== ctx.incarnation) refuse(404, 'outcome_unavailable');
    return row;
  }
  function receiptDto(row, at) {
    return { ...domain, receiptId: row.id, intent: row.intent_id, guildKey: row.guild_key,
      state: row.state === 'accepted' && at >= row.expires_at ? 'expired' : row.state,
      receivedAt: row.received_at, expiresAt: row.expires_at, sourceVerified: false, membershipProof: false, gameIdentityProven: false,
      ...(realLocal ? { reporterAccountAssociated: false, syntheticReporterAssociated: true } : { reporterAccountAssociated: true }) };
  }
  function receipt(ctx, receiptId) { const at = clock(); guard(ctx); const row = owned(ctx, 'receipts', 'id', receiptId); if (at - row.received_at >= 86400) refuse(404, 'outcome_unavailable'); guard(ctx); return receiptDto(row, at); }
  function contract(ctx) {
    clock(); const account = guard(ctx);
    return { ...domain, format: FORMAT, consentVersion, audience: 'private', canReport: !!account.can_report,
      allowedGuildKeys: account.can_report ? [...allowedGuildKeys] : [], guilds: guilds.map(guild => ({ ...guild })),
      limits: { bodyBytes: 4096, intentSeconds: 300, futureSeconds: 60, onlineSeconds: 900, sourceSeconds: 86400, acceptedIntervalSeconds: 300, attemptsPerHour: 12 } };
  }
  function createIntent(ctx, input) {
    const at = clock();
    return transaction(ctx, true, () => {
      if (!input || Object.keys(input).sort().join() !== 'consentVersion,guildKey' || input.consentVersion !== consentVersion || !allowedGuildKeys.includes(input.guildKey)) refuse(400, 'intent_contract');
      sweep(at);
      if (db.prepare('SELECT COUNT(*) n FROM intents WHERE account_id=? AND receipt_id IS NULL AND expires_at>?').get(ctx.accountId, at).n >= 12) refuse(429, 'intent_capacity');
      const intent = id();
      db.prepare('INSERT INTO intents VALUES (?,?,?,?,?,?,?,?,NULL,NULL)').run(intent, ctx.accountId, ctx.sessionId, ctx.incarnation, input.guildKey, input.consentVersion, at, at + 300);
      return { ...domain, intent, guildKey: input.guildKey, consentVersion, issuedAt: at, expiresAt: at + 300 };
    });
  }
  function submit(ctx, buffer) {
    const at = clock();
    // A rejected new attempt is committed without a report. Exact retries spend no further budget.
    const result = transaction(ctx, true, () => {
      let parsed, parseError; try { parsed = strictJson(buffer); } catch (error) { parseError = error; }
      const bytesDigest = Buffer.isBuffer(buffer) && buffer.length <= 4096 ? digest(buffer) : null;
      const found = parsed && opaque(parsed.intent) ? db.prepare('SELECT * FROM intents WHERE id=?').get(parsed.intent) : null;
      const own = found && found.account_id === ctx.accountId && found.session_id === ctx.sessionId && found.incarnation === ctx.incarnation;
      if (own && found.digest === bytesDigest && found.receipt_id) {
        const prior = db.prepare('SELECT * FROM receipts WHERE id=?').get(found.receipt_id);
        if (prior && at - found.issued_at < 86400) return { value: receiptDto(prior, at) };
      }
      db.prepare('DELETE FROM attempts WHERE at<=?').run(at - 3600);
      if (db.prepare('SELECT COUNT(*) n FROM attempts WHERE account_id=?').get(ctx.accountId).n >= 12) return { error: new CensusError(429, 'attempt_limit') };
      db.prepare('INSERT INTO attempts VALUES (?,?)').run(ctx.accountId, at);
      try {
        if (parseError) throw parseError;
        validate(parsed, at, allowedGuildKeys);
        if (!own) refuse(404, 'intent_unavailable');
        if (found.digest || found.receipt_id) refuse(409, 'intent_reused');
        if (found.expires_at <= at || at - found.issued_at >= 86400) refuse(409, 'intent_expired');
        if (found.guild_key !== parsed.guildKey || found.consent !== consentVersion) refuse(409, 'intent_binding');
        const last = db.prepare('SELECT MAX(received_at) at FROM receipts WHERE account_id=? AND guild_key=?').get(ctx.accountId, parsed.guildKey).at;
        if (last !== null && at - last < 300) refuse(429, 'accepted_interval');
        const contentDigest = digest(JSON.stringify([parsed.guildKey, parsed.observedAt, parsed.sourceReceivedAt, parsed.reportedCharacters, parsed.reportedOnline, parsed.addonVersion]));
        const existing = db.prepare('SELECT * FROM contents WHERE digest=?').get(contentDigest);
        const expiresAt = existing ? Math.min(existing.expires_at, at + 86400) : Math.min(parsed.sourceReceivedAt + 86400, parsed.observedAt + 86400, at + 86400);
        if (at >= expiresAt) refuse(409, 'content_expired');
        const characters = JSON.stringify(parsed.reportedCharacters), online = JSON.stringify(parsed.reportedOnline);
        if (existing) db.prepare('UPDATE contents SET characters=?,online=? WHERE digest=?').run(characters, online, contentDigest);
        else db.prepare('INSERT INTO contents VALUES (?,?,?,?,?,?,?)').run(contentDigest, parsed.guildKey, parsed.observedAt, parsed.sourceReceivedAt, characters, online, expiresAt);
        db.prepare("UPDATE receipts SET state='superseded' WHERE account_id=? AND guild_key=? AND state='accepted'").run(ctx.accountId, parsed.guildKey);
        const receiptId = id();
        db.prepare("INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?,?,'accepted')").run(receiptId, found.id, ctx.accountId, ctx.sessionId, ctx.incarnation, parsed.guildKey, contentDigest, at, expiresAt);
        db.prepare('UPDATE intents SET digest=?,receipt_id=? WHERE id=? AND digest IS NULL').run(bytesDigest, receiptId, found.id);
        prune(at);
        return { value: receiptDto(db.prepare('SELECT * FROM receipts WHERE id=?').get(receiptId), at) };
      } catch (error) { if (error instanceof CensusError) return { error }; throw error; }
    });
    if (result.error) throw result.error; return result.value;
  }
  function outcome(ctx, intentId) {
    const at = clock(); guard(ctx); const intent = owned(ctx, 'intents', 'id', intentId);
    if (at - intent.issued_at >= 86400) refuse(404, 'outcome_unavailable');
    if (!intent.receipt_id) return { ...domain, state: at >= intent.expires_at ? 'expired' : 'pending' };
    const row = owned(ctx, 'receipts', 'id', intent.receipt_id); guard(ctx); const dto = receiptDto(row, at); return { ...domain, state: dto.state, receipt: dto };
  }
  function withdraw(ctx, receiptId) {
    const at = clock();
    return transaction(ctx, false, () => {
      const row = owned(ctx, 'receipts', 'id', receiptId);
      if (at - row.received_at >= 86400) refuse(404, 'outcome_unavailable');
      if (row.state !== 'withdrawn') db.prepare("UPDATE receipts SET state='withdrawn' WHERE id=?").run(row.id);
      prune(at); return receiptDto(db.prepare('SELECT * FROM receipts WHERE id=?').get(row.id), at);
    });
  }
  function summary(ctx) {
    const at = clock(); guard(ctx);
    const rows = guilds.map(guild => {
      const content = db.prepare(`SELECT DISTINCT c.* FROM contents c JOIN receipts r ON r.content_digest=c.digest JOIN accounts a ON a.id=r.account_id WHERE c.guild_key=? AND c.expires_at>? AND c.observed_at<=? AND c.source_received_at<=? AND c.characters IS NOT NULL AND ${eligible} ORDER BY c.source_received_at,c.observed_at,c.digest`).all(guild.guildKey, at, at, at, at);
      const base = { ...guild, state: 'unavailable', reportedCharacters: null, reportedOnline: null, observedAt: null, sourceReceivedAt: null, expiresAt: null };
      if (!content.length) return base;
      const effective = content.map(row => ({ row, members: JSON.parse(row.characters), online: at - row.source_received_at > 900 ? null : JSON.parse(row.online) }));
      const variants = new Set(effective.map(item => JSON.stringify([item.members, item.online])));
      if (variants.size > 1) return { ...base, state: 'conflicted', expiresAt: Math.min(...content.map(row => row.expires_at)), observationRange: { from: Math.min(...content.map(row => row.source_received_at)), to: Math.max(...content.map(row => row.observed_at)) } };
      // Equal values do not establish agreement or freshness. Use oldest active source conservatively.
      return { ...base, state: 'reported', reportedCharacters: effective[0].members, reportedOnline: effective[0].online,
        observedAt: Math.min(...content.map(row => row.observed_at)), sourceReceivedAt: content[0].source_received_at, expiresAt: Math.min(...content.map(row => row.expires_at)) };
    });
    guard(ctx); return { ...domain, audience: 'private', evaluatedAt: at, sourceVerified: false, membershipProof: false, gameIdentityProven: false, coverageComplete: false, rows };
  }
  function setAccount(accountId, patch) {
    clock(); if (!Object.values(FIXTURES).some(ctx => ctx.accountId === accountId) || !patch || typeof patch !== 'object' || Array.isArray(patch)) refuse(400, 'fixture_account');
    const map = { canRead: 'can_read', canReport: 'can_report', held: 'held', sessionId: 'session_id', incarnation: 'incarnation' };
    for (const [key, value] of Object.entries(patch)) if (!Object.hasOwn(map, key) || (['sessionId', 'incarnation'].includes(key) ? !identifier(value) : typeof value !== 'boolean')) refuse(400, 'fixture_patch');
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId); if (account.erased) refuse(409, 'fixture_erased');
    for (const [key, value] of Object.entries(patch)) db.prepare(`UPDATE accounts SET ${map[key]}=? WHERE id=?`).run(typeof value === 'boolean' ? Number(value) : value, accountId);
  }
  function eraseAccount(accountId) {
    const at = clock(); if (!Object.values(FIXTURES).some(ctx => ctx.accountId === accountId)) refuse(400, 'fixture_account');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM receipts WHERE account_id=?').run(accountId); db.prepare('DELETE FROM intents WHERE account_id=?').run(accountId); db.prepare('DELETE FROM attempts WHERE account_id=?').run(accountId);
      db.prepare('UPDATE accounts SET erased=1,held=1,can_read=0,can_report=0,session_id=?,incarnation=? WHERE id=?').run(id(), id(), accountId); prune(at); db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function cleanup() { const at = clock(); db.exec('BEGIN IMMEDIATE'); try { sweep(at); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } return inspect(); }
  function inspect() {
    clock(); const result = {};
    for (const table of ['accounts', 'intents', 'receipts', 'contents', 'attempts']) result[table] = db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
    result.contentPayloads = db.prepare('SELECT COUNT(*) n FROM contents WHERE characters IS NOT NULL').get().n;
    return result;
  }
  return Object.freeze({ contract, createIntent, submit, receipt, outcome, withdraw, summary, setAccount, eraseAccount, cleanup, inspect, close() { if (!closed) { db.close(); closed = true; } } });
}

module.exports = { createCensusStore, CensusError, FIXTURES, CONSENT_VERSION, LOCAL_REAL_CONSENT_VERSION, FORMAT, parseStrictJSON: strictJson };
