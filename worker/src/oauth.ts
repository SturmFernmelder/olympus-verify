/**
 * Discord Linked Role flow (Phase 1).
 *   GET /linked-role      -> redirect to Discord OAuth2 (identify role_connections.write)
 *   GET /oauth/callback   -> identify the Discord user, then hand off to Battle.net's own login
 *   GET /bnet/link        -> Battle.net login callback (openid): Blizzard proves the BattleTag, we store it and push
 *                            the Discord role-connection metadata. Requires BNET_CLIENT_ID and BNET_CLIENT_SECRET.
 *
 * Discord's `connections` scope is no longer usable for this: newly created Battle.net connections stopped being
 * returned by GET /users/@me/connections in August 2026, and from 22 September 2026 existing ones stopped too, with
 * no replacement (Discord developer changelog, 14 Aug 2026). The connections round trip was removed on 18 Sep 2026 —
 * asking for a scope we cannot use only added a permission to the consent screen and a way for the flow to dead-end.
 * The role's requirement in Server Settings -> Roles -> Links is the app metadata `battlenet_linked = 1`.
 *
 * .114 (2 Oct 2026): every route here, and the bind itself, answers only while the Battle.net switch is on
 * (bnet-switch.ts: the secrets, a policy that describes the login, and the site admin's setting); otherwise a short
 * "switched off" page, with nothing collected or exchanged.
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { API, credentialFetch } from "./discord";
import { purgeBattleNetData } from "./bnet-retention";
import { BNET_SWITCH_KEY, bnetLoginOn, bnetSwitchedOffPage } from "./bnet-switch";

const SCOPES = "identify role_connections.write";

async function hmacHex(secret: string, data: string): Promise<string> {
  if (!secret) throw new Error("COOKIE_SECRET is not set — run: npx wrangler secret put COOKIE_SECRET");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function startLinkedRole(env: Env): Promise<Response> {
  // .114: while the Battle.net switch is off (bnet-switch.ts) nothing starts: no audit row, no state cookie, no redirect to Discord.
  if (!(await bnetLoginOn(env))) return bnetSwitchedOffPage();
  // The one row that makes this funnel measurable.
  //
  // Every other step is already audited, but the first audit point used to be link.bnet_login_started, which is
  // written AFTER Discord has handed the person back. So when Discord refuses its own authorization screen -- the
  // state this app has been in since the 18 September flag -- nobody arrives, nothing is logged, and the table goes
  // quiet rather than showing errors. On 19 September that cost about three hours of inferring an outage from an
  // absence. With this row, link.started vs link.bnet_login_started IS the Discord pass rate, in the same rollup.
  //
  // Cost: one write per click. The launch burst peaked near 400 in an hour, so this stays far inside D1's daily
  // allowance even on the worst day this app has had.
  await audit(env, "system", "link.started");
  const state = crypto.randomUUID().replace(/-/g, "");
  const mac = await hmacHex(env.COOKIE_SECRET, state);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_APP_ID);
  url.searchParams.set("redirect_uri", `${env.PUBLIC_BASE_URL}/oauth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": `olv_state=${state}.${mac}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export async function linkedRoleCallback(env: Env, request: Request): Promise<Response> {
  // .114: switched off: refused before the Discord token exchange; the state cookie is cleared.
  if (!(await bnetLoginOn(env))) return bnetSwitchedOffPage({ "Set-Cookie": "olv_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" });
  const u = new URL(request.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state") ?? "";
  const cookie = (request.headers.get("Cookie") ?? "").split(/;\s*/).find((c) => c.startsWith("olv_state="))?.slice("olv_state=".length) ?? "";
  const [cState, cMac] = cookie.split(".");
  if (!code || !state || cState !== state || cMac !== (await hmacHex(env.COOKIE_SECRET, state))) return page("Link expired", "That link was already used or timed out. Start again from Discord.", 400);

  const tokenRes = await credentialFetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${env.PUBLIC_BASE_URL}/oauth/callback`,
    }),
  });
  if (!tokenRes.ok) return page("Discord said no", `Token exchange failed (${tokenRes.status}). Try again.`, 502);
  const token = (await tokenRes.json()) as { access_token: string };
  const auth = { Authorization: `Bearer ${token.access_token}` };

  const meRes = await credentialFetch(`${API}/users/@me`, { headers: auth });
  if (!meRes.ok) return page("Discord said no", `Discord would not tell us who you are (${meRes.status}). Try the link again.`, 502);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };

  if (!env.BNET_CLIENT_ID || !env.BNET_CLIENT_SECRET) {
    await audit(env, me.id, "link.bnet_not_configured");
    return page(
      "Not available yet",
      "Battle.net linking is not configured on this server. Tell an officer — the bot needs BNET_CLIENT_ID and BNET_CLIENT_SECRET.",
      503,
    );
  }

  // Straight to Blizzard: they are the only party that will still tell us a BattleTag.
  const bstate = crypto.randomUUID().replace(/-/g, "");
  const sealed = await seal(env.COOKIE_SECRET, { d: me.id, n: me.global_name ?? me.username, t: token.access_token, s: bstate, exp: now() + 600 });
  const bnetUrl = new URL(`${BNET_OAUTH}/authorize`);
  bnetUrl.searchParams.set("client_id", env.BNET_CLIENT_ID);
  bnetUrl.searchParams.set("scope", "openid");
  bnetUrl.searchParams.set("redirect_uri", `${env.PUBLIC_BASE_URL}/bnet/link`);
  bnetUrl.searchParams.set("response_type", "code");
  bnetUrl.searchParams.set("state", bstate);
  await audit(env, me.id, "link.bnet_login_started");
  // Deliberately an interstitial and not a 302. Taking a fresh Discord OAuth grant and bouncing the browser
  // straight onto a different site's login form is, structurally, exactly what a credential-phishing chain looks
  // like - to Discord's automated review, and to a person who did not expect a Blizzard password box. One
  // sentence and one click cost nothing and make the hop explicit: it is Blizzard's own login, on Blizzard's own
  // domain, and nothing typed there is ever visible to this bot.
  return new Response(bnetInterstitial(bnetUrl.toString(), me.global_name ?? me.username), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": `olv_bnet=${sealed}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

