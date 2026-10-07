// /olympus-intros (build .39) through the REAL src/intros.ts, src/discord.ts and src/db.ts against the REAL schema
// (node:sqlite). Only Discord's HTTP side is faked, as a small in-memory server: channels, messages, forum posts,
// pins. Checks the copy against Discord's limits and the channel config in wrangler.toml, then what a refresh does.
// Run from the worker folder:  node tests/intros_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
const D1 = {
  prepare(sql) {
    let params = [];
    const api = {
      bind: (...p) => { params = p; return api; },
      first: async () => db.prepare(sql).get(...params) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return api;
  },
};

const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const cache = {};
function load(name) {
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const intros = load("./intros");
const { INTROS, LINK_HOSTS, parseChannels, renderEmbeds, validateEmbeds, handleIntros, refreshIntros, introStatus, summarize, takeLock, BUDGET } = intros;

// The same INTROS_CHANNELS the Worker deploys with.
const toml = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8");
const tomlVar = (k, text = toml) => (text.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, "m")) || [])[1] || "";
const CHANNELS_RAW = tomlVar("INTROS_CHANNELS");
const CUTOVER_CHANNELS_RAW = tomlVar("INTROS_CHANNELS", fs.readFileSync(path.join(root, "wrangler.cutover.toml"), "utf8"));
const CH = parseChannels(CHANNELS_RAW);
const GUILD = tomlVar("INTROS_GUILD_ID");
const OFFICER = tomlVar("INTROS_ROLES").split(",")[0];
const EXPECTED_INTRO_KEYS = [
  "olympus-info", "olympus-notices", "olympus-visitors", "guild-announcements", "guild-chat",
  "looking-for-group", "classes-and-builds", "professions-and-trade", "raid-announcements",
  "raid-signups", "raid-discussion", "loot-and-raid-rules", "council-info", "council-chat",
  "council-decisions", "addon-development", "guild-suggestions",
];
const ADDED_INTRO_KEYS = ["council-info", "council-chat", "council-decisions", "addon-development", "guild-suggestions"];
const EXPECTED_MAPPING_KEYS = [...EXPECTED_INTRO_KEYS, "server-rules", "join-olympus", "the-tavern", "dungeon-party-1", "dungeon-party-2"].sort();

const env = { DB: D1, DISCORD_APP_ID: "1550176895671341076", DISCORD_BOT_TOKEN: "test-token", INTROS_GUILD_ID: GUILD, INTROS_ROLES: tomlVar("INTROS_ROLES"), INTROS_CHANNELS: CHANNELS_RAW };

