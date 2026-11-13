/** Policy-specific rank-source checks only. These predicates never mint an
 * issuer, identity, ownership ACK or permission to dispatch a role effect. */
import {currentOriginalCanonicalPolicy233,currentDirectiveCanonicalPolicy233,NATIVE_NAMES233,type CanonicalRankPolicy233} from './canonical-ranks233';
import {nativeSnapshotSource,qualifiedNativeSnapshotSource} from './native-rank-schemes';
import {directiveAndSql280,directiveSnapshotSql280} from './directive-native-authority';
import {parseLaunchNativeScope} from './launch-verification227';

export type CanonicalRankSource280='original-native-v1'|'original-native-v2'|'directive-native-v2';
const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
function originalV1(guild:string,realm:string):string{
 const scope=parseLaunchNativeScope(JSON.stringify({version:1,guild,realm}));
 if(!scope)throw Error('canonical_original_native_scope');
 return scope.provenance;
}
/** This is exactly the current ingress factory's observed original-ten table,
 * not arbitrary null profile/digest metadata or one shared name/index pair. */
export function originalCanonicalSnapshotSource280(guild:string,realm:string):string{
 return nativeSnapshotSource(guild,realm,{version:1,names:NATIVE_NAMES233},[]);
}
export function canonicalRankSource280(policy:CanonicalRankPolicy233|null,source:string,guild:string,realm:string):CanonicalRankSource280|null{
 if(currentDirectiveCanonicalPolicy233(policy))return source===qualifiedNativeSnapshotSource(guild,realm)?'directive-native-v2':null;
 if(!currentOriginalCanonicalPolicy233(policy))return null;
 if(source===originalV1(guild,realm))return 'original-native-v1';
 return source===originalCanonicalSnapshotSource280(guild,realm)?'original-native-v2':null;
}
/** Match only the original issuer's captured profile. The Directive branch
 * explicitly retains its pre-existing whole-table rankQualified witness. */
export function canonicalRankWitnessMatches280(policy:CanonicalRankPolicy233|null,capturedProfile:string|null,rankQualified:boolean):boolean{
 return currentOriginalCanonicalPolicy233(policy)&&capturedProfile===policy.profile
  ||currentDirectiveCanonicalPolicy233(policy)&&rankQualified&&capturedProfile===policy.profile;
}
function originalRankRow(alias:string):string{
 return directiveAndSql280([`typeof(${alias}.rank_index)='integer'`,`${alias}.rank_index BETWEEN 0 AND 9`,`typeof(${alias}.rank)='text'`,
  `${alias}.rank=(CASE ${alias}.rank_index ${NATIVE_NAMES233.map((name,index)=>`WHEN ${index} THEN ${literal(name)}`).join(' ')} END)`]);
}
/** V1 transport retains its original per-linked-character unknown-rank rules.
 * V2 carries an observed whole table, so every row must match that exact table.
 * All callers still bind their captured snapshot/source and original Native CAS. */
export function canonicalRankSnapshotSql280(policy:CanonicalRankPolicy233|null,snapshot:string,guild:string,realm:string):string{
 if(currentDirectiveCanonicalPolicy233(policy))return directiveSnapshotSql280(snapshot,guild,realm);
 if(!currentOriginalCanonicalPolicy233(policy))return '0';
 if(!/^(?:\?[1-9][0-9]*|[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)$/.test(snapshot))throw Error('canonical_rank_snapshot_sql');
 const source=`(canonical_scope280.source=${literal(originalV1(guild,realm))} OR (canonical_scope280.source=${literal(originalCanonicalSnapshotSource280(guild,realm))}
  AND NOT EXISTS(SELECT 1 FROM roster_members canonical_row280 WHERE canonical_row280.snapshot_id=canonical_scope280.id AND NOT(${originalRankRow('canonical_row280')}))))`;
 return `EXISTS(SELECT 1 FROM roster_snapshots canonical_scope280 WHERE ${directiveAndSql280([
  `canonical_scope280.id=${snapshot}`,`canonical_scope280.id=(SELECT MAX(id) FROM roster_snapshots)`,`canonical_scope280.complete=1`,`canonical_scope280.trusted=1`,source,
  `typeof(canonical_scope280.exported_at)='integer'`,`canonical_scope280.exported_at<=CAST(strftime('%s','now') AS INTEGER)`,`canonical_scope280.exported_at>CAST(strftime('%s','now') AS INTEGER)-600`,
  `typeof(canonical_scope280.member_count)='integer'`,`canonical_scope280.member_count BETWEEN 1 AND 1000`,
  `canonical_scope280.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=canonical_scope280.id)`
 ])})`;
}
