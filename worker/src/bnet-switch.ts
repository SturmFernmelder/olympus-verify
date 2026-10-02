/**
 * .114 (2 Oct 2026, Viktor's item 6): the Battle.net sign-in switch.
 *
 * Until .113 the Linked Role and Battle.net flow (oauth.ts) was on whenever the two Blizzard secrets were present, which
 * they are: anyone with the direct link could start it, although nothing offers it any more (the guide button went in
 * .32) and Blizzard has published no World of Warcraft: Forever API that would make a Battle.net login prove anything
 * about a character. Viktor asked for the login to stay built but switched off from the admin settings, so it can be
 * switched on once there is a reason. It is on only when all three hold:
 *   configured   both BNET_CLIENT_ID and BNET_CLIENT_SECRET are present;
 *   policyReady  the privacy policy describes the login again: policies/privacy.html carries the marker comment
 *                <!-- olympus:bnet-login-section --> on its Battle.net section, which scripts/build-policy-content.mjs
 *                turns into PRIVACY_DESCRIBES_BNET_LOGIN at build time (the .114 policy has no such section, so the login
 *                cannot be switched on in .114 at all: the switch can never get ahead of the policy);
 *   adminOn      the site_settings row `bnetLogin` is "1", written only by a SITE_ADMINS save (setBnetSwitch).
 * Reading fails closed: a missing row, any other value or a database error is off.
 *
 * Off means nothing new is collected: the three routes refuse before an audit row, a cookie, a redirect or a token
 * exchange, and bindBattletag reads the switch again just before it stores anything, so a switch turned off in the middle
 * of someone's sign-in stores nothing and pushes nothing to Discord. The 29-day purge of what earlier links stored
 * (bnet-retention.ts, from the cron) runs whatever the switch says (Codex, log 17:42 UTC: the retention controls stay
 * effective for pre-existing data). The setting lives outside SiteSettings on purpose: GET /api/public returns
 * SiteSettings to anyone, and this switch is staff state.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { PRIVACY_DESCRIBES_BNET_LOGIN } from "./policy-content";

export const BNET_SWITCH_KEY = "bnetLogin";

export interface BnetLoginState {
  configured: boolean;
  policyReady: boolean;
  adminOn: boolean;
  /** on: configured, policyReady and adminOn */
  effective: boolean;
  changedAt: number | null;
  changedBy: string | null;
}

export const bnetConfigured = (env: Env): boolean => !!(env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET);

/** Tests only: the build-time policy marker, overridden (null restores the build's value). */
let policyReadyOverride: boolean | null = null;
export const setPolicyReadyForTests = (v: boolean | null) => {
  policyReadyOverride = v;
};
const policyReady = () => (policyReadyOverride === null ? PRIVACY_DESCRIBES_BNET_LOGIN : policyReadyOverride);

export async function bnetLoginState(env: Env): Promise<BnetLoginState> {
  const configured = bnetConfigured(env);
  const ready = policyReady();
  let adminOn = false;
  let changedAt: number | null = null;
  let changedBy: string | null = null;
  try {
    const row = await env.DB.prepare("SELECT value, updated_at, updated_by FROM site_settings WHERE key = ?1")
      .bind(BNET_SWITCH_KEY)
      .first<{ value: string; updated_at: number; updated_by: string | null }>();
    adminOn = row?.value === "1";
    changedAt = row?.updated_at ?? null;
    changedBy = row?.updated_by ?? null;
  } catch {
    adminOn = false; // fail closed: an unreadable switch is off
  }
  return { configured, policyReady: ready, adminOn, effective: configured && ready && adminOn, changedAt, changedBy };
}

export async function bnetLoginOn(env: Env): Promise<boolean> {
  return (await bnetLoginState(env)).effective;
}

export type SwitchResult = { ok: true; state: BnetLoginState } | { ok: false; error: "not_configured" | "policy_not_ready"; message: string };

/** A SITE_ADMINS save (site-admin.ts checks the caller). Switching on is refused until the secrets and the policy are ready. */
export async function setBnetSwitch(env: Env, actor: string, on: boolean): Promise<SwitchResult> {
  const st = await bnetLoginState(env);
  if (on && !st.configured) return { ok: false, error: "not_configured", message: "The Worker has no Battle.net client credentials, so Battle.net sign-in cannot be switched on." };
  if (on && !st.policyReady) {
    return { ok: false, error: "policy_not_ready", message: "The privacy policy does not describe Battle.net sign-in yet. A reviewed release has to add that section before the switch can be turned on." };
  }
  await env.DB.prepare(
    "INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3, updated_by = ?4",
  )
    .bind(BNET_SWITCH_KEY, on ? "1" : "0", now(), actor)
    .run();
  await audit(env, actor, "bnet.switch", undefined, { on });
  return { ok: true, state: await bnetLoginState(env) };
}

/**
 * What every Battle.net route answers while the switch is off. No audit row, no cookie (except clearing one), no redirect.
 * The wording holds wherever it is shown (Codex, log 18:47 UTC): at the start nothing happened at all, and at the bind
 * Blizzard's sign-in may already have happened, but nothing from it was stored.
 */
export function bnetSwitchedOffPage(extraHeaders: Record<string, string> = {}): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Olympus — Battle.net linking is switched off</title>
<style>:root{color-scheme:dark}body{font:16px/1.5 system-ui,sans-serif;background:#1e1f22;color:#e3e5e8;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem}h1{color:#c9a227}</style>
<main><h1>Battle.net linking is switched off</h1><p>Olympus does not use Battle.net sign-in at the moment, so this link was not finished and nothing from it was stored. Verification does not need it: press <b>Get my code</b> in the pinned guide in #join-olympus.</p></main>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extraHeaders } });
}
