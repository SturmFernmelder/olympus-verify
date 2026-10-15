/** Data-only signer predicate: preserve the original SQL without importing QR routes or serving authority. */
import {DB_NOW} from './account-generation-contracts';
/** Enrollment is fresh server roster authority; the fixed24h lease subsequently trusts fresh signed game observation.
 * Any newer incomplete/untrusted or contradictory roster closes the lease. The original expiry is never renewed.
 */
export const SIGNER_CURRENT=`EXISTS(SELECT 1 FROM councillor_keys k JOIN privacy_subjects s ON s.subject_id=k.signer JOIN characters c ON c.discord_id=k.signer AND c.guid=k.signer_guid JOIN members m ON m.discord_id=k.signer
 WHERE k.id=?1 AND k.signer=?2 AND k.beta_window_id IS NULL AND k.revoked_at IS NULL AND k.expires_at>${DB_NOW} AND k.signer_account_incarnation IS NOT NULL AND typeof(k.signer_account_incarnation)='text' AND length(k.signer_account_incarnation)=32 AND length(CAST(k.signer_account_incarnation AS BLOB))=32 AND instr(k.signer_account_incarnation,char(0))=0 AND k.signer_account_incarnation NOT GLOB '*[^0-9a-f]*' AND EXISTS(SELECT 1 FROM site_users birth WHERE birth.discord_id=k.signer AND birth.account_incarnation=k.signer_account_incarnation) AND s.generation=k.subject_generation AND s.state='active' AND c.status='member' AND m.banned=0
 AND NOT EXISTS(SELECT 1 FROM rename_holds WHERE discord_id=k.signer AND state='reapply') AND NOT EXISTS(SELECT 1 FROM roster_snapshots x WHERE x.id>k.roster_id AND x.id=(SELECT MAX(id) FROM roster_snapshots)
 AND (x.complete IS NOT 1 OR x.trusted IS NOT 1 OR x.exported_at>${DB_NOW} OR x.member_count<>(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=x.id)
 OR (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=x.id AND guid=k.signer_guid)<>1
 OR (SELECT COUNT(*) FROM roster_members WHERE snapshot_id=x.id AND guid=k.signer_guid AND rank='High Council' AND rank_index=1)<>1)))`;
