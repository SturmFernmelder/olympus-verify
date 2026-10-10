/** Original beta dates remain protected until the attended reset confirms the actual cutoff.
 * Shared SQL is consumed inside both retention and automatic inactivity admission transactions.
 */
const NOW="CAST(strftime('%s','now') AS INTEGER)",YEAR=31536000;
export const CONFIRMED_BETA_CUTOFF_SQL=`(SELECT CASE WHEN json_valid(r.value) AND json_type(r.value,'$.closedAt')='integer'
 AND json_extract(r.value,'$.closedAt')=CAST(c.value AS INTEGER) AND CAST(c.value AS INTEGER)>0
 AND CAST(c.value AS INTEGER)<=${NOW} THEN CAST(c.value AS INTEGER) ELSE NULL END
 FROM site_settings r JOIN site_settings c ON c.key='betaClosedAt' WHERE r.key='betaResetFor')`;
export const betaRetentionClockSql=(clock:string)=>`CASE WHEN ${CONFIRMED_BETA_CUTOFF_SQL} IS NULL THEN NULL ELSE MAX(${clock},${CONFIRMED_BETA_CUTOFF_SQL}) END`;
/** Manual account erasure is a separate request. Automatic inactivity cannot bypass beta minima. */
export const inactiveBetaRetentionSatisfiedSql=(identity:string)=>`
 NOT EXISTS(SELECT 1 FROM pending bp WHERE bp.discord_id=${identity} AND (${betaRetentionClockSql('bp.created_at')} IS NULL OR ${betaRetentionClockSql('bp.created_at')}>${NOW}-${YEAR}))
 AND NOT EXISTS(SELECT 1 FROM characters bc JOIN roster_first_seen bf ON bf.name_key=bc.name_key WHERE bc.discord_id=${identity}
 AND (${betaRetentionClockSql('bf.first_seen')} IS NULL OR ${betaRetentionClockSql('bf.first_seen')}>${NOW}-${YEAR}))`;
