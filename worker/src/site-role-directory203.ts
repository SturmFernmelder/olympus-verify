/** Owner-approved presentation consolidation, 26 Oct 2026.
 * A family is one public directory card, not a merged appointment or permission.
 * Every original key and its full .201 guide remain addressable underneath it;
 * the ten native ranks link to these cards instead of becoming ten extra jobs.
 * Backend admission, holders, ballots, scopes and historical identities stay separate. */
import { OFFICE_APPOINTMENTS, NATIVE_RANKS_199 } from './governance-offices';

export type RoleDirectoryKind203 = 'role' | 'activity' | 'status' | 'institution';
export type RoleDirectoryTier203 = 'leader' | 'high_council' | 'officer_corps' | 'member_specialist';
export type RoleVariantKind203 = 'region' | 'class' | 'subrole' | 'historical';
export interface RoleDirectoryVariant203 {
  readonly key: string;
  readonly label: string;
  readonly kind: RoleVariantKind203;
}
export interface RoleDirectoryFamily203 {
  readonly key: string;
  readonly label: string;
  readonly kind: RoleDirectoryKind203;
  readonly tier: RoleDirectoryTier203;
  readonly primaryKey: string;
  readonly sourceKeys: readonly string[];
  readonly alternateTitles: readonly string[];
  readonly variants: readonly RoleDirectoryVariant203[];
  readonly application?: Readonly<{ applicationTrack: 'member' | 'raider' | 'artisan'; targetOffice: string | null }>;
}
export interface RoleDirectory203 {
  readonly version: 1;
  readonly families: readonly RoleDirectoryFamily203[];
  readonly ranks: readonly Readonly<{ nativeSlot: number; nativeRankOrdinal: number; label: string; familyKey: string }>[];
  readonly keyToFamily: Readonly<Record<string, string>>;
  readonly sourceKeyCount: 134;
}

interface FamilySeed203 {
  readonly key: string;
  readonly label: string;
  readonly kind: RoleDirectoryKind203;
  readonly tier: RoleDirectoryTier203;
  readonly primaryKey: string;
  readonly sourceKeys: readonly string[];
  readonly contexts?: Readonly<Record<string, string>>;
  readonly application?: RoleDirectoryFamily203['application'];
}

