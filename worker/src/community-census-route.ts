/** Ephemeral preview of unsigned observations. No storage, membership inference or provider work. */
import type { Env } from "./env";
import { apiJson, PAGE_VERSION, rateLimited, sameOrigin } from "./site-core";
import { admittedReadAs, captureCommunitySubject, FENCE_REFUSED, type CommunityContext } from "./community-context";
import { CENSUS_LIMITS, validateCensusJson } from "./community-census-validator";
import { originalRecoveryClockMilliseconds } from "./privacy-recovery-original-clock";
import {
  captureOriginalNativeRequestBody, checkOriginalNativeBodyReader,
  checkOriginalNativeHeaders, checkOriginalNativeRequest, readOriginalNativeBodyPacket,
  cancelOriginalNativeBodyReader, releaseOriginalNativeBodyReader,
  type OriginalNativeBodyReader,
} from "./privacy-native-http-intrinsics";

const BODY_MILLISECONDS = 5000;
const RESPONSE_BYTES = 524288;
const HEADER_NAMES = ["Content-Type", "Content-Encoding", "Content-Length", "Origin", "Sec-Fetch-Site", "X-Olympus"] as const;
type TimerSlot = Readonly<{ descriptor: PropertyDescriptor; check: () => void }>;
function captureTimer(key: string): TimerSlot | null {
  const chain: { owner: object; parent: object | null; descriptor: PropertyDescriptor | undefined }[] = [];
  let owner: object | null = globalThis;
  for (let depth = 0; owner && depth < 32; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key), parent: object | null = Object.getPrototypeOf(owner);
    chain.push({ owner, parent, descriptor: descriptor ? Object.freeze({ ...descriptor }) : undefined });
    if (descriptor) {
      if (!Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") return null;
      return Object.freeze({ descriptor: Object.freeze({ ...descriptor }), check: () => {
        for (const slot of chain) {
          const current = Object.getOwnPropertyDescriptor(slot.owner, key);
          if (Object.getPrototypeOf(slot.owner) !== slot.parent || (slot.descriptor === undefined ? current !== undefined :
            !current || ["value", "get", "set", "writable", "enumerable", "configurable"].some(
              field => current[field as keyof PropertyDescriptor] !== slot.descriptor![field as keyof PropertyDescriptor],
            ))) throw Error("census_timer_held");
        }
      } });
    }
    owner = parent;
  }
  return null;
}
// Capture at import without failing the default-OFF route graph on an unsupported
// host layout. Unsupported or subsequently replaced timers refuse before body use.
const timerSlots = [captureTimer("setTimeout"), captureTimer("clearTimeout")];
function checkTimers(): void {
  for (const slot of timerSlots) {
    if (!slot) throw Error("census_timer_held");
    slot.check();
  }
}

class PreviewRefusal extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
const refuse = (code: string, status: number): never => { throw new PreviewRefusal(code, status); };

/** Cleanup is detached and catch-handled: native cancellation may never acknowledge.
 * A cancellation reply is not EOF, and no late packet is adopted after terminal.
 */
function abandon(reader: OriginalNativeBodyReader): void {
  void cancelOriginalNativeBodyReader(reader, "census_preview_terminated")
    .then(() => { releaseOriginalNativeBodyReader(reader); })
    .catch(() => undefined);
}

async function readRaw(request: Request, check: () => void): Promise<string> {
  check();
  const start = originalRecoveryClockMilliseconds(), deadline = start + BODY_MILLISECONDS;
  let last = start, terminal = false, timedOut = false;
  const clock = () => {
    const current = originalRecoveryClockMilliseconds();
    if (current < last || current < start) refuse("body_clock_held", 409);
    last = current;
    if (current >= deadline) refuse("body_timeout", 408);
  };
  checkTimers();
  const reader = captureOriginalNativeRequestBody(request);
  if (!reader) return refuse("invalid_census", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bytes = 0, raw = "", ended = false;
  try {
    clock();
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = Reflect.apply(timerSlots[0]!.descriptor.value, globalThis, [() => {
        if (terminal) return;
        terminal = true;
        timedOut = true;
        // The fixed timer never renews. Even an early timer/clock anomaly refuses.
        try { check(); clock(); reject(new PreviewRefusal("body_clock_held", 409)); }
        catch (error) { reject(error); }
      }, deadline - last]) as ReturnType<typeof setTimeout>;
    });
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    for (;;) {
      check(); checkTimers(); clock(); checkOriginalNativeBodyReader(reader);
      if (terminal) return refuse(timedOut ? "body_timeout" : "invalid_body", 408);
      const packet = await Promise.race([readOriginalNativeBodyPacket(reader), expiry]);
      check(); checkTimers(); clock();
      if (terminal) return refuse(timedOut ? "body_timeout" : "invalid_body", 408);
      checkOriginalNativeBodyReader(reader);
      if (packet.done) {
        try { raw += decoder.decode(); } catch { return refuse("invalid_utf8", 400); }
        ended = true;
        terminal = true;
        releaseOriginalNativeBodyReader(reader);
        return raw;
      }
      if (!packet.value) return refuse("invalid_body", 400);
      bytes += packet.value.byteLength;
      if (bytes > CENSUS_LIMITS.inputBytes) return refuse("body_too_large", 413);
      try { raw += decoder.decode(packet.value, { stream: true }); }
      catch { return refuse("invalid_utf8", 400); }
    }
  } finally {
    terminal = true;
    // Clear via the captured primitive even if a late global replacement is held.
    if (timer !== undefined) Reflect.apply(timerSlots[1]!.descriptor.value, globalThis, [timer]);
    if (!ended) abandon(reader);
  }
}

