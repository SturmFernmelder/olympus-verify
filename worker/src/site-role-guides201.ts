/** Owner decision, 26 Oct 2026: describe every seat; Officer Corps, Council and royal seats are reserved.
 * This is a reading guide, never an appointment, vacancy feed, permission preset or application admission rule.
 * Legacy position copy is supplied by site-data after it has been built, avoiding a circular import and retaining
 * the detailed NA/EU raid commitments members already know. All strings are rendered as plain text. */
import { OFFICE_APPOINTMENTS, NATIVE_RANKS_199 } from './governance-offices';

export type RoleEligibility201 = 'reserved' | 'member' | 'raider' | 'artisan' | 'standing' | 'cosmetic';
export interface RoleGuide201 {
  readonly key: string;
  readonly label: string;
  readonly definition: string;
  readonly responsibilities: readonly string[];
  readonly expectations: readonly string[];
  readonly commitment: string;
  readonly worksWith: string;
  readonly boundaries: string;
  readonly eligibility: RoleEligibility201;
  readonly eligibilityNote: string;
  readonly nativeSlot?: number;
  readonly nativeRankOrdinal?: number;
}
type Content201 = readonly [definition: string, responsibilities: readonly string[], expectations: readonly string[], commitment: string, worksWith: string, boundary?: string];
const content201: Readonly<Record<string, Content201>> = {
  office_01: [
    'The Academy Lead turns a willing newcomer into a confident guildmate through practical training. The Academy teaches dungeon habits, raid preparation and guild procedures; it is a place to learn safely rather than a public ranking of weaker players.',
    ['Plan short teaching sessions with a clear skill to practise and an achievable group size.', 'Arrange mentors and demonstration groups, then check whether learners can repeat the task without prompting.', 'Keep beginner guides current when Forever encounters, professions or guild procedures change.'],
    ['Explain mistakes patiently and adapt the session for different levels of experience.', 'Publish the preparation and start time in advance; arrange cover when a teacher is absent.'],
    'Scheduled workshops plus preparation and a short follow-up with mentors.', 'Class Heads, Mentors, Raid Assists and the Events team.'
  ],
  office_02: [
    'An Addon Developer maintains the guild tools that run inside the game client. The work is dependable Lua, understandable player interfaces and careful compatibility testing, including the distinction between an informational display and a protected action that still needs a player key press.',
    ['Reproduce a reported problem and make the smallest reviewed change that addresses it.', 'Test loading, saved-data upgrades and the affected game-client workflows before proposing publication.', 'Document the exact addon version, changed behaviour and known limitations for officers and the publisher.'],
    ['Handle reports without asking members to post private credentials or account data.', 'Use reviewable commits and preserve failed tests instead of hiding them behind a version number.'],
    'Project-based development, with agreed availability around releases.', 'Systems Architect, Technical Envoys and the official addon publisher.', 'A contribution does not publish a CurseForge release, grant signing keys or authorize automated game actions.'
  ],
  office_03: [
    'The Addon / Discord Architect carries the alliance-wide Systems High Council remit and owns the design of the bridge between the addon, website and bot. The architect decides how identity, authority and failure states fit together, then makes those decisions explicit enough that another maintainer can operate and review them. Engineering support retains its separate Officer Corps scope.',
    ['Define versioned interfaces and compatibility plans before changing cross-system messages.', 'Review authentication, erasure, statement budgets and fail-closed behaviour across service boundaries.', 'Coordinate release evidence, incident handovers and a recovery plan that separates known outcomes from unknown provider states.'],
    ['Explain risks in language officers and members can understand.', 'Require independent review for consequential changes and never treat a website label as authority.'],
    'Continuing design stewardship and scheduled release reviews.', 'Addon Developer, Discord Engineers, Treasurer and the High Council.', 'Architecture approval alone cannot activate production providers, alter game permissions or replace the publisher’s adoption decision.'
  ],
  office_04: [
    'A Verified Alt is an additional character associated with an already known member. Alt standing helps the guild distinguish people from characters, account for its finite roster spaces and avoid giving one person multiple independent voices merely because they play several classes.',
    ['Use the supported character verification process and keep the association accurate.', 'Identify the main character when arranging raid attendance, crafts or branch placement.', 'Tell the responsible officer when an alt changes guild, is retired or no longer needs a roster place.'],
    ['Respect the same conduct and activity rules as the main character.', 'Accept branch-capacity review without treating verification as a guaranteed flagship slot.'],
    'No separate weekly service quota; maintain the character record when it changes.', 'Recruitment, branch officers and raid organizers.', 'Verification is not an automatic invite, promotion, second ballot or reserved place.'
  ],
  office_05: [
    'Alt / Social Member describes a relaxed way of participating through another character or through guild life outside a fixed raid roster. It distinguishes a player’s activity preferences from their worth to the community; social membership is not a lesser standard of conduct.',
    ['Use the appropriate main or alt identity when joining guild groups.', 'Respond honestly about availability instead of occupying a progression place you cannot use.', 'Help keep social chat, dungeon groups and casual events welcoming to new members.'],
    ['Observe branch capacity and published activity policies.', 'Do not claim raid priority, officer access or special loot treatment from a social label.'],
    'Play at your own pace; honour any specific event commitment you make.', 'Members, Community Officers and branch recruitment.'
  ],
  office_06: [
    'An Ambassador maintains an authorized relationship with another guild or community. The ambassador listens before promising, identifies where interests overlap and brings proposed agreements back to the people who can actually approve them.',
    ['Maintain a reliable contact for the assigned partner and pass on approved announcements.', 'Prepare joint-event proposals with clear times, conduct expectations and responsible organizers.', 'Record agreements and unresolved disputes so another liaison can take over without relying on rumours.'],
    ['Remain diplomatic when the other party is frustrated or critical.', 'Separate a personal opinion from an official Olympus commitment.'],
    'Regular partner check-ins and attendance at agreed diplomatic meetings.', 'Coalition Lead, Diplomatic Envoys and the affected Guild Masters.'
  ],
  office_07: [
    'An Artisan is a member who contributes craft knowledge and practical skill to the guild. The title recognizes useful work—making an item, teaching a recipe route or solving a materials problem—without implying that every Artisan controls the Workshop.',
    ['Describe the professions and recipes you genuinely offer in an opt-in listing.', 'Agree materials, any permitted in-game charge and delivery expectations before accepting a commission.', 'Correct or remove a listing when the recipe, availability or character changes.'],
    ['Protect a customer’s materials and explain delays before the promised handover.', 'Treat rare recipe holders and ordinary crafters fairly; do not present tips as compulsory dues.'],
    'Self-chosen commissions and voluntary teaching; no universal weekly quota.', 'Crafters, Profession Coordinator and the Workshop.', 'A directory listing does not prove recipe ownership, guarantee an order or grant bank access.'
  ],
  office_08: [
    'The Bank Auditor independently checks whether the guild’s books match its authorized spending. An auditor challenges gaps in evidence without also approving their own expenditure; the point is a traceable account of guild resources, not personal access to the vault.',
    ['Reconcile sampled deposits, withdrawals and appropriations against available records.', 'Flag missing receipts, unexplained adjustments and conflicts of interest for the responsible authority.', 'Publish a suitably redacted audit summary and track the response to each material finding.'],
    ['Remain independent of the transaction being reviewed and recuse from personal cases.', 'Distinguish a missing record from proof of theft and preserve the original evidence.'],
    'Periodic reconciliations plus agreed review of significant transactions.', 'Treasurer, Quartermaster and the Council of Justice.', 'Audit appointment grants no withdrawal permission or power to reverse a transaction.'
  ],
  office_09: [
    'The Bank Manager runs the practical organization of the guild bank under approved limits. This is the daily logistics job: members should be able to find the right stock, officers should know what is running low, and every movement should be explainable.',
    ['Organize tabs and stock categories according to the Guild Master’s approved setup.', 'Track demand for repairs, consumables and common crafting materials before supplies run out.', 'Record distributions and escalate unusual withdrawals or requests outside the approved purpose.'],
    ['Keep personal goods separate from guild stock.', 'Never promise a withdrawal limit or access level that has not been configured in game.'],
    'Regular stock checks, with additional preparation before raid nights.', 'Treasurer, Bank Stewards and the Quartermaster.'
  ],
  office_10: [
    'A Bank Steward handles an assigned part of bank custody, such as a tab, a replenishment list or a distribution session. The steward’s strength is careful routine: resources reach the intended group and another officer can understand what happened afterwards.',
    ['Check the assigned stock list and report shortages with quantities and intended use.', 'Distribute only goods and amounts within the recorded delegation.', 'Leave a handover of completed requests, pending deliveries and exceptions.'],
    ['Ask before improvising a new lending or reimbursement arrangement.', 'Be available for the distribution windows you accept and arrange cover if absent.'],
    'A defined tab or distribution rota rather than responsibility for the entire Treasury.', 'Bank Manager, Quartermaster and raid supply contacts.'
  ],
  office_11: [
    'Bench is a raid-roster status for a prepared player who is not in the current group. It allows organizers to rotate fairly and keep a reliable substitute list; it is not a punishment or a promise that a particular boss will have a space.',
    ['Tell the organizer whether you can remain available and how to reach you.', 'Keep the agreed character prepared if you accept substitute duty.', 'Update your status promptly when you leave or become unavailable.'],
    ['Respect the published rotation and loot rules.', 'Expect a clear reason for selection decisions and raise concerns through the raid lead rather than disrupting the raid.'],
    'Only the standby period explicitly agreed with the raid organizer.', 'Raid Leader, Raid Assists and Class Leads.', 'Bench status does not certify attendance, guarantee loot or authorize someone else to use your account.'
  ],
  office_12: [
    'A Broadcaster shares guild play with an audience while protecting the people who did not choose to be on a broadcast. The title identifies a privacy-sensitive activity, with Stream Shield available only through its separate current account and appointment checks.',
    ['Agree recording or streaming expectations with the organizer before the event.', 'Use Stream Shield and check the visible scene before showing guild pages or private communications.', 'Stop or change the scene when a participant reports unintended exposure.'],
    ['Respect a member’s refusal to appear and keep confidential officer matters off stream.', 'Present clips and incidents with context instead of directing an audience at a player.'],
    'Preparation before each broadcast and an accessible contact during the session.', 'Content Representatives, event organizers and Heraldry.', 'A Broadcaster title is not automatic Stream Shield authorization, moderation power or permission to publish private information.'
  ],
  office_13: [
    'Casual describes a member whose play time is flexible rather than tied to progression attendance. A casual player can still be an excellent dungeon partner, teacher or event participant; the label sets expectations so nobody mistakes enthusiasm for an undeclared raid commitment.',
    ['Choose events that fit your actual availability and keep sign-ups current.', 'Contribute to a friendly guild atmosphere in chat and groups.', 'Ask for help with game or guild procedures before an avoidable misunderstanding grows.'],
    ['Follow the same conduct rules as progression players.', 'Respect that some teams need a fixed schedule without treating their invitation as a general membership entitlement.'],
    'No fixed minimum; any accepted group reservation should still be honoured.', 'Social Members, Mentors and Community Officers.'
  ],
  office_14: [
    'The Chief of Intake carries the alliance-wide High Council intake remit and leads the admission policy and the people applying it. The Gatekeeper balances a welcoming first contact with fair capacity decisions, consistent identity checks and a process that does not quietly privilege an officer’s friends. Branch Recruiters retain their local guidance and capacity handovers.',
    ['Set a clear intake workflow, waiting-list handover and escalation route for difficult cases.', 'Review recruitment outcomes across branches for inconsistent standards or unexplained delays.', 'Train recruiters on publication consent, evidence handling and the distinction between a request and an approved invite.'],
    ['Explain an admission standard before using it to judge an applicant.', 'Protect private applicant information and separate personal sponsorship from an official decision.'],
    'Recurring intake reviews, recruiter support and busier periods around launch.', 'Recruitment Lead, branch Guild Masters and High Council.'
  ],
  office_15: [
    'The Chief of Staff makes leadership work move from a discussion to an owned task. The office is an organizer and a dependable handover point, keeping priorities, deadlines and responsibilities visible without becoming a substitute decision-maker for every department.',
    ['Prepare leadership agendas with the decisions needed, supporting material and responsible owner.', 'Track agreed actions and identify conflicting deadlines or missing cover.', 'Keep a concise handover so urgent work can continue when a leader is unavailable.'],
    ['Chase commitments respectfully and report a real blocker rather than a cosmetic status.', 'Keep confidential papers within their approved audience.'],
    'Frequent short coordination checks and preparation for leadership meetings.', 'Co-Guild Master, Department Heads and Deputies.'
  ],
  office_16: [
    'The Chief Strategist turns research into plans that a raid team can actually execute. The role compares encounter evidence and alternative tactics, then gives the Raid Leaders a clear recommendation with assumptions and fallback options rather than an untested theory.',
    ['Research Forever encounter changes and record the source and version of each claim.', 'Develop assignments, positioning notes and recovery options with the relevant class specialists.', 'Review results after progression attempts and update a plan when evidence contradicts it.'],
    ['Separate a proven mechanic from speculation or a strategy copied from a different ruleset.', 'Invite practical feedback from the people carrying out the assignments.'],
    'Research before progression nights and short post-raid analysis.', 'War Head, Raid Leaders, Class Heads and Scouts.'
  ],
  office_17: [
    'A Class Head coordinates the guild’s support for one class across its raid groups. The Head maintains a consistent standard of advice, develops mentors and resolves differences between teams without turning personal build preference into an unexplained rule.',
    ['Maintain class guidance for gear, consumables and relevant Forever mechanics.', 'Coordinate class mentors and identify training needs across regions.', 'Discuss class composition and performance concerns with Raid Leaders using specific examples.'],
    ['Know the class well enough to explain alternatives and their trade-offs.', 'Coach privately and fairly; never use meters alone to humiliate or exclude someone.'],
    'Regular class support and scheduled coordination with raid leadership.', 'Regional Class Leads, Mentors and the War Council.'
  ],
  office_18: [
    'A Class Lead is the practical point of contact for players of a particular class. Leads help people arrive prepared, understand their assignments and improve between raids, while giving organizers useful class-specific advice about what the group can reasonably do.',
    ['Review class preparation, buffs, dispels, interrupts and other encounter assignments.', 'Offer specific feedback and a realistic improvement plan when a player asks or a raid problem needs attention.', 'Coordinate with other regions so useful class knowledge does not stay in one raid group.'],
    ['Remain approachable and explain why advice fits the current encounter.', 'Disclose uncertainty and check Forever changes before presenting an old guide as authoritative.'],
    'Raid preparation and recurring class questions; agree regional coverage.', 'Class Head, Raid Leaders, Raid Assists and Mentors.'
  ],
  office_19: [
    'The Co-Guild Master is the Guild Master’s appointed second in command and a High Council appointment. The Co-GM keeps leadership continuous, mediates disputes between departments and ensures a delegated decision still has a clear owner and record.',
    ['Coordinate the departments against the Guild Master’s approved priorities.', 'Chair agreed leadership discussions and record decisions, dissent and follow-up work.', 'Stand in only within the delegation actually given, escalating exceptional or irreversible matters.'],
    ['Be available consistently and give advance notice when cover is needed.', 'Use discretion without turning private consultation into secret, unaccountable policy.'],
    'A substantial continuing leadership commitment, agreed directly with the Guild Master.', 'Guild Master, Chief of Staff, Treasurer and Department Heads.', 'Co-GM is an appointment, not an eleventh native rank or automatic access to signing keys, bank funds or another branch’s controls.'
  ],
  office_20: [
    'The Coalition Lead coordinates Olympus’s relationships with allied guilds as a whole. Rather than handling every conversation personally, the Lead makes sure ambassadors and branch representatives work from compatible commitments and do not promise the same resources twice.',
    ['Maintain the approved alliance agenda and assign clear diplomatic contacts.', 'Coordinate proposed joint raids, events and dispute discussions across branches.', 'Bring agreements requiring leadership authority to the appropriate Council or Guild Master.'],
    ['Represent other branches accurately and let their Guild Masters approve commitments affecting them.', 'Preserve a written distinction between a proposal, a handshake and an adopted agreement.'],
    'Regular alliance coordination and additional cover during joint events.', 'Ambassadors, Emissaries and branch Guild Masters.'
  ],
  office_21: [
    'The Community & Events Lead makes Olympus more than a raid roster through social nights, contests and shared adventures. A good event has an approachable invitation, a realistic organizer and enough structure that quieter members know how to take part.',
    ['Maintain a calendar of varied events and recruit organizers who can actually attend.', 'Announce the rules, timing and any participation limits before sign-ups open.', 'Collect feedback afterwards and adjust future events for accessibility, time zones and interest.'],
    ['Follow through on announcements or cancel early with a clear explanation.', 'Keep events welcoming without allowing harassment to be excused as banter.'],
    'About 4 to 8 hours a week, depending on the calendar.', 'Event Coordinators, Community Officers, Moderators and Leveling Lead.'
  ],
  office_22: [
    'A Community Officer looks after the everyday experience of members in a branch or agreed group. The job is to notice people being left out, connect them with activities and bring recurring problems to the people who can solve them.',
    ['Welcome newcomers and explain where ordinary guild questions belong.', 'Help form social or dungeon groups without displacing event organizers.', 'Escalate repeated conduct or welfare concerns through the appropriate private route.'],
    ['Listen before assuming that a quiet member is disengaged or that a disagreement needs punishment.', 'Respect privacy and do not promise confidentiality you cannot maintain in a serious safety case.'],
    'Regular short check-ins across the branch’s active hours.', 'Community Lead, Welfare Lead, Mentors and Moderators.'
  ],
  office_23: [
    'A Content Creator produces guides, videos, images or stories about guild play. The title recognizes creative participation; it does not turn another member’s name, voice, artwork or private conversation into material that can be published without agreement.',
    ['Explain the purpose and intended audience before recording or requesting contributions.', 'Check facts, attribution and permission for identifiable player material.', 'Correct an error or remove an unwanted personal appearance through the agreed editorial route.'],
    ['Keep ordinary creative opinion separate from an official guild announcement.', 'Avoid misleading edits and never encourage an audience to target a member.'],
    'Voluntary project-based work, with deadlines only for commissions you accept.', 'Media Leads, Broadcasters and Heraldry.'
  ],
  office_24: [
    'A Content Representative is the contact between an event, its participants and an approved broadcast or recording team. The Stream Rep helps the event remain playable while giving creators accurate information and respecting members’ choices about exposure.',
    ['Confirm which parts of an event may be shown and relay that scope to creators.', 'Coordinate a practical contact for scene problems, delays or participant objections.', 'Route requests for clips, quotes and follow-up material to the people concerned.'],
    ['Keep private raid or officer channels outside the agreed public coverage.', 'Respond promptly during the production window and avoid promising consent on another person’s behalf.'],
    'The agreed event or production window, including a short preparation meeting.', 'Broadcasters, event organizers and Media & Communications Lead.'
  ],
  office_25: [
    'A Core Raider makes a continuing commitment to a progression team rather than simply attending occasional raids. Reliability includes preparation, notice of absences and constructive work between attempts; core status does not make a player immune to the published rotation rules.',
    ['Keep raid sign-ups accurate and give early notice of absences.', 'Bring the gear, consumables and encounter preparation required for the assigned role.', 'Review specific feedback and practise agreed improvements before the next progression session.'],
    ['Communicate calmly during wipes and accept the published loot and bench procedures.', 'Be honest about a schedule change before it becomes a pattern of missed starts.'],
    'The team’s agreed recurring raid nights, plus personal preparation.', 'Regional Raid Leader, Raid Assists and Class Lead.'
  ],
  office_26: [
    'The Head of Justice carries the alliance-wide High Council remit for Justice administration and an unconflicted review route. The Council of Justice hears contested conduct matters with a fair process: establish what the evidence supports, hear the affected sides and give a reasoned outcome, rather than reward the loudest accusation or revisit a case through public pressure. Individual panel designation remains separate; hearing-panel service gives no blanket Council membership, eligible vote, case access or enforcement power.',
    ['Identify the rule, allegation, relevant evidence and appropriate hearing scope.', 'Give affected parties a reasonable chance to respond and record recusals for conflicts.', 'Issue reasons, proportionate remedies and the available appeal route within the adopted procedure.'],
    ['Keep evidence private to its authorized audience and distinguish testimony from proven fact.', 'Do not promise a gold pardon, overturn platform enforcement or sit in judgment on your own dispute.'],
    'Case preparation, attended hearings and timely written outcomes.', 'Privy Council, Moderation, Treasurer where receipts are relevant, and the designated appeal authority.'
  ],
  office_27: [
    'A Crafter offers a specific profession service to other members. The useful promise is precise—what can be made, what materials are needed and when the crafter can meet—so a request does not become an assumption that any listed player is always on call.',
    ['List only recipes and services you can genuinely provide.', 'Check materials, character, location and delivery arrangements with the requester.', 'Return unused entrusted materials and settle a cancelled order transparently.'],
    ['Keep availability current and answer accepted requests within the agreed time.', 'Never imply a rare recipe, tip or Workshop badge grants authority over another player.'],
    'Opt-in orders at times the crafter agrees.', 'Artisans, Profession Coordinator and members requesting commissions.', 'The Workshop is a directory, not an escrow service or proof that an item has been delivered.'
  ],
  office_28: [
    'A Department Head is responsible for a whole portfolio and the officers serving it. The Head sets priorities, assigns work and accounts for the result to the High Council, while preserving the independent responsibilities of auditors, hearing officers and branch Guild Masters.',
    ['Define a practical remit and service expectations for each subordinate office.', 'Review workload, unresolved risks and succession cover at regular portfolio meetings.', 'Present decisions needing cross-department resources with a clear recommendation and alternatives.'],
    ['Explain how decisions serve members and disclose relevant personal interests.', 'Delegate with limits and review the work without claiming every subordinate action as a Council decision.'],
    'A continuing portfolio commitment with planned reviews and urgent cover.', 'High Council, Chief of Staff and the relevant branch representatives.'
  ],
  office_29: [
    'A Deputy provides continuity for a named leader or office. The role is useful because the delegation is explicit: everyone should know which routine work the Deputy can handle, which matters wait for the principal and what happens when both are unavailable.',
    ['Maintain the current handover and understand the principal’s pending decisions.', 'Carry out only the tasks included in the recorded delegation.', 'Report actions taken in cover and return responsibility cleanly when the principal resumes.'],
    ['Be contactable for the cover periods you accept.', 'Do not treat temporary cover as a permanent promotion or a blank authority to change policy.'],
    'An agreed cover rota and preparation with the principal.', 'The appointing principal, Chief of Staff and affected department.'
  ],
  office_30: [
    'A Diplomat handles a defined relationship or negotiation for Olympus. This is patient, evidence-based conversation: understand the other side’s concern, state the approved guild position and take unresolved choices back to the person authorized to settle them.',
    ['Prepare the objective, facts and limits before a diplomatic meeting.', 'Communicate proposals accurately and record what remains conditional.', 'Give leadership a concise report of commitments, disagreements and next steps.'],
    ['Keep a calm tone even when speaking about a disputed incident.', 'Never trade another branch’s resources or a member’s privacy for an informal concession.'],
    'Assigned meetings and follow-up, with availability agreed for the relationship.', 'Ambassador, Coalition Lead and relevant Guild Master.'
  ],
  office_31: [
    'A Diplomatic Envoy carries a particular approved message or short mission between communities. Unlike a continuing ambassadorial portfolio, an envoy’s assignment should have a clear endpoint and a clear statement of what may be negotiated.',
    ['Deliver the approved message without adding personal promises.', 'Confirm that the recipient understood the proposal and collect their response.', 'Report completion, obstacles and any request that exceeds the mission’s instructions.'],
    ['Be punctual and precise about names, dates and conditions.', 'Treat access to another community as hospitality rather than a right to intervene in its internal decisions.'],
    'A bounded diplomatic assignment with an agreed reporting deadline.', 'Diplomat, Ambassador and the sending authority.'
  ],
  office_32: [
    'A Discord Engineer maintains the technical structure of the guild’s Discord integration. The work is permissions, bot configuration and dependable operation, with the understanding that a technical ability to make a change is not itself permission to change community policy.',
    ['Prepare and review channel, role or bot changes against least-privilege requirements.', 'Test affected flows and retain an exact record of configuration changes.', 'Investigate failures without printing tokens, private messages or member data into public logs.'],
    ['Use the approved deployment and rollback process rather than live experimentation.', 'Keep two-factor protection and handover documentation appropriate to the access held.'],
    'Planned maintenance and agreed incident cover.', 'Systems Architect, Moderation Leads and the server owner.', 'Engineering access is separately assigned; a directory title cannot grant Manage Roles, Administrator or a bot token.'
  ],
  office_33: [
    'A Discord Moderator keeps the Olympus channels usable and civil within Asmongold’s server rules. Moderation is an accountable service: intervene in spam or abuse, record why an action was taken and know when the server’s own moderation team must decide.',
    ['Handle reports and remove spam, scams or abuse using approved server procedures.', 'Record relevant evidence and the reason for a warning, timeout or escalation.', 'Pass in-game disputes to the appropriate guild officers instead of inventing a Discord sanction for every disagreement.'],
    ['Use two-factor authentication, remain impartial and recuse from personal disputes.', 'Do not argue a case publicly or promise an unban outside your actual authority.'],
    'Regular checking across agreed active hours, not an expectation of permanent availability.', 'Server moderators, Council of Justice and Community Officers.'
  ],
  office_34: [
    'An Emissary represents one branch in an agreed alliance portfolio. The office prevents a large federation from losing local context: a branch’s needs, constraints and decisions should reach the wider guild accurately, and alliance decisions should return with useful explanations.',
    ['Maintain a current contact and handover for the represented branch.', 'Bring local questions to the appropriate portfolio with the Guild Master’s context.', 'Relay adopted decisions and identify implementation questions before claiming the branch is ready.'],
    ['Represent the branch honestly, including disagreement or missing evidence.', 'Avoid acting as a second Guild Master or promising access on the branch’s behalf.'],
    'Regular liaison check-ins and attendance at relevant portfolio meetings.', 'Branch Guild Master and the corresponding alliance Minister.'
  ],
  office_35: [
    'The Emissary of Artisanry connects a branch’s crafters to the wider Workshop. The focus is practical supply and recipe knowledge, gathered with each crafter’s agreement, so rare skills can serve the alliance without making their owner a permanent public service desk.',
    ['Collect opt-in profession availability and identify missing craft coverage.', 'Coordinate materials or teaching requests with the branch’s Profession Coordinator.', 'Report Workshop issues and return approved guidance to local crafters.'],
    ['Keep a listing’s claims and availability current rather than assuming yesterday’s recipe access.', 'Respect the crafter’s choice to decline work or remove a directory entry.'],
    'Periodic directory reviews and agreed project coordination.', 'Minister of Artisanry, local crafters and Quartermaster.'
  ],
  office_36: [
    'The Emissary of Finance is the branch contact for Treasury questions and approved financial reports. The role makes local needs visible to the Federal Treasury while keeping custody, approval and audit as distinct responsibilities.',
    ['Compile the branch’s approved spending requests with purpose and supporting evidence.', 'Relay financial policy and clarify which officer can approve each kind of expenditure.', 'Track outstanding queries and reconcile reported transfers with the responsible custodians.'],
    ['Never mix personal gold with an official report or imply custody you do not hold.', 'Disclose a personal benefit in a request and preserve missing evidence as an open issue.'],
    'Regular reporting periods and additional coordination for approved projects.', 'Treasurer, branch Guild Master, Bank Manager and Bank Auditor.'
  ],
  office_37: [
    'The Emissary of Heraldry carries branch news, identity and publication concerns to Heraldry. The role helps announcements stay recognizable and accurate while ensuring that a local event, player image or branch position is not published under an invented approval.',
    ['Gather approved local announcements and verify dates, links and named contributors.', 'Coordinate consent for quotations, identifiable images and participant appearances.', 'Report corrections promptly and relay the final publication back to the branch.'],
    ['Separate a draft from an approved announcement.', 'Use current guild artwork and attribution without claiming ownership of third-party game art.'],
    'A regular news handover and event-specific editorial deadlines.', 'Minister of Heraldry, Correspondents and branch organizers.'
  ],
  office_38: [
    'The Emissary of War represents a branch’s raid and organized combat needs to the War portfolio. Accurate local capacity matters more than impressive numbers: the alliance needs to know which teams are prepared, which times work and where additional support is wanted.',
    ['Collect the branch’s agreed raid schedule, composition needs and training requests.', 'Coordinate proposed shared activities with the local Raid Leaders before making commitments.', 'Return strategy updates and identify differences in the branch’s actual readiness.'],
    ['Report uncertain roster or attendance information as uncertain.', 'Respect local raid command and do not allocate another team’s players or loot.'],
    'Coordination around planned raid weeks and cross-branch events.', 'War Head, branch Guild Master, Raid Leaders and Class Heads.'
  ],
  office_39: [
    'An Event Coordinator takes an approved event from idea to a playable plan. This is the logistics role: reserve a suitable time, make joining instructions understandable and ensure someone is responsible when the event starts.',
    ['Prepare timing, location, sign-up limits and a realistic plan for late arrivals.', 'Arrange helpers, announcements and any approved prizes before publishing the invitation.', 'Close the event with results, returned materials and a brief note of lessons learned.'],
    ['Communicate changes early and cancel honestly when an organizer or resource is missing.', 'Design participation rules that newcomers can understand without private officer guidance.'],
    'Preparation and attendance for the events accepted.', 'Community & Events Lead, Event Officers and Heraldry.'
  ],
  office_40: [
    'An Event Officer runs the assigned part of an event on the day. The office provides a clear point for questions and practical decisions so the organizer can focus on the whole event rather than every late arrival, group change or rules query.',
    ['Brief participants on the published rules and the event’s contact points.', 'Manage the assigned groups, checkpoints or sign-in tasks during the event.', 'Record incidents or disputed results and send them to the organizer for review.'],
    ['Arrive early enough to understand the plan and test what you will use.', 'Apply the published rules consistently rather than making exceptions for friends.'],
    'The event’s setup, running time and agreed debrief.', 'Event Coordinator, Moderators and volunteer helpers.'
  ],
  office_41: [
    'Final Authority identifies the reserved endpoint for decisions the guild constitution places with its sovereign leadership. It is an accountability statement about who settles a matter, not a general invitation for every dispute to skip ordinary officers and procedures.',
    ['Decide escalated matters within the adopted constitutional remit.', 'Make the operative decision and its limits clear to the officers carrying it out.', 'Provide continuity or a lawful delegation when the decision-maker is unavailable.'],
    ['Hear relevant advice and distinguish a personal preference from an adopted guild rule.', 'Respect platform enforcement and the independent authority of other communities.'],
    'Reserved leadership responsibility rather than an advertised service vacancy.', 'Sovereign, Co-Guild Master and High Council.', 'This descriptive title creates no additional native rank and grants no website, signing or provider permission.'
  ],
  office_42: [
    'Founder records the person or office associated with establishing Olympus and its continuing identity. Founding recognition is distinct from the current operational job of running a branch, judging a case or administering the bank.',
    ['Preserve the guild’s founding purpose and explain significant changes in direction.', 'Support an orderly relationship between ceremonial identity and current operational leadership.', 'Make any active delegation explicit so members know which decisions have actually been entrusted to others.'],
    ['Avoid presenting historical prestige as an undocumented override of adopted process.', 'Give current officers enough clarity to carry out their assigned work.'],
    'Reserved founding stewardship; the title itself has no rota.', 'Sovereign, Guild Masters and High Council.', 'Founder recognition alone does not certify an in-game rank, ownership of another server or a current technical credential.'
  ],
  office_43: [
    'A Guild Master leads an individual Olympus branch and holds responsibility for that guild’s in-game configuration. The job combines people, capacity and permissions: a branch must be welcoming and organized while remaining accountable to the alliance’s adopted direction.',
    ['Set the branch’s native ranks and permissions in an attended game session.', 'Appoint and review local officers, succession cover and member-capacity decisions.', 'Bring branch needs and serious incidents to the appropriate alliance leadership.'],
    ['Remain reliably available or name an authorized cover arrangement.', 'Explain consequential decisions and review bank, invite and removal permissions carefully.'],
    'A sustained branch-leadership commitment, including coordination outside raid nights.', 'Co-Guild Master, branch officers, Emissaries and other Olympus Guild Masters.', 'This reserved appointment is not an application vacancy and does not certify that the game’s permissions have already been configured.'
  ],
  office_44: [
    'A Guild Recruiter is the local first contact for people joining a particular branch. The recruiter explains what the branch can offer, checks the appropriate admission steps and helps a newcomer reach a real organizer without promising space that the roster cannot support.',
    ['Answer admission questions using current branch and guild guidance.', 'Keep waiting-list and introduction handovers accurate for the recruitment team.', 'Help an approved newcomer find orientation, verification and the right activity contacts.'],
    ['Be fair to applicants regardless of friendship or audience size.', 'Treat uncertain capacity as unknown and keep private applicant information private.'],
    'Regular recruitment windows agreed with the local officers.', 'Recruitment Officer, Trial Officers and branch Guild Master.'
  ],
  office_45: [
    'High Council is the reserved governing tier below Leader, with portfolios and decisions defined by the adopted charter. Council membership is a leadership appointment, not a reward for popularity, gold, raid performance or filling out a public application.',
    ['Review policy and significant cross-branch decisions with the relevant evidence.', 'Account for the work of an assigned portfolio and surface unresolved risks.', 'Record conflicts, recusals and the actual decision rather than implying unanimous agreement.'],
    ['Exercise restraint with confidential information and explain member-facing outcomes.', 'Respect the difference between Council membership, an individual warrant and a technical signing capability.'],
    'Continuing leadership service and regular Council business.', 'Leader, Co-Guild Master, Ministers and branch Guild Masters.', 'The native planning association is rank 2, zero-based slot 1; publication applies no rank, bank limit, Discord role or signing key.'
  ],
  office_46: [
    'Honorary / Emeritus recognizes past service or a valued advisory relationship. It preserves the contribution without silently keeping the powers of a former office active, allowing a new holder to carry the operational responsibility clearly.',
    ['Offer historical context or advice when invited by the current responsible officer.', 'Make it clear when speaking personally rather than for a former department.', 'Direct operational requests to the current holder instead of continuing an unofficial parallel office.'],
    ['Respect current decisions and confidentiality attached to past service.', 'Correct any impression that the honorary title still grants automatic access or command.'],
    'Advisory and voluntary; no standing operational duty follows from recognition.', 'Current officeholders and the appointing leadership.', 'Emeritus is not a live appointment, voting credential or retained bank permission.'
  ],
  office_47: [
    'Inactive is a roster or participation status, not a judgment about a member’s character. The status helps officers make honest capacity decisions when a branch has limited places and a player is no longer taking part under the published activity policy.',
    ['Provide notice of a planned absence through the appropriate ordinary channel when possible.', 'Check the current return or re-entry procedure before assuming an old roster place remains available.', 'Update attendance commitments if returning to a regular raid team.'],
    ['Expect officers to use the published policy and available evidence rather than inventing an absence date.', 'Do not treat inactivity as an extra native rank or a permanent ban.'],
    'No service quota while inactive; follow the applicable return process.', 'Branch officers and Recruitment.', 'The label alone performs no removal, erasure, role change or guarantee of readmission.'
  ],
  office_48: [
    'Initiate is the first step in the ten-rank plan for a newly welcomed character. The purpose is orientation: learn the guild’s conduct, find the right groups and complete the applicable identity steps before anyone assumes you know every procedure.',
    ['Read the current guild rules and ask where unclear procedures are explained.', 'Use the supported verification process for the character you intend to play.', 'Introduce your interests and availability honestly so officers can direct you to suitable groups.'],
    ['Treat members respectfully and accept basic guidance.', 'Do not assume that a submitted application, website login or time served automatically promotes a character.'],
    'An introductory period determined through the ordinary branch process, not a promised timer.', 'Recruiters, Mentors and branch officers.'
  ],
  office_49: [
    'The Intelligence / Scouting Lead organizes lawful in-game observation for planned activities. Scouting should provide useful information about routes, encounter conditions or event readiness; it must not become an excuse to collect personal information or direct harassment.',
    ['Give scouts a clear observation task, reporting format and endpoint.', 'Check the time, game version and reliability of reports before passing them to organizers.', 'Combine findings into practical route or strategy notes and identify uncertainty.'],
    ['Use information available through permitted gameplay and respect participant privacy.', 'Do not portray an unverified rumour or a stale observation as current enemy intent.'],
    'Bounded scouting assignments and preparation for agreed events.', 'Chief Strategist, War Head and relevant raid or event leaders.'
  ],
  office_50: [
    'The Lead Correspondent coordinates the branch news network and the editorial handover to Town Crier. The job is to help members learn what actually happened and what is coming next, with a clear distinction between an approved notice, an opinion and an unverified report.',
    ['Commission or collect reports from branch correspondents with a clear deadline.', 'Check names, dates, links and permission before approving a news draft.', 'Coordinate corrections and keep a record of what was approved for publication.'],
    ['Avoid publishing allegations or identifying member details without the appropriate basis.', 'Use any Town Crier editing capability only after the separate current-account and privacy checks.'],
    'Regular editorial handovers plus cover for major announcements.', 'Per-Guild Correspondents, Minister of Heraldry and event organizers.', 'This reserved title alone does not grant Town Crier access, webhook control or permission to send an automatic mention.'
  ],
  office_51: [
    'The Loot Council resolves contested drops under the published loot policy. Its legitimacy comes from consistent criteria, timely explanations and visible recusals, especially when a council member or close friend is interested in the same item.',
    ['Review eligible requests against the published priorities and the raid’s actual needs.', 'Record the awarded item and the reason for a contested decision.', 'Explain rulings politely and refer a procedural appeal through the agreed raid process.'],
    ['Step aside from decisions involving your own loot or a material personal conflict.', 'Do not change criteria after the item drops or use an award as a personal favour.'],
    'Raid nights and maintenance of the relevant loot record.', 'Raid Leaders, Class Leads and the designated appeal authority.'
  ],
  office_52: [
    'The Marshall coordinates orderly execution of an assigned organized combat activity. The appointment is about readiness, group movement and clear command handovers; it does not create a second sovereign authority over every raid or a license to compel participation.',
    ['Translate the approved event plan into group assignments and assembly instructions.', 'Confirm that leaders, support roles and communication channels are ready before starting.', 'Report changes, losses or obstacles to the event’s command and organize an orderly finish.'],
    ['Give concise calls and preserve a calm channel during disruption.', 'Respect the event’s opt-in scope, published conduct and designated commander.'],
    'The preparation and running window of the appointed activity.', 'War Head, Raid Leaders, PvP Captains and Emissaries of War.'
  ],
  office_53: [
    'The Media & Communications Lead coordinates how Olympus speaks across announcements, guides and creative coverage. The Lead keeps the message understandable and consistent while making sure a guild brand does not erase the rights or choices of individual contributors.',
    ['Maintain an editorial calendar and assign clear owners for official communications.', 'Review major announcements for accuracy, audience, consent and accessibility.', 'Coordinate prompt corrections and preserve a useful handover of approved drafts.'],
    ['Separate official statements from member-created opinion.', 'Respect game-art attribution, contributor credit and a member’s request not to appear.'],
    'Regular editorial planning and additional work around major events.', 'Minister of Heraldry, Media Lead, Correspondents and Broadcasters.'
  ],
  office_54: [
    'The Media Lead manages the practical production of approved media projects. The focus is turning a brief into usable work: collect assets, organize contributors and deliver a finished guide, clip or graphic that matches the agreed event and audience.',
    ['Write a clear brief with deliverables, deadline and publication destination.', 'Coordinate creators and confirm permission for footage, voices and identifiable appearances.', 'Review the finished work for accuracy and hand it to the authorized publisher.'],
    ['Keep source material orderly and do not circulate unused private footage casually.', 'Set realistic deadlines and communicate missing assets before delivery fails.'],
    'Project-based production and agreed event coverage.', 'Content Creators, Stream Representatives and Media & Communications Lead.'
  ],
  office_55: [
    'A Member is a participant in Olympus guild life, whether their interests are leveling, dungeons, raids, crafting or conversation. Membership is the shared foundation of the guild; choosing a quieter activity does not create a separate standard of respect.',
    ['Keep the appropriate character and Discord association accurate through supported verification.', 'Honour group commitments and help other members when you reasonably can.', 'Follow conduct, branch-capacity and published activity policies.'],
    ['Treat people respectfully in game and on Discord.', 'Recognize that membership does not itself guarantee a raid place, promotion or bank withdrawal.'],
    'No universal minimum play time; specific teams may agree their own attendance.', 'Recruitment, Mentors, activity organizers and fellow members.'
  ],
  office_56: [
    'A Mentor helps another player become independent rather than making every decision for them. Mentoring can cover a class, a dungeon, a profession or guild procedures, with a clear learning goal and permission to ask questions without ridicule.',
    ['Agree what the learner wants to improve and demonstrate the relevant technique.', 'Offer concrete, manageable feedback and let the learner practise it.', 'Refer questions outside your knowledge to an appropriate specialist instead of guessing.'],
    ['Be patient, reliable for the sessions you accept and respectful of a learner’s pace.', 'Keep private difficulties private and avoid promising raid selection or promotion.'],
    'Voluntary teaching sessions and a realistic follow-up arrangement.', 'Academy Lead, Class Leads, Artisans and new members.'
  ],
  office_57: [
    'A Minister carries a reserved High Council portfolio under the guild’s statutory structure. The Minister is accountable for a particular public service and its officers, rather than holding a decorative title that can be invoked to overrule unrelated departments.',
    ['Publish the portfolio’s remit, responsible officers and route for ordinary requests.', 'Bring policy, budget or cross-branch issues to Council with supporting evidence.', 'Review delivery, conflicts and succession so the service survives one holder’s absence.'],
    ['Explain material decisions to the members affected.', 'Keep ceremonial standing, delegated authority and technical permissions distinct.'],
    'Continuing portfolio leadership and Council review.', 'Leader, Co-Guild Master, Department Heads and branch Emissaries.'
  ],
  office_58: [
    'The Minister of Artisanry carries the alliance-wide High Council remit for the Workshop and profession policy. The task is to grow access to knowledge and dependable crafts while preserving each crafter’s choice, rare-recipe stewardship and the line between a directory entry and an actual transaction.',
    ['Coordinate profession coverage, teaching priorities and cross-branch craft requests.', 'Set clear Workshop listing and commission-handling expectations.', 'Review reported craft disputes and refer custody or conduct questions to the proper authority.'],
    ['Do not promise a rare recipe or another player’s labour without agreement.', 'Keep procurement, featured recognition and any paused gold schedules distinct from office authority.'],
    'Regular Workshop coordination and planned guild crafting projects.', 'Profession Coordinators, Artisanry Emissaries and Treasurer.'
  ],
  office_59: [
    'The Minister of Heraldry carries the alliance-wide High Council remit for public identity and official communications. Heraldry joins words, symbols and announcements so members can recognize what is adopted, what is a draft and what is simply another player’s creative work.',
    ['Maintain approved guild identity and publication standards.', 'Coordinate alliance announcements, branch news and corrections through named editors.', 'Review privacy and consent questions arising from broadcasts, quotations or public event coverage.'],
    ['Give accurate credit for official and third-party artwork.', 'Avoid implying that an announcement appoints a person or activates a technical service.'],
    'Continuing editorial oversight and major-announcement review.', 'Lead Correspondent, Media & Communications Lead and Heraldry Emissaries.'
  ],
  office_60: [
    'A Moderator is an appointed conduct officer for a specifically defined space or activity. The mandate should identify where the moderator acts, which tools they may use and who reviews a contested action, instead of implying power over every guild or platform.',
    ['Receive reports and establish the applicable rules and immediate safety need.', 'Use proportionate action within the actual assigned permissions.', 'Record evidence and reasons, then provide the relevant review or appeal route.'],
    ['Remain calm, impartial and willing to recuse from personal matters.', 'Never treat an accusation, a title or a technical capability as proof of authority.'],
    'Agreed coverage for the assigned channel, branch or event.', 'Discord Moderators, Community Officers and Council of Justice.'
  ],
  office_61: [
    'Muted is a restricted communication status arising from a particular platform or guild procedure. It is not an office, a joke title to assign casually or proof that every allegation against the affected person has been established.',
    ['Follow the stated restriction while seeking clarification through the permitted route.', 'Keep any appeal relevant to the action, evidence and applicable rule.', 'Avoid bypassing a restriction through alts, another account or a proxy.'],
    ['Expect an authorized moderator to explain the scope and any available review.', 'Do not assume a website label proves the current Discord permission state or a permanent outcome.'],
    'The duration and review conditions of the actual authorized action.', 'The responsible moderators and, where applicable, the appeal authority.', 'This display status does not itself issue a timeout, alter Discord permissions or erase appeal rights.'
  ],
  office_62: [
    'An Officer administers an agreed part of the guild beneath the High Council. The officer’s value is reliable service—recruitment, raids, community or another defined remit—with clear limits and an accountable handover rather than general command over every member.',
    ['Carry out the assigned remit and keep decisions and unfinished work reviewable.', 'Escalate exceptional cases, conflicts and requests outside the delegation.', 'Train or brief cover so the service does not stop when one person is absent.'],
    ['Lead by conduct, keep private information appropriately restricted and admit mistakes.', 'Maintain the availability actually agreed for the office.'],
    'A recurring service commitment agreed with the appointing leadership.', 'The responsible Department Head, branch Guild Master and fellow officers.', 'Officer is reserved; the guide applies no native slot-2 rank, Discord role, bank access or removal permission.'
  ],
  office_63: [
    'Officer Alt is the native planning place for an appointed officer’s additional character. It allows continuity when that officer changes characters without multiplying their office, votes or delegation across several apparently independent identities.',
    ['Keep the alt’s connection to the appointed officer accurate.', 'Use the same recorded remit and handover as the main character.', 'Tell the Guild Master when the character no longer needs officer-alt standing.'],
    ['Protect the account to the standard required for any actual permissions held.', 'Never use an alt to bypass a recusal, restriction or review of the officer’s main identity.'],
    'The original office’s commitment; this is not a second appointment.', 'The appointing Guild Master and the officer’s department.', 'Officer Alt is reserved and requires separate attended game configuration; an association is not an automatic grant.'
  ],
  office_64: [
    'Penal / Sentry Hold marks a bounded conduct or review restriction under the adopted procedure. The status keeps an unresolved case visible without treating a temporary hold as a conviction, a public spectacle or a new native rank.',
    ['Follow the actual restriction and preserve material relevant to the review.', 'Use the stated contact or appeal route to correct factual errors.', 'Avoid contacting or pressuring other participants through unofficial proxies.'],
    ['Expect the responsible authority to state the reason, scope and review conditions.', 'Do not treat a gold payment or a cosmetic label as a self-executing release from a hold.'],
    'The case-specific duration and review timetable, not an invented automatic expiry.', 'Moderation and Council of Justice.', 'The catalogue performs no ban, timeout, login rejection, pardon or platform permission change.'
  ],
  office_65: [
    'A Per-Guild Correspondent reports useful branch news to the alliance. The job is accurate local reporting—upcoming events, approved achievements and service updates—with enough context that a reader from another Olympus branch understands what is relevant.',
    ['Collect approved local items and verify their dates, links and responsible organizer.', 'Ask agreement before publishing a member’s quote or identifiable appearance.', 'Send corrections and expired-event updates to the editor promptly.'],
    ['Mark a proposal as a proposal and an unconfirmed report as unconfirmed.', 'Do not copy private officer discussions into a news draft.'],
    'A regular branch news handover and agreed event deadlines.', 'Lead Correspondent, Heraldry Emissary and branch organizers.'
  ],
  office_66: [
    'Pledge records an introductory intention to join or serve under a branch’s current process. It is a relationship to be clarified, not a paid reservation, completed verification or guaranteed invitation into a full guild.',
    ['Read the current admission information and provide an honest account of your interests.', 'Complete requested ordinary orientation or verification steps through the supported channels.', 'Tell recruitment if your plans change rather than leaving a stale commitment active.'],
    ['Follow guild conduct while participating in introductions.', 'Wait for an actual invitation or appointment rather than assuming the label has granted one.'],
    'Introductory steps and any meetings the applicant agrees to attend.', 'Recruitment and Mentors.', 'A pledge is not a native rank, a signed contract for a roster space or authority to act for Olympus.'
  ],
  office_67: [
    'The Privy Council provides reserved advice and review close to the sovereign leadership. It examines sensitive policy and disputes with discretion, while keeping the distinction between advice, a judicial hearing and an operative decision visible to the people who must act.',
    ['Prepare reasoned advice on matters formally referred by leadership.', 'Identify constitutional, conflict-of-interest and procedural concerns before a decision is issued.', 'Record the advice, any dissent and the authority responsible for the final outcome.'],
    ['Maintain confidentiality appropriate to the matter without suppressing required reasons or appeal routes.', 'Recuse where a personal relationship or interest could compromise the review.'],
    'Reserved Council meetings and case preparation as assigned.', 'Leader, High Council and Council of Justice.'
  ],
  office_68: [
    'Probation is a defined review status for conduct or participation, not an eleventh native rank. Its value depends on specific expectations: the member should know what needs to improve, what support is available and who will assess the result.',
    ['Follow the written conditions and ask promptly if a requirement is unclear.', 'Attend agreed check-ins and provide relevant evidence of progress.', 'Raise a factual error or changed circumstance through the designated reviewer.'],
    ['Expect proportionate, stated conditions rather than shifting or humiliating tests.', 'Do not mistake a website status for a certified current game rank or Discord restriction.'],
    'The actual reviewed case period, with its stated checkpoints.', 'The appointed reviewer, relevant Class Lead or Moderation.', 'The guide neither imposes probation nor promises an automatic promotion, sanction or expiry.'
  ],
  office_69: [
    'The Profession Coordinator knows who can craft what and turns raid or guild needs into manageable craft requests. The Coordinator connects people and materials; they do not own every listed recipe or assume that an opt-in crafter is permanently available.',
    ['Keep opt-in profession and rare-recipe information accurate.', 'Arrange consumables and gear crafts with raid supply contacts and the Treasurer.', 'Match requests with willing crafters and identify profession gaps worth teaching or developing.'],
    ['Understand Forever’s professions and explain materials and deadlines clearly.', 'Respect directory privacy and a crafter’s decision to decline or delist.'],
    'About 3 to 6 hours a week, depending on supply projects.', 'Minister of Artisanry, Treasurer, Raid Leaders and Class Leads.'
  ],
  office_70: [
    'A PvP Captain leads an assigned group within an optional battleground or agreed competitive event. Olympus remains PvE · Alliance; the Captain organizes willing participants and applies the same conduct standards that govern the rest of guild life.',
    ['Brief the group’s objective, composition and target calls before play begins.', 'Keep the assigned team together and communicate changes to the PvP Lead.', 'Review mistakes constructively and help players prepare their agreed roles.'],
    ['Stay calm during losses and avoid directing abuse at opponents or teammates.', 'Respect the opt-in schedule and the published event rules.'],
    'The sessions accepted plus preparation for the assigned team.', 'PvP Lead, other Captains and event organizers.'
  ],
  office_71: [
    'The PvP Lead organizes optional battleground premades and agreed competitive events within the guild’s PvE ruleset direction. The role builds a dependable team and a clear voice channel without turning optional competition into compulsory participation or changing the announced ruleset. This regional or branch Officer Corps role is distinct from the alliance-wide MAIN PvP Lead Council remit.',
    ['Publish optional PvP nights and maintain the willing team’s composition.', 'Prepare strategy, assign Captains and call or delegate target priorities.', 'Review conduct and coordinate inter-guild questions through the appropriate Liaison.'],
    ['Have practical group-leading experience and a calm microphone presence.', 'Keep event objectives and rivalry within the guild and platform rules.'],
    'About 5 to 10 hours a week when an active program is scheduled.', 'PvP Captains, War Head, officers and Liaison.'
  ],
  office_72: [
    'The Quartermaster turns approved plans into available supplies. A raid or guild project should know what can be provided, what is missing and who is responsible for the handover, without relying on an undocumented personal stash.',
    ['Prepare material and consumable forecasts with activity organizers.', 'Arrange approved purchases, craft requests and distributions with custody records.', 'Reconcile stock after an event and report shortages, waste or unreturned goods.'],
    ['Keep guild and personal resources distinct and stay within approved appropriations.', 'Give organizers an honest availability estimate instead of promising stock not yet obtained.'],
    'Stock planning and distribution around scheduled activities.', 'Treasurer, Bank Manager, Profession Coordinator and Raid Assists.'
  ],
  office_73: [
    'A Raid Assist is the Raid Leader’s second in command for an agreed region and team. The Assist makes the raid work—invites, marks, groups and assignments—so the leader can focus on encounter calls, and is prepared to take over when explicitly asked.',
    ['Send invites, organize groups and confirm tanks, healers and special assignments.', 'Maintain attendance, substitutes and the practical loot handover.', 'Learn the encounter plan well enough to call the raid during an agreed leadership absence.'],
    ['Arrive early, use a clear microphone and remain calm when setup changes.', 'Know the encounters and avoid contradicting calls through a competing voice channel.'],
    'Regional raid nights plus about an hour of setup a week.', 'Regional Raid Leader, Loot Council and Class Leads.'
  ],
  office_74: [
    'A Raid Leader prepares and calls an agreed regional raid team. Once the pull starts, the group needs one clear plan: assignments, positioning, pace and recovery from mistakes, supported by preparation before the encounter’s 10, 20 or 40 players are waiting in the instance. This regional or branch Officer Corps role is distinct from the alliance-wide MAIN Raid Lead Council remit.',
    ['Set the regional schedule and publish strategy and sign-up expectations ahead of time.', 'Build the raid with Assists and Class Leads, then call pulls, breaks and encounter priorities.', 'Review difficult nights constructively and keep loot handling aligned with the published policy.'],
    ['Attend nearly every agreed raid, on time, with a steady microphone.', 'Learn encounter and class responsibilities first; correct mistakes without humiliating players.'],
    'Regional raid nights plus 2 to 3 hours of weekly preparation; see the individual NA/EU seats below.', 'Raid Assists, Class Leads, Loot Council and officers.'
  ],
  office_75: [
    'Raider is the native planning rank for a player participating in the organized raid program. A Raider earns trust through preparedness, dependable communication and teamwork; the label alone does not reserve a permanent team slot or settle a loot decision.',
    ['Sign up accurately and give notice when unable to attend.', 'Bring repaired gear, consumables and knowledge of the announced encounters.', 'Follow assignments and work on specific improvement goals with the Class Lead.'],
    ['Listen in the agreed voice channel and keep wipe discussions constructive.', 'Accept the published loot and rotation process while using its review route for concerns.'],
    'The raid nights agreed with the regional team.', 'Raid Leader, Raid Assists and Class Lead.'
  ],
  office_76: [
    'Recruit describes someone moving through a branch’s introduction and admission process. It should help newcomers find the next step, not create confusion with the exact native rank ladder or imply that a website application has already secured a character slot.',
    ['Give recruitment an honest description of your character, interests and availability.', 'Read the conduct and verification instructions relevant to the branch.', 'Keep your introduction or application current when your plans change.'],
    ['Treat other applicants and current members respectfully.', 'Wait for the authorized invitation or review rather than bypassing the queue through repeated requests.'],
    'The ordinary application and orientation steps, with no universal service quota.', 'Recruiters, Trial Officers and Mentors.'
  ],
  office_77: [
    'A Recruiter supports intake by helping a potential member understand the guild and reach a fair decision. The recruiter is a guide and evidence gatherer, not an owner of a private invitation list or a source of guarantees about officer seats.',
    ['Answer ordinary admission questions with current approved guidance.', 'Check that an application has the information needed for the appropriate ordinary path.', 'Pass cases, consent questions and waiting-list updates to the Recruitment Officer.'],
    ['Be discreet with private answers and consistent between applicants.', 'Do not promise a reserved leadership appointment or special access.'],
    'Agreed intake windows and a timely handover of pending contacts.', 'Recruitment Lead, Guild Recruiters and Trial Officers.'
  ],
  office_78: [
    'The Recruitment Lead organizes the recruitment team’s daily work under intake policy. The Lead makes sure inquiries do not disappear between officers and that different branches give compatible explanations of capacity, orientation and progression requirements.',
    ['Allocate intake coverage and maintain a clear queue handover.', 'Review difficult or delayed cases with the Chief of Intake.', 'Train recruiters in current application, verification and publication-consent procedures.'],
    ['Use consistent standards and document exceptions through the authorized reviewer.', 'Report missing capacity information honestly instead of presenting estimates as live availability.'],
    'Recurring recruitment coordination, with more work during launch or expansion.', 'Chief of Intake, Recruitment Officers and branch Guild Masters.'
  ],
  office_79: [
    'The Recruitment Officer vets ordinary membership and raid introductions and keeps the roster pipeline moving. The officer connects applications, interviews, trials and available branch capacity so new players receive a useful answer rather than repeated generic requests.',
    ['Review applications and arrange the appropriate conversation or ordinary trial.', 'Maintain the waiting-list handover and help approved newcomers settle in.', 'Report capacity pressures and proposed activity reviews to the authorized branch leadership.'],
    ['Be fair to friends and strangers alike and protect private applicant information.', 'Remain active across agreed recruitment hours and explain a delay promptly.'],
    'About 5 to 10 hours a week, more around launch.', 'Chief of Intake, Raid Leaders, Trial Officers and branch Guild Master.'
  ],
  office_80: [
    'Social is an activity preference for members who mainly enjoy conversation, leveling, dungeons and community events. It makes the guild’s non-progression life visible without suggesting that a social player has fewer conduct obligations or no meaningful contribution to make.',
    ['Keep event sign-ups honest and welcome others into ordinary guild groups.', 'Use the appropriate support or moderation route when a problem needs attention.', 'Contribute to a community where a newcomer can ask a basic question without ridicule.'],
    ['Respect both casual schedules and the preparation needs of organized teams.', 'Do not assume a social tag grants access to restricted officer or raid channels.'],
    'No fixed attendance requirement beyond specific plans you accept.', 'Community Officers, Mentors and other members.'
  ],
  office_81: [
    'The Sovereign, styled the King in the guild’s roleplay constitution, is the reserved executive office described in Title I. Royal language gives the guild its atmosphere; actual decrees still need the adopted process, a clear scope and the real authority required to implement them.',
    ['Set guild direction and issue adopted decisions through the appropriate recorded channel.', 'Appoint leadership and define the limits of delegated authority.', 'Account for emergency measures and arrange their review under the charter.'],
    ['Hear relevant Council advice and explain consequential changes to members.', 'Keep personal prestige distinct from platform ownership, cryptographic custody and another Guild Master’s game controls.'],
    'Reserved sovereign leadership; no public application track exists.', 'High Council, Co-Guild Master and branch Guild Masters.', 'The website’s title is not a cryptographic signature and grants no automated provider, bank or native-rank action.'
  ],
  office_82: [
    'A Tech / Tools Officer supports approved operational tools and the officers using them. The role is careful troubleshooting and maintenance: identify the actual version and failure, preserve useful evidence and avoid solving a local problem by weakening a production safeguard.',
    ['Reproduce reports on the relevant version and document a bounded diagnosis.', 'Prepare reviewed setup, maintenance and rollback instructions for approved tools.', 'Help operators recognize unknown provider outcomes and escalate them without blind retries.'],
    ['Keep credentials and personal data out of support transcripts.', 'Work within the approved host and deployment scope rather than experimenting on live services.'],
    'Agreed support windows, maintenance and release preparation.', 'Systems Architect, Addon Developers and authorized host operators.'
  ],
  office_83: [
    'A Technical Envoy connects a branch’s operators and users with the systems team. The envoy translates a practical problem into a useful report and returns verified instructions, without taking over host custody or claiming a fix merely because a source change exists.',
    ['Collect the affected version, steps and safe diagnostic evidence for a report.', 'Relay reviewed upgrade or compatibility instructions to the branch.', 'Confirm what was actually installed or tested and keep remaining local gaps explicit.'],
    ['Never request or circulate tokens, passwords or private account configuration.', 'Distinguish a merged change, a published release and an accepted local installation.'],
    'Branch support check-ins and scheduled upgrade coordination.', 'Tech / Tools Officer, Systems Architect and local authorized operators.'
  ],
  office_84: [
    'The Court is the reserved constitutional setting for royal counsel, hearings and ceremonial business. It is not a single unrestricted command account: executive advice, judicial review, Treasury custody and platform moderation remain separate responsibilities even when discussed in the same chamber.',
    ['Identify whether a matter is advice, a hearing, an appeal or ceremonial business.', 'Use the adopted procedure and assign a clear presiding authority for each matter.', 'Record outcomes and direct implementation to the officers with the actual mandate.'],
    ['Respect recusals, evidence privacy and the right to an intelligible decision.', 'Do not let roleplay spectacle replace fair treatment or platform rules.'],
    'Scheduled court business and assigned case preparation.', 'Sovereign, Privy Council, Council of Justice and Treasurer.'
  ],
  office_85: [
    'Tithe Payer is a non-authoritative recognition associated with the separately controlled Treasury cosmetic program. The Royal Writs schedule is paused by default; a historical policy description or old receipt is not a current offer to buy a title.',
    ['Check that the relevant program is actually enabled before seeking a new cosmetic service.', 'Keep any existing receipt query within the authorized Treasury review process.', 'Represent the recognition accurately as cosmetic and separate from ordinary membership.'],
    ['Never claim a vote, officer seat, bank access or moderation privilege from a contribution.', 'Use no real-world money or paid addon gating and respect any program suspension.'],
    'No guild-service quota or active payment invitation follows from this title.', 'Treasurer and the relevant authorized cosmetic-program operator.', 'Paused Royal Writs remain unavailable unless the owner enables the separate admin switch; no provider dispatch is activated here.'
  ],
  office_86: [
    'The Treasurer safeguards guild gold and the financial ledger as a reserved High Council appointment. The core promise is an explainable account of what came in, what went out and why, with custody separated from independent audit and approved spending.',
    ['Prepare repair, consumable and project budgets with the responsible organizers.', 'Record receipts, approved expenditure and reconciliations with enough evidence for independent review.', 'Propose bank organization and limits for the Guild Master’s attended configuration.'],
    ['Use the required account protection and never mix personal loans or spending with guild funds.', 'Disclose conflicts, preserve unknown outcomes and keep records available to authorized auditors.'],
    'About 3 to 6 hours a week, with additional budget and audit reviews.', 'Guild Master, Quartermaster, Bank Manager, Bank Auditor and raid supply contacts.', 'Treasurer is an appointment, not an additional native rank, automatic withdrawal authority or permission to reactivate paused gold services.'
  ],
  office_87: [
    'Trial Member describes a person being introduced or assessed under an explicitly stated ordinary membership process. A trial should have a purpose, support and a reviewer; it should not be an indefinite label used to move expectations after someone has tried to meet them.',
    ['Understand the agreed trial activities, conduct and contact person.', 'Attend the sessions you accept and ask for clarification when feedback is unclear.', 'Tell the reviewer about changed availability or a problem affecting participation.'],
    ['Expect concrete feedback and a clear next step through the ordinary review process.', 'Do not assume a trial label guarantees a roster place, promotion or public-office candidacy.'],
    'The actual trial plan agreed with the reviewer; no automatic duration is promised.', 'Trial Officers, Recruiters, Mentors and the relevant activity lead.'
  ],
  office_88: [
    'A Trial Officer supports newcomers through an agreed assessment or orientation plan. The officer makes expectations and feedback concrete, so the process evaluates relevant conduct and preparation rather than how well a newcomer guesses an unwritten rule.',
    ['Explain the trial’s scope, organizer and review checkpoints before it starts.', 'Collect specific observations and provide timely, actionable feedback.', 'Submit a balanced recommendation to the authorized reviewer, including missing evidence or support needs.'],
    ['Keep private assessments within the authorized review group.', 'Do not promise acceptance, a reserved leadership seat or a promotion you cannot award.'],
    'The assigned trial sessions, preparation and follow-up.', 'Recruitment Officer, Mentors, Class Leads and activity organizers.'
  ],
  office_89: [
    'A Trial Raider is assessing and being assessed for a particular raid team. Both sides need honest information: the team explains its schedule and standards, and the player demonstrates preparation, communication and willingness to learn the assigned encounters.',
    ['Arrive for agreed trial raids with repaired gear, consumables and encounter preparation.', 'Follow assignments and tell the organizer promptly about a mistake or uncertainty.', 'Discuss specific feedback and the next review point with the Class Lead or trial contact.'],
    ['Respect the published loot and rotation rules during the trial.', 'Expect assessment against relevant preparation and teamwork, not an unexplained popularity test.'],
    'The agreed trial nights and personal preparation.', 'Regional Raid Leader, Class Lead and Trial Officer.', 'Trial status does not guarantee a permanent raid place, a loot award or an automatic native-rank change.'
  ],
  office_90: [
    'Veteran recognizes a member whose sustained conduct and contribution have earned the guild’s trust. It is a standing within the exact ten-rank plan, not a substitute for an officer appointment or permission to direct other members simply because they joined later.',
    ['Set a reliable example of conduct in guild groups and public interactions.', 'Share practical knowledge with newcomers who want help.', 'Support continuity by explaining procedures accurately and directing difficult cases to the proper officer.'],
    ['Remain open to current guidance rather than treating seniority as immunity.', 'Respect other players’ experience and avoid turning mentoring into unsolicited command.'],
    'Continuing good standing and voluntary contribution; no universal rota.', 'Members, Mentors and branch officers.'
  ],
  office_91: [
    'Veteran Officer is honorary or advisory recognition for prior leadership service in this catalogue. It records experience without silently restoring a former operational remit, allowing members to know whom to ask for historical context and whom to ask for a current decision.',
    ['Offer useful advice when the current officeholder requests it.', 'Preserve institutional knowledge in a clear handover or approved guide.', 'Refer active cases and permission requests to the presently authorized officer.'],
    ['Respect the current holder’s responsibility and the confidentiality of past cases.', 'State clearly when a comment is personal advice rather than an official ruling.'],
    'Voluntary advice; no current officer rota follows from the recognition.', 'Current officers and the appointing leadership.', 'Despite the historical name, this recognition is not a current Officer Corps appointment, native rank or retained access grant.'
  ],
  office_92: [
    'The Vice Guild Master is a reserved senior appointment supporting continuity of guild leadership. The precise delegation must be stated: the Vice GM may coordinate important work without inheriting every power of the Guild Master or bypassing the High Council’s process.',
    ['Maintain the agreed leadership handover and succession contact arrangements.', 'Coordinate delegated branch or alliance work with named officers.', 'Escalate decisions outside the delegation and report actions taken during cover.'],
    ['Be dependable in the agreed cover role and disclose conflicts early.', 'Avoid competing instructions that leave officers uncertain which decision is operative.'],
    'A continuing senior leadership commitment agreed with the Guild Master.', 'Guild Master, Co-Guild Master, Chief of Staff and Department Heads.'
  ],
  office_93: [
    'VIP is a courtesy or recognition label, not an officer office or a better class of membership. A recognized guest or supporter still participates under the same conduct rules and does not gain priority over another person’s privacy, safety or agreed group place.',
    ['Represent the courtesy title honestly in guild spaces.', 'Follow the rules and event arrangements that apply to other participants.', 'Direct requests for special arrangements to the actual organizer instead of assuming approval.'],
    ['Do not use visibility or recognition to pressure members or moderators.', 'Accept that an honorary or cosmetic label does not decide a dispute or secure an invitation.'],
    'No service quota follows from the courtesy label.', 'Community Officers and the leadership granting recognition.', 'VIP grants no Council seat, platform role, bank access or active Royal Writs service.'
  ],
  office_94: [
    'The War Head template covers two distinct alliance-wide High Council remits: MAIN Raid Lead for organized PvE progression, and MAIN PvP Lead for optional PvP strategy and cross-branch coordination within the announced PvE · Alliance direction. These leads set shared strategy and resourcing priorities while regional Raid Leaders and regional or branch PvP Leads retain their assigned operational command. Both current remit references use the existing office_94 template; they do not create two persistent appointment records or copy a holder between offices.',
    ['Coordinate alliance progression goals, optional PvP strategy, training needs and cross-branch support within the respective MAIN remit.', 'Review readiness and resource proposals with Class Heads, strategy and Treasury.', 'Resolve conflicting schedules or priorities through the responsible organizers and Council process.'],
    ['Use actual roster and performance evidence without inventing live capacity.', 'Respect regional schedules, published loot rules and the opt-in nature of unrelated activities.'],
    'Continuing alliance portfolio leadership and preparation for the respective progression or optional PvP reviews.', 'Regional Raid Leaders, regional or branch PvP Leads, Chief Strategist, Emissaries of War and Treasurer.'
  ],
  office_95: [
    'The Welfare / Community Support Lead helps members find a humane route through ordinary guild difficulties. The office listens, connects people with appropriate support and recognizes the limits of a volunteer gaming community rather than presenting itself as professional emergency care.',
    ['Receive concerns privately and clarify what help or referral the member wants.', 'Coordinate reasonable participation support with the relevant organizer when the member agrees.', 'Escalate serious safety or misconduct concerns through the appropriate platform or responsible authority.'],
    ['Protect privacy, explain limits to confidentiality and avoid diagnosing people.', 'Maintain personal boundaries and arrange cover instead of promising round-the-clock availability.'],
    'Agreed support windows and a clear handover for ongoing concerns.', 'Community Officers, Moderation and event organizers.'
  ],
  office_96: [
    'The Head of Trading & Markets is a reserved High Council portfolio devoted solely to extracting disciplined, permitted trading value from the Auction House, direct player trades and the wider market economy. The holder researches where goods genuinely trade, what buyers need and how fast capital can return as gold. This is a market specialist rather than a second Treasurer: turnover, speculative price marks and unsold inventory never substitute for realized net profit.',
    ['Maintain a timestamped watchlist of observed purchase and completed-sale prices, available supply, liquidity, seasonal or event demand and plausible downside scenarios; asking prices alone are not proof of achievable value.', 'Calculate a proposed trade after acquisition cost, Auction House fees, deposits lost on failed or cancelled listings and any other actual transaction expense; compare the expected net return and time-to-sale with doing nothing.', 'Negotiate direct buy and sell terms, check item quantities and the trade window before accepting, and retain proportionate transaction receipts showing the actual cost, proceeds and any counterparty conflict for an authorized reviewer.', 'Manage only the trading capital and inventory expressly authorized by the Treasurer: obey position and category concentration caps, stock-aging limits, minimum cash liquidity and written loss or stop-buy rules; pause and escalate a breach instead of doubling down.', 'Review listing success, sell-through, inventory age, capital turnover and exposure to demand shocks; distinguish a realized trading loss from an unsold position and explain the assumptions behind each proposed liquidation.', 'Hand the Treasurer a weekly realized trading profit-and-loss reconciliation, cash and inventory movements, remaining commitments and unresolved exceptions, with source receipts available to the independent Bank Auditor.'],
    ['Keep personal and guild positions separate, disclose related-party or self-dealing conflicts before a trade, and never count donated stock, gross sales or an unrealized revaluation as earned trading profit.', 'Use only permitted manual gameplay and current game rules; no botting, real-money trading, exploits, coercive purchase pressure or promise of guaranteed returns.', 'Protect the approved reserve and halt new buying when a capital, loss, age or evidence limit is reached; obtain a fresh authorization before changing the risk envelope.', 'Concentrate this office on trading: do not turn market access into a donation quota, a paid admission or protection scheme, or a power to decide another member’s conduct case.'],
    'A defined daily market scan during agreed play windows, scheduled inventory and listing reviews, and one documented weekly trading reconciliation; cover and decision limits are agreed before absence.',
    'Treasurer for authorized capital, custody and budget caps; independent Bank Auditor for reconciliation; willing suppliers and buyers for ordinary trades. Artisanry retains craft commissions and Justice retains appeals and conduct.',
    'This office has no dues collection, donation or appeal administration, moderation, craft-commission management, paid-rights authority or independent bank custody. No automatic bank withdrawal, signing, bot, portal or game permission follows; the Treasurer retains financial custody and the auditor remains independent.'
  ],
  leveling: [
    'The Leveling Lead turns people questing alone into groups that learn and level together. At launch the work centres on level bands and dungeon routes; later it helps newcomers and alts catch up without promising an automatic boost or a fixed raid place.',
    ['Organize leveling groups by level range, region and available play time.', 'Arrange dungeon and elite-quest groups with suitable guidance.', 'Keep routes and beginner notes current for Forever’s actual changes.'],
    ['Be patient with inexperienced players and avoid pressuring them to match your own pace.', 'Check group leaders and timings before announcing a run.'],
    'About 5 to 10 hours a week around launch, usually less later.', 'Community & Events Lead, Class Leads and Profession Coordinator.'
  ],
  liaison: [
    'The Liaison is an everyday contact between Olympus branches or with another guild. The role prevents a simple coordination problem from becoming a public feud by making sure the right leaders hear the same facts and can speak directly when a decision is needed.',
    ['Maintain current contacts and relay approved news or shared-event plans.', 'Collect the facts of a cross-guild incident calmly and refer it to the responsible leaders.', 'Keep a concise record of agreed follow-up and unresolved questions.'],
    ['Be diplomatic and make no commitment for another Guild Master without approval.', 'Separate a verified incident from a member’s allegation or personal grievance.'],
    'About 2 to 5 hours a week, with additional work around shared events.', 'Guild Masters, Emissaries, Coalition Lead and relevant activity leaders.'
  ]
};

