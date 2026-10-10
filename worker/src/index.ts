/**
 * olympus-verify Worker — routes
 *   POST /interactions          Discord HTTP interactions (slash commands, buttons)
 *   GET  /linked-role           start the Discord Linked Role flow
 *   GET  /oauth/callback        Discord OAuth2 callback
 *   GET  /bnet/link             Battle.net login callback (fallback when Discord hides the connection; needs BNET_CLIENT_ID/SECRET)
 *   POST /ingest/verify         watcher: a code arrived in game (whisper/mail)
 *   POST /ingest/roster         watcher: full roster export from SavedVariables
 *   POST /ingest/events         watcher: addon events (invite fired, note set)
 *   GET  /queue                 watcher: invites to write into OlympusQueue.lua; also carries its relay presence (relays.ts)
 *   POST /queue/written         watcher: ids it wrote to the queue file
 *   GET  /health
 *
 * On SITE_HOST (guild.roachcouncil.com, build .41) the guild site answers instead: site.ts. Its stylesheet, script and
 * images are static assets (public/static, [assets] in wrangler.toml); since .51 every request runs this code first
 * (run_worker_first), which hands /static/* on the site host to the assets binding and lets no other host have them.
 *
 * This module's named exports are functions only: workerd refuses an entry that exports a scalar (.51).
 */
