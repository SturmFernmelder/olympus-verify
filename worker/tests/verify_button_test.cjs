// The Verify button and /verify, end to end through the REAL src/interactions.ts and src/ingest.ts against the REAL
// schema (node:sqlite): press the button, read the reply a member sees, whisper the code as the watcher would relay
// it, and check who got linked. Only Discord's HTTP side (role grants, messages) is stubbed.
// Run from the worker folder:  node tests/verify_button_test.cjs
const fs = require("fs"), path = require("path"), ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.join(__dirname, "..");

const entry = require("./helpers/privacy129_fixture.cjs");
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");
entry.installCurrentEntryEpoch(db);
let afterNativeBatch216 = null;
const D1 = entry.originalNativePort(db, { afterBatch(plan, result) { return afterNativeBatch216?.(plan, result); } });

let VERIFIED = [];
const transpile = (file) => ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
// discord.ts is real (reply, json, userOf, option are pure), with fetch refused so nothing can reach Discord.
globalThis.fetch = async () => { throw new Error("no network in tests"); };
const stubs = {
  "./review": { onVerified: async (_env, pending, source) => { VERIFIED.push({ ...pending, source }); }, approvePending: async () => ({}), denyPending: async () => ({}) },
  "./dm": { notify: async () => {}, noticeBatch: () => ({ items: [] }), flushNotices: async () => {} },
};
const cache = {};
function load(name) { if (name === "node:async_hooks" || name === "./node:async_hooks") return require("node:async_hooks");
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("module", "exports", "require", transpile(path.join(root, "src", name.replace("./", "") + ".ts")))(mod, mod.exports, (p) => load(p));
  return mod.exports;
}
const { handleInteraction } = load("./interactions");
const { postVerify } = load("./ingest");
const { recordRelay } = load("./relays");

const GUILD = "1549537348516188200", A = "111111111111111111", B = "222222222222222222";
const env = { DB: load("./privacy-write-admission").createPrivacyWriteAdmissionDatabase(D1,"writer","canonical",entry.ENTRY_EPOCH), GUILD_ID: GUILD, VERIFY_SECRET: "button-test-secret", ADMISSION_MODE: "auto", OFFICER_CHARACTERS: "Fern Melder", ROLE_GUILD_MEMBER: "1549581282227265566", CHANNEL_VISITOR_CHAT: "" };
const button = (user) => ({ type: 3, guild_id: GUILD, data: { custom_id: "guide:verify" }, member: { user: { id: user }, roles: [] } });
const slash = (user, character) => ({ type: 2, guild_id: GUILD, data: { name: "verify", options: character ? [{ name: "character", type: 3, value: character }] : [] }, member: { user: { id: user }, roles: [] } });
const content = async (res) => (await res.json()).data.content;
let ok = 0, n = 0;
const check = (name, cond) => { n++; if (cond) ok++; console.log((cond ? "PASS " : "FAIL ") + name); };

