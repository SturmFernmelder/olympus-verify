/** Current launch recommendations only. No D1/provider/native writes or role authority. */
import { FLAGSHIP_GUILD_NAME, canonicalOlympusGuildName, isApprovedNativeGuildName } from './guild-affiliation229';
import type { OfficerInvite233 } from './officer-invites233';
// The owner's .233 live ladder targets supersede the launch draft's historical slots.
export const LAUNCH_OPERATIONS_PROTOCOL229 = 'officer-operations-v233' as const;
export const LAUNCH_ROLE_TTL229 = 60;
export const LAUNCH_SCAN_TTL229 = 600;
export const LAUNCH_ROLE_PAGE229 = 20;
/** Exact current curated Asmongold ladder; position, administrator and names grant nothing. */
export const KNIGHT_ROLE_IDS229 = Object.freeze([
  '1299841745550311535', '1299841829620945037', '1301930729629814864',
  '1301932500251312138', '1301938975052795966', '1301939231362515026',
  '1301939685316104275', '1301939929995149344', '1301940236695240825',
] as const);
export type KnightState229 = 'knight' | 'non-knight' | 'unknown';
/** This classifier accepts only a fresh server response supplied by its caller, never user claims. */
export function classifyKnightRoles229(roles: unknown): KnightState229 {
  if (!Array.isArray(roles) || roles.length > 250 || roles.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)) || new Set(roles).size !== roles.length) return 'unknown';
  return roles.some(id => (KNIGHT_ROLE_IDS229 as readonly string[]).includes(id)) ? 'knight' : 'non-knight';
}
export interface LaunchRosterRow229 {
  name: string; guid: string; currentSlot: number | null; rank: string | null;
  verification: 'verified' | 'unverified' | 'pending' | 'unknown';
  level: number | null; lastOnlineSeconds: number | null;
}
export interface LaunchRosterSource229 {
  snapshotId: number; snapshotAt: number; memberCount: number;
  guild: string; realm: string; scopeHash: string;
}
export function launchMotd229() {
  const short = 'olympus.roachcouncil.com #olympus-verify: whisper Fern Melder code! Verified=Member; Knights=Veteran. Initiates get kicked!';
  const bytes = new TextEncoder().encode(short).byteLength;
  if (bytes > 128 || !/^[\x20-\x7e]+$/.test(short)) throw Error('launch_motd_limit');
  const bulletin = [
    'OLYMPUS PRIME is the flagship; OLYMPUS and Olympus I are its aliases.',
    'Link Discord through #olympus-verify or olympus.roachcouncil.com. Current Knight-or-higher entitlement is checked from the exact Discord role ladder.',
    'A Knight invite requires a fresh native observation that the same whispering GUID is actually unguilded. Missing or ambiguous guild information is unknown and stays held.',
    'Linked Knights below Veteran are recommended for Veteran, native index 6. Other verified Initiates are recommended for Member, native index 8. The owner confirmed the current live names and indices on 6 November 2026. Native rank name/index, GUID, guild, realm and permission are checked again for each hardware action.',
    'Unverified Initiates are shown separately for human space review, longest offline and then lowest level first. Pending and unknown verification stay held. No automatic purge, role grant or rank change is performed.',
  ].join('\n\n');
  return Object.freeze({short, bulletin, characters: short.length, bytes, maxBytes: 128 as const});
}
export interface LaunchPromotion229 { name: string; guid: string; currentSlot: number; targetSlot: 6 | 8; targetName: 'Veteran' | 'Member'; reason: 'knight-veteran' | 'verified-initiate' }
export interface LaunchRisk229 { name: string; guid: string; currentSlot: 9; level: number | null; lastOnlineDays: number | null; reason: 'unverified-initiate'; reviewOnly: true }
export interface LaunchHeld229 { name: string; guid: string; reason: string }
const nativeLabels: Readonly<Record<number, string>> = Object.freeze({0: 'Guild Master', 1: 'Stewart', 2: 'High Council', 3: 'Officer', 4: 'Officer Alt', 5: 'Raid Leader', 6: 'Veteran', 7: 'Raider', 8: 'Member', 9: 'Initiate'});
/** Already-at/above Veteran rows cannot produce a promotion; don't spend Discord reads on them. */
export function needsLaunchRole229(row: LaunchRosterRow229): boolean {
  return row.verification === 'verified' && Number.isInteger(row.currentSlot) && row.currentSlot !== null
    && row.currentSlot > 6 && row.currentSlot <= 9 && nativeLabels[row.currentSlot] === row.rank;
}
export function projectLaunchOperations229(source: LaunchRosterSource229 | null, rows: readonly LaunchRosterRow229[], knightByGuid: ReadonlyMap<string, KnightState229>, at: number, expiresAt: number) {
  const heldReasons: string[] = ['native-unguilded-proof-required'];
  const promotions: LaunchPromotion229[] = [], riskBuffer: LaunchRisk229[] = [], held: LaunchHeld229[] = [];
  const envelope = {
    protocol: LAUNCH_OPERATIONS_PROTOCOL229, fetchedAt: at, expiresAt,
    status: 'held' as 'held' | 'ready' | 'partial',
    snapshotId: source?.snapshotId ?? null, snapshotAt: source?.snapshotAt ?? null, memberCount: source?.memberCount ?? null,
    guild: source?.guild ?? null, canonicalGuild: source ? canonicalOlympusGuildName(source.guild) : null,
    realm: source?.realm ?? null, scopeHash: source?.scopeHash ?? null,
    entitlements: {offset: 0, pageSize: LAUNCH_ROLE_PAGE229, scanned: knightByGuid.size, total: rows.filter(r => r.verification === 'verified').length, unscanned: 0, retryAfterSeconds: null as number | null},
    scan: {id: null as string | null, startedAt: null as number | null, expiresAt: null as number | null},
    pageCursor: null as string | null, nextCursor: null as string | null, invites: [] as OfficerInvite233[], promotions, riskBuffer, held, heldReasons, motd: launchMotd229(),
    actions: {automatic: false, roleGrants: false, removals: false, requiresNativeRecheck: true},
  };
  if (!Number.isSafeInteger(at) || !Number.isSafeInteger(expiresAt) || expiresAt <= at || expiresAt > at + LAUNCH_ROLE_TTL229) heldReasons.push('entitlement-expired');
  if (!source || !Number.isSafeInteger(source.snapshotId) || source.snapshotId < 1 || !Number.isSafeInteger(source.snapshotAt) || source.snapshotAt > at || source.snapshotAt <= at - 600
    || !Number.isSafeInteger(source.memberCount) || source.memberCount < 1 || source.memberCount > 1000 || rows.length !== source.memberCount
    || !isApprovedNativeGuildName(source.guild) || canonicalOlympusGuildName(source.guild) !== FLAGSHIP_GUILD_NAME || !source.realm || source.realm.length > 96 || /[\x00-\x1f\x7f]/.test(source.realm) || !/^[a-f0-9]{16}$/.test(source.scopeHash)) heldReasons.push('native-snapshot-unavailable');
  const names = new Set<string>(), guids = new Set<string>();
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name.toLowerCase() : '';
    if (!name || row.name.length > 96 || /[\x00-\x1f\x7f]/.test(row.name) || !/^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/.test(row.guid) || names.has(name) || guids.has(row.guid)) heldReasons.push('native-identity-ambiguous');
    names.add(name); guids.add(row.guid);
  }
  if (heldReasons.length > 1) return envelope;
  for (const row of rows) {
    const slot = row.currentSlot, identity = {name: row.name, guid: row.guid};
    if (!Number.isInteger(slot) || slot === null || slot < 0 || slot > 9 || nativeLabels[slot] !== row.rank) { held.push({...identity, reason: 'native-rank-unconfirmed'}); continue; }
    if (row.verification === 'pending' || row.verification === 'unknown') { held.push({...identity, reason: row.verification === 'pending' ? 'pending-verification' : 'verification-unknown'}); continue; }
    if (row.verification === 'unverified') {
      if (slot === 9 && row.rank === 'Initiate') riskBuffer.push({...identity, currentSlot: 9, level: Number.isInteger(row.level) && row.level! >= 1 && row.level! <= 255 ? row.level : null, lastOnlineDays: typeof row.lastOnlineSeconds === 'number' && Number.isFinite(row.lastOnlineSeconds) && row.lastOnlineSeconds > 0 && row.lastOnlineSeconds <= 10 * 366 * 86400 ? row.lastOnlineSeconds / 86400 : null, reason: 'unverified-initiate', reviewOnly: true});
      continue;
    }
    if (slot <= 6) continue;
    const knight = knightByGuid.get(row.guid) ?? 'unknown';
    if (knight === 'unknown') { held.push({...identity, reason: 'discord-entitlement-unknown'}); continue; }
    if (knight === 'knight' && slot > 6) promotions.push({...identity, currentSlot: slot, targetSlot: 6, targetName: 'Veteran', reason: 'knight-veteran'});
    else if (knight === 'non-knight' && slot === 9 && row.rank === 'Initiate') promotions.push({...identity, currentSlot: slot, targetSlot: 8, targetName: 'Member', reason: 'verified-initiate'});
  }
  promotions.sort((a, b) => a.targetSlot - b.targetSlot || a.name.localeCompare(b.name, 'en'));
  riskBuffer.sort((a, b) => (b.lastOnlineDays ?? -1) - (a.lastOnlineDays ?? -1) || (a.level ?? Infinity) - (b.level ?? Infinity) || a.name.localeCompare(b.name, 'en'));
  envelope.entitlements.unscanned = held.filter(r => r.reason === 'discord-entitlement-unknown').length;
  envelope.status = envelope.entitlements.unscanned ? 'partial' : 'ready';
  return envelope;
}