const reservedNote201 = 'Reserved leadership seat — not open to public applications. Appointment is made separately by the authorized guild leadership.';
const ordinaryBoundary201 = 'This is a descriptive website guide. A title or application changes no game rank, Discord role, bank limit, signing authority or addon permission; actual access requires its separate authorized process.';
const rankSource201: Readonly<Record<number, string>> = { 0: 'office_43', 1: 'office_45', 2: 'office_62', 3: 'office_63', 4: 'office_74', 5: 'office_90', 6: 'office_75', 7: 'office_55', 8: 'office_04', 9: 'office_48' };
const eligibility201 = (office: (typeof OFFICE_APPOINTMENTS)[number]): RoleEligibility201 => office.tier !== 'member_specialist' ? 'reserved' : office.applicationTrack === 'patron' ? 'cosmetic' : office.applicationEligible && ['member', 'raider', 'artisan'].includes(office.applicationTrack) ? office.applicationTrack as 'member' | 'raider' | 'artisan' : 'standing';
const eligibilityNote201 = (value: RoleEligibility201): string => value === 'reserved' ? reservedNote201 : value === 'member' ? 'Ordinary membership interest may be expressed through the member application; this label is not a promised rank or roster place.' : value === 'raider' ? 'Express raid interest through the ordinary Raider path; team selection, trials and actual rank remain separately reviewed.' : value === 'artisan' ? 'Express profession or mentoring interest through the Artisan path; an operational Workshop or officer appointment is not included.' : value === 'cosmetic' ? 'Recognition only. The Royal Writs schedule remains paused while its admin switch is OFF; no payment or service is offered by this guide.' : 'Standing or review status only — not an application vacancy. The responsible officer reviews the actual status separately.';

