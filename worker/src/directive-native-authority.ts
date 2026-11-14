/** Source-authored current-rank predicates only; neither a Boolean nor this SQL
 * is an operation capability. Callers retain their original Native issuer,
 * snapshot/generation/config capture and adjacent effect/settlement CAS. */
import {DIRECTIVE_RANK_NAMES,qualifiedNativeSnapshotSource} from './native-rank-schemes';

const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
/** Keep the actual D1 expression depth bounded when composed into Native CAS. */
export function directiveAndSql280(parts:readonly string[]):string{
 if(parts.length===0)return '1=1';if(parts.length===1)return '('+parts[0]+')';
 const half=Math.floor(parts.length/2);return '('+directiveAndSql280(parts.slice(0,half))+' AND '+directiveAndSql280(parts.slice(half))+')';
}
export function directiveRankSource280(guild:string,realm:string):string{return qualifiedNativeSnapshotSource(guild,realm);}
export function directiveRankRowSql280(alias:string):string{
 if(!/^[a-z][a-z0-9_]*$/.test(alias))throw Error('directive_rank_sql_alias');
 return directiveAndSql280([`typeof(${alias}.rank_index)='integer'`,`${alias}.rank_index BETWEEN 0 AND 9`,`typeof(${alias}.rank)='text'`,`${alias}.rank=(CASE ${alias}.rank_index ${DIRECTIVE_RANK_NAMES.map((name,index)=>`WHEN ${index} THEN ${literal(name)}`).join(' ')} END)`]);
}
/** Equality binds the complete actually observed ten-name table, including empty
 * ranks. Every row is checked too; GM0/Initiate9 alone cannot attest the scheme. */
export function directiveSnapshotSql280(snapshot:string,guild:string,realm:string):string{
 if(!/^(?:\?[1-9][0-9]*|[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)$/.test(snapshot))throw Error('directive_rank_snapshot_sql');
 return `EXISTS(SELECT 1 FROM roster_snapshots directive280 WHERE ${directiveAndSql280([
  `directive280.id=${snapshot}`,`directive280.id=(SELECT MAX(id) FROM roster_snapshots)`,`directive280.complete=1`,`directive280.trusted=1`,
  `directive280.source=${literal(qualifiedNativeSnapshotSource(guild,realm))}`,`typeof(directive280.exported_at)='integer'`,
  `directive280.exported_at<=CAST(strftime('%s','now') AS INTEGER)`,`directive280.exported_at>CAST(strftime('%s','now') AS INTEGER)-600`,
  `typeof(directive280.member_count)='integer'`,`directive280.member_count BETWEEN 1 AND 1000`,
  `directive280.member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=directive280.id)`,
  `NOT EXISTS(SELECT 1 FROM roster_members directive_row280 WHERE directive_row280.snapshot_id=directive280.id AND NOT(${directiveRankRowSql280('directive_row280')}))`
 ])})`;
}