export async function censusPreview(request: Request, env: Env, ctx: CommunityContext): Promise<Response> {
  try {
    checkOriginalNativeRequest(request);
    checkOriginalNativeHeaders(request.headers);
    if (request.method !== "POST") return apiJson({ error: "method_not_allowed" }, 405, { Allow: "POST" });
    if (!ctx.features.has("census")) return apiJson({ error: "not_found" }, 404);
    if (!ctx.subject) return apiJson({ error: "signed_out" }, 401);
    if (!ctx.capabilities.confirmedGuildData) return apiJson({ error: "guild_unconfirmed" }, 403);
    if (!sameOrigin(request)) return apiJson({ error: "bad_origin" }, 403);
    if (request.headers.get("X-Olympus") !== PAGE_VERSION) return apiJson({ error: "reload" }, 409);
    const url = new URL(request.url);
    if (url.pathname !== "/api/community/census/preview" || url.search) return apiJson({ error: "bad_request" }, 400);
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*(?:utf-8|"utf-8"))?[ \t]*$/i.test(contentType)) {
      return apiJson({ error: "unsupported_content_type" }, 415);
    }
    if (request.headers.get("Content-Encoding") !== null) return apiJson({ error: "unsupported_content_encoding" }, 415);
    const length = request.headers.get("Content-Length");
    if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)))) {
      return apiJson({ error: "invalid_content_length" }, 400);
    }
    if (length !== null && Number(length) > CENSUS_LIMITS.inputBytes) return apiJson({ error: "body_too_large" }, 413);

    const originalSubject = ctx.subject, capture = captureCommunitySubject(originalSubject);
    const originalURL = request.url, originalHeaders = request.headers;
    const headerValues = HEADER_NAMES.map(name => originalHeaders.get(name));
    const check = () => {
      capture.check();
      if (ctx.subject !== originalSubject) throw Error("privacy_community_original_held");
      checkOriginalNativeRequest(request); checkOriginalNativeHeaders(originalHeaders);
      if (request.method !== "POST" || request.url !== originalURL || request.headers !== originalHeaders ||
        HEADER_NAMES.some((name, index) => originalHeaders.get(name) !== headerValues[index])) {
        throw Error("census_original_request_held");
      }
    };
    check();
    const beforeBody = await admittedReadAs(env, capture.subject, "confirmedGuildData", []);
    check();
    if (beforeBody === FENCE_REFUSED) return apiJson({ error: "guild_access_changed" }, 403);
    if (rateLimited("census:preview", 12, 60)) return apiJson({ error: "slow_down" }, 429, { "Retry-After": "60" });

    check();
    const raw = await readRaw(request, check);
    check();
    const receipt = await admittedReadAs(env, capture.subject, "confirmedGuildData", [
      env.DB.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS receipt_now"),
    ]);
    check();
    if (receipt === FENCE_REFUSED) return apiJson({ error: "guild_access_changed" }, 403);
    const rows = receipt.length === 1 ? receipt[0]?.results : undefined;
    const receiptNow = rows?.length === 1 ? (rows[0] as { receipt_now?: unknown }).receipt_now : undefined;
    if (typeof receiptNow !== "number" || !Number.isSafeInteger(receiptNow) || receiptNow < 0 ||
      receiptNow > CENSUS_LIMITS.maximumTimestamp) return apiJson({ error: "receipt_clock_held" }, 503);
    const validation = validateCensusJson(raw, receiptNow);
    if (!validation.ok) return apiJson({ error: "invalid_census" }, 400);
    const dto = Object.freeze({ format: "olympus-census-preview-v1", persisted: false, sourceVerified: false,
      membershipProof: false, receiptNow, snapshot: validation.snapshot, atReceipt: validation.atReceipt });
    if (new TextEncoder().encode(JSON.stringify(dto)).byteLength > RESPONSE_BYTES) {
      return apiJson({ error: "preview_too_large" }, 413);
    }
    check();
    return apiJson(dto);
  } catch (error) {
    // Only known local input/deadline refusals become local JSON. Original custody,
    // native transport and D1 failures remain failures for the enclosing entry;
    // this handler cannot acknowledge an unknown parent operation as settled.
    if (error instanceof PreviewRefusal) return apiJson({ error: error.code }, error.status);
    throw error;
  }
}