const BNET_OAUTH = "https://oauth.battle.net";

/** Battle.net sends the user back here after its own login; the sealed cookie carries the Discord identity and token. */
export async function bnetLinkCallback(env: Env, request: Request): Promise<Response> {
  // .114: switched off: refused before the Blizzard token exchange; the sealed cookie (which carries the Discord token) is cleared.
  if (!(await bnetLoginOn(env))) return bnetSwitchedOffPage({ "Set-Cookie": "olv_bnet=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" });
  const u = new URL(request.url);
  const code = u.searchParams.get("code") ?? "";
  const state = u.searchParams.get("state") ?? "";
  const cookie = (request.headers.get("Cookie") ?? "").split(/;\s*/).find((c) => c.startsWith("olv_bnet="))?.slice("olv_bnet=".length) ?? "";
  const box = cookie ? await unseal<{ d: string; n: string; t: string; s: string; exp: number }>(env.COOKIE_SECRET, cookie) : null;
  const clear = { "Set-Cookie": "olv_bnet=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" };
  if (!code || !box || box.s !== state || box.exp < now()) return page("Link expired", "That link was already used or timed out. Start again from Discord.", 400, clear);
  if (!env.BNET_CLIENT_ID || !env.BNET_CLIENT_SECRET) return page("Not enabled", "Battle.net login is not configured.", 404, clear);

  const tokenRes = await credentialFetch(`${BNET_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${env.BNET_CLIENT_ID}:${env.BNET_CLIENT_SECRET}`) },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${env.PUBLIC_BASE_URL}/bnet/link`, scope: "openid" }),
  });
  if (!tokenRes.ok) {
    await audit(env, box.d, "link.bnet_token_failed", undefined, { status: tokenRes.status });
    return page("Battle.net said no", `Token exchange failed (${tokenRes.status}). Try the link again.`, 502, clear);
  }
  const tok = (await tokenRes.json()) as { access_token: string };
  const infoRes = await credentialFetch(`${BNET_OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  // .49: read the body only after a 2xx; an HTML error page from Blizzard used to throw into the generic 500 path.
  const info = infoRes.ok ? ((await infoRes.json().catch(() => ({}))) as { sub?: string; id?: number; battletag?: string }) : {};
  if (!infoRes.ok || !info.battletag) {
    await audit(env, box.d, "link.bnet_userinfo_failed", undefined, { status: infoRes.status });
    return page("Battle.net said no", `Could not read your BattleTag (${infoRes.status}). Try the link again.`, 502, clear);
  }
  const res = await bindBattletag(env, { id: box.d, username: box.n }, { Authorization: `Bearer ${box.t}` }, info.battletag, String(info.id ?? info.sub ?? ""), "battlenet-login");
  res.headers.append("Set-Cookie", clear["Set-Cookie"]);
  return res;
}

/** .50: what the linked-role record says where the BattleTag used to be (see the PUT below). */
export const ROLE_CONNECTION_USERNAME = "linked";

