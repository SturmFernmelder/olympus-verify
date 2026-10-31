// .154/.199: exact adopted R7 text plus the owner's substantial five-Title expansion,
// original request labels and structural/appointment boundaries.
// Actual module loading, chart interaction and Worker admission require their separate integration checks.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), assert = require("node:assert/strict");
const root = path.join(__dirname, ".."), dir = path.join(root, "public/static/governance");
const bytes = fs.readFileSync(path.join(dir, "reconciled-book.md"));
const text = bytes.toString("utf8"), data = JSON.parse(fs.readFileSync(path.join(dir, "organization.json"), "utf8"));
const app = fs.readFileSync(path.join(root, "public/static/app.js"), "utf8");
let n = 0, ok = 0;
function check(label, value) { n++; if (value) ok++; console.log((value ? "PASS " : "FAIL ") + label); }
const historicalScope218='Historical application and ballot compatibility only; current institutional display and reserved-seat admission are separate.';
// An exact six-field inverse for only the two reviewed institutional records;
// all other term properties still participate in the original95/96 digests.
function originalTerms218(terms) {
 const specs={office_26:{ordinal:26,label:'Council of Justice',applicationLabel:'Council of Justice',acquisition:'Case-designated judicial institution; chaired by the Lord High Chancellor, with accepted unconflicted members.'},office_94:{ordinal:94,label:'War Head',applicationLabel:'War Directorate (historical shared template)',acquisition:'Historical shared War Head reference; current PvE and PvP portfolios have their own separate appointments.'}};
 const keys=['label','applicationLabel','applicationAliases','applicationEligible','applicationRoleKeys','acquisition'];
 return terms.map(current=>{
  const term=JSON.parse(JSON.stringify(current)),spec=specs[term.officeKey];
  if(!spec){assert.ok(!Object.hasOwn(term,'historicalApplicationProfile')&&!Object.hasOwn(term,'applicationMetadataScope'),'unscoped historical field');return term;}
  const prior=term.historicalApplicationProfile;
  assert.ok(prior&&typeof prior==='object'&&!Array.isArray(prior),'historical profile object');
  assert.deepEqual(Object.keys(prior).sort(),[...keys].sort(),'exact six historical fields');
  assert.equal(term.ordinal,spec.ordinal);assert.equal(term.label,spec.label);assert.equal(term.applicationLabel,spec.applicationLabel);assert.equal(term.acquisition,spec.acquisition);
  assert.equal(term.applicationMetadataScope,historicalScope218);
  for(const key of keys)assert.ok(Object.hasOwn(term,key),'current historical field present');
  for(const key of ['applicationEligible','applicationAliases','applicationRoleKeys'])assert.deepEqual(term[key],prior[key],'original compatibility field');
  for(const key of keys)term[key]=prior[key];
  delete term.historicalApplicationProfile;delete term.applicationMetadataScope;return term;
 });
}
const requested = [
  "Academy Lead (Training Lead)", "Addon Developer", "Addon / Discord Architect", "Alt (Verified Alt)", "Alt / Social Member", "Ambassador", "Artisan", "Bank Auditor", "Bank Manager", "Bank Steward", "Bench", "Broadcaster", "Casual", "Chief of Intake (Gatekeeper, Intake Gatekeeper)", "Chief of Staff", "Chief Strategist (Head of Research)", "Class Head", "Class Lead", "Co-GM", "Coalition Lead (Foreign Affairs Lead)", "Community & Events Lead", "Community Officer (Social Officer)", "Content Creator", "Content Rep (Stream Rep)", "Core Raider", "Council of Justice", "Crafter", "Department Head", "Deputy", "Diplomat", "Diplomatic Envoy", "Discord Engineer", "Discord Moderator", "Emissary", "Emissary of Artisanry", "Emissary of Finance", "Emissary of Heraldry", "Emissary of War (War Emissary)", "Event Coordinator", "Event Officer", "Final Authority", "Founder", "Guild Master (GM)", "Guild Recruiter", "High Council", "Honorary / Emeritus", "Inactive", "Initiate", "Intelligence / Scouting Lead", "Lead Correspondent", "Loot Council", "Marshall", "Media & Communications Lead", "Media Lead", "Member (Roster Member)", "Mentor", "Minister", "Minister of Artisanry", "Minister of Heraldry", "Moderator", "Muted", "Officer", "Officer Alt", "Penal / Sentry Hold (Timeout)", "Per-Guild Correspondent", "Pledge", "Privy Council", "Probation", "Profession Coordinator", "PvP Captain", "PvP Lead (PvP Leader)", "Quartermaster", "Raid Assist", "Raid Leader (Raid Lead)", "Raider", "Recruit", "Recruiter", "Recruitment Lead", "Recruitment Officer", "Social", "Sovereign (The King)", "Tech / Tools Officer", "Technical Envoy", "The Court", "Tithe Payer (Treasury Tiers)", "Treasurer (Guild Bank)", "Trial (Trial Member, Trialist, Trial/Recruit)", "Trial Officer", "Trial Raider", "Veteran", "Veteran Officer", "Vice Guild Master", "VIP", "War Head", "Welfare / Community Support Lead"
];
const rankNames = ["Leader", "High Council", "Officer", "Officer Alt", "Raid Leader", "Veteran", "Raider", "Member", "Alt", "Initiate"];
const ids = new Map(data.nodes.map((node) => [node.id, node]));
const section = (start, end) => { const from = text.indexOf(start), to = text.indexOf(end, from + start.length); return from < 0 || to < 0 ? "" : text.slice(from, to); };
const currentReset = [section("# 1 Guild Charter of Olympus", "# 2 Royal Charter of Olympus"), section("## Article S13", "# Bylaws of Olympus"), section("## ORD 18", "## ORD 19")];
const currentPrivacy = [section("## Article S12   ", "## Article S12a"), section("## Article S12a", "## Article S13"), section("## ORD 15", "## ORD 16")];
const charter = fs.readFileSync(path.join(dir, "operational-charter.md"), "utf8");
const titles = fs.readFileSync(path.join(root, "../docs/master199-governance-titles.md"), "utf8");
const titleBuilder = require("../../scripts/build-governance-titles.cjs");
const titleHeading = "# Title I — The Sovereign & Royal Decrees\n", afterTitles = "# Daily Guild News\n";
const titleStart = text.indexOf(titleHeading), titleEnd = text.indexOf(afterTitles, titleStart);
const titleEdition = text.slice(titleStart, titleEnd), currentOutside = text.slice(0, titleStart) + text.slice(titleEnd), precedingEdition = titleBuilder.rankBridge(titleBuilder.factsBridge(titleBuilder.presentationBridge218(currentOutside, true), true), true);
const titleNames = ["Title I — The Sovereign & Royal Decrees", "Title II — The High Council, Co-Guild Master & Privy Court", "Title III — The Imperial Treasury, Guild Bank & Tithe Ledger", "Title IV — The Grand Alliance Concordat", "Title V — The Guild Workshop & Artisans' Charter and The Heralds' Accord"];
check("R7 retains original adoption and records the separately owner-authorized 18 October operative clarification", text.includes("Operative clarification · 18 October 2026") && text.includes("Adoption date: 13 October 2026") && text.includes("No named personal signature is represented by this publication."));
check("all three operative reset instructions preserve the current member/rank-only scope and appointments", currentReset.every((s) => s.length > 200 && s.includes("The beta reset removes only the fixed beta membership and native-rank Discord roles.") && s.includes("Manual leadership and Council roles, developer, bot and server-moderator roles, all website appointments and the leadership directory are preserved.") && !s.includes("clear the other website appointments") && !s.includes("removes all Olympus Discord guild roles")));
check("operative reset states the actual cutoff and separates source expiry from destructive activation", text.includes("22 October 2026 at 17:00 UTC / noon CDT") && text.includes("The cutoff alone does not arm or activate removal.") && text.includes("Old beta grants close at the fixed cutoff even while reset removal remains OFF."));
check(".204 current opening distinguishes three ordinary choices from retained payload categories and reserved seats", section("# Reading and Adopting This Book", "# 1 Guild Charter of Olympus").includes("Current ordinary choices are Member, Raider and Artisan") && text.includes("Leader, High Council and Officer Corps seats are reserved appointments") && text.includes("Six retained payload categories do not mean six open application tracks") && text.includes("Royal Writs and new Patron applications are paused while the separate Admin switch is OFF") && !text.includes("131 assignable keys and six application tracks"));
check(".204 current War remit is PvE progression while the optional PvP chart and unissued warrants remain identified", text.includes("The current War Head guide concerns organized PvE progression") && text.includes("War Head for PvP — retained chart portfolio") && text.includes("Maxran is the charted name, pending an actual appointment record") && charter.includes("PvP an optional activity remit") && charter.includes("Neither appointments nor warrants are changed") && !text.includes("The current public War portfolio is PvP"));
check(".204 book distinguishes the realmless model and later planned shutdown from historical news and the owner reset cutoff", titles.includes("Forever uses a realmless ruleset model") && titles.includes("not a traditional realm announcement") && !titles.includes("launch realm is **not announced**") && text.includes("20 October update planned the final beta shutdown for 23 October 2026 at 10:00 AM PDT (17:00 UTC)") && text.includes("this book does not claim an observed server closure") && text.includes("The following dated news paragraph retains the superseded schedule") && text.includes("Blizzard lists 21 October 2026 as the last full beta day") && text.includes("D18 Build .204 fact correction — 26 October 2026") && text.includes("The owner's 22 October reset-policy cutoff remains separate") && text.includes("https://us.forums.blizzard.com/en/wow/t/heads-up-wow-forever-stress-test-on-october-21/2387920"));
check(".204 thousand-character figure remains a configured planning boundary with no unverified Forever maximum or archive rewrite", titles.includes("configured planning ceiling remains 1,000 guild characters per branch") && titles.includes("not an independently confirmed Forever-specific maximum") && titles.includes("actual game limits must be checked separately") && !titles.includes("actual 1,000-character cap") && titles.includes("1,000/1,000 and 247 queued") && titles.includes("historical **October Beta 1,000/1,000 + 247 queued** remains an archive"));
check(".204 Patron charter text is a paused policy reference, not an available offer or provider activation", titles.includes("not an available offer while Royal Writs and new Patron applications are paused") && titles.includes("schedule switch before that request path is offered") && titles.includes("the switch grants no capacity, admission or provider permission") && titles.includes("Current ordinary applications remain Member, Raider and Artisan; leadership seats remain reserved appointments"));
check("all three operative privacy summaries describe automatic bounded Native erasure without all-copy completion", currentPrivacy.every((s) => s.length > 200 && s.includes("Live serving-account erasure is automatic in the Native operating mode.") && s.includes("Completion covers live serving-account cleanup, not every copy.") && !s.includes("manually assigned Asmongold staff roles are handled by a human") && !s.includes("Confirmed Guild Member removal is required before completion")));
check("current privacy distinguishes attributable guild-role cleanup, separate safety roles and uncertain effects", currentPrivacy[0].includes("known Olympus guild roles associated with that account, including recorded leadership and Council roles") && currentPrivacy[0].includes("server-wide moderator or blocking safety roles") && currentPrivacy[0].includes("Unknown effects remain unknown") && currentPrivacy[0].includes("A lost reply proves neither rollback nor completion."));
check("current marker summary uses original-decision expiry and bounded generation barriers without anonymous or blanket audit claims", currentPrivacy[1].includes("365 days from the original decision") && currentPrivacy[1].includes("366 days from erasure") && currentPrivacy[1].includes("not promised to be anonymous") && !currentPrivacy[1].includes("audit log is an expressly selected erasure exception") && !currentPrivacy[1].includes("hash of the Discord ID and character") && section("## ORD 15", "## ORD 16").includes("separate rejection marker, active safety cases and original unresolved-effect custody") && !section("## ORD 15", "## ORD 16").includes("banned-or-denied safety marker"));
check("standalone operational charter is embedded exactly and distinguishes reset preservation from personal erasure", text.includes(charter.trim()) && charter.includes("Reset preservation is distinct from an account owner's authenticated erasure request:") && charter.includes("Completion covers live serving-account cleanup, not every copy."));
check("superseded source decisions remain explicit history followed by the current owner clarification", text.includes("D11 Historical owner erasure decision — 7 October 2026; superseded for current operation by D13.") && text.includes("D12 Historical owner transition decision — 7 October 2026; superseded by D14.") && text.includes("D13 Current Native erasure clarification — 18 October 2026.") && text.includes("D14 Current beta-reset clarification — 18 October 2026."));
check("R7 plus owner199five-Title and finite rank reconciliation has exact source bytes and SHA256", bytes.length === 270762 && crypto.createHash("sha256").update(bytes).digest("hex") === "4270ce6ce70ad14fc4aa9345896cb1dd5e82d1805591723084f5931738c2cf81");
check("canonical Titles and finite218/204 plus original17 inverses restore every prior outside-R7 byte", titleStart > 0 && titleEnd > titleStart && titleEdition === titles.trimEnd() + "\n\n" && titleBuilder.presentationBridge218(titleBuilder.factsBridge(titleBuilder.rankBridge(precedingEdition))) === currentOutside && Buffer.byteLength(precedingEdition) === 173953 && crypto.createHash("sha256").update(precedingEdition).digest("hex") === "54b4a8f0676d9cc3fd846d62bbb931f080c31e22017ed716e687197b8ebe4ef5");
check("finite204 substitutions are idempotent and refuse missing or duplicated corrected paragraphs", (() => {
  const facts = JSON.parse(fs.readFileSync(path.join(root,"../docs/governance-facts204.json"),"utf8"));
  const corrected = "\n\n" + facts.changes[0].after + "\n\n";
  let missing = false, duplicate = false;
  try { titleBuilder.factsBridge(currentOutside.replace(corrected,"\n\nUnapproved replacement.\n\n"),true); } catch { missing = true; }
  try { titleBuilder.factsBridge(currentOutside + corrected,true); } catch { duplicate = true; }
  const oldOutside = titleBuilder.factsBridge(currentOutside,true);
  return facts.changes.length === 8 && titleBuilder.factsBridge(currentOutside) === currentOutside && titleBuilder.factsBridge(oldOutside,true) === oldOutside && titleBuilder.factsBridge(oldOutside) === currentOutside && missing && duplicate;
})());
check("the expansion has five complete numbered Titles and36Articles,72Sections and147subclauses", JSON.stringify([...titles.matchAll(/^# (Title .+)$/gm)].map(m => m[1])) === JSON.stringify(titleNames) && (titles.match(/^## Article [IVX]+\.\d+ — /gm) || []).length === 36 && (titles.match(/^### Section [IVX]+\.\d+\.\d+ — /gm) || []).length === 72 && (titles.match(/^\([a-d]\) /gm) || []).length === 147 && Buffer.byteLength(titles) > 80000);
check("each Article has two uniquely numbered substantial Sections with distinct(a)/(b)subclauses", [...titles.matchAll(/^## Article ([IVX]+\.\d+) — [^\n]+\n([\s\S]*?)(?=^## Article |^# Title |$(?![\s\S]))/gm)].every(m => {
  const parts = [...m[2].matchAll(/^### Section ([IVX]+\.\d+\.\d+) — [^\n]+\n([\s\S]*?)(?=^### Section |$(?![\s\S]))/gm)];
  return parts.length === 2 && parts.every((part, i) => part[1] === m[1] + "." + (i + 1) && part[2].length > 500 && /^\(a\) /m.test(part[2]) && /^\(b\) /m.test(part[2]));
}));
check("all requested module divisions have honest ecosystem capability boundaries", ["King.lua", "Decree.lua", "Keys.lua", "Court.lua", "Acts.lua", "Moderation.lua", "Treasury.lua", "Dues.lua", "Bank.lua", "Crafters.lua", "Workshop.lua", "Vox.lua", "Hop.lua"].every(s => titles.includes("`" + s + "`")) && titles.includes("not a declaration that every named module") && titles.includes("publisher-adoption dependencies") && titles.includes("No statement in this Title certifies adoption in the official CurseForge addon"));
check("royal emergency powers preserve expiry, independent renewal and fair-process limits", titles.includes("twenty-four-hour expiry") && titles.includes("new expiry no more than twenty-four hours later") && titles.includes("initiating officer cannot self-renew") && titles.includes("forty-eight-hour limit") && titles.includes("an unexplained indefinite hold is forbidden"));
check("Court code has evidentiary standards and concrete complaint,response,appeal and minutes deadlines", ["balance of probabilities", "clear, cogent and corroborated evidence", "within three working days", "at least seven calendar days to respond", "within fourteen calendar days of receiving the written decision", "acknowledges within seven days", "minutes", "Sentry Hold"].every(s => titles.includes(s)) && titles.includes("A decision cannot rest solely on undisclosed material") && titles.includes("No automatic increase in sanction follows an appeal"));
check("Treasury code preserves exact optional seasonal tiers and zero-privilege,OFF and retention limits", ["Tithe Payer — 25 gold", "Patron of the Treasury — 100 gold", "Benefactor of Olympus — 500 gold", "ninety-day season", "Recognition is cosmetic colour only", "TREASURY_COSMETIC_*", "one gold weekly", "fourteen-day new-member exemption", "ninety-day ledger retention", "Combine related transfers over seven days"].every(s => titles.includes(s)) && titles.includes("no role or grant") && titles.includes("An award expires at that season's end"));
check("Grand Alliance code separates thousand-seat overflow,Main/VerifiedAlt and historicalBeta from real capacity", ["1,000 guild characters per branch", "Olympus I, II, III, IV, V, VI, VII, VIII, IX and X", "1,000/1,000 and 247 queued", "unknown or unavailable rather than zero", "receiving branch's agreement", "A second character supplies no second Council vote", "aggregate counts only"].every(s => titles.includes(s)) && titles.includes("No bot is authorized by this Title to move a character or execute a protected invite automatically"));
check("Workshop and Heralds code supplies voluntary offers,commission evidence,recipe provenance and Shield/layer limits", ["opt-in directory", "self-declared information", "accepted commission", "Title III's appropriation", "rare Forever recipe", "Stream Shield is a local presentation preference", "does not change server authorization", "unreadable screen as reviewed", "Hop.lua", "automate protected invites", "Forever uses a realmless ruleset model"].every(s => titles.includes(s)) && titles.includes("OFF or unavailable") && titles.includes("The actual publication audience is stated"));
check("expansion metadata records owner218supplement to retained199direction without retroactive ratification or permissions", data.statutoryExpansion?.recordedAt === "2026-10-30" && data.statutoryExpansion.source === "docs/master199-governance-titles.md" && data.statutoryExpansion.supersedes === "docs/master198-governance-titles.md" && data.statutoryExpansion.titles === 5 && data.statutoryExpansion.articles === 36 && data.statutoryExpansion.sections === 72 && data.statutoryExpansion.subclauses === 147 && data.statutoryExpansion.constitutionalVoteRecorded === false && data.statutoryExpansion.namedSignaturesClaimed === false && data.statutoryExpansion.permissionsApplied === false && titles.includes("R7's original adoption remains 13 October 2026"));
check("one canonical Officer Operational Guide is linked from reversible constitutional principles without deleting original safeguards", (() => {
  const inverse = titleBuilder.presentationBridge218(text, true);
  let missing = false, duplicated = false;
  try { titleBuilder.presentationBridge218(text.replace("## RC9 Officer mandate and safeguards", "## RC9 Missing mandate")); } catch { missing = true; }
  const paragraph = text.slice(text.indexOf("## RC9 Officer mandate and safeguards"), text.indexOf("Before acting, identify the actual authority"));
  try { titleBuilder.presentationBridge218(text + "\n\n" + paragraph); } catch { duplicated = true; }
  return inverse.includes("## RC9 Officer Operational Guide") && titleBuilder.presentationBridge218(inverse) === text && text.includes("[Officer Operational Guide](#/guide/officer)") && app.includes("The canonical Officer Operational Guide:") && !text.includes("## RC9 Officer Operational Guide") && missing && duplicated;
})());
check("deterministic five-Title projection rejects malformed,oversize and unapproved outside-paragraph edits", (() => {
  const projection=titleBuilder.projection,same=projection(text,titles),capBytes218=524288;
  const originalOversized218=titles+"x".repeat(262144);
  const exactOverCapTitles218=titles.trimEnd()+"\n"+"x".repeat(capBytes218-same.bytes);
  const predictedProjectionBytes218=same.bytes+Buffer.byteLength(exactOverCapTitles218.trimEnd(),"utf8")-Buffer.byteLength(titles.trimEnd(),"utf8");
  let malformed=false,oversize=false,exactOverCap=false,outside=false;
  try { projection(text,titles.replace("## Article I.1 —","## Lost Article —")); } catch { malformed=true; }
  try { projection(text,originalOversized218); } catch(error) { oversize=error.message==="Governance reader size or chapter bound"; }
  try { projection(text,exactOverCapTitles218); } catch(error) { exactOverCap=error.message==="Governance reader size or chapter bound"; }
  try { projection(text.replace("The book joins","The book secretly revises"),titles); } catch(error) { outside=error.message==="Governance outside-Titles baseline differs beyond finite owner rank bridge"; }
  return same.text===text&&same.bytes===bytes.length&&same.sha256===data.book.sha256&&(same.text.match(/^# /gm)||[]).length===20&&capBytes218===524288&&predictedProjectionBytes218===524289&&malformed&&oversize&&exactOverCap&&outside;
})());
check("model and reader bind the exact current R7 source", data.revision === "R7" && data.book.bytes === bytes.length && data.book.sha256 === crypto.createHash("sha256").update(bytes).digest("hex") && data.book.path === "/static/governance/reconciled-book.md" && app.includes('const GOVERNANCE_SHA256 = "' + data.book.sha256 + '";') && app.includes('bytes.length !== ' + bytes.length) && app.includes('data.book.bytes !== ' + bytes.length));
check("operative Council,Treasury,OfficerAlt and ArticleS3 agree with the exact ten-rank owner199ladder", text.includes("High Council is Rank 2 / Slot 1; Officer Rank 3 / Slot 2; Officer Alt Rank 4 / Slot 3") && text.includes("| 3 | Officer | Zero-based Slot 2;") && text.includes("| 4 | Officer Alt | Zero-based Slot 3;") && text.includes("Co-Guild Master and Treasurer are appointments within the Leader / High Council tier, not additional native ranks") && !text.includes("current Treasurer native rank at Slot 3") && !text.includes("Officer Alt is a historical extended label") && !text.includes("Officer Alt remains a historical extended label") && !text.includes("places Treasurer in Slot 3") && !text.includes("Treasurer occupies Slot 3") && text.includes("D16 Historical owner master directive") && text.includes("D17 Current owner Build .199 directive") && titles.includes("#/roles/rosetta-stone"));
check("owner199GoldCovenant,Stockades and all service schedules are integrated into substantive TitlesII–V", ["## Article II.7 —", "## Article III.6 —", "## Article III.7 —", "## Article III.8 —", "## Article IV.6 —", "## Article V.7 —", "## Article V.8 —", "100% World of Warcraft: Forever in-game gold only", "zero real-world money: no USD, Twitch subscriptions or crypto", "All addons remain free, with zero paid addon gating", "100g", "250g–500g", "500g–1,000g", "100g per 30 days", "250g–1,000g per season", "50g Apply", "50g Commute", "100g Royal Reversal", "50g–150g per season", "150g", "50g", "25g–100g", "25g filing fee + 10% Treasury rake"].every(term => titles.includes(term)));
check("Stockades code preserves free appeal,nonbailable safety cases and attended unban/keyed-marker separation", titles.includes("Ordinary appeals remain available without a fee") && titles.includes("permanently ineligible for gold bail") && titles.includes("Publication does not prove that the Beta server was repurposed") && titles.includes("Case ID belongs in the in-game mail subject") && titles.includes("Clearing a keyed login-rejection marker is another specifically authorized operator correction") && titles.includes("unavailable procedure requires escalation, not raw database deletion") && titles.includes("lost unban reply remains uncertain"));
check("gold reference grants no authority or provider effects and targetedcosmetics need priorconsent/free withdrawal", titles.includes("TREASURY_COSMETIC_ENABLED remains OFF") && titles.includes("ARMY_SITE_AGGREGATE_ENABLED remains OFF") && titles.includes("Olympus Link remains OFF") && titles.includes("A specific recipient must opt in beforehand") && titles.includes("Withdrawal, harassment response and correction of an erroneous role are always free") && titles.includes("gold receipt cannot hide that cost in the census") && titles.includes("payer cannot buy another person's testimony"));
check("authorized R7 adoption is recorded without issuing appointments, signatures or permissions", data.draft === false && data.ratified === true && data.appointmentsIssued === false && data.adoption.date === "2026-10-13" && data.adoption.authority === "authorized guild administration" && data.adoption.basis === "explicit owner authorization to adopt the guild rules" && data.adoption.namedSignaturesClaimed === false && data.adoption.individualAppointmentsIssued === false && data.adoption.nativePermissionsApplied === false && text.includes("Version: R7  Adoption date: 13 October 2026  Effective date: 13 October 2026") && text.includes("No named personal signature is represented by this publication."));
const composition = data.councilComposition, previousComposition = composition.previousSeatMap;
const historicalDirection = fs.readFileSync(path.join(dir, "council-composition-2026-10-19.md"), "utf8");
const direction = fs.readFileSync(path.join(dir, "council-composition-2026-10-28.md"), "utf8");
const cabinetDirection = fs.readFileSync(path.join(dir, "council-composition-master218.md"), "utf8");
const historicalCouncilSeats = [
  ["gm-chair", "Guild Master — Council Chair", "leader", "founder", "office_43"],
  ["co-gm", "Co-Guild Master", "co_gm", "executive", "office_19"],
  ["treasurer", "Treasurer", "treasurer", "treasury", "office_86"],
  ["head-trading", "Head of Trading & Markets", "head_trading", "trading", "office_96"],
  ["main-raid-lead", "MAIN Raid Lead", "war_head", "war-raiding", "office_94"],
  ["main-pvp-lead", "MAIN PvP Lead", "war_head", "war-pvp", "office_94"],
  ["head-justice", "Head of Justice", "justice", "justice", "office_26"],
  ["artisanry", "Minister of Artisanry", "minister_artisanry", "artisanry", "office_58"],
  ["heraldry", "Minister of Heraldry", "minister_heraldry", "heraldry", "office_59"],
  ["intake", "Chief of Intake", "chief_intake", "intake", "office_14"],
  ["systems", "Systems / Addon Architect", "architect", "systems", "office_03"]
];
const currentCouncilSeats = [
  ["gm-chair", "Guild Master — Council Chair", "leader", "founder", "office_43"],
  ["co-gm", "Co-Guild Master / Hand of the Sovereign", "co_gm", "executive", "office_19"],
  ["treasurer", "Lord High Treasurer / Imperial Exchequer", "treasurer", "treasury", "office_86"],
  ["head-justice", "Lord High Chancellor / Head of Justice", "head_justice", "justice", "office_101"],
  ["main-raid-lead", "Grand Marshal of PvE", "main_raid", "war-raiding", "office_97"],
  ["main-pvp-lead", "Grand Marshal of PvP", "main_pvp", "war-pvp", "office_98"],
  ["internal-security", "High Inquisitor / Minister of Internal Security", "internal_security", "security", "office_99"],
  ["intake", "High Minister of the Chancery & Imperial Census", "chief_intake", "intake", "office_14"],
  ["concordat", "Grand Concordat Director", "concordat_director", "concordat", "office_100"],
  ["artisanry", "Grand Master Artisan", "minister_artisanry", "artisanry", "office_58"],
  ["systems", "High Architect of Systems", "architect", "systems", "office_03"],
  ["heraldry", "Lord High Herald / Minister of Heraldry", "minister_heraldry", "heraldry", "office_59"],
  ["head-trading", "Head of Trading & Markets", "head_trading", "trading", "office_96"]
];
check("current twelve-portfolio supplement records owner218authority separately from R7 adoption", composition.status === "owner_clarified_master218" && composition.recordedAt === "2026-10-30" && composition.authority === "project owner clarification" && composition.sourcePath === "/static/governance/council-composition-master218.md" && composition.cabinetSeatCount === 12 && cabinetDirection.includes("Twelve reserved portfolios and the Guild Master as chair") && cabinetDirection.includes("neither a newly ratified constitution nor issued appointments") && composition.formalStatus.includes("R7 adoption remains 13 October 2026"));
check("original eleven-remit map remains dated history rather than silently repinned current authority", previousComposition.status === "owner_clarified_20261028" && previousComposition.recordedAt === "2026-10-28" && previousComposition.sourcePath === "/static/governance/council-composition-2026-10-28.md" && JSON.stringify(previousComposition.offices) === JSON.stringify(historicalCouncilSeats.map(row => row[1])) && previousComposition.currentSeats.length === 11 && previousComposition.currentSeats.every((row, i) => JSON.stringify([row.id,row.label,row.familyKey,row.nodeId,...row.officeKeys]) === JSON.stringify(historicalCouncilSeats[i])) && direction.includes("not an adopted R8 charter") && direction.includes("R7 adoption remains 13 October 2026") && direction.includes("style and layout reference") && direction.includes("does not define the current Council roster"));
check("current Council identifies thirteen exact rows with twelve distinct portfolio keys and one chair", JSON.stringify(composition.offices) === JSON.stringify(currentCouncilSeats.map(row => row[1])) && Array.isArray(composition.currentSeats) && composition.currentSeats.length === 13 && new Set(composition.currentSeats.map(row => row.id)).size === 13 && new Set(composition.currentSeats.flatMap(row => row.officeKeys)).size === 13 && composition.currentSeats.every((row, i) => JSON.stringify([row.id,row.label,row.familyKey,row.nodeId,...row.officeKeys]) === JSON.stringify(currentCouncilSeats[i]) && row.scope === "alliance" && row.description.length > 40 && ids.has(row.nodeId) && row.officeKeys.every(key => data.terms.some(term => term.officeKey === key && term.tier === (row.id === "gm-chair" ? "leader" : "high_council")))));
check("composition record cannot fabricate constitutional ratification, eligible votes or permissions", composition.recommendationRecorded === false && composition.founderRatificationRecorded === false && composition.eligibleSeatIssued === false && composition.permissionsApplied === false && composition.persistentAppointmentKeysAdded === true && data.appointments.length === 137 && new Set(data.appointments.map(row => row.key)).size === 137 && data.appointments.filter(row => row.key === "office_96").length === 1 && data.appointments.find(row => row.key === "office_96").applicationEligible === false && data.appointments.find(row => row.key === "office_96").mappingApplies === false && data.appointmentsIssued === false && historicalDirection.includes("two thirds of the total non-vacant High Council seats, followed by Founder ratification") && direction.includes("One person does not gain a second vote") && direction.includes("quorum, recusal, conflict review and one-person/one-vote"));
check("historical MAIN War remits retain their shared template without promoting regional leaders", (() => {
  const main = previousComposition.currentSeats.filter(row => row.familyKey === "war_head");
  return main.length === 2 && JSON.stringify(main.map(row => row.nodeId)) === JSON.stringify(["war-raiding","war-pvp"]) && main.every(row => row.sharedAppointmentTemplate === true && JSON.stringify(row.officeKeys) === JSON.stringify(["office_94"]) && row.description.includes("not two persistent appointment records")) && ["office_71","office_74","raid_leader_na","raid_leader_eu","pvp_leader"].every(key => { const row = data.appointments.find(office => office.key === key); return row && row.tier === "officer_corps" && row.nativeSlot === 4; }) && data.nativeRanks[4].name === "Raid Leader";
})());
check("current MAIN War portfolios and Justice have distinct records with no copied holder or rank", (() => {
  const expected = [["main-raid-lead","office_97"],["main-pvp-lead","office_98"],["head-justice","office_101"]];
  return expected.every(([id,key]) => { const seat = composition.currentSeats.find(row => row.id === id), row = data.appointments.find(row => row.key === key); return JSON.stringify(seat.officeKeys) === JSON.stringify([key]) && !seat.sharedAppointmentTemplate && row.tier === "high_council" && row.nativeSlot === 1 && row.applicationEligible === false && row.mappingApplies === false && !row.aliasOf; }) && cabinetDirection.includes("A prior shared War Head or Council of Justice record is not silently copied") && data.nativeRanks.length === 10;
})());
check("Head of Justice is an individual Council remit without automatic votes or case access for panels", composition.currentSeats.find(row => row.id === "head-justice").familyKey === "head_justice" && composition.currentSeats.find(row => row.id === "head-justice").description.includes("not a permanent seat on every case") && direction.includes("panel service does not grant blanket Council membership") && direction.includes("Individual hearing-panel members still need case designation and conflict review") && cabinetDirection.includes("Chancellor assigns unconflicted hearings"));
check("Justice and MAIN War keep their original keys and historical requests without reopening current institutional seats", (() => {
  const justice = data.terms.find(row => row.officeKey === "office_26"), war = data.terms.find(row => row.officeKey === "office_94");
  return justice.label === "Council of Justice" && justice.applicationLabel === "Council of Justice" && ["Head of Justice","Privy Council / Judiciary","Judicial Portfolio"].every(alias => justice.historicalApplicationProfile.applicationAliases.includes(alias)) && war.label === "War Head" && war.applicationLabel === "War Directorate (historical shared template)" && ["MAIN Raid & PvP Leads","PvE War Council Director"].every(alias => war.historicalApplicationProfile.applicationAliases.includes(alias)) && [justice,war].every(term => { const row = data.appointments.find(office => office.key === term.officeKey); return JSON.stringify(row.applicationAliases) === JSON.stringify(term.historicalApplicationProfile.applicationAliases) && JSON.stringify(row.applicationRoleKeys) === JSON.stringify([term.officeKey]) && row.applicationEligible === true && row.applicationMetadataScope === historicalScope218 && term.historicalApplicationProfile.applicationEligible === true && row.applicationLabel === term.applicationLabel && row.acquisition === term.acquisition && row.nativeSlot === 1 && row.tier === "high_council" && row.mappingApplies === false; });
})());
check("19 and23 October composition records remain exact dated history without implied Vice-GM appointments", crypto.createHash("sha256").update(historicalDirection).digest("hex") === "c1a6969821135c369d1aef7c232cef2e628950d8a6ddd82f627b8dad90bcb1d8" && composition.historicalSourcePath === "/static/governance/council-composition-2026-10-19.md" && composition.previousDirection.status === "owner_directed_20261023" && JSON.stringify(composition.previousDirection.offices) === JSON.stringify(["Guild Master", "Co-Guild Master", "Treasurer", "War Head for PvP", "War Head for Raiding", "Minister of Artisanry", "Minister of Heraldry"]) && composition.historicalDirection.recordedAt === "2026-10-19" && historicalDirection.includes("does not add the Vice Guild Master or Chief of Staff by implication") && direction.includes("not included in the current named-remit roster merely by implication"));
check("original core responsibilities stay historical while current master218direction names all portfolios", JSON.stringify(data.currentOwnerDirection.coreCouncilOffices) === JSON.stringify(["Guild Master","Co-Guild Master","Treasurer"]) && data.currentOwnerDirection.coreCouncilOfficesScope.includes("not an exhaustive Council roster") && data.currentOwnerDirection.councilClarificationRecordedAt === "2026-10-28" && data.currentOwnerDirection.councilCompositionSourcePath === previousComposition.sourcePath && data.currentOwnerDirection.master218.date === "2026-10-30" && data.currentOwnerDirection.master218.source === composition.sourcePath && data.currentOwnerDirection.master218.cabinetPortfolios === 12 && data.currentOwnerDirection.master218.permissionsApplied === false && data.roleRank199.officeCount === 101 && data.roleRank199.assignableKeyCount === 137 && composition.seatReferenceNote.includes("twelve distinct reserved Council portfolios") && !composition.seatReferenceNote.includes("not eleven native ranks") && direction.includes("131 to 132 assignable keys") && direction.includes("64 families / 134 source keys to 65 families / 135 source keys") && direction.includes("adopted R7 book keeps its historical 95-office register and exact bytes"));
check("cabinet overlay covers every stable office and retains Crown, custody and audit separation", data.cabinet218.schema === "olympus-cabinet218/v1" && data.cabinet218.seatCount === 12 && data.cabinet218.nativeRankCount === 10 && data.cabinet218.permissionsApplied === false && Object.keys(data.cabinet218.offices).length === 101 && data.terms.every(term => { const overlay = data.cabinet218.offices[term.officeKey], row = data.appointments.find(row => row.key === term.officeKey), seat = composition.currentSeats.find(seat => seat.id === overlay?.seatId); return !!seat && row.cabinetSeatId === overlay.seatId && row.ministry === overlay.ministry && row.councilSeat === seat.label && overlay.codexTitles.every(title => term.codexTitles.includes(title)); }) && ["office_41","office_42","office_43","office_81"].every(key => data.cabinet218.offices[key].seatId === "gm-chair") && data.cabinet218.offices.office_96.seatId === "head-trading" && data.cabinet218.offices.office_86.seatId === "treasurer" && data.cabinet218.offices.office_08.independentReview === true);
check("new statutory Articles name distinct cabinet records and prohibit activating unsafe service proposals", ["## Article II.8 —", "## Article III.9 —", "Separate individual records now distinguish the PvE Marshal, PvP Marshal, Inquisitor, Concordat Director and Chancellor", "GDKP is excluded from guild offers, charter licensing and every revenue forecast", "Lottery sales, collections, drawings and prize dispatch remain disabled", "Mak’gora and duel stakes remain disabled", "The officer forecast assigns this proposal zero revenue", "activates none of them"].every(term => titles.includes(term)));
check("entire book has all20 chapters including five new Titles,Royal Codex,20 ordinances and current operational/adoption/template anchors", (text.match(/^# /gm) || []).length === 20 && (text.match(/^## ORD \d\d /gm) || []).length === 20 && ["# Reading and Adopting This Book", "# 3 Letters Patent and Warrants", "# Operational Charter — The Work of Olympus", "# Adoption and Office Registers", "# Daily News Template", "# Source and Decision Register", ...titleNames.map(s => "# " + s)].every((s) => text.includes(s)));
check("the original95 terms remain exact and the96th trading term stays reserved Council slot1", (() => {
  const original = originalTerms218(data.terms.slice(0, 95)), trading = data.terms[95];
  return requested.length === 95 && data.terms.length === 101 && original.every((term, i) => term.label === requested[i] && term.historicalLabel === undefined && term.ordinal === i + 1)
    && crypto.createHash("sha256").update(JSON.stringify(original)).digest("hex") === "74fb4f44153a550b7b306789763e73932393e96124d781572c6d2db5c9b87d3b"
    && new Set(data.terms.map(term => term.label)).size === 101 && trading.officeKey === "office_96" && trading.ordinal === 96 && trading.label === "Head of Trading & Markets" && trading.nodeId === "trading"
    && trading.tier === "high_council" && trading.nativeSlot === 1 && trading.nativeRankOrdinal === 2 && trading.applicationEligible === false && trading.mappingApplies === false && JSON.stringify(trading.applicationRoleKeys) === "[]";
})());
check("all original96 complete term objects retain their pre218 identities through the finite two-record inverse", crypto.createHash("sha256").update(JSON.stringify(originalTerms218(data.terms.slice(0, 96)))).digest("hex") === "edf51ea2b8b757b359fa77b676e56644a641264df3bd06d7393390221e54a5de");
check("two-record historical inverse rejects extra fields, unscoped metadata, changed current labels and hidden original edits", (() => {
 const copy=()=>JSON.parse(JSON.stringify(data.terms.slice(0,96))), digest=terms=>crypto.createHash('sha256').update(JSON.stringify(originalTerms218(terms))).digest('hex');
 let extra=false,unscoped=false,label=false;
 const a=copy();a[25].historicalApplicationProfile.note='unapproved';try{originalTerms218(a);}catch(error){extra=/exact six historical fields/.test(error.message);}
 const b=copy();b[0].applicationMetadataScope=historicalScope218;try{originalTerms218(b);}catch(error){unscoped=/unscoped historical field/.test(error.message);}
 const c=copy();c[25].applicationLabel='Head of Justice';try{originalTerms218(c);}catch{label=true;}
 const d=copy();d[25].note+=' unapproved change';
 return extra&&unscoped&&label&&digest(d)!=='edf51ea2b8b757b359fa77b676e56644a641264df3bd06d7393390221e54a5de';
})());
check("all labels have an explicit classification, related structural node and limits", data.terms.every((term) => data.termGroups.some((group) => group.id === term.classification) && ids.has(term.nodeId) && term.note.length > 20 && ids.get(term.nodeId).limits.length > 20));
check("ten native rank slots remain separate and complete", JSON.stringify(data.nativeRanks.map((r) => r.name)) === JSON.stringify(rankNames) && data.nativeRanks.every((r, i) => r.order === i + 1) && data.terms.filter((t) => t.classification === "native").length === 10);
check("Veteran configuration includes Invite Member plus repairs without applying permissions", data.nativeRanks[5].meaning.includes("Invite Member and Guild Bank Repairs") && text.includes("Invite Member") && !data.nativeRanks[5].meaning.includes("Withdraw Gold") && data.adoption.nativePermissionsApplied === false);
// Invert only the declared intake parent delta; keep the original graph authority unchanged.
function originalNodes218(model) {
  const changes = model.cabinet218?.reportingChanges;
  if (!Array.isArray(changes) || changes.length !== 1 || JSON.stringify(changes.map(({nodeId,field,before,after}) => [nodeId,field,before,after])) !== '[["intake","parent","heraldry","council"]]' || typeof changes[0].reason !== "string" || changes[0].reason.length < 20 || model.nodes.length !== 41 || new Set(model.nodes.map(node => node.id)).size !== 41) return null;
  const prior = model.nodes.filter(node => !["trading","security","concordat"].includes(node.id)).map(node => ({...node}));
  for (const change of changes) {
    const nodes = prior.filter(node => node.id === change.nodeId);
    if (nodes.length !== 1 || nodes[0][change.field] !== change.after) return null;
    nodes[0][change.field] = change.before;
  }
  return prior;
}
function preservesOriginalNodes218(model) {
  const nodes = originalNodes218(model);
  return !!nodes && nodes.length === 38 && crypto.createHash("sha256").update(JSON.stringify(nodes)).digest("hex") === "62fd12faf62b8529a8679a80a1ee278e2422048502c01738ac2fe7286c677ddf";
}
check("41 groups and mandates preserve original38 through the sole declared intake inverse", (() => {
  const priorMandates = data.officeMandates.filter(office => !["trading","security","concordat"].includes(office.nodeId)), trading = ids.get("trading");
  return data.nodes.length === 41 && data.officeMandates.length === 41 && preservesOriginalNodes218(data) && priorMandates.length === 38
    && crypto.createHash("sha256").update(JSON.stringify(priorMandates)).digest("hex") === "ae968c007def93478c0bfac5e51169f9a3f4bd62d7abddaaa624210aa267ae2c"
    && new Set(data.officeMandates.map(office => office.title)).size === 41 && data.officeMandates.every(office => ids.has(office.nodeId) && typeof office.title === "string" && office.title.length >= 6 && [office.duty, office.output, office.boundary].every(value => typeof value === "string" && value.length > 10))
    && trading.parent === "council" && trading.relation === "accountability" && trading.kind === "dedicated High Council portfolio" && JSON.stringify(trading.coordinates) === '["treasury"]' && data.officeMandates.filter(office => office.nodeId === "trading").length === 1 && data.officeMandates.find(office => office.nodeId === "trading").title === "Head of Trading & Markets";
})());
check("historical graph inverse rejects undeclared changes, missing/extra declarations and wrong current parent", (() => {
  const clone = () => JSON.parse(JSON.stringify(data)), unlisted = clone(), missing = clone(), extra = clone(), wrongCurrent = clone(), extraNode = clone();
  unlisted.nodes.find(node => node.id === "tactical").parent = "council";
  missing.cabinet218.reportingChanges = [];
  extra.cabinet218.reportingChanges.push({...extra.cabinet218.reportingChanges[0]});
  wrongCurrent.nodes.find(node => node.id === "intake").parent = "heraldry";
  extraNode.nodes.push({...extraNode.nodes[0],id:"unapproved"});
  return preservesOriginalNodes218(data) && [unlisted,missing,extra,wrongCurrent,extraNode].every(model => !preservesOriginalNodes218(model));
})());
check("five new Council records and two new ministries are finite additions without new rank or permission", JSON.stringify(data.terms.slice(96).map(term => [term.ordinal,term.officeKey])) === JSON.stringify([[97,"office_97"],[98,"office_98"],[99,"office_99"],[100,"office_100"],[101,"office_101"]]) && data.terms.slice(96).every(term => term.tier === "high_council" && term.nativeSlot === 1 && term.nativeRankOrdinal === 2 && term.applicationEligible === false && term.mappingApplies === false && term.applicationRoleKeys.length === 0) && ["security","concordat"].every(id => ids.get(id).parent === "council" && ids.get(id).relation === "accountability" && data.officeMandates.filter(office => office.nodeId === id).length === 1) && data.termGroups.length === 11);
check("Council portfolio mandates and all nine class heads remain explicit offices", ["War Head for PvP", "War Head for Raiding", "Federal Treasurer", "Minister of Artisanry", "Minister of Heraldry", "Council of Justice", "Independent Bank Auditor", ...["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Mage", "Warlock", "Shaman", "Druid"].map((name) => name + " Class Head")].every((title) => data.officeMandates.filter((office) => office.title === title).length === 1));
check("Founder->Council and local GM->Officers are accountability links", ids.get("council").parent === "founder" && ids.get("council").relation === "accountability" && ids.get("guilds").parent === "council" && ids.get("officers").parent === "guilds");
check("four portfolios and shared Systems keep distinct Council architect and Officer engineering remits", ["war", "treasury", "artisanry", "heraldry"].every((id) => ids.get(id).parent === "council" && ids.get(id).kind === "core portfolio") && data.nodes.filter((node) => node.kind === "core portfolio").length === 4 && ids.get("systems").kind === "shared support division" && ids.get("systems").parent === "council" && ids.get("systems").limits.includes("architect portfolio is classified with High Council") && ids.get("systems").limits.includes("engineering support is Officer Corps") && ids.get("systems").limits.includes("Neither classification appoints a holder or grants signing, platform or bank access"));
check("Justice and auditor retain independent conflict-exclusion boundaries", ids.get("justice").relation === "independence" && ids.get("auditor").relation === "independence" && ids.get("auditor").limits.includes("Cannot audit their own custody"));
const emissaries = data.nodes.filter((node) => node.parent === "emissaries");
check("five local emissaries coordinate to the exact portfolios without command lines", emissaries.length === 5 && emissaries.every((node) => node.relation === "coordination") && JSON.stringify(emissaries.flatMap((node) => node.coordinates)) === JSON.stringify(["war-pvp", "war-raiding", "treasury", "artisanry", "heraldry"]));
check("local tactical, custody and support remits remain below delegated local officers", ["tactical", "custody", "local-intake", "local-events", "class-support", "welfare"].every((id) => ids.get(id).parent === "officers"));
check("courtesy/review vocabulary does not create native powers", ["Privy Council", "The Court", "Sovereign (The King)"].every((label) => data.terms.find((t) => t.label === label).note.includes("creates no further governing body")) && data.terms.find((t) => t.label === "Muted").note.includes("applies no sanction") && ids.get("honorary").limits.includes("No automatic"));
check("I-X placeholders are exact and expressly unappointed", JSON.stringify(data.guildPlaceholders.map((g) => g.name)) === JSON.stringify(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"].map((s) => "Olympus " + s)) && data.guildPlaceholders.every((g) => g.state === "Unappointed placeholder"));
const serialized = JSON.stringify(data);
check("generic organization has no actual-name directory payload or unissued holders", !/richwcampbell|Fernmelder|Maxran|Akafoxslayer|discord_id|discordId|163042307090808833|602457634276376589/.test(serialized) && data.directoryRoute === "#/community/leadership");
check("owner-public PVE direction is explicit without private local artifacts", text.includes("PVE - Alliance") && data.currentOwnerDirection.publicRuleset === "PVE - Alliance" && !/name.reservation|C:\\Users\\|\.dev\.vars|AppData|OlympusRecovery/.test(text + serialized));
check("hierarchy has unique ids, valid references and no cycles", data.nodes.every((node) => {
  const visited = new Set(); let cursor = node;
  while (cursor) { if (visited.has(cursor.id)) return false; visited.add(cursor.id); if (cursor.parent !== null && !ids.has(cursor.parent)) return false; cursor = ids.get(cursor.parent); }
  return node.coordinates.every((id) => ids.has(id));
}) && ids.size === data.nodes.length);
check("current supplement preserves the exact original199statutory record separately",
 JSON.stringify(data.statutoryExpansion.previous) === JSON.stringify({
  source:"docs/master199-governance-titles.md",supersedes:"docs/master198-governance-titles.md",
  recordedAt:"2026-10-25",authority:"explicit owner Build .199 direction",
  titles:5,articles:34,sections:68,subclauses:138,
  constitutionalVoteRecorded:false,namedSignaturesClaimed:false,permissionsApplied:false
 }));
check("current and historical judicial panels have no blanket authority",
 composition.currentSeats.find(row=>row.id==="head-justice").description.includes("Panel service gives no blanket Council vote, case access or enforcement power")
 && previousComposition.currentSeats.find(row=>row.id==="head-justice").description.includes("no blanket Council vote, case access or enforcement power")
 && cabinetDirection.includes("each participant still needs case designation, relevant access and conflict review")
 && titles.includes("Panel service gives no blanket Council vote, case access or enforcement power"));
check("current portfolio count explicitly adds no native ranks",
 composition.summary.includes("does not add native ranks") && data.nativeRanks.length===10
 && data.cabinet218.nativeRankCount===10 && composition.cabinetSeatCount===12);
check("each exact current presentation remains reversible and rejects missing or duplicate paragraphs",(()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,"../docs/governance-presentation218.json"),"utf8"));
 if(JSON.stringify(manifest.changes.map(row=>row.key))!=='["rc9-officer-principles","master218-intake-current-reporting","master218-ord02-current-reporting"]')return false;
 const inverse=titleBuilder.presentationBridge218(text,true);
 if(titleBuilder.presentationBridge218(inverse)!==text)return false;
 return manifest.changes.every(change=>{
  if(text.split(change.after).length!==2 || inverse.split(change.before).length!==2)return false;
  let missing=false,duplicate=false;
  try{titleBuilder.presentationBridge218(text.replace(change.after,"unapproved missing presentation"));}catch{missing=true;}
  try{titleBuilder.presentationBridge218(text+"\n\n"+change.after+"\n\n");}catch{duplicate=true;}
  return missing&&duplicate;
 });
})());
check("current reporting and policy copy state the exact limits",
 titles.includes("twelve current portfolios enumerated in Article II.8")
 && titles.includes("The twelve portfolios of the High Council")
 && !titles.includes("The twelve portfolios of the Imperial Council")
 && titles.includes("Chancery reports directly to the High Council")
 && titles.includes("ORD 02's earlier reporting line under Heraldry is superseded")
 && titles.includes("Both service proposals remain subject to Blizzard policy")
 && titles.includes("no price buys loot priority, a governing office or a favourable judgment")
 && titles.split("While suspended, the whole historical reference, including its 25g civil filing, is shown as not active.").length===3);

// Download contract preserves historical R6 bytes and checks the current reader's exact h/add quicklink slice.
for (const result of require("./governance_download_contract.cjs").runChecks(root)) check(result.name, result.passed);
for (const result of require("./royal_writs199_contract.cjs").runChecks(root)) check(result.name, result.passed);
console.log(`\n${ok}/${n} passed`);
process.exit(ok === n ? 0 : 1);
