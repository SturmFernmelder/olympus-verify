// Persistence registration is eager; optional intake/site code stays lazy.
import type {Env} from './env';
import {registerCommunityData,type ExportPlan} from './community-data-registry';
// Erasure attribution only; the existing name arm is not historical identity or export proof.
// Unrelated malformed JSON and empty GUIDs confer no account ownership.
const own="action='treasury.receipt242' AND CASE WHEN json_valid(details) THEN ((json_extract(details,'$.guid')<>'' AND json_extract(details,'$.guid') IN(SELECT guid FROM characters WHERE discord_id=?1 AND guid<>'')) OR json_extract(details,'$.characterKey') IN(SELECT name_key FROM characters WHERE discord_id=?1)) ELSE 0 END";
// .247 composes this same source-owned predicate into the terminal account audit cleanup.
export {own as TREASURY_RECEIPT_OWN_SQL242};
// Outside-candidate projection design. No identity/effect authority and no storage rewrite.
const legacy=['version','sourceId','source','character','characterKey','guid','copper','items','note','observedAt','retainUntil','classification','payloadHash'];
const v2=['version','sourceId','source','character','characterKey','guid','copper','kind','recipient','collectorGuid','guild','realm','reference','clientVersion','evidence','observedAt','classification','retainUntil','payloadHash'];
const quoted=(keys:readonly string[])=>keys.map(k=>"'"+k+"'").join(',');
const closed=(keys:readonly string[])=>`NOT EXISTS(SELECT 1 FROM json_each(a.details)k WHERE k.key NOT IN(${quoted(keys)})) AND (SELECT COUNT(*)FROM json_each(a.details))=(SELECT COUNT(DISTINCT key)FROM json_each(a.details))`;
const g="json_extract(a.details,'$.guid')";
const suffix=`substr(${g},8)`,dash=`instr(${suffix},'-')`;
const guid=`json_type(a.details,'$.guid')='text' AND length(CAST(${g} AS BLOB))=length(${g}) AND instr(${g},char(0))=0
 AND substr(${g},1,7)='Player-' AND ${dash} BETWEEN 2 AND 7
 AND length(substr(${suffix},1,${dash}-1)) BETWEEN 1 AND 6
 AND substr(${suffix},1,${dash}-1) NOT GLOB '*[^0-9]*'
 AND length(substr(${suffix},${dash}+1)) BETWEEN 4 AND 16
 AND substr(${suffix},${dash}+1) NOT GLOB '*[^0-9A-Fa-f]*'`;
const owned=`EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?1 AND c.guid=${g}) AND (SELECT COUNT(*)FROM characters c WHERE c.guid=${g})=1`;
const valid=`CASE WHEN json_valid(a.details) THEN json_type(a.details)='object' AND ${guid} AND ${owned}
 AND json_type(a.details,'$.version')='integer' AND json_type(a.details,'$.sourceId')='text' AND length(json_extract(a.details,'$.sourceId')) BETWEEN 1 AND 128
 AND length(CAST(json_extract(a.details,'$.sourceId') AS BLOB))=length(json_extract(a.details,'$.sourceId')) AND instr(json_extract(a.details,'$.sourceId'),char(0))=0
 AND json_extract(a.details,'$.sourceId') NOT GLOB '*[^A-Za-z0-9:._-]*' AND a.subject='intake242:'||json_extract(a.details,'$.sourceId')
 AND json_type(a.details,'$.copper')='integer' AND json_extract(a.details,'$.copper') BETWEEN 1 AND 2147483647
 AND typeof(a.ts)='integer' AND a.ts BETWEEN 1 AND 9007199254740991
 AND json_type(a.details,'$.observedAt')='integer' AND json_extract(a.details,'$.observedAt') BETWEEN 1 AND 9007199254740991 AND json_extract(a.details,'$.observedAt')<=a.ts+5
 AND json_type(a.details,'$.retainUntil')='integer' AND json_extract(a.details,'$.retainUntil') BETWEEN 1 AND 9007199254740991 AND json_extract(a.details,'$.retainUntil')=json_extract(a.details,'$.observedAt')+2592000
 AND json_type(a.details,'$.classification')='text' AND json_extract(a.details,'$.classification')='unclassified_receipt'
 AND CASE json_extract(a.details,'$.version') WHEN 242 THEN (${closed(legacy)}) AND json_extract(a.details,'$.source') IN('mail','whisper','trade')
 WHEN 2 THEN (${closed(v2)}) AND length(json_extract(a.details,'$.sourceId'))=24 AND json_extract(a.details,'$.sourceId') NOT GLOB '*[^0-9a-f]*' AND json_extract(a.details,'$.source')='tithe-gold-v2' AND json_extract(a.details,'$.kind') IN('mail','trade')
 AND json_type(a.details,'$.evidence')='object' AND NOT EXISTS(SELECT 1 FROM json_each(a.details,'$.evidence')e WHERE e.key NOT IN('kind','confirmedLocal','automaticCredit','mac'))
 AND (SELECT COUNT(*)FROM json_each(a.details,'$.evidence'))=(SELECT COUNT(DISTINCT key)FROM json_each(a.details,'$.evidence'))
 ELSE 0 END ELSE 0 END`;
const SQL=`SELECT a.ts,json_extract(a.details,'$.version') AS version,json_extract(a.details,'$.sourceId') AS sourceId,json_extract(a.details,'$.source') AS source,
 ${g} AS guid,json_extract(a.details,'$.copper') AS copper,CASE WHEN json_extract(a.details,'$.version')=2 THEN json_extract(a.details,'$.kind') ELSE NULL END AS kind,
 json_extract(a.details,'$.observedAt') AS observedAt,json_extract(a.details,'$.retainUntil') AS retainUntil,'unclassified_receipt' AS classification
 FROM audit a WHERE a.action='treasury.receipt242' AND (${valid}) ORDER BY a.id LIMIT 1001`;
const plan=(env:Env,id:string):ExportPlan=>({statements:[env.DB.prepare(SQL).bind(id)],shape:results=>({receipts:results[0]!.results,coverage:'unique_current_registered_guid_only',unsupported:'omitted',automaticCredit:false})});

registerCommunityData('treasury242',
 (env,id)=>[env.DB.prepare('DELETE FROM audit WHERE '+own).bind(id)],
 plan);
