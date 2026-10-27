/** .199 owner direction: bounded application intent in the existing owned answers JSON.
 * A request is neither an appointment nor a role/access/payment authorization. */
import { APPLICATION_TRACKS_199, OFFICE_APPOINTMENTS } from './governance-offices';

export interface ApplicationIntent199 { applicationTrack: string; targetOffice: string | null }
type InvalidIntent = { error: 'invalid'; field: string; message: string };
const invalid = (field: string, message: string): InvalidIntent => ({ error: 'invalid', field, message });
const tracks = new Set<string>(APPLICATION_TRACKS_199.map(row => row.id));
const officeByKey = new Map<string, (typeof OFFICE_APPOINTMENTS)[number]>(OFFICE_APPOINTMENTS.map(row => [row.key, row]));
const noApplicationRoles199:readonly string[] = Object.freeze([]);
const reservedTiers201 = new Set(['leader', 'high_council', 'officer_corps']);
const reservedRoleKeys201 = new Set<string>([
  // The owner made these seats appointment-only on 2026-10-26. Keep their
  // historical vocabulary below: old applications and ballots are evidence,
  // while this separate admission rule applies only to a current save.
  'class_lead', 'raid_leader', 'raid_assist',
  ...OFFICE_APPOINTMENTS.filter(row => reservedTiers201.has(row.tier))
    .flatMap(row => [row.key, ...row.applicationRoleKeys]),
]);
export interface ReservedApplication201 { error: 'reserved_seat'; field: string; message: string }
const reserved201 = (field: string): ReservedApplication201 => ({ error: 'reserved_seat', field,
  message: 'Leader, High Council and Officer Corps roles are reserved seats filled by appointment. You cannot apply for them. Your existing application is unchanged; choose an eligible membership, Raider or Artisan role, or withdraw it.' });

/** Refuse explicit reserved intent before a current application can be written.
 * Inspect both encodings so a safe top-level value cannot hide a reserved nested
 * value. Canonical DTO parsing remains independent of today's admission policy. */
export function reservedApplication201(body: Record<string, unknown>): ReservedApplication201 | null {
  const nested = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
    ? body.answers as Record<string, unknown> : {};
  for (const raw of [body, nested]) {
    if (raw.applicationTrack === 'officer' || raw.applicationTrack === 'high_council') return reserved201('applicationTrack');
    if (typeof raw.targetOffice === 'string' && reservedRoleKeys201.has(raw.targetOffice)) return reserved201('targetOffice');
    for (const field of ['position', 'firstChoice', 'backup1', 'backup2'] as const) {
      if (typeof raw[field] === 'string' && reservedRoleKeys201.has(raw[field])) return reserved201(field === 'backup1' || field === 'backup2' ? 'backups' : field);
    }
    if (Array.isArray(raw.backups) && raw.backups.some(key => typeof key === 'string' && reservedRoleKeys201.has(key))) return reserved201('backups');
  }
  return null;
}
/** Canonical title intents reuse existing regional/class ballots rather than making duplicate seats. */
export function applicationRoleKeys199(targetOffice:unknown):readonly string[] {
  if (typeof targetOffice !== 'string') return noApplicationRoles199;
  return officeByKey.get(targetOffice)?.applicationRoleKeys ?? noApplicationRoles199;
}

export function validateApplicationIntent199(track: unknown, office: unknown, taken: (key: string) => boolean): ApplicationIntent199 | InvalidIntent | null {
  if (track === undefined && office === undefined) return null; // Historical applications retain their original meaning.
  if (typeof track !== 'string' || !tracks.has(track)) return invalid('applicationTrack', 'Choose a supported application category.');
  if (office !== undefined && office !== null && typeof office !== 'string') return invalid('targetOffice', 'Choose a supported office from the picker.');
  const key = typeof office === 'string' ? office : '';
  if (key.length > 80) return invalid('targetOffice', 'That office key is too long.');
  if (track === 'officer' || track === 'high_council') {
    const target = officeByKey.get(key);
    if (!target || !target.applicationEligible || target.applicationTrack !== track) return invalid('targetOffice', 'Choose a specific eligible office in this application track.');
    if (taken(key)) return invalid('targetOffice', 'This office has an appointment recorded. Choose another seat or ask leadership to review its availability.');
  } else if (key) {
    const target = officeByKey.get(key);
    if (!target || !target.applicationEligible || target.applicationTrack !== track || taken(key)) return invalid('targetOffice', 'That office is not available for this application track.');
  }
  return { applicationTrack: track, targetOffice: key || null };
}

/** Board DTOs use only canonical bounded descriptors, never arbitrary stored text. */
export function applicationIntentDto199(answers: Record<string, unknown>): ApplicationIntent199 | null {
  const value = validateApplicationIntent199(answers.applicationTrack, answers.targetOffice, () => false);
  return value && !('error' in value) ? value : null;
}