/** Class-specific assignments are examples to agree against the current encounter and supported ruleset,
 * not a claim that any class, spell, talent or recipe has been observed on a live Forever character. */
const classCopy201: Readonly<Record<string, readonly [string, readonly string[], readonly string[]]>> = {
  warrior: ['The Warrior Class Lead develops reliable warrior play across tanks and damage roles. The lead helps the raid understand who is holding an enemy, who can take over and how a damage assignment changes when survival or threat becomes the limiting factor.', ['Review tank transitions, positioning and threat plans with the assigned raid tanks.', 'Help damage warriors prepare gear, consumables and encounter responsibilities without ignoring survival.', 'Coordinate available interrupts, emergency cover and melee positioning with the Raid Assists.'], ['Explain the difference between tank and damage preparation using the actual encounter plan.', 'Use specific examples and class practice instead of judging players by damage totals alone.']],
  paladin: ['The Paladin Class Lead coordinates the class’s support and combat responsibilities for the assigned team. Clear blessing coverage, healing priorities and emergency assignments let paladins contribute without several players assuming someone else has covered the same task.', ['Agree blessing coverage and relevant support assignments before the raid starts.', 'Help paladins prepare for their actual healing or other supported encounter role.', 'Review available cleanses, emergency protection and handovers with the healing and raid leaders.'], ['Check current Forever class behaviour before repeating a guide from another version.', 'Teach dependable support work as carefully as visible healing or damage performance.']],
  hunter: ['The Hunter Class Lead helps hunters use their range, pets and encounter tools safely. The lead prepares the group for responsible pulling and target control, so an extra pet action or an unclear mark does not undo an otherwise well-planned encounter.', ['Agree any assigned pulls and target marks with the Raid Leader before acting.', 'Review pet control, positioning and encounter-specific target duties.', 'Help hunters prepare ammunition or other current ruleset requirements and appropriate gear.'], ['Explain safe control and recovery rather than encouraging improvised pulls.', 'Check whether a tool or pet behaviour is supported in the current game version before assigning it.']],
  rogue: ['The Rogue Class Lead prepares melee specialists for precise target, interrupt and positioning work. The role combines personal improvement with group reliability: an assigned kick or dangerous movement matters even when it costs a better damage number.', ['Coordinate assigned interrupts, targets and backup coverage with Raid Assists.', 'Review melee positioning, survival and encounter-specific control tasks.', 'Help rogues plan gear, consumables and practice goals suited to their assigned role.'], ['Value reliable mechanics and conduct alongside damage.', 'Give actionable feedback privately and distinguish a missed assignment from an agreed change of plan.']],
  priest: ['The Priest Class Lead coordinates dependable priest preparation, whether the accepted encounter role is healing or another supported assignment. The lead helps the team distinguish throughput from the less visible work of dispels, resource planning and keeping the right person alive.', ['Agree healing targets, dispel duties and backup coverage with the raid’s healing coordinators.', 'Review mana preparation, positioning and any current encounter-specific priest tools.', 'Coach individual players using the healing or support assignment they actually received.'], ['Avoid assessing a healer from one total without considering their target and duties.', 'Verify current spell and ruleset behaviour before making a specialist assignment compulsory.']],
  shaman: ['The Shaman Class Lead supplies class-specific guidance where the current game ruleset and team support the class. The lead coordinates group support, available totems and the accepted healing or combat role without assuming a class’s presence from a historical guild title.', ['Confirm current class availability and the team’s actual role before planning assignments.', 'Coordinate supported group buffs, totems and encounter duties with Raid Assists.', 'Help shamans prepare resources and practice the responsibilities agreed for their role.'], ['Keep historical or cross-version expectations separate from observed current gameplay.', 'Explain support coverage clearly so group members know what is actually assigned.']],
  mage: ['The Mage Class Lead coordinates ranged preparation and the utility the raid actually needs. The lead helps mages combine encounter damage with assigned control, dispels or other supported duties, rather than treating every interruption to a damage rotation as someone else’s problem.', ['Agree crowd-control and target assignments with the Raid Assists.', 'Review supported dispels, positioning and encounter-specific mage utility.', 'Help players prepare consumables and resources and improve against their actual assignment.'], ['Use current mechanics when discussing builds or spell behaviour.', 'Coach reliable control and survival as well as damage, with specific evidence and clear priorities.']],
  warlock: ['The Warlock Class Lead makes class support and ranged assignments dependable. The role coordinates which effects or encounter tasks each warlock is responsible for, while helping players prepare resources and manage pets safely under the current ruleset.', ['Agree curse or other supported debuff coverage so responsibilities are not assumed or duplicated.', 'Review pet control, positioning and any assigned encounter utility.', 'Coordinate relevant summons, recovery or resource preparation with the raid’s actual organizers.'], ['Verify current availability and limits before promising a class service to the whole raid.', 'Explain why a support assignment matters and review performance in that context.']],
  druid: ['The Druid Class Lead supports a flexible class without confusing flexibility with an obligation to perform every role at once. The lead helps each player prepare for the role the team actually accepted, including any specific emergency or utility handover.', ['Agree the player’s primary tanking, healing or damage assignment with raid leadership.', 'Review supported emergency recovery, dispel or other utility duties and their backup order.', 'Help druids prepare the relevant gear, consumables and encounter positioning for their accepted role.'], ['Respect the difference between a player’s prepared role and an unplanned mid-raid demand.', 'Check current Forever mechanics before applying assumptions from another game version.']]
};

