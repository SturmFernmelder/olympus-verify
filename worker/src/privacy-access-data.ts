/** Short-lived privacy credentials have explicit custody; downloads omit authentication material. */
import type { Env } from './env';
import { registerCommunityData, type ExportPlan } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
export function privacyAccessEraseStatements(env:Env,id:string):D1PreparedStatement[]{
 return [env.DB.prepare('DELETE FROM privacy_access_grants WHERE subject_id=?1').bind(id)];
}
export function privacyAccessExportPlan(env:Env,id:string):ExportPlan{
 const sql='SELECT purpose,created_at,expires_at,consumed_at FROM privacy_access_grants WHERE subject_id=?1 ORDER BY created_at,purpose';
 return {statements:[env.DB.prepare(sql+' LIMIT 1000').bind(id),env.DB.prepare('SELECT COUNT(*) AS count FROM privacy_access_grants WHERE subject_id=?1').bind(id)],
 shape:r=>({connections:{rows:r[0]!.results,total:(r[1]!.results[0] as {count:number}).count,limit:1000,complete:(r[1]!.results[0] as {count:number}).count<=1000},omitted:['authentication hashes','form secrets','OAuth codes','grant identifiers','erasure status credentials']})};
}
registerCommunityData('privacy_access',privacyAccessEraseStatements,privacyAccessExportPlan);
registerServingPrivacyFamilies('privacy_access',[
 {table:'privacy_access_oauth',columns:'state_hash,browser_hash,purpose,created_at,expires_at,consumed_at'},
 {table:'privacy_access_grants',columns:'session_hash,purpose,grant_id,csrf_hash,subject_id,subject_generation,state,revision,erasure_operation,created_at,expires_at,consumed_at'},
]);
