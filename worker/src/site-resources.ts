/** Public publisher headlines for the owner's items3/4/11 (18 Oct2026).
 * The route owns original signed-in site-standing admission before AND after this work.
 * This module has no account, settings, D1, cron or permission writes. Cache only
 * public source data: never a member request, response or authorization result.
 */
export type ResourceFeedId = "blizzard-notes" | "wowhead-forever" | "wowhead-blues";
export interface ResourceHeadline { title: string; url: string; publishedAt: number | null }
export type ResourceFeedFailure = "timeout" | "redirect" | "upstream" | "content_type" | "too_large" | "malformed" | "network";
export interface ResourceFeedResult {
  sourceId: ResourceFeedId;
  publisher: string;
  sourceUrl: string;
  scope: string;
  status: "fresh" | "stale" | "unavailable" | "disabled";
  /** Last successful retrieval, not the time a member navigated here. */
  fetchedAt: number | null;
  /** Actual last retrieval attempt; a failed attempt never replaces fetchedAt. */
  checkedAt: number | null;
  failure: ResourceFeedFailure | null;
  omittedItems: number;
  items: ResourceHeadline[];
}
export interface ResourcePublicFeedRecord {
  version: 1;
  sourceId: ResourceFeedId;
  fetchedAt: number;
  omittedItems: number;
  items: ResourceHeadline[];
}
export interface ResourcePublicCache {
  get(sourceId: ResourceFeedId): Promise<unknown>;
  put(sourceId: ResourceFeedId, value: ResourcePublicFeedRecord): Promise<void>;
}
export interface ResourceUpdateOptions {
  enabled: boolean;
  now?: number;
  fetcher?: typeof fetch;
  cache?: ResourcePublicCache;
}
interface Source {
  id: ResourceFeedId; publisher: string; url: string; feed: string;
  itemHost: string; scope: string; foreverOnly?: true;
}
const SOURCES: readonly Source[] = Object.freeze(([
  { id: "blizzard-notes", publisher: "Blizzard", url: "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-october-15/2360696/1", feed: "https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-updated-october-15/2360696.rss", itemHost: "us.forums.blizzard.com", scope: "Official Forever development-note thread; open the original post for context and corrections." },
  { id: "wowhead-forever", publisher: "Wowhead", url: "https://www.wowhead.com/forever/news", feed: "https://www.wowhead.com/news/rss/all", itemHost: "www.wowhead.com", scope: "Wowhead reporting explicitly categorized Forever in its latest all-WoW feed window.", foreverOnly: true as const },
  { id: "wowhead-blues", publisher: "Wowhead Blue Tracker", url: "https://www.wowhead.com/blue-tracker", feed: "https://www.wowhead.com/blue-tracker?rss", itemHost: "www.wowhead.com", scope: "All-WoW blue tracker, not a Forever-only feed or an independent Blizzard publication." },
] satisfies Source[]).map(source => Object.freeze(source)));
export const RESOURCE_FEED_LIMITS = Object.freeze({ timeoutMs: 8000, bytes: 1024 * 1024, items: 12, title: 240, freshS: 600, staleS: 86400 });
class FeedError extends Error { constructor(readonly code: ResourceFeedFailure) { super(code); } }
interface XmlNode { name: string; children: XmlNode[]; text: string[] }
const localName = (name: string) => name.split(":").at(-1)!.toLowerCase();

/** Only XML's predefined/numeric entities. No declarations, expansion or network resolution. */
function xmlText(raw: string): string {
  return raw.replace(/&([^;\s<&]+);/g, (_all, entity: string) => {
    const basic: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.prototype.hasOwnProperty.call(basic, entity)) return basic[entity];
    if (!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity)) throw new FeedError("malformed");
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isSafeInteger(code) || code < 32 && ![9, 10, 13].includes(code) || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) throw new FeedError("malformed");
    return String.fromCodePoint(code);
  });
}