const overlay201 = (key: string, guide: RoleGuide201): RoleGuide201 => {
  const classCopy = key.startsWith('class_lead:') ? classCopy201[key.slice('class_lead:'.length)] : undefined;
  if (classCopy) return { ...guide, definition: classCopy[0], responsibilities: classCopy[1], expectations: classCopy[2], commitment: 'Class support before and during the raids you cover, plus agreed coaching between sessions.', worksWith: 'Class Head, the relevant Raid Leaders, Raid Assists and class Mentors.' };
  if (/^raid_(leader|assist)_(na|eu)$/.test(key)) {
    const na = key.endsWith('_na'), lead = key.startsWith('raid_leader_');
    const region = na ? 'North American' : 'European';
    const evenings = na ? 'evenings Eastern time, about 7 pm to midnight (4 to 9 pm Pacific)' : 'evenings Central European time, about 7 pm to midnight (6 to 11 pm UK)';
    return { ...guide, definition: lead ? `The ${region} Raid Leader plans and calls that region’s raids, ${evenings}. Once the pull starts, the team follows one prepared voice for strategy, assignments, pace and recovery; this is a reserved appointment, not an application vacancy.` : `The ${region} Raid Assist is the Raid Leader’s second in command, ${evenings}. The Assist handles the practical setup and is prepared to lead during an expressly agreed absence; the reserved seat is not available through a public application.`, commitment: `Your region’s raid nights, ${evenings}, plus ${lead ? '2 to 3 hours of preparation' : 'about an hour of setup'} a week.` };
  }
  return guide;
};

