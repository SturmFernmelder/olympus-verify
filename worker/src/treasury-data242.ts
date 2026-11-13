// Persistence registration is eager; optional intake/site code stays lazy.
import {registerCommunityData} from './community-data-registry';
// Erasure attribution only; the existing name arm is not historical identity or export proof.
// Unrelated malformed JSON and empty GUIDs confer no account ownership.
const own="action='treasury.receipt242' AND CASE WHEN json_valid(details) THEN ((json_extract(details,'$.guid')<>'' AND json_extract(details,'$.guid') IN(SELECT guid FROM characters WHERE discord_id=?1 AND guid<>'')) OR json_extract(details,'$.characterKey') IN(SELECT name_key FROM characters WHERE discord_id=?1)) ELSE 0 END";
// .247 composes this same source-owned predicate into the terminal account audit cleanup.
export {own as TREASURY_RECEIPT_OWN_SQL242};
registerCommunityData('treasury242',
 (env,id)=>[env.DB.prepare('DELETE FROM audit WHERE '+own).bind(id)],
 (env,id)=>({statements:[env.DB.prepare('SELECT ts,details FROM audit WHERE '+own+' ORDER BY id LIMIT 1001').bind(id)],shape:results=>({receipts:results[0]!.results})}));
