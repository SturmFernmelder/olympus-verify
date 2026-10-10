import type { Env } from "./env";
import { b64u, sign, verify } from "./site-core";
import { escapeText } from "./policy-render";

export const FORM_COOKIE = "__Host-olg_privacy_form";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export type FormPurpose = "contact-create" | "case-read" | "case-reply" | "copy-export" | "site-erase" | "full-erase" | "bnet-unlink" | "privacy-signin" | "erasure-status";
const PURPOSES: readonly string[] = ["contact-create", "case-read", "case-reply", "copy-export", "site-erase", "full-erase", "bnet-unlink", "privacy-signin", "erasure-status"];
export class FormError extends Error { constructor(public readonly code: string, public readonly status = 400) { super(code); } }
export const randomCode = (n = 32): string => b64u(crypto.getRandomValues(new Uint8Array(n)));
export function formCookie(nonce: string): string { return `${FORM_COOKIE}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`; }
export function formNonce(request: Request): string | null {
  const hits = (request.headers.get("Cookie") ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(FORM_COOKIE + "="));
  if (hits.length !== 1) return null;
  const value = hits[0]!.slice(FORM_COOKIE.length + 1); return TOKEN.test(value) ? value : null;
}
export async function formToken(env: Env, nonce: string, purpose: FormPurpose, binding = ""): Promise<string> {
  // Snapshot primitives before the cryptographic await. The token carries no case code or account id.
  const n = String(nonce), p = String(purpose), b = String(binding), expiry = Math.floor(Date.now() / 1000) + 3600;
  if (!env.COOKIE_SECRET || !TOKEN.test(n) || !PURPOSES.includes(p)) throw new FormError("form_unavailable", 503);
  const payload = `${expiry}.${randomCode(16)}`;
  return `${payload}.${await sign(env.COOKIE_SECRET, "privacy-form", JSON.stringify([payload, n, p, b]))}`;
}
export async function requireFormToken(env: Env, request: Request, token: string, purpose: FormPurpose, binding = ""): Promise<void> {
  const n = formNonce(request), t = String(token), p = String(purpose), b = String(binding);
  const parts = /^(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(t);
  if (!n || !parts || !PURPOSES.includes(p) || !env.COOKIE_SECRET) throw new FormError("form_expired", 403);
  const expiry = Number(parts[1]), at = Math.floor(Date.now() / 1000);
  if (expiry <= at || expiry > at + 3600) throw new FormError("form_expired", 403);
  if (!await verify(env.COOKIE_SECRET, "privacy-form", JSON.stringify([`${parts[1]}.${parts[2]}`, n, p, b]), parts[3]!)) throw new FormError("form_expired", 403);
}
export function requireFormOrigin(request: Request): void {
  const origin = request.headers.get("Origin"), site = request.headers.get("Sec-Fetch-Site");
  if (origin !== null ? origin !== new URL(request.url).origin : site !== "same-origin") throw new FormError("bad_origin", 403);
}
/** Finite form parser. URLSearchParams alone accepts malformed percent escapes and duplicate fields. */
export async function readForm(request: Request, allowed: readonly string[]): Promise<Readonly<Record<string, string>>> {
  requireFormOrigin(request);
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) throw new FormError("unsupported_media_type", 415);
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192)) throw new FormError("body_too_large", 413);
  const reader = request.body?.getReader(); if (!reader) throw new FormError("invalid_form");
  const chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FormError("body_timeout", 408)), 5000); });
  try {
    for (;;) { const item = await Promise.race([reader.read(), timeout]); if (item.done) break; total += item.value.byteLength; if (total > 8192) throw new FormError("body_too_large", 413); chunks.push(item.value); }
  } finally { if (timer !== undefined) clearTimeout(timer); void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* A timed-out pending read is cancelled; its lock is released when cancellation settles. */ } }
  const bytes = new Uint8Array(total); let pos = 0; for (const c of chunks) { bytes.set(c, pos); pos += c.length; }
  let raw: string; try { raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes); } catch { throw new FormError("invalid_form"); }
  const fields = Object.create(null) as Record<string, string>;
  const parts = raw.split("&"); if (parts.length > 12) throw new FormError("invalid_form");
  for (const part of parts) {
    const eq = part.indexOf("="); if (eq <= 0) throw new FormError("invalid_form");
    let key: string, value: string;
    try { key = decodeURIComponent(part.slice(0, eq).replace(/\+/g, " ")); value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " ")); } catch { throw new FormError("invalid_form"); }
    if (!allowed.includes(key) || Object.prototype.hasOwnProperty.call(fields, key) || value.length > 2200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufeff]|\p{Cs}/u.test(value)) throw new FormError("invalid_form");
    fields[key] = value.replace(/\r\n/g, "\n"); if (fields[key]!.includes("\r")) throw new FormError("invalid_form");
  }
  return Object.freeze(fields);
}
export function field(form: Readonly<Record<string, string>>, name: string, max: number, required = true, singleLine = false): string {
  const v = form[name] ?? "";
  if (v.length > max || (required && !v.trim()) || (singleLine && /[\r\n\t]/.test(v))) throw new FormError("invalid_form");
  return v;
}
export const hidden = (name: string, value: string) => `<input type="hidden" name="${escapeText(name)}" value="${escapeText(value)}">`;