/** Every assignable display key has one concrete guide; aliases retain one office and do not add new seats. */
export const OFFICE_ROLE_GUIDES_201: Readonly<Record<string, RoleGuide201>> = Object.freeze(Object.fromEntries(OFFICE_APPOINTMENTS.map(office => {
  const rankKey = office.nativeIndex === undefined ? undefined : rankSource201[office.nativeIndex];
  const sourceKey = office.aliasOf ?? rankKey ?? office.key;
  const copy = content201[sourceKey];
  if (!copy) throw new Error(`Missing role guide: ${office.key}`);
  const eligibility = eligibility201(office);
  const guide = overlay201(office.key, { key: office.key, label: office.label, definition: copy[0], responsibilities: [...copy[1]], expectations: [...copy[2]], commitment: copy[3], worksWith: copy[4], boundaries: [copy[5], ordinaryBoundary201].filter(Boolean).join(' '), eligibility, eligibilityNote: eligibilityNote201(eligibility), nativeSlot: office.nativeSlot, nativeRankOrdinal: office.nativeRankOrdinal });
  return [office.key, Object.freeze({ ...guide, responsibilities: Object.freeze([...guide.responsibilities]), expectations: Object.freeze([...guide.expectations]) })];
})));

export const NATIVE_RANK_GUIDES_201: readonly RoleGuide201[] = Object.freeze(NATIVE_RANKS_199.map(rank => {
  const office = OFFICE_APPOINTMENTS.find(row => row.group === 'native' && row.nativeIndex === rank.nativeSlot);
  const original = office ? OFFICE_ROLE_GUIDES_201[office.key] : undefined;
  if (!original) throw new Error(`Missing native guide: ${rank.nativeSlot}`);
  return Object.freeze({ ...original, label: rank.name, nativeSlot: rank.nativeSlot, nativeRankOrdinal: rank.nativeRankOrdinal });
}));

