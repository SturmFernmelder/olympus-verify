/** Candidate Link membership needs the same ten-minute exact Native roster fence as
 * whisper admission (owner integration contract, 11 November 2026). This read
 * capability never proves character control, rank authority or a role outcome. */
import type { Env } from './env';
import { linksNotBefore } from './db';
import { captureLaunchVerification } from './launch-verification227';
import { privacyProviderCustodyDatabase } from './privacy-serving-authority';

declare const rosterBrand: unique symbol;
export type LiveLinkRoster = Readonly<{ [rosterBrand]: true }>;
export type LiveLinkRosterFacts = Readonly<{ snapshotId: number; exportedAt: number; nameKey: string; guid: string; provenance: string; cutoff: number }>;
type Saved = { facts: LiveLinkRosterFacts; sourceEnv: Env; sourceDB: D1Database; database: D1Database; check: () => void };
const originals = new WeakMap<LiveLinkRoster, Saved>();
const fail = (): never => { throw Error('live_link_roster_held'); };
const CURRENT = `EXISTS(SELECT 1 FROM roster_snapshots s JOIN roster_members r ON r.snapshot_id=s.id
 WHERE s.id=?1 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.exported_at=?2
 AND s.source=?3 AND s.complete=1 AND s.trusted=1
 AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER)
 AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at>=?4
 AND r.name_key=?5 AND r.guid=?6
 AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=?6)=1)`;

/** Only a current original D1 read can issue this capability; copied facts cannot. */
export async function captureLiveLinkRoster(env: Env, nameKey: string, guid: string): Promise<LiveLinkRoster | null> {
  try {
    if (!nameKey || !/^Player-[1-9][0-9]{0,5}-[0-9A-F]{8}$/.test(guid)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(env, 'DB');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.value) return null;
    const launch = captureLaunchVerification(env), sourceDB = descriptor.value as D1Database, cutoff = linksNotBefore(env);
    if (launch.mode !== 'members-only' || !launch.scope || !launch.current()) return null;
    const provenance = launch.scope.provenance;
    const check = () => { if (!launch.current() || env.DB !== sourceDB || linksNotBefore(env) !== cutoff) fail(); };
    check();
    const row = await sourceDB.prepare(`SELECT s.id,s.exported_at FROM roster_snapshots s
      WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.source=?1 AND s.complete=1 AND s.trusted=1
      AND s.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id)
      AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER)
      AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at>=?2
      AND EXISTS(SELECT 1 FROM roster_members WHERE snapshot_id=s.id AND name_key=?3 AND guid=?4)
      AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=s.id AND guid=?4)=1`)
      .bind(provenance, cutoff, nameKey, guid).first<{ id: number; exported_at: number }>();
    check();
    if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || !Number.isSafeInteger(row.exported_at)) return null;
    const facts = Object.freeze({ snapshotId: row.id, exportedAt: row.exported_at, nameKey, guid, provenance, cutoff });
    const database = privacyProviderCustodyDatabase(env), cap = Object.freeze({}) as LiveLinkRoster;
    check(); originals.set(cap, { facts, sourceEnv: env, sourceDB, database, check });
    return cap;
  } catch { return null; }
}

export function liveLinkRosterFacts(cap: LiveLinkRoster): LiveLinkRosterFacts {
  const saved = originals.get(cap); if (!saved) return fail(); saved.check(); return saved.facts;
}
/** Repeat the exact latest snapshot/source/name/GUID/freshness at consumption and
 * every central writer admission, including the final pre-effect read. */
export function liveLinkRosterPredicate(env: Env, cap: LiveLinkRoster, start = 1): Readonly<{ sql: string; values: readonly (string | number)[]; next: number }> {
  const saved = originals.get(cap); if (!saved || !Number.isSafeInteger(start) || start < 1 || start > 90) return fail();
  saved.check();
  const descriptor = Object.getOwnPropertyDescriptor(env, 'DB');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !(descriptor.value === saved.database || env === saved.sourceEnv && descriptor.value === saved.sourceDB)) return fail();
  const f = saved.facts;
  return Object.freeze({ sql: CURRENT.replace(/\?(\d+)/g, (_all, n) => '?' + (start + Number(n) - 1)),
    values: Object.freeze([f.snapshotId, f.exportedAt, f.provenance, f.cutoff, f.nameKey, f.guid]), next: start + 6 });
}