import type { Env } from "./env";
import { unverifiedReport } from "./unverified";
import { handleInteraction, USER_MENU_LOOKUP } from "./interactions";
import { INTERACTION_FAILED, json, readInteractionBody, reply, verifyInteraction, type Interaction } from "./discord";
import { errorRef, idNamespace, logPath } from "./log";
import { now } from "./db";
import { getQueue, postEvents, postQueueWritten, postRoster, postVerify, sweepInviteQueue, watcherAuthorized } from "./ingest";
import { PrivacySiteRequestHeld, readPrivacySubject, privacyBoundSubjectEnv } from './privacy-serving-authority';
import { guildMap } from "./guildmap";
import { backfillOptions, backfillRoles } from "./backfill";
import { sweepMemberRoles } from "./restore";
import { continueRosterEffects } from "./roster";
import {runServingErasureJob} from './privacy-serving-jobs';
import {sweepServingRetention} from './privacy-retention';
import { bnetLinkCallback, linkedRoleCallback, startLinkedRole } from "./oauth";
import { bnetLoginState } from "./bnet-switch";
import { sweepRenameHolds } from "./rename-review";
import { policyResponse } from "./policies";
import { POLICY_ASSETS, policyHeaders } from "./policy-render";
import { ensureSchema } from "./schema";
import { recordRelay, relayReportFromQuery, relayStatus, ticketsReady } from "./relays";
import { handleIntros, INTROS, INTROS_COMMAND, parseChannels } from "./intros";
import { handleSite } from "./site";
import { rateLimited, siteAdmins, siteHost, siteLegacyHosts } from "./site-core";
import { handleLookup, isAsmongoldLookup, LOOKUP_COMMAND } from "./lookup";
import { recordNames, refreshNames, verifiedOnRoster } from "./names";
import { autoQueueReserved } from "./site-queue";
import { bnetRetentionStatus, legacyApiCounts, purgeBattleNetData } from "./bnet-retention";
import { rolesStatus } from "./roles";
import { sweepCommunityProfiles } from "./community-directory";
import { sweepCommunityEvents } from "./community-events";
import { runEventReminders } from "./community-event-reminders";
import { sweepCommunityTrials } from "./community-trials";
import { sweepCommunityRestrictions } from "./community-restrictions";
import { departureIntake, sweepCommunityDepartures } from "./community-departures";
import { openWeeklyObligations, sweepCommunityContributions } from "./community-contributions";
import { sweepCommunityPrivacy } from "./community-privacy-intake";
import { runOfficerDigest } from "./community-digest";
import { communityFeatures } from "./community-context";
import { guildSeats } from "./guild-seats";
import { newsCron } from "./site-news";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Build .49: which host this request came in on is decided first, before the database is touched, so a request on
    // an unknown host (the Worker is reachable on every hostname Cloudflare routes to it) costs nothing and gets nothing.
    const host = classifyHost(env, url.hostname);
    if (host === "misconfigured") return json({ error: "misconfigured" }, 503);
    if (host === "unknown") return new Response("unknown host", { status: 404 });
    if (host === "legacy") {
      // .51: a sign-in or OAuth path is never forwarded (Codex's review of .49, 1 Oct 00:04 UTC): the state cookie it
      // depends on belongs to the old host, and its query carries ?code= and ?state=. The browser is sent to start
      // again at the site's front page, with nothing from the old request and nothing a cache may keep.
      if (AUTH_PATHS.test(path)) return new Response(null, { status: 302, headers: { Location: `https://${siteHost(env)}/`, "Cache-Control": "no-store, no-transform", "Referrer-Policy": "no-referrer" } });
      // A former site host: a browser GET is sent to the same page on the current host (path and query kept; the
      // fragment never leaves the browser, so #/roles/<key> links survive); anything else is refused. Cacheable a day.
      if (request.method === "GET" || request.method === "HEAD") {
        return new Response(null, { status: 301, headers: { Location: `https://${siteHost(env)}${url.pathname}${url.search}`, "Cache-Control": "public, max-age=86400" } });
      }
      return new Response("not found", { status: 404 });
    }
    // .116b3: policies and their finite local CSS/crest/font closure need no database/session; host check still applies.
    const policy = policyResponse(request, path);
    if (policy) {
      // the site's HTTP-to-HTTPS upgrade (site.ts), kept for these paths too
      if (host === "site" && url.protocol === "http:" && url.hostname !== "localhost") {
        url.protocol = "https:";
        const headers = policyHeaders(); headers.set("Location", url.toString()); return new Response(null, { status: 301, headers });
      }
      return policy;
    }
    if ((POLICY_ASSETS as readonly string[]).includes(path)) {
      if (request.method === "GET" || request.method === "HEAD") return env.ASSETS.fetch(request);
      const headers = policyHeaders(); headers.set("Allow", "GET, HEAD"); return new Response("method not allowed", { status: 405, headers });
    }
    // .51: the site's static files. Every request reaches this code (run_worker_first in wrangler.toml), so the host
    // check above covers them too: on the site host they go to the assets binding; on any other host they get that
    // host's answer (the legacy 301 above, the unknown 404, the bot's 404 below). No database, no schema check.
    if (host === "site" && (request.method === "GET" || request.method === "HEAD") && path.startsWith("/static/")) return env.ASSETS.fetch(request);
    try {
      // This build's columns and tables (schema.ts); a no-op once done in this isolate, retried on the next request
      // after a failure. Until it has succeeded, the watcher's endpoints answer 503 (the watcher keeps its work and
      // retries) and commands say to try again: the code below reads columns the check adds, so running it without them
      // would fail halfway through a verification or a roster sync. The policy pages and /health work regardless.
      const schemaReady = await ensureSchema(env).then(
        () => true,
        (e) => {
          console.error("schema check failed", errorRef(e));
          return false;
        },
      );
      // The guild site has its own host. Anything it does not answer there is a 404, unless that host is also the bot's
      // public one (a site run on the workers.dev address), in which case the bot's routes below still apply.
      if (host === "site") {
        const r = await handleSite(request, env, path, schemaReady, BUILD, (p) => ctx.waitUntil(p));
        if (r) return r;
        if (siteHost(env) !== hostOf(env.PUBLIC_BASE_URL)) return new Response("not found", { status: 404 });
      }
      const res = await route(request, env, path, schemaReady, ctx);
      // The watcher polls /queue every 30 seconds while an officer is online, which is exactly when promotions happen.
      // The Guild Member sweep rides on those polls (throttled to one per five minutes inside), after the response.
      if (request.method === "GET" && path === "/queue" && res.ok) ctx.waitUntil(sweepMemberRoles(env, "watcher"));
      return res;
    } catch (e) {
      if(e instanceof PrivacySiteRequestHeld)return json({error:'erasure_held',message:'The original request is no longer admitted or its database outcome was not confirmed. Refresh the account state before proceeding.'},503);
      // .49: the message goes to the log with a short id; the caller gets the id and nothing else (a D1 or upstream
      // error text can name tables, hosts or codes).
      const requestId = crypto.randomUUID().slice(0, 8);
      console.error("unhandled", requestId, logPath(path), errorRef(e)); // .51: class and digest, never the message
      return json({ error: "internal", requestId }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // .115 (Codex, 3 Oct 2026 13:26 UTC): one invocation, so the schema check and every job below share one D1 statement
    // limit (each statement of a batch counts). Each job's worst case and the per-run caps are in scheduled-budget.ts; a
    // new job here gets its line there first (tests/scheduled_budget_test.cjs holds this run to it).
    try {
      await ensureSchema(env);
    } catch (e) {
      console.error("schema check failed; skipping this run", errorRef(e)); // the sweeps read the new columns too
      return;
    }
    ctx.waitUntil(sweepInviteQueue(env)); // re-queues invites nobody accepted, retires the hopeless ones
    ctx.waitUntil(sweepMemberRoles(env, "cron")); // gives Guild Member back to members who lost it (restore.ts)
    // .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): a slice of the roster's pending member effects, so a
    // backlog an export could not finish in its own invocation is worked off between exports too (roster.ts, roster-effects.ts)
    ctx.waitUntil(continueRosterEffects(env));
    ctx.waitUntil(refreshNames(env)); // a few linked members' Discord names for the officers' roster window (names.ts)
    ctx.waitUntil(autoQueueReserved(env)); // from launch: approved reserved names to the top of the invite queue
    ctx.waitUntil(purgeSeenInteractions(env)); // .47: the replay ledger keeps an hour
    // .48: Battle.net-derived data not refreshed within 29 days goes (Blizzard's 30-day limit); counts only in the log.
    ctx.waitUntil(purgeBattleNetData(env).catch((e) => console.error("bnet retention failed", errorRef(e))));
    ctx.waitUntil(sweepRenameHolds(env).catch((e) => console.error("rename holds sweep failed", errorRef(e)))); // .114: closed reapply holds thirty days after closing
    // .57: community profiles whose owner stopped qualifying start a 30-day clock and go when it runs out; runs with the feature off too.
    ctx.waitUntil(sweepCommunityProfiles(env).catch((e) => console.error("community sweep failed", errorRef(e))));
    ctx.waitUntil(sweepCommunityEvents(env).catch((e) => console.error("community events sweep failed", errorRef(e)))); // .59: events 30 days past their end
    ctx.waitUntil(runEventReminders(env).catch((e) => console.error("event reminder failed", errorRef(e)))); // at most one due opted event; unknown delivery holds
    ctx.waitUntil(sweepCommunityTrials(env).catch((e) => console.error("community trials sweep failed", errorRef(e)))); // .61: trials past their deadline
    ctx.waitUntil(sweepCommunityRestrictions(env).catch((e) => console.error("community restrictions sweep failed", errorRef(e)))); // .69: expired watch-list rows, resolved cases, orphan periods
    // .70: departure review items: the intake only while the flag is on, the purge always
    if (communityFeatures(env).has("departures")) ctx.waitUntil(departureIntake(env).catch((e) => console.error("community departures intake failed", errorRef(e))));
    ctx.waitUntil(sweepCommunityDepartures(env).catch((e) => console.error("community departures sweep failed", errorRef(e))));
    // .75: the contribution ledger: this week's obligations only while the flag is on and the ledger writable, the retention purge always
    if (communityFeatures(env).has("contributions")) ctx.waitUntil(openWeeklyObligations(env).catch((e) => console.error("community contributions opener failed", errorRef(e))));
    ctx.waitUntil(sweepCommunityContributions(env).catch((e) => console.error("community contributions sweep failed", errorRef(e))));
    ctx.waitUntil(sweepCommunityPrivacy(env).catch((e) => console.error("community privacy intake sweep failed", errorRef(e)))); // .82: expired private cases, always
    // .115: notices and their operation records past their time, always, whatever the switch says; then the News counts, at
    // most every 3 h, only while News is switched on, from the switch and cache the cleanup's batch read (site-news.ts newsCron)
    ctx.waitUntil(newsCron(env));
    ctx.waitUntil(runOfficerDigest(env).catch((e) => console.error("officer digest failed", errorRef(e)))); // .85: the daily officer digest (counts only) behind its own switch; off, it only removes what it posted
    ctx.waitUntil(runServingErasureJob(env).catch(e=>console.error('serving erasure continuation failed',errorRef(e))));
    ctx.waitUntil(sweepServingRetention(env).catch(e=>console.error('serving retention failed',errorRef(e))));
  },
};