(async () => {
  console.log("== until an upgraded officer PC has checked in, the button asks for the character ==");
  const early = await (await handleInteraction(env, button(A))).json();
  check("no relay has reported addon 0.6.0 yet: the name form opens, as before 27 Sep", early.type === 9 && early.data.custom_id === "guide:verify-modal");
  check("  and no request code was minted", db.prepare("SELECT COUNT(*) AS n FROM pending").get().n === 0);
  // the officer's watcher reports in, with the addon's login note behind it
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: false, version: "0.6.0", addon: "0.6.0" });

  console.log("\n== the button: a code and the whole line to paste, nothing typed ==");
  const first = await content(await handleInteraction(env, button(A)));
  const code = (first.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("the button answers with a 7-symbol request code", !!code);
  check("  and the exact line to paste in game", first.includes("```\n/w Fern Melder !verify " + code + "\n```"));
  check("  from whichever character should be linked", first.includes("any of yours"));
  check("  nobody online: the reply says so, with how long the code holds", first.includes("No officer is online right now"));
  const again = await content(await handleInteraction(env, button(A)));
  check("pressing it again shows the same code, not a new one", again.includes(code) && db.prepare("SELECT COUNT(*) AS n FROM pending WHERE discord_id = ?1").get(A).n === 1);
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: null, version: "0.6.0", addon: "0.6.0" });
  const unsure = await content(await handleInteraction(env, button(A)));
  check("the watcher cannot tell (.62): the reply names Fern Melder without claiming anyone is online or that nobody is", unsure.includes("/w Fern Melder !verify " + code) && unsure.includes("Send it while Fern Melder") && !unsure.includes("No officer is online") && !unsure.includes("is online now"));

  console.log("\n== presence: the reply names who is online ==");
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
  const online = await content(await handleInteraction(env, button(A)));
  check("online: the reply says Fern Melder is online now", online.includes("**Fern Melder** is online now"));
  await recordRelay(env, { officer: "alt officer", character: "Alt Officer", online: true, version: "0.5.9" });
  const onlyCapable = await content(await handleInteraction(env, button(A)));
  check("  an officer whose addon predates request codes is not named for one", !onlyCapable.includes("Alt Officer"));

  console.log("\n== the whisper decides the character ==");
  const r = await postVerify(env, { character: "Kira Moonfall", code, source: "whisper" });
  check("the watcher's relay of the whisper links Kira Moonfall to this account", (await r.json()).result === "verified" && db.prepare("SELECT discord_id FROM characters WHERE name_key = 'kira moonfall'").get().discord_id === A);
  check("  and her invite is queued under her name", VERIFIED.length === 1 && VERIFIED[0].name === "Kira Moonfall");
  const status = await content(await handleInteraction(env, { type: 3, guild_id: GUILD, data: { custom_id: "guide:status" }, member: { user: { id: A }, roles: [] } }));
  check("My status shows the character, no dangling code", status.includes("Kira Moonfall") && !status.includes("any of your characters"));
  const next = await content(await handleInteraction(env, button(A)));
  const code2 = (next.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("after it is used, the button gives a fresh code for another character", code2 && code2 !== code);

  console.log("\n== /verify with and without a character ==");
  const bare = await content(await handleInteraction(env, slash(A)));
  check("/verify with nothing typed behaves like the button", bare.includes(code2));
  const named = await content(await handleInteraction(env, slash(A, "Thrall")));
  check("/verify Thrall gives a 6-symbol code bound to Thrall", /Your code for \*\*Thrall\*\*: `[A-Z2-9]{6}`/.test(named) && named.includes("logged in as **Thrall**"));

  console.log("\n== a verification ban closes the account's open codes ==");
  const OFFICER = "1549581384035893328";
  env.ROLE_OFFICER = OFFICER;
  const pressB = await content(await handleInteraction(env, button(B)));
  const codeB = (pressB.match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  check("B holds an open request code", !!codeB);
  await handleInteraction(env, {
    type: 2, guild_id: GUILD, member: { user: { id: A }, roles: [OFFICER] },
    data: { name: "olympus-admin", options: [{ type: 1, name: "ban", options: [{ name: "user", type: 6, value: B }, { name: "reason", type: 3, value: "test" }] }] },
  });
  check("the ban closes it", db.prepare("SELECT consumed_source FROM pending WHERE discord_id = ?1 ORDER BY id DESC").get(B).consumed_source === "banned");
  const late = await (await postVerify(env, { character: "Banned Late", code: codeB, source: "whisper" })).json();
  check("  so a whisper of it afterwards links nothing", late.result !== "verified" && !db.prepare("SELECT 1 FROM characters WHERE name_key = 'banned late'").get());

  console.log("\n== SEN-01: a character code claims only the request it was shown for ==");
  // A character code depends only on the name and the day, so a code shown for one request must not claim the name's
  // next request, opened by another account once the first lapsed. The clock is pinned to whole hours from tomorrow's
  // start (D); every request below that is whispered against still expires after the database's own clock.
  const RealDate = Date, D = (Math.floor(RealDate.now() / 86_400_000) + 1) * 86_400;
  let T = D, ticking = false;
  const at = (seconds) => { T = seconds; };
  // While ticking, every Date.now() moves the clock on by a second, so UTC midnight can pass in the middle of a reply.
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(T * 1000); else super(...a); } static now() { return (ticking ? T++ : T) * 1000; } };
  const { codeFor, dayBucket } = load("./codes");
  const dayCode = (name, s) => codeFor(env.VERIFY_SECRET, name, dayBucket(new RealDate(s * 1000)));
  const VICTIM = "333333333333333333", SQUAT = "444444444444444444", OWNER = "555555555555555555";
  const verify = async (user, name) => content(await handleInteraction(env, slash(user, name)));
  const shownCode = (text) => (text.match(/Your code for \*\*[^*]+\*\*: `([A-Z2-9]{6})`/) || [])[1];
  const linked = (key) => db.prepare("SELECT discord_id FROM characters WHERE name_key = ?1").get(key)?.discord_id;
  const refusedAudits = () => db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'verify.code_predates_request'").get().n;

  // 1. The victim's request lapses; the squatter opens the name's next request; the victim whispers the code shown to it.
  at(D - 13 * 3600);                                                     // D-1 11:00
  const lapsedCode = shownCode(await verify(VICTIM, "Elune Rift"));
  check("a fresh request shows the code of the day it opened", lapsedCode === await dayCode("Elune Rift", D - 13 * 3600));
  at(D + 12 * 3600);                                                     // D 12:00, the victim's request has lapsed
  const squatReply = await verify(SQUAT, "Elune Rift");
  check("the squatter can open the lapsed name's next request", !!shownCode(squatReply));
  at(D + 13 * 3600);
  const auditsBefore = refusedAudits();
  const lapsedResult = await (await postVerify(env, { character: "Elune Rift", code: lapsedCode, source: "whisper" })).json();
  check("a code shown for the lapsed request does not claim the next request", lapsedResult.result === "no_pending" && linked("elune rift") === undefined);
  check("  and the refusal is audited as a code that predates the request", refusedAudits() === auditsBefore + 1);

  // 2. The victim re-runs /verify the next day while its request is open, then the request lapses and the squatter takes it.
  at(D - 11 * 3600);                                                     // D-1 13:00
  const moonFirst = shownCode(await verify(VICTIM, "Moon Ward"));
  at(D + 12 * 3600);                                                     // D 12:00, still open
  const moonReshown = shownCode(await verify(VICTIM, "Moon Ward"));
  check("re-running /verify the next day shows the request's own code again, not today's", !!moonFirst && moonReshown === moonFirst && moonReshown !== await dayCode("Moon Ward", D + 12 * 3600));
  at(D + 13 * 3600 + 1);                                                 // just after it lapsed
  check("the squatter opens the next request", !!shownCode(await verify(SQUAT, "Moon Ward")));
  at(D + 14 * 3600);
  const moonLate = await (await postVerify(env, { character: "Moon Ward", code: moonReshown, source: "whisper" })).json();
  check("the re-shown code does not claim the squatter's request either", moonLate.result === "no_pending" && linked("moon ward") === undefined);

  // 3. An account refused because another holds the name sees no expiry and is not told to whisper a code that would
  //    link the other account. While request codes are on it is pointed to one, which names its own account; while
  //    they are off, Get my code would only ask for the name again, so it is pointed to an officer or a later try.
  at(D + 14 * 3600);
  check("another account holds a fresh name", !!shownCode(await verify(SQUAT, "Star Gale")));
  at(D + 15 * 3600);
  const refusalText = await verify(VICTIM, "Star Gale");
  check("the refusal gives no expiry time and offers a request code or an officer, not the character code", refusalText.includes("already in progress from another account") && !refusalText.includes("<t:") && !/whisper the code/.test(refusalText) && refusalText.includes("**Get my code**") && refusalText.includes("request code") && refusalText.includes("ask an officer"));
  const offText = await content(await handleInteraction({ ...env, REQUEST_CODES: "off" }, slash(VICTIM, "Star Gale")));
  check("  with request codes off it does not send the account to Get my code, which would ask for the name again", offText.includes("already in progress from another account") && !offText.includes("<t:") && !offText.includes("Get my code") && offText.includes("ask an officer") && offText.includes("24 hours"));

  // 4. The real owner can still link the character through a request code (ticket) while the name is held.
  await recordRelay(env, { officer: "fern melder", character: "Fern Melder", online: true, version: "0.6.0", addon: "0.6.0" });
  const ownerTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const ownerResult = await (await postVerify(env, { character: "Star Gale", code: ownerTicket, source: "whisper" })).json();
  check("the real owner's request code links the character to the owner while another account holds the name", !!ownerTicket && ownerResult.result === "verified" && linked("star gale") === OWNER);

  // 5. Controls: the holder's own code links the holder, also on the next day.
  at(D + 16 * 3600);
  const silverCode = shownCode(await verify(SQUAT, "Silver Hand"));
  at(D + 17 * 3600);
  const silverResult = await (await postVerify(env, { character: "Silver Hand", code: silverCode, source: "whisper" })).json();
  check("a request's own code still links its account", silverResult.result === "verified" && linked("silver hand") === SQUAT);
  at(D + 23 * 3600);                                                     // D 23:00
  const nightCode = shownCode(await verify(VICTIM, "Night Elf"));
  at(D + 24 * 3600 + 1800);                                              // D+1 00:30, still open
  check("  re-shown after midnight it is the same code", !!nightCode && shownCode(await verify(VICTIM, "Night Elf")) === nightCode);
  at(D + 25 * 3600);                                                     // D+1 01:00
  const nightResult = await (await postVerify(env, { character: "Night Elf", code: nightCode, source: "whisper" })).json();
  check("  and whispered after midnight it still links its account", nightResult.result === "verified" && linked("night elf") === VICTIM);

  // 6. A request also accepts the code of the day after it opened: .212 showed that code on a re-run after midnight,
  //    so requests open at the deploy keep working.
  at(D + 23 * 3600 + 1800);                                              // D 23:30
  const dawnShown = shownCode(await verify(OWNER, "Dawn Watch"));
  at(D + 25 * 3600 + 1800);                                              // D+1 01:30
  const dawnResult = await (await postVerify(env, { character: "Dawn Watch", code: await dayCode("Dawn Watch", D + 24 * 3600), source: "whisper" })).json();
  check("a request also accepts the code of the day after it opened", !!dawnShown && dawnResult.result === "verified" && linked("dawn watch") === OWNER);

  // 7. One timestamp opens a request and dates its code: started a few seconds before midnight with the clock ticking,
  //    some of these replies would otherwise date the code after the stored opening.
  let sameDay = true;
  for (let k = 1; k <= 30; k++) {
    const name = "Tick " + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(k - 1) % 26] + "abcdefghijklmnopqrstuvwxyz"[Math.floor((k - 1) / 26)] + "le";
    at(D + 48 * 3600 - k);
    ticking = true;
    const shown = shownCode(await verify(OWNER, name));
    ticking = false;
    const row = db.prepare("SELECT created_at FROM pending WHERE name_key = ?1 ORDER BY id DESC").get(name.toLowerCase());
    if (!shown || !row || shown !== await dayCode(name, row.created_at)) sameDay = false;
  }
  check("a new request's first reply shows the code of the day stored for it, even when midnight passes mid-reply", sameDay);

  console.log("\n== SEN-01 follow-up: one request per name, a name closed for the rest of the day, officers release a squat ==");
  const officerCommand = (sub, options) => ({ type: 2, guild_id: GUILD, member: { user: { id: OWNER }, roles: [OFFICER] }, data: { name: "olympus-admin", options: [{ type: 1, name: sub, options }] } });
  const unbind = async (character) => content(await handleInteraction(env, officerCommand("unbind", [{ name: "character", type: 3, value: character }])));
  const openRows = (key) => db.prepare("SELECT COUNT(*) AS n FROM pending WHERE name_key = ?1 AND consumed_at IS NULL").get(key).n;

  // 8. The check and the insert are one statement, so two presses at once cannot both open the name.
  at(D + 50 * 3600);                                                     // D+2 02:00
  const raceReplies = await Promise.all([verify(VICTIM, "Race Way"), verify(SQUAT, "Race Way")]);
  check("two accounts pressing at once open one request; the other is told it is in progress", raceReplies.filter((r) => shownCode(r)).length === 1 && raceReplies.filter((r) => r.includes("already in progress from another account")).length === 1 && openRows("race way") === 1);
  const twinReplies = await Promise.all([verify(VICTIM, "Twin Peak"), verify(VICTIM, "Twin Peak")]);
  check("  one account pressing twice opens one request and sees its code both times", !!shownCode(twinReplies[0]) && shownCode(twinReplies[0]) === shownCode(twinReplies[1]) && openRows("twin peak") === 1);

  // 9. A request closed early (here by a ban) keeps its name closed to other accounts for the rest of that UTC day: they
  //    would be shown the very code it was, and its holder's whisper would link the character to them.
  const EARLY = "666666666666666666";
  at(D + 51 * 3600);
  const mossCode = shownCode(await verify(EARLY, "Moss Vale"));
  await handleInteraction(env, officerCommand("ban", [{ name: "user", type: 6, value: EARLY }, { name: "reason", type: 3, value: "test" }]));
  at(D + 52 * 3600);
  const mossRefusal = await verify(SQUAT, "Moss Vale");
  check("after an early closure another account cannot open the name the same UTC day", !!mossCode && !shownCode(mossRefusal) && mossRefusal.includes("ended today") && mossRefusal.includes(`until 00:00 UTC (<t:${D + 72 * 3600}:R>)`) && mossRefusal.includes("**Get my code**"));
  at(D + 53 * 3600);
  const mossResult = await (await postVerify(env, { character: "Moss Vale", code: mossCode, source: "whisper" })).json();
  check("  so the code the closed request showed links nobody", mossResult.result !== "verified" && linked("moss vale") === undefined);
  const mossOff = await content(await handleInteraction({ ...env, REQUEST_CODES: "off" }, slash(SQUAT, "Moss Vale")));
  check("  with request codes off it says to come back after 00:00 UTC instead of pressing Get my code", mossOff.includes("00:00 UTC") && !mossOff.includes("Get my code") && mossOff.includes("run `/verify` again then"));
  at(D + 72 * 3600 + 60);                                                // D+3 00:01
  const mossNext = shownCode(await verify(SQUAT, "Moss Vale"));
  check("  the next UTC day it opens again, with a code the closed request never showed", !!mossNext && mossNext !== mossCode);

  // 10. Officers can close a squatting request on a name that was never linked; the reply names its holder, and /verify for
  //     the name stays closed to every account, the holder too, until 00:00 UTC.
  at(D + 74 * 3600);                                                     // D+3 02:00
  check("a never-linked name gets a squatting request", !!shownCode(await verify(SQUAT, "Fern Hollow")));
  const releaseAudits = () => db.prepare("SELECT details FROM audit WHERE action = 'admin.release' ORDER BY id").all();
  const releasesBefore = releaseAudits().length;
  const releaseText = await unbind("Fern Hollow");
  const newReleases = releaseAudits().slice(releasesBefore).map((a) => JSON.parse(a.details));
  check("an officer's unbind closes the open request on a never-linked name, names its holder and audits a release", releaseText.includes(`<@${SQUAT}>`) && releaseText.includes("is closed") && releaseText.includes(`until 00:00 UTC (<t:${D + 96 * 3600}:R>)`) && releaseText.includes("**Get my code**") && openRows("fern hollow") === 0 && newReleases.length === 1 && newReleases[0].holder === SQUAT && Number.isInteger(newReleases[0].request));
  check("  the released holder cannot take the name straight back", !shownCode(await verify(SQUAT, "Fern Hollow")) && openRows("fern hollow") === 0);
  check("  with nothing open it still answers that there is no binding", (await unbind("Nobody Here")) === "No binding for **Nobody Here**.");
  const fernTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const fernResult = await (await postVerify(env, { character: "Fern Hollow", code: fernTicket, source: "whisper" })).json();
  check("  and the owner's request code links the character at once", !!fernTicket && fernResult.result === "verified" && linked("fern hollow") === OWNER);
  // A blank name is not a name: open request codes carry an empty name key, and an unbind must not close them.
  const openTickets = () => db.prepare("SELECT COUNT(*) AS n FROM pending WHERE nonce IS NOT NULL AND consumed_at IS NULL").get().n;
  await handleInteraction(env, button(VICTIM));
  const ticketsBefore = openTickets();
  check("an unbind of a blank name closes no open request code", ticketsBefore > 0 && (await unbind(" ")).startsWith("No binding") && openTickets() === ticketsBefore);
  // A request code shows nobody the name's day code, so using one does not close the name for a character code.
  at(D + 75 * 3600);
  const glenTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const glenResult = await (await postVerify(env, { character: "Glen Ford", code: glenTicket, source: "whisper" })).json();
  await unbind("Glen Ford");
  check("a request code used today leaves the name open to another account's character code after an unbind", glenResult.result === "verified" && !!shownCode(await verify(SQUAT, "Glen Ford")));
  // Unbinding a linked name closes that account's own open request too. That request was shown today's code, so the account
  // gets /verify by name again from 00:00 UTC; the bare /verify of the reply (a request code) works at once.
  at(D + 76 * 3600);
  const nightOwn = shownCode(await verify(VICTIM, "Night Elf"));
  const nightUnbind = await unbind("Night Elf");
  const nightBare = (await content(await handleInteraction(env, slash(VICTIM)))).match(/Your code: `([A-Z2-9]{7})`/);
  check("an unbind of a linked name: the account gets a request code from /verify at once, and /verify by name from 00:00 UTC", !!nightOwn && nightUnbind.includes("Get my code") && nightUnbind.includes("00:00 UTC") && !!nightBare && !shownCode(await verify(VICTIM, "Night Elf")));
  // An unbound name has no live binding, so its unbind is a release: the squatting request is closed and its holder named,
  // not the former owner the name is still recorded against.
  at(D + 77 * 3600);
  const glenRelease = await unbind("Glen Ford");
  check("an unbind of an unbound name releases the squatting request, names its holder and keeps the holder out", glenRelease.includes(`<@${SQUAT}>`) && !glenRelease.includes(`<@${OWNER}>`) && glenRelease.includes("closed to every account") && openRows("glen ford") === 0 && !shownCode(await verify(SQUAT, "Glen Ford")));
  // Unbinding a linked name also closes another account's open request on it; that account cannot take the name back. An
  // unbound link proves nothing any more, so the unbound account waits for 00:00 UTC as well (that request's code was
  // shown today) and is pointed to a request code.
  at(D + 78 * 3600);
  const ashHeld = shownCode(await verify(SQUAT, "Ash Vale"));
  at(D + 78 * 3600 + 300);
  const ashTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const ashResult = await (await postVerify(env, { character: "Ash Vale", code: ashTicket, source: "whisper" })).json();
  at(D + 78 * 3600 + 600);
  await unbind("Ash Vale");
  check("an unbind of a linked name keeps out the other account whose open request it closed", !!ashHeld && ashResult.result === "verified" && openRows("ash vale") === 0 && !shownCode(await verify(SQUAT, "Ash Vale")));
  const ashOwner = await verify(OWNER, "Ash Vale");
  check("  and the unbound account waits for 00:00 UTC too, pointed to a request code", !shownCode(ashOwner) && ashOwner.includes("until 00:00 UTC") && ashOwner.includes("**Get my code**"));
  // The account a leaked request code linked keeps its verified_at after the unbind, but no exemption: it cannot reopen the
  // name and be shown the owner's code of the day, so the owner's whisper of that code links nobody.
  at(D + 79 * 3600);
  const thornCode = shownCode(await verify(VICTIM, "Thorn Gale"));
  at(D + 79 * 3600 + 600);
  const thornTicket = ((await content(await handleInteraction(env, button(SQUAT)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const thornLink = await (await postVerify(env, { character: "Thorn Gale", code: thornTicket, source: "whisper" })).json();
  at(D + 79 * 3600 + 1200);
  await unbind("Thorn Gale");
  at(D + 79 * 3600 + 1260);
  const thornReopen = shownCode(await verify(SQUAT, "Thorn Gale"));
  const thornWhisper = await (await postVerify(env, { character: "Thorn Gale", code: thornCode, source: "mail" })).json();
  check("an account unbound after a leaked request code cannot reopen the name, so the owner's earlier code links nobody", !!thornCode && thornLink.result === "verified" && !thornReopen && thornWhisper.result !== "verified" && db.prepare("SELECT status FROM characters WHERE name_key = 'thorn gale'").get().status === "unbound");
  // The same with the account's own character code, whispered by the owner on its word: once unbound it cannot reopen
  // the name that day, so the owner's re-sent copy of that code links nobody.
  at(D + 79 * 3600 + 1800);
  const moorCode = shownCode(await verify(SQUAT, "Moor Gate"));
  const moorLink = await (await postVerify(env, { character: "Moor Gate", code: moorCode, source: "whisper" })).json();
  at(D + 79 * 3600 + 2400);
  await unbind("Moor Gate");
  const moorReopen = shownCode(await verify(SQUAT, "Moor Gate"));
  const moorResent = await (await postVerify(env, { character: "Moor Gate", code: moorCode, source: "mail" })).json();
  check("an account unbound after its own code linked it cannot reopen the name that day, so a re-sent copy links nobody", !!moorCode && moorLink.result === "verified" && !moorReopen && moorResent.result !== "verified" && db.prepare("SELECT status FROM characters WHERE name_key = 'moor gate'").get().status === "unbound");
  // A live link verified after another account's same-day request opened is exempt: here that request ended by a ban.
  const LATE = "777777777777777777";
  at(D + 80 * 3600);
  const valeHeld = shownCode(await verify(LATE, "Vale Crest"));
  at(D + 80 * 3600 + 300);
  const valeTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const valeLink = await (await postVerify(env, { character: "Vale Crest", code: valeTicket, source: "whisper" })).json();
  await handleInteraction(env, officerCommand("ban", [{ name: "user", type: 6, value: LATE }, { name: "reason", type: 3, value: "test" }]));
  at(D + 80 * 3600 + 600);
  check("  while an account whose live link was verified after that request opened can open /verify for the name", !!valeHeld && valeLink.result === "verified" && !!shownCode(await verify(OWNER, "Vale Crest")));

  // 11. Two presses by one account across midnight, with the clock ticking: the press that loses the insert shows the code
  //     of the request that won it, not of its own later clock.
  let twinSame = true;
  for (let k = 1; k <= 20; k++) {
    const name = "Twin " + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[k - 1] + "ell";
    at(D + 96 * 3600 - k);
    ticking = true;
    const pair = await Promise.all([verify(VICTIM, name), verify(VICTIM, name)]);
    ticking = false;
    const row = db.prepare("SELECT created_at FROM pending WHERE name_key = ?1 ORDER BY id DESC").get(name.toLowerCase());
    if (!shownCode(pair[0]) || shownCode(pair[0]) !== shownCode(pair[1]) || shownCode(pair[1]) !== await dayCode(name, row.created_at) || openRows(name.toLowerCase()) !== 1) twinSame = false;
  }
  check("  across midnight both presses show the stored request's code", twinSame);

  // 12. A release closes only a live request and keeps out only an account whose live request was closed. A request opened
  //     the day before is released with the name open to other accounts at once.
  at(D + 97 * 3600);                                                     // D+4 01:00
  const rookFirst = shownCode(await verify(VICTIM, "Rook Hill"));
  at(D + 98 * 3600);                                                     // D+4 02:00
  const daleFirst = shownCode(await verify(VICTIM, "Dale End"));
  at(D + 116 * 3600);                                                    // D+4 20:00
  const pineCode = shownCode(await verify(VICTIM, "Pine Rest"));
  at(D + 116 * 3600 + 600);
  const pineLink = await (await postVerify(env, { character: "Pine Rest", code: pineCode, source: "whisper" })).json();
  at(D + 119 * 3600);                                                    // D+4 23:00
  const brookHeld = shownCode(await verify(SQUAT, "Brook Lea"));
  at(D + 119 * 3600 + 600);                                              // D+4 23:10, the linked account opens its own request
  const pineOwn = shownCode(await verify(VICTIM, "Pine Rest"));
  at(D + 119 * 3600 + 1800);                                             // D+4 23:30
  const hillHeld = shownCode(await verify(SQUAT, "Hill Fort"));
  at(D + 120 * 3600 + 1800);                                             // D+5 00:30, the owner links it with a request code
  const hillTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const hillLink = await (await postVerify(env, { character: "Hill Fort", code: hillTicket, source: "whisper" })).json();
  at(D + 121 * 3600);                                                    // D+5 01:00
  await unbind("Pine Rest");
  at(D + 121 * 3600 + 60);                                               // D+5 01:01
  const brookRelease = await content(await handleInteraction({ ...env, REQUEST_CODES: "off" }, officerCommand("unbind", [{ name: "character", type: 3, value: "Brook Lea" }])));
  check("releasing a request opened the day before opens the name to others at once but not to its holder", !!brookHeld && brookRelease.includes(`now, <@${SQUAT}> only from 00:00 UTC (<t:${D + 144 * 3600}:R>)`) && !shownCode(await verify(SQUAT, "Brook Lea")) && !!shownCode(await verify(OWNER, "Brook Lea")));
  check("  with request codes off the release reply offers no request code", !brookRelease.includes("Get my code"));
  // The unbind closed the linked account's own request from the day before, which showed it no code of today: it may open
  // the name again at once. A release then keeps out even the account the unbound name was last linked to.
  at(D + 121 * 3600 + 300);
  const pineBack = shownCode(await verify(VICTIM, "Pine Rest"));
  check("an unbind closing the linked account's own request from the day before lets it reopen the name at once", !!pineCode && pineLink.result === "verified" && !!pineOwn && !!pineBack);
  at(D + 121 * 3600 + 600);
  const pineRelease = await unbind("Pine Rest");
  check("  but a release keeps out even the account the unbound name was last linked to", pineRelease.includes(`<@${VICTIM}>`) && pineRelease.includes("closed to every account") && !shownCode(await verify(VICTIM, "Pine Rest")));
  // A linked unbind that closes another account's request from the day before keeps that account out until 00:00 UTC too.
  at(D + 121 * 3600 + 900);
  await unbind("Hill Fort");
  check("a linked unbind keeps out the other account whose request from the day before it closed", !!hillHeld && hillLink.result === "verified" && openRows("hill fort") === 0 && !shownCode(await verify(SQUAT, "Hill Fort")));
  at(D + 122 * 3600);                                                    // D+5 02:00, the Rook Hill request lapsed at 01:00
  const rookSquat = shownCode(await verify(SQUAT, "Rook Hill"));
  await unbind("Rook Hill");
  const rookRows = db.prepare("SELECT discord_id, consumed_source FROM pending WHERE name_key = 'rook hill' ORDER BY id").all();
  check("a release closes only the live request; the lapsed one keeps its record", !!rookFirst && !!rookSquat && rookRows.length === 2 && rookRows[0].discord_id === VICTIM && rookRows[0].consumed_source === null && rookRows[1].consumed_source === "release");
  // The linked unbind's own statement still stamps lapsed requests on the name; such a request did not end early, so its
  // account is not kept out.
  at(D + 123 * 3600);                                                    // D+5 03:00, the Dale End request lapsed at 02:00
  const daleTicket = ((await content(await handleInteraction(env, button(OWNER)))).match(/Your code: `([A-Z2-9]{7})`/) || [])[1];
  const daleResult = await (await postVerify(env, { character: "Dale End", code: daleTicket, source: "whisper" })).json();
  at(D + 123 * 3600 + 600);
  await unbind("Dale End");
  at(D + 123 * 3600 + 1200);
  check("an account whose request merely lapsed is not kept out by a later unbind that stamped it", !!daleFirst && daleResult.result === "verified" && db.prepare("SELECT consumed_source FROM pending WHERE name_key = 'dale end' AND discord_id = ?1").get(VICTIM).consumed_source === "unbind" && !!shownCode(await verify(VICTIM, "Dale End")));
  // Unbinding an unbound name again used to cancel an invite its old link had left queued (the invite sweep re-queues one
  // that went unanswered); a release on such a name still does.
  await env.DB.prepare("INSERT INTO invite_queue (name_key, name, discord_id, status, created_at) VALUES ('dale end', 'Dale End', ?1, 'queued', ?2)").bind(OWNER, T).run();
  const daleQueued = () => db.prepare("SELECT COUNT(*) AS n FROM invite_queue WHERE name_key = 'dale end' AND status = 'queued'").get().n;
  const daleQueuedBefore = daleQueued();
  const daleRelease = await unbind("Dale End");
  check("a release on an unbound name also cancels an invite its old link left queued", daleQueuedBefore === 1 && daleRelease.includes(`<@${VICTIM}>`) && daleQueued() === 0);
  // A request that lapses while the officer's release runs is reported as ended, and keeps its record.
  let endedNow = false;
  for (let k = 1; k <= 8 && !endedNow; k++) {
    const name = "Last " + "ABCDEFGH"[k - 1] + "ight";
    at(D + 124 * 3600 + k * 60);
    const lastCode = shownCode(await verify(SQUAT, name));
    at(D + 148 * 3600 + k * 60 - k);
    ticking = true;
    const text = await unbind(name);
    ticking = false;
    if (lastCode && text.includes("ended just now") && db.prepare("SELECT consumed_at FROM pending WHERE name_key = ?1").get(name.toLowerCase()).consumed_at === null) endedNow = true;
  }
  check("a request that lapses while an officer releases it is reported as ended, not as closed", endedNow);
  // .217: recovery copy distinguishes an available ticket from the unchanged by-name UTC cooldown.
  const recoveryMode217=env.REQUEST_CODES,recoveryUser217='888888888888888811',recoveryName217='Recovery Linden';
  at(D+192*3600+3600);env.REQUEST_CODES='off';
  const recoveryCode217=shownCode(await verify(recoveryUser217,recoveryName217));
  const recoveryLink217=await (await postVerify(env,{character:recoveryName217,code:recoveryCode217,source:'whisper'})).json();
  check('.217 recovery fixture genuinely verifies its original character',!!recoveryCode217&&recoveryLink217.result==='verified'&&linked('recovery linden')===recoveryUser217);
  const recoveryReply217=await unbind(recoveryName217),recoveryBlocked217=await verify(recoveryUser217,recoveryName217);
  check('.217 unbind guidance names request-code recovery and the by-name UTC wait',recoveryReply217.includes('Get my code')&&recoveryReply217.includes('request code')&&recoveryReply217.includes('by-name')&&recoveryReply217.includes('00:00 UTC')&&!recoveryReply217.includes('They can run `/verify` again.'));
  check('.217 tickets off preserves the actual same-day name cooldown',!shownCode(recoveryBlocked217)&&recoveryBlocked217.includes('00:00 UTC')&&!recoveryBlocked217.includes('Get my code'));
  env.REQUEST_CODES='on';const recoveryTicket217=await content(await handleInteraction(env,button(recoveryUser217)));
  check('.217 ready request codes provide the distinct recovery route',/Your code: `[A-Z2-9]{7}`/.test(recoveryTicket217));
  at(D+216*3600);check('.217 by-name verification opens at the next UTC day',!!shownCode(await verify(recoveryUser217,recoveryName217)));
  if(recoveryMode217===undefined)delete env.REQUEST_CODES;else env.REQUEST_CODES=recoveryMode217;
  globalThis.Date = RealDate;

  console.log("\n== the guide promises only what the config delivers (.51/.52, Codex 00:38 and the content candidate) ==");
  const { guideMessage } = load("./guide");
  const guideText = (e) => JSON.stringify(guideMessage(e, load("./ruleset-profile").currentRulesetProfile()));
  const off = guideText({ ...env, SET_NICKNAME: "false" });
  check("with the role configured and nicknames off, the guide names the role, the roster and the access checks, and no nickname", /Olympus Guild Member\*\* role opens the member channels once your verified character appears on the officer-exported guild roster and the access checks pass/.test(off) && !/nickname/i.test(off));
  check("  with nicknames on, the nickname is described as staff-enabled", /When enabled by guild staff, your Discord nickname updates/.test(guideText({ ...env, SET_NICKNAME: "true" })));
  check("  with no role, no role sentence and the plain title", !/Guild Member/.test(guideText({ ...env, ROLE_GUILD_MEMBER: "" })) && /"title":"Join Olympus"/.test(guideText({ ...env, ROLE_GUILD_MEMBER: "" })));
  check("  under review mode an officer reviews before the invite queues; under auto it queues", /officer reviews the confirmed request before your invite enters the queue/.test(guideText({ ...env, ADMISSION_MODE: "review" })) && /your invite enters the queue; an officer sends it/.test(off));
  check("  the website is called optional, Battle.net is not promised (.114: its sign-in is switched off), codes private, no DM, and no #help-desk anywhere", /The website is optional for this verification flow/.test(off) && !/Battle\.net/.test(off) && /never sends you a DM/.test(off) && !/help-desk/.test(off) && !/olympus-2-x/.test(off));
  check("  the overflow guilds are sent to the configured visitors channel", /<#555000000000000009>/.test(guideText({ ...env, CHANNEL_VISITOR_CHAT: "555000000000000009" })) && /the visitors channel/.test(off));

  console.log("\n== .216: officer releases retain the captured target generation ==");
  const heldError216 = error => error instanceof load("./privacy-serving-authority").PrivacySiteRequestHeld;
  const seedRelease216 = async (id, name, active = true) => {
    const t = Math.floor(Date.now() / 1000);
    if (active) await env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',1,?3,?3)").bind(id, "b".repeat(32), t).run();
    const shown = shownCode(await verify(id, name));
    const pending = db.prepare("SELECT * FROM pending WHERE discord_id=? AND name_key=? AND consumed_at IS NULL").get(id, name.toLowerCase());
    if (!shown || !pending) throw Error("synthetic release setup did not open the original request");
    return pending;
  };
  const audit216 = id => db.prepare("SELECT * FROM audit WHERE actor=? OR subject=? OR instr(COALESCE(details,''),?)>0").all(id, id, id);
  for (const [id, name, change] of [["888888888888888801", "Closure Alpha", "retired"], ["888888888888888802", "Closure Beta", "replacement"], ["888888888888888803", "Closure Gamma", "absence"]]) {
    const pending = await seedRelease216(id, name, change !== "absence");
    let fired = 0, response, error;
    afterNativeBatch216 = async plan => {
      if (!plan.some(statement => statement.statement.includes("consumed_source = 'release'") && statement.params[0] === pending.id)) return;
      afterNativeBatch216 = null; fired++;
      // Only completed Native transactions may interleave. This is a synthetic
      // target cleanup/replacement seam, not a claim to run a complete erasure flow.
      const t = Math.floor(Date.now() / 1000);
      const state = change === "retired"
        ? env.DB.prepare("UPDATE privacy_subjects SET state='retired',revision=revision+1,updated_at=?1,erased_at=?1,retain_until=?2 WHERE subject_id=?3").bind(t, t + 31622400, id)
        : change === "replacement"
          ? env.DB.prepare("UPDATE privacy_subjects SET generation=?1,revision=revision+1,updated_at=?2 WHERE subject_id=?3").bind("c".repeat(32), t, id)
          : env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',1,?3,?3)").bind(id, "c".repeat(32), t);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM audit WHERE actor=?1 OR subject=?1 OR instr(COALESCE(details,''),?1)>0").bind(id),
        ...["pending", "invite_queue", "characters", "members"].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE discord_id=?1`).bind(id)),
        state,
      ]);
    };
    try { response = await handleInteraction(env, officerCommand("unbind", [{ name: "character", type: 3, value: name }])); }
    catch (caught) { error = caught; }
    finally { afterNativeBatch216 = null; }
    const subject = db.prepare("SELECT state,generation FROM privacy_subjects WHERE subject_id=?").get(id);
    check(".216 " + change + " target seam runs after the original close committed", fired === 1 && !db.prepare("SELECT 1 FROM pending WHERE id=?").get(pending.id) && (change === "retired" ? subject.state === "retired" : subject.generation === "c".repeat(32)));
    check(".216 " + change + " target closure cannot recreate a raw audit reference", audit216(id).length === 0);
    check(".216 " + change + " target closure cannot report an ordinary release", heldError216(error) && response === undefined);
  }
  const activeId216 = "888888888888888804", active216 = await seedRelease216(activeId216, "Closure Delta");
  const activeReply216 = await unbind("Closure Delta");
  const activeAudit216 = db.prepare("SELECT details FROM audit WHERE action='admin.release' AND subject='Closure Delta'").all().map(row => JSON.parse(row.details));
  check(".216 unchanged active target still releases once with an attributable reference", activeReply216.includes(`<@${activeId216}>`) && db.prepare("SELECT consumed_source FROM pending WHERE id=?").get(active216.id).consumed_source === "release" && activeAudit216.length === 1 && JSON.stringify(activeAudit216[0]._privacySubjectIds) === JSON.stringify([activeId216]));
  const retiringId216 = "888888888888888805", retiring216 = await seedRelease216(retiringId216, "Closure Epsilon");
  await env.DB.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1 WHERE subject_id=?1").bind(retiringId216).run();
  let retiringError216; try { await unbind("Closure Epsilon"); } catch (error) { retiringError216 = error; }
  check(".216 an already retiring target is held before the request closes", heldError216(retiringError216) && db.prepare("SELECT consumed_at FROM pending WHERE id=?").get(retiring216.id).consumed_at === null && !db.prepare("SELECT 1 FROM audit WHERE action='admin.release' AND subject='Closure Epsilon'").get());
  const denied216 = await seedRelease216("888888888888888806", "Closure Zeta");
  const noOfficer216 = officerCommand("unbind", [{ name: "character", type: 3, value: "Closure Zeta" }]); noOfficer216.member.roles = [];
  check(".216 the target fence gives no release permission to a non-officer", await content(await handleInteraction(env, noOfficer216)) === "Officers only." && db.prepare("SELECT consumed_at FROM pending WHERE id=?").get(denied216.id).consumed_at === null);

  console.log(`\n${ok}/${n} passed`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