// Same-card titles retain individual source guides and their actual remit.
// In particular, a Council portfolio is never folded into its officer service,
// and independent audit remains outside both Treasury and stock custody.
const seeds203: readonly FamilySeed203[] = [
  { key: 'leader', label: 'Leader / Guild Master', kind: 'role', tier: 'leader', primaryKey: 'office_43', sourceKeys: ['office_43', 'office_81', 'office_41'], contexts: { office_81: 'Sovereign (The King) — alliance executive and royal decrees', office_41: 'Final Authority — the sovereign responsibility, not an additional office', guild_master: 'Guild Master — retained Olympus II–X branch guide' } },
  { key: 'founder', label: 'Founder Recognition', kind: 'status', tier: 'leader', primaryKey: 'office_42', sourceKeys: ['office_42'] },
  { key: 'high_council', label: 'High Council & Portfolio Appointments', kind: 'institution', tier: 'high_council', primaryKey: 'office_45', sourceKeys: ['office_45', 'office_28', 'office_57'], contexts: { office_28: 'Department Head — portfolio responsibility and officer coordination', office_57: 'Minister — statutory Council portfolio category' } },
  { key: 'co_gm', label: 'Co-Guild Master / Vice Guild Master', kind: 'role', tier: 'high_council', primaryKey: 'office_19', sourceKeys: ['office_19', 'office_92'], contexts: { office_92: 'Vice Guild Master — the recorded continuity and succession delegation', co_gm: 'Co-Guild Master — retained detailed second-in-command guide' } },
  { key: 'justice', label: 'Council of Justice', kind: 'institution', tier: 'high_council', primaryKey: 'office_26', sourceKeys: ['office_26'] },
  { key: 'privy_council', label: 'Privy Council', kind: 'institution', tier: 'high_council', primaryKey: 'office_67', sourceKeys: ['office_67'] },
  { key: 'court', label: 'The Court — Constitutional Institution', kind: 'institution', tier: 'high_council', primaryKey: 'office_84', sourceKeys: ['office_84'] },
  { key: 'chief_intake', label: 'Chief of Intake / Gatekeeper', kind: 'role', tier: 'high_council', primaryKey: 'office_14', sourceKeys: ['office_14'] },
  { key: 'minister_artisanry', label: 'Minister of Artisanry', kind: 'role', tier: 'high_council', primaryKey: 'office_58', sourceKeys: ['office_58'] },
  { key: 'minister_heraldry', label: 'Minister of Heraldry', kind: 'role', tier: 'high_council', primaryKey: 'office_59', sourceKeys: ['office_59'] },
  { key: 'war_head', label: 'War Head — Progression Portfolio', kind: 'role', tier: 'high_council', primaryKey: 'office_94', sourceKeys: ['office_94'] },
  { key: 'treasurer', label: 'Treasurer / Guild Bank', kind: 'role', tier: 'high_council', primaryKey: 'office_86', sourceKeys: ['office_86'], contexts: { treasurer: 'Treasurer — retained detailed financial stewardship guide', rank_treasurer: 'Historical Treasurer rank label — a current Council appointment, not an eleventh rank' } },
  { key: 'officer', label: 'Officer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_62', sourceKeys: ['office_62'] },
  { key: 'officer_alt', label: 'Officer Alt', kind: 'role', tier: 'officer_corps', primaryKey: 'office_63', sourceKeys: ['office_63'] },
  { key: 'chief_staff', label: 'Chief of Staff', kind: 'role', tier: 'officer_corps', primaryKey: 'office_15', sourceKeys: ['office_15'] },
  { key: 'deputy', label: 'Deputy — Recorded Cover Delegation', kind: 'role', tier: 'officer_corps', primaryKey: 'office_29', sourceKeys: ['office_29'] },
  { key: 'academy', label: 'Academy / Training Lead', kind: 'role', tier: 'officer_corps', primaryKey: 'office_01', sourceKeys: ['office_01'] },
  { key: 'addon_developer', label: 'Addon Developer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_02', sourceKeys: ['office_02'] },
  { key: 'architect', label: 'Addon / Discord Architect', kind: 'role', tier: 'high_council', primaryKey: 'office_03', sourceKeys: ['office_03'] },
  { key: 'bank_auditor', label: 'Independent Bank Auditor', kind: 'role', tier: 'officer_corps', primaryKey: 'office_08', sourceKeys: ['office_08'] },
  { key: 'bank_custody', label: 'Bank Custody & Raid Logistics', kind: 'role', tier: 'officer_corps', primaryKey: 'office_09', sourceKeys: ['office_09', 'office_10', 'office_72'], contexts: { office_10: 'Bank Steward — custody of an expressly delegated tab or distribution rota', office_72: 'Quartermaster — activity supplies, forecasts and material handovers' } },
  { key: 'diplomacy', label: 'Diplomacy & Guild Liaison', kind: 'role', tier: 'officer_corps', primaryKey: 'office_20', sourceKeys: ['office_20', 'office_06', 'office_30', 'office_31', 'liaison'], contexts: { office_06: 'Ambassador — a continuing approved partner relationship', office_30: 'Diplomat — a defined negotiation and its agreed limits', office_31: 'Diplomatic Envoy — a bounded message or mission', liaison: 'Liaison — retained everyday cross-guild contact and dispute handover guide' } },
  { key: 'community_officer', label: 'Community / Social Officer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_22', sourceKeys: ['office_22'] },
  { key: 'events', label: 'Community Events & Event Operations', kind: 'role', tier: 'officer_corps', primaryKey: 'office_21', sourceKeys: ['office_21', 'office_39', 'office_40'], contexts: { office_39: 'Event Coordinator — planning and logistics for a named event', office_40: 'Event Officer — assigned delivery duties during the event', community: 'Community & Events Lead — retained detailed calendar and community guide' } },
  { key: 'media', label: 'Media, Communications & News', kind: 'role', tier: 'officer_corps', primaryKey: 'office_53', sourceKeys: ['office_53', 'office_54', 'office_50'], contexts: { office_54: 'Media Lead — approved project production and creator coordination', office_50: 'Lead Correspondent — branch news editing and Town Crier handover' } },
  { key: 'branch_correspondent', label: 'Branch Correspondent / Heraldry Emissary', kind: 'role', tier: 'officer_corps', primaryKey: 'office_65', sourceKeys: ['office_65', 'office_37'], contexts: { office_37: 'Heraldry Emissary — branch publication, consent and correction liaison' } },
  { key: 'branch_emissary', label: 'Branch Emissary & Portfolio Representation', kind: 'role', tier: 'officer_corps', primaryKey: 'office_34', sourceKeys: ['office_34', 'office_35', 'office_36', 'office_38'], contexts: { office_35: 'Emissary of Artisanry — branch craft coverage and Workshop handovers', office_36: 'Emissary of Finance — branch requests and Treasury-policy handovers', office_38: 'Emissary of War — branch raid readiness and strategy handovers' } },
  { key: 'discord_engineer', label: 'Discord Engineer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_32', sourceKeys: ['office_32'] },
  { key: 'moderator', label: 'Moderator / Discord Moderator', kind: 'role', tier: 'officer_corps', primaryKey: 'office_33', sourceKeys: ['office_33', 'office_60'], contexts: { office_60: 'Moderator — the separately assigned space, activity and review jurisdiction', moderator: 'Discord Moderator — retained platform-specific conduct and escalation guide' } },
  { key: 'recruiter', label: 'Recruiter / Guild Recruiter', kind: 'role', tier: 'officer_corps', primaryKey: 'office_44', sourceKeys: ['office_44', 'office_77'], contexts: { office_77: 'Recruiter — admission questions, evidence gathering and intake handovers' } },
  { key: 'recruitment', label: 'Recruitment Officer & Intake Operations', kind: 'role', tier: 'officer_corps', primaryKey: 'office_79', sourceKeys: ['office_79', 'office_78'], contexts: { office_78: 'Recruitment Lead — team coverage, queue handovers and recruiter training', recruitment: 'Recruitment Officer — retained application, trial and branch-capacity guide' } },
  { key: 'class_leadership', label: 'Class Leadership', kind: 'role', tier: 'officer_corps', primaryKey: 'office_18', sourceKeys: ['office_18', 'office_17'], contexts: { office_17: 'Class Head — shared standards, mentors and support across raid groups' } },
  { key: 'chief_strategist', label: 'Chief Strategist / Head of Research', kind: 'role', tier: 'officer_corps', primaryKey: 'office_16', sourceKeys: ['office_16'] },
  { key: 'scouting', label: 'Intelligence / Scouting Lead', kind: 'role', tier: 'officer_corps', primaryKey: 'office_49', sourceKeys: ['office_49'] },
  { key: 'loot_council', label: 'Loot Council', kind: 'institution', tier: 'officer_corps', primaryKey: 'office_51', sourceKeys: ['office_51'] },
  { key: 'marshall', label: 'Marshall', kind: 'role', tier: 'officer_corps', primaryKey: 'office_52', sourceKeys: ['office_52'] },
  { key: 'profession_coordinator', label: 'Profession Coordinator', kind: 'role', tier: 'officer_corps', primaryKey: 'office_69', sourceKeys: ['office_69'] },
  { key: 'pvp_leadership', label: 'PvP Lead & Team Captains', kind: 'role', tier: 'officer_corps', primaryKey: 'office_71', sourceKeys: ['office_71', 'office_70'], contexts: { office_70: 'PvP Captain — leading an assigned group within an optional event', pvp_leader: 'PvP Leader — retained shared NA / EU evening activity guide' } },
  { key: 'raid_leader', label: 'Raid Leader', kind: 'role', tier: 'officer_corps', primaryKey: 'office_74', sourceKeys: ['office_74'] },
  { key: 'raid_assist', label: 'Raid Assist', kind: 'role', tier: 'officer_corps', primaryKey: 'office_73', sourceKeys: ['office_73'] },
  { key: 'tech_tools', label: 'Tech / Tools Officer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_82', sourceKeys: ['office_82'] },
  { key: 'technical_envoy', label: 'Technical Envoy', kind: 'role', tier: 'officer_corps', primaryKey: 'office_83', sourceKeys: ['office_83'] },
  { key: 'trial_officer', label: 'Trial Officer', kind: 'role', tier: 'officer_corps', primaryKey: 'office_88', sourceKeys: ['office_88'] },
  { key: 'welfare', label: 'Welfare / Community Support Lead', kind: 'role', tier: 'officer_corps', primaryKey: 'office_95', sourceKeys: ['office_95'] },
  { key: 'leveling', label: 'Leveling Lead', kind: 'role', tier: 'officer_corps', primaryKey: 'leveling', sourceKeys: ['leveling'] },
  { key: 'member', label: 'Guild Member', kind: 'role', tier: 'member_specialist', primaryKey: 'member', sourceKeys: ['member', 'office_55'], contexts: { office_55: 'Member — verified roster standing and everyday responsibilities' }, application: { applicationTrack: 'member', targetOffice: null } },
  { key: 'raider', label: 'Raider', kind: 'role', tier: 'member_specialist', primaryKey: 'raider', sourceKeys: ['raider', 'office_75'], contexts: { office_75: 'Raider — native rank association and ordinary raid preparation' }, application: { applicationTrack: 'raider', targetOffice: null } },
  { key: 'artisan', label: 'Artisan / Crafter', kind: 'role', tier: 'member_specialist', primaryKey: 'office_07', sourceKeys: ['office_07', 'office_27'], contexts: { office_27: 'Crafter — recipe commissions, delivery and entrusted materials' }, application: { applicationTrack: 'artisan', targetOffice: 'office_07' } },
  { key: 'mentor', label: 'Mentor', kind: 'role', tier: 'member_specialist', primaryKey: 'office_56', sourceKeys: ['office_56'] },
  { key: 'creative', label: 'Content Creation & Broadcasting', kind: 'activity', tier: 'member_specialist', primaryKey: 'office_23', sourceKeys: ['office_23', 'office_12', 'office_24'], contexts: { office_12: 'Broadcaster — consent, visible scenes and separate Stream Shield eligibility', office_24: 'Content / Stream Representative — participant and broadcast-team liaison' } },
  { key: 'pvp_team', label: 'Optional PvP Team', kind: 'activity', tier: 'member_specialist', primaryKey: 'pvp_team', sourceKeys: ['pvp_team'] },
  { key: 'alt', label: 'Verified Alt', kind: 'status', tier: 'member_specialist', primaryKey: 'office_04', sourceKeys: ['office_04'] },
  { key: 'social', label: 'Social / Casual Participation', kind: 'activity', tier: 'member_specialist', primaryKey: 'office_80', sourceKeys: ['office_80', 'office_13', 'office_05'], contexts: { office_13: 'Casual — flexible participation without a fixed progression commitment', office_05: 'Alt / Social Member — activity preference, distinct from Verified Alt identity' } },
  { key: 'raid_standing', label: 'Raid Team Standing', kind: 'status', tier: 'member_specialist', primaryKey: 'office_25', sourceKeys: ['office_25', 'office_11'], contexts: { office_11: 'Bench — an explicitly agreed standby period, not a punishment' } },
  { key: 'emeritus', label: 'Honorary / Emeritus Recognition', kind: 'status', tier: 'member_specialist', primaryKey: 'office_46', sourceKeys: ['office_46', 'office_91'], contexts: { office_91: 'Veteran Officer — former-service recognition without continuing officer access' } },
  { key: 'inactive', label: 'Inactive / Planned Absence', kind: 'status', tier: 'member_specialist', primaryKey: 'office_47', sourceKeys: ['office_47'] },
  { key: 'initiate', label: 'Initiate — New Member Orientation', kind: 'status', tier: 'member_specialist', primaryKey: 'office_48', sourceKeys: ['office_48'] },
  { key: 'recruit', label: 'Recruit / Pledge — Joining Status', kind: 'status', tier: 'member_specialist', primaryKey: 'office_76', sourceKeys: ['office_76', 'office_66'], contexts: { office_66: 'Pledge — introductory interest, not a guaranteed invitation' } },
  { key: 'trial', label: 'Trial & Raid Trial Status', kind: 'status', tier: 'member_specialist', primaryKey: 'office_87', sourceKeys: ['office_87', 'office_89'], contexts: { office_89: 'Trial Raider — assessment for a particular raid team' } },
  { key: 'probation', label: 'Probation — Written Review Conditions', kind: 'status', tier: 'member_specialist', primaryKey: 'office_68', sourceKeys: ['office_68'] },
  { key: 'moderation_restrictions', label: 'Moderation Restrictions & Review Holds', kind: 'status', tier: 'member_specialist', primaryKey: 'office_64', sourceKeys: ['office_64', 'office_61'], contexts: { office_61: 'Muted — the actual communication restriction and its appeal route' } },
  { key: 'tithe', label: 'Treasury Cosmetic Recognition — Paused', kind: 'status', tier: 'member_specialist', primaryKey: 'office_85', sourceKeys: ['office_85'] },
  { key: 'veteran', label: 'Veteran', kind: 'status', tier: 'member_specialist', primaryKey: 'office_90', sourceKeys: ['office_90'] },
  { key: 'vip', label: 'VIP / Courtesy Recognition', kind: 'status', tier: 'member_specialist', primaryKey: 'office_93', sourceKeys: ['office_93'] }
];