/** A stored answer is replayed only when it is JSON and no larger than this; a bigger one makes a repeat answer 409. */
const STORED_RESPONSE_MAX = 32 * 1024;

/** Commands with nothing to protect from a repeat: they read and answer. `/olympus-admin lookup` is the one read-only subcommand. */
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set(["verify-status", LOOKUP_COMMAND, USER_MENU_LOOKUP]);
const READ_ONLY_ADMIN: ReadonlySet<string> = new Set(["lookup"]);
export function isReadOnly(i: Interaction): boolean {
  if (i.type !== 2) return false;
  const name = i.data?.name ?? "";
  if (READ_ONLY_COMMANDS.has(name)) return true;
  const sub = i.data?.options?.[0];
  return name === "olympus-admin" && sub?.type === 1 && READ_ONLY_ADMIN.has(sub.name);
}

type Claim = { state: "new" } | { state: "inflight" } | { state: "done"; response: Response };

/** Claim an interaction id: new, still running elsewhere, or already answered (with the stored answer to replay). */
async function claimInteraction(env: Env, id: string): Promise<Claim> {
  const ins = await env.DB.prepare("INSERT INTO seen_interactions (id, seen_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING").bind(id, now()).run();
  if ((ins.meta?.changes ?? 0) > 0) return { state: "new" };
  const row = await env.DB.prepare("SELECT response FROM seen_interactions WHERE id = ?1").bind(id).first<{ response: string | null }>();
  if (!row) return { state: "new" }; // released between the insert and the read: treat as fresh (the retry inserts it again)
  if (row.response === null) return { state: "inflight" };
  try {
    const stored = JSON.parse(row.response) as { status: number; body: string | null };
    if (typeof stored.body !== "string") return { state: "inflight" }; // answered, but too large to replay: 409
    return { state: "done", response: new Response(stored.body, { status: stored.status, headers: { "Content-Type": "application/json" } }) };
  } catch {
    return { state: "inflight" };
  }
}