interface LegacyPosition201 { readonly key: string; readonly label: string; readonly info: { readonly about: string; readonly duties: readonly string[]; readonly expect: readonly string[]; readonly time: string; readonly works?: string } }
/** Preserve the original rich position guides, including region-specific raid hours and six concrete raid duties.
 * Their old rank/permission prose is deliberately not copied: the current native ladder and reserved policy apply. */
export function roleGuides201(positions: readonly LegacyPosition201[] = []): Readonly<Record<string, RoleGuide201>> {
  const guides: Record<string, RoleGuide201> = { ...OFFICE_ROLE_GUIDES_201 };
  for (const position of positions) {
    const sourceKey = position.key === 'member' ? 'office_55' : position.key === 'raider' ? 'office_75' : position.key === 'pvp_team' ? 'office_75' : position.key === 'class_lead' ? 'office_18' : undefined;
    const existing = guides[position.key] ?? (sourceKey ? { ...guides[sourceKey], key: position.key, label: position.label, eligibility: position.key === 'class_lead' ? 'reserved' as const : position.key === 'raider' ? 'raider' as const : 'member' as const } : undefined);
    if (!existing || position.info.duties.length < 3 || position.info.expect.length < 2) continue;
    // .199 generated office descriptions are not historical detailed copy; retain the handwritten guide above.
    if (/^office_[0-9]{2}$/.test(position.key)) continue;
    guides[position.key] = Object.freeze({ ...existing, eligibilityNote: eligibilityNote201(existing.eligibility), definition: position.info.about, responsibilities: Object.freeze([...position.info.duties]), expectations: Object.freeze([...position.info.expect]), commitment: position.info.time, worksWith: position.info.works ?? existing.worksWith });
  }
  return Object.freeze(guides);
}
