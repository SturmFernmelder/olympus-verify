// Owner item 3, stage 1 (14 Oct 2026): the sign-up buttons. The delivery fixture (real Worker routing, signed sessions, calendar
// writers and schema over SQLite; synthetic Discord HTTP) plus genuine Ed25519-signed component interactions through the Worker's
// /interactions route, so the signature check, the replay ledger, the privacy capture and the handler all run for real.
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");
const entry = require('./helpers/privacy129_fixture.cjs');
const RealDate = Date; let T = Math.floor(RealDate.now()/1000), nativeT = T;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [T*1000])); }
  static now() { return T*1000; }
};
const cache = {}, stubs = {};
function load(name) {
  if (name === "node:async_hooks") return require(name);
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} }; cache[name] = mod;
  const file = path.join(root, "src", name.replace(/^\.\//, "") + ".ts");
  const body = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", body)(mod, mod.exports, load);
  return mod.exports;
}
let db, nativePort, hooks, requests, messages, SQL, maxParameters, counter, sessionCookies, issuedCookies;
const ORG = "300000000000000002", OTHER = "300000000000000003", MEMBER = "300000000000000004", STAFF = "300000000000000005";
const GUILD = "300000000000000006", CHANNEL = "300000000000000007", BOT = "300000000000000008", WRONG = "300000000000000009";
const EVENT = "E".repeat(22), OP = "P".repeat(22), NEXT = "Q".repeat(22);
const ONE = "400000000000000001";
const SECRET = "synthetic-cookie-secret-0123456789";
const at = () => Math.floor(Date.now() / 1000);
function d1() { return nativePort; }
function nativeAdapter() {
  return entry.originalNativePort(db, {
    statement(sql,params) {
      SQL.push({sql,params}); maxParameters=Math.max(maxParameters,params.length);
      if(params.length>100 || params.some(value=>value===undefined)) throw Error('invalid Native D1 bindings');
      hooks.beforeStatement?.(sql,params);
    },
    beforeBatch: async plan => { await hooks.beforeBatch?.(plan); },
    afterBatch: async (plan,result) => {
      // Existing concurrent mutations run after the real atomic group commits,
      // rather than issuing an unadmitted raw write inside its transaction.
      for(let i=0;i<plan.length;i++) await hooks.afterStatement?.(plan[i].statement,plan[i].params,result[i]);
      await hooks.afterBatch?.(plan,result);
    },
  });
}
async function fixtureRun(sql,...params) {
  const admitted=load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(nativePort,'writer','canonical',entry.ENTRY_EPOCH);
  return admitted.prepare(sql).bind(...params).run();
}
function directEnv(over={}) {
  const e=env(over);
  return {...e,DB:load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(nativePort,'writer','canonical',entry.ENTRY_EPOCH)};
}
const env = (over = {}) => entry.currentEntryEnvironment({ DB: d1(), COOKIE_SECRET: SECRET, VERIFY_SECRET: "synthetic-verify", WATCHER_TOKEN: "synthetic-watcher", GUILD_ID: WRONG,
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
    const id = String(400000000000000000n + BigInt(++counter)), m = { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: req.body.components ?? [] };
    messages.set(id, m); await hooks.afterEffect?.(req, m); return Response.json(m);
  }
  const match = u.pathname.match(new RegExp(`^/api/v10/channels/${CHANNEL}/messages/(\\d+)$`));
  if (match) {
    const m = messages.get(match[1]); if (!m) return new Response(null, { status: 404 });
    if (method === "GET") return Response.json(m);
    if (method === "PATCH") { m.content = req.body.content; m.attachments = []; m.components = req.body.components ?? []; await hooks.afterEffect?.(req, m); return Response.json(m); }
    if (method === "DELETE") { messages.delete(m.id); await hooks.afterEffect?.(req, m); return new Response(null, { status: 204 }); }
  }
  throw Error(`unexpected synthetic Discord request ${method} ${u.pathname}`);
};
// Keep actual credentialFetch/REST code; fake only unrelated notices/role effects reached by existing account erasure.
const discord = load("./discord");
stubs["./discord"] = { ...discord, logLine: async () => {}, staffNotice: async () => {}, removeRole: async () => {}, addRole: async () => {}, guildMember: async () => ({ roles: [] }) };
const worker = load("./index").default, core = load("./site-core"), context = load("./community-context"), events = load("./community-events"), admin = load("./site-admin"), schema = load("./schema");
async function seed() {
  db?.close(); T=Math.floor(RealDate.now()/1000); nativeT=T;
  db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  db.function('strftime',(format,input)=>{if(format!=='%s'||input!=='now')throw Error('unexpected fixture Native clock');return String(nativeT);});
  entry.installCurrentEntryEpoch(db,{now:T});
  hooks = {}; requests = []; messages = new Map(); SQL = []; maxParameters = 0; counter = 0; sessionCookies = new Map(); issuedCookies = new Map(); nativePort=nativeAdapter(); schema.forgetSchemaCheck();
  for (const who of [ORG, OTHER, MEMBER, STAFF]) {
    await fixtureRun("INSERT INTO site_users(discord_id,username,global_name,in_server,denied,session_version,first_login,last_login,checked_at) VALUES(?,?,?,1,0,1,?,?,?)",who, "Synthetic", "PRIVATE_MEMBER_SENTINEL", at(), at(), at());
    await fixtureRun("INSERT INTO members(discord_id,banned) VALUES(?,0)",who);
    await fixtureRun("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)",who, "PRIVATE_CHARACTER_SENTINEL", who, at());
    issuedCookies.set(who,await entry.issueOriginalEntryCookie(name=>load('./'+name),db,env(),who));
  }
  SQL=[];
}
async function call(method, route, body, who = ORG, over = {}, headers = {}) {
  // A browser carries its original signed session across requests. Store the promise before awaiting
  // signing so concurrent requests cannot issue competing expiries. A new seed is a new browser session.
  if (who && !sessionCookies.has(who)) sessionCookies.set(who, Promise.resolve(issuedCookies.get(who)?.cookie ?? ''));
  const cookie = who ? await sessionCookies.get(who) : "";
  const request = new Request(`https://guild.example${route}`, { method, headers: { Cookie: cookie, Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await worker.fetch(request, env(over), { waitUntil: () => {} });
  return { status: response.status, body: await response.json() };
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const row = () => one("SELECT * FROM community_event_deliveries WHERE event_id=?", EVENT);
const effects = () => requests.filter((r) => r.method !== "GET");
const incarnationColumnDDL=field=>`, ${field} TEXT CHECK(${field} IS NULL OR (typeof(${field})='text' AND length(${field})=32 AND length(CAST(${field} AS BLOB))=32 AND instr(${field},char(0))=0 AND ${field} NOT GLOB '*[^0-9a-f]*'))`;
async function event() {
  const result = await call("POST", "/api/community/events", { opId: EVENT, title: "Raid *title* <@123456789012345678>", details: "PRIVATE_DETAILS_SENTINEL", startsAt: new Date((at() + 86400) * 1000).toISOString(), durationMin: 120, capacity: 2 });
  if (result.status !== 200) throw Error(`event fixture refused ${JSON.stringify(result)}`);
  return result.body.event;
}
async function preview() { return (await call("GET", `/api/community/events/discord?eventId=${EVENT}`)).body; }
async function publish(over = {}, op = OP) { const p = await preview(); return call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: p.revision, opId: op, payloadHash: p.payloadHash }, ORG, over); }
let passed = 0, total = 0;
function check(name, value, detail) { total++; if (value) passed++; console.log(`${value ? "PASS" : "FAIL"} ${name}`); if (!value && detail) console.log(detail); }

// Exercise the existing original staff Request and purpose-bound delete route.
async function deleteThroughOriginalRoute(target,actor) {
  const prep=await call('GET','/api/admin/users/'+target+'/decision-target?route=delete&decisionAction=partial_delete',undefined,actor);
  if(prep.status!==200 || typeof prep.body.targetToken!=='string')throw Error('original delete preparation held '+JSON.stringify(prep));
  const result=await call('POST','/api/admin/users/'+target+'/delete',{mentions:false},actor,{}, {'X-Olympus-Decision-Target':prep.body.targetToken,'X-Olympus-Decision-Action':'partial_delete'});
  if(result.status!==200)throw Error('original delete held '+JSON.stringify(result));
  return result.body.ok===true;
}


const ROLE = "300000000000000010", STRANGER = "300000000000000011";
let keys, pub, clicks = 0;
const nextId = () => String(500000000000000000n + BigInt(++clicks));
async function interact(i, over = {}) {
  const body = JSON.stringify(i), ts = String(at());
  const sig = Buffer.from(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(ts + body))).toString("hex");
  const res = await worker.fetch(new Request("https://verify.example/interactions", { method: "POST", headers: { "Content-Type": "application/json", "X-Signature-Ed25519": sig, "X-Signature-Timestamp": ts }, body }), env({ GUILD_ID: GUILD, DISCORD_PUBLIC_KEY: pub, ROLE_GUILD_MEMBER: ROLE, ...over }), { waitUntil: () => {} });
  return { status: res.status, body: await res.json() };
}
async function click(who, eventId, revision, status, over = {}, id = nextId(), roles = [ROLE], channel = CHANNEL) {
  const r = await interact({ type: 3, id, application_id: BOT, token: "synthetic-token", guild_id: GUILD, channel_id: channel, member: { user: { id: who, username: "Synthetic", global_name: null }, roles }, data: { custom_id: `raid:rsvp:${eventId}:${revision}:${status}`, component_type: 2 }, message: { id: "400000000000000001", channel_id: channel } }, over);
  return { ...r, id, text: r.body?.data?.content ?? "" };
}
const signup = (who) => one("SELECT status, revision, character_name, raid_role FROM community_event_signups WHERE event_id=? AND discord_id=?", EVENT, who);
const audits = (who) => one("SELECT COUNT(*) AS n FROM audit WHERE action='community.rsvp' AND actor=?", who).n;
const ephemeral = (r) => r.status === 200 && r.body.type === 4 && r.body.data.flags === 64 && r.body.data.allowed_mentions.parse.length === 0;

(async () => {
  keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  pub = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("hex");
  const delivery = load("./community-event-delivery");
  await seed(); await event();
  let p = await preview();
  const ids = p.payload.components[0].components.map((c) => c.custom_id ?? c.url).join("|");
  check("the preview payload carries one action row: three sign-up buttons bound to the event and its revision, the Remind me toggle (stage 2) and the site link",
    Array.isArray(p.payload.components) && p.payload.components.length === 1 && p.payload.components[0].type === 1 && ids === `raid:rsvp:${EVENT}:1:yes|raid:rsvp:${EVENT}:1:tentative|raid:rsvp:${EVENT}:1:no|raid:remind:${EVENT}:1|https://guild.example/#/community/calendar/${EVENT}`
    && p.payload.components[0].components.every((c) => c.type === 2 && typeof c.label === "string") && p.payload.components[0].components[4].style === 5 && p.payload.allowed_mentions.parse.length === 0 && !JSON.stringify(p).includes("PRIVATE_"), JSON.stringify(p.payload));
  const hash1 = p.payloadHash;
  let r = await publish();
  check("publish sends the buttons with the text and settles posted on an exact echo", r.status === 200 && row().state === "posted" && effects().at(-1).body.components.length === 1 && [...messages.values()][0].components[0].components.length === 5, JSON.stringify(r));

  // one click by a seeded member with a site account
  r = await click(MEMBER, EVENT, 1, "yes");
  check("a verified member signs up with one click: ephemeral answer, one row, generation moved, ref and audit written, nothing private echoed",
    ephemeral(r) && /Signed up/.test(r.text) && r.text.includes(`https://guild.example/#/community/calendar/${EVENT}`) && signup(MEMBER)?.status === "yes" && signup(MEMBER).revision === 1 && signup(MEMBER).character_name === null
    && one("SELECT signup_generation AS g FROM community_events WHERE id=?", EVENT).g === 1 && one("SELECT COUNT(*) AS n FROM community_refs WHERE discord_id=?", MEMBER).n === 1 && audits(MEMBER) === 1 && !JSON.stringify(r.body).includes("PRIVATE_"), JSON.stringify(r));
  const first = r;
  r = await click(MEMBER, EVENT, 1, "tentative");
  check("a second click changes the answer and moves its revision; character and role stay as the site left them", ephemeral(r) && /tentative/.test(r.text) && signup(MEMBER).status === "tentative" && signup(MEMBER).revision === 2 && signup(MEMBER).raid_role === null && audits(MEMBER) === 2, JSON.stringify(r));
  const again = await click(MEMBER, EVENT, 1, "yes", {}, first.id);
  check("a replayed interaction id gets the first answer back from the ledger and writes nothing", again.status === 200 && JSON.stringify(again.body) === JSON.stringify(first.body) && signup(MEMBER).status === "tentative" && signup(MEMBER).revision === 2 && audits(MEMBER) === 2, JSON.stringify(again));
  const mine = await call("GET", `/api/community/event?id=${EVENT}`, undefined, MEMBER);
  check("the site shows the button answer as the member's own, with their stored revision", mine.status === 200 && mine.body.event.mine.status === "tentative" && mine.body.event.mine.revision === 2 && mine.body.event.counts.tentative === 1, JSON.stringify(mine.body.event));
  const site = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "yes", revision: 2, character: "Synthetic Char", raidRole: "healer" }, MEMBER);
  check("the site path still edits a known revision and sets character and role", site.status === 200 && signup(MEMBER).status === "yes" && signup(MEMBER).revision === 3 && signup(MEMBER).raid_role === "healer", JSON.stringify(site.body));
  r = await click(MEMBER, EVENT, 1, "no");
  check("a later click keeps the site's character and role", signup(MEMBER).status === "no" && signup(MEMBER).revision === 4 && signup(MEMBER).character_name === "Synthetic Char" && signup(MEMBER).raid_role === "healer", JSON.stringify(r));
  const stale = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "yes", revision: 1 }, MEMBER);
  check("the site path is unchanged for a stale own revision", stale.status === 409 && stale.body.error === "stale_revision", JSON.stringify(stale.body));

  // the organizer edits: buttons from the earlier revision refuse in words; the preview hash moves with the revision
  const upd = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 1, title: "Raid renamed" });
  check("fixture: the organizer's edit lands", upd.status === 200 && upd.body.event.revision === 2, JSON.stringify(upd.body));
  r = await click(MEMBER, EVENT, 1, "yes");
  check("a button from an earlier event revision is refused in words, writing nothing", ephemeral(r) && /changed since these buttons were posted/.test(r.text) && signup(MEMBER).status === "no" && signup(MEMBER).revision === 4 && audits(MEMBER) === 4, JSON.stringify(r));
  r = await click(MEMBER, EVENT, 2, "yes");
  check("the current revision's button works", ephemeral(r) && /Signed up/.test(r.text) && signup(MEMBER).status === "yes" && signup(MEMBER).revision === 5, JSON.stringify(r));
  p = await preview();
  check("the preview hash moves with the revision because the buttons carry it; the stored announcement is stale", p.payloadHash !== hash1 && p.payload.components[0].components[0].custom_id === `raid:rsvp:${EVENT}:2:yes` && p.delivery.stale === true, JSON.stringify(p));
  r = await publish({}, NEXT); const posted = [...messages.values()][0];
  check("the organizer's update patches text and buttons together and settles posted", r.status === 200 && row().state === "posted" && posted.components[0].components[0].custom_id === `raid:rsvp:${EVENT}:2:yes` && posted.content.includes("Raid renamed"), JSON.stringify(r));

  // capacity: two places; the site and a button fill them; the third click is told so and can still answer Tentative
  await seed(); await event();
  const org = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "yes", revision: 0 }, ORG);
  r = await click(OTHER, EVENT, 1, "yes");
  check("fixture: two places taken, one by the site and one by a button", org.status === 200 && ephemeral(r) && signup(OTHER)?.status === "yes", JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "yes");
  check("a full raid refuses a Sign up click in words, writing nothing", ephemeral(r) && /full/.test(r.text) && !signup(MEMBER) && audits(MEMBER) === 0, JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "tentative");
  check("Tentative still lands on a full raid", ephemeral(r) && signup(MEMBER)?.status === "tentative", JSON.stringify(r));
  const seen = await call("GET", `/api/community/event?id=${EVENT}`, undefined, ORG);
  check("the organizer's sign-up list shows the button answers like any other", seen.body.event.counts.yes === 2 && seen.body.event.counts.tentative === 1 && seen.body.signups.length === 3, JSON.stringify(seen.body.event.counts) + JSON.stringify(seen.body.signups));

  // who may not: no site account, no member role, departed, denied, banned, off the roster, an open erasure job, a closing account
  r = await click(STRANGER, EVENT, 1, "yes");
  check("a member without a site account gets the site pointer and no row", ephemeral(r) && /Sign in on the guild site once/.test(r.text) && !signup(STRANGER) && one("SELECT COUNT(*) AS n FROM community_event_signups").n === 3, JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "no", {}, undefined, []);
  check("without the member role the click is answered from the snapshot and nothing is written", ephemeral(r) && /verified guild members/.test(r.text) && signup(MEMBER).status === "tentative", JSON.stringify(r));
  await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?", MEMBER); r = await click(MEMBER, EVENT, 1, "no");
  check("a departed account is refused before any batch", ephemeral(r) && /Sign in on the guild site/.test(r.text) && signup(MEMBER).status === "tentative", JSON.stringify(r));
  await fixtureRun("UPDATE site_users SET in_server=1, denied=1 WHERE discord_id=?", MEMBER); r = await click(MEMBER, EVENT, 1, "no");
  check("a denied account is refused before any batch", ephemeral(r) && signup(MEMBER).status === "tentative", JSON.stringify(r));
  await fixtureRun("UPDATE site_users SET denied=0 WHERE discord_id=?", MEMBER);
  await fixtureRun("UPDATE members SET banned=1 WHERE discord_id=?", MEMBER); r = await click(MEMBER, EVENT, 1, "no");
  check("a banned member is refused inside the batch and told to use the site", ephemeral(r) && /could not be confirmed/.test(r.text) && signup(MEMBER).status === "tentative" && audits(MEMBER) === 1, JSON.stringify(r));
  await fixtureRun("UPDATE members SET banned=0 WHERE discord_id=?", MEMBER);
  await fixtureRun("UPDATE characters SET status='left' WHERE discord_id=?", MEMBER); r = await click(MEMBER, EVENT, 1, "no");
  check("a member without a roster-confirmed character is refused inside the batch", ephemeral(r) && /could not be confirmed/.test(r.text) && signup(MEMBER).status === "tentative", JSON.stringify(r));
  await fixtureRun("UPDATE characters SET status='member' WHERE discord_id=?", MEMBER);
  const gen = one("SELECT generation FROM privacy_subjects WHERE subject_id=?", MEMBER)?.generation ?? "0".repeat(32);
  await fixtureRun("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until) VALUES(?,?,?,?,1,?,'waiting_role',?,?)", "a".repeat(32), MEMBER, gen, "b".repeat(64), at() + 3600, at(), at() + 31622400);
  r = await click(MEMBER, EVENT, 1, "no");
  check("an open erasure job refuses the batch", ephemeral(r) && /could not be confirmed/.test(r.text) && signup(MEMBER).status === "tentative", JSON.stringify(r));
  await fixtureRun("DELETE FROM privacy_serving_jobs WHERE subject_id=?", MEMBER);
  r = await click(MEMBER, EVENT, 1, "no");
  check("fixture: the member answers again once every fact holds", ephemeral(r) && signup(MEMBER).status === "no", JSON.stringify(r));

  // the fact changes between the capture and the batch: the fence inside the batch refuses, nothing adopts the newer fact
  let armed = false;
  // The race write happens inside the admitted group's own window (the fixture's native port keeps the admission slot armed for the batch), which is the only moment it can land between the capture and the fence.
  hooks.beforeBatch = async (plan) => { if (!armed && plan.some((s) => s.statement.includes("privacy_discord_request_refused"))) { armed = true; db.prepare("UPDATE characters SET status='left' WHERE discord_id=?").run(MEMBER); } };
  r = await click(MEMBER, EVENT, 1, "yes");
  hooks.beforeBatch = undefined;
  check("a roster change between the capture and the batch refuses inside the batch; the answer is untouched", armed && ephemeral(r) && /could not be confirmed/.test(r.text) && signup(MEMBER).status === "no", JSON.stringify(r));
  await fixtureRun("UPDATE characters SET status='member' WHERE discord_id=?", MEMBER);

  // where and when the buttons do not apply
  r = await click(MEMBER, EVENT, 1, "yes", {}, undefined, [ROLE], WRONG);
  check("a click outside the raid-signups channel is refused in words", ephemeral(r) && /raid-signups channel/.test(r.text) && signup(MEMBER).status === "no", JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "yes", { EVENT_DISCORD_DELIVERY: "" });
  check("with publication off the buttons say so and write nothing", ephemeral(r) && /switched off/.test(r.text) && signup(MEMBER).status === "no", JSON.stringify(r));
  r = await interact({ type: 3, id: nextId(), application_id: BOT, token: "t", guild_id: GUILD, channel_id: CHANNEL, member: { user: { id: MEMBER, username: "Synthetic" }, roles: [ROLE] }, data: { custom_id: "raid:rsvp:nope:1:yes", component_type: 2 } });
  check("a malformed raid custom_id is an unknown component", r.status === 200 && r.body.data.content === "Unknown component.", JSON.stringify(r));
  const cancelled = await call("POST", "/api/community/events/cancel", { eventId: EVENT, revision: 1 });
  r = await click(MEMBER, EVENT, 2, "yes");
  check("a cancelled raid answers so", cancelled.status === 200 && ephemeral(r) && /cancelled/.test(r.text) && signup(MEMBER).status === "no", JSON.stringify(r));
  await seed(); await event(); nativeT = T + 2 * 86400;
  r = await click(MEMBER, EVENT, 1, "yes");
  check("a started raid closes sign-ups by the database clock", ephemeral(r) && /already started/.test(r.text) && !signup(MEMBER), JSON.stringify(r));
  nativeT = T;

  // custody: an unknown create reconciles only against the exact text AND the exact buttons
  await seed(); await event(); p = await preview();
  hooks.http = async (req) => { if (req.method === "POST" && req.url === `/api/v10/channels/${CHANNEL}/messages`) { const id = String(400000000000000000n + BigInt(++counter)); messages.set(id, { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: req.body.components }); return new Response(null, { status: 500 }); } };
  r = await publish(); hooks.http = undefined;
  const lost = [...messages.keys()][0];
  check("fixture: a lost create reply is held unknown with no pointer", r.status === 409 && row().state === "unknown" && row().message_id === null, JSON.stringify(r));
  const withButtons = messages.get(lost).components; messages.get(lost).components = [];
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: lost });
  check("the right text with different buttons reconciles as delivery_mismatch, never posted", r.status === 409 && r.body.error === "delivery_mismatch" && row().state === "unknown", JSON.stringify(r));
  messages.get(lost).components = withButtons; messages.get(lost).mention_everyone = true;
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: lost });
  check("the bot's own message with the right text but an everyone mention is not the payload: delivery_mismatch", r.status === 409 && r.body.error === "delivery_mismatch" && row().state === "unknown", JSON.stringify(r));
  messages.get(lost).mention_everyone = false;
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: lost });
  check("the exact text and buttons reconcile as posted", r.status === 200 && row().state === "posted" && row().message_id === lost, JSON.stringify(r));
  await seed(); await event();
  hooks.http = async (req) => { if (req.method === "POST" && req.url === `/api/v10/channels/${CHANNEL}/messages`) { const id = String(400000000000000000n + BigInt(++counter)); const m = { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: [] }; messages.set(id, m); return Response.json(m); } };
  r = await publish(); hooks.http = undefined;
  check("a create whose echo lacks the buttons is held with delivery_mismatch and the pointer, not posted", r.status === 409 && row().state === "unknown" && row().result_code === "delivery_mismatch" && row().message_id !== null, JSON.stringify(r));

  // v2 (Codex raid review v1): a disabled button is never the payload; a changed host cannot reconcile an old effect
  await seed(); await event();
  hooks.http = async (req) => { if (req.method === "POST" && req.url === `/api/v10/channels/${CHANNEL}/messages`) { const id = String(400000000000000000n + BigInt(++counter)); const m = { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: [{ type: 1, components: req.body.components[0].components.map((c, i) => (i === 0 ? { ...c, disabled: true } : c)) }] }; messages.set(id, m); return Response.json(m); } };
  r = await publish(); hooks.http = undefined;
  check("a create whose echo disables the Sign up button is held with delivery_mismatch, never posted", r.status === 409 && row().state === "unknown" && row().result_code === "delivery_mismatch", JSON.stringify(r));
  let held = [...messages.keys()][0];
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: held });
  check("reconciling a message with a disabled button is delivery_mismatch", r.status === 409 && r.body.error === "delivery_mismatch" && row().state === "unknown", JSON.stringify(r));
  messages.get(held).components[0].components[0].disabled = false; messages.get(held).components[0].components[0].emoji = { name: "🗡️" };
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: held });
  check("an echo with an emoji on Sign up is authored content, not the payload: delivery_mismatch", r.status === 409 && r.body.error === "delivery_mismatch" && row().state === "unknown", JSON.stringify(r));
  delete messages.get(held).components[0].components[0].emoji; messages.get(held).components[0].components[0].sku_id = "1";
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: held });
  check("an echo with a sku_id is premium content, not the payload: delivery_mismatch", r.status === 409 && r.body.error === "delivery_mismatch" && row().state === "unknown", JSON.stringify(r));
  delete messages.get(held).components[0].components[0].sku_id; messages.get(held).components[0].components[0].id = 7;
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: held });
  check("an enabled echo with only the harmless autogenerated id reconciles as posted", r.status === 200 && row().state === "posted", JSON.stringify(r));
  await seed(); await event();
  hooks.http = async (req) => { if (req.method === "POST" && req.url === `/api/v10/channels/${CHANNEL}/messages`) { const id = String(400000000000000000n + BigInt(++counter)); const m = { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: [{ type: 1, components: req.body.components[0].components.map((c, i) => (i === 0 ? { ...c, emoji: { name: "🗡️" } } : c)) }] }; messages.set(id, m); return Response.json(m); } };
  r = await publish(); hooks.http = undefined;
  check("a create whose echo adds an emoji to Sign up is held with delivery_mismatch, never posted", r.status === 409 && row().state === "unknown" && row().result_code === "delivery_mismatch", JSON.stringify(r));
  await seed(); await event();
  hooks.http = async (req) => { if (req.method === "POST" && req.url === `/api/v10/channels/${CHANNEL}/messages`) { const id = String(400000000000000000n + BigInt(++counter)); messages.set(id, { id, channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: req.body.content, nonce: req.body.nonce, embeds: [], attachments: [], components: req.body.components }); return new Response(null, { status: 500 }); } };
  r = await publish(); hooks.http = undefined; held = [...messages.keys()][0];
  const moved = messages.get(held); moved.content = moved.content.replace("https://guild.example/", "https://other.example/"); moved.components[0].components[4].url = moved.components[0].components[4].url.replace("https://guild.example/", "https://other.example/"); // stage 2: the link is the fifth button
  // The canonical-host gate refuses a request for another host before any handler; the probe therefore calls the real
  // handler with a real context (past that gate) under the changed configuration, as Codex's probe did.
  const otherEnv = env({ SITE_HOST: "other.example" }), otherRequest = new Request("https://other.example/api/community/events/discord/reconcile", { method: "POST", headers: { Cookie: await sessionCookies.get(ORG), Origin: "https://other.example", "X-Olympus": "2", "Content-Type": "application/json" }, body: JSON.stringify({ eventId: EVENT, opId: OP, messageId: held }) });
  const otherResponse = await load("./community-event-delivery").eventDeliveryReconcile(otherRequest, otherEnv, await context.communityContext(otherEnv, otherRequest));
  r = { status: otherResponse.status, body: await otherResponse.json() };
  check("after a lost create, a changed site host cannot reconcile a message built for the new host: the reconstructed payload no longer hashes to the stored hash", r.status === 409 && r.body.error === "delivery_custody_unqualified" && row().state === "unknown", JSON.stringify(r));
  moved.content = moved.content.replace("https://other.example/", "https://guild.example/"); moved.components[0].components[4].url = moved.components[0].components[4].url.replace("https://other.example/", "https://guild.example/");
  r = await call("POST", "/api/community/events/discord/reconcile", { eventId: EVENT, opId: OP, messageId: held });
  check("with the original host the same message reconciles as posted", r.status === 200 && row().state === "posted", JSON.stringify(r));

  // the comparison itself
  const base = { id: "1", channel_id: CHANNEL, author: { id: BOT, bot: true }, type: 0, content: "x", embeds: [], attachments: [], components: delivery.componentsOf(EVENT, 1, "guild.example") };
  const rows = delivery.componentsOf(EVENT, 1, "guild.example");
  check("exactPayload: exact passes; an extra button, a changed label, a changed url, a role mention or a user mention fails",
    delivery.exactPayload(base, "x", rows) && !delivery.exactPayload({ ...base, components: [{ type: 1, components: [...rows[0].components, { type: 2, style: 1, label: "Extra", custom_id: "x" }] }] }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 0 ? { ...c, label: "Join" } : c)) }] }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 3 ? { ...c, url: "https://evil.example/" } : c)) }] }, "x", rows)
    && !delivery.exactPayload({ ...base, mention_roles: ["1"] }, "x", rows) && !delivery.exactPayload({ ...base, mentions: [{ id: "1" }] }, "x", rows) && !delivery.exactPayload({ ...base, content: "y" }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 1 ? { ...c, disabled: true } : c)) }] }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 1 ? { ...c, unknown_field: 1 } : c)) }] }, "x", rows)
    && delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c) => ({ ...c, id: 3, disabled: false })) }] }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 2 ? { ...c, emoji: { name: "x" } } : c)) }] }, "x", rows)
    && !delivery.exactPayload({ ...base, components: [{ type: 1, components: rows[0].components.map((c, i) => (i === 3 ? { ...c, sku_id: "1" } : c)) }] }, "x", rows));
  check("bound parameters stay under the D1 limit in every statement", maxParameters <= 100 && maxParameters >= 16, String(maxParameters));
  // ---------- stage 2 (15 Oct 2026): the Remind me toggle, the organizer's roster decisions on the sign-up row, the copy, erasure and the sweep ----------
  await seed(); await event();
  T += 61; // the Discord button limiter counts 30 answers per member per minute on the mocked clock: the stage-2 cases start a fresh minute
  const press = (who, revision = 1, id = nextId()) => interact({ type: 3, id, application_id: BOT, token: "synthetic-token", guild_id: GUILD, channel_id: CHANNEL, member: { user: { id: who, username: "Synthetic", global_name: null }, roles: [ROLE] }, data: { custom_id: `raid:remind:${EVENT}:${revision}`, component_type: 2 }, message: { id: ONE } }).then((x) => ({ ...x, text: x.body?.data?.content ?? "" }));
  const mention = (who) => one("SELECT remind_mention AS m, revision FROM community_event_signups WHERE event_id=? AND discord_id=?", EVENT, who);
  r = await press(MEMBER);
  check("Remind me without a sign-up is refused in words and writes nothing", ephemeral(r) && /Sign up first/.test(r.text) && !signup(MEMBER), JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "yes");
  check("fixture: the member signs up by button; the answer says nothing about a roster yet", ephemeral(r) && /Signed up/.test(r.text) && !/organizer has you/.test(r.text) && mention(MEMBER).m === 0, JSON.stringify(r));
  r = await press(MEMBER);
  check("Remind me on an existing sign-up turns the mention on, moves the revision and is audited", ephemeral(r) && /will be mentioned/.test(r.text) && mention(MEMBER).m === 1 && mention(MEMBER).revision === 2 && audits(MEMBER) === 2, JSON.stringify(r));
  r = await press(MEMBER);
  check("a second press turns it off", ephemeral(r) && /will not be mentioned/.test(r.text) && mention(MEMBER).m === 0 && mention(MEMBER).revision === 3, JSON.stringify(r));
  r = await press(MEMBER, 2);
  check("a Remind me from another event revision is refused in words", ephemeral(r) && /changed since these buttons were posted/.test(r.text) && mention(MEMBER).m === 0, JSON.stringify(r));
  r = await interact({ type: 3, id: nextId(), application_id: BOT, token: "synthetic-token", guild_id: GUILD, channel_id: CHANNEL, member: { user: { id: MEMBER, username: "Synthetic", global_name: null }, roles: [ROLE] }, data: { custom_id: `raid:rsvp:${EVENT}:1`, component_type: 2 }, message: { id: ONE } });
  check("a malformed custom_id (rsvp without a status) is an unknown component", r.status === 200 && /Unknown component/.test(r.body?.data?.content ?? ""), JSON.stringify(r.body));
  let site2 = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "yes", revision: 3, remindMention: true }, MEMBER);
  check("the site checkbox sets the mention choice and the event DTO shows it", site2.status === 200 && mention(MEMBER).m === 1 && site2.body.event.mine.remindMention === true && site2.body.event.mine.decision === null, JSON.stringify(site2.body));
  site2 = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "tentative", revision: 4 }, MEMBER);
  check("an answer without the field keeps the stored choice", site2.status === 200 && mention(MEMBER).m === 1 && site2.body.event.mine.remindMention === true, JSON.stringify(site2.body));
  site2 = await call("PUT", "/api/community/events/rsvp", { eventId: EVENT, status: "yes", revision: 5, remindMention: "yes" }, MEMBER);
  check("a non-boolean choice is refused", site2.status === 400 && site2.body.error === "invalid_remind_mention" && mention(MEMBER).revision === 5, JSON.stringify(site2.body));

  // the roster: ORG created the event (capacity 2); OTHER is an organizer who does not manage it; STAFF may
  const decide = (who, entries) => call("POST", "/api/community/events/decide", { eventId: EVENT, entries }, who);
  const listing = async (who = ORG) => (await call("GET", `/api/community/event?id=${EVENT}`, undefined, who)).body;
  const decision = (who) => { const d = one("SELECT decision, decided_by, decided_at, decision_revision AS revision FROM community_event_signups WHERE event_id=? AND discord_id=?", EVENT, who); return d && d.decision !== null ? d : null; };
  const drevision = (who) => one("SELECT decision_revision AS revision, decided_by, decided_at FROM community_event_signups WHERE event_id=? AND discord_id=?", EVENT, who);
  r = await click(OTHER, EVENT, 1, "yes"); r = await click(ORG, EVENT, 1, "tentative");
  let L = await listing();
  check("fixture: three answers; organizers see refs and a null decision at revision 0 per row, members see no ref", L.signups.length === 3 && L.signups.every((s) => s.ref && s.decision === null && s.decisionRevision === 0) && (await listing(MEMBER)).signups.every((s) => s.ref === undefined && s.decision === null), JSON.stringify(L.signups));
  const names = { [MEMBER]: null, [OTHER]: null, [ORG]: null };
  for (const s of L.signups) { const row = one("SELECT discord_id FROM community_refs WHERE ref=?", s.ref); names[row.discord_id] = s.ref; }
  r = await decide(MEMBER, [{ ref: names[OTHER], decision: "accepted", revision: 0 }]);
  check("a member cannot decide", r.status === 403 && !decision(OTHER), JSON.stringify(r.body));
  r = await decide(OTHER, [{ ref: names[MEMBER], decision: "accepted", revision: 0 }]);
  check("an organizer who does not manage the event cannot decide", r.status === 403 && r.body.error === "not_organizer" && !decision(MEMBER), JSON.stringify(r.body));
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "accepted", revision: 0 }]);
  check("the organizer accepts an answer (tentative counts as eligible): decision revision 1, decider recorded, the DTO counts it and the member's own view says so",
    r.status === 200 && r.body.results[0]?.result === "ok" && r.body.results[0].decision === "accepted" && r.body.results[0].revision === 1 && decision(MEMBER)?.decision === "accepted" && decision(MEMBER).decided_by === ORG
    && r.body.event.counts.accepted === 1 && (await listing(MEMBER)).event.mine.decision === "accepted" && one("SELECT COUNT(*) AS n FROM audit WHERE action='community.roster_decided' AND actor=?", ORG).n === 1, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "accepted", revision: 0 }, { ref: names[ORG], decision: "accepted", revision: 0 }]);
  check("capacity 2: the second acceptance lands, the third in the same request is told the raid is full", r.status === 200 && r.body.results[0].result === "ok" && r.body.results[1].result === "full" && decision(OTHER)?.decision === "accepted" && !decision(ORG) && r.body.event.counts.accepted === 2, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "bench", revision: 1 }]);
  check("benching frees the place; the bench never counts", r.status === 200 && r.body.results[0].result === "ok" && decision(OTHER).decision === "bench" && decision(OTHER).revision === 2 && r.body.event.counts.accepted === 1, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[ORG], decision: "accepted", revision: 0 }]);
  check("the freed place can be given to a tentative answer", r.status === 200 && r.body.results[0].result === "ok" && decision(ORG)?.decision === "accepted" && r.body.event.counts.accepted === 2, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "accepted", revision: 1 }]);
  check("a stale decision revision is refused with the current one", r.status === 200 && r.body.results[0].result === "stale_revision" && r.body.results[0].revision === 2 && decision(OTHER).decision === "bench", JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "accepted", revision: 2 }]);
  check("with both places held an acceptance is refused as full even at the right revision", r.status === 200 && r.body.results[0].result === "full" && decision(OTHER).decision === "bench", JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: null, revision: 2 }]);
  check("a clear keeps the row: no decision, no decider, no date, revision 3 (finding 3: the revision only moves forward)", r.status === 200 && r.body.results[0].result === "ok" && r.body.results[0].decision === null && r.body.results[0].revision === 3 && !decision(OTHER) && drevision(OTHER).revision === 3 && drevision(OTHER).decided_by === null && drevision(OTHER).decided_at === null, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "declined", revision: 1 }]);
  check("an obsolete command loaded before the clear is stale, never valid again", r.status === 200 && r.body.results[0].result === "stale_revision" && r.body.results[0].revision === 3 && !decision(OTHER), JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "declined", revision: 0 }]);
  check("a create command (revision 0) against a decided-then-cleared row is stale, not a restart", r.status === 200 && r.body.results[0].result === "stale_revision" && drevision(OTHER).revision === 3, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: null, revision: 3 }]);
  check("a clear of an undecided row at its revision is a no-op receipt (ok, revision unchanged)", r.status === 200 && r.body.results[0].result === "ok" && r.body.results[0].decision === null && r.body.results[0].revision === 3 && drevision(OTHER).revision === 3, JSON.stringify(r.body.results));
  r = await click(MEMBER, EVENT, 1, "yes");
  check("a sign-up button answer tells the member the organizer's standing decision", ephemeral(r) && /organizer has you on the roster/.test(r.text), JSON.stringify(r));
  r = await click(MEMBER, EVENT, 1, "no");
  check("a 'no' clears the decision in place (revision 2, no decider) and frees the place", ephemeral(r) && !decision(MEMBER) && drevision(MEMBER).revision === 2 && drevision(MEMBER).decided_by === null && (await listing()).event.counts.accepted === 1, JSON.stringify(drevision(MEMBER)));
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "accepted", revision: 2 }]);
  check("a member who answered no cannot be accepted", r.status === 200 && r.body.results[0].result === "not_signed_up" && !decision(MEMBER), JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "declined", revision: 2 }]);
  check("but can be declined (revision 3)", r.status === 200 && r.body.results[0].result === "ok" && decision(MEMBER)?.decision === "declined" && decision(MEMBER).revision === 3, JSON.stringify(r.body.results));
  r = await click(MEMBER, EVENT, 1, "yes");
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "accepted", revision: 2 }]);
  check("after the rejoin an organizer's command from before the 'no' is stale; the current revision is the only key", r.status === 200 && r.body.results[0].result === "stale_revision" && r.body.results[0].revision === 3, JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: "Z".repeat(22), decision: "accepted", revision: 0 }]);
  check("an unknown ref is unknown_member", r.status === 200 && r.body.results[0].result === "unknown_member", JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "maybe", revision: 0 }]);
  check("an unknown decision word is invalid", r.status === 200 && r.body.results[0].result === "invalid" && decision(MEMBER).decision === "declined", JSON.stringify(r.body.results));
  r = await decide(STAFF, [{ ref: names[MEMBER], decision: "bench", revision: 3 }]);
  check("staff may decide on any event", r.status === 200 && r.body.results[0].result === "ok" && decision(MEMBER).decision === "bench" && decision(MEMBER).decided_by === STAFF, JSON.stringify(r.body.results));
  check("the decide answer names members by display name and ref only, never by Discord id", r.status === 200 && r.body.results[0].displayName === "PRIVATE_MEMBER_SENTINEL" && !JSON.stringify(r.body.results).includes(MEMBER) && !JSON.stringify(r.body.results).includes(STAFF), JSON.stringify(r.body.results));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "declined", revision: 3 }]);
  check("fixture: the organizer declines the other organizer's sign-up", r.status === 200 && r.body.results[0].result === "ok" && decision(OTHER)?.decided_by === ORG, JSON.stringify(r.body.results));
  // the explicit contract (Codex, 04:11): a `no` that withdraws a yes/tentative answer moves the decision revision even when no decision existed
  r = await decide(ORG, [{ ref: names[OTHER], decision: null, revision: 4 }]);
  check("fixture: the decline is cleared (revision 5, undecided)", r.status === 200 && r.body.results[0].result === "ok" && !decision(OTHER) && drevision(OTHER).revision === 5, JSON.stringify(r.body.results));
  r = await click(OTHER, EVENT, 1, "no");
  check("a 'no' that withdraws a yes answer moves the decision revision although no decision existed (5 → 6)", ephemeral(r) && !decision(OTHER) && drevision(OTHER).revision === 6, JSON.stringify(drevision(OTHER)));
  r = await click(OTHER, EVENT, 1, "tentative");
  r = await decide(ORG, [{ ref: names[OTHER], decision: "accepted", revision: 5 }]);
  check("  an organizer's accept loaded before the member's no → tentative is stale, never applied to the returned answer", r.status === 200 && r.body.results[0].result === "stale_revision" && r.body.results[0].revision === 6 && !decision(OTHER), JSON.stringify(r.body.results));
  r = await click(OTHER, EVENT, 1, "no"); r = await click(OTHER, EVENT, 1, "no");
  check("  tentative → no moves it (7); a repeated no → no moves nothing", drevision(OTHER).revision === 7, JSON.stringify(drevision(OTHER)));

  // finding 2: the capacity cannot go below the accepted roster. Fixture: MEMBER yes/accepted, OTHER tentative/declined, ORG tentative/accepted → one yes place, two accepted
  r = await decide(ORG, [{ ref: names[MEMBER], decision: "accepted", revision: 4 }]);
  await click(OTHER, EVENT, 1, "tentative");
  L = await listing();
  check("fixture: one yes answer and two accepted members (one of them tentative), so the yes places alone would allow a capacity of 1", r.status === 200 && r.body.results[0].result === "ok" && L.event.counts.yes === 1 && L.event.counts.accepted === 2, JSON.stringify(L.event.counts));
  r = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 1, capacity: 1 });
  check("finding 2: the capacity cannot go below the accepted roster (capacity_below_accepted, 409, nothing changed)", r.status === 409 && r.body.error === "capacity_below_accepted" && one("SELECT capacity, revision FROM community_events WHERE id=?", EVENT).capacity === 2 && one("SELECT revision FROM community_events WHERE id=?", EVENT).revision === 1, JSON.stringify(r.body));
  r = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 1, capacity: 3 });
  check("  raising it is never refused", r.status === 200 && r.body.event.capacity === 3, JSON.stringify(r.body));
  r = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 2, capacity: 2 });
  check("  lowering to the accepted count is allowed", r.status === 200 && r.body.event.capacity === 2 && r.body.event.counts.accepted === 2, JSON.stringify(r.body));
  await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?", ORG);
  r = await call("POST", "/api/community/events/update", { eventId: EVENT, revision: 3, capacity: 1 }, STAFF);
  check("  an accepted member who left the server no longer holds a place for the bound (the same qualifying rule as the counts)", r.status === 200 && r.body.event.counts.accepted === 1, JSON.stringify(r.body.event ? r.body.event.counts : r.body));
  await fixtureRun("UPDATE site_users SET in_server=1 WHERE discord_id=?", ORG);

  // the own copy and erasure
  const copyEnv = directEnv(), plan = context.communityExportPlan(copyEnv, ORG), shaped = plan.shape(await copyEnv.DB.batch(plan.statements)); // one admission scope prepares and runs the plan
  check("the own copy carries the roster decision and the reminder-mention choice inside the sign-up row, never the decider", shaped.events.signups.length === 1 && shaped.events.signups[0].decision === "accepted" && typeof shaped.events.signups[0].decidedAt === "string" && shaped.events.signups[0].remindMention === false && shaped.events.decisions === undefined && !JSON.stringify(shaped.events).includes(STAFF), JSON.stringify(shaped.events));
  r = await decide(ORG, [{ ref: names[OTHER], decision: "declined", revision: 7 }]);
  check("fixture: the other organizer is declined again (revision 8) for the copy and erasure checks below", r.status === 200 && r.body.results[0].result === "ok" && decision(OTHER)?.decision === "declined" && decision(OTHER).decided_by === ORG, JSON.stringify(r.body.results));
  const copyEnv2 = directEnv(), plan2 = context.communityExportPlan(copyEnv2, OTHER), shaped2 = plan2.shape(await copyEnv2.DB.batch(plan2.statements));
  check("a declined sign-up copies as declined with its date", shaped2.events.signups[0].decision === "declined" && typeof shaped2.events.signups[0].decidedAt === "string", JSON.stringify(shaped2.events.signups));
  await deleteThroughOriginalRoute(ORG, STAFF);
  check("erasing the organizer removes their own sign-up (with its decision) and leaves the decisions they made without a decider", !signup(ORG) && decision(OTHER)?.decision === "declined" && drevision(OTHER).decided_by === null && one("SELECT COUNT(*) AS n FROM community_event_signups WHERE decided_by=?", ORG).n === 0, JSON.stringify(drevision(OTHER)));
  r = await decide(STAFF, [{ ref: names[ORG], decision: "bench", revision: 1 }]);
  check("a command keyed by the erased member's ref (physical deletion of the sign-up row and its ref) is unknown_member", r.status === 200 && r.body.results[0].result === "unknown_member" && one("SELECT COUNT(*) AS n FROM community_refs WHERE ref=?", names[ORG]).n === 0, JSON.stringify(r.body.results));
  // recreation (Codex, 04:11): the erased account registers again through the fixture's own registration (the same statements every account in this
  // fixture is born with) and signs up again: a fresh row at revision 0 under a new ref; the old key and the old command never reach it
  const reseed = async (who) => {
    await fixtureRun("INSERT INTO site_users(discord_id,username,global_name,in_server,denied,session_version,first_login,last_login,checked_at) VALUES(?,?,?,1,0,1,?,?,?)", who, "Synthetic", "PRIVATE_MEMBER_SENTINEL", at(), at(), at());
    await fixtureRun("INSERT OR IGNORE INTO members(discord_id,banned) VALUES(?,0)", who);
    await fixtureRun("INSERT OR IGNORE INTO characters(name_key,name,discord_id,status,bound_at) VALUES(?,?,?,'member',?)", who, "PRIVATE_CHARACTER_SENTINEL", who, at());
    issuedCookies.set(who, await entry.issueOriginalEntryCookie((name) => load("./" + name), db, env(), who)); sessionCookies.delete(who);
  };
  await reseed(ORG);
  r = await click(ORG, EVENT, 4, "tentative"); // the one yes place is held (capacity 1), so the recreated account answers tentative
  L = await listing(STAFF);
  const freshRef = L.signups.map((s) => s.ref).find((ref) => one("SELECT discord_id FROM community_refs WHERE ref=?", ref)?.discord_id === ORG) ?? null;
  check("the recreated account's sign-up is a fresh row at decision revision 0 under a new ref", ephemeral(r) && /tentative/.test(r.text) && freshRef !== null && freshRef !== names[ORG] && drevision(ORG)?.revision === 0 && !decision(ORG), JSON.stringify([freshRef, drevision(ORG), r.text]));
  r = await decide(STAFF, [{ ref: names[ORG], decision: "bench", revision: 1 }]);
  check("the old command (old ref, old revision) replayed against the recreated account is unknown_member; the fresh row is untouched", r.status === 200 && r.body.results[0].result === "unknown_member" && drevision(ORG).revision === 0, JSON.stringify(r.body.results));
  r = await decide(STAFF, [{ ref: freshRef, decision: "bench", revision: 0 }]);
  check("a command built from the fresh row (new ref, revision 0) lands at revision 1", r.status === 200 && r.body.results[0].result === "ok" && r.body.results[0].revision === 1 && decision(ORG)?.decision === "bench", JSON.stringify(r.body.results));
  const swept = await events.sweepCommunityEvents(directEnv(), at() + 40 * 86400);
  check("the sweep takes the sign-ups, and with them the decisions, with the event (its statements unchanged)", swept === 1 && one("SELECT COUNT(*) AS n FROM community_event_signups").n === 0, swept);

  // finding 1, the Discord side: the toggle between the claim and the POST invalidates the claim; during the POST it keeps the pointer as unknown with removal pending
  const REM = { EVENT_DISCORD_REMINDERS: "on" };
  const reminders = load("./community-event-reminders");
  const rrow = () => one("SELECT state, message_id, mention_ids, cleanup_requested FROM community_event_reminders WHERE event_id=?", EVENT);
  const armReminder = async () => { await fixtureRun("UPDATE community_events SET starts_at=?, ends_at=? WHERE id=?", at() + 1800, at() + 1800 + 7200, EVENT); const a = await call("POST", "/api/community/events/reminder", { eventId: EVENT, revision: 1, enabled: true }, ORG, REM); if (a.status !== 200) throw Error("arm refused " + JSON.stringify(a)); };
  await seed(); await event(); r = await click(MEMBER, EVENT, 1, "yes"); r = await press(MEMBER); await armReminder();
  hooks.afterStatement = async (sql) => { if (sql.includes("SET state='claimed',claim_nonce")) { hooks.afterStatement = null; const p = await press(MEMBER); if (!/will not be mentioned/.test(p.text)) throw Error("toggle refused " + JSON.stringify(p)); } };
  let sent = await reminders.runEventReminders(directEnv(REM));
  check("the Discord toggle after the claim and before the POST invalidates the claim: no message, the reminder cancelled for the organizer to re-arm, the member's choice stored as off", sent === 0 && rrow().state === "cancelled" && !rrow().message_id && effects().filter((x) => x.method === "POST" && x.url.endsWith("/messages")).length === 0 && mention(MEMBER).m === 0, JSON.stringify(rrow()));
  r = await call("POST", "/api/community/events/reminder", { eventId: EVENT, revision: 1, enabled: true }, ORG, REM); r = await press(MEMBER);
  hooks.afterEffect = async (req) => { if (req.method === "POST" && req.url.endsWith("/messages")) { hooks.afterEffect = null; await press(MEMBER); } };
  sent = await reminders.runEventReminders(directEnv(REM));
  check("the Discord toggle during the POST: the pointer is kept as unknown with removal pending, never posted; nothing is re-sent", sent === 0 && rrow().state === "unknown" && !!rrow().message_id && rrow().cleanup_requested === 1 && rrow().mention_ids === JSON.stringify([MEMBER]) && effects().filter((x) => x.method === "POST" && x.url.endsWith("/messages")).length === 1, JSON.stringify(rrow()));
  hooks = {};

  console.log(`${passed}/${total} raid button checks passed`);
  process.exit(passed === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
