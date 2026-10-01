/** Minimal Discord REST + interactions helpers (no SDK; WebCrypto for Ed25519). */
import type { Env } from "./env";
import { staffChannel } from "./env";
import { audit } from "./db";

export const API = "https://discord.com/api/v10";

/**
 * Build .49: fetch for every call that carries a credential (a bot token, a client secret, a member's access token).
 * Never follows a redirect, so a 3xx from an upstream can never send the credential to a third host (the caller sees
 * the 3xx as a failed response); gives up after eight seconds instead of holding the invocation open. Same rules as
 * Olympus Forever's discordFetch.
 */
export const CREDENTIAL_FETCH_TIMEOUT_MS = 8000;
export function credentialFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, redirect: "manual", signal: withDeadline(init.signal ?? undefined) });
}

/**
 * .51: the eight-second deadline holds whether or not the caller passed a signal of its own (Codex's review of .49:
 * `init.signal ?? timeout` let a caller's signal replace the deadline). Both abort the request; `AbortSignal.any` is in
 * workerd and Node 20+, and a runtime without it gets the deadline alone rather than an open-ended call.
 */
export function withDeadline(signal: AbortSignal | null | undefined, ms = CREDENTIAL_FETCH_TIMEOUT_MS): AbortSignal {
  const deadline = AbortSignal.timeout(ms);
  if (!signal) return deadline;
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof any === "function" ? any([signal, deadline]) : deadline;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Build .47: a signed request whose timestamp is further than this from now is refused even with a good signature, so a
 * captured request cannot be replayed later (Discord signs timestamp + body; the window is the one Forever used).
 */
export const INTERACTION_MAX_SKEW_S = 300;
/** Real interaction payloads are a few KB; anything far larger is refused before any parsing or crypto (index.ts). */
export const MAX_INTERACTION_BYTES = 128 * 1024;

/** Verify X-Signature-Ed25519 over timestamp + raw body, and that the timestamp is within INTERACTION_MAX_SKEW_S of now. */
export async function verifyInteraction(env: Env, request: Request, body: string, nowMs = Date.now()): Promise<boolean> {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !/^\d{1,12}$/.test(ts)) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > INTERACTION_MAX_SKEW_S) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

/**
 * The request body as text, or null once it exceeds `max` bytes, by Content-Length or as it streams in: nothing over the
 * cap is buffered further or decoded, and the stream is cancelled.
 */
export async function readInteractionBody(request: Request, max = MAX_INTERACTION_BYTES): Promise<string | null> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class DiscordError extends Error {
  constructor(public status: number, public body: string) {
    super(`Discord ${status}: ${body}`);
  }
}

/**
 * Say what a Discord failure actually means. 401 and 403 read alike in a log line and need opposite fixes: 401 is the
 * bot's TOKEN (a Worker secret), 403 is the bot's PERMISSIONS (Discord settings). Blaming permissions for a 401 sends
 * whoever reads it off to change settings that cannot possibly help — which is exactly what happened on 26 Sep.
 */
export function explainDiscordError(e: unknown): string {
  if (!(e instanceof DiscordError)) return String(e).slice(0, 200);
  let code = 0;
  try {
    code = (JSON.parse(e.body) as { code?: number }).code ?? 0;
  } catch {
    /* body was not JSON */
  }
  switch (e.status) {
    case 401:
      return "Discord rejected the bot's token (401). The DISCORD_BOT_TOKEN secret in the Worker is stale \u2014 usually because the token was reset in the Developer Portal. Fix: `npx wrangler secret put DISCORD_BOT_TOKEN`. Permissions have nothing to do with it.";
    case 403:
      if (code === 50001) return "the bot cannot see that channel (403 Missing Access) \u2014 its role needs View Channel there";
      if (code === 50013) return "the bot lacks a permission it needs there, or the member/role sits above the bot's role (403 Missing Permissions)";
      return `Discord refused the bot (403, code ${code})`;
    case 404:
      if (code === 10011) return "that role no longer exists (404 Unknown Role)";
      if (code === 10003) return "that channel no longer exists (404 Unknown Channel)";
      if (code === 10008) return "that message no longer exists (404 Unknown Message)";
      if (code === 10007) return "that member is no longer in the server (404 Unknown Member)";
      return `Discord could not find it (404, code ${code})`;
    case 429:
      return "rate-limited by Discord (429) \u2014 try again in a moment";
    default:
      return `Discord ${e.status}: ${e.body.slice(0, 160)}`;
  }
}

