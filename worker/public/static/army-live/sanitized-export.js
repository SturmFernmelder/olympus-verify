/* Dedicated aggregate SavedVariables reader. This is a closed data grammar, never a Lua interpreter. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OlympusSanitizedExport = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 8192, PRODUCER = '1.3.2-site.1';
  const ROOT = ['schema', 'version', 'producer', 'capturedAt', 'realmGroup', 'faction', 'guild'];
  const GUILD = ['name', 'observedAt', 'characters', 'online'];
  const SNAPSHOT = ['format', 'scope', 'source', 'sourceVerified', 'membershipProof', 'addonVersion', 'realmGroup', 'faction', 'observedAt', 'guilds'];
  const ROW = ['name', 'receivedAt', 'reportedCharacters', 'online', 'classes', 'levels', 'ranks'];
  const NAMES = ['Olympus', 'Olympus I', 'Olympus II', 'Olympus III', 'Olympus IV', 'Olympus V', 'Olympus VI', 'Olympus VII', 'Olympus VIII', 'Olympus IX', 'Olympus X'];
  const canonicalGuild = name => typeof name === 'string' ? NAMES.find(value => value.toUpperCase() === name.replace(/[a-z]/g, c => c.toUpperCase())) : undefined;
  const fail = () => { throw Error('Only a dedicated, sanitized OlympusSiteAggregate export is accepted. Raw addon files, chat, keys, identities and executable Lua are refused.'); };
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key))) fail();
  }
  function label(v) { if (typeof v !== 'string' || !v.length || v.length > 96 || /[\x00-\x1f\x7f|]/.test(v)) fail(); }
  function read(text) {
    if (typeof text !== 'string' || !text.length || new TextEncoder().encode(text).length > MAX_BYTES) fail();
    let at = 0, nodes = 0;
    function white() { while (at < text.length && /[ \t\r\n]/.test(text[at])) at++; }
    function take(token) { white(); if (!text.startsWith(token, at)) fail(); at += token.length; }
    function string() {
      white(); const quote = text[at++]; if (quote !== '"' && quote !== "'") fail();
      let out = '';
      while (at < text.length) {
        let c = text[at++];
        if (c === quote) { if (out.length > 96 || /[\x00-\x1f\x7f]/.test(out)) fail(); return out; }
        if (c === '\\') {
          c = text[at++];
          if (c === '\\' || c === '"' || c === "'") out += c;
          else if (/[0-9]/.test(c || '')) {
            let digits = c; for (let n = 0; n < 2 && /[0-9]/.test(text[at] || ''); n++) digits += text[at++];
            const code = Number(digits); if (code < 32 || code > 126) fail(); out += String.fromCharCode(code);
          } else fail();
        } else { if (!c || /[\x00-\x1f\x7f]/.test(c)) fail(); out += c; }
        if (out.length > 96) fail();
      }
      fail();
    }
    function value(depth) {
      white(); if (++nodes > 64 || depth > 3) fail();
      if (text[at] === '"' || text[at] === "'") return string();
      if (text[at] === '{') {
        at++; const out = Object.create(null); white();
        while (text[at] !== '}') {
          take('['); const key = string(); take(']'); take('=');
          if (['__proto__', 'prototype', 'constructor'].includes(key) || Object.hasOwn(out, key)) fail();
          out[key] = value(depth + 1); white();
          if (text[at] === ',') { at++; white(); } else if (text[at] !== '}') fail();
        }
        at++; return out;
      }
      const match = /^(0|[1-9][0-9]*)/.exec(text.slice(at)); if (!match) fail();
      at += match[0].length; const number = Number(match[0]); if (!integer(number, 0, 4102444800)) fail(); return number;
    }
    take('OlympusSiteAggregate'); take('='); const out = value(0); white(); if (at !== text.length) fail();
    return out;
  }
  function validateSnapshot(v, now) {
    keys(v, SNAPSHOT);
    if (v.format !== 'olympus-stat-observation-v2' || v.scope !== 'own-guild' || v.source !== 'volunteer-client' || v.sourceVerified !== false || v.membershipProof !== false || v.addonVersion !== PRODUCER) fail();
    label(v.realmGroup); if (!['Alliance', 'Horde'].includes(v.faction)) fail();
    if (!integer(now, 0, 4102444800) || !integer(v.observedAt, 1, now) || now - v.observedAt > 86400 || !Array.isArray(v.guilds) || v.guilds.length !== 1) fail();
    const g = v.guilds[0]; keys(g, ROW);
    if (!canonicalGuild(g.name) || !integer(g.receivedAt, 1, v.observedAt) || now - g.receivedAt > 86400) fail();
    const total = g.reportedCharacters, online = g.online;
    if (total !== 'few' && !integer(total, 5, 1000)) fail();
    if (total === 'few' && online !== null || online !== null && online !== 'few' && !integer(online, 0, typeof total === 'number' ? total : 0)) fail();
    if (typeof online === 'number' && online > 0 && online < 5 || typeof online === 'number' && typeof total === 'number' && total - online > 0 && total - online < 5) fail();
    if (now - g.receivedAt > 900 && online !== null || ['classes', 'levels', 'ranks'].some(key => g[key] !== null)) fail();
    if (new TextEncoder().encode(JSON.stringify(v)).length > 1023) fail();
    return v;
  }
  function parse(text, options) {
    const now = options && options.nowSeconds !== undefined ? options.nowSeconds : Math.floor(Date.now() / 1000), v = read(text);
    keys(v, ROOT); keys(v.guild, GUILD);
    if (v.schema !== 'olympus-site-aggregate' || v.version !== 1 || v.producer !== PRODUCER) fail();
    const g = v.guild;
    // Old online observations are withheld locally; source timestamps are never replaced with import time.
    const originalOnline = g.online === 'unavailable' ? null : g.online;
    if (g.online !== 'unavailable' && g.online !== 'few' && !integer(g.online, 0, 1000)) fail();
    const out = {format: 'olympus-stat-observation-v2', scope: 'own-guild', source: 'volunteer-client', sourceVerified: false, membershipProof: false, addonVersion: PRODUCER, realmGroup: v.realmGroup, faction: v.faction, observedAt: v.capturedAt, guilds: [{name: canonicalGuild(g.name), receivedAt: g.observedAt, reportedCharacters: g.characters, online: originalOnline, classes: null, levels: null, ranks: null}]};
    // A private count in the file is a refusal, even when import-time remasking would hide it.
    validateSnapshot(out, v.capturedAt);
    if (now - g.observedAt > 900) out.guilds[0].online = null;
    validateSnapshot(out, now); Object.freeze(out.guilds[0]); Object.freeze(out.guilds); return Object.freeze(out);
  }
  return Object.freeze({MAX_BYTES, PRODUCER, parse, validateSnapshot});
}));
