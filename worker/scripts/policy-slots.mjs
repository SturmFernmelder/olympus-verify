/** Finite policy markup/slot grammar. This parser is intentionally smaller than HTML, and refuses ambiguity. */
export const SLOT_NAMES = Object.freeze(["ACCOUNT_CONTROLS", "BNET_LOGIN"]);
export const CANONICAL = "https://olympus.roachcouncil.com";
export const FALLBACK_CONTROLS = '<section class="data-controls"><h2>Privacy and account data</h2><p><a href="https://olympus.roachcouncil.com/privacy/account">Account data controls</a> · <a href="https://olympus.roachcouncil.com/privacy/signin">Identify-only sign-in availability</a> · <a href="https://olympus.roachcouncil.com/privacy/contact">Contact the privacy inbox</a></p></section>';
const VOID = new Set(["meta", "link", "img", "br", "input"]);
const TAGS = new Set(["html", "head", "body", "meta", "title", "style", "link", "main", "header", "nav", "section", "h1", "h2", "h3", "p", "a", "strong", "em", "b", "code", "ul", "ol", "li", "img", "br", "span"]);
const ATTRS = new Set(["lang", "charset", "name", "content", "class", "id", "tabindex", "aria-label", "aria-current", "href", "src", "alt", "width", "height", "rel", "style"]);
const LINKS = new Set(["./privacy.html", "./terms.html", "/", "/privacy", "/terms", "#policy-content", ...["account", "signin", "contact"].map(x => `${CANONICAL}/privacy/${x}`)]);
const RESOURCES = new Set(["/static/policies.css", "/static/olympus-icon.png"]);

export function slots(source) {
  const lines = source.split("\n"), pairs = [], stack = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/olympus[\s:]*slot/i.test(lines[i])) continue;
    const match = /^<!-- olympus:slot (ACCOUNT_CONTROLS|BNET_LOGIN) (start|end) -->$/.exec(lines[i]);
    if (!match) throw Error("malformed_policy_slot");
    if (match[2] === "start") { if (stack.length || pairs.some(p => p.name === match[1])) throw Error("nested_or_duplicate_policy_slot"); stack.push({ name: match[1], start: i }); }
    else { const p = stack.pop(); if (!p || p.name !== match[1]) throw Error("unpaired_policy_slot"); pairs.push({ ...p, end: i }); }
  }
  if (stack.length || pairs.map(p => p.name).join(",") !== SLOT_NAMES.join(",")) throw Error("incomplete_or_reordered_policy_slots");
  // Every slot lives directly inside main, not in title/style/attribute text or a nested tag.
  validateHtml(source, { mirror: true, slotStructural: true });
  return pairs;
}
export function outsideSlots(source) {
  const lines = source.split("\n"); for (const p of slots(source).reverse()) lines.splice(p.start + 1, p.end - p.start - 1, `__${p.name}__`); return lines.join("\n");
}
export function fillSlots(source, values) {
  if (Object.keys(values).sort().join(",") !== [...SLOT_NAMES].sort().join(",")) throw Error("unknown_policy_slot_value");
  const prior = outsideSlots(source), lines = source.split("\n");
  for (const p of slots(source).reverse()) { const text = values[p.name]; if (typeof text !== "string" || text.includes("olympus:slot") || /<\/?\s*(html|head|body|main|title|style|link|meta)\b/i.test(text)) throw Error("invalid_policy_slot_value"); validateHtml(`<html><main>${text}</main></html>`, { mirror: true }); lines.splice(p.start + 1, p.end - p.start - 1, text); }
  const result = lines.join("\n"); if (outsideSlots(result) !== prior) throw Error("outside_slot_mutation"); validateHtml(result, { mirror: true }); return result;
}
export function validateHtml(source, { mirror = false, slotStructural = false } = {}) {
  if (typeof source !== "string" || source.length > 256000 || /\r/.test(source)) throw Error("invalid_policy_html");
  const stack = []; let pos = 0;
  while (pos < source.length) {
    const next = source.indexOf("<", pos); if (next < 0) break; pos = next;
    if (source.startsWith("<!--", pos)) { const end = source.indexOf("-->", pos + 4); if (end < 0) throw Error("unclosed_comment"); const text = source.slice(pos, end + 3); if (text.includes("olympus:slot") && slotStructural && stack.join(",") !== "html,main") throw Error("escaped_policy_slot"); if (text.slice(4, -3).includes("--")) throw Error("invalid_comment"); pos = end + 3; continue; }
    if (/^<!doctype html>/i.test(source.slice(pos))) { if (pos !== 0) throw Error("misplaced_doctype"); pos += 15; continue; }
    const tag = /^<(\/?)\s*([a-z][a-z0-9-]*)([\s\S]*?)>/i.exec(source.slice(pos)); if (!tag) throw Error("malformed_tag");
    const closing = tag[1] === "/", name = tag[2].toLowerCase(), raw = tag[3]; if (!TAGS.has(name)) throw Error("forbidden_tag:" + name);
    if (closing) { if (raw.trim() || VOID.has(name) || stack.pop() !== name) throw Error("mismatched_tag"); pos += tag[0].length; continue; }
    const seen = new Set(); let rest = raw;
    while (rest.trim()) {
      const attr = /^\s+([a-z][a-z0-9-]*)\s*=\s*"([^"<>]*)"/i.exec(rest); if (!attr) throw Error("malformed_attribute"); const k = attr[1].toLowerCase(), v = attr[2];
      if (!ATTRS.has(k) || seen.has(k) || /[\u0000-\u001f]/.test(v)) throw Error("forbidden_or_duplicate_attribute"); seen.add(k);
      if (k === "href" && !(name === "link" ? RESOURCES.has(v) : LINKS.has(v))) throw Error("undeclared_url");
      if (k === "src" && (name !== "img" || v !== "/static/olympus-icon.png")) throw Error("undeclared_resource");
      if (mirror && (name === "link" || name === "img" || k === "src")) throw Error("dependent_mirror");
      if (k === "style" && v !== "margin-top:2.5rem") throw Error("undeclared_inline_style");
      if (k === "rel" && v !== "stylesheet") throw Error("undeclared_link_relation");
      if (name === "meta" && k === "name" && !["viewport", "color-scheme"].includes(v)) throw Error("undeclared_meta");
      rest = rest.slice(attr[0].length);
    }
    if (name === "meta" && seen.has("http-equiv")) throw Error("refresh_forbidden");
    pos += tag[0].length;
    if (!VOID.has(name)) stack.push(name);
    if (name === "style") { const end = source.indexOf("</style>", pos); if (end < 0) throw Error("unclosed_style"); const css = source.slice(pos, end); if (/@import|url\s*\(|expression\s*\(|<|>/i.test(css)) throw Error("dependent_or_unsafe_mirror_css"); pos = end; }
  }
  if (stack.length) throw Error("unclosed_tag");
  return true;
}