/**
 * .95 (P-20, Codex's review of .90, 1 Oct 08:15 UTC): a run's bound on the ACTUAL requests made to Discord through the
 * role writer (roles.ts `CallBudget` carries it; the free plan counts requests, not calls). The 429 retry in rest() is a
 * request too: it is counted here and refused when the run cannot afford it, unless the call is a mandatory removal
 * (never skipped, counted whatever is left; its caller reserved it).
 */
export interface AttemptBudget {
  limit: number;
  attempts: number;
  retries: number;
}

/** Bot-token REST call. Retries once on 429 using retry_after (within `budget`, when the caller gives one). */
/**
 * `reason` goes to Discord's audit log. It travels in the X-Audit-Log-Reason header, the documented way; until 27 Sep
 * it was appended to the URL as ?reason=, which the role endpoints ignore, so role grants and removals showed up in
 * the audit log with no reason at all.
 */
export async function rest<T = unknown>(env: Env, method: string, path: string, body?: unknown, attempt = 0, reason?: string, budget?: AttemptBudget, mandatory = false): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "olympus-verify (https://github.com/olympus, 0.1)",
  };
  if (reason) headers["X-Audit-Log-Reason"] = auditReason(reason);
  const res = await credentialFetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429 && attempt < 1) {
    const text = await res.text();
    if (budget) {
      if (budget.attempts >= budget.limit && !mandatory) throw new DiscordError(429, text); // .95: no retry the run cannot afford; the caller records the failure and a later run retries
      budget.attempts++;
      budget.retries++;
    }
    let j: { retry_after?: number } = {};
    try {
      j = JSON.parse(text) as { retry_after?: number };
    } catch {
      /* no usable body: wait a second */
    }
    await new Promise((r) => setTimeout(r, Math.ceil(((j.retry_after ?? 1) as number) * 1000)));
    return rest<T>(env, method, path, body, attempt + 1, reason, budget, mandatory);
  }
  if (!res.ok) throw new DiscordError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Header values must be ASCII-safe; Discord expects the reason URL-encoded and caps it at 512 characters. Cut on a
 *  whole character, never inside a %XX escape. */
export function auditReason(reason: string): string {
  let out = "";
  for (const ch of reason) {
    const enc = encodeURIComponent(ch);
    if (out.length + enc.length > 512) break;
    out += enc;
  }
  return out;
}

export const addRole = (env: Env, userId: string, roleId: string, reason: string, budget?: AttemptBudget) =>
  rest(env, "PUT", `/guilds/${env.GUILD_ID}/members/${userId}/roles/${roleId}`, undefined, 0, reason, budget);

/** `mandatory` (.95): a removal the run owes (after a ban, or while a restriction is held): its retry is counted, never refused. */
export const removeRole = (env: Env, userId: string, roleId: string, reason: string, budget?: AttemptBudget, mandatory = false) =>
  rest(env, "DELETE", `/guilds/${env.GUILD_ID}/members/${userId}/roles/${roleId}`, undefined, 0, reason, budget, mandatory);

/** A guild member, or null when they are not in the server (404). Used to read someone's current roles. */
export async function guildMember(env: Env, userId: string, budget?: AttemptBudget): Promise<{ roles: string[]; nick?: string | null; user?: { id: string; username: string } } | null> {
  try {
    return await rest(env, "GET", `/guilds/${env.GUILD_ID}/members/${userId}`, undefined, 0, undefined, budget);
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) return null;
    throw e;
  }
}

/** Ban a member. Requires the bot role to hold Ban Members and to outrank the target. delete_message_seconds = 0. */
export const banMember = (env: Env, userId: string, reason: string) =>
  rest(env, "PUT", `/guilds/${env.GUILD_ID}/bans/${userId}`, { delete_message_seconds: 0 }, 0, reason);

export const setNickname = (env: Env, userId: string, nick: string) =>
  rest(env, "PATCH", `/guilds/${env.GUILD_ID}/members/${userId}`, { nick });

export const postMessage = (env: Env, channelId: string, payload: unknown) =>
  rest<{ id: string }>(env, "POST", `/channels/${channelId}/messages`, payload);

export const editMessage = (env: Env, channelId: string, messageId: string, payload: unknown) =>
  rest(env, "PATCH", `/channels/${channelId}/messages/${messageId}`, payload);

// There is deliberately no DM function here any more. See dm.ts: notices go to a channel, never to a DM.

