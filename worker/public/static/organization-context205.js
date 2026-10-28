/* Owner-approved wide overview, 28 Oct 2026: explain the current portfolios and the earlier poster's
 * useful context without carrying its rank order, named holders or appointment claims forward.
 * Mandates remain in governance/organization.json and the complete role guides in site-role-guides201.ts. */
export const ORGANIZATION_LANES205 = Object.freeze([
  {
    key: "war",
    rootId: "war",
    title: "Department of War",
    summary: "Raid preparation, strategy and willing combat teams.",
    duties: [
      "Coordinate PvE progression goals, raid readiness and cross-branch support.",
      "Develop encounter plans and practical training with Class Heads, mentors and scouts.",
      "Arrange optional PvP activities through the responsible local organizers."
    ],
    boundary: "Local Guild Masters and assigned event leaders retain command. Invitations, loot, bank access and demotions need their own authority."
  },
  {
    key: "treasury",
    rootId: "treasury",
    title: "Federal Treasury",
    summary: "Explainable budgets, receipts and guild supplies.",
    duties: [
      "Prepare approved repair, consumable and project budgets with activity organizers.",
      "Reconcile receipts and expenditure, preserving evidence and unresolved differences.",
      "Coordinate Finance Emissaries, bank managers and supply contacts."
    ],
    boundary: "Custody, spending approval and independent audit stay separate. The Treasurer appointment adds no native rank, bank permission or authority to resume paused gold services."
  },
  {
    key: "trading",
    rootId: "trading",
    title: "Trading & Markets",
    summary: "A dedicated High Council market specialist: Auction House and direct trades.",
    duties: [
      "Research executable prices, supply, demand, liquidity and sale timing instead of treating listing prices as earned value.",
      "Optimize permitted buying, selling and inventory within the Treasurer’s written capital, concentration and loss limits.",
      "Reconcile realized net trading profit after acquisition costs, fees and failed-auction deposits; report cash, stock age and exceptions weekly."
    ],
    boundary: "This portfolio does trading only. Treasury retains custody and spending approval; Audit stays independent. No dues, appeals, moderation, craft-commission management, paid rights or automatic bank access follow."
  },
  {
    key: "artisanry",
    rootId: "artisanry",
    title: "Association of Artisanry",
    summary: "Craft knowledge, professions and voluntary supply.",
    duties: [
      "Maintain opt-in profession coverage and connect requests with willing crafters.",
      "Coordinate recipes, materials and teaching across branches.",
      "Plan approved supply projects with War, Treasury and the Workshop."
    ],
    boundary: "Crafters choose their work and retain ownership of their materials. A directory listing does not prove recipe ownership, guarantee delivery or grant bank access."
  },
  {
    key: "heraldry",
    rootId: "heraldry",
    title: "Department of Heraldry",
    summary: "Guild identity, communications and participation.",
    duties: [
      "Coordinate approved news, branch announcements and accurate public identity.",
      "Support intake, recruitment communications and approachable member guidance.",
      "Arrange events, training and permitted media with their responsible organizers."
    ],
    boundary: "Publicity needs verified facts and appropriate consent. Private cases, chat logs and financial receipts stay outside publicity; a title grants no moderation or publishing access."
  },
  {
    key: "systems",
    rootId: "systems",
    title: "Systems and Addons Division",
    summary: "Shared technical support across the portfolios.",
    duties: [
      "Design and maintain the interfaces between the addon, website and Discord tools.",
      "Review privacy, compatibility and recovery plans before proposed releases.",
      "Help branch operators diagnose issues and verify installed versions."
    ],
    boundary: "The architect portfolio is classified with High Council; engineering support is Officer Corps. Titles grant no production, signing, platform, bank or protected game-action permission."
  }
].map(lane => Object.freeze({ ...lane, duties: Object.freeze(lane.duties) })));

export const ORGANIZATION_HISTORY205 = Object.freeze([
  {
    key: "core-portfolios",
    title: "Four original core departments",
    text: "The earlier poster grouped shared work into War, Treasury, Artisanry and Heraldry. That departmental story remains useful: combat preparation, resources, crafts and community each have a clear home, while their officers cooperate across portfolios."
  },
  {
    key: "shared-systems",
    title: "Systems as shared support",
    text: "The current organization includes Systems and Addons as a shared support division serving the portfolios and branches. Its technical remit is distinct from the four core ministries; classification and individually accepted authority remain separate."
  },
  {
    key: "olympus-kitchen",
    title: "Olympus Kitchen",
    text: "The poster illustrated an Artisanry initiative for food production and raid or PvP consumables, coordinated with War and Treasury. It is an example of a practical supply project, rather than a separate department or a claim that a staffed program is operating."
  },
  {
    key: "class-expertise",
    title: "Class Heads and specialist knowledge",
    text: "The poster placed Class Heads in an addon-only expertise panel. The current guides describe class coaching, builds, encounter advice and willing mentors as appointed expertise. This creates no extra native rank, compulsory build or command over a raid."
  },
  {
    key: "independent-review",
    title: "Independent justice and audit",
    text: "Justice hears conduct matters and appeals through unconflicted panels. The Bank Auditor reviews records independently of the people approving or holding the audited assets. Their separate review duties remain distinct from portfolio delivery and actual moderation or bank permissions."
  },
  {
    key: "branch-emissaries",
    title: "Emissaries connect the branches",
    text: "Branch emissaries bring local needs to the relevant portfolio and return approved guidance through their Guild Master. They coordinate without taking local command. Olympus I–X are directory scope placeholders; this overview establishes no officeholder or formed branch."
  }
].map(context => Object.freeze(context)));
