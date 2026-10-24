/* Public legal text in the existing app shell. No session, storage or provider mutation. */
(function (global) {
  'use strict';
  const PATHS = Object.freeze({ privacy: '/legal/privacy', terms: '/legal/terms' });
  const TITLES = Object.freeze({ privacy: 'Privacy Policy', terms: 'Terms of Service' });
  const LIMIT = 256000, mounted = new WeakMap();
  const TAGS = new Set(['main', 'nav', 'section', 'h1', 'h2', 'h3', 'p', 'a', 'strong', 'em', 'b', 'code', 'ul', 'ol', 'li', 'br', 'span']);
  const CLASSES = new Set(['meta', 'meta related', 'data-controls', 'policy-contents', 'policy-anchor']);
  const LINKS = new Set(['/legal/privacy', '/legal/terms', '/static/qr-beta-window-data.html', ...['account', 'signin', 'contact', 'access', 'case'].map(name => 'https://olympus.roachcouncil.com/privacy/' + name)]);
  function validKind(kind) { if (!Object.hasOwn(PATHS, kind)) throw new Error('Unknown legal document.'); return kind; }

  /** Validate the finite authored grammar before DOMParser sees any markup. Header resources are never parsed/imported. */
  function validatePolicyText(text, kind) {
    validKind(kind);
    if (typeof text !== 'string' || text.length > LIMIT || /\r|\u0000/.test(text)) throw new Error('Invalid legal document.');
    const marker = '<main id="policy-content" tabindex="-1">';
    if ((text.match(/<main\b/gi) || []).length !== 1 || (text.match(/<\/main\s*>/gi) || []).length !== 1) throw new Error('Ambiguous legal document.');
    const start = text.indexOf(marker), end = text.indexOf('</main>');
    if (start < 0 || end < start) throw new Error('Missing legal text.');
    const fragment = text.slice(start, end + 7), stack = [], ids = new Set(), anchors = [];
    let position = 0;
    while (position < fragment.length) {
      const next = fragment.indexOf('<', position);
      if (next < 0) break;
      position = next;
      if (fragment.startsWith('<!--', position)) {
        const close = fragment.indexOf('-->', position + 4);
        if (close < 0 || !/^<!-- olympus:slot (?:ACCOUNT_CONTROLS|BNET_LOGIN) (?:start|end) -->$/.test(fragment.slice(position, close + 3))) throw new Error('Invalid legal comment.');
        position = close + 3; continue;
      }
      const tag = /^<(\/?)([a-z][a-z0-9-]*)([^<>]*?)>/i.exec(fragment.slice(position));
      if (!tag) throw new Error('Invalid legal markup.');
      const name = tag[2].toLowerCase();
      if (!TAGS.has(name)) throw new Error('Unexpected legal element.');
      if (tag[1]) {
        if (tag[3].trim() || name === 'br' || stack.pop() !== name) throw new Error('Invalid legal nesting.');
      } else {
        if (name === 'main' && stack.length || name !== 'main' && !stack.length) throw new Error('Invalid legal root.');
        const seen = new Set(); let rest = tag[3];
        while (rest.trim()) {
          const attribute = /^\s+([a-z][a-z0-9-]*)="([^"<>]*)"/i.exec(rest);
          if (!attribute) throw new Error('Invalid legal attribute.');
          const key = attribute[1].toLowerCase(), value = attribute[2];
          if (seen.has(key) || /[\u0000-\u001f]/.test(value)) throw new Error('Invalid legal attribute.');
          seen.add(key);
          const allowed = key === 'class' && name !== 'main' && CLASSES.has(value)
            || key === 'id' && (name === 'main' && value === 'policy-content' || name === 'span' && /^policy-section-[1-9][0-9]*$/.test(value))
            || key === 'tabindex' && name === 'main' && value === '-1'
            || key === 'aria-label' && name === 'nav' && value === 'On this page'
            || key === 'href' && name === 'a' && (LINKS.has(value) || /^#policy-section-[1-9][0-9]*$/.test(value));
          if (!allowed) throw new Error('Unexpected legal attribute or link.');
          if (key === 'id') { if (ids.has(value)) throw new Error('Duplicate legal anchor.'); ids.add(value); }
          if (key === 'href' && value.startsWith('#')) anchors.push(value.slice(1));
          rest = rest.slice(attribute[0].length);
        }
        if (name !== 'br') stack.push(name);
      }
      position += tag[0].length;
    }
    if (stack.length || anchors.some(id => !ids.has(id)) || (fragment.match(/<h1>/g) || []).length !== 1
      || !fragment.includes('<h1>' + TITLES[kind] + '</h1>')) throw new Error('Unrecognized legal text.');
    return fragment;
  }

  function mount(root, options = {}) {
    const kind = validKind(options.kind), path = PATHS[kind];
    if (!root || !root.ownerDocument) throw new Error('The legal reader needs its own root.');
    const previous = mounted.get(root); if (previous) previous.destroy();
    const document = root.ownerDocument, controller = new global.AbortController();
    const section = document.createElement('section'), status = document.createElement('p');
    section.className = 'legal-view196'; status.className = 'muted'; status.setAttribute('role', 'status'); status.textContent = 'Opening ' + TITLES[kind] + '…'; section.append(status); root.append(section);
    let disposed = false, reader = null, removeClick = null;
    function live() { try { return !disposed && (!options.isCurrent || options.isCurrent()); } catch { return false; } }
    function destroy() {
      if (disposed) return; disposed = true; controller.abort();
      if (reader) reader.cancel().catch(() => {});
      if (removeClick) removeClick();
      section.remove(); if (mounted.get(root) === instance) mounted.delete(root);
    }
    async function readText(response) {
      const length = response.headers.get('Content-Length');
      if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > LIMIT)) throw new Error('Legal document is too large.');
      if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Legal text is unavailable.');
      reader = response.body.getReader(); const decoder = new global.TextDecoder('utf-8', { fatal: true });
      let size = 0, text = '';
      try {
        while (true) {
          const chunk = await reader.read();
          if (!live()) { destroy(); return null; }
          if (chunk.done) return text + decoder.decode();
          size += chunk.value.byteLength;
          if (size > LIMIT) { await reader.cancel(); throw new Error('Legal document is too large.'); }
          text += decoder.decode(chunk.value, { stream: true });
        }
      } finally { reader.releaseLock(); reader = null; }
    }
    const instance = { destroy, ready: null };
    mounted.set(root, instance);
    instance.ready = (async () => {
      try {
        if (!live()) { destroy(); return; }
        const response = await global.fetch(path, { method: 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal });
        if (!live()) { destroy(); return; }
        if (response.status !== 200 || response.redirected || !/^text\/html(?:;|$)/i.test(response.headers.get('Content-Type') || '')) throw new Error('Legal text is unavailable.');
        const text = await readText(response); if (text === null || !live()) { destroy(); return; }
        const safe = validatePolicyText(text, kind), parsed = new global.DOMParser().parseFromString(safe, 'text/html');
        const source = parsed.querySelector('main#policy-content');
        if (!source || parsed.querySelectorAll('main').length !== 1) throw new Error('Legal text is unavailable.');
        const article = document.createElement('article'); article.className = 'frame gold parchment legal-paper196'; article.setAttribute('aria-label', TITLES[kind]);
        for (const child of source.childNodes) if (child.nodeType !== 8) article.append(document.importNode(child, true));
        const prefix = 'legal196-' + kind + '-';
        for (const node of article.querySelectorAll('[id]')) { node.id = prefix + node.id; node.setAttribute('tabindex', '-1'); }
        for (const link of article.querySelectorAll('a[href]')) {
          const href = link.getAttribute('href');
          if (href.startsWith('#')) link.setAttribute('href', '#' + prefix + href.slice(1));
        }
        const navigate = event => {
          if (!live()) return;
          let link = event.target;
          while (link && link !== article && link.tagName !== 'A') link = link.parentNode;
          const href = link && link.tagName === 'A' && link.getAttribute('href');
          if (typeof href !== 'string' || !href.startsWith('#' + prefix)) return;
          event.preventDefault(); const target = article.querySelector(href);
          if (target) { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
        };
        article.addEventListener('click', navigate); removeClick = () => article.removeEventListener('click', navigate);
        if (!live()) { destroy(); return; }
        section.replaceChildren(article);
      } catch (error) {
        controller.abort();
        if (live()) status.textContent = 'This legal document could not be opened. Try this page again.';
        else destroy();
      }
    })();
    return Object.freeze(instance);
  }
  global.OlympusLegalView = Object.freeze({ mount, validatePolicyText });
})(typeof window === 'object' ? window : globalThis);
