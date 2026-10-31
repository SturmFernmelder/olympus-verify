// Real Worker routing, signed sessions, calendar writers and schema over SQLite; only Discord HTTP is synthetic.
// No fixture contacts a provider. These test actual reminder admission/custody, not live permission or delivery proof.
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
let db, nativePort, hooks, requests, messages, SQL, maxParameters, counter, sessionCookies, issuedCookies, setupDepth=0;
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
      SQL.push({sql,params,fixtureSetup:setupDepth>0}); maxParameters=Math.max(maxParameters,params.length);
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
  setupDepth++;try{return await admitted.prepare(sql).bind(...params).run();}finally{setupDepth--;}
}
function directEnv(over={}) {
  const e=env(over);
  return {...e,DB:load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(nativePort,'writer','canonical',entry.ENTRY_EPOCH)};
}
const env = (over = {}) => entry.currentEntryEnvironment({ DB: d1(), COOKIE_SECRET: SECRET, VERIFY_SECRET: "synthetic-verify", WATCHER_TOKEN: "synthetic-watcher", GUILD_ID: WRONG,
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
  if (who && !sessionCookies.has(who)) sessionCookies.set(who, Promise.resolve(issuedCookies.get(who)?.cookie ?? ''));
  const cookie = who ? await sessionCookies.get(who) : '';
  const request = new Request(`https://guild.example${route}`, { method, headers: { Cookie: cookie, Origin: "https://guild.example", "X-Olympus": "2", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const response = await worker.fetch(request, env(over), { waitUntil: () => {} });
  return { status: response.status, body: await response.json() };
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const row = () => one("SELECT * FROM community_event_reminders WHERE event_id=?", EVENT);
const effects = () => requests.filter((r) => r.method !== "GET");
const incarnationColumnDDL=field=>`, ${field} TEXT CHECK(${field} IS NULL OR (typeof(${field})='text' AND length(${field})=32 AND length(CAST(${field} AS BLOB))=32 AND instr(${field},char(0))=0 AND ${field} NOT GLOB '*[^0-9a-f]*'))`;
// Retain every physical statement in SQL. These exact source payload prefixes
// distinguish the historical job-body cost from current admission proof overhead.
const payloadSQL=()=>SQL.filter(({sql,fixtureSetup})=>!fixtureSetup&&/^\s*(?:SELECT r\.\*|SELECT 1 AS ok FROM community_event_reminders|(?:UPDATE|DELETE FROM) community_event|INSERT INTO audit|UPDATE privacy_provider_messages)/.test(sql));
async function event() {
  const result = await call("POST", "/api/community/events", { opId: EVENT, title: "Raid *title* <@123456789012345678>", details: "PRIVATE_DETAILS_SENTINEL", startsAt: new Date((at() + 1800) * 1000).toISOString(), durationMin: 120, capacity: 2 });
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

const reminders = load("./community-event-reminders");
const arm = (revision = 1, over = {}) => call("POST", "/api/community/events/reminder", { eventId: EVENT, revision, enabled: true }, ORG, over);
const stop = (revision = 1) => call("POST", "/api/community/events/reminder", { eventId: EVENT, revision, enabled: false });
const tick = (over = {}) => reminders.runEventReminders(directEnv(over));
const status = () => call("GET", `/api/community/events/reminder?eventId=${EVENT}`);
async function fresh() { await seed(); await event(); }
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
  const originalT=T; T += 8*86400;
  try { await tick(); } finally { T=originalT; }
  check("cron uses durable consent/current account, not expired website cookie", row().state === "posted" && effects().length === 1 && effects()[0].body.allowed_mentions.parse.length === 0 && !JSON.stringify(effects()[0].body).includes("PRIVATE_"));
  await tick(); check("posted outcome never automatically repeats", effects().length === 1);

  await fresh(); await arm(); await stop(); await tick(); check("opt-out before claim cancels and produces no effect", row().state === "cancelled" && effects().length === 0);
  await fresh(); await arm(); await fixtureRun("UPDATE community_events SET starts_at=starts_at+7200,ends_at=ends_at+7200"); await tick(); check("not-yet-due or unbound start cannot send", row().state === "armed" && effects().length === 0);
  await fresh(); await arm(); await fixtureRun("UPDATE community_events SET starts_at=?,ends_at=?",at()-1,at()+7199); await tick(); check("missed event never sends after start", effects().length === 0);
  for (const [name, change] of [
    ["session revocation", async () => await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?",ORG)],
    ["denial", async () => await fixtureRun("UPDATE site_users SET denied=1 WHERE discord_id=?",ORG)],
    ["departure", async () => await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?",ORG)],
    ["ban", async () => await fixtureRun("UPDATE members SET banned=1 WHERE discord_id=?",ORG)],
    ["unconfirmed character", async () => await fixtureRun("UPDATE characters SET status='pending' WHERE discord_id=?",ORG)],
  ]) { await fresh(); await arm(); await change(); await tick(); check("consuming cron refuses current " + name, effects().length === 0 && row().state === "armed"); }
  await fresh(); await arm(); await tick({ COMMUNITY_ORGANIZERS: OTHER }); check("removed organizer grant refuses without session synthesis", effects().length === 0 && row().state === "armed");
  await fresh(); await arm(); await tick({ DISCORD_APP_ID: WRONG }); check("wrong bot/application identity cannot send", effects().length === 0 && row().state === "armed");
  await fresh(); await arm(); hooks.http = (req) => req.url.includes("/members/") ? new Response(null,{status:503}) : undefined; await tick(); check("membership outage holds consent rather than assuming presence", row().state === "armed" && effects().length === 0);
  await fresh(); await arm(); hooks.afterStatement=async(sql)=>{if(sql.includes("SET state='claimed',claim_nonce")){hooks.afterStatement=null;await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?",ORG)}}; await tick(); check("revocation after claim and before effect cancels with zero POST", effects().length === 0 && row().state === "cancelled");

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
  await fresh(); await arm(); hooks.afterEffect=async()=>{await deleteThroughOriginalRoute(ORG,STAFF)};await tick();check("account erasure during send clears copied text/identity yet preserves pointer debt",row().state==='unknown' && row().message_id===ONE && row().frozen_content===null && row().actor===null && row().cleanup_requested===1);
  await fresh(); await arm(); await deleteThroughOriginalRoute(ORG,STAFF);await tick();check("erased consent cannot send and export never restores copied private data",row().state==='cancelled' && row().frozen_content===null && effects().length===0);
  await fresh();await call('POST','/api/community/events/reminder',{eventId:EVENT,revision:1,enabled:true},STAFF);await deleteThroughOriginalRoute(ORG,STAFF);await tick();check("creator erasure cancels even another staff member's consent and clears copied custody text",row().state==='cancelled' && row().actor===null && row().frozen_content===null && effects().length===0);
  await fresh(); await arm(); hooks.afterEffect=()=>{throw Error('unknown for expiry')};await tick();hooks={};
  const original=row().retain_until; await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,startsAt:new Date((at()+2*86400)*1000).toISOString()});
  check("reschedule cannot extend stored reminder deadline",row().retain_until===original);
  await events.sweepCommunityEvents(directEnv(),original+1);check("expiry drops local unknown metadata and atomically closes surviving parent",!row() && one('SELECT reminder_closed FROM community_events').reminder_closed===1 && messages.size===1);
  const unknownExpiryAudit=one("SELECT details FROM audit WHERE action='community.events_expired' ORDER BY id DESC LIMIT 1");
  check("reminder-only unknown disposal records one unresolved Discord effect",!!unknownExpiryAudit && JSON.parse(unknownExpiryAudit.details).discordUnresolved===1 && JSON.parse(unknownExpiryAudit.details).deleted===0);
  r=await arm(2);await tick();check("expired unknown custody cannot be rearmed after rescheduling",r.status===409 && !row() && effects().length===1);
  await fresh(); await arm(); const beforeRollback=row().retain_until;hooks.beforeStatement=(sql)=>{if(sql.startsWith('DELETE FROM community_event_reminders')){hooks.beforeStatement=null;throw Error('expiry refusal')}};failed=false;try{await events.sweepCommunityEvents(directEnv(),beforeRollback+1)}catch{failed=true}check("expiry refusal rolls parent closure and child disposal back together",failed && !!row() && one('SELECT reminder_closed FROM community_events').reminder_closed===0);

  for(const state of ['armed','cancelled','refused']) {
    await fresh();await arm();await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,startsAt:new Date((at()+2*86400)*1000).toISOString()});
    await fixtureRun("UPDATE community_event_reminders SET state=?,retain_until=CAST(strftime('%s','now') AS INTEGER)-1",state);
    const old=row().retain_until;r=await status();const armed=await arm(2);
    check(`expired ${state} custody before cleanup cannot masquerade as fresh consent`,r.body.closed===true && r.body.canArm===false && armed.status===409 && armed.body.error==='reminder_expired' && row().retain_until===old && effects().length===0);
    SQL=[];await events.sweepCommunityEvents(directEnv(),at());
    const expiryCost=payloadSQL().length, expiryAudit=one("SELECT details FROM audit WHERE action='community.events_expired' ORDER BY id DESC LIMIT 1");
    check(`expired ${state} custody closes its surviving parent before disposal`,!row() && one('SELECT reminder_closed FROM community_events').reminder_closed===1 && expiryCost===9);
    r=await arm(2);await tick();
    check(`expired ${state} custody cannot rearm after cleanup/reschedule`,r.status===409 && !row() && effects().length===0);
    check(`reminder-only ${state} disposal records zero unresolved effects`,!!expiryAudit && JSON.parse(expiryAudit.details).discordUnresolved===0 && JSON.parse(expiryAudit.details).deleted===0);
  }
  await fresh();await arm();await tick();await call('POST','/api/community/events/update',{eventId:EVENT,revision:1,startsAt:new Date((at()+2*86400)*1000).toISOString()});
  await fixtureRun("UPDATE community_event_reminders SET retain_until=CAST(strftime('%s','now') AS INTEGER)-1");
  await events.sweepCommunityEvents(directEnv(),at());
  const postedExpiryAudit=one("SELECT details FROM audit WHERE action='community.events_expired' ORDER BY id DESC LIMIT 1");
  check("reminder-only known-pointer disposal records unresolved external custody without deleting Discord message",!!postedExpiryAudit && JSON.parse(postedExpiryAudit.details).discordUnresolved===1 && !row() && messages.size===1);
  await fresh();hooks.beforeBatch=async plan=>{if(plan.some(s=>s.statement.startsWith('INSERT INTO community_event_reminders'))){hooks.beforeBatch=null;await fixtureRun('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?',ORG)}};r=await arm();
  check("consent consumes original session and revocation before SQL leaves no row",r.status!==200 && !row() && effects().length===0);
  await fresh();await arm();await fixtureRun('UPDATE community_events SET created_by=?',OTHER);await tick();check("creator/management drift invalidates durable consent",row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.http=(req)=>req.url===`/api/v10/channels/${CHANNEL}`?Response.json({id:CHANNEL,guild_id:WRONG,type:0}):undefined;await tick();check("channel destination drift refuses before claim/effect",row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.afterEffect=(_req,m)=>{m.content='Unexpected provider payload'};await tick();check("malformed successful response retains known pointer without calling it delivered",row().state==='unknown' && row().message_id===ONE && effects().length===1);
  await fresh();await arm();hooks.afterEffect=()=>{throw Error('lost reply')};await tick();hooks={};messages.get(ONE).nonce='WRONG_NONCE';r=await call('POST','/api/community/events/reminder/reconcile',{eventId:EVENT,opId:row().op_id,messageId:ONE});check("unknown create requires original nonce before accepting a remote pointer",r.status===409 && !row().message_id && effects().length===1);
  await fresh();await arm();await tick();const remembered=row().message_id;r=await call('POST','/api/community/events/reminder/reconcile',{eventId:EVENT,opId:row().op_id,messageId:'400000000000000009'});check("known pointer cannot be substituted by another message",r.status===409 && row().message_id===remembered && effects().length===1);
  await fresh();await arm();hooks.http=(req)=>req.url.includes('/members/')?Response.json({user:{id:ORG},roles:['BLOCKING_ROLE_SENTINEL']}):undefined;await tick();check("calendar organizer policy uses current member presence, not unrelated Discord-role authority",row().state==='posted' && effects().length===1);
  await fresh();await arm();hooks.http=(req)=>req.url.includes('/members/')?new Response(null,{status:503}):undefined;SQL=[];await tick();check("outage candidate costs two source payload statements plus retained admission proofs and remains armed",payloadSQL().length===2 && row().state==='armed' && effects().length===0);
  await fresh();await arm();hooks.afterStatement=async(sql)=>{if(sql.includes("SET state='claimed',claim_nonce")){hooks.afterStatement=null;await fixtureRun('UPDATE community_events SET reminder_closed=1')}};SQL=[];await tick();check("failed final proof costs five source payload statements plus retained admission proofs and cancels without effect",payloadSQL().length===5 && row().state==='cancelled' && effects().length===0);

  await fresh();await arm();SQL=[];await tick();check("one due successful job uses seven source payload statements plus retained admission proofs (one adopted custody update)",payloadSQL().length===7,SQL.map(x=>x.sql));
  const ddl=one("SELECT sql FROM sqlite_master WHERE name='community_event_reminders'").sql.replace(/\s+/g,' ');db.exec('DROP TABLE community_event_reminders');schema.forgetSchemaCheck();let schemaHeld=false;try{await schema.ensureSchema(directEnv());}catch(error){schemaHeld=error.message==='malformed JSON'||error instanceof load('./privacy-write-admission').PrivacyWriteAdmissionHeld;}check("current epoch schema check holds missing reminder table without implicit repair",schemaHeld&&!one("SELECT 1 FROM sqlite_master WHERE name='community_event_reminders'"));
  db.exec('ALTER TABLE community_events DROP COLUMN reminder_closed');db.exec(fs.readFileSync(path.join(root,'migrations/2026-10-10-event-reminders.sql'),'utf8'));let historicalHeld=false;try{await schema.ensureSchema(directEnv());}catch(error){historicalHeld=error.message==='malformed JSON'||error instanceof load('./privacy-write-admission').PrivacyWriteAdmissionHeld;}
  const incarnationClause=incarnationColumnDDL('consent_account_incarnation'),mentionClause=", mention_ids TEXT CHECK(mention_ids IS NULL OR (json_valid(mention_ids) AND json_type(mention_ids)='array'))"; // stage 2 (15 Oct 2026)
  check("dated reminder DDL is exact pre-incarnation, pre-mention profile and parent closure; current source holds it",ddl.split(incarnationClause).length===2 && ddl.split(mentionClause).length===2 && one("SELECT sql FROM sqlite_master WHERE name='community_event_reminders'").sql.replace(/\s+/g,' ')===ddl.replace(incarnationClause,'').replace(mentionClause,'').replace(/\s+/g,' ') && one('SELECT reminder_closed FROM community_events').reminder_closed===0 && historicalHeld);
  check("all real statements obey 100-parameter limit",maxParameters<=100,maxParameters);
  // ---------- stage 2 (15 Oct 2026): the mention list, chosen inside the custody claim ----------
  const answer = (who, body) => call("PUT", "/api/community/events/rsvp", { eventId: EVENT, revision: 0, ...body }, who);
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await answer(OTHER, { status: "yes", remindMention: false }); await arm(); await tick();
  let posted = effects()[0];
  check("the reminder mentions the members who said yes and asked for it, in one trailing line, with allowed_mentions.users exactly those ids; the list is stored",
    row().state === "posted" && posted.body.content === row().frozen_content + "\n<@" + MEMBER + ">" && JSON.stringify(posted.body.allowed_mentions) === JSON.stringify({ parse: [], users: [MEMBER] }) && row().mention_ids === JSON.stringify([MEMBER]) && !posted.body.content.includes(OTHER), JSON.stringify(posted.body));
  await deleteThroughOriginalRoute(MEMBER, STAFF);
  check("erasing a mentioned member leaves a placeholder in the vector (never the id) and marks the posted reminder for removal; nothing is re-sent", row().mention_ids === JSON.stringify(["0"]) && row().cleanup_requested === 1 && row().state === "posted" && effects().length === 1, JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("the organizer removes it; the vector goes with the text", r.status === 200 && row().state === "removed" && row().mention_ids === null && messages.size === 0, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); await answer(MEMBER, { status: "no", revision: 1 }); await tick();
  check("a member who turned to no is not mentioned; without any mention the payload stays mention-free", row().state === "posted" && effects()[0].body.content === row().frozen_content && JSON.stringify(effects()[0].body.allowed_mentions) === JSON.stringify({ parse: [] }) && row().mention_ids === "[]", JSON.stringify(effects()[0].body));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?", MEMBER); await tick();
  check("a member who left the server between the choice and the send is not mentioned (consent rechecked at the claim)", row().state === "posted" && !effects()[0].body.content.includes(MEMBER) && row().mention_ids === "[]", JSON.stringify(effects()[0].body));
  // a lost post reconciles against the reconstructed text (frozen text + the mention line)
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.afterEffect = () => { throw Error("lost synthetic POST"); }; await tick(); hooks = {};
  check("fixture: a lost post with a mention", row().state === "unknown" && !row().message_id && row().mention_ids === JSON.stringify([MEMBER]), JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/reconcile", { eventId: EVENT, opId: row().op_id, messageId: [...messages.keys()][0] });
  check("reconcile reproduces the exact posted text with the mention line and adopts the pointer as posted", r.status === 200 && !r.body.error && row().state === "posted" && row().message_id === [...messages.keys()][0] && row().mention_ids === JSON.stringify([MEMBER]) && effects().length === 1, JSON.stringify(r.body));
  // the races: a lost post, then the mentioned member's erasure, then reconcile and removal; and an erasure while the POST is in flight
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.afterEffect = () => { throw Error("lost synthetic POST"); }; await tick(); hooks = {};
  await deleteThroughOriginalRoute(MEMBER, STAFF);
  const lostId = [...messages.keys()][0];
  r = await call("POST", "/api/community/events/reminder/reconcile", { eventId: EVENT, opId: row().op_id, messageId: lostId });
  check("after the mentioned member's erasure the lost message is still identifiable through the placeholder: reconcile adopts the pointer as unknown with removal pending, never as posted", r.status === 200 && row().message_id === lostId && row().state === "unknown" && row().cleanup_requested === 1 && row().mention_ids === JSON.stringify(["0"]) && effects().length === 1, JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("the organizer removes it without another mention being sent", r.status === 200 && row().state === "removed" && !row().message_id && row().mention_ids === null && messages.size === 0 && effects().length === 2 && effects()[1].method === "DELETE", JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.afterEffect = async () => { await deleteThroughOriginalRoute(MEMBER, STAFF); }; await tick(); hooks = {};
  check("a mentioned member erased while the POST is in flight: the pointer is kept as unknown with removal pending and the vector holds the placeholder", row().state === "unknown" && row().message_id === ONE && row().cleanup_requested === 1 && row().mention_ids === JSON.stringify(["0"]), JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.http = (req) => req.method === "POST" ? new Response(null, { status: 429 }) : undefined; await tick(); hooks = {};
  check("fixture: a refused send keeps the vector it chose", row().state === "refused" && row().mention_ids === JSON.stringify([MEMBER]), JSON.stringify(row()));
  r = await arm();
  check("a fresh consent after a refusal starts with an empty mention list", r.status === 200 && row().state === "armed" && row().mention_ids === null, JSON.stringify(row()));
  // ---------- finding 1 (Codex, 03:10): consent withdrawn after the claim, during the POST, before a reconcile; standing lost after the claim ----------
  const withdraw = (status = "yes", revision = 1) => answer(MEMBER, { status, revision, remindMention: false });
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterStatement = async (sql) => { if (sql.includes("SET state='claimed',claim_nonce")) { hooks.afterStatement = null; const w = await withdraw(); if (w.status !== 200) throw Error("withdraw refused " + JSON.stringify(w)); } };
  await tick();
  check("website opt-out after the claim and before the POST invalidates the claim: no POST, the reminder cancelled (the organizer re-arms explicitly), nothing re-selected", row().state === "cancelled" && effects().length === 0 && !row().message_id, JSON.stringify(row()));
  r = await arm(); await tick();
  check("  after an explicit re-arm the reminder posts without the member (their choice is off)", r.status === 200 && row().state === "posted" && effects()[0].body.content === row().frozen_content && row().mention_ids === "[]", JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterStatement = async (sql) => { if (sql.includes("SET state='claimed',claim_nonce")) { hooks.afterStatement = null; await answer(MEMBER, { status: "no", revision: 1 }); } };
  await tick();
  check("a 'no' answer after the claim invalidates it the same way", row().state === "cancelled" && effects().length === 0, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterStatement = async (sql) => { if (sql.includes("SET state='claimed',claim_nonce")) { hooks.afterStatement = null; await fixtureRun("UPDATE site_users SET in_server=0 WHERE discord_id=?", MEMBER); } };
  await tick();
  check("standing lost after the claim (left the server) invalidates it too", row().state === "cancelled" && effects().length === 0, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterEffect = async () => { hooks.afterEffect = null; await withdraw(); }; await tick();
  check("website opt-out during the POST: the message exists, so the pointer is kept as unknown with removal pending, never posted; no re-send", row().state === "unknown" && row().message_id === ONE && row().cleanup_requested === 1 && row().mention_ids === JSON.stringify([MEMBER]) && effects().length === 1, JSON.stringify(row()));
  await tick(); check("  a later tick re-sends nothing", effects().length === 1 && row().state === "unknown", JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("  the organizer removes it", r.status === 200 && row().state === "removed" && messages.size === 0, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.afterEffect = () => { throw Error("lost synthetic POST"); }; await tick(); hooks = {};
  await withdraw();
  r = await call("POST", "/api/community/events/reminder/reconcile", { eventId: EVENT, opId: row().op_id, messageId: [...messages.keys()][0] });
  check("a lost POST, then the member's opt-out, then reconcile: the pointer is adopted as unknown with removal pending (the message mentions them), never posted", r.status === 200 && row().message_id === [...messages.keys()][0] && row().state === "unknown" && row().cleanup_requested === 1 && effects().length === 1, JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("  and removal works without another mention", r.status === 200 && row().state === "removed" && messages.size === 0, JSON.stringify(row()));

  // ---------- Codex finding (15 Oct 04:05): an admitted erasure (subject retiring, role cleanup waiting) stops the mention ----------
  // This fixture has no privacy serving environment, so the genuine original route cannot admit an erasure here (the genuine-admission cases
  // are the serving-integration family's). The admission batch's three recorded effects (privacy-serving-authority.ts: the subject row set
  // retiring, the waiting_role serving job, the session version bump) are written by the fixture below and labelled as fixture state.
  const authority = load("./privacy-serving-authority");
  const genuine = await authority.requestServingErasure(directEnv({ PRIVACY_ERASURE_ENABLED: "true" }), new Request("https://guild.example/api/me/erasure", { method: "POST", headers: { Cookie: await sessionCookies.get(MEMBER), Origin: "https://guild.example", "X-Olympus": "2" } }), "d".repeat(32)).catch((e) => e);
  check("fixture boundary: the genuine erasure route refuses in this fixture (feature_disabled: no privacy serving environment) and writes nothing; every member here has an active privacy-subject row from the seed; nothing below claims a genuine admission",
    genuine instanceof Response && genuine.status === 503 && one("SELECT state FROM privacy_subjects WHERE subject_id=?", MEMBER)?.state === "active" && !one("SELECT 1 AS x FROM privacy_serving_jobs WHERE subject_id=?", MEMBER), JSON.stringify([genuine && genuine.status, db.prepare("SELECT subject_id,state FROM privacy_subjects").all()]));
  const NOW = () => Math.floor(Date.now() / 1000);
  let admissions = 0;
  const admittedState = async (who) => { // the admission batch's three recorded effects (privacy-serving-authority.ts): the active subject row set retiring, one waiting_role serving job, the session version bump
    await fixtureRun("UPDATE privacy_subjects SET state='retiring',revision=revision+1,updated_at=? WHERE subject_id=? AND state='active'", NOW(), who);
    await fixtureRun("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until) VALUES(?,?,(SELECT generation FROM privacy_subjects WHERE subject_id=?2),?,1,?,'waiting_role',?,?)", (++admissions).toString(16).padStart(32, "0"), who, "e".repeat(64), NOW() + 3600, NOW(), NOW() + 31622400);
    await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?", who);
  };
  const subjectState = (who) => one("SELECT state FROM privacy_subjects WHERE subject_id=?", who)?.state ?? null;
  const jobState = (who) => one("SELECT state FROM privacy_serving_jobs WHERE subject_id=?", who)?.state ?? null;
  const standingRows = (who) => one("SELECT (SELECT in_server FROM site_users WHERE discord_id=?1) AS in_server, (SELECT COUNT(*) FROM characters WHERE discord_id=?1 AND status='member') AS chars, (SELECT status FROM community_event_signups WHERE event_id=?2 AND discord_id=?1) AS signup", who, EVENT);
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  await admittedState(MEMBER);
  check("fixture state: subject retiring, role cleanup waiting, while the standing rows and the yes sign-up are still present (the guild qualification alone would still select the member)",
    subjectState(MEMBER) === "retiring" && jobState(MEMBER) === "waiting_role" && standingRows(MEMBER).in_server === 1 && standingRows(MEMBER).chars === 1 && standingRows(MEMBER).signup === "yes", JSON.stringify([subjectState(MEMBER), jobState(MEMBER), standingRows(MEMBER)]));
  await tick();
  check("admitted before the claim: the retiring recipient is not selected; the reminder posts without any mention", row().state === "posted" && effects()[0].body.content === row().frozen_content && JSON.stringify(effects()[0].body.allowed_mentions) === JSON.stringify({ parse: [] }) && row().mention_ids === "[]", JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterStatement = async (sql) => { if (sql.includes("SET state='claimed',claim_nonce")) { hooks.afterStatement = null; await admittedState(MEMBER); } };
  await tick();
  check("admitted after the claim and before the POST: the proof fails, the claim is cancelled, no POST, nothing re-selected", row().state === "cancelled" && effects().length === 0 && !row().message_id && subjectState(MEMBER) === "retiring", JSON.stringify(row()));
  r = await arm(); await tick();
  check("  an explicit re-arm posts without the member", r.status === 200 && row().state === "posted" && row().mention_ids === "[]" && effects()[0].body.content === row().frozen_content, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm();
  hooks.afterEffect = async () => { hooks.afterEffect = null; await admittedState(MEMBER); }; await tick();
  check("admitted during the POST: the pointer is kept as unknown with removal pending, never posted; the vector still names the id so the later erasure batch can place the placeholder", row().state === "unknown" && row().message_id === ONE && row().cleanup_requested === 1 && row().mention_ids === JSON.stringify([MEMBER]) && effects().length === 1, JSON.stringify(row()));
  await tick(); check("  a later tick re-sends nothing", effects().length === 1 && row().state === "unknown", JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("  the organizer removes it", r.status === 200 && row().state === "removed" && messages.size === 0, JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await arm(); hooks.afterEffect = () => { throw Error("lost synthetic POST"); }; await tick(); hooks = {};
  await admittedState(MEMBER);
  r = await call("POST", "/api/community/events/reminder/reconcile", { eventId: EVENT, opId: row().op_id, messageId: [...messages.keys()][0] });
  check("a lost POST, then the admission, then reconcile: the pointer is adopted as unknown with removal pending, never as posted", r.status === 200 && row().message_id === [...messages.keys()][0] && row().state === "unknown" && row().cleanup_requested === 1 && effects().length === 1, JSON.stringify(row()));
  r = await call("POST", "/api/community/events/reminder/remove", { eventId: EVENT, opId: row().op_id });
  check("  and removal works without another mention", r.status === 200 && row().state === "removed" && messages.size === 0, JSON.stringify(row()));
  // the other two subject states, as fixture rows: a legacy member without a subject row stays eligible (every case above ran with the seeded active row); retired never is
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await fixtureRun("DELETE FROM privacy_subjects WHERE subject_id=?", MEMBER); await arm(); await tick();
  check("a legacy member without a privacy-subject row stays eligible (the existing policy's legacy-active behaviour)", row().state === "posted" && row().mention_ids === JSON.stringify([MEMBER]) && !one("SELECT 1 AS x FROM privacy_subjects WHERE subject_id=?", MEMBER), JSON.stringify(row()));
  await fresh(); await answer(MEMBER, { status: "yes", remindMention: true }); await fixtureRun("UPDATE privacy_subjects SET state='retired',erased_at=?,retain_until=?+31622400,updated_at=? WHERE subject_id=?", NOW(), NOW(), NOW(), MEMBER); await arm(); await tick();
  check("a retired privacy-subject row is never mentioned", row().state === "posted" && row().mention_ids === "[]" && effects()[0].body.content === row().frozen_content && one("SELECT state FROM privacy_subjects WHERE subject_id=?", MEMBER).state === "retired", JSON.stringify(row()));

  // .217: a legacy consent is never send authority and must not occupy the sole due-candidate slot.
  await fresh(); await arm();
  await fixtureRun('UPDATE community_event_reminders SET consent_account_incarnation=NULL WHERE event_id=?',EVENT);
  const legacy217=JSON.stringify(row()),second217='S'.repeat(22);
  r=await call('POST','/api/community/events',{opId:second217,title:'Eligible second reminder',details:'',startsAt:new Date((at()+1800)*1000).toISOString(),durationMin:120,capacity:2});
  if(r.status!==200)throw Error('second reminder event refused');
  r=await call('POST','/api/community/events/reminder',{eventId:second217,revision:1,enabled:true});
  if(r.status!==200)throw Error('second reminder consent refused');
  SQL=[];const effectsBefore217=effects().length;
  await tick();
  const eligible217=one('SELECT * FROM community_event_reminders WHERE event_id=?',second217);
  check('.217 NULL-consent first row does not starve the eligible second reminder',eligible217.state==='posted'&&effects().length===effectsBefore217+1,JSON.stringify(eligible217));
  check('.217 skipped legacy consent remains byte-for-byte unchanged and never sends',JSON.stringify(row())===legacy217&&row().last_attempt_at===0);
  check('.217 the due scan still selects at most one original candidate',SQL.filter(({sql})=>sql.startsWith('SELECT r.*,')).length===1&&effects().length===effectsBefore217+1);
  await fresh();await arm();await fixtureRun('UPDATE community_event_reminders SET consent_account_incarnation=NULL WHERE event_id=?',EVENT);
  const allNull217=JSON.stringify(row());SQL=[];const callsBeforeNull217=requests.length;
  await tick();
  check('.217 an all-NULL queue costs only the original candidate read and zero HTTP',payloadSQL().length===1&&requests.length===callsBeforeNull217&&JSON.stringify(row())===allNull217);

  console.log(`\n${passed}/${total} passed`);process.exitCode=passed===total?0:1;
})().catch(e=>{console.error(e);process.exitCode=1});
