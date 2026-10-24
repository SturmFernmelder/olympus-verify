/* Local HT1 inspection only. The caller admits the current Admin before mounting. */
(function (global) {
  'use strict';
  // Immutable Olympus 1.3.2 Sign.lua, not the separate Link Ed25519/bot key.
  // https://github.com/dnl-gentile/olympus-addon/blob/d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2/Olympus/Sign.lua
  // Source SHA256 a38082ae3ccb7ac96bc62c49f56a0403e905baec6fb85ca460ca2f7d731d2635 (8256 bytes).
  // SHA256 of the 256 modulus bytes: bd28c005a1107d8347e752ea41b6a4ad444685e7a08949d9146d8291c96293c9.
  const AUTHOR_MODULUS = '84a62410ffd1872739d169af98d461defee07628fcd907cef84b5ca39f9a840b6b518b2a246319ec2cbd4477ee30a2a17924c3540e647687eea614f9a05bf9a305274b28f0add3de7a3aae32e4c950030cfc2336221e705110cecc4622e0d86fb15340d1e76dfdad6813f81039dce9eff82224ecab8c6b9822957b5e724d67f8de14b8188e3f0cedf8a29dd1fb33aa7e24be0630ce6bb2bf31b3e1508a6976b225ce4ec73ead73cf74c8ef4034ae8fa94b0c8adc1f8f7d40e50c5cc3080e502120c122ae2af9f0066923ee5822a639e88b1cd8b9a469e91abd260401578d4c5a9900af45c7bb8e938a8b22bc60cec354a6986918d19658ce14d98b27d7ad0e8f';
  const MAX_BYTES = 3000, mounted = new WeakMap(), encoder = new TextEncoder();
  const bytes = text => encoder.encode(text), trim = text => text.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '');
  const fromHex = hex => Uint8Array.from(hex.match(/../g) || [], pair => parseInt(pair, 16));
  const folded = text => text.replace(/[A-Z]/g, letter => letter.toLowerCase());
  const guildFold = text => folded(text).replace(/[\u00c0-\u00d6\u00d8-\u00de]/g, letter => String.fromCharCode(letter.charCodeAt(0) + 32));
  function base64url(value) { return global.btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  // The optional modulus argument is internal and never exposed by the production namespace.
  // The offline test VM exposes this function to an existing public NIST verification vector.
  async function verifyBytes(message, signatureHex, modulus = AUTHOR_MODULUS) {
    if (!/^[0-9a-fA-F]{512}$/.test(signatureHex) || !/^[89a-fA-F][0-9a-fA-F]{511}$/.test(modulus)) return false;
    if (typeof global.crypto?.subtle?.importKey !== 'function' || typeof global.crypto?.subtle?.verify !== 'function') throw Error('WebCrypto is unavailable. Nothing can be verified or copied.');
    const key = await global.crypto.subtle.importKey('jwk', { kty: 'RSA', n: base64url(fromHex(modulus)), e: 'Aw', alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (key.algorithm.modulusLength !== 2048 || Array.from(key.algorithm.publicExponent).join() !== '3') throw Error('Unexpected author public key.');
    return global.crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromHex(signatureHex), message);
  }
  function parse(blob) {
    if (typeof blob !== 'string' || !blob || blob.length > MAX_BYTES || bytes(blob).length > MAX_BYTES) throw Error('Paste exactly one HT1 blob, at most 3,000 UTF-8 bytes.');
    if (new TextDecoder('utf-8', { fatal: true }).decode(bytes(blob)) !== blob) throw Error('The text is not exact UTF-8.');
    // No trimming, extraction, normalization or reserialization of the signed bytes.
    const match = /^(HT1~([0-9]+)~([^~]*)~([01])~([^~]*))~([0-9a-fA-F]{512})$/.exec(blob);
    if (!match || match[0] !== blob) throw Error('Expected exact HT1~timestamp~realm-group~0-or-1~entries~512-hex-signature, without surrounding text or newlines.');
    const timestamp = Number(match[2]);
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000) throw Error('The signed timestamp cannot be displayed exactly.');
    const result = { blob, signed: match[1], timestamp, timestampText: match[2], realm: match[3], public: match[4] === '1', entries: match[5], signature: match[6], departments: [], guilds: { Alliance: [], Horde: [] }, other: [], omitted: 0 };
    let named = 0, people = 0; const seen = new Set();
    for (const entry of result.entries.split(';').filter(Boolean)) {
      const guild = /^\^guilds\^([A-Za-z]+)\^([^\^]*)$/.exec(entry);
      if (guild && Object.hasOwn(result.guilds, guild[1])) {
        const list = result.guilds[guild[1]];
        for (const raw of guild[2].split(',').filter(Boolean)) {
          const name = trim(raw), encoded = bytes(name), characters = encoded.reduce((count, byte) => count + (byte < 128 || byte > 191 ? 1 : 0), 0);
          // Core.lua ApprovedName permits ASCII letters/spaces and UTF-8 bytes >=128.
          if (!name || encoded.length > 72 || characters > 24 || !/^[A-Za-z\u0080-\u{10ffff}][A-Za-z \u0080-\u{10ffff}]*$/u.test(name)
            || list.some(held => guildFold(held) === guildFold(name)) || list.length >= 20) { result.omitted++; continue; }
          list.push(name);
        }
        continue;
      }
      const department = /^([^\^]*)\^([^\^]*)\^([^\^]*)$/.exec(entry);
      if (!department) { result.other.push(entry); continue; }
      const name = trim(department[1]);
      if (bytes(name).length > 40 || (name && named >= 8)) { result.omitted++; continue; }
      if (name) named++;
      const item = { name, icon: department[2], members: [] };
      for (const raw of department[3].split(',').filter(Boolean)) {
        const member = /^([^=]*)=([^=]*)$/.exec(raw), who = member && trim(member[1]), title = member && trim(member[2]);
        if (!who || bytes(who).length > 48 || bytes(title).length > 48 || seen.has(folded(who)) || people >= 30) { result.omitted++; continue; }
        seen.add(folded(who)); people++; item.members.push({ name: who, title });
      }
      result.departments.push(item);
    }
    return result;
  }
  function mount(root, options = {}) {
    if (!root?.ownerDocument || typeof options.isCurrent !== 'function') throw Error('A current Admin-scoped mount is required.');
    mounted.get(root)?.destroy();
    const document = root.ownerDocument, removers = []; let disposed = false, generation = 0, verified = null, busy = false;
    const current = () => { try { return !disposed && !document.hidden && options.isCurrent() === true; } catch { return false; } };
    if (!current()) throw Error('Current Admin access is required.');
    function node(tag, text, attributes = {}) { const out = document.createElement(tag); if (text !== null) out.textContent = text; for (const [key, value] of Object.entries(attributes)) out.setAttribute(key, value); return out; }
    const panel = node('section', null, { class: 'panel approved-guild-helper196', 'aria-label': 'Author-signed approved guild helper' });
    const input = node('textarea', null, { rows: '7', cols: '1', maxlength: '3000', wrap: 'soft', 'aria-label': 'Author-signed HT1 material', autocomplete: 'off', spellcheck: 'false' });
    const verify = node('button', 'Verify author signature', { type: 'button', class: 'btn small' }), clear = node('button', 'Clear material', { type: 'button', class: 'btn small' });
    const copyBlob = node('button', 'Copy verified HT1 blob', { type: 'button', class: 'btn small' }), copyCommand = node('button', 'Copy /oly approved paste', { type: 'button', class: 'btn small' });
    const actions = node('div', null, { class: 'actions btn-row' }), status = node('p', 'No material verified. Everything stays in this browser.', { role: 'status', 'aria-live': 'polite' });
    const preview = node('div', null, { class: 'preview', 'aria-label': 'Verified signed list preview' });
    actions.append(verify, clear, copyBlob, copyCommand);
    const label = node('label', 'Paste existing author-signed HT1 material', { class: 'field' }); label.append(input);
    panel.append(node('h3', 'Approved guilds · author-signed material'), node('p', 'This helper verifies existing Olympus 1.3.2 author-signed material. It cannot create a signature or change the game.'), label, actions, status, preview,
      node('p', 'The addon must still check its own realm group and whether this timestamp is newer than its held list. Those checks, authority state and in-game application are not known here. /oly approved paste opens a dialog; paste the verified blob into that dialog.'),
      node('p', 'Clear, hide or leave this view to discard the material. Nothing is uploaded or saved. The author public key is pinned to upstream 1.3.2; a newer signed list is not a freshness or current-approval guarantee.'));
    root.replaceChildren(panel);
    const listen = (target, type, fn) => { target.addEventListener(type, fn); removers.push(() => target.removeEventListener(type, fn)); };
    function controls() { verify.disabled = busy || !current(); copyBlob.disabled = copyCommand.disabled = busy || !verified || !current() || input.value !== verified.blob; }
    function invalidate(message = 'Material changed. Verify the exact text again before copying.') { generation++; busy = false; verified = null; preview.replaceChildren(); status.textContent = message; controls(); }
    function clearMaterial() { input.value = ''; invalidate('Material cleared. Nothing was saved or sent.'); }
    function present(value) {
      preview.replaceChildren();
      const lines = [
        'Signed timestamp: ' + value.timestampText + ' · ' + new Date(value.timestamp * 1000).toISOString(),
        'Realm group named by author: ' + (value.realm || '(any realm group)'),
        'Signed public display flag: ' + (value.public ? '1' : '0'),
        'Signed approved guilds · Alliance: ' + (value.guilds.Alliance.join(', ') || '(none named)'),
        'Signed approved guilds · Horde: ' + (value.guilds.Horde.join(', ') || '(none named)'),
      ];
      for (const item of value.departments) lines.push('Department: ' + (item.name || '(unassigned)') + ' · icon reference: ' + (item.icon || '(none)'), ...item.members.map(member => 'Member: ' + member.name + ' · title: ' + (member.title || '(none)')));
      if (value.other.length) lines.push('Other signed extension entries (not interpreted here):', ...value.other);
      if (value.omitted) lines.push('Entries omitted by the bounded preview: ' + value.omitted + '. The exact signed blob remains unchanged; review the raw signed entries below.');
      lines.push('Raw signed entries: ' + value.entries);
      for (const line of lines) preview.append(node('p', line));
    }
    listen(input, 'input', () => { if (!disposed) invalidate(); });
    listen(clear, 'click', () => { if (current()) clearMaterial(); });
    listen(verify, 'click', async () => {
      if (!current() || busy) return;
      invalidate('Checking the pinned author public key locally…'); const attempt = generation, original = input.value; busy = true; controls();
      try {
        const value = parse(original), valid = await verifyBytes(bytes(value.signed), value.signature);
        if (!current() || generation !== attempt || input.value !== original) return;
        if (!valid) throw Error('Author signature did not verify. Nothing can be copied as verified.');
        verified = value; present(value); status.textContent = 'Author signature verified against the pinned upstream public key. Addon realm, held-list time and application remain unchecked.';
      } catch (error) { if (current() && generation === attempt) { verified = null; preview.replaceChildren(); status.textContent = error.message || 'Verification failed. Nothing can be copied as verified.'; } }
      finally { if (!disposed && generation === attempt) { busy = false; controls(); } }
    });
    async function copy(command) {
      if (!current() || busy || !verified || input.value !== verified.blob) { if (!disposed) invalidate('Current verified material and Admin access are required before copying.'); return; }
      const held = verified, attempt = generation;
      try {
        if (!global.navigator?.clipboard?.writeText) throw Error('Clipboard is unavailable.');
        await global.navigator.clipboard.writeText(command ? '/oly approved paste' : held.blob);
        if (current() && generation === attempt && verified === held) status.textContent = command ? 'Command copied. Run it in game, then paste the separately copied verified blob into its dialog.' : 'Exact verified blob copied. The addon has not applied it; use its paste dialog and check its result.';
      } catch { if (current() && generation === attempt && verified === held) status.textContent = 'Clipboard copy was not confirmed. No game action was taken.'; }
    }
    listen(copyBlob, 'click', () => copy(false)); listen(copyCommand, 'click', () => copy(true));
    listen(document, 'visibilitychange', () => { if (document.hidden) clearMaterial(); });
    listen(global, 'pagehide', clearMaterial);
    function destroy() {
      if (disposed) return; generation++; verified = null; busy = false; input.value = ''; preview.replaceChildren(); disposed = true;
      for (const remove of removers.splice(0)) remove();
      input.disabled = verify.disabled = clear.disabled = copyBlob.disabled = copyCommand.disabled = true;
      root.replaceChildren(); if (mounted.get(root)?.destroy === destroy) mounted.delete(root);
    }
    const controller = Object.freeze({ destroy }); mounted.set(root, controller); controls(); return controller;
  }
  global.OlympusApprovedGuildHelper = Object.freeze({ mount });
}(window));
