/**
 * The Olympus guild site (build .41, 29 Sep 2026; .43, 30 Sep: the game's own art, the voting board): registration,
 * applications, votes, friends and reserved names, at SITE_HOST (guild.roachcouncil.com).
 *
 *   GET  /                  the page (its data rides in a JSON block, so a visit is one Worker request)
 *   GET  /auth/login        -> Discord (identify guilds.members.read)
 *   GET  /auth/callback     Discord sends people back here; only members of SITE_GUILD_ID get a session
 *   POST /auth/logout
 *   /api/*                  site-api.ts (members) and site-admin.ts (SITE_ADMINS only)
 *   /privacy, /terms        the public canonical policies, independent of sign-in (policies.ts; answered in index.ts before this)
 * The stylesheet, script, images and fonts are static assets (worker/public/static); since .51 index.ts hands them to
 * the assets binding on this host only (run_worker_first), so the host check covers them.
 *
 * Security, in one place:
 *   - The session is an HMAC-signed cookie (__Host- prefix: this host only, HTTPS only, never readable by the page)
 *     holding the Discord id, an expiry and a version. Signing out bumps site_users.session_version, which kills every
 *     older cookie. The Discord access token is used during sign-in and then dropped; nothing of it is stored.
 *   - Every state-changing call needs the page's own X-Olympus header and a same-origin Origin. A form or script on
 *     another site can send neither, and the cookie is SameSite=Lax on top.
 *   - The page's CSP allows scripts, styles and images from this origin only (.112), no frames; .114: plus Discord's picture host for
 *     the member's own picture in the top bar (site-core.ts CSP, app.js ownAvatar). The script
 *     renders everything people typed with textContent, never as HTML.
 *   - Tallies never leave site-admin.ts, which answers SITE_ADMINS only (checked on every call).
 */
import type { Env } from "./env";
import { audit, now } from "./db";
import { API, credentialFetch } from "./discord";
import { recordNames } from "./names";
import { policyResponse } from "./policies";
import { loadSettings, meta, snowflakeTime } from "./site-data";
import { handleApi, meData } from "./site-api";
import { apiJson, b64u, clearCookie, cookie, currentUser, rateLimited, readSession, sameOrigin, securityHeaders, sessionCookie, sign, verify, SESSION_COOKIE } from "./site-core";
import { rankPlannerPage } from "./site-ranks";
import { communityContext, contextDto } from "./community-context";

export { siteHost } from "./site-core";

const STATE_COOKIE = "__Host-olg_state";
const SCOPES = "identify guilds.members.read";
/** .90 (P-17): sign-in starts and callbacks one client address may make in a minute (in memory, per isolate: a first filter). */
const AUTH_PER_MINUTE = 20;