/** .53: what Discord says the record holds after the rewrite: exactly ours, another string, or nothing that can be checked. */
export type ConnectionReadback = "linked" | "other" | "absent";
export async function readConnectionBack(connection: string, auth: { Authorization: string }): Promise<ConnectionReadback> {
  try {
    const res = await credentialFetch(connection, { method: "GET", headers: auth });
    if (!res.ok) return "absent";
    const got = (await res.json()) as { platform_username?: unknown };
    if (typeof got?.platform_username !== "string") return "absent";
    return got.platform_username === ROLE_CONNECTION_USERNAME ? "linked" : "other";
  } catch {
    return "absent";
  }
}

/** Shared tail: one BattleTag per Discord account, ban check, members row, Discord role-connection metadata. */
export async function bindBattletag(
  env: Env,
  me: { id: string; username: string; global_name?: string | null },
  auth: { Authorization: string },
  battletag: string,
  connId: string,
  source: string,
): Promise<Response> {
  // .114: the switch is read again here, at the effect: one turned off while this person was at Blizzard's login stores
  // nothing and pushes nothing to Discord (the cron's purge still covers what earlier links stored).
  if (!(await bnetLoginOn(env))) return bnetSwitchedOffPage();
  // Build .48: Battle.net data older than 29 days is purged by the cron; purging here too means a stale namesake row
  // (the cron ran late) can never block a fresh link, and a stale row is never read as current.
  await purgeBattleNetData(env);
  const existing = await env.DB.prepare("SELECT discord_id, banned FROM members WHERE battletag = ?1").bind(battletag).first<{ discord_id: string; banned: number }>();
  if (existing && existing.discord_id !== me.id) {
    await audit(env, me.id, "link.battletag_taken", battletag, { boundTo: existing.discord_id, source });
    return page("BattleTag already linked", `${battletag} is linked to another Discord account. One BattleTag per member — ask an Olympus officer if you changed Discord accounts.`, 200);
  }
  const self = await env.DB.prepare("SELECT banned FROM members WHERE discord_id = ?1").bind(me.id).first<{ banned: number }>();
  if (self?.banned || existing?.banned) {
    await audit(env, me.id, "link.banned", battletag, { source });
    return page("Not available", "This account cannot link. Contact an officer.", 200);
  }

  // .114 (Codex, log 18:47 UTC): the admin's switch is part of the write itself, so a switch turned off during the awaits
  // above stores nothing (the secrets and the policy marker are fixed for this Worker version; only the setting can change)
  const linkedAt = now();
  const stored = await env.DB.prepare(
    `INSERT INTO members (discord_id, discord_name, battletag, bnet_conn_id, linked_at)
     SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM site_settings WHERE key = ?6 AND value = '1')
     ON CONFLICT(discord_id) DO UPDATE SET discord_name = ?2, battletag = ?3, bnet_conn_id = ?4, linked_at = ?5`,
  )
    .bind(me.id, me.global_name ?? me.username, battletag, connId, linkedAt, BNET_SWITCH_KEY)
    .run();
  if (!stored.meta.changes) return bnetSwitchedOffPage();
  // and read once more right before the remote effects on Discord: switched off in between, the row just written is taken
  // back and nothing is pushed. Two providers are still two steps; a switch turned off during the PUT itself is not undone
  // remotely, and the purge removes the stored row on its schedule. No cross-service atomicity is claimed.
  const takeBack = async () => {
    await env.DB.prepare("UPDATE members SET battletag = NULL, bnet_conn_id = NULL, linked_at = NULL WHERE discord_id = ?1 AND battletag = ?2 AND linked_at = ?3").bind(me.id, battletag, linkedAt).run();
    return bnetSwitchedOffPage();
  };
  if (!(await bnetLoginOn(env))) return takeBack();

  // The linked-role record Discord keeps for this member and this application. Until .50 the BattleTag was copied into
  // it as platform_username: a second copy of Blizzard's data where the 29-day purge cannot reach it (Discord holds it
  // under the member's own account). Since .51 (Codex, 1 Oct 00:21 UTC, from Discord's documentation): the record is
  // first DELETED (a documented endpoint under the role_connections.write scope the member just granted, with the token
  // we hold for this request only), then written afresh with the flag the Linked Role needs and the word "linked" where
  // the tag went, and Discord's answer to the PUT, the record it now holds, is read back: if a name other than ours is
  // still in it, the link is reported as not finished and the member is told how to clear it. Nothing from that answer
  // is logged or stored. A member who never links again keeps whatever an earlier build pushed until they remove the
  // connection in Discord's settings; /verify-status tells everyone who ever linked (bnet-retention.ts everLinked).
  const connection = `${API}/users/@me/applications/${env.DISCORD_APP_ID}/role-connection`;
  const cleared = await credentialFetch(connection, { method: "DELETE", headers: auth }).then((r) => r.ok || r.status === 404, () => false);
  // .114 (Codex, log 19:17 UTC): and once more between the DELETE and the PUT: switched off in between, nothing is written
  // to Discord (the deletion itself only removes the member's own record) and the stored row is taken back
  if (!(await bnetLoginOn(env))) return takeBack();
  const push = await credentialFetch(connection, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ platform_name: "Battle.net", platform_username: ROLE_CONNECTION_USERNAME, metadata: { battlenet_linked: 1 } }),
  });
  // .53/.54: the record is read back with the documented GET (same scope) rather than trusted from the PUT's echo, and
  // the answer is classified three ways: "linked" (the field is exactly ours), "other" (a string that is not ours: an
  // earlier copy survived), "absent" (no string in the answer, a non-JSON body, or the GET failed). The page says
  // "Linked" only on positive proof, i.e. "linked" (Codex, 1 Oct 00:59 and 01:04 UTC); "other" and "absent" are each a
  // truthful failure with its remedy, and a failed DELETE is recorded (cleared: false) but does not by itself fail a
  // link whose readback proves the record clean. Nothing from the answer is logged or stored beyond that one word.
  const readback = push.ok ? await readConnectionBack(connection, auth) : "absent";
  const ok = push.ok && readback === "linked";
  await audit(env, me.id, ok ? "link.ok" : "link.metadata_failed", battletag, ok ? { source, cleared, readback } : { status: push.status, cleared, readback, source });
  if (!push.ok) return page("Almost", "Your BattleTag was saved but Discord refused the role metadata. Try the link once more.", 502);
  if (readback === "other") return page("Almost", "Your BattleTag was saved, but Discord still shows an older name on this connection. Remove the connection under Discord's Settings \u2192 Connections and link once more.", 502);
  if (readback === "absent") return page("Almost", "Your BattleTag was saved, but Discord did not confirm the role record. Try the link once more; if this keeps happening, remove the connection under Discord's Settings \u2192 Connections and link again, or tell an officer.", 502);
  return page("Linked", `${battletag} is now linked to your Discord account. Go back to Discord — the Linked Role applies within a minute — and run /verify &lt;character&gt;.`, 200);
}

