/**
 * Published treasury planning content. All prose is plain text, never HTML.
 * The renderer must create text nodes/textContent and validate link protocols.
 * Money is in in-game gold. Figures are assumptions, not a bank or roster feed.
 *
 * Contract: publication/snapshot/objective/assumptions/accounting are objects;
 * principles/revenueChannels/incentives/phases/milestones/responsibilities/
 * frameworks/okrs/kpis/cadence/risks/sources are arrays; swot and lean are objects.
 * chapters projects the same content for the renderer: [{id,title,intro,sections}].
 * Each section has heading and paragraphs/bullets/table/links; table has headers/rows.
 * No configuration toggle, provider dispatch, donation collection or permissions
 * are changed by importing this module.
 */
export const TREASURY_PLAN207 = {
  version: 207,
  title: "Olympus Treasury Programme",
  subtitle: "Build earning capacity. Fund the guild. Protect member trust.",
  summary: "A short-, mid- and long-term officer plan, starting from an owner-reported 0g. The 90-day million-gold objective is a stretch scenario to test with actual participation and margins, not a promise or a live balance.",
  publication: {
    asOf: "2026-10-28",
    status: "Published planning programme · economic pilot",
    scope: "Publishing this plan does not start its operating clock, approve a spending commitment, activate a fee, collect donations or grant an officer permission.",
    startRule: "Day 1 is the agreed date on which the production guild, accessible treasury and authorised operators can function. Record that date before reporting progress against the plan.",
    launchContext: "Blizzard lists Forever's global launch as 4 November 2026 at 3:00 p.m. PST. Pre-launch preparation is separate from the 90-day operating period. Ninety elapsed days after 4 November ends on 2 February 2027; this is an illustration, not an adopted start date.",
    activation: "Royal Writs remain paused/OFF. Existing provider and treasury dispatch gates remain unchanged. This page is planning and reference material, not an active shop or automated revenue system."
  },
  snapshot: {
    openingGold: 0,
    label: "Owner-reported opening balance",
    recordedOn: "28 October 2026",
    status: "Historical owner statement · not a live bank feed",
    unknowns: [
      "Weekly active unique players have not been established. Roster characters, alts and Discord members are not a count of active people.",
      "The operating realm, accessible bank/custody limits and agreed Day 1 have not been confirmed for this plan.",
      "Customer demand, sale prices, realised margins, provider availability and officer capacity remain unmeasured."
    ]
  },
  objective: {
    aim: "Give Olympus the resources to support progression, professions, events and members in difficulty.",
    vision: "A productive community that can sustain shared activities without depending on one wealthy donor or one indispensable officer.",
    targetSpendableGold: 1000000,
    additionalReserveGold: 50000,
    durationDays: 90,
    statement: "Accumulate 1,000,000g of spendable, reconciled gold plus a separate 50,000g operating reserve after costs and outstanding obligations over 90 operating days.",
    qualification: "The objective is specific, measurable, relevant and time-bound. Achievability is unvalidated until the pilot establishes participation, demand, profitable throughput and capacity.",
    benefit: "The treasury exists to finance useful guild activity. Reaching a cash milestone does not itself authorise spending or indefinite hoarding; Council must approve the subsequent reserve and benefits budget."
  },
  assumptions: {
    label: "Illustrative target-reaching scenario · not a forecast",
    activeUniquePlayers: 1000,
    donationParticipants: 600,
    weeklyDonationPerParticipantGold: 75,
    weeklyGoodsSalesGold: 100000,
    goodsRetainedMargin: 0.30,
    weeklyServicesSalesGold: 100000,
    servicesRetainedMargin: 0.25,
    weeklyOtherSpendingGold: 5000,
    matureWeeklyNetGold: 95000,
    ramp: [
      { fromDay: 1, toDay: 7, fraction: 0.25 },
      { fromDay: 8, toDay: 14, fraction: 0.50 },
      { fromDay: 15, toDay: 21, fraction: 0.75 },
      { fromDay: 22, toDay: 90, fraction: 1 }
    ],
    matureEquivalentWeeks: 11.357142857142858,
    targetCashDay90Gold: 1078928.5714285714,
    targetSpendableDay90Gold: 1028928.5714285714,
    approximateWorkingCapitalGold: 43000,
    cases: [
      { id: "downside", title: "Downside illustration", matureWeeklyNetGold: 28500, cashDay90Gold: 323678.5714285714, spendableDay90Gold: 273678.5714285714 },
      { id: "working", title: "Working illustration", matureWeeklyNetGold: 52500, cashDay90Gold: 596250, spendableDay90Gold: 546250 },
      { id: "stretch", title: "Target-reaching illustration", matureWeeklyNetGold: 95000, cashDay90Gold: 1078928.5714285714, spendableDay90Gold: 1028928.5714285714 }
    ],
    explanation: "At maturity: 600 × 75g voluntary gifts = 45,000g; 100,000g goods sales × 30% retained margin = 30,000g; 100,000g permitted direct-service sales × 25% = 25,000g; less 5,000g other spending = 95,000g weekly bank growth. Retained margins already deduct materials, provider pay, fees, refunds and commissions; do not deduct those costs twice.",
    rampExplanation: "Days 1–7 run at 25%, Days 8–14 at 50%, Days 15–21 at 75%, and Days 22–90 at 100% of the mature weekly net. This totals 11.357142857 mature-equivalent weeks. The mature net is after costs; the reserve is allocated once at the end, not charged every week.",
    capacityWarning: "The example clears the spendable target by only about 28,929g. Losing one mature week puts it below target. If goods average 100g per order and services 80g, the example requires about 2,250 paid orders every week. Those are arithmetic examples, not observed Forever market prices or proven demand.",
    workingCapitalWarning: "An illustrative two-day funding cycle at this commercial volume could require roughly 43,000g for costs and operating cash outflows. Starting from zero means procurement must follow funding. Begin with customer-provided materials and small, funded batches; do not promise unfunded purchases or borrow against speculative sales."
  },
  accounting: {
    title: "Count gold once, and count only what is available",
    formula: "Spendable gold = reconciled eligible cash − unpaid obligations − customer deposits for unfinished work − restricted aid funds − the additional operating reserve.",
    targetRule: "The target cash is 1,050,000g after costs and other exclusions: 1,000,000g spendable plus 50,000g reserve. The reserve remains cash but is unavailable for ordinary discretionary spending.",
    remainingPaceFormula: "Required remaining weekly net = max(0, 1,000,000g + reserve − current eligible cash) × 7 ÷ days remaining. Eligible cash here is after obligations, unfinished-order deposits and restricted funds, but before reserve allocation.",
    exclusions: [
      "Exclude pledges, unpaid invoices, unsold inventory and estimated material values from the cash milestone.",
      "Exclude loans and customer deposits for unfinished orders from spendable funds. Keep restricted member-aid donations separately accounted for.",
      "Material gifts are useful inventory, not gold receipts. Record a receipt once; never count both the material estimate and its later sale as two cash contributions.",
      "A transfer between guild accounts or a guild-funded matching campaign is not new income. Only additional external sponsor gold increases receipts.",
      "A member's purchase and donation are separate real receipts only when both occur; do not also count the same internal gold as external customer demand.",
      "Report each region or unrelated realm separately. Gold outside the agreed accessible treasury pool cannot be presented as flagship spendable gold."
    ],
    verification: "Confirm actual bank and custody limits before adopting a literal storage target. Use authorised custody only; this plan does not authorise extra accounts, circumvention or changes to banking permissions.",
    stopRule: "If accounts do not reconcile, pause the affected payments and sales, preserve the records and investigate. Never conceal a deficit with a pledge, inventory valuation or unapproved transfer."
  },
  principles: [
    { title: "Voluntary participation", body: "Members may contribute gold, materials, work or knowledge. No one must donate to remain a member, receive ordinary consideration or make a free appeal. Do not turn the stretch target into an individual debt or disciplinary quota." },
    { title: "In-game gold only", body: "No real-world money, cryptocurrency, Twitch subscription exchange, illicit gold, paid addon gating or purchase of moderation powers. A donation label does not make suspicious gold acceptable." },
    { title: "Membership and justice stay independent", body: "No paid kicks, punishments, targeted harassment, purchased leadership, admissions immunity, favourable appeals or guaranteed flagship placement. Moderators and judges have no fundraising quota and receive no commission for sanctions." },
    { title: "Clear proposals, separate activation", body: "The plan is published for officer and member understanding. Fees, commissions, budgets and thresholds below are proposals for an authorised pilot, not claims that collection, dispatch or a payment workflow is active. Royal Writs remain paused/OFF." },
    { title: "Profit follows useful work", body: "Sell only legitimate, permitted goods and direct services with disclosed terms, a capable provider and recorded costs. Exclude loot auctions, organised boosting, brokerage and escrow from this programme; no umbrella multi-realm service marketplace is authorised." },
    { title: "Privacy and proportionate records", body: "Publish aggregate results rather than donor identities or individual wealth. Recognition is optional and anonymous gifts remain possible. Use existing authorised records and retention rules; this plan creates no new identity retention or tracking system." }
  ],
  revenueChannels: [
    { id: "voluntary", title: "Voluntary contributions and optional tithes", status: "Pilot candidate", body: "Invite affordable fixed gifts or an optional share of personal trading profit. Explain the specific guild benefit, report settled receipts and allow members to decline without penalty. The target illustration assumes 600 of 1,000 active unique players give 75g each week; neither population nor participation is confirmed.", items: ["Budget contribution income from settled receipts, not promises.", "Offer gold, material, work and knowledge participation paths.", "Never pay commissions for soliciting donations or set public wealth rankings."] },
    { id: "goods", title: "Guild-produced goods", status: "Pilot candidate", body: "Test consumables, requested profession materials and crafted goods in small batches. Choose three offers using actual repeat demand and complete cost records. The example assumes 100,000g weekly sales at a 30% Treasury-retained margin; both are unvalidated.", items: ["Quote materials, labour, sales fees, refund allowance and coordination pay.", "Cap inventory purchases and work in progress.", "Separate sales to guild members from genuinely external customers."] },
    { id: "services", title: "Permitted direct crafting and player services", status: "Conditional candidate · verify Forever rules first", body: "Offer only a real, directly fulfilled service whose current game and advertising rules have been checked. Quote provider payment and the guild's disclosed coordination charge before acceptance. The example assumes 100,000g weekly sales with 25% retained after all direct costs; this is not an approved service catalogue.", items: ["The cited Anniversary clarification is not blanket Forever permission.", "No organised boosting, matchmaking, brokerage, escrow or multi-realm service network.", "No loot auctions or conversion of raid access, leadership or discipline into a revenue stream."] },
    { id: "management", title: "Coordination or management charges", status: "Proposed only within an opted-in service", body: "Charge only for actual, disclosed coordination work within a permitted completed order. Do not charge members merely for belonging, hide a second fee in settlement, or treat internal transfers as revenue.", items: ["State a fixed price or clear percentage before work starts.", "Include it in the order's complete margin calculation.", "Refund or adjust under the agreed cancellation terms when work is not delivered."] },
    { id: "aid", title: "In-game member-aid contributions", status: "Separately restricted purpose", body: "Describe assistance accurately as an in-game member-aid fund, not a real-world charitable or tax-deductible donation. Record its restrictions, recipients' eligibility and approvals separately. Restricted aid gold does not count toward unrestricted spendable Treasury gold.", items: ["Publish aggregate aid inflows and outflows.", "Do not condition aid eligibility on prior donations.", "Avoid exposing a recipient's personal circumstances in public reporting."] },
    { id: "appeals", title: "Appeals, clemency and discipline", status: "0g in every forecast", body: "Ordinary appeals remain free. Any historical conditional-clemency arrangement is a separate reviewed case process, not a revenue channel. No paid kick, punitive targeting, purchased unban outcome, immunity or moderator sales target is part of this plan.", items: ["Justice decides cases independently of Treasury receipts.", "Severe safety or platform-rule offences cannot be sold a favourable outcome.", "Do not solicit payments through this planning page."] },
    { id: "patron", title: "Patron cosmetics, writs and paid invitations", status: "Paused/OFF · excluded", body: "Existing Royal Writs and patron offers remain paused/OFF. Ordinary membership is free. This programme does not activate cosmetic offers, sell authority, guarantee placement or create a paid application advantage.", items: ["A later proposed cosmetic benefit must remain separate from permissions and loot advantage.", "No purchased office, moderation power, bank access or admissions immunity.", "Publishing this plan does not change any provider or admin gate."] }
  ],
  incentives: [
    { title: "Provider payment for completed work", body: "Agree the price, quality and delivery conditions before work begins. Pay crafters and providers from the funded order, and record their payment as a cost before calculating Treasury's margin." },
    { title: "Margin-based coordination commission", body: "Illustrative proposed rule: pay 10% of realised margin after materials and fulfilment, capped at 5% of the sale price, only after delivery and settlement. A 100g sale less 50g materials/fees and 15g fulfilment leaves 35g. The coordinator receives 3.5g and Treasury retains 31.5g. Do not deduct the 3.5g again from an already net reported margin." },
    { title: "Funded gathering requests", body: "Publish requested materials, purchase prices, quantity limits and a funded purchase order. Do not entice gatherers with an uncapped promise the bank cannot pay. Maintain fair opportunities rather than rewarding only those who can donate the most." },
    { title: "Recognition across contribution types", body: "Recognise reliable crafting, mentoring, coordination, documented knowledge, materials and voluntary gold separately. Use opt-in acknowledgement and anonymous participation; no public donor wealth ladder, purchased authority or disciplinary favour." },
    { title: "Team results and sustainable workload", body: "Reward departments for useful member outcomes, positive net contribution, reliability and good handover. Include fulfilment quality, complaints and officer time so a revenue target cannot reward burnout or misleading sales." },
    { title: "Matching campaigns without double counting", body: "An additional sponsor contribution can support a campaign. A transfer from Treasury to match itself is an allocation, not new gold. Publish whether a match is externally funded and count each settled transfer only once." }
  ],
  phases: [
    {
      id: "prepare", title: "Prepare the operating charter", horizon: "Before Day 1", objective: "Agree the treasury pool, operators, rules and pilot scope before making commitments.",
      actions: ["Confirm the realm, bank/custody limits, authorised signers and a dated opening statement.", "Measure active unique people without treating alts or Discord membership as independent participants.", "Publish the voluntary-participation rules, exclusions, proposed payout terms and complaint route.", "Choose three goods/service pilot offers whose current rules, provider availability and costs can be checked.", "Assign existing officers, approve a small funded pilot budget and record Day 1 separately from website publication."],
      deliverables: ["Named accountable officers and backup contacts", "Opening balance and accessible-pool definition", "Funded pilot catalogue and disclosed payout terms"],
      decisionGate: "No collection campaign, purchasing commitment or service promise is implied by publication. Begin only when the authorised operating arrangements and funding exist."
    },
    {
      id: "short", title: "Establish trust and profitable delivery", horizon: "Short term · Days 1–30", objective: "Build working capital, reconcile accounts and determine whether the stretch target is credible.",
      actions: ["Days 1–7: invite voluntary participation and fulfil small customer-material or otherwise funded orders. Record every completed sale and cost.", "Days 8–14: measure repeat demand, actual donation participation, margin, delivery time and available officer hours. Stop loss-making or unpermitted offers.", "At Day 14: compare measured capacity with the required remaining pace. Enthusiastic sign-ups or pledges are not revenue evidence.", "Days 15–30: expand only the best repeatable activities, build the reserve and train a backup for every essential task.", "Reconcile weekly and publish aggregate receipts, costs, obligations, reserves and the revised Day-90 forecast."],
      deliverables: ["Completed-order cost sample and repeat-demand evidence", "Day-14 feasibility decision", "Reliable weekly accounts and backup operating instructions"],
      decisionGate: "Continue the million-gold attempt only if participation and profitable throughput can support it. Otherwise adopt a lower evidence-based target or extend the deadline without increasing member pressure."
    },
    {
      id: "mid", title: "Scale proven activities and protect the finish", horizon: "Mid term · Days 31–90", objective: "Grow repeat demand while keeping cash, obligations and quality under control.",
      actions: ["Days 31–60: focus on a small catalogue of profitable offers with clear fulfilment windows and funded purchase limits.", "Track internal and external customer receipts separately; do not call recirculated member spending new external demand.", "Require two consecutive weeks near the needed net-growth rate before describing the programme as on track.", "Days 61–90: reduce speculative inventory, finish commitments and settle accrued provider pay, commissions and refunds.", "At Day 90: publish reconciled settled cash, exclusions, reserve and spendable gold. Council separately decides the next benefits and reserve budget."],
      deliverables: ["Repeatable fulfilment capacity and cross-trained operators", "Current weekly forecast and stop/revise decisions", "Day-90 statement after obligations and reserve"],
      decisionGate: "A milestone is achieved only by eligible, settled cash. If capacity falls short, change the channel mix or timeline; do not invent punishments, fees or individual donor debts."
    },
    {
      id: "long", title: "Turn the milestone into a lasting guild benefit", horizon: "Long term · Months 4–12", objective: "Sustain useful spending and reduce dependence on donors, markets and individual officers.",
      actions: ["Months 4–6: seek eight consecutive weeks in which recurring receipts cover recurring approved spending.", "Adopt affordable budgets for repairs, consumables, profession support, events and member aid using actual income.", "Maintain a trained backup for every critical task and review concentration in donors, customers, suppliers and custody.", "Months 7–12: size the reserve from actual essential spending and disruption risk. A proposed later floor is 13 weeks of essential expenditure, subject to budget approval.", "Quarterly: retain, change or retire each activity using profitability, quality, workload, trust and member-benefit evidence."],
      deliverables: ["Recurring activity that pays for recurring approved benefits", "Documented backup coverage and reserve policy", "Quarterly programme and member-benefit review"],
      decisionGate: "Do not use a cash milestone as a reason to hoard indefinitely. Council must explicitly balance strategic reserves with useful, sustainable guild benefits."
    }
  ],
  milestones: [
    { day: 7, cashGold: 23750, spendableAfterReserveGold: 0, note: "Reserve still being built; model cash is below 50,000g." },
    { day: 14, cashGold: 71250, spendableAfterReserveGold: 21250, note: "Feasibility review using actual settled transactions." },
    { day: 30, cashGold: 264642.85714285716, spendableAfterReserveGold: 214642.85714285716, note: "Scale only profitable repeat demand." },
    { day: 60, cashGold: 671785.7142857143, spendableAfterReserveGold: 621785.7142857143, note: "Reforecast capacity and settle accrued obligations." },
    { day: 90, cashGold: 1078928.5714285714, spendableAfterReserveGold: 1028928.5714285714, note: "Illustrative scenario, not a guarantee or measured balance." }
  ],
  responsibilities: [
    { title: "Guild Master / Co-GM", body: "Sponsor the programme, approve its budget and priorities, decide target or deadline changes, and keep the programme aligned with member benefits. This plan grants no new authority." },
    { title: "Treasurer · High Council", body: "Own the cash forecast, authorised custody records, payment reconciliation and complete accounting of obligations and reserves. Escalate discrepancies before further affected payments." },
    { title: "Head of Trading & Markets · High Council", body: "Focus exclusively on auction-house trading, direct item trades and market strategy. Research current prices, real demand, liquidity and total transaction costs; propose funded buy/sell opportunities, negotiate direct trades and manage execution and stock within separately approved capital, concentration and loss limits. Report realised net profit, sell-through, time to cash, aged inventory and losses to the Treasurer. Turnover, unsold stock and optimistic valuations are not profit. Do not administer donations, dues, appeals, discipline or Workshop commissions; custody, budgets, reconciliation and independent audit stay with their separate officers." },
    { title: "Independent Bank Auditor", body: "Review records and reconciliation independently of fundraising results. Report discrepancies without accepting sales or donation targets; do not approve or audit your own payment." },
    { title: "Minister of Artisanry / Workshop leads", body: "Select products from actual demand, coordinate funded production, record complete costs, check quality and train backup providers." },
    { title: "Main Raid Lead / Main PvP Lead · High Council remits", body: "Define useful activity requirements, provider capacity and costed spending requests. Their remit is planning and delivery, not selling authority, admissions or favourable discipline." },
    { title: "Minister of Heraldry", body: "Communicate accurate campaign terms and aggregate results. Obtain consent for recognition and label forecasts, examples and active offers clearly." },
    { title: "Chief of Intake", body: "Keep ordinary membership accessible, distinguish active people from character counts and make clear that contributions do not buy acceptance, rank or flagship placement." },
    { title: "Head of Justice · High Council", body: "Handle conflicts and complaints independently of revenue. Ordinary appeals are free; judges and moderators have no fundraising quota or sanction commission." },
    { title: "Systems / reporting support", body: "Assist authorised operators with aggregate reporting under existing access, privacy, erasure and retention boundaries. No new identity tracking or provider dispatch is authorised." }
  ],
  frameworks: [
    { title: "SMART", body: "Specific: a useful and reconciled treasury. Measurable: 1,000,000g spendable plus 50,000g reserve after exclusions. Achievable: unvalidated until the pilot proves capacity. Relevant: fund guild benefits. Time-bound: 90 operating days with Day-14 and weekly decisions." },
    { title: "OGSM", body: "Objective: sustainable guild funding. Goal: test the million-gold stretch milestone. Strategies: voluntary support, demanded goods and permitted direct services. Measures: net cash, repeat participation, retained margin, quality and sustainable officer workload." },
    { title: "Business plan", body: "Define customers and needs, offers and prices, all costs, provider capacity, working capital, responsibilities, risks and how useful guild benefits will be funded. Test assumptions before expanding commitments." },
    { title: "Strategic plan", body: "Choose which repeatable revenue channels deserve investment and which activities are excluded. Do not confuse adding more fee types with developing earning capacity." },
    { title: "Action plan", body: "Give each approved task an existing accountable officer, a deadline, funded resources and clear acceptance evidence. A proposal without an owner or funding remains a proposal." },
    { title: "Operational plan", body: "Use a consistent process for quoting, accepting, funding, fulfilling, settling and reconciling orders, with daily exception handling and weekly accounts." },
    { title: "OKRs and KPIs", body: "Use the few outcome objectives and weekly indicators below. They describe the same programme; they do not create parallel committees, extra permissions or a separate reporting bureaucracy." }
  ],
  okrs: [
    { title: "Build a useful treasury", results: ["By Day 14, publish a feasibility decision backed by completed-order costs and participation evidence.", "Maintain a current cash forecast and compare actual settled cash with the scenario checkpoints.", "Pursue the 1,000,000g spendable milestone only while measured capacity supports the required remaining pace."] },
    { title: "Earn and retain member trust", results: ["Reconcile every operating week and publish aggregate accounts.", "Independently review every material discrepancy; resolve or explicitly disclose it before claiming a milestone.", "Keep ordinary membership, appeals and discipline independent of contribution or payment."] },
    { title: "Create repeatable earning capacity", results: ["Maintain positive realised margin and a proposed on-time fulfilment target of at least 95%.", "Establish repeat customers and providers without commitments exceeding funded capacity.", "Train a backup for every essential operation and review workload each week."] }
  ],
  kpis: [
    { title: "Cash and availability", body: "Reconciled cash, unpaid obligations, unfinished-order deposits, restricted aid, reserve and spendable balance; show the dated source and pool." },
    { title: "Net growth and forecast", body: "Actual weekly net gold, cumulative cash, variance from the scenario, days remaining and the newly required weekly net." },
    { title: "Income mix", body: "Voluntary contributions, goods and services separately; distinguish internal members from external customer demand." },
    { title: "Realised margin", body: "Receipts less all materials, provider pay, selling fees, refunds and commissions; no estimated inventory profit." },
    { title: "Trading performance and capital risk", body: "The Head of Trading & Markets reports settled trading profit after acquisition costs, auction fees, lost deposits and agreed costs, plus sell-through, cash tied up, inventory age and concentration. Show losses and remaining approved capital limits. The current zero opening balance and unknown demand mean no funded trading operation or profit promise is established by this plan." },
    { title: "Participation and demand", body: "Unique voluntary contributors, repeat customers and funded completed orders; do not equate alts or Discord membership with people." },
    { title: "Fulfilment quality", body: "On-time rate, errors, refunds and overdue commitments. At least 95% on time is a proposed pilot target, not existing performance." },
    { title: "Capacity and concentration", body: "Officer hours, provider capacity, backup coverage, largest donor/customer exposure and dependence on individual operators." },
    { title: "Trust and outcomes", body: "Unresolved complaints, reconciliation discrepancies and the useful guild benefits financed; do not publish individual wealth or private case details." }
  ],
  swot: {
    strengths: "An established guild identity, a current leadership structure and opportunities to coordinate professions and useful shared activities.",
    weaknesses: "Zero reported starting capital and unverified active population, demand, margins, treasury-pool limits and available labour.",
    opportunities: "Repeat consumable needs, profession expertise, reliable fulfilment and voluntary support tied to visible member benefits.",
    threats: "Launch scarcity, volatile prices, illicit gold, access interruptions, donor concentration, burnout and loss of trust."
  },
  lean: {
    title: "TPS and Lean Six Sigma in practical guild terms",
    tpsDefinition: "TPS means Toyota Production System here. Produce against real demand, limit work in progress and standardise reliable handovers rather than accumulating speculative stock.",
    tpsActions: ["Accept no more work than the available providers and funded materials can fulfil.", "Use one clear quote, acceptance, fulfilment and settlement process.", "Stop the affected operation for a quality, rules, payment or accounting failure and investigate its cause before restarting.", "Remove unnecessary waiting, rework and double handling without sacrificing member experience."],
    dmaic: [
      { title: "Define", body: "Specify the customer need, useful guild outcome and boundaries of the activity." },
      { title: "Measure", body: "Record actual price, full cost, handling time, demand, errors and cash tied up." },
      { title: "Analyse", body: "Find the actual bottleneck: buyers, materials, provider skill, officer hours or working capital." },
      { title: "Improve", body: "Test one change on a small funded batch and compare the outcome." },
      { title: "Control", body: "Keep the change only if margin, quality and workload remain acceptable; document a backup process." }
    ],
    warning: "Increasing recruitment does not necessarily solve a shortage of buyers, materials, skills, officer time or working capital. Measure the constraint before choosing a remedy."
  },
  cadence: [
    { title: "Daily", body: "Review accepted orders, stock, overdue commitments, payment exceptions and provider capacity." },
    { title: "Weekly", body: "Reconcile the accessible treasury, settle authorised payments and publish an aggregate scorecard with the revised forecast." },
    { title: "Fortnightly", body: "Review the required remaining pace, member feedback, channel profitability and workload. Extend or lower the target when evidence requires it." },
    { title: "Monthly", body: "Complete an independent review and Council budget decision. No person approves their own payment; agree large-payment thresholds before operation." },
    { title: "Quarterly", body: "Retain, improve or retire activities and reassess member benefits, reserves, concentration and operator succession." }
  ],
  risks: [
    { title: "Unproven economics", body: "The 95,000g mature weekly requirement is demanding and its illustrative margin clears the target narrowly. Use actual transactions, not confidence or roster size, to decide whether to continue." },
    { title: "Rules and advertising scope", body: "The cited services clarification addresses Anniversary realms. It does not establish blanket permission for Forever services or an Olympus multi-branch brokerage. Verify the actual activity and current advertising rules before an offer goes live." },
    { title: "Illicit gold", body: "Accept legitimate in-game proceeds only. Suspicious gifts or one-sided transfers can expose recipients to enforcement; the word donation is no protection. Escalate a concern rather than promising concealment or a way around enforcement." },
    { title: "Access and economy holds", body: "Blizzard describes temporary holds that can restrict trade, mail, guild banks and auctions, including while a suspected false positive is investigated. Size the reserve and commitments for real interruption risk; do not route around a hold." },
    { title: "Trust and conflicts", body: "Never financially reward punishment, appeal decisions, purchased permissions or coercive membership. Keep Justice, independent audit and revenue work separate." },
    { title: "Liquidity and custody", body: "Settled sales can still leave obligations. Confirm actual limits, reconciliation and authorised custody; no extra account, new bank privilege or automated payment is implied." },
    { title: "Concentration and burnout", body: "Monitor dependence on one donor, buyer, provider or officer. Train backups and reduce commitments when the work cannot be sustained." }
  ],
  sources: [
    { id: "launch", title: "Blizzard · Carve a New Path with World of Warcraft: Forever", url: "https://news.blizzard.com/en-us/article/24302093/carve-a-new-path-with-world-of-warcraft-forever", checkedOn: "2026-10-28", scope: "Official launch announcement: 4 November 2026, 3:00 p.m. PST globally. The programme's actual Day 1 remains an operating decision." },
    { id: "gold", title: "Blizzard · Gold buying rules · Kaivax, post 43", url: "https://us.forums.blizzard.com/en/wow/t/gold-buying-rules/2364933/43", checkedOn: "2026-10-28", scope: "Forever RMT enforcement and recipient risks from illicit gifts or one-sided transactions; not approval of a proposed revenue activity." },
    { id: "holds", title: "Blizzard · Temporary Economy Holds For RMT", url: "https://us.forums.blizzard.com/en/wow/t/temporary-economy-holds-for-rmt/2381433", checkedOn: "2026-10-28", scope: "Forever economy-access restrictions and investigation of possible false positives; motivates liquidity planning, not circumvention." },
    { id: "services", title: "Blizzard · In-Game Advertising & Services Channel in Burning Crusade Classic Anniversary", url: "https://us.forums.blizzard.com/en/wow/t/in-game-advertising-services-channel-in-burning-crusade-classic-anniversary/2238861", checkedOn: "2026-10-28", scope: "Explicitly Anniversary scope. Distinguishes direct player/guild activity from prohibited organised non-traditional service operations. Not blanket Forever approval; this programme excludes loot auctions and brokerage." },
    { id: "discord", title: "Discord · Community Guidelines", url: "https://discord.com/guidelines", checkedOn: "2026-10-28", scope: "Community safety, harassment and sale of server permissions. The programme keeps real discipline and authority separate from payment; this is not a claim that every optional paid benefit is prohibited." }
  ]
};

