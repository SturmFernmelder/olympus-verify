/** Shared read-only classification. A historical identity receipt is not a role
 * acknowledgement, current provider membership or an effect capability. */
import type { Env } from './env';
import type { LaunchVerificationCapture } from './launch-verification227';
import { captureCanonicalRankConfig233,CANONICAL_PROFILE233 } from './canonical-ranks233';
import { captureNativeRankConfig232,historicalNativeRankPolicy232,NATIVE_RANK_NAMES232,NATIVE_RANK_PROFILE232,NATIVE_SCOPE232,NATIVE_GUILD232,SHARED_MEMBER232 } from './native-rank-reconciliation232';

const byteHex=(column:string,size:number)=>`((typeof(${column})='text' AND length(${column})=${size}) AND (length(CAST(${column} AS BLOB))=${size} AND instr(${column},char(0))=0 AND ${column} NOT GLOB '*[^0-9a-f]*'))`;
const rankName232='CASE a.native_rank '+NATIVE_RANK_NAMES232.map((name,index)=>`WHEN ${index} THEN '${name}'`).join(' ')+' END';
export const recognizedMembershipAnchor232=(policy:string,canonical="'null'",cutoff='0')=>`((a.subject=c.discord_id AND a.subject_generation IS p.generation AND a.guild_id='${NATIVE_GUILD232}')
 AND (a.native_guid=c.guid AND a.desired=1 AND a.state='settled') AND (typeof(a.checked_at)='integer' AND a.checked_at>=a.created_at AND a.checked_at<a.expires_at)
 AND ((typeof(a.created_at)='integer' AND typeof(a.expires_at)='integer') AND (a.expires_at>a.created_at AND a.expires_at<=a.created_at+300))
 AND ((a.created_at>=c.bound_at AND a.created_at>=c.verified_at) AND (a.created_at>=${cutoff} AND a.created_at<=CAST(strftime('%s','now') AS INTEGER)))
 AND (${byteHex('a.id',32)} AND ${byteHex('a.request_digest',64)}))
 AND ((a.purpose='launch_membership230' AND a.native_profile='prime-native-230' AND a.role_id='${SHARED_MEMBER232}' AND a.native_rank IS NULL AND a.native_rank_name IS NULL
 AND ((a.attempts=1 AND ${byteHex('a.claim_nonce',32)} AND a.reason='launch230_put_acknowledged_and_confirmed')
 OR (a.attempts=0 AND a.claim_nonce IS NULL AND a.reason='launch230_current_role_observed')))
 OR (a.native_profile='${NATIVE_RANK_PROFILE232}' AND ((typeof(a.native_rank)='integer' AND a.native_rank BETWEEN 0 AND 9) AND a.native_rank_name=(${rankName232})) AND (
 (a.purpose='launch_routine_membership232' AND a.role_id='${SHARED_MEMBER232}')
 OR (a.purpose='fresh_roster_rank' AND a.role_id=json_extract(${policy},'$.ranks['||a.native_rank||'].roleId'))
 OR (a.purpose='staff_roster_rank' AND json_extract(${policy},'$.privileged')=1 AND a.role_id=(CASE a.native_rank WHEN 0 THEN '1554261979684933742' WHEN 3 THEN '1554262223038324840' WHEN 5 THEN '1554262510650007602' END)))
 AND ((a.attempts=1 AND ${byteHex('a.claim_nonce',32)} AND a.reason='native232_put_acknowledged_and_confirmed')
 OR (a.purpose='launch_routine_membership232' AND a.attempts=0 AND a.claim_nonce IS NULL AND a.reason='native232_observed_without_dispatch'))))
 OR ((a.subject=c.discord_id AND a.subject_generation IS p.generation AND a.guild_id='${NATIVE_GUILD232}')
 AND (a.native_guid=c.guid AND a.desired=1 AND a.state='settled' AND a.purpose IN('canonical_identity233','canonical_consumed233','canonical_routine233') AND a.native_profile='${CANONICAL_PROFILE233}')
 AND ((${byteHex('a.id',32)} AND ${byteHex('a.request_digest',64)}) AND ((a.created_at>=c.bound_at AND a.created_at>=c.verified_at) AND (a.created_at>=${cutoff} AND a.created_at<=CAST(strftime('%s','now') AS INTEGER))))
 AND (typeof(a.checked_at)='integer' AND a.checked_at>=a.created_at AND a.checked_at<a.expires_at AND a.expires_at>a.created_at AND a.expires_at<=a.created_at+300)
 AND (typeof(a.native_rank)='integer' AND a.native_rank BETWEEN 0 AND 9 AND a.native_rank_name=(${rankName232}))
 AND a.role_id IN(SELECT json_extract(j.value,'$.roleId') FROM json_each(${canonical},'$.ranks') j)
 AND ((a.attempts=1 AND ${byteHex('a.claim_nonce',32)} AND a.reason='canonical233_put_acknowledged_and_confirmed')
 OR (a.attempts=0 AND a.claim_nonce IS NULL AND a.reason='canonical233_observed_without_dispatch' AND a.purpose IN('canonical_consumed233','canonical_routine233'))
 OR (a.attempts=0 AND a.claim_nonce IS NULL AND a.purpose='canonical_identity233' AND a.reason='canonical233_original_control_verified')))`;

