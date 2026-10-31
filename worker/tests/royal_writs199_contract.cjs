// Owner .199: execute both real catalogue projections without providing network, storage or a provider.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
function runChecks(workerRoot = path.join(__dirname, "..")) {
  const checks = [], check = (name, passed) => checks.push({ name, passed: !!passed });
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(workerRoot, "src/royal-writs199.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const canonical = { exports: {} }; vm.runInNewContext(compiled, canonical, { timeout: 1000 });
  const browser = {}; vm.runInNewContext(fs.readFileSync(path.join(workerRoot, "public/static/royal-writs199.js"), "utf8"), browser, { timeout: 1000 });
  const data = canonical.exports, projected = browser.OlympusRoyalWrits199;
  const names = ["ROYAL_WRIT_POLICY", "ROYAL_WRIT_CATEGORIES", "ROYAL_WRITS", "STOCKADES_CHECKLIST"];
  check(".218 browser and typed meta reference contain identical policy,27writs,categories and checklist", names.every(name => JSON.stringify(data[name]) === JSON.stringify(projected[name])) && data.ROYAL_WRITS.length === 27);
  const frozen = value => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(frozen);
  check(".199 shared catalogue projections and every nested record are immutable", names.every(name => frozen(data[name]) && frozen(projected[name])));
  const expectedPrices = { tithe_payer: [25,25], treasury_patron: [100,100], olympus_benefactor: [500,500], arch_financier: [1000,1000], imperial_treasury_hand: [2500,2500], royal_clemency: [100,100], privy_court_high_bail: [250,500], writ_translation: [250,500], flagship_direct_induction: [500,1000], dual_citizenship: [500,1000], royal_leave: [100,100], ceremonial_warrant: [250,1000], court_jester_apply: [50,50], court_jester_commute: [50,50], court_jester_reversal: [100,100], featured_artisan: [50,150], expedited_assize: [150,150], letter_marque: [50,50], mercantile_proclamation: [25,100], civil_suit_makgora: [25,25] };
  const rows = data.ROYAL_WRITS, byKey = key => rows.find(row => row.key === key);
  const originalRows = rows.filter(row => Object.hasOwn(expectedPrices, row.key));
  check(".199 all20 original owner fees and ranges remain exact integer gold with no omitted or duplicate key", originalRows.length === 20 && new Set(rows.map(row => row.key)).size === 27 && originalRows.every(row => JSON.stringify([row.goldMin, row.goldMax]) === JSON.stringify(expectedPrices[row.key])) && Object.keys(expectedPrices).every(key => byKey(key)));
  const proposalPrices = { imperial_lottery: [10,10], bifrost_writ: [25,75], attunement_charter: [0,0], pvp_escrow_proposal: [25,250], trade_factor_warrant: [150,500], trial_memorial_writ: [50,500], raid_bench_writ: [50,500] };
  const proposals = rows.filter(row => !Object.hasOwn(expectedPrices, row.key));
  check(".218 exactly seven known proposals have bounded integer gold terms and no unlisted catalogue key", proposals.length === 7 && proposals.every(row => Object.hasOwn(proposalPrices, row.key) && JSON.stringify([row.goldMin, row.goldMax]) === JSON.stringify(proposalPrices[row.key]) && Number.isInteger(row.goldMin) && Number.isInteger(row.goldMax)) && Object.keys(proposalPrices).every(key => byKey(key)));
  check(".218 every new proposal stays explicitly disabled with zero forecast revenue and no activation", proposals.every(row => row.activation === "unqualified-proposal" && row.enabled === false && row.forecastGold === 0) && proposals.reduce((sum, row) => sum + row.forecastGold, 0) === 0);
  check(".218 every duel or Mak'gora reference stays disabled even when the schedule is displayed", rows.filter(row => /Mak.?gora|duel/i.test([row.label,row.term,row.outcome].join(' '))).every(row => row.activation === "unqualified-proposal" && row.enabled === false && row.forecastGold === 0) && byKey("civil_suit_makgora").limits.includes("a civil filing does not activate duel stakes or a Treasury rake"));
  check(".218 owner-retained bench proposal promises no raid seat or override of the current rotation", byKey("raid_bench_writ").activation === "unqualified-proposal" && byKey("raid_bench_writ").limits.includes("No guaranteed raid seat") && byKey("raid_bench_writ").limits.includes("currently published rotation") && byKey("raid_bench_writ").enabled === false);
  check(".218 policy and every new service proposal explicitly remain subject to Blizzard policy", data.ROYAL_WRIT_POLICY.banner.includes("subject to Blizzard policy") && proposals.every(row => /subject to blizzard policy/i.test(row.limits)));
  check(".199 schedule terms preserve90day tiers,30day leave,24hour apply,48hour reversal and10percent escrow", rows.filter(row => row.category === "seasonal").length === 5 && rows.filter(row => row.category === "seasonal").every(row => row.term === "90-day season") && byKey("royal_leave").term === "30 days" && byKey("court_jester_apply").term === "24 hours" && byKey("court_jester_reversal").term === "48 hours on the original sender" && byKey("civil_suit_makgora").term.includes("25g filing + 10% Treasury rake"));
  check(".199 every writ supplies a usable page/codex cross-reference and explicit outcome limits", rows.every(row => data.ROYAL_WRIT_CATEGORIES.some(category => category.key === row.category) && row.label.length > 8 && row.outcome.length > 8 && row.limits.length > 45 && row.titles.length > 0 && row.titles.every(title => ["I", "II", "III", "IV", "V"].includes(title)) && row.pages.includes("roles") && row.pages.includes("governance") && row.pages.includes("admin")));
  const policy = data.ROYAL_WRIT_POLICY, all = JSON.stringify(data);
  check(".218 policy excludes GDKP and keeps lottery/duel wagers unqualified despite display settings", policy.revision === "218" && policy.compliance.includes("GDKP is excluded") && policy.compliance.includes("Lottery and duel wagers remain disabled pending wagering authorization") && policy.compliance.includes("A display switch cannot approve a prohibited activity") && byKey("attunement_charter").limits.includes("GDKP is prohibited and excluded") && !rows.some(row => /gdkp/i.test(row.key)));
  check(".218 PvP proposals prohibit named targets, wager markets, harassment and personal dossiers", byKey("pvp_escrow_proposal").outcome.includes("no named targets or wager market on this site") && byKey("pvp_escrow_proposal").limits.includes("No harassment or personal dossiers"));
  check(".218 no writ reference certifies ToS compliance", !/ToS[- ]compliant/i.test(all) && policy.compliance.includes("do not guarantee compliance or zero risk"));
  const {settingsFrom}=require('./helpers/pure_source218.cjs').loadPureSource218(workerRoot,'site-data');
  const royalSwitchCases218=[
    {label:'absent',rows:[],expected:false},
    ...[['1',true],['',false],['0',false],['false',false],['true',false],[' 1',false],['1 ',false],['01',false],['on',false],[1,false],[true,false],[false,false],[null,false],[{},false],[[],false]].map(([value,expected])=>({label:JSON.stringify(value),rows:[{key:'royalWritsOn',value}],expected}))
  ];
  check(".218 actual settingsFrom keeps only the literal1 schedule setting ON and all absent/malformed values OFF", royalSwitchCases218.length===16 && royalSwitchCases218.every(row=>settingsFrom({},row.rows).royalWritsOn===row.expected));
  check(".218 proposal-specific boundaries preserve no tickets, finite fulfilment, nonspendable escrow and no purchased authority", byKey("imperial_lottery").outcome.includes("no tickets or prizes are offered") && byKey("bifrost_writ").limits.includes("not an operational guarantee") && byKey("pvp_escrow_proposal").limits.includes("escrow is never spendable Treasury revenue") && byKey("trade_factor_warrant").limits.includes("No price fixing") && byKey("trial_memorial_writ").limits.includes("No guaranteed trial acceptance"));
  check(".199 single shared banner gives actual gold recipient and free-addon/noRMT/review boundaries", policy.recipient === "Fernmelder" && ["in-game mail or trade to Fernmelder", "no USD, Twitch subscriptions or crypto", "All addons remain free", "zero paid addon gating", "officer review", "actual eligibility and capacity", "Discord Trust & Safety"].every(term => policy.banner.includes(term)) && policy.compliance.includes("do not guarantee compliance or zero risk"));
  check(".199 reference keeps all external dispatchOFF and ordinary free applications,appeals/privacy", ["TREASURY_COSMETIC_ENABLED", "ARMY_SITE_AGGREGATE_ENABLED", "Olympus Link", "remain OFF"].every(term => policy.dispatch.includes(term)) && policy.review.includes("never an automatic grant") && policy.review.includes("Ordinary membership applications, appeals and account privacy controls remain available without buying a writ"));
  check(".199 targeted jesters require prior revocable recipient opt-in and free unwanted-role removal", policy.consent.includes("prior, specific, revocable opt-in") && policy.consent.includes("Withdrawal of consent ends the display without a fee") && byKey("court_jester_apply").limits.includes("opt in specifically beforehand") && byKey("court_jester_reversal").limits.includes("separately consent as recipient") && byKey("court_jester_commute").limits.includes("always free"));
  check(".199 Stockades venue remains unconfirmed with no invented invite or automatic provider action", policy.stockadesUrl === null && policy.stockadesStatus.includes("not confirmed") && !/https?:\/\/discord(?:\.gg|\.com\/invite)/.test(all) && data.STOCKADES_CHECKLIST.length === 8 && data.STOCKADES_CHECKLIST.some(step => step.includes("separately authorize") || step.includes("Separately authorize")) && data.STOCKADES_CHECKLIST.some(step => step.includes("unknown provider result stays unknown")) && data.STOCKADES_CHECKLIST.some(step => step.includes("do not improvise a raw database deletion")));
  check(".199 bail forbids severe safety offenses and blind receipt/marker/unban shortcuts", byKey("royal_clemency").limits.includes("severe Discord ToS / Trust & Safety offenses are non-bailable") && byKey("privy_court_high_bail").limits.includes("Free ordinary appeal") && data.STOCKADES_CHECKLIST.some(step => step.includes("Case ID in the mail subject")) && data.STOCKADES_CHECKLIST.some(step => step.includes("no unban")));
  check(".199 scarcity,charter,ceremonial and service prices grant no fabricated capacity or authority", byKey("writ_translation").limits.includes("real current vacancy") && byKey("flagship_direct_induction").limits.includes("configured 1,000-character branch planning boundary") && byKey("flagship_direct_induction").limits.includes("game cap is not independently verified") && byKey("dual_citizenship").limits.includes("One additional character only") && byKey("ceremonial_warrant").limits.includes("cannot fill a substantive stable office or Council seat") && byKey("featured_artisan").limits.includes("Sponsored placement is disclosed") && byKey("expedited_assize").limits.includes("No guaranteed acceptance") && byKey("letter_marque").limits.includes("genuinely vouch") && byKey("mercantile_proclamation").limits.includes("preview") && byKey("civil_suit_makgora").limits.includes("All parties agree"));
  check(".199 generated static bytes equal the deterministic canonical-source projection", fs.readFileSync(path.join(workerRoot, "public/static/royal-writs199.js"), "utf8") === require(path.join(workerRoot, "../scripts/build-royal-writs199.cjs")).projection());
check(".218 paid review proposals cannot buy loot, moderation or government",
 byKey("trial_memorial_writ").limits.includes("no loot priority, moderation advantage or governing authority")
 && byKey("raid_bench_writ").limits.includes("no loot priority or exception to the currently published rotation"));
check(".218 historical civil filing is wholly inactive and bench cites its actual codex",
 byKey("civil_suit_makgora").limits.includes("While suspended, the whole historical programme, including its 25g civil filing, remains inactive.")
 && byKey("civil_suit_makgora").enabled===false && byKey("civil_suit_makgora").forecastGold===0
 && JSON.stringify(byKey("raid_bench_writ").titles)==='["III"]');

  check(".218 expedited review never buys an earlier or extra vote, rank or office", (() => {
    const row = byKey("expedited_assize");
    return row.goldMin === 150 && row.goldMax === 150 && row.outcome === "Priority administrative review queue"
      && row.limits.startsWith("No guaranteed acceptance. No earlier vote, extra vote, rank or office;")
      && row.limits.includes("fair evidence and the same eligibility standards apply")
      && row.limits.includes("Currently eligible ordinary applications only")
      && row.limits.includes("reserved Leader, High Council and Officer Corps seats cannot be purchased or opened");
  })());
  return checks;
}
module.exports = { runChecks };
if (require.main === module) {
  try { const checks = runChecks(); for (const result of checks) console.log((result.passed ? "PASS " : "FAIL ") + result.name); console.log(checks.filter(result => result.passed).length + "/" + checks.length + " passed"); process.exit(checks.every(result => result.passed) ? 0 : 1); }
  catch (error) { console.error("FAIL .199 royal writ reference contract: " + error.message); process.exit(1); }
}