const rankFamilies203 = ['leader', 'high_council', 'officer', 'officer_alt', 'raid_leader', 'veteran', 'raider', 'member', 'alt', 'initiate'] as const;
const rows203 = new Map(OFFICE_APPOINTMENTS.map(row => [row.key, row]));
const ordinaryLabels203: Readonly<Record<string, string>> = { member: 'Guild Member', raider: 'Raider', pvp_team: 'PvP Team' };
const sourceLabel203 = (key: string): string => rows203.get(key)?.label ?? ordinaryLabels203[key] ?? key;

function directory203(): RoleDirectory203 {
  const sources = new Map<string, string[]>(), keyToFamily: Record<string, string> = {};
  const add = (familyKey: string, sourceKey: string): void => {
    if (keyToFamily[sourceKey]) throw new Error(`Duplicate .203 directory source: ${sourceKey}`);
    const list = sources.get(familyKey);
    if (!list) throw new Error(`Unknown .203 directory family: ${familyKey}`);
    list.push(sourceKey); keyToFamily[sourceKey] = familyKey;
  };
  for (const seed of seeds203) {
    if (sources.has(seed.key) || !seed.sourceKeys.includes(seed.primaryKey)) throw new Error(`Invalid .203 directory seed: ${seed.key}`);
    sources.set(seed.key, []);
    for (const sourceKey of seed.sourceKeys) add(seed.key, sourceKey);
  }
  // Preserve actual registered aliases, including the nine class guides and
  // region-specific detailed raid guides. They never create extra staff seats.
  for (const row of OFFICE_APPOINTMENTS) {
    if (keyToFamily[row.key]) continue;
    const familyKey = row.group === 'native' && row.nativeIndex !== undefined ? rankFamilies203[row.nativeIndex] : row.aliasOf ? keyToFamily[row.aliasOf] : undefined;
    if (!familyKey) throw new Error(`Unmapped .203 directory source: ${row.key}`);
    add(familyKey, row.key);
  }
  const expected = [...OFFICE_APPOINTMENTS.map(row => row.key), 'member', 'raider', 'pvp_team'].sort();
  if (expected.length !== 134 || new Set(expected).size !== 134 || JSON.stringify(Object.keys(keyToFamily).sort()) !== JSON.stringify(expected)) throw new Error('Incomplete .203 directory source coverage');

  const families = seeds203.map(seed => {
    const sourceKeys = sources.get(seed.key)!;
    for (const key of sourceKeys) {
      const row = rows203.get(key);
      if (row && row.tier !== seed.tier) throw new Error(`Cross-authority .203 directory family: ${key}`);
    }
    const variants = sourceKeys.filter(key => key !== seed.primaryKey).map(key => {
      const row = rows203.get(key);
      const kind: RoleVariantKind203 = key.startsWith('class_lead:') ? 'class' : /^raid_(?:leader|assist)_(?:na|eu)$/.test(key) ? 'region' : key === 'rank_treasurer' ? 'historical' : 'subrole';
      const label = seed.contexts?.[key] ?? (row?.group === 'native' ? `${row.label} — native rank ${row.nativeRankOrdinal} (slot ${row.nativeSlot})` : sourceLabel203(key));
      return Object.freeze({ key, label, kind });
    });
    const alternateTitles = [...new Set(sourceKeys.map(sourceLabel203).filter(label => label !== seed.label && label !== sourceLabel203(seed.primaryKey)))];
    return Object.freeze({ key: seed.key, label: seed.label, kind: seed.kind, tier: seed.tier, primaryKey: seed.primaryKey, sourceKeys: Object.freeze([...sourceKeys]), alternateTitles: Object.freeze(alternateTitles), variants: Object.freeze(variants), ...(seed.application ? { application: Object.freeze({ ...seed.application }) } : {}) });
  });
  const ranks = NATIVE_RANKS_199.map(rank => Object.freeze({ nativeSlot: rank.nativeSlot, nativeRankOrdinal: rank.nativeRankOrdinal, label: rank.name, familyKey: rankFamilies203[rank.nativeSlot] }));
  return Object.freeze({ version: 1, families: Object.freeze(families), ranks: Object.freeze(ranks), keyToFamily: Object.freeze(keyToFamily), sourceKeyCount: 134 });
}

/** Plain serializable display metadata. It is not read by backend admission. */
export const ROLE_DIRECTORY_203: RoleDirectory203 = directory203();
