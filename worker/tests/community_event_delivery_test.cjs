// Real Worker routing, signed sessions, calendar writers and schema over SQLite; only Discord HTTP is synthetic.
// No fixture contacts a provider. These are publication/custody tests, not reminder, ACL or live delivery proof.
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const cache = {}, stubs = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} }; cache[name] = mod;
  const file = path.join(root, "src", name.replace(/^\.\//, "") + ".ts");
  const body = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", body)(mod, mod.exports, load);
  return mod.exports;
}
let db, hooks, requests, messages, SQL, maxParameters, counter;
const ORG = "300000000000000002", OTHER = "300000000000000003", MEMBER = "300000000000000004", STAFF = "300000000000000005";
const GUILD = "300000000000000006", CHANNEL = "300000000000000007", BOT = "300000000000000008", WRONG = "300000000000000009";
const EVENT = "E".repeat(22), OP = "P".repeat(22), NEXT = "Q".repeat(22);
const ONE = "400000000000000001";
const SECRET = "synthetic-cookie-secret-0123456789";
const at = () => Math.floor(Date.now() / 1000);
function d1() {
  function statement(sql) {
    let params = [];
    const exec = () => {
      SQL.push({ sql, params }); hooks.beforeStatement?.(sql, params);
      const st = db.prepare(sql);
      let out;
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) out = { results: st.all(...params), meta: { changes: 0 } };
      else if (/\bRETURNING\b/i.test(sql)) { const results = st.all(...params); out = { results, meta: { changes: db.prepare("SELECT changes() AS n").get().n } }; }
      else { const r = st.run(...params); out = { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      hooks.afterStatement?.(sql, params, out); return out;
    };
    const s = { bind: (...p) => {
      const count = Math.max(0, ...[...sql.matchAll(/\?(\d+)/g)].map((m) => +m[1]));
      if (count && count !== p.length) throw Error(`wrong binding count ${p.length}/${count}`);
      if (p.some((v) => v === undefined)) throw Error("undefined D1 binding");
      maxParameters = Math.max(maxParameters, p.length);
      if (p.length > 100) throw Error("D1 parameter budget exceeded");
      params = p; return s;
    }, first: async () => exec().results[0] ?? null, all: async () => exec(), run: async () => exec(), _exec: exec };
    return s;
  }
  return { prepare: statement, batch: async (stmts) => {
    db.exec("BEGIN"); let result;
    try { result = stmts.map((s) => s._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    await hooks.afterBatch?.(stmts, result); return result;
  } };
}
const env = (over = {}) => ({ DB: d1(), COOKIE_SECRET: SECRET, VERIFY_SECRET: "synthetic-verify", WATCHER_TOKEN: "synthetic-watcher", GUILD_ID: WRONG,
  DISCORD_APP_ID: BOT, DISCORD_BOT_TOKEN: "synthetic-bot-token", PUBLIC_BASE_URL: "https://verify.example", SITE_HOST: "guild.example", SITE_GUILD_ID: GUILD,
  SITE_ADMINS: STAFF, COMMUNITY_ORGANIZERS: `${ORG},${OTHER}`, COMMUNITY_FEATURES: "events,attendance", INTROS_GUILD_ID: GUILD,
  INTROS_CHANNELS: `raid-signups=${CHANNEL}`, EVENT_DISCORD_DELIVERY: "on", CHANNEL_SERVER_LOG: "", CHANNEL_MOD_ALERTS: "", CHANNEL_NOTICES: "", ...over });
globalThis.fetch = async (input, options = {}) => {
  const u = new URL(input), method = options.method ?? "GET";
  if (u.origin !== "https://discord.com" || !u.pathname.startsWith("/api/v10/")) throw Error("blocked synthetic network");
  const req = { url: u.pathname, method, options, body: options.body ? JSON.parse(options.body) : null }; requests.push(req);
  const intercepted = await hooks.http?.(req);
  if (intercepted !== undefined) return intercepted;
  if (u.pathname === "/api/v10/users/@me") return Response.json({ id: BOT, bot: true });
  if (u.pathname.startsWith(`/api/v10/guilds/${GUILD}/members/`)) return Response.json({ user: { id: u.pathname.split("/").at(-1) }, roles: [] });
  if (u.pathname === `/api/v10/channels/${CHANNEL}`) return Response.json({ id: CHANNEL, guild_id: GUILD, type: 0 });
  if (u.pathname === `/api/v10/channels/${CHANNEL}/messages` && method === "POST") {
    const id = String(400000000000000000n + BigInt(++counter)), m = { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [] };
    messages.set(id, m); await hooks.afterEffect?.(req, m); return Response.json(m);
  }
  const match = u.pathname.match(new RegExp(`^/api/v10/channels/${CHANNEL}/messages/(\\d+)$`));
  if (match) {
    const m = messages.get(match[1]); if (!m) return new Response(null, { status: 404 });
    if (method === "GET") return Response.json(m);
    if (method === "PATCH") { m.content = req.body.content; m.attachments = []; await hooks.afterEffect?.(req, m); return Response.json(m); }
    if (method === "DELETE") { messages.delete(m.id); await hooks.afterEffect?.(req, m); return new Response(null, { status: 204 }); }
  }
  throw Error(`unexpected synthetic Discord request ${method} ${u.pathname}`);
};
// Keep actual credentialFetch/REST code; fake only unrelated notices/role effects reached by existing account erasure.
const discord = load("./discord");
stubs["./discord"] = { ...discord, logLine: async () => {}, staffNotice: async () => {}, removeRole: async () => {}, addRole: async () => {}, guildMember: async () => ({ roles: [] }) };
const worker = load("./index").default, core = load("./site-core"), context = load("./community-context"), events = load("./community-events"), admin = load("./site-admin"), schema = load("./schema");
function seed() {
  db?.close(); db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  hooks = {}; requests = []; messages = new Map(); SQL = []; maxParameters = 0; counter = 0; schema.forgetSchemaCheck();
  for (const who of [ORG, OTHER, MEMBER, STAFF]) {
    db.prepare("INSERT INTO site_users(discord_id,username,global_name,in_server,denied,session_version,first_login,last_login,checked_at) VALUES(?,?,?,1,0,1,?,?,?)").run(who, "Synthetic", "PRIVATE_MEMBER_SENTINEL", at(), at(), at());
    db.prepare("INSERT INTO members(discord_id,banned) VALUES(?,0)").run(who);
    db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)").run(who, "PRIVATE_CHARACTER_SENTINEL", who, at());
  }
}
async function call(method, route, body, who = ORG, over = {}, headers = {}) {
  const cookie = who ? (await core.sessionCookie(env(over), who, 1)).split(";")[0] : "";
  const request = new Request(`https://guild.example${route}`, { method, headers: { Cookie: cookie, Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await worker.fetch(request, env(over), { waitUntil: () => {} });
  return { status: response.status, body: await response.json() };
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const row = () => one("SELECT * FROM community_event_deliveries WHERE event_id=?", EVENT);
const effects = () => requests.filter((r) => r.method !== "GET");
async function event() {
  const result = await call("POST", "/api/community/events", { opId: EVENT, title: "Raid *title* <@123456789012345678>", details: "PRIVATE_DETAILS_SENTINEL", startsAt: new Date((at() + 86400) * 1000).toISOString(), durationMin: 120, capacity: 2 });
  if (result.status !== 200) throw Error(`event fixture refused ${JSON.stringify(result)}`);
  return result.body.event;
}
async function preview() { return (await call("GET", `/api/community/events/discord?eventId=${EVENT}`)).body; }
async function publish(over = {}, op = OP) { const p = await preview(); return call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: p.revision, opId: op, payloadHash: p.payloadHash }, ORG, over); }
let passed = 0, total = 0;
function check(name, value, detail) { total++; if (value) passed++; console.log(`${value ? "PASS" : "FAIL"} ${name}`); if (!value && detail) console.log(detail); }

(async () => {
  seed(); await event();
  let p = await preview();
  check("safe preview uses site host and exact calendar link; no private details/name/character/signup DTO", p.payload.content.includes(`https://guild.example/#/community/calendar/${EVENT}`) && !JSON.stringify(p).includes("PRIVATE_") && !p.payload.content.includes("verify.example") && p.payload.allowed_mentions.parse.length === 0);
  check("free-text title markdown is escaped", p.payload.content.includes("Raid \\*title\\* \\<@123456789012345678\\>"));
  let r = await call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: p.revision, opId: OP, payloadHash: p.payloadHash }, ORG, { EVENT_DISCORD_DELIVERY: "" });
  check("publication defaults OFF, without provider reads/effects or claim", r.status === 503 && requests.length === 0 && !row());
  r = await call("POST", "/api/community/events/discord/publish", {}, null); check("unauthenticated refuses without effects", r.status === 401 && effects().length === 0);
  r = await call("POST", "/api/community/events/discord/publish", {}, MEMBER); check("confirmed non-organizer refuses", r.status === 403 && effects().length === 0);
  r = await call("GET", `/api/community/events/discord?eventId=${EVENT}`, undefined, OTHER); check("another organizer cannot preview another owner's event", r.status === 404);
  r = await call("POST", "/api/community/events/discord/publish", {}, ORG, {}, { Origin: "https://attacker.example" }); check("foreign origin refused", r.status === 403);
  r = await call("POST", "/api/community/events/discord/publish", {}, ORG, {}, { "X-Olympus": "1" }); check("old page refused", r.status === 409);
  r = await call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: 1, opId: OP, payloadHash: p.payloadHash, content: "private" }); check("client content/destination fields are rejected", r.status === 400 && !row());
  r = await publish({ INTROS_GUILD_ID: WRONG }); check("mismatched configured server refuses without HTTP", r.status === 503 && requests.length === 0);
  hooks.http = (req) => req.url === `/api/v10/channels/${CHANNEL}` ? Response.json({ id: CHANNEL, guild_id: WRONG, type: 0 }) : undefined;
  r = await publish(); check("actual channel guild mismatch refuses before claiming/posting", r.status === 409 && !row() && effects().length === 0); hooks = {};
  hooks.http = (req) => req.url === `/api/v10/channels/${CHANNEL}` ? Response.json({ id: CHANNEL, guild_id: GUILD, type: 15 }) : undefined;
  r = await publish(); check("forum channel refuses rather than inventing a forum post surface", r.status === 409 && !row() && effects().length === 0); hooks = {};
  r = await publish({ DISCORD_APP_ID: WRONG }); check("wrong configured application identity refuses before any claim/effect", r.status === 409 && r.body.error === "delivery_destination_unqualified" && !row() && effects().length === 0);
  hooks.http = (req) => req.url === "/api/v10/users/@me" ? Response.json({ id: WRONG, bot: true }) : undefined;
  r = await publish(); check("donor bot token identity refuses before any claim/effect", r.status === 409 && r.body.error === "delivery_destination_unqualified" && !row() && effects().length === 0); hooks = {};
  r = await publish(); check("first publish records posted known custody at parent's exact deadline", r.status === 200 && row().state === "posted" && row().message_id === ONE && row().retain_until === one("SELECT retain_until FROM community_events WHERE id=?", EVENT).retain_until, r);
  check("one create uses empty allowed mentions, durable nonce, and redirect refusal/deadline", effects().length === 1 && effects()[0].body.allowed_mentions.parse.length === 0 && effects()[0].body.enforce_nonce === true && effects()[0].body.nonce === row().claim_nonce && effects()[0].options.redirect === "manual" && !!effects()[0].options.signal);
  r = await publish(); check("same content replay does not issue another HTTP effect", r.status === 200 && r.body.replay === true && effects().length === 1);
  const changed = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 1, title: "Changed raid" });
  r = await publish({}, NEXT); check("changed event updates exact existing bot message, never a second create", changed.status === 200 && r.status === 200 && effects().map((v) => v.method).join() === "POST,PATCH" && messages.size === 1 && row().event_revision === 2);
  const parentBefore = one("SELECT retain_until FROM community_events WHERE id=?", EVENT).retain_until;
  r = await call("POST", "/api/community/events/cancel", { eventId: EVENT, revision: 2 });
  check("cancel atomically marks removal debt and shortens delivery to parent, without claiming provider deletion", r.status === 200 && row().cleanup_requested === 1 && row().retain_until <= parentBefore && row().retain_until === one("SELECT retain_until FROM community_events WHERE id=?", EVENT).retain_until && messages.size === 1);
  r = await call("POST", "/api/community/events/discord/remove", { eventId: EVENT, opId: OP }, ORG, { EVENT_DISCORD_DELIVERY: "" });
  check("explicit cleanup works while publication OFF and deletes only exact known pointer", r.status === 200 && row().state === "removed" && row().message_id === null && row().frozen_content === null && messages.size === 0 && effects().at(-1).method === "DELETE", r);

  for (const [label, response] of [
    ["outage", () => new Response("PRIVATE_MEMBERSHIP_ERROR", { status: 503 })],
    ["not found", () => new Response(null, { status: 404 })],
    ["wrong account", () => Response.json({ user: { id: WRONG } })],
    ["transport failure", () => { throw Error("synthetic membership timeout"); }],
  ]) {
    seed(); await event(); hooks.http = (req) => req.url.startsWith(`/api/v10/guilds/${GUILD}/members/`) ? response() : undefined;
    r = await publish(); check(`fresh membership ${label} holds without claim/effect or inferred departure`, r.status === 409 && r.body.error === "membership_unconfirmed" && !row() && effects().length === 0 && one("SELECT in_server FROM site_users WHERE discord_id=?", ORG).in_server === 1);
  }
  seed(); await event(); db.prepare("UPDATE community_events SET created_at=? WHERE id=?").run(at()-367*86400, EVENT);
  p = await preview(); r = await publish();
  check("publication respects 366 days from original creation, without renewing the start horizon", p.canPublish === false && r.status === 409 && r.body.error === "event_creation_horizon" && requests.length === 0 && !row());
  seed(); await event(); await publish(); requests = [];
  await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 1, title: "Budgeted update" });
  r = await publish({}, NEXT);
  check("real update path is bounded to five HTTP requests with one effect and no retries", r.status === 200 && requests.length === 5 && effects().length === 1 && effects()[0].method === "PATCH");

  for (const [label, mutate] of [
    ["session revoked", () => db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(ORG)],
    ["denied", () => db.prepare("UPDATE site_users SET denied=1 WHERE discord_id=?").run(ORG)],
    ["left server", () => db.prepare("UPDATE site_users SET in_server=0 WHERE discord_id=?").run(ORG)],
    ["banned", () => db.prepare("UPDATE members SET banned=1 WHERE discord_id=?").run(ORG)],
    ["lost roster proof", () => db.prepare("UPDATE characters SET status='departed' WHERE discord_id=?").run(ORG)],
    ["event cancelled", () => db.prepare("UPDATE community_events SET status='cancelled',revision=2 WHERE id=?").run(EVENT)],
    ["event revised", () => db.prepare("UPDATE community_events SET revision=2 WHERE id=?").run(EVENT)],
    ["event started", () => db.prepare("UPDATE community_events SET starts_at=?,ends_at=? WHERE id=?").run(at()-1, at()-1+7200, EVENT)],
  ]) {
    seed(); await event(); let done = false;
    hooks.http = (req) => { if (!done && req.url === `/api/v10/channels/${CHANNEL}`) { done = true; mutate(); } };
    r = await publish(); check(`after destination lookup ${label} admits no claim/effect`, r.status >= 400 && r.status < 500 && !row() && effects().length === 0, r);
  }
  seed(); await event();
  hooks.afterBatch = () => { if (row()?.state === "claimed") { hooks.afterBatch = null; db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(ORG); } };
  r = await publish(); check("revocation after committed claim prevents send, original-session response withheld", r.status === 401 && row().state === "refused" && effects().length === 0);
  seed(); await event(); p = await preview();
  const simultaneous = await Promise.all([OP, NEXT].map((opId) => call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: 1, opId, payloadHash: p.payloadHash })));
  check("actual concurrent double publish admits one durable claim and at most one create", simultaneous.some((v) => v.status === 200) && effects().length === 1 && messages.size === 1 && row().state === "posted", simultaneous);
  seed(); await event();
  hooks.afterEffect = () => { throw Error("synthetic lost POST response"); };
  r = await publish(); check("lost POST response keeps durable unknown and no known pointer", r.status === 409 && row().state === "unknown" && row().message_id === null && messages.size === 1);
  hooks = {}; r = await publish(); check("unknown retry cannot create another message", r.status === 409 && r.body.error === "delivery_held" && effects().length === 1);
  messages.set(WRONG, { ...messages.get(ONE), id: WRONG, nonce: "wrong nonce" });
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: WRONG });
  check("bot author/content alone cannot reconcile an unrelated pointer", r.status === 409 && row().message_id === null);
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: ONE });
  check("exact stored nonce and frozen content reconcile without any new POST", r.status === 200 && row().state === "posted" && row().message_id === ONE && effects().length === 1);

  seed(); await event();
  hooks.afterEffect = () => { db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(ORG); };
  r = await publish(); check("successful send during session revocation keeps pointer held, returns no private payload", r.status === 401 && row().message_id === ONE && row().state === "unknown" && !r.body.delivery);
  seed(); await event();
  hooks.afterEffect = async () => { await admin.deleteSiteData(env(), ORG, STAFF); };
  r = await publish(); check("actual account erase during successful send retains known pointer/debt without resurrecting payload or actor", r.status === 401 && row().message_id === ONE && row().state === "unknown" && row().cleanup_requested === 1 && row().actor === null && row().frozen_content === null && row().payload_hash === null, r);
  seed(); await event();
  hooks.afterEffect = async () => { await call("POST", "/api/community/events/cancel", { eventId: EVENT, revision: 1 }); };
  r = await publish(); check("real cancel while send in flight preserves known pointer and removal debt", r.status === 409 && row().message_id === ONE && row().state === "unknown" && row().cleanup_requested === 1, r);
  seed(); await event();
  hooks.http = (req) => req.method === "POST" ? new Response("PRIVATE_PROVIDER_SENTINEL", { status: 403 }) : undefined;
  r = await publish(); check("definite Discord refusal is retryable, with no provider body in state or reply", r.status === 409 && row().state === "refused" && !JSON.stringify(row()).includes("PRIVATE_PROVIDER") && !JSON.stringify(r).includes("PRIVATE_PROVIDER"));
  hooks = {}; r = await publish(); check("explicit retry after definite refusal issues one successful create", r.status === 200 && row().state === "posted" && messages.size === 1);
  seed(); await event();
  hooks.http = (req) => req.method === "POST" ? new Response("not json", { status: 200 }) : undefined;
  r = await publish(); check("malformed success remains unknown, never known refusal", r.status === 409 && row().state === "unknown");
  seed(); await event();
  hooks.afterBatch = () => { if (row()?.state === "claimed") { hooks.afterBatch = null; throw Error("synthetic lost committed claim result"); } };
  r = await publish(); hooks = {}; const count = effects().length; const again = await publish();
  check("committed claim with lost database response stays held across retry and issues no HTTP effect", r.status === 500 && row().state === "claimed" && again.status === 409 && effects().length === count && count === 0);
  seed(); await event();
  hooks.beforeStatement = (sql) => { if (/UPDATE community_event_deliveries SET message_id=CASE/.test(sql)) { hooks.beforeStatement = null; throw Error("synthetic settlement failure"); } };
  r = await publish(); hooks = {}; const retry = await publish();
  check("failed settlement after successful POST leaves claim held and retry creates nothing", r.status === 500 && row().state === "claimed" && row().message_id === null && messages.size === 1 && retry.status === 409 && effects().length === 1);
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: ONE });
  check("failed-settlement claim can recover exact proven custody without reposting", r.status === 200 && row().message_id === ONE && row().state === "posted" && effects().length === 1);
  messages.get(ONE).author.id = WRONG;
  r = await call("POST", "/api/community/events/discord/remove", { eventId: EVENT, opId: NEXT });
  check("known ID with changed/wrong author cannot authorize deletion", r.status === 409 && messages.has(ONE) && effects().length === 1);

  seed(); await event(); await publish();
  let own = await call("GET", "/api/me/export");
  const text = JSON.stringify(own.body);
  check("real account-copy route includes own delivery status without nonce/message/other identities", own.status === 200 && text.includes("event_delivery") && text.includes("publication") && !text.includes(row().claim_nonce) && !text.includes(ONE) && !text.includes(STAFF), own.status);
  await admin.deleteSiteData(env(), ORG, STAFF);
  check("real erasure wipes copied content and publisher/session evidence while marking finite removal debt", row().actor === null && row().session_version === null && row().session_expires === null && row().frozen_content === null && row().payload_hash === null && row().cleanup_requested === 1 && row().message_id === ONE);
  seed(); await event(); await publish();
  const expired = one("SELECT retain_until FROM community_events WHERE id=?", EVENT).retain_until + 1;
  const deleted = await events.sweepCommunityEvents(env(), expired);
  const audit = one("SELECT details FROM audit WHERE action='community.events_expired'");
  check("expiry removes parent and finite delivery metadata in same batch, reports remote unresolved count", deleted === 1 && !row() && messages.size === 1 && JSON.parse(audit.details).discordUnresolved === 1);
  seed(); await event(); await publish();
  hooks.beforeStatement = (sql) => { if (/DELETE FROM community_events WHERE/.test(sql)) { hooks.beforeStatement = null; throw Error("synthetic expiry rollback"); } };
  let refused = false; try { await events.sweepCommunityEvents(env(), row().retain_until + 1); } catch { refused = true; }
  check("failed parent expiry rolls back publication disposal in the same transaction", refused && !!row() && !!one("SELECT 1 FROM community_events WHERE id=?", EVENT));
  const canonicalDDL = one("SELECT sql FROM sqlite_master WHERE name='community_event_deliveries'").sql.replace(/\s+/g, " ");
  db.exec("DROP TABLE community_event_deliveries"); schema.forgetSchemaCheck(); hooks = {}; await schema.ensureSchema(env());
  const initializedDDL = one("SELECT sql FROM sqlite_master WHERE name='community_event_deliveries'").sql.replace(/\s+/g, " ");
  check("actual self-migration recreates exact canonical delivery table shape", initializedDDL === canonicalDDL && !!one("SELECT 1 FROM sqlite_master WHERE name='community_event_deliveries_retain'"));
  db.exec("DROP TABLE community_event_deliveries"); db.exec(fs.readFileSync(path.join(root, "migrations", "2026-10-10-event-discord-publication.sql"), "utf8"));
  check("dated migration has exact canonical table/index parity", one("SELECT sql FROM sqlite_master WHERE name='community_event_deliveries'").sql.replace(/\s+/g, " ") === canonicalDDL && !!one("SELECT 1 FROM sqlite_master WHERE name='community_event_deliveries_retain'"));
  check("every observed statement respects D1's 100-bound-parameter limit", maxParameters <= 100, maxParameters);
  console.log(`\n${passed}/${total} passed`); process.exitCode = passed === total ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