// ---- sealed cookie: AES-GCM under a key derived from COOKIE_SECRET; carries the Discord identity through the Battle.net round trip ----
async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("olv-seal|" + secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}
async function seal(secret: string, obj: unknown): Promise<string> {
  if (!secret) throw new Error("COOKIE_SECRET is not set — run: npx wrangler secret put COOKIE_SECRET");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64u(out);
}
async function unseal<T>(secret: string, str: string): Promise<T | null> {
  try {
    const bytes = unb64u(str);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await aesKey(secret), bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    return null;
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The one screen between Discord's consent and Blizzard's login. Says plainly where you are going and why. */
function bnetInterstitial(bnetUrl: string, who: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Olympus \u2014 One more step</title>
<style>:root{color-scheme:dark}body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;background:#1e1f22;color:#e3e5e8;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:34rem;padding:2rem 1.25rem}h1{color:#c9a227;font-size:1.5rem;margin:0 0 .75rem}p{color:#b5bac1}
a.go{display:inline-block;margin:1.25rem 0 .5rem;background:#c9a227;color:#1e1f22;font-weight:600;text-decoration:none;padding:.7rem 1.4rem;border-radius:8px}
.fine{font-size:.85rem;color:#80848e}</style>
<main>
<h1>One more step, ${esc(who)}</h1>
<p>Discord has confirmed who you are. To finish, Olympus needs your <strong>BattleTag</strong> \u2014 and the only
place that can confirm it is Blizzard.</p>
<p>The button below goes to <strong>Blizzard's own login page</strong> at <code>oauth.battle.net</code>. Check that
domain in your address bar before you type anything.</p>
<a class="go" href="${esc(bnetUrl)}" rel="noopener">Continue to Blizzard</a>
<p class="fine">Olympus never sees your Blizzard password, and never asks for it. Blizzard tells us your BattleTag and
nothing else \u2014 no email, no payment details, no account access. Close this tab to stop; nothing has been saved yet.</p>
</main></html>`;
}

function page(title: string, body: string, status: number, extraHeaders: Record<string, string> = {}) {
  const html = `<!doctype html><meta charset="utf-8"><title>Olympus — ${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#1e1f22;color:#e3e5e8;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem}h1{color:#c9a227}</style>
<main><h1>${title}</h1><p>${body}</p></main>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...extraHeaders } });
}