/** A bounded RSS XML reader. Descriptions are never returned or interpreted as HTML. */
function readXml(xml: string): XmlNode {
  const document: XmlNode = { name: "document", children: [], text: [] }, stack = [document];
  let position = 0, nodes = 0;
  while (position < xml.length) {
    if (xml[position] !== "<") {
      const next = xml.indexOf("<", position), end = next < 0 ? xml.length : next;
      const raw = xml.slice(position, end);
      if (/&(?!(?:[^;\s<&]+);)/.test(raw)) throw new FeedError("malformed");
      stack.at(-1)!.text.push(xmlText(raw)); position = end; continue;
    }
    if (xml.startsWith("<!--", position)) {
      const end = xml.indexOf("-->", position + 4);
      if (end < 0 || xml.slice(position + 4, end).includes("--")) throw new FeedError("malformed");
      position = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", position)) {
      const end = xml.indexOf("]]>", position + 9);
      if (end < 0 || stack.length === 1) throw new FeedError("malformed");
      stack.at(-1)!.text.push(xml.slice(position + 9, end)); position = end + 3; continue;
    }
    if (xml.startsWith("<?xml ", position) && stack.length === 1 && document.children.length === 0 && !document.text.join("").trim()) {
      const end = xml.indexOf("?>", position + 6); if (end < 0) throw new FeedError("malformed");
      position = end + 2; continue;
    }
    if (xml.startsWith("<!", position) || xml.startsWith("<?", position)) throw new FeedError("malformed");
    let end = position + 1, quote = "";
    for (; end < xml.length; end++) {
      const c = xml[end];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      else if (c === "<") throw new FeedError("malformed");
    }
    if (end >= xml.length || quote) throw new FeedError("malformed");
    const tag = xml.slice(position + 1, end), match = /^(\/?)([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)\s*(\/?)$/.exec(tag);
    if (!match) throw new FeedError("malformed");
    const [, closing, name, attributes, selfClosing] = match;
    if (closing) {
      if (attributes.trim() || selfClosing || stack.length < 2 || stack.at(-1)!.name !== name) throw new FeedError("malformed");
      stack.pop();
    } else {
      // Attribute values are ignored but must be ordinary quoted XML values.
      if (attributes.replace(/\s+[A-Za-z_][A-Za-z0-9_.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*')/g, "").trim()) throw new FeedError("malformed");
      if (++nodes > 12000 || stack.length > 32) throw new FeedError("malformed");
      const node = { name, children: [], text: [] };
      stack.at(-1)!.children.push(node);
      if (!selfClosing) stack.push(node);
    }
    position = end + 1;
  }
  if (stack.length !== 1 || document.children.length !== 1 || document.text.join("").replace(/^\ufeff/, "").trim()) throw new FeedError("malformed");
  return document.children[0];
}
const children = (node: XmlNode, name: string) => node.children.filter(child => localName(child.name) === name);
const field = (node: XmlNode, name: string) => children(node, name)[0]?.text.join("").trim() ?? "";
function plainTitle(value: string): string {
  return Array.from(value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, RESOURCE_FEED_LIMITS.title).join("");
}
function itemUrl(raw: string, source: Source): string | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== source.itemHost || url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}
function publishedAt(raw: string, at: number): number | null | false {
  if (!raw) return null;
  if (!/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s|\d{4}-\d{2}-\d{2}T)/.test(raw)) return false;
  const value = Math.floor(Date.parse(raw) / 1000);
  return Number.isSafeInteger(value) && value >= 1072915200 && value <= at + 3600 ? value : false;
}
function headlines(xml: string, source: Source, at: number): { items: ResourceHeadline[]; omittedItems: number } {
  const rss = readXml(xml);
  if (localName(rss.name) !== "rss" || children(rss, "channel").length !== 1) throw new FeedError("malformed");
  const channel = children(rss, "channel")[0], items: ResourceHeadline[] = [], seen = new Set<string>();
  let omittedItems = 0;
  for (const row of children(channel, "item")) {
    if (source.foreverOnly && !children(row, "category").some(category => category.text.join("").trim() === "Forever")) continue;
    const title = plainTitle(field(row, "title")), url = itemUrl(field(row, "link"), source), date = publishedAt(field(row, "pubdate"), at);
    if (!title || !url || date === false) { omittedItems++; continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    if (items.length < RESOURCE_FEED_LIMITS.items) items.push({ title, url, publishedAt: date });
  }
  return { items, omittedItems };
}
function record(value: unknown, source: Source, at: number): ResourcePublicFeedRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as ResourcePublicFeedRecord;
  if (v.version !== 1 || v.sourceId !== source.id || !Number.isSafeInteger(v.fetchedAt) || v.fetchedAt > at || v.fetchedAt < at - RESOURCE_FEED_LIMITS.staleS || !Number.isSafeInteger(v.omittedItems) || v.omittedItems < 0 || !Array.isArray(v.items) || v.items.length > RESOURCE_FEED_LIMITS.items) return null;
  const seen = new Set<string>();
  for (const item of v.items) {
    if (!item || typeof item.title !== "string" || !item.title || plainTitle(item.title) !== item.title || typeof item.url !== "string" || itemUrl(item.url, source) !== item.url || seen.has(item.url) || item.publishedAt !== null && (!Number.isSafeInteger(item.publishedAt) || item.publishedAt < 1072915200 || item.publishedAt > v.fetchedAt + 3600)) return null;
    seen.add(item.url);
  }
  // Explicit public fields only; cache adapters cannot introduce response metadata.
  return { version: 1, sourceId: source.id, fetchedAt: v.fetchedAt, omittedItems: v.omittedItems, items: v.items.map(item => ({ title: item.title, url: item.url, publishedAt: item.publishedAt })) };
}
function cancel(response: Response): void { try { void response.body?.cancel().catch(() => {}); } catch { /* Refusal never waits for a cancellation acknowledgement. */ } }
async function retrieve(source: Source, fetcher: typeof fetch, at: number): Promise<ResourcePublicFeedRecord> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new FeedError("timeout")); }, RESOURCE_FEED_LIMITS.timeoutMs); });
  const work = async () => {
    const response = await fetcher(source.feed, { redirect: "manual", signal: controller.signal, headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (controller.signal.aborted) { cancel(response); throw new FeedError("timeout"); }
    if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== source.feed) { cancel(response); throw new FeedError("redirect"); }
    if (response.status !== 200) { cancel(response); throw new FeedError("upstream"); }
    if (!/^(?:application\/(?:rss\+xml|xml)|text\/xml)(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) { cancel(response); throw new FeedError("content_type"); }
    const length = response.headers.get("Content-Length");
    if (length && /^\d+$/.test(length) && Number(length) > RESOURCE_FEED_LIMITS.bytes) { cancel(response); throw new FeedError("too_large"); }
    if (!response.body) throw new FeedError("malformed");
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    controller.signal.addEventListener("abort", () => { void reader.cancel().catch(() => {}); }, { once: true });
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (controller.signal.aborted) throw new FeedError("timeout");
      if (next.done) break;
      size += next.value.byteLength;
      if (size > RESOURCE_FEED_LIMITS.bytes) { void reader.cancel().catch(() => {}); throw new FeedError("too_large"); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let xml: string;
    try { xml = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes); } catch { throw new FeedError("malformed"); }
    return { version: 1 as const, sourceId: source.id, fetchedAt: at, ...headlines(xml, source, at) };
  };
  try { return await Promise.race([work(), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Optional Cloudflare Cache adapter: fixed keys and public records only. No incoming request is a cache key. */
export function resourcePublicCache(cache: Cache | undefined = typeof caches === "undefined" ? undefined : caches.default): ResourcePublicCache | undefined {
  if (!cache) return undefined;
  const key = (id: ResourceFeedId) => new Request(`https://olympus.roachcouncil.com/__public-publisher-headlines169/${id}`);
  return {
    async get(id) { const response = await cache.match(key(id)); if (!response) return null; try { return await response.json(); } catch { return null; } },
    async put(id, value) { await cache.put(key(id), new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${RESOURCE_FEED_LIMITS.staleS}` } })); },
  };
}

/** Root integrates only behind the unchanged News flag and confirmed-member admission.
 * Disabled is an early return, including zero cache access. A stale public record is
 * retained only for a bounded day and is labelled stale with the actual failure.
 */
export async function loadResourceUpdates(options: ResourceUpdateOptions): Promise<{ enabled: boolean; sources: ResourceFeedResult[] }> {
  const at = options.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(at) || at < 1072915200) throw new Error("invalid resource clock");
  const shaped = (source: Source, status: ResourceFeedResult["status"], saved: ResourcePublicFeedRecord | null, checkedAt: number | null, failure: ResourceFeedFailure | null): ResourceFeedResult => ({ sourceId: source.id, publisher: source.publisher, sourceUrl: source.url, scope: source.scope, status, fetchedAt: saved?.fetchedAt ?? null, checkedAt, failure, omittedItems: saved?.omittedItems ?? 0, items: saved?.items ?? [] });
  if (options.enabled !== true) return { enabled: false, sources: SOURCES.map(source => shaped(source, "disabled", null, null, null)) };
  const cache = options.cache ?? resourcePublicCache();
  const sources = await Promise.all(SOURCES.map(async source => {
    let saved: ResourcePublicFeedRecord | null = null;
    try { saved = record(await cache?.get(source.id), source, at); } catch { /* Public cache failure falls back to the publisher. */ }
    if (saved && saved.fetchedAt > at - RESOURCE_FEED_LIMITS.freshS) return shaped(source, "fresh", saved, saved.fetchedAt, null);
    try {
      const next = await retrieve(source, options.fetcher ?? fetch, at);
      try { await cache?.put(source.id, next); } catch { /* A cache failure does not turn a genuine retrieval into a failure. */ }
      return shaped(source, "fresh", next, at, null);
    } catch (error) {
      return shaped(source, saved ? "stale" : "unavailable", saved, at, error instanceof FeedError ? error.code : "network");
    }
  }));
  return { enabled: true, sources };
}