/** Keep the handler's answer with the claim, so a repeat of the id can be answered without running anything. */
async function storeInteractionResponse(env: Env, id: string, res: Response): Promise<void> {
  let body: string | null = null;
  const type = res.headers.get("Content-Type") ?? "";
  if (type.startsWith("application/json")) {
    const text = await res.clone().text();
    if (text.length <= STORED_RESPONSE_MAX) body = text;
  }
  await env.DB.prepare("UPDATE seen_interactions SET response = ?2 WHERE id = ?1").bind(id, JSON.stringify({ status: res.status, body })).run();
}

/**
 * Build .47: forget interaction ids older than an hour. Discord's own signature window is five minutes (verifyInteraction),
 * so an id this old could not pass the timestamp check anyway; the hour is margin between cron runs.
 */
export async function purgeSeenInteractions(env: Env, at = now()): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM seen_interactions WHERE seen_at <= ?1").bind(at - 3600).run();
  } catch (e) {
    console.error("seen_interactions purge failed", errorRef(e));
  }
}

/** .51: paths a legacy host answers with a restart on the site rather than a forward (see fetch). */
const AUTH_PATHS = /^\/(auth|oauth|bnet|linked-role|privacy)(\/|$)/;

const hostOf = (u: string | undefined) => {
  try {
    return new URL(u ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
};

type HostClass = "site" | "legacy" | "bot" | "unknown" | "misconfigured";

/**
 * Build .49. The bot's own host is PUBLIC_BASE_URL (the workers.dev address: Discord's interactions endpoint, the
 * OAuth callbacks and the watcher all use it); SITE_HOST is the site; SITE_LEGACY_HOSTS are former site hosts kept as
 * redirects; localhost is wrangler dev. Anything else is a hostname Cloudflare happens to route here and is refused.
 * PUBLIC_BASE_URL must be a bare https origin, or nothing is served: a wrong value would put callbacks on the wrong host.
 */
export function classifyHost(env: Env, hostname: string): HostClass {
  let base: URL | null = null;
  try {
    base = new URL(env.PUBLIC_BASE_URL ?? "");
  } catch {
    base = null;
  }
  if (!base || base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash || base.username || base.password) return "misconfigured";
  const h = hostname.toLowerCase();
  const site = siteHost(env);
  if (site && h === site) return "site";
  if (h === base.hostname.toLowerCase() || h === "localhost" || h === "127.0.0.1") return "bot";
  if (site && siteLegacyHosts(env).has(h)) return "legacy";
  return "unknown";
}

/** Every handler is awaited here so a rejected promise lands in the catch above instead of surfacing as a 1101. */
async function route(request: Request, env: Env, path: string, schemaReady = true, ctx?: ExecutionContext): Promise<Response> {
  const query = new URL(request.url).searchParams;
  if (request.method === "POST" && path === "/interactions") {
    // Build .47: the body is capped before anything decodes it, the signature's timestamp must be recent, the payload
    // must name this application, and an id already seen in the last hour is refused (seen_interactions): a captured
    // request cannot be replayed. Ping and autocomplete are not ledgered: no side effects, and autocomplete fires per key.
    const body = await readInteractionBody(request);
    if (body === null) return new Response("payload too large", { status: 413 });
    if (!(await verifyInteraction(env, request, body))) return new Response("bad signature", { status: 401 });
    const i = JSON.parse(body) as Interaction;
    if (env.DISCORD_APP_ID && i.application_id !== env.DISCORD_APP_ID) return new Response("wrong application", { status: 400 });
    if (!schemaReady && i.type !== 1) return reply("The bot is updating its database \u2014 please try again in a minute.");
    const privacyActor=i.member?.user??i.user;
    const privacyCapture=privacyActor&&/^\d{17,20}$/.test(privacyActor.id)?await readPrivacySubject(env,privacyActor.id):undefined;
    if(privacyCapture!==undefined)env=privacyBoundSubjectEnv(env,privacyActor!.id,privacyCapture);
    const run = async (): Promise<Response> => {
      // Build .41: every command, button and form carries the member's current Discord names; keep a linked member's
      // copy fresh for the roster window (one read, and a write at most daily). Not on autocomplete: that fires per key.
      if (ctx && (i.type === 2 || i.type === 3 || i.type === 5)) ctx.waitUntil(recordNames(env, privacyActor,false,privacyCapture).catch(() => {}));
      // Lookups in Asmongold's server, routed ahead of the "only serves Olympus" guard like the intros (lookup.ts).
      if (isAsmongoldLookup(env, i)) return await handleLookup(env, i);
      // Build .39: the channel intros live in INTROS_GUILD_ID (Asmongold's server) while verification still serves
      // GUILD_ID, so this is routed ahead of handleInteraction's "only serves Olympus" guard; intros.ts checks the guild.
      if (i.type === 2 && i.data?.name === INTROS_COMMAND) {
        return await handleIntros(env, i, (p) => {
          if (ctx) ctx.waitUntil(p);
        });
      }
      if(i.type===2&&i.data?.name==='olympus-qr'){
        const {createInteractionRequest,QrHeld}=await import('./qr-phase1');
        try{const r=await createInteractionRequest(env,request,body);return reply(`Whisper !olympus ${r.code} to an online qualified High Councillor. This code expires in ten minutes. You need no AddOn or website account.`);}
        catch(e){return reply(e instanceof QrHeld?`Councillor verification is held: ${e.code}.`:'Councillor verification is currently held.');}
      }
      return await handleInteraction(env, i);
    };
    // .50 (Codex's second review, 1 Oct 00:05 UTC): a command that only reads is answered afresh every time instead of
    // from the ledger. It has no effect for the ledger to protect, and a stored answer could hand a Battle.net line
    // back after the record behind it expired (a repeat three seconds past the 29-day mark replayed the tag).
    if ((i.type !== 2 && i.type !== 3 && i.type !== 5) || isReadOnly(i)) return await run();
    // The replay ledger (Codex review of d326709, 23:28 and 23:33 UTC): the id is claimed before the handler runs and
    // the handler's answer is stored with the claim afterwards, so a repeat of the id gets that answer back and never
    // runs the handler again; a duplicate that arrives while the first run is still in flight gets 409. A handler that
    // throws is answered, and its claim filled, with one fixed ephemeral reply asking the person to run the command
    // again: a fresh command is a new id, while a captured copy of the failed one can only ever get that reply. The
    // claim is never released, so a command that half-completed before failing cannot be made to run twice.
    if (typeof i.id !== "string" || !/^\d{17,20}$/.test(i.id)) return new Response("bad interaction", { status: 400 });
    const claim = await claimInteraction(env, i.id);
    if (claim.state === "done") return claim.response;
    if (claim.state === "inflight") return new Response("duplicate interaction", { status: 409 });
    let res: Response;
    try {
      res = await run();
    } catch (e) {
      console.error("interaction failed", i.type, i.data?.name ?? idNamespace(i.data?.custom_id), errorRef(e));
      res = reply(INTERACTION_FAILED);
    }
    await storeInteractionResponse(env, i.id, res).catch((e) => console.error("seen_interactions store failed", errorRef(e)));
    return res;
  }
  // .90 (P-17): the OAuth entry points on the bot host, limited per client address, in memory (a first filter)
  if ((path === "/linked-role" || path === "/oauth/callback" || path === "/bnet/link") && rateLimited(`oauth:${path}:${request.headers.get("CF-Connecting-IP") ?? ""}`, 20, 60)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  if (request.method === "GET" && path === "/linked-role") return await startLinkedRole(env);
  if (request.method === "GET" && path === "/oauth/callback") return await linkedRoleCallback(env, request);
  if (request.method === "GET" && path === "/bnet/link") return await bnetLinkCallback(env, request);
  // .50: /bnet/start, /bnet/callback and /verify-bnet (the dormant Phase 3 profile-API path) are gone; see design.md.
  // .49: the public answer says only whether the Worker is up and which build it is; the inventory (secrets present,
  // config, who is online) needs the watcher's bearer, which the watcher's --check already sends.
  if (request.method === "GET" && path === "/health") return json(await health(env, await watcherAuthorized(env, request)));
  if (path.startsWith("/ingest/") || path.startsWith("/queue")) {
    if (!(await watcherAuthorized(env, request))) return new Response("unauthorized", { status: 401 });
    if (!schemaReady) return json({ error: "database schema not ready; retry shortly" }, 503);
    // .66 (Codex, 1 Oct 02:41 UTC): this Worker speaks the unversioned 0.6.x protocol only. A client that names a key
    // version asks for a protocol this Worker does not implement (the generation-3 proposal stays an unshipped
    // candidate); it is told so, never served the legacy answer as if it were that protocol. Unversioned clients see
    // no difference.
    const body: any = request.method === "POST" ? await request.json() : null; // each handler validates its own body, exactly as before .66
    if (query.has("keyVersion") || (body !== null && typeof body === "object" && "keyVersion" in body)) {
      return json({ error: "unsupported_protocol", message: "This Worker serves the unversioned protocol only; a keyVersion is not supported." }, 400);
    }
    if (request.method === "POST" && path === "/ingest/verify") return await postVerify(env, body);
    if (request.method === "POST" && path === "/ingest/roster") return await postRoster(env, body);
    if (request.method === "POST" && path === "/ingest/events") return await postEvents(env, body);
    if (request.method === "GET" && path === "/queue") {
      // Presence rides on the poll the watcher makes anyway: whether its game client is in the world. Never allowed
      // to cost the queue itself.
      const report = relayReportFromQuery(query);
      if (report) {
        try {
          await recordRelay(env, report);
        } catch (e) {
          console.error("relay presence not recorded", errorRef(e));
        }
      }
      return await getQueue(env, query.get("officer") ?? "");
    }
    // Who is in the guild but not verified, and when each may be offered for removal. Pulled by the watcher on a slow
    // cadence and carried into the addon's queue file; the addon only reads that file at login or /reload anyway.
    if (request.method === "GET" && path === "/queue/unverified") {
      const rep = await unverifiedReport(env);
      // Build .41: the linked members on the same roster, with their Discord names, for the addon's roster window.
      const verified = rep.snapshot ? await verifiedOnRoster(env, rep.snapshot.id) : [];
      return json({ build: BUILD, ...rep, verified });
    }
    if (request.method === "POST" && path === "/queue/written") return await postQueueWritten(env, body);
  }
  // Read-only server inspection. Same bearer token as the watcher: it is already a trusted-operator credential,
  // and what this exposes -- role and channel structure -- is visible to any member of the server anyway.
  if (path.startsWith("/admin/")) {
    if (!(await watcherAuthorized(env, request))) return new Response("unauthorized", { status: 401 });
    // The build is stamped into the map itself. A deploy is live at Cloudflare before every edge is serving it, so
    // a map pulled seconds after `npm run deploy` can be generated by the PREVIOUS version and look like a bug in
    // the current one. An artifact used to rebuild a server elsewhere must say which code produced it.
    if (request.method === "GET" && path === "/admin/guild-map") return json({ build: BUILD, ...(await guildMap(env, query.get("guild") ?? "")) });
    if (request.method === "GET" && path === "/admin/backfill-roles") return json(await backfillRoles(env, backfillOptions(query)));
  }

  return new Response("not found", { status: 404 });
}

/** Bumped with every change that needs a redeploy, so GET /health shows which build is live. */
const BUILD = "2026-10-10.135 Account controls and councillor bridge";

/**
 * Presence of each secret (never the value) and a D1 round trip — enough to tell a missing `wrangler secret put` from a
 * bug. Since .49 the inventory is returned only to the watcher's bearer; anyone else gets ok, build and d1.
 */
async function health(env: Env, full: boolean) {
  const secrets = ["DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_SECRET", "VERIFY_SECRET", "WATCHER_TOKEN", "COOKIE_SECRET"] as const;
  const present: Record<string, boolean> = {};
  for (const s of secrets) present[s] = typeof env[s] === "string" && env[s].length > 0;
  let d1 = "ok";
  try {
    await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first();
  } catch (e) {
    d1 = full ? `error: ${errorRef(e)}` : "error"; // .55: bounded for the watcher too (Codex's .51 report)
  }
  if (!full) return { ok: true, build: BUILD, d1 };
  // Who can take a whisper right now: names only, which /verify shows to everyone anyway.
  let relays: { online: string[]; reporting: boolean; requestCodes: boolean } | string = { online: [], reporting: false, requestCodes: false };
  try {
    const st = await relayStatus(env);
    // requestCodes: whether Get my code hands out request codes right now (REQUEST_CODES, and an upgraded officer PC)
    relays = { online: st.online.map((r) => r.character), reporting: st.known, requestCodes: await ticketsReady(env) };
  } catch (e) {
    relays = `error: ${errorRef(e)}`;
  }
  // .48: whether the Battle.net purge keeps up (counts only); .51: and whether the retired Phase 3 path ever wrote a row
  let bnetRetention: { overdue: number; oldestAgeDays: number | null } | string;
  let legacyApi: Awaited<ReturnType<typeof legacyApiCounts>> | string;
  try {
    bnetRetention = await bnetRetentionStatus(env);
  } catch (e) {
    bnetRetention = `error: ${errorRef(e)}`;
  }
  try {
    legacyApi = await legacyApiCounts(env);
  } catch (e) {
    legacyApi = `error: ${errorRef(e)}`;
  }
  // .114: the Battle.net sign-in switch (bnet-switch.ts): whether it is configured, whether the policy allows it, the admin's setting, the result
  let bnetSwitch: { policyReady: boolean; adminOn: boolean; effective: boolean } | string;
  try {
    const st = await bnetLoginState(env);
    bnetSwitch = { policyReady: st.policyReady, adminOn: st.adminOn, effective: st.effective };
  } catch (e) {
    bnetSwitch = `error: ${errorRef(e)}`;
  }
  // .115 (item B): whether Olympus I has room, as the staff commands see it (exact times: this view is the watcher's).
  let seats: { state: string; source: string | null; reason: string | null; members: number | null; cap: number; capConfigured: string; rosterAt: number | null; refusedAt: number | null } | string;
  try {
    const s = (await guildSeats(env)).seats;
    seats = { state: s.state, source: s.source, reason: s.reason, members: s.members, cap: s.cap, capConfigured: s.capConfigured, rosterAt: s.rosterAt, refusedAt: s.refusedAt };
  } catch (e) {
    seats = `error: ${errorRef(e)}`;
  }
  // .55: the configured roles against the guild (ids and booleans only); null when Discord could not be asked.
  let roles: Awaited<ReturnType<typeof rolesStatus>> | string;
  try {
    roles = await rolesStatus(env);
  } catch (e) {
    roles = `error: ${errorRef(e)}`;
  }
  return { ok: true, build: BUILD, mode: env.ADMISSION_MODE, bnetRetention, legacyApi, roles, rosterGuard: { minMembers: env.ROSTER_MIN_MEMBERS, maxShrinkPct: env.ROSTER_MAX_SHRINK_PCT }, linksNotBefore: env.LINKS_NOT_BEFORE || null, seats, relays, appId: env.DISCORD_APP_ID, baseUrl: env.PUBLIC_BASE_URL, secrets: present, d1, bnetLogin: !!(env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET), bnetSwitch, intros: { guild: env.INTROS_GUILD_ID || null, channels: Object.keys(parseChannels(env.INTROS_CHANNELS)).length, intros: INTROS.length }, site: { host: siteHost(env) || null, guild: env.SITE_GUILD_ID || null, admins: siteAdmins(env).size } };
}