export type RosterLineageCapture275=Readonly<{nativePolicy:string;canonicalPolicy:string;current:()=>boolean}>;
/** Capture source configuration once for the entire read/provider-await graph.
 * Malformed/off configuration supplies no fallback, never a historical default. */
export function captureRosterLineage275(env:Env,launch:LaunchVerificationCapture):RosterLineageCapture275{
 const canonical=captureCanonicalRankConfig233(env),native=captureNativeRankConfig232(env),guild=Object.getOwnPropertyDescriptor(env,'GUILD_ID');
 const current=()=>{const value=Object.getOwnPropertyDescriptor(env,'GUILD_ID');return canonical.current()&&native.current()&&launch.current()
  &&(guild?!!value&&Object.hasOwn(guild,'value')&&Object.hasOwn(value,'value')&&value.value===guild.value:!value&&!('GUILD_ID'in env));};
 const scope='addon-native-v1:'+JSON.stringify({version:1,...NATIVE_SCOPE232});
 const enabled=canonical.mode==='enabled'&&launch.mode==='members-only'&&launch.scope?.provenance===scope
  &&!!guild&&Object.hasOwn(guild,'value')&&guild.value===NATIVE_GUILD232&&current();
 return Object.freeze({nativePolicy:enabled?JSON.stringify(historicalNativeRankPolicy232()):'null',canonicalPolicy:enabled?canonical.raw!:'null',current});
}

/** Fixed source aliases c/rm/s/g/ng/m/u/p; arguments are source-authored SQL
 * placeholders, never request data. No JOIN can multiply the Native roster. */
export function rosterVerificationSql275(at:string,cutoff:string,nativePolicy:string,canonicalPolicy:string,strictClock='1'){
 const standing=`COALESCE(m.banned,0)=0 AND COALESCE(u.denied,0)=0
  AND NOT EXISTS(SELECT 1 FROM privacy_subjects block WHERE block.subject_id=c.discord_id AND block.state<>'active')
  AND NOT EXISTS(SELECT 1 FROM rename_holds rh WHERE rh.discord_id=c.discord_id AND rh.state='reapply')`;
 const exact=`c.status='member' AND c.guid=rm.guid AND g.links=1 AND ng.links=1`;
 const anchorId=`CASE WHEN ${exact} AND ${standing}
  AND typeof(c.bound_at)='integer' AND c.bound_at BETWEEN 1 AND ${at}
  AND typeof(c.verified_at)='integer' AND c.verified_at BETWEEN c.bound_at AND ${at} AND c.verified_at<${cutoff}
  AND c.source IN('whisper','mail') AND json_extract(${canonicalPolicy},'$.enabled')=1
  THEN (SELECT a.id FROM role_settlements a WHERE a.native_profile='${CANONICAL_PROFILE233}'
   AND a.purpose IN('canonical_identity233','canonical_consumed233','canonical_routine233')
   AND a.created_at<=${at} AND (${recognizedMembershipAnchor232(nativePolicy,canonicalPolicy,cutoff)})
   ORDER BY a.created_at,a.id LIMIT 1) ELSE NULL END`;
 const pending=`COALESCE((SELECT CASE WHEN typeof(pp.created_at)='integer' AND pp.created_at BETWEEN ${cutoff} AND ${at}
  AND NOT EXISTS(SELECT 1 FROM privacy_subjects privacy_pending WHERE privacy_pending.subject_id=pp.discord_id AND privacy_pending.state<>'active')
  THEN 'pending' ELSE 'unknown' END FROM pending pp WHERE pp.name_key=rm.name_key AND pp.consumed_at IS NULL AND pp.expires_at>${at}
  ORDER BY pp.id DESC LIMIT 1),'unverified')`;
 const status=`CASE WHEN (c.name_key IS NULL OR (c.status='unbound' AND c.guid IS NULL)) AND g.guid IS NULL AND ng.links=1 THEN ${pending}
  WHEN ${exact} AND ${standing} AND ((COALESCE(c.verified_at,c.bound_at)>=${cutoff}
   AND (${strictClock}=0 OR (typeof(COALESCE(c.verified_at,c.bound_at))='integer' AND COALESCE(c.verified_at,c.bound_at) BETWEEN 1 AND ${at})))
   OR (${anchorId}) IS NOT NULL) THEN 'verified' ELSE 'unknown' END`;
 const unknownReason=`CASE WHEN ${exact} AND ${standing} AND typeof(COALESCE(c.verified_at,c.bound_at))='integer'
  AND COALESCE(c.verified_at,c.bound_at) BETWEEN 1 AND ${at} AND COALESCE(c.verified_at,c.bound_at)<${cutoff}
  THEN 'linked_before_cutoff' ELSE 'link_review' END`;
 return Object.freeze({status,unknownReason,anchorId});
}
