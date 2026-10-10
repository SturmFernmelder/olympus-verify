/** Fixed native issuer SQL. Caller fields or five-field Capture cannot select a variant. */
import { DB_NOW } from './account-generation-contracts';
import { accountSchemaFenceSql } from './account-schema-profile';
const j=(k:string)=>`json_extract(?1,'$.${k}')`;
const profile=accountSchemaFenceSql();
const scope=`s.singleton=1 AND s.guild_id=${j('guildId')} AND s.application_id=${j('applicationId')} AND s.provenance_digest=${j('scopeProvenanceDigest')}`;
// Owner decision (2026-10-08): an overdue/unavailable Discord check holds protected
// actions. A copied in_server bit, NULL clock or future clock is not fresh proof.
const standing=`u.discord_id=a.account_id AND u.session_version=${j('originalSessionVersion')} AND u.in_server=1 AND u.denied=0 AND COALESCE(m.banned,0)=0
 AND typeof(u.checked_at)='integer' AND u.checked_at<=${DB_NOW} AND u.checked_at>${DB_NOW}-3600`;
const originalExpiry=`${j('deadline')}>${DB_NOW} AND ${j('deadline')}<=${DB_NOW}+604800`;
const from=`account_generations a JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation
 JOIN generation_control g ON g.singleton=1 JOIN root_authority_scope s ON s.singleton=1
 JOIN site_users u ON u.discord_id=a.account_id LEFT JOIN members m ON m.discord_id=a.account_id`;
const live=`a.account_id=${j('subject')} AND a.state='active' AND p.purpose=${j('purpose')} AND g.restore_hold=0 AND ${scope} AND ${standing} AND ${originalExpiry}`;
export const ROOT_CAPTURE_SITE_SQL=`SELECT a.account_id AS subject,p.purpose AS purpose,a.generation AS accountGeneration,a.state AS accountState,a.revision AS accountRevision,
 a.provenance_kind AS provenanceKind,a.provenance_digest AS provenanceDigest,p.generation AS purposeGeneration,p.revision AS purposeRevision,
 g.epoch AS epoch,g.revision AS controlRevision,s.revision AS scopeRevision,s.provenance_digest AS scopeProvenanceDigest,
 s.guild_id AS guildId,s.application_id AS applicationId,'site' AS mode,${DB_NOW} AS acceptedAt,${j('deadline')} AS deadline,
 u.session_version AS originalSessionVersion,u.checked_at AS originalCheckedAt,u.in_server AS originalInServer,u.denied AS originalDenied,COALESCE(m.banned,0) AS originalBanned
 FROM ${from} WHERE ${live} AND ${profile} LIMIT 2`;
/** One profile expansion. The exact original ticket, not a refreshed session, binds every consume. */
export const ROOT_SITE_TICKET_FENCE=`EXISTS(SELECT 1 FROM ${from} WHERE ${live} AND ${j('acceptedAt')}<=${DB_NOW}
 AND a.generation=${j('accountGeneration')} AND a.revision=${j('accountRevision')} AND a.provenance_kind=${j('provenanceKind')} AND a.provenance_digest=${j('provenanceDigest')}
 AND p.generation=${j('purposeGeneration')} AND p.revision=${j('purposeRevision')} AND g.epoch=${j('epoch')} AND g.revision=${j('controlRevision')}
 AND s.revision=${j('scopeRevision')} AND u.checked_at IS ${j('originalCheckedAt')}) AND ${profile}`;
export const ROOT_SITE_TICKET_READBACK=`SELECT CASE WHEN ${ROOT_SITE_TICKET_FENCE} THEN 1 ELSE 0 END AS admitted`;
