/** Operational reminders, not a substitute for current Discord entitlement.
 * The support outcome is owner-reported; Portal evidence is retained privately.
 * No access token, support transcript or personal member data is stored here. */
export const DISCORD_INTENT_OPERATIONS = Object.freeze({
  applicationId: '1550176895671341076',
  supportTicket: '69051883',
  approvalReportedOn: '2026-10-23',
  approvalSource: 'owner_directive',
  reviewBefore: '2027-10-23',
  annualReapplicationRequired: true,
  requiredIntent: 'GUILD_MEMBERS',
  permittedUse: 'On-demand member directory, member name/avatar resolution and existing authorized role reconciliation.',
  presenceRequired: false,
  messageContentRequired: false,
  gatewayConnectionRequired: false,
  persistentRosterMirror: false,
  guide: '/static/governance/operational-charter.md',
} as const);