// Render projection only: keep numerical assumptions above available to the
// interactive model, and keep prose in one canonical source.
const plan207 = TREASURY_PLAN207;
const gold207 = value => `${Math.round(value).toLocaleString("en-US")}g`;
const section207 = entry => ({ heading: entry.title, paragraphs: [entry.body], bullets: entry.items || [] });
TREASURY_PLAN207.chapters = [
  {
    id: "mission", title: "Mission, starting point and the 90-day stretch goal", intro: plan207.summary,
    sections: [
      { heading: "Aim and vision", paragraphs: [plan207.objective.aim, plan207.objective.vision, plan207.objective.benefit] },
      { heading: "Owner-reported 0g · 28 October 2026", paragraphs: [plan207.snapshot.status], bullets: plan207.snapshot.unknowns },
      { heading: "The SMART objective", paragraphs: [plan207.objective.statement, plan207.objective.qualification] },
      { heading: "When the clock starts", paragraphs: [plan207.publication.startRule, plan207.publication.launchContext, plan207.publication.scope, plan207.publication.activation] }
    ]
  },
  {
    id: "economics", title: "Business model and feasibility", intro: plan207.assumptions.label,
    sections: [
      { heading: "Mature weekly target-reaching example", paragraphs: [plan207.assumptions.explanation], table: { headers: ["Activity", "Assumption", "Weekly Treasury amount"], rows: [
        ["Voluntary contributions", "600 contributors × 75g; 60% of an assumed 1,000 active unique players", "45,000g"],
        ["Goods", "100,000g sales × 30% fully costed retained margin", "30,000g"],
        ["Permitted direct services", "100,000g sales × 25% fully costed retained margin", "25,000g"],
        ["Other approved spending", "Illustrative weekly allowance", "−5,000g"],
        ["Net mature weekly bank growth", "After costs; no new fee activation", "95,000g"]
      ] } },
      { heading: "Ramped 90-day scenarios", paragraphs: [plan207.assumptions.rampExplanation], table: { headers: ["Illustrative case", "Mature weekly net", "Day-90 cash", "After 50,000g reserve"], rows: plan207.assumptions.cases.map(entry => [entry.title, gold207(entry.matureWeeklyNetGold), gold207(entry.cashDay90Gold), gold207(entry.spendableDay90Gold)]) } },
      { heading: "Capacity and working capital", paragraphs: [plan207.assumptions.capacityWarning, plan207.assumptions.workingCapitalWarning] },
      { heading: "Scenario checkpoints · not promises", table: { headers: ["Checkpoint", "Cash after costs", "After reserve allocation", "Decision"], rows: plan207.milestones.map(entry => [`Day ${entry.day}`, gold207(entry.cashGold), entry.cashGold < plan207.objective.additionalReserveGold ? "Reserve still being built" : gold207(entry.spendableAfterReserveGold), entry.note]) } }
    ]
  },
  { id: "accounting", title: "Cash accounting and the weekly forecast", sections: [
    { heading: plan207.accounting.title, paragraphs: [plan207.accounting.formula, plan207.accounting.targetRule, plan207.accounting.remainingPaceFormula], bullets: plan207.accounting.exclusions },
    { heading: "Custody and the stop rule", paragraphs: [plan207.accounting.verification, plan207.accounting.stopRule] }
  ] },
  { id: "participation", title: "Revenue, participation and firm boundaries", intro: "One programme built on useful work and voluntary support.", sections: [
    ...plan207.principles.map(section207),
    ...plan207.revenueChannels.map(entry => ({ ...section207(entry), heading: `${entry.title} · ${entry.status}` }))
  ] },
  { id: "incentives", title: "Incentives for members and delivery teams", sections: plan207.incentives.map(section207) },
  { id: "roadmap", title: "Short-, mid- and long-term roadmap", sections: plan207.phases.flatMap(entry => [
    { heading: `${entry.horizon} · ${entry.title}`, paragraphs: [entry.objective], bullets: entry.actions },
    { heading: "Deliverables and decision gate", paragraphs: [entry.decisionGate], bullets: entry.deliverables }
  ]) },
  { id: "officers", title: "Officer responsibilities and operating rhythm", intro: "Use existing offices. These responsibilities do not create appointments or change permissions.", sections: [
    ...plan207.responsibilities.map(section207),
    { heading: "Working rhythm", table: { headers: ["Frequency", "Operating action"], rows: plan207.cadence.map(entry => [entry.title, entry.body]) } }
  ] },
  { id: "frameworks", title: "One strategy, connected planning frameworks", intro: "The frameworks describe the same programme, not separate committees or paperwork.", sections: plan207.frameworks.map(section207) },
  { id: "scorecard", title: "OKRs and the weekly KPI scorecard", sections: [
    ...plan207.okrs.map(entry => ({ heading: entry.title, bullets: entry.results })),
    ...plan207.kpis.map(section207)
  ] },
  { id: "improvement", title: "SWOT, TPS and Lean Six Sigma", sections: [
    { heading: "SWOT", table: { headers: ["Lens", "Assessment"], rows: [["Strengths", plan207.swot.strengths], ["Weaknesses", plan207.swot.weaknesses], ["Opportunities", plan207.swot.opportunities], ["Threats", plan207.swot.threats]] } },
    { heading: plan207.lean.title, paragraphs: [plan207.lean.tpsDefinition, plan207.lean.warning], bullets: plan207.lean.tpsActions },
    ...plan207.lean.dmaic.map(section207)
  ] },
  {"id": "service-proposals218", "title": "Proposed service economy · policy and delivery gates", "intro": "All entries are subject to Blizzard policy and separate operating-plan review. Prices remain unqualified proposals, the programme stays paused, and GDKP is excluded. Wagering and unapproved services contribute zero forecast revenue.", "sections": [{"heading": "The proposed schedules", "table": {"headers": ["Proposal", "Indicative terms", "Required boundary"], "rows": [["Imperial Guild Lottery — authorization required", "Proposed weekly draw", "Subject to Blizzard policy. Wagering authorization and current platform-policy qualification are missing. Disabled, including high-roller pools; zero forecast revenue."], ["Bifrost portal & summoning pass — proposal", "25g/week or 75g/month", "Subject to Blizzard policy, staffed capacity, reagents and published refund terms. Unlimited-use wording is a proposal, not an operational guarantee."], ["Attunement & dungeon service charter — proposal", "Proposed 15% disclosed coordination margin", "Subject to Blizzard policy. GDKP is prohibited and excluded. No loot-bid run, illicit gold, progression guarantee or paid addon gate. Quote and fulfilment terms need separate approval."], ["Writs of Blood & Vengeance — policy review", "Proposed 15% administration fee", "Subject to Blizzard policy. No harassment or personal dossiers. Duel/Mak’gora wagers remain disabled pending authorization and policy review; escrow is never spendable Treasury revenue."], ["Royal Trade Factor supplier warrant — proposal", "150g–500g/season · proposed supplier warrant", "Subject to Blizzard policy. No price fixing, market control, bank rights or forced purchases. Existing workshop offers and owner-paused programme remain unchanged."], ["Priority review & Hall of Fame memorial — proposal", "50g–500g · proposed attended commission", "Subject to Blizzard policy. No guaranteed trial acceptance or raid seat; no loot priority, moderation advantage or governing authority."], ["Raid-Bench Protection Writ — proposal", "50g–500g · proposed standby-rotation review", "Subject to Blizzard policy and separate operating-plan review. Disabled with zero forecast revenue. No guaranteed raid seat or trial acceptance; no loot priority or exception to the currently published rotation; ordinary standby review remains available without purchase."]]}}, {"heading": "One accountable pilot at a time", "bullets": ["The responsible Council portfolio records current policy sources, actual providers, capacity, costs, refunds and consent before seeking an attended pilot.", "Trading controls executable market decisions within Treasury capital limits; Treasury retains custody, while independent Audit checks realized results.", "No price buys justice, officer authority, a raid place or guaranteed membership. Ordinary appeals and safety processes remain free.", "The stretch forecast remains a sensitivity model. Prohibited activities and unapproved wagering contribute zero, not an assumed margin."], "links": [{"label": "Official Forever GDKP answer", "url": "https://www.youtube.com/watch?v=Y5zzSMSVhRo&t=4548s"}, {"label": "Blizzard EULA", "url": "https://www.blizzard.com/en-us/legal/08b946df-660a-40e4-a072-1fbde65173b1/blizzard-end-user-license-agreement"}]}, {"heading": "Historical escrow tariff remains suspended", "paragraphs": ["The retained 25g civil/Mak'gora filing reference and 10% Treasury-rake language do not authorize duel stakes. While suspended, the whole historical reference, including its 25g civil filing, is shown as not active. The later 15% escrow proposal is also unqualified; neither rate is an available offer, collected stake or forecast revenue. Both remain subject to Blizzard policy and the separate authorization described in Title III.9.2(b)."]}, {"heading": "Distinct ordinary fees and reserved seats", "paragraphs": ["The existing Featured Crafter pin remains 50–150g per published season; Expedited Assize remains 150g for review of currently eligible ordinary applications. These are distinct from the unqualified 50–500g trial/memorial and raid-bench proposals. No fee opens a reserved Leader, High Council or Officer Corps seat; ordinary applications remain free."]}]},
  { id: "risks", title: "Risks, controls and when to revise the target", sections: plan207.risks.map(section207) },
  { id: "sources", title: "Primary sources and the limits of their scope", intro: "Checked 28 October 2026. A source on one version of WoW is not approval for a different version or activity.", sections: plan207.sources.map(entry => ({ heading: entry.title, paragraphs: [entry.scope], links: [{ url: entry.url, label: entry.title }] })) },
];