/** The site's own routes. Returns null for anything else, which index.ts then answers (or 404s on this host). */
export async function handleSite(
  request: Request,
  env: Env,
  path: string,
  schemaReady: boolean,
  build: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<Response | null> {
  const url = new URL(request.url);
  // Cloudflare serves the custom domain over HTTPS; a plain-HTTP request only reaches here if nothing upgraded it.
  if (url.protocol === "http:" && url.hostname !== "localhost") {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  // .90 (P-17): the sign-in routes are the site's unauthenticated entry points that do work (a state cookie, a token exchange):
  // limited per client address, in memory (approximate per isolate; a first filter in front of the zone's own rules)
  if ((path === "/auth/login" || path === "/auth/callback") && rateLimited(`auth:${path}:${request.headers.get("CF-Connecting-IP") ?? ""}`, AUTH_PER_MINUTE, 60)) {
    return new Response("Too many sign-in attempts from your network in the last minute. Wait a moment, then try again.", {
      status: 429,
      headers: securityHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" })),
    });
  }
  const m = request.method;
  if ((m === "GET" || m === "HEAD") && (path === "/" || path === "/index.html")) {
    if (!schemaReady) return page(env, request, build, { flash: { kind: "updating" } }, 503);
    return page(env, request, build);
  }
  if (m === "GET" && path === "/auth/login") return login(env, url, url.searchParams.get("consent") === "1");
  if (m === "GET" && path === "/auth/callback") {
    if (!schemaReady) return page(env, request, build, { flash: { kind: "updating" } }, 503);
    return callback(env, request, url, build, waitUntil);
  }
  if (m === "POST" && path === "/auth/logout") return logout(env, request);
  if (path === "/admin/ranks") return rankPlannerPage(request, env, schemaReady); // .86: the staff rank planner (SITE_ADMINS; GET/HEAD only, judged there)
  const policy = policyResponse(request, path); // normally answered in index.ts already; kept so this module stands alone
  if (policy) return policy;
  if (m === "GET" && path === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /api/\nDisallow: /auth/\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (path.startsWith("/api/")) {
    if (!schemaReady) return apiJson({ error: "updating", message: "The site is updating its database. Try again in a minute." }, 503);
    return handleApi(request, env, path, waitUntil);
  }
  return null;
}

/** JSON that is safe inside a <script> block: nothing in it can close the element or start a comment. */
export function scriptJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

async function page(env: Env, request: Request, build: string, extra: Record<string, unknown> = {}, status = 200, cookies: string[] = []): Promise<Response> {
  let boot: Record<string, unknown>;
  try {
    const user = await currentUser(env, request);
    const settings = await loadSettings(env);
    boot = user ? await meData(env, user, settings) : { signedIn: false, settings, meta: meta(), now: now() };
  } catch {
    // No database (the schema check failed): the page still loads and says so, rather than a Worker error.
    boot = { signedIn: false, meta: meta(), now: now(), settings: null };
  }
  // .93: the community flags and the viewer's capabilities, so the page draws its navigation from what the Worker admits
  let community: ReturnType<typeof contextDto> | null = null;
  try {
    community = contextDto(await communityContext(env, request));
  } catch {
    community = null; // no database: the page hides the community pages and says so
  }
  boot = { ...boot, ...extra, build, joinUrl: joinUrl(env), community };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Olympus \u2014 Guild Registration</title>
<meta name="description" content="Register for Olympus, Asmongold's guild in World of Warcraft: Forever: apply for a role, vote on who leads it, and enter your reserved names. A free fan site.">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0b0a08">
<link rel="icon" href="/static/olympus-icon.png" type="image/png">
<link rel="preload" href="/static/wow/friz-quadrata.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/wow/morpheus.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/app.css?v=${encodeURIComponent(build)}">
<script type="application/json" id="boot">${scriptJson(boot)}</script>
<script src="/static/app.js?v=${encodeURIComponent(build)}" defer></script>
</head>
<body>
<div id="app"><main class="boot-fallback"><h1>Olympus</h1><p>Loading\u2026</p><noscript><p>This page needs JavaScript. Everything it does is on this site; its crest, interface images and fonts load from this site.</p></noscript></main></div>
</body>
</html>`;
  const h = securityHeaders(new Headers({ "Content-Type": "text/html; charset=utf-8" }), true);
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(request.method === "HEAD" ? null : html, { status, headers: h });
}

const joinUrl = (env: Env) => {
  const u = (env.SITE_JOIN_URL ?? "").trim();
  return /^https:\/\/(discord\.gg|discord\.com)\//.test(u) ? u : "";
};

// ---------- sign-in ----------

function missingConfig(env: Env): string {
  if (!env.COOKIE_SECRET) return "COOKIE_SECRET";
  if (!env.DISCORD_CLIENT_SECRET) return "DISCORD_CLIENT_SECRET";
  if (!env.DISCORD_APP_ID) return "DISCORD_APP_ID";
  if (!/^\d{17,20}$/.test(env.SITE_GUILD_ID ?? "")) return "SITE_GUILD_ID";
  return "";
}

async function login(env: Env, url: URL, consent = false): Promise<Response> {
  const missing = missingConfig(env);
  if (missing) return simple(`Sign-in is not set up yet: the Worker has no ${missing}.`, 503);
  // The last character records which prompt this attempt used, so the callback can retry once with "consent".
  const state = b64u(crypto.getRandomValues(new Uint8Array(18))) + (consent ? "c" : "n");
  const mac = await sign(env.COOKIE_SECRET, "state", state);
  const to = new URL("https://discord.com/oauth2/authorize");
  to.searchParams.set("client_id", env.DISCORD_APP_ID);
  to.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  to.searchParams.set("response_type", "code");
  to.searchParams.set("scope", SCOPES);
  to.searchParams.set("state", state);
  // Someone who has already allowed this goes straight back; a first visit still shows Discord's consent screen. If
  // Discord ever answers "none" with an error instead, the callback starts over once with "consent".
  to.searchParams.set("prompt", consent ? "consent" : "none");
  const h = securityHeaders(new Headers({ Location: to.toString() }));
  h.append("Set-Cookie", `${STATE_COOKIE}=${state}.${mac}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

interface DiscordMember {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  nick?: string | null;
  avatar?: string | null;
  joined_at?: string;
  pending?: boolean;
}

async function callback(env: Env, request: Request, url: URL, build: string, waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
  const clear = [clearCookie(STATE_COOKIE)];
  const flash = (kind: string, status = 400, detail?: string) => page(env, request, build, { flash: { kind, detail } }, status, clear);
  const missing = missingConfig(env);
  if (missing) return flash("not_configured", 503, missing);
  const state = url.searchParams.get("state") ?? "";
  const [cState, cMac] = cookie(request, STATE_COOKIE).split(".");
  const stateOk = !!state && cState === state && !!cMac && (await verify(env.COOKIE_SECRET, "state", state, cMac));
  const error = url.searchParams.get("error");
  if (error) {
    // The person pressed Cancel: say so. Anything else on a silent (prompt=none) attempt: once more, with consent.
    if (error !== "access_denied" && stateOk && state.endsWith("n")) {
      const h = securityHeaders(new Headers({ Location: "/auth/login?consent=1" }));
      h.append("Set-Cookie", clear[0]);
      return new Response(null, { status: 302, headers: h });
    }
    return flash(error === "access_denied" ? "cancelled" : "discord_error", 200, error === "access_denied" ? undefined : error.slice(0, 40));
  }
  const code = url.searchParams.get("code") ?? "";
  if (!code || !stateOk) return flash("expired");

  const tokenRes = await credentialFetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) {
    await audit(env, "site", "site.login_failed", undefined, { step: "token", status: tokenRes.status });
    return flash("discord_error", 502, `token ${tokenRes.status}`);
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return flash("discord_error", 502, "no token");
  const auth = { Authorization: `Bearer ${token.access_token}` };

  const meRes = await credentialFetch(`${API}/users/@me`, { headers: auth });
  if (!meRes.ok) return flash("discord_error", 502, `user ${meRes.status}`);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  if (!/^\d{17,20}$/.test(me.id ?? "") || me.bot) return flash("discord_error", 502, "user");

  // The one thing this site needs to know about someone's servers: are they in this one. guilds.members.read answers
  // for this server only, with 404 for "not a member".
  const memRes = await credentialFetch(`${API}/users/@me/guilds/${env.SITE_GUILD_ID}/member`, { headers: auth });
  if (memRes.status === 404) {
    await audit(env, me.id, "site.login_not_member");
    return flash("not_member", 403);
  }
  if (memRes.status === 429) return flash("busy", 429);
  if (!memRes.ok) {
    await audit(env, me.id, "site.login_failed", undefined, { step: "member", status: memRes.status });
    return flash("discord_error", 502, `member ${memRes.status}`);
  }
  const member = (await memRes.json()) as DiscordMember;
  // Membership screening not finished (the server's rules not accepted yet): not a member in any useful sense.
  if (member.pending) return flash("pending", 403);

  const t = now();
  const avatar = member.avatar ? `g:${member.avatar}` : me.avatar ? `u:${me.avatar}` : null;
  const joined = member.joined_at ? Math.floor(Date.parse(member.joined_at) / 1000) : null;
  // A new row starts its session version at a random number, not at 1: someone who deleted their data and signs up
  // again must not bring a cookie from before the delete back to life (one from the same second, too).
  const firstVersion = 2 + (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0);
  const row = await env.DB.prepare(
    `INSERT INTO site_users (discord_id, username, global_name, nick, avatar, account_created, server_joined, first_login, last_login, checked_at, in_server, session_version)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8, 1, ?9)
     ON CONFLICT(discord_id) DO UPDATE SET username = ?2, global_name = ?3, nick = ?4, avatar = ?5, account_created = ?6,
       server_joined = ?7, last_login = ?8, checked_at = ?8, in_server = 1
     RETURNING session_version`,
  )
    .bind(me.id, me.username.slice(0, 64), me.global_name?.slice(0, 64) ?? null, member.nick?.slice(0, 64) ?? null, avatar,
      snowflakeTime(me.id), Number.isFinite(joined) ? joined : null, t, firstVersion)
    .first<{ session_version: number }>();
  waitUntil(recordNames(env, me).catch(() => {})); // a linked member's names for the roster window, while we have them
  await audit(env, me.id, "site.login");
  const h = securityHeaders(new Headers({ Location: "/" }));
  h.append("Set-Cookie", clear[0]);
  h.append("Set-Cookie", await sessionCookie(env, me.id, row?.session_version ?? 1));
  return new Response(null, { status: 303, headers: h });
}

async function logout(env: Env, request: Request): Promise<Response> {
  if (!sameOrigin(request)) return apiJson({ error: "bad_origin" }, 403);
  const s = await readSession(env, request);
  if (s) {
    await env.DB.prepare("UPDATE site_users SET session_version = session_version + 1 WHERE discord_id = ?1 AND session_version = ?2").bind(s.u, s.v).run();
  }
  return apiJson({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
}


function simple(text: string, status: number): Response {
  const h = securityHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" }));
  return new Response(text, { status, headers: h });
}

