/** Original beta dates remain protected until attended evidence confirms the actual cutoff.
 * Shared SQL is consumed inside both retention and automatic inactivity admission transactions.
 */
const NOW="CAST(strftime('%s','now') AS INTEGER)",YEAR=31536000;
export const BETA_RETENTION_ANCHOR_KEY='betaRetentionAnchorV1';
const LEGACY_BETA_CUTOFF_SQL=`(SELECT CASE WHEN json_valid(r.value) THEN CASE WHEN json_type(r.value)='object' AND json_type(r.value,'$.closedAt')='integer'
 AND (SELECT COUNT(*) FROM json_each(r.value))=(SELECT COUNT(DISTINCT key) FROM json_each(r.value))
 AND c.value=CAST(CAST(c.value AS INTEGER) AS TEXT) COLLATE BINARY
 AND json_extract(r.value,'$.closedAt')=CAST(c.value AS INTEGER) AND CAST(c.value AS INTEGER)>0
 AND CAST(c.value AS INTEGER)<=${NOW} THEN CAST(c.value AS INTEGER) ELSE NULL END ELSE NULL END
 FROM site_settings r JOIN site_settings c ON c.key='betaClosedAt' WHERE r.key='betaResetFor')`;
/** The new anchor records only that the source-fixed cutoff has passed. It never asserts that
 * Discord removals or discovery are complete. Canonical closed JSON rejects ambiguous keys.
 * Retain valid legacy evidence; two differing or malformed evidence sources hold the clock.
 */
const ANCHOR_CUTOFF_SQL=`(SELECT CASE WHEN json_valid(value) THEN CASE
 WHEN value=json_object('version',1,'epoch','olympus-beta-2026-10-22','cutoff',1792688400,'confirmedAt',json_extract(value,'$.confirmedAt')) COLLATE BINARY
 AND json_type(value,'$.confirmedAt')='integer' AND json_extract(value,'$.confirmedAt')>=1792688400
 AND json_extract(value,'$.confirmedAt')<=${NOW} THEN 1792688400 ELSE NULL END ELSE NULL END
 FROM site_settings WHERE key='${BETA_RETENTION_ANCHOR_KEY}')`;
export const CONFIRMED_BETA_CUTOFF_SQL=`(WITH beta_clock_evidence AS (SELECT
 ${LEGACY_BETA_CUTOFF_SQL} AS legacy,${ANCHOR_CUTOFF_SQL} AS anchor,
 (SELECT COUNT(*) FROM site_settings WHERE key='${BETA_RETENTION_ANCHOR_KEY}') AS anchors,
 (SELECT COUNT(*) FROM site_settings WHERE key IN('betaClosedAt','betaResetFor')) AS legacyRows)
 SELECT CASE WHEN anchors=0 THEN legacy WHEN anchors<>1 OR anchor IS NULL THEN NULL
 WHEN legacyRows=0 THEN anchor WHEN legacyRows=2 AND legacy=anchor THEN anchor ELSE NULL END FROM beta_clock_evidence)`;
export const betaRetentionClockSql=(clock:string)=>`CASE WHEN ${CONFIRMED_BETA_CUTOFF_SQL} IS NULL THEN NULL ELSE MAX(${clock},${CONFIRMED_BETA_CUTOFF_SQL}) END`;
/** Manual account erasure is a separate request. Automatic inactivity cannot bypass beta minima. */
export const inactiveBetaRetentionSatisfiedSql=(identity:string)=>`
 NOT EXISTS(SELECT 1 FROM pending bp WHERE bp.discord_id=${identity} AND (${betaRetentionClockSql('bp.created_at')} IS NULL OR ${betaRetentionClockSql('bp.created_at')}>${NOW}-${YEAR}))
 AND NOT EXISTS(SELECT 1 FROM characters bc JOIN roster_first_seen bf ON bf.name_key=bc.name_key WHERE bc.discord_id=${identity}
 AND (${betaRetentionClockSql('bf.first_seen')} IS NULL OR ${betaRetentionClockSql('bf.first_seen')}>${NOW}-${YEAR}))`;
