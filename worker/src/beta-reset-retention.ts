/** Finite local history for this closed beta source. Unknown effects are continuing custody, never expiry. */
import type { Env } from './env';
import { BETA_RESET_CUTOFF,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS } from './beta-reset-policy';
const T="CAST(strftime('%s','now') AS INTEGER)";
export const BETA_RESET_RECEIPT_RETENTION_SECONDS=365*86400;
export const BETA_RESET_RECEIPT_RETENTION_ROWS=2000;
const YEAR=BETA_RESET_RECEIPT_RETENTION_SECONDS;
const hex=(v:string,n:number)=>`typeof(${v})='text' AND length(${v})=${n} AND instr(${v},char(0))=0 AND ${v} NOT GLOB '*[^0-9a-f]*'`;
const integer=(v:string)=>`typeof(${v})='integer' AND ${v}>0 AND ${v}<=${T}`;
const scope=(a:string)=>`${a}.guild_id='${BETA_RESET_GUILD_ID}' AND ${a}.role_id IN(${BETA_RESET_ROLE_IDS.map(x=>"'"+x+"'").join(',')})
 AND ${hex(a+'.id',32)} AND typeof(${a}.subject)='text' AND length(${a}.subject) BETWEEN 17 AND 20
 AND instr(${a}.subject,char(0))=0 AND ${a}.subject NOT GLOB '*[^0-9]*'
 AND ${integer(a+'.created_at')} AND typeof(${a}.expires_at)='integer' AND ${a}.expires_at=${a}.created_at+300`;
const noDebt=(a:string)=>`NOT EXISTS(SELECT 1 FROM role_settlements d WHERE d.subject=${a}.subject AND d.guild_id=${a}.guild_id AND d.role_id=${a}.role_id
 AND d.attempts=1 AND d.state IN('dispatching','unknown'))`;
const unspent=`r.purpose='beta_reset' AND r.desired=0 AND r.created_at>=${BETA_RESET_CUTOFF}
 AND ${hex('r.request_digest',64)} AND r.proof_id IS NULL AND r.roster_id IS NULL AND r.subject_generation IS NULL
 AND r.native_guid IS NULL AND r.native_profile IS NULL AND r.native_rank IS NULL AND r.native_rank_name IS NULL
 AND r.attempts=0 AND r.claim_nonce IS NULL AND r.created_at<=${T}-${YEAR}
 AND ((r.state='pending' AND r.reason IN('beta_inventory_observed','beta_reset_fresh_target') AND r.checked_at IS NULL)
 OR (r.state='held' AND r.reason IN('beta_reset_hierarchy_or_read_held','beta_reset_observation_consumed') AND ${integer('r.checked_at')} AND r.checked_at>=r.created_at)
 OR (r.state='settled' AND r.reason='beta_reset_absent' AND ${integer('r.checked_at')} AND r.checked_at>=r.created_at))`;
const removed=`r.purpose='beta_reset' AND r.desired=0 AND r.created_at>=${BETA_RESET_CUTOFF}
 AND ${hex('r.request_digest',64)} AND r.attempts=1 AND ${hex('r.claim_nonce',32)}
 AND r.state='settled' AND r.reason='beta_reset_removed' AND ${integer('r.checked_at')} AND r.checked_at>=r.created_at
 AND max(r.created_at,r.checked_at)<=${T}-${YEAR} AND ${noDebt('r')}`;
const legacy=`r.purpose='beta_guard_grant' AND r.desired=1 AND r.created_at<${BETA_RESET_CUTOFF}
 AND r.attempts=1 AND ${hex('r.claim_nonce',32)} AND r.state='settled' AND r.reason='legacy_put_acknowledged'
 AND ${integer('r.checked_at')} AND r.checked_at>=r.created_at AND max(r.created_at,r.checked_at)<=${T}-${YEAR}
 AND NOT EXISTS(SELECT 1 FROM role_settlements c WHERE c.purpose='grant_compensation' AND c.request_digest=r.id) AND ${noDebt('r')}`;
/** Two statements, at most 1,000 independent records plus 500 complete parent/child pairs.
 * The eligibility and deletion consume current rows in the same statement/transaction. No capture is
 * retargeted, no attempts reset and no unknown row is deleted. Pair membership is materialized by the
 * IN selection before deletion, so the first deletion cannot strand its other half.
 */
export function betaResetReceiptRetentionStatements(env:Env):D1PreparedStatement[]{return [
 env.DB.prepare(`DELETE FROM role_settlements WHERE id IN(SELECT r.id FROM role_settlements r
  WHERE ${T}>=${BETA_RESET_CUTOFF}+${YEAR} AND ${scope('r')} AND ((${unspent}) OR (${removed}) OR (${legacy}))
  ORDER BY r.created_at,r.id LIMIT 1000)`),
 env.DB.prepare(`WITH pairs AS (
  SELECT p.id AS parent,c.id AS child FROM role_settlements p JOIN role_settlements c ON c.request_digest=p.id
  WHERE ${T}>=${BETA_RESET_CUTOFF}+${YEAR} AND ${scope('p')} AND ${scope('c')}
   AND p.created_at<${BETA_RESET_CUTOFF} AND p.desired=1 AND p.attempts=1 AND ${hex('p.claim_nonce',32)} AND p.state='held'
   AND ((p.purpose='beta_guard_grant' AND p.reason='removed_after_beta_guard')
    OR (p.purpose IN('roster_membership','verified_membership','verified_native_rank','verified_privileged_rank','roster_native_rank','roster_privileged_rank') AND p.reason='removed_after_admission_changed'))
   AND c.purpose='grant_compensation' AND c.subject=p.subject AND c.guild_id=p.guild_id AND c.role_id=p.role_id
   AND c.subject_generation IS NULL AND c.proof_id IS NULL AND c.roster_id IS NULL AND c.native_guid IS NULL
   AND c.native_profile IS NULL AND c.native_rank IS NULL AND c.native_rank_name IS NULL
   AND c.desired=0 AND c.attempts=1 AND ${hex('c.claim_nonce',32)} AND c.state='settled' AND c.reason='beta_acknowledged_put_cleanup_acknowledged'
   AND ${integer('c.checked_at')} AND c.checked_at>=c.created_at AND c.created_at>=p.created_at
   AND (p.checked_at IS NULL OR (${integer('p.checked_at')} AND p.checked_at>=p.created_at))
   AND max(p.created_at,coalesce(p.checked_at,p.created_at),c.created_at,c.checked_at)<=${T}-${YEAR}
   AND (SELECT COUNT(*) FROM role_settlements siblings WHERE siblings.purpose='grant_compensation' AND siblings.request_digest=p.id)=1
   AND ${noDebt('p')}
  ORDER BY c.checked_at,p.id LIMIT 500)
 DELETE FROM role_settlements WHERE id IN(SELECT parent FROM pairs UNION ALL SELECT child FROM pairs)`),
 ];}