/**
 * Post to the staff channel, and never let a failure there propagate.
 *
 * Everything sent to that channel is a notification — a rank mismatch, a full guild, a ban card. On 18 September an
 * unguarded one of these took roster ingest down completely: the bot had no access to #mod-alerts, postMessage threw
 * `Discord 403 Missing Access`, and because that throw happened *after* the snapshot row was inserted, every retry
 * was then told its export was "older than the last snapshot". Roles stopped being granted for forty minutes because
 * a status message could not be delivered. A notice nobody can read is a nuisance; a notice that stops the pipeline
 * is an outage.
 */
export async function staffNotice(env: Env, payload: unknown, kind: string): Promise<boolean> {
  const channel = staffChannel(env);
  if (!channel) return false;
  try {
    await postMessage(env, channel, payload);
    return true;
  } catch (e) {
    await audit(env, "system", "staff_notice.failed", kind, { channel, error: String(e).slice(0, 200) });
    // The server log is a different channel, so this usually still lands somewhere a human will see it.
    await logLine(env, `\u26a0\ufe0f could not post the ${kind} notice to <#${channel}> \u2014 ${explainDiscordError(e)}`);
    return false;
  }
}

export async function logLine(env: Env, text: string) {
  if (!env.CHANNEL_SERVER_LOG) return;
  try {
    await postMessage(env, env.CHANNEL_SERVER_LOG, { content: text.slice(0, 1900), allowed_mentions: { parse: [] } });
  } catch {
    /* logging must never break the flow */
  }
}

// ---- interaction payload helpers ----
export const EPHEMERAL = 64;

export const reply = (content: string, extra: Record<string, unknown> = {}) =>
  json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });

export const replyPublic = (data: Record<string, unknown>) => json({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });

export const updateMessage = (data: Record<string, unknown>) => json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });

export const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export interface Interaction {
  type: number;
  id: string;
  application_id?: string; // the application Discord signed this for; index.ts refuses another application's payload
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user: { id: string; username: string; global_name?: string | null }; roles: string[]; nick?: string | null };
  user?: { id: string; username: string; global_name?: string | null };
  data?: {
    name?: string;
    type?: number; // application command type: 1 = slash, 2 = user context menu, 3 = message context menu
    target_id?: string; // user id for a user context-menu command
    custom_id?: string;
    component_type?: number;
    options?: Array<{ name: string; type: number; value?: string | number | boolean; focused?: boolean; options?: any[] }>;
    components?: Array<{ type: number; components?: Array<{ type: number; custom_id?: string; value?: string }> }>; // modal submit
  };
  message?: { id: string; channel_id: string };
}

export const userOf = (i: Interaction) => i.member?.user ?? i.user!;

export const hasAnyRole = (i: Interaction, roleIds: string[]) => (i.member?.roles ?? []).some((r) => roleIds.includes(r));

export function option<T = string>(i: Interaction, name: string): T | undefined {
  const opts = i.data?.options ?? [];
  for (const o of opts) {
    if (o.name === name) return o.value as T;
    if (o.options) for (const s of o.options) if (s.name === name) return s.value as T;
  }
  return undefined;
}

export const subcommand = (i: Interaction) => i.data?.options?.find((o) => o.type === 1)?.name;

/** The option Discord is asking us to complete (interaction type 4), looking one level into a subcommand. */
export function focusedOption(i: Interaction): { name: string; value: string } | undefined {
  for (const o of i.data?.options ?? []) {
    if (o.focused) return { name: o.name, value: String(o.value ?? "") };
    for (const s of o.options ?? []) if (s.focused) return { name: s.name, value: String(s.value ?? "") };
  }
  return undefined;
}

/** Interaction response type 8: up to 25 autocomplete choices. */
export const autocomplete = (choices: Array<{ name: string; value: string }>) =>
  json({ type: 8, data: { choices: choices.slice(0, 25) } });

/** Value of a text input in a modal submit (interaction type 5). */
export function modalField(i: Interaction, customId: string): string | undefined {
  for (const row of i.data?.components ?? []) for (const c of row.components ?? []) if (c.custom_id === customId) return c.value;
  return undefined;
}

/**
 * The one answer a command gets when its handler threw: no detail (a message can carry codes), and a way forward.
 * .51: moved here from index.ts. workerd refuses a module entry that exports anything but functions and the handler
 * ("Incorrect type for map entry 'INTERACTION_FAILED'": Codex's review of .49 on the real runtime, 1 Oct 00:23 UTC);
 * the CJS suites could not see that, so tests/bundle_runtime_test.cjs now loads the real bundle in workerd.
 */
export const INTERACTION_FAILED = "Something went wrong on our side and the command did not finish. Please run it again in a moment; if it keeps failing, tell an officer.";
