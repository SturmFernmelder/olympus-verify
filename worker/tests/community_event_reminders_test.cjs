// Real Worker routing, signed sessions, calendar writers and schema over SQLite; only Discord HTTP is synthetic.
// No fixture contacts a provider. These test actual reminder admission/custody, not live permission or delivery proof.
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
  INTROS_CHANNELS: `raid-signups=${CHANNEL}`, EVENT_DISCORD_DELIVERY: "on", EVENT_DISCORD_REMINDERS: "on", CHANNEL_SERVER_LOG: "", CHANNEL_MOD_ALERTS: "", CHANNEL_NOTICES: "", ...over });
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
const row = () => one("SELECT * FROM community_event_reminders WHERE event_id=?", EVENT);
const effects = () => requests.filter((r) => r.method !== "GET");
async function event() {
  const result = await call("POST", "/api/community/events", { opId: EVENT, title: "Raid *title* <@123456789012345678>", details: "PRIVATE_DETAILS_SENTINEL", startsAt: new Date((at() + 1800) * 1000).toISOString(), durationMin: 120, capacity: 2 });
  if (result.status !== 200) throw Error(`event fixture refused ${JSON.stringify(result)}`);
  return result.body.event;
}
async function preview() { return (await call("GET", `/api/community/events/discord?eventId=${EVENT}`)).body; }
async function publish(over = {}, op = OP) { const p = await preview(); return call("POST", "/api/community/events/discord/publish", { eventId: EVENT, revision: p.revision, opId: op, payloadHash: p.payloadHash }, ORG, over); }
let passed = 0, total = 0;
function check(name, value, detail) { total++; if (value) passed++; console.log(`${value ? "PASS" : "FAIL"} ${name}`); if (!value && detail) console.log(detail); }

// .133: construct an original signed staff Request before the real site-only eraser consumes it.
// Both clocks make this explicit test session valid when the suite freezes or advances its business clock.
async function erasureRequest(target, actor) {
  const site = load("./site-core");
  const version = db.prepare("SELECT session_version FROM site_users WHERE discord_id = ?").get(actor)?.session_version ?? 1;
  const expiry = Math.max(Math.floor(Date.now() / 1000), db.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) AS clock").get().clock) + 3600;
  const body = site.b64u(new TextEncoder().encode(JSON.stringify({ u: actor, v: version, e: expiry })));
  const mac = await site.sign(env().COOKIE_SECRET, "session", body);
  return new Request("https://guild.example/api/admin/users/" + target + "/delete", {
    method: "POST", headers: { Cookie: "__Host-olg=" + body + "." + mac, Origin: "https://guild.example", "X-Olympus": "2" },
  });
}

