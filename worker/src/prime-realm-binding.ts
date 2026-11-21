import { sha256 } from './account-generation-contracts';
import { linksNotBefore } from './db';
import type { Env } from './env';
import type { LaunchNativeScope } from './launch-verification227';
import { NATIVE_GUILD232, NATIVE_SCOPE232 } from './native-rank-reconciliation232';
import { directiveMemberRanks, nativeMembershipSourceMatches } from './native-rank-schemes';
import { PRIME_GUILD_MASTER_SHA256 } from './prime-realm-enrollment';
import type { RosterMemberIn } from './roster';

export type NativeRosterBody = {
  exportedAt: number;
  members: RosterMemberIn[];
  nativeGuild?: string;
  nativeRealm?: string;
  nativeRankTable?: unknown;
  nativeScopeBinding?: unknown;
  nativeRosterTotal?: unknown;
};
type Predecessor = {id:number; exported_at:number; source:string; member_count:number};
export type PrimeRosterBinding = Readonly<{previous:Predecessor; observer:string; guids:string}>;
const nativeGuid = /^Player-\d{1,6}-[0-9A-Fa-f]{8,16}$/;

export async function enrolledPrimeMaster(env:Env, scope:LaunchNativeScope, observer:unknown):Promise<boolean> {
  return env.GUILD_ID===NATIVE_GUILD232 && scope.guild===NATIVE_SCOPE232.guild && scope.realm===NATIVE_SCOPE232.realm &&
    typeof observer==='string' && nativeGuid.test(observer) && await sha256('prime-guild-master|1|'+observer)===PRIME_GUILD_MASTER_SHA256;
}

// The predecessor can be old (a collector reconnecting), but it must be the most recent
// completed observation, trusted, in this exact scope, and from the current launch.
// Require the same sole leader and a strict majority of BOTH rosters' GUIDs in common.
const continuityQuery = `SELECT COUNT(*) AS matched FROM roster_members r WHERE r.snapshot_id=?1
  HAVING COUNT(*)=?2 AND SUM(CASE WHEN r.rank_index=0 OR r.rank='Guild Master' THEN 1 ELSE 0 END)=1
  AND SUM(CASE WHEN r.rank_index=0 AND r.rank='Guild Master' AND r.guid=?3 THEN 1 ELSE 0 END)=1
  AND COUNT(CASE WHEN r.guid=?3 COLLATE NOCASE THEN 1 END)=1
  AND 2*COUNT(DISTINCT CASE WHEN r.guid IN (SELECT value FROM json_each(?4)) THEN r.guid END)>MAX(?2,?5)`;

export async function admitPrimeRoster(env:Env, scope:LaunchNativeScope, body:NativeRosterBody):Promise<PrimeRosterBinding|null> {
  const at = Math.floor(Date.now()/1000);
  if (env.GUILD_ID!==NATIVE_GUILD232 || scope.guild!==NATIVE_SCOPE232.guild || scope.realm!==NATIVE_SCOPE232.realm ||
      body.nativeGuild!==scope.guild || body.nativeRealm!=='' || !Number.isSafeInteger(body.exportedAt) ||
      body.exportedAt<=at-600 || body.exportedAt>at || !Array.isArray(body.members) || body.members.length<1 ||
      body.members.length>1000 || body.nativeRosterTotal!==body.members.length) return null;
  const marker=body.nativeScopeBinding;
  if (!marker || typeof marker!=='object' || Object.keys(marker).sort().join(',')!=='kind,observerGuid,version') return null;
  const {version,kind,observerGuid:observer}=marker as Record<string,unknown>;
  if (version!==1 || kind!=='prime-guild-master' || typeof observer!=='string' || !await enrolledPrimeMaster(env,scope,observer)) return null;
  const guids:string[]=[];
  let masterCount=0;
  for (const row of body.members) {
    if (!row || typeof row.name!=='string' || !row.name.trim() || typeof row.guid!=='string' || !nativeGuid.test(row.guid)) return null;
    guids.push(row.guid);
    if (row.rankIndex===0 || row.rank==='Guild Master') {
      if (row.rankIndex!==0 || row.rank!=='Guild Master' || row.guid!==observer) return null;
      masterCount++;
    }
  }
  if (masterCount!==1 || new Set(guids.map(guid=>guid.toLowerCase())).size!==guids.length ||
      !directiveMemberRanks(body.members,body.nativeRankTable)) return null;
  const previous=await env.DB.prepare(`SELECT id,exported_at,source,member_count,complete,trusted FROM roster_snapshots
    WHERE complete IS NOT 0 ORDER BY id DESC LIMIT 1`).first<Predecessor & {complete:number;trusted:number}>();
  if (!previous || previous.complete!==1 || previous.trusted!==1 || previous.exported_at<linksNotBefore(env) ||
      previous.exported_at>body.exportedAt || !nativeMembershipSourceMatches(previous.source,scope.guild,scope.realm)) return null;
  const serialized=JSON.stringify(guids);
  const overlap=await env.DB.prepare(continuityQuery)
    .bind(previous.id,previous.member_count,observer,serialized,guids.length).first();
  return overlap ? {previous,observer,guids:serialized} : null;
}

// Called in the SAME transaction as the completion stamp or identical-snapshot refresh.
// A concurrent newer snapshot, loss of trust, or expiry aborts the transaction.
export function recordPrimeBinding(env:Env, binding:PrimeRosterBinding, snapshot:number, at:number, total:number):D1PreparedStatement {
  const {previous,observer,guids}=binding;
  return env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details)
    VALUES(unixepoch(),'watcher','roster.prime_realm_binding',CAST(CAST(?6 AS INTEGER) AS TEXT),
      CASE WHEN ?7>unixepoch()-600 AND ?7<=unixepoch() AND ?6=(SELECT MAX(id) FROM roster_snapshots)
        AND ?1=(SELECT MAX(id) FROM roster_snapshots WHERE complete IS NOT 0)
        AND EXISTS(SELECT 1 FROM roster_snapshots WHERE id=?1 AND complete=1 AND trusted=1 AND source=?8 AND exported_at=?9)
        AND (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=?6)=?5
        AND EXISTS(${continuityQuery})
      THEN json_object('version',1,'kind','prime-guild-master','nativeRealm','','previousSnapshot',CAST(?1 AS INTEGER),'exportedAt',CAST(?7 AS INTEGER))
      ELSE json_extract('prime_roster_continuity_changed','$') END)`)
    .bind(previous.id,previous.member_count,observer,guids,total,snapshot,at,previous.source,previous.exported_at);
}
