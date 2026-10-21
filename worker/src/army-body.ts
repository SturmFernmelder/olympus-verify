/** Army publication uses the existing five-second original Native body reader; raw QR frames are never accepted. */
import type { Env } from "./env";
import { apiJson, PAGE_VERSION, rateLimited, sameOrigin } from "./site-core";
import { admittedReadAs, captureCommunitySubject, FENCE_REFUSED, type CommunityContext } from "./community-context";
const CENSUS_LIMITS = Object.freeze({ inputBytes: 8192 });
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
            ))) throw Error("army_timer_held");
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
    if (!slot) throw Error("army_timer_held");
    slot.check();
  }
}

export class PreviewRefusal extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
const refuse = (code: string, status: number): never => { throw new PreviewRefusal(code, status); };

/** Cleanup is detached and catch-handled: native cancellation may never acknowledge.
 * A cancellation reply is not EOF, and no late packet is adopted after terminal.
 */
function abandon(reader: OriginalNativeBodyReader): void {
  void cancelOriginalNativeBodyReader(reader, "army_preview_terminated")
    .then(() => { releaseOriginalNativeBodyReader(reader); })
    .catch(() => undefined);
}

export async function readRaw(request: Request, check: () => void): Promise<string> {
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