// ---------- a fake Discord ----------
let D;
const resetDiscord = () => {
  D = { next: 900000000000000000n, messages: new Map(), threads: new Map(), calls: [], followups: [], failPin: false, failPostChannel: "", oldPinRouteOnly: false, reasons: [],
        forums: { [CH["looking-for-group"]]: [{ id: "7001", name: "Dungeon" }, { id: "7005", name: "Other" }],
                  [CH["classes-and-builds"]]: [{ id: "7101", name: "Warrior" }, { id: "7110", name: "Guide" }, { id: "7111", name: "Question" }] } };
};
const nextId = () => String(D.next++);
globalThis.fetch = async (url, init = {}) => {
  const p = new URL(url).pathname.replace(/^\/api\/v10/, "");
  const m = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : undefined;
  D.calls.push(`${m} ${p}`);
  if (init.headers && init.headers["X-Audit-Log-Reason"]) D.reasons.push(decodeURIComponent(init.headers["X-Audit-Log-Reason"]));
  const res = (status, obj) => new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  let x;
  if (m === "PATCH" && p.startsWith("/webhooks/")) { D.followups.push(body.content); return res(200, {}); }
  if ((x = p.match(/^\/channels\/(\d+)\/messages$/)) && m === "POST") {
    if (D.failPostChannel === x[1]) return res(403, { code: 50013, message: "Missing Permissions" });
    if (D.forums[x[1]]) return res(400, { code: 50008, message: "Cannot send messages in a non-text channel" });
    const msg = { id: nextId(), channel_id: x[1], content: body.content, embeds: body.embeds, pinned: false, allowed_mentions: body.allowed_mentions };
    D.messages.set(msg.id, msg); return res(200, msg);
  }
  if ((x = p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/))) {
    const msg = D.messages.get(x[2]);
    if (!msg || msg.channel_id !== x[1]) return res(404, { code: 10008, message: "Unknown Message" });
    const thread = D.threads.get(x[1]);
    if (m === "PATCH" && thread && thread.thread_metadata.archived) return res(400, { code: 50083, message: "Thread is archived" });
    if (m === "PATCH") { msg.embeds = body.embeds; if (body.content !== undefined) msg.content = body.content; msg.edits = (msg.edits || 0) + 1; }
    return res(200, msg);
  }
  if ((x = p.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/)) && m === "PUT") {
    if (D.oldPinRouteOnly) return res(404, { message: "404: Not Found", code: 0 });
    if (D.failPin) return res(403, { code: 50013, message: "Missing Permissions" });
    const msg = D.messages.get(x[2]); if (!msg) return res(404, { code: 10008 }); msg.pinned = true; return res(204);
  }
  if ((x = p.match(/^\/channels\/(\d+)\/pins\/(\d+)$/)) && m === "PUT") {
    const msg = D.messages.get(x[2]); if (!msg) return res(404, { code: 10008 }); msg.pinned = true; return res(204);
  }
  if ((x = p.match(/^\/channels\/(\d+)\/threads$/)) && m === "POST") {
    const tags = D.forums[x[1]]; if (!tags) return res(400, { code: 0 });
    const t = { id: nextId(), parent_id: x[1], name: body.name, flags: 0, applied_tags: body.applied_tags || [], thread_metadata: { archived: false } };
    D.threads.set(t.id, t);
    D.messages.set(t.id, { id: t.id, channel_id: t.id, content: body.message.content, embeds: body.message.embeds, pinned: false });
    return res(201, t);
  }
  if ((x = p.match(/^\/channels\/(\d+)$/))) {
    if (D.forums[x[1]] && m === "GET") return res(200, { id: x[1], type: 15, available_tags: D.forums[x[1]] });
    const t = D.threads.get(x[1]); if (!t) return res(404, { code: 10003, message: "Unknown Channel" });
    if (m === "PATCH") { if (body.flags !== undefined) t.flags = body.flags; if (body.name !== undefined) t.name = body.name; if (body.archived !== undefined) t.thread_metadata.archived = body.archived; }
    return res(200, t);
  }
  return res(404, { message: "404: Not Found", code: 0 });
};

let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };
const count = (re) => D.calls.filter((c) => re.test(c)).length;
const interaction = (sub, opts = {}, over = {}) => ({
  type: 2, id: "1", token: "tok-" + Math.random().toString(36).slice(2), guild_id: GUILD, channel_id: CH["olympus-info"],
  member: { user: { id: "111111111111111111", username: "officer" }, roles: [OFFICER], permissions: "0" },
  data: { name: "olympus-intros", options: [{ type: 1, name: sub, options: Object.entries(opts).map(([name, value]) => ({ name, type: 7, value })) }] },
  ...over,
});
async function run(i) {
  let pending = null;
  const resp = await handleIntros(env, i, (p) => { pending = p; });
  const out = await resp.json();
  if (pending) await pending;
  return out;
}

