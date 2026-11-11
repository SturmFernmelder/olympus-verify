/** Scheduling information only. No cached role/identity or permission authority. */
const cooldowns = new Map<string, number>();
const MAX_COOLDOWNS = 32;
const BODY_LIMIT = 4096;

function seconds(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim()))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(86400, n) : null;
}

function resetDelay(response: Response): number | null {
  const relative = seconds(response.headers.get('X-RateLimit-Reset-After'));
  // Reset is an epoch, not a duration; don't pass it through the duration cap.
  const raw = response.headers.get('X-RateLimit-Reset');
  const epoch = raw !== null && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
  const absolute = Number.isFinite(epoch) && epoch > Date.now() / 1000 ? Math.min(86400, epoch - Date.now() / 1000) : null;
  return relative === null ? absolute : absolute === null ? relative : Math.max(relative, absolute);
}

async function retryBody(response: Response): Promise<number | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const packet = await reader.read();
      if (packet.done) break;
      size += packet.value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); return null; }
      chunks.push(packet.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === 'object' && !Array.isArray(body) ? seconds((body as {retry_after?: unknown}).retry_after) : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

/** A per-page serial reader also observes earlier cooldowns in this isolate.
 * Other isolates/workloads can still limit Discord; unknowns never become roles. */
export class LaunchRolePacer271 {
  private until: number;
  constructor(private readonly key: string) {
    const at = Date.now() / 1000;
    for (const [key, expires] of cooldowns) if (expires <= at) cooldowns.delete(key);
    this.until = cooldowns.get(key) ?? 0;
  }
  private postpone(delay: number) {
    this.until = Math.max(this.until, Date.now() / 1000 + delay);
    if (!cooldowns.has(this.key) && cooldowns.size >= MAX_COOLDOWNS) cooldowns.delete(cooldowns.keys().next().value!);
    cooldowns.set(this.key, this.until);
  }
  delay(): number {
    this.until = Math.max(this.until, cooldowns.get(this.key) ?? 0);
    return Math.max(1, Math.ceil(this.until - Date.now() / 1000));
  }
  cooling(): boolean { return Math.max(this.until, cooldowns.get(this.key) ?? 0) > Date.now() / 1000; }
  async wait(deadline: number, current: () => void): Promise<boolean> {
    for (;;) {
      current();
      this.until = Math.max(this.until, cooldowns.get(this.key) ?? 0);
      const delay = this.until - Date.now() / 1000;
      if (Date.now() / 1000 >= deadline || delay > 0 && this.until >= deadline) return false;
      if (delay <= 0) return true;
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      // Another invocation may extend the known cooldown while this one waits.
      // Its timer is not permission to dispatch against that newer information.
    }
  }
  success(response: Response): void {
    if (seconds(response.headers.get('X-RateLimit-Remaining')) === 0) {
      // Missing/malformed reset information conservatively waits; it grants nothing.
      this.postpone(resetDelay(response) ?? 1);
    }
  }
  async limited(response: Response): Promise<number> {
    const header = seconds(response.headers.get('Retry-After'));
    const reset = resetDelay(response);
    const body = await retryBody(response);
    this.postpone(Math.max(header ?? 0, reset ?? 0, body ?? 0, header === null && reset === null && body === null ? 60 : 0.001));
    return this.delay();
  }
}