const reminders = load("./community-event-reminders");
const arm = (revision = 1, over = {}) => call("POST", "/api/community/events/reminder", { eventId: EVENT, revision, enabled: true }, ORG, over);
const stop = (revision = 1) => call("POST", "/api/community/events/reminder", { eventId: EVENT, revision, enabled: false });
const tick = (over = {}) => reminders.runEventReminders(env(over));
const status = () => call("GET", `/api/community/events/reminder?eventId=${EVENT}`);
async function fresh() { seed(); await event(); }
(async () => {
  await fresh(); let r = await status();
  check("no reminder exists without separate explicit consent", r.status === 200 && r.body.reminder === null && effects().length === 0);
  r = await arm(1, { EVENT_DISCORD_REMINDERS: "" }); const beforeOff = SQL.length; await tick({ EVENT_DISCORD_REMINDERS: "" });
  check("default OFF refuses opt-in and cron costs zero SQL/HTTP", r.status === 503 && !row() && SQL.length === beforeOff && requests.length === 0);
  r = await call("GET", `/api/community/events/reminder?eventId=${EVENT}`, undefined, null); check("unsigned reminder status refuses", r.status === 401);
  r = await call("POST", "/api/community/events/reminder", {}, MEMBER); check("non-organizer cannot opt in", r.status === 403);
  r = await call("GET", `/api/community/events/reminder?eventId=${EVENT}`, undefined, OTHER); check("another organizer cannot inspect private management DTO", r.status === 404);
  r = await call("POST", "/api/community/events/reminder", {}, ORG, {}, { Origin: "https://attacker.example" }); check("foreign origin refuses", r.status === 403);
  r = await call("POST", "/api/community/events/reminder", {}, ORG, {}, { "X-Olympus": "1" }); check("old page refuses", r.status === 409);
  r = await call("POST", "/api/community/events/reminder", { eventId: EVENT, revision: 1, enabled: true, content: "ATTENDEE" }); check("arbitrary content is refused", r.status === 400 && !row());
  r = await arm(2); check("stale event consent refuses", r.status === 409 && !row());
  r = await arm(); check("explicit consent stores exact revision/start and safe content without credentials", r.status === 200 && row().state === "armed" && row().event_revision === 1 && row().starts_at === one("SELECT starts_at FROM community_events").starts_at && !JSON.stringify(r.body).includes("PRIVATE_") && !JSON.stringify(r.body).includes(ORG) && r.body.payload.allowed_mentions.parse.length === 0);
  const realNow = Date.now; Date.now = () => realNow() + 8*86400*1000;
  try { await tick(); } finally { Date.now = realNow; }
  check("cron uses durable consent/current account, not expired website cookie", row().state === "posted" && effects().length === 1 && effects()[0].body.allowed_mentions.parse.length === 0 && !JSON.stringify(effects()[0].body).includes("PRIVATE_"));
  await tick(); check("posted outcome never automatically repeats", effects().length === 1);

  await fresh(); await arm(); await stop(); await tick(); check("opt-out before claim cancels and produces no effect", row().state === "cancelled" && effects().length === 0);
  await fresh(); await arm(); db.prepare("UPDATE community_events SET starts_at=starts_at+7200,ends_at=ends_at+7200").run(); await tick(); check("not-yet-due or unbound start cannot send", row().state === "armed" && effects().length === 0);
  await fresh(); await arm(); db.prepare("UPDATE community_events SET starts_at=?,ends_at=?").run(at()-1,at()+7199); await tick(); check("missed event never sends after start", effects().length === 0);
  for (const [name, change] of [
    ["session revocation", () => db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(ORG)],
    ["denial", () => db.prepare("UPDATE site_users SET denied=1 WHERE discord_id=?").run(ORG)],
    ["departure", () => db.prepare("UPDATE site_users SET in_server=0 WHERE discord_id=?").run(ORG)],
    ["ban", () => db.prepare("UPDATE members SET banned=1 WHERE discord_id=?").run(ORG)],
    ["unconfirmed character", () => db.prepare("UPDATE characters SET status='pending' WHERE discord_id=?").run(ORG)],
  ]) { await fresh(); await arm(); change(); await tick(); check("consuming cron refuses current " + name, effects().length === 0 && row().state === "armed"); }
  await fresh(); await arm(); await tick({ COMMUNITY_ORGANIZERS: OTHER }); check("removed organizer grant refuses without session synthesis", effects().length === 0 && row().state === "armed");
  await fresh(); await arm(); await tick({ DISCORD_APP_ID: WRONG }); check("wrong bot/application identity cannot send", effects().length === 0 && row().state === "armed");
  await fresh(); await arm(); hooks.http = (req) => req.url.includes("/members/") ? new Response(null,{status:503}) : undefined; await tick(); check("membership outage holds consent rather than assuming presence", row().state === "armed" && effects().length === 0);
  await fresh(); await arm(); hooks.afterStatement=(sql)=>{if(sql.includes("SET state='claimed',claim_nonce")){hooks.afterStatement=null;db.prepare("UPDATE site_users SET session_version=2 WHERE discord_id=?").run(ORG)}}; await tick(); check("revocation after claim and before effect cancels with zero POST", effects().length === 0 && row().state === "cancelled");

  await fresh(); await arm(); let waiting = 0, release; const barrier = new Promise((resolve)=>{release=resolve});
  hooks.http = async (req)=>{if(req.url.includes("/members/")){waiting++;if(waiting===2)release();await barrier;}return undefined};
  await Promise.all([tick(),tick()]); check("two real concurrent ticks claim only one remote message", effects().length === 1 && row().state === "posted");
  await fresh(); await arm(); hooks.http=(req)=>req.method==='POST'?new Response(null,{status:429}):undefined; await tick(); await tick(); check("definite Discord refusal is recorded and never auto-retried", row().state==='refused' && effects().length===1);
  hooks={}; r=await arm(); await tick(); check("new explicit consent can retry a definite no-effect refusal", r.status===200 && row().state==='posted' && effects().length===2);
  await fresh(); await arm(); hooks.afterEffect=()=>{throw Error('lost synthetic POST')}; await tick(); hooks={}; await tick(); check("unknown POST keeps claim and does not resend", row().state==='unknown' && !row().message_id && messages.size===1 && effects().length===1);
  const heldOp=row().op_id; r=await call('POST','/api/community/events/reminder/reconcile',{eventId:EVENT,opId:heldOp,messageId:ONE}); check("reload can reconcile exact stored nonce/content without another POST", r.status===200 && row().state==='posted' && row().message_id===ONE && effects().length===1);
  r=await call('POST','/api/community/events/reminder/remove',{eventId:EVENT,opId:heldOp},ORG,{EVENT_DISCORD_REMINDERS:'',EVENT_DISCORD_DELIVERY:''}); check("known-pointer removal works with feature OFF", r.status===200 && row().state==='removed' && !row().message_id && messages.size===0);
  await fresh(); await arm(); hooks.beforeStatement=(sql)=>{if(sql.includes("SET message_id=COALESCE(?4")){hooks.beforeStatement=null;throw Error('settlement lost')}}; let failed=false;try{await tick()}catch{failed=true} hooks={}; await tick();check("settlement loss preserves original claim and prohibits resend",failed && row().state==='claimed' && effects().length===1);

  await fresh(); await arm(); r=await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,title:'Edited raid'}); await tick(); check("real edit cancels old-revision consent and does not send",r.status===200 && row().state==='cancelled' && effects().length===0);
  r=await arm(2); await tick();check("fresh explicit consent for edited revision is usable",r.status===200 && row().state==='posted');
  await fresh(); await arm(); r=await call('POST','/api/community/events/cancel',{eventId:EVENT,revision:1}); await tick(); check("real cancellation before send cancels consent",r.status===200 && row().state==='cancelled' && effects().length===0);
  await fresh(); await arm(); hooks.afterEffect=async()=>{await stop()};await tick();check("opt-out during send preserves known pointer as cleanup debt",row().state==='unknown' && row().message_id===ONE && row().cleanup_requested===1);
  await fresh(); await arm(); hooks.afterEffect=async()=>{await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,title:'Edited during send'})};await tick();check("real edit during POST preserves known pointer as unresolved removal debt",row().state==='unknown' && row().message_id===ONE && row().cleanup_requested===1);
  await fresh(); await arm(); hooks.afterEffect=async()=>{await admin.deleteSiteData(env(),ORG,STAFF,false,await erasureRequest(ORG,STAFF))};await tick();check("account erasure during send clears copied text/identity yet preserves pointer debt",row().state==='unknown' && row().message_id===ONE && row().frozen_content===null && row().actor===null && row().cleanup_requested===1);
  await fresh(); await arm(); await admin.deleteSiteData(env(),ORG,STAFF,false,await erasureRequest(ORG,STAFF));await tick();check("erased consent cannot send and export never restores copied private data",row().state==='cancelled' && row().frozen_content===null && effects().length===0);
  await fresh();await call('POST','/api/community/events/reminder',{eventId:EVENT,revision:1,enabled:true},STAFF);await admin.deleteSiteData(env(),ORG,STAFF,false,await erasureRequest(ORG,STAFF));await tick();check("creator erasure cancels even another staff member's consent and clears copied custody text",row().state==='cancelled' && row().actor===null && row().frozen_content===null && effects().length===0);
  await fresh(); await arm(); hooks.afterEffect=()=>{throw Error('unknown for expiry')};await tick();hooks={};
  const original=row().retain_until; await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,startsAt:new Date((at()+2*86400)*1000).toISOString()});
  check("reschedule cannot extend stored reminder deadline",row().retain_until===original);
  await events.sweepCommunityEvents(env(),original+1);check("expiry drops local unknown metadata and atomically closes surviving parent",!row() && one('SELECT reminder_closed FROM community_events').reminder_closed===1 && messages.size===1);
  r=await arm(2);await tick();check("expired unknown custody cannot be rearmed after rescheduling",r.status===409 && !row() && effects().length===1);
  await fresh(); await arm(); const beforeRollback=row().retain_until;hooks.beforeStatement=(sql)=>{if(sql.startsWith('DELETE FROM community_event_reminders')){hooks.beforeStatement=null;throw Error('expiry refusal')}};failed=false;try{await events.sweepCommunityEvents(env(),beforeRollback+1)}catch{failed=true}check("expiry refusal rolls parent closure and child disposal back together",failed && !!row() && one('SELECT reminder_closed FROM community_events').reminder_closed===0);

  for(const state of ['armed','cancelled','refused']) {
    await fresh();await arm();db.prepare("UPDATE community_event_reminders SET state=?,retain_until=CAST(strftime('%s','now') AS INTEGER)-1").run(state);
    const old=row().retain_until;r=await status();const armed=await arm();
    check(`expired ${state} custody before cleanup cannot masquerade as fresh consent`,r.body.closed===true && r.body.canArm===false && armed.status===409 && armed.body.error==='reminder_expired' && row().retain_until===old && effects().length===0);
  }
  await fresh();hooks.beforeStatement=(sql)=>{if(sql.startsWith('INSERT INTO community_event_reminders')){hooks.beforeStatement=null;db.prepare('UPDATE site_users SET session_version=2 WHERE discord_id=?').run(ORG)}};r=await arm();
  check("consent consumes original session and revocation before SQL leaves no row",r.status!==200 && !row() && effects().length===0);
  await fresh();await arm();db.prepare('UPDATE community_events SET created_by=?').run(OTHER);await tick();check("creator/management drift invalidates durable consent",row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.http=(req)=>req.url===`/api/v10/channels/${CHANNEL}`?Response.json({id:CHANNEL,guild_id:WRONG,type:0}):undefined;await tick();check("channel destination drift refuses before claim/effect",row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.afterEffect=(_req,m)=>{m.content='Unexpected provider payload'};await tick();check("malformed successful response retains known pointer without calling it delivered",row().state==='unknown' && row().message_id===ONE && effects().length===1);
  await fresh();await arm();hooks.afterEffect=()=>{throw Error('lost reply')};await tick();hooks={};messages.get(ONE).nonce='WRONG_NONCE';r=await call('POST','/api/community/events/reminder/reconcile',{eventId:EVENT,opId:row().op_id,messageId:ONE});check("unknown create requires original nonce before accepting a remote pointer",r.status===409 && !row().message_id && effects().length===1);
  await fresh();await arm();await tick();const remembered=row().message_id;r=await call('POST','/api/community/events/reminder/reconcile',{eventId:EVENT,opId:row().op_id,messageId:'400000000000000009'});check("known pointer cannot be substituted by another message",r.status===409 && row().message_id===remembered && effects().length===1);
  await fresh();await arm();hooks.http=(req)=>req.url.includes('/members/')?Response.json({user:{id:ORG},roles:['BLOCKING_ROLE_SENTINEL']}):undefined;await tick();check("calendar organizer policy uses current member presence, not unrelated Discord-role authority",row().state==='posted' && effects().length===1);
  await fresh();await arm();hooks.http=(req)=>req.url.includes('/members/')?new Response(null,{status:503}):undefined;SQL=[];await tick();check("outage candidate costs two statements and remains armed",SQL.length===2 && row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.afterStatement=(sql)=>{if(sql.includes("SET state='claimed',claim_nonce")){hooks.afterStatement=null;db.prepare('UPDATE community_events SET reminder_closed=1').run()}};SQL=[];await tick();check("failed final proof costs five statements and cancels without effect",SQL.length===5 && row().state==='cancelled' && effects().length===0);

  await fresh();await arm();SQL=[];await tick();check("one due successful job uses six D1 statement attempts",SQL.length===6,SQL.map(x=>x.sql));
  const ddl=one("SELECT sql FROM sqlite_master WHERE name='community_event_reminders'").sql.replace(/\s+/g,' ');db.exec('DROP TABLE community_event_reminders');schema.forgetSchemaCheck();await schema.ensureSchema(env());check("runtime initializer matches canonical reminder DDL",one("SELECT sql FROM sqlite_master WHERE name='community_event_reminders'").sql.replace(/\s+/g,' ')===ddl);
  db.exec('DROP TABLE community_event_reminders; ALTER TABLE community_events DROP COLUMN reminder_closed');db.exec(fs.readFileSync(path.join(root,'migrations/2026-10-10-event-reminders.sql'),'utf8'));check("dated migration matches canonical reminder DDL and parent closure",one("SELECT sql FROM sqlite_master WHERE name='community_event_reminders'").sql.replace(/\s+/g,' ')===ddl && one('SELECT reminder_closed FROM community_events').reminder_closed===0);
  check("all real statements obey 100-parameter limit",maxParameters<=100,maxParameters);
  console.log(`\n${passed}/${total} passed`);process.exitCode=passed===total?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