(async () => {
  resetDiscord();
  console.log("== the copy itself ==");
  const textOf = (x) => JSON.stringify(x);
  check("the source has exactly the seventeen reviewed intros, preserving the twelve original keys", JSON.stringify(INTROS.map((x) => x.key)) === JSON.stringify(EXPECTED_INTRO_KEYS) && INTROS.filter((x) => !x.forum).length === 15 && INTROS.filter((x) => x.forum).length === 2);
  check("live and cutover INTROS_CHANNELS use the same complete twenty-two-key mapping", CUTOVER_CHANNELS_RAW === CHANNELS_RAW && JSON.stringify(Object.keys(CH).sort()) === JSON.stringify(EXPECTED_MAPPING_KEYS));
  const rawChannelPairs = CHANNELS_RAW.split(",").map((p) => p.split("="));
  check("all twenty-two configured channel keys and ids are distinct valid snowflakes", rawChannelPairs.length === 22 && new Set(rawChannelPairs.map((p) => p[0])).size === 22 && new Set(rawChannelPairs.map((p) => p[1])).size === 22 && rawChannelPairs.every((p) => p.length === 2 && /^[0-9]{17,20}$/.test(p[1])));

  const keys = new Set();
  for (const intro of INTROS) for (const k of textOf([intro.embeds, intro.content || ""]).matchAll(/\{#([a-z0-9-]+)\}/g)) keys.add(k[1]);
  const missing = [...keys, ...INTROS.map((x) => x.channel)].filter((k) => !CH[k]);
  check("every {#channel} and every intro's channel is in INTROS_CHANNELS (wrangler.toml)", missing.length === 0 || console.log("   missing:", missing));
  check("intro keys are unique", new Set(INTROS.map((x) => x.key)).size === INTROS.length);
  check("one intro per channel (a second would fight the first for the pin)", new Set(INTROS.map((x) => x.channel)).size === INTROS.length);
  let limitsOk = true;
  for (const intro of INTROS) {
    const problems = validateEmbeds(renderEmbeds(intro, CH));
    if (problems.length) { limitsOk = false; console.log("   ", intro.key, problems); }
    if (intro.forum && intro.forum.title.length > 100) { limitsOk = false; console.log("   ", intro.key, "post title over 100"); }
  }
  check("every intro fits Discord's limits (embeds, fields, 6000 per message, post titles)", limitsOk);
  const rendered = INTROS.map((x) => textOf(renderEmbeds(x, CH)) + "\n" + intros.resolveText(x.content || "", CH)).join("\n");
  check("content lines fit (2000) and every forum post has one, so its preview is not \"Click to see attachment\"",
    INTROS.every((x) => (x.content || "").length <= 2000) && INTROS.filter((x) => x.forum).every((x) => (x.content || "").length > 10));
  check("no placeholder is left after rendering", !/\{#/.test(rendered));
  check("no @everyone, @here or role pings in the copy", !/@everyone|@here|<@&/.test(rendered));
  const hosts = [...rendered.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  check("every link is https and on Blizzard or an editorial guide site", hosts.length > 10 && hosts.every((u) => u.startsWith("https://") && LINK_HOSTS.includes(new URL(u).host)) || console.log("   ", hosts.filter((u) => !LINK_HOSTS.includes(new URL(u).host))));
  check("the launch timestamp is 4 Nov 2026 15:00 PST (23:00 UTC)", rendered.includes("<t:1793833200:F>") && Date.UTC(2026, 10, 4, 23) / 1000 === 1793833200);
  check("the dungeon example uses Hall of Thanes' level range from Wowhead (13-18)", rendered.includes("Hall of Thanes · 13–18") && !rendered.includes("28–34"));
  check("Hardcore is said to come after launch", /Hardcore \(after launch\)/.test(rendered));
  check("a channel missing from the config becomes plain text, not a broken mention", intros.resolveText("see {#nowhere}", CH) === "see #nowhere");

  console.log("== who may run it ==");
  const other = await run(interaction("status", {}, { guild_id: "1549537348516188200" }));
  check("another server (the beta server) is refused", other.type === 4 && /only works in the server/.test(other.data.content));
  const member = await run(interaction("status", {}, { member: { user: { id: "2", username: "m" }, roles: [], permissions: "0" } }));
  check("a member without an Olympus officer role is refused", /officers only/.test(member.data.content));
  const admin = await run(interaction("status", {}, { member: { user: { id: "3", username: "a" }, roles: [], permissions: String(1n << 3n | 1n << 10n) } }));
  check("an Administrator may run it without the role", admin.type === 4 && /Olympus intros/.test(admin.data.content));
  check("status before any refresh: every intro 'not posted yet'", (admin.data.content.match(/not posted yet/g) || []).length === INTROS.length);
  check("status makes no Discord calls", D.calls.length === 0);
  const off = await handleIntros({ ...env, INTROS_GUILD_ID: "" }, interaction("status"), () => {});
  check("INTROS_GUILD_ID empty switches the command off", /only works/.test((await off.json()).data.content));

  console.log("== first refresh: post, pin, record ==");
  const first = await run(interaction("refresh"));
  check("the reply is deferred and private (type 5, ephemeral)", first.type === 5 && first.data.flags === 64);
  const textIntros = INTROS.filter((x) => !x.forum), forumIntros = INTROS.filter((x) => x.forum);
  check(`${textIntros.length} channel messages posted, one per channel`, count(/^POST \/channels\/\d+\/messages$/) === textIntros.length);
  check("each of them pinned", [...D.messages.values()].filter((mm) => !D.threads.has(mm.channel_id)).every((mm) => mm.pinned));
  check(`${forumIntros.length} forum posts created`, count(/^POST \/channels\/\d+\/threads$/) === forumIntros.length);
  const lfg = [...D.threads.values()].find((t) => t.parent_id === CH["looking-for-group"]);
  const cab = [...D.threads.values()].find((t) => t.parent_id === CH["classes-and-builds"]);
  check("LFG post: its title and the Other tag", lfg && lfg.name === "Read first: how to post a group" && lfg.applied_tags[0] === "7005");
  check("classes-and-builds post: the Guide tag", cab && cab.applied_tags[0] === "7110");
  check("forum posts open with their content line; channel messages carry none", D.messages.get(lfg.id).content.startsWith("How to post a group") && [...D.messages.values()].filter((mm) => !D.threads.has(mm.channel_id)).every((mm) => mm.content === ""));
  check("both forum posts pinned to the top (flag 2)", lfg.flags === 2 && cab.flags === 2);
  check("no message may ping anyone (allowed_mentions parse [])", [...D.messages.values()].filter((mm) => mm.allowed_mentions).every((mm) => mm.allowed_mentions.parse.length === 0));
  check("the officer's reply is edited with the summary", D.followups.length === 1 && (D.followups[0].match(/posted/g) || []).length === INTROS.length);
  check(`a first refresh stays inside the budget (${D.calls.length} calls of ${BUDGET})`, D.calls.length <= BUDGET + 1);
  check("every write carries an audit-log reason naming the officer", D.reasons.length > 0 && D.reasons.every((r) => r.includes("/olympus-intros refresh by 111111111111111111")));
  check("one record per intro", db.prepare("SELECT COUNT(*) AS c FROM intro_posts").get().c === INTROS.length);
  for (const key of ADDED_INTRO_KEYS) {
    const messages = [...D.messages.values()].filter((mm) => mm.channel_id === CH[key]);
    const row = db.prepare("SELECT parent_id, channel_id, message_id FROM intro_posts WHERE guild_id = ? AND intro_key = ?").get(GUILD, key);
    check(`#${key}: one text intro is posted, pinned and recorded without a duplicate`, messages.length === 1 && messages[0].pinned && row?.parent_id === CH[key] && row.channel_id === CH[key] && row.message_id === messages[0].id);
  }

  check("the refresh is audited", db.prepare("SELECT COUNT(*) AS c FROM audit WHERE action = 'intros.refresh'").get().c === 1);
  check("the lock is released", db.prepare("SELECT COUNT(*) AS c FROM intro_locks").get().c === 0);
  const infoMsg = [...D.messages.values()].find((mm) => mm.channel_id === CH["olympus-info"]);
  check("#olympus-info is one message with three embeds", infoMsg && infoMsg.embeds.length === 3);
  check("mentions resolve to real channel ids", JSON.stringify(infoMsg.embeds).includes(`<#${CH["join-olympus"]}>`));
  const infoText = JSON.stringify(infoMsg.embeds);
  check("the join step says an invite can be requested before joining (.52, content candidate)", /request a guild invite this way before joining/.test(infoText) && !/Join the main Olympus guild in game, then/.test(infoText));
  check("  the beta field names invited testers and says an application grants no beta access", /selected invited testers/.test(infoText) && /does not grant beta access/.test(infoText));
  check("  name reservation: three characters, and the planning list reserves nothing", /up to three characters/.test(infoText) && /does not reserve it in the game/.test(infoText));
  check("  the add-on paragraph makes no claim about an unpublished policy", !/hasn't published/.test(infoText) && /reviewed release/.test(infoText));
  check("  no guide claims an unpublished add-on policy; #classes-and-builds gives the same supported guidance (.113)",
    !INTROS.some((x) => /hasn't published/.test(textOf(renderEmbeds(x, CH))))
    && /reviewed release/.test(textOf(renderEmbeds(INTROS.find((x) => x.channel === "classes-and-builds"), CH))));
  check("  the facts footer is dated 1 October 2026", /checked October 1, 2026/.test(infoText));

  console.log("== second refresh, nothing changed ==");
  D.calls = []; D.followups = [];
  await run(interaction("refresh"));
  check("reads only: no post, edit or pin", D.calls.every((c) => c.startsWith("GET ") || c.startsWith("PATCH /webhooks/")));
  check("everything reported current", (D.followups[0].match(/current/g) || []).length === INTROS.length);
  check("no second copy anywhere", [...D.messages.values()].length === INTROS.length);

  console.log("== the text changes (a deploy) ==");
  const infoIntro = INTROS.find((x) => x.key === "olympus-info");
  const savedDesc = infoIntro.embeds[0].description;
  infoIntro.embeds[0].description = savedDesc + "\nTest line.";
  const lfgIntro = INTROS.find((x) => x.key === "looking-for-group");
  const savedLfg = lfgIntro.embeds[0].description;
  lfgIntro.embeds[0].description = savedLfg + "\nTest line.";
  lfg.thread_metadata.archived = true; // the post went quiet and archived itself
  const st = await introStatus(env, GUILD);
  check("status sees both as changed before the refresh", (st.match(/text changed/g) || []).length === 2);
  D.calls = []; D.followups = [];
  await run(interaction("refresh"));
  check("#olympus-info edited in place: same message, no new post", infoMsg.edits === 1 && infoMsg.embeds[0].description.endsWith("Test line.") && count(/^POST /) === 0);
  check("the archived forum post is reopened before its message is edited", lfg.thread_metadata.archived === false && D.messages.get(lfg.id).embeds[0].description.endsWith("Test line."));
  check("the summary says two updated in place", (D.followups[0].match(/updated in place/g) || []).length === 2);
  infoIntro.embeds[0].description = savedDesc;
  lfgIntro.embeds[0].description = savedLfg;
  await run(interaction("refresh"));

  console.log("== someone deletes one and unpins another ==");
  const signups = [...D.messages.values()].find((mm) => mm.channel_id === CH["raid-signups"]);
  D.messages.delete(signups.id);
  const chat = [...D.messages.values()].find((mm) => mm.channel_id === CH["guild-chat"]);
  chat.pinned = false;
  cab.flags = 0;
  D.calls = []; D.followups = [];
  await run(interaction("refresh"));
  const signups2 = [...D.messages.values()].find((mm) => mm.channel_id === CH["raid-signups"]);
  check("the deleted one is posted again and pinned", signups2 && signups2.id !== signups.id && signups2.pinned);
  check("the record now points at the new message", db.prepare("SELECT message_id FROM intro_posts WHERE intro_key = 'raid-signups'").get().message_id === signups2.id);
  check("the unpinned one is pinned again, not reposted", chat.pinned && [...D.messages.values()].filter((mm) => mm.channel_id === CH["guild-chat"]).length === 1);
  check("the unpinned forum post is pinned again", cab.flags === 2);
  check("the summary names all three", /was deleted, posted again/.test(D.followups[0]) && (D.followups[0].match(/pinned again/g) || []).length === 2);

  console.log("== one channel only ==");
  D.calls = [];
  const one = await run(interaction("refresh", { channel: CH["raid-discussion"] }));
  check("refresh channel: touches only that channel", one.type === 5 && D.calls.filter((c) => !c.startsWith("PATCH /webhooks/")).every((c) => c.includes(CH["raid-discussion"]) || /messages\/\d+$/.test(c)) && D.calls.length === 2);
  const none = await run(interaction("refresh", { channel: CH["join-olympus"] }));
  check("a channel without an intro is answered, not refreshed", none.type === 4 && /no Olympus intro/.test(none.data.content));

  console.log("== limits, locks and failures ==");
  db.exec("DELETE FROM intro_posts"); resetDiscord();
  const small = await refreshIntros(env, GUILD, "111111111111111111", undefined, 9);
  check("a small budget stops early without breaking a half-done intro", small.stoppedEarly && small.outcomes.some((o) => o.action === "not-reached") && D.calls.length <= 9);
  check("…and says to run it again", /Run `\/olympus-intros refresh` again/.test(summarize(small)));
  const rest = await refreshIntros(env, GUILD, "111111111111111111");
  check("the next run finishes the rest without reposting the first ones", !rest.stoppedEarly && [...D.messages.values()].length === INTROS.length);
  check("two officers at once: the second is told to wait", await takeLock(env, GUILD, "someone-else") && (await refreshIntros(env, GUILD, "2")).busy === true);
  db.exec("DELETE FROM intro_locks");
  db.prepare("INSERT INTO intro_locks (guild_id, holder, until) VALUES (?, 'crashed', 1)").run(GUILD); // expired long ago
  check("a stale lock from a crashed run is taken over", !(await refreshIntros(env, GUILD, "3")).busy);
  db.exec("DELETE FROM intro_posts"); resetDiscord(); D.failPin = true;
  const noPin = await refreshIntros(env, GUILD, "4", CH["guild-chat"]);
  check("a pin the bot may not make: posted anyway, and the reason is shown", noPin.outcomes[0].action === "posted" && /not pinned: .*Missing Permissions/.test(noPin.outcomes[0].note));
  db.exec("DELETE FROM intro_posts"); resetDiscord(); D.oldPinRouteOnly = true;
  await refreshIntros(env, GUILD, "5", CH["guild-chat"]);
  check("falls back to the old pin route when the new one is missing", [...D.messages.values()][0].pinned && count(/^PUT \/channels\/\d+\/pins\//) === 1);
  db.exec("DELETE FROM intro_posts"); resetDiscord();
  const moved = { ...env, INTROS_CHANNELS: CHANNELS_RAW.replace(`guild-chat=${CH["guild-chat"]}`, "guild-chat=1554999999999999999") };
  await refreshIntros(env, GUILD, "6", CH["guild-chat"]);
  const mv = await refreshIntros(moved, GUILD, "6", "1554999999999999999");
  check("a channel re-pointed in the config gets a new post; the old one is named, not deleted", mv.outcomes[0].action === "moved" && /old copy/.test(mv.outcomes[0].note));

  console.log("== the five new intro channels: missing configuration and retry ==");
  for (const key of ADDED_INTRO_KEYS) {
    db.exec("DELETE FROM intro_posts"); resetDiscord();
    const missingRaw = CHANNELS_RAW.split(",").filter((p) => !p.startsWith(key + "=")).join(",");
    const missingEnv = { ...env, INTROS_CHANNELS: missingRaw };
    const beforeStatusCalls = D.calls.length;
    const missingStatus = await introStatus(missingEnv, GUILD);
    check(`#${key}: missing configuration is named in status without HTTP`, missingStatus.includes(`#${key}: no channel set in INTROS_CHANNELS`) && (missingStatus.match(/not posted yet/g) || []).length === 16 && D.calls.length === beforeStatusCalls && intros.resolveText(`see {#${key}}`, parseChannels(missingRaw)) === `see #${key}`);
    const missingResult = await refreshIntros(missingEnv, GUILD, "missing-" + key);
    const own = missingResult.outcomes.find((o) => o.key === key);
    check(`#${key}: refresh skips the missing parent, posts the other sixteen, and never calls or records it`, missingResult.outcomes.length === 17 && !missingResult.stoppedEarly && own?.action === "skipped" && own.note === `no "${key}" channel in INTROS_CHANNELS` && missingResult.outcomes.filter((o) => o.action === "skipped").length === 1 && !D.calls.some((c) => c.includes("/channels/" + CH[key])) && db.prepare("SELECT COUNT(*) AS c FROM intro_posts").get().c === 16 && !db.prepare("SELECT 1 FROM intro_posts WHERE intro_key = ?").get(key) && [...D.messages.values()].length === 16 && db.prepare("SELECT COUNT(*) AS c FROM intro_locks").get().c === 0);
  }
  check("an invalid new-channel id is dropped and renders plain text", !parseChannels("addon-development=not-a-snowflake")["addon-development"] && intros.resolveText("see {#addon-development}", parseChannels("addon-development=not-a-snowflake")) === "see #addon-development");
  db.exec("DELETE FROM intro_posts"); resetDiscord();
  const retryKey = "addon-development", retryChannel = CH[retryKey];
  D.failPostChannel = retryChannel;
  const failedPost = await refreshIntros(env, GUILD, "retry-officer", retryChannel);
  check("a denied new-intro POST fails explicitly, records no success and releases its lock", failedPost.outcomes.length === 1 && failedPost.outcomes[0].key === retryKey && failedPost.outcomes[0].action === "failed" && /Missing Permissions/.test(failedPost.outcomes[0].note) && failedPost.callsUsed === 1 && D.messages.size === 0 && db.prepare("SELECT COUNT(*) AS c FROM intro_posts").get().c === 0 && db.prepare("SELECT COUNT(*) AS c FROM intro_locks").get().c === 0);
  D.failPostChannel = "";
  const retriedPost = await refreshIntros(env, GUILD, "retry-officer", retryChannel);
  const retryMessage = [...D.messages.values()][0];
  const retryRow = db.prepare("SELECT parent_id, channel_id, message_id FROM intro_posts WHERE guild_id = ? AND intro_key = ?").get(GUILD, retryKey);
  check("the failed new intro can be retried to one pinned, correctly recorded post", retriedPost.outcomes.length === 1 && retriedPost.outcomes[0].action === "posted" && retryMessage?.channel_id === retryChannel && retryMessage.pinned && D.messages.size === 1 && retryRow?.parent_id === retryChannel && retryRow.channel_id === retryChannel && retryRow.message_id === retryMessage.id && db.prepare("SELECT COUNT(*) AS c FROM intro_posts").get().c === 1);
  const beforeCurrent = D.calls.length, beforePosts = count(/^POST /);
  const currentPost = await refreshIntros(env, GUILD, "retry-officer", retryChannel);
  check("a successful retry becomes current with one read and no duplicate, edit or pin", currentPost.outcomes.length === 1 && currentPost.outcomes[0].action === "current" && currentPost.callsUsed === 1 && D.calls.length === beforeCurrent + 1 && D.calls[beforeCurrent] === `GET /channels/${retryChannel}/messages/${retryMessage.id}` && count(/^POST /) === beforePosts && D.messages.size === 1 && db.prepare("SELECT message_id FROM intro_posts WHERE guild_id = ? AND intro_key = ?").get(GUILD, retryKey).message_id === retryMessage.id);
  const beforeRetryStatus = D.calls.length;
  const retryStatus = await introStatus(env, GUILD);
  check("status records the retried new intro as current without HTTP", retryStatus.includes(`<#${retryChannel}>: current`) && (retryStatus.match(/not posted yet/g) || []).length === 16 && D.calls.length === beforeRetryStatus);


  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
