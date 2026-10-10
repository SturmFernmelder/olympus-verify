/** Own staff authorization metadata is distinct from independent, source-rendered public guild configuration. */
import type { Env } from './env';
import { registerCommunityData,type ExportPlan,DB_NOW } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
import { RULESET_PUBLICATION_COLUMNS } from './ruleset-publication-schema';
const STATES=['selected','pending','claimed','unknown','known','applied','refused','superseded','held'];
const RESULTS=['confirmed','authority_closed','unknown','refused','actor_erased','actor_history_expired'];
/** Unknown restored metadata cannot become a free-form own-copy disclosure channel. */
export function projectOwnRulesetPublication(r:Record<string,unknown>):Record<string,unknown>{
 return {profile_revision:r.profile_revision==='forever-beta-pvp2-v1'?r.profile_revision:null,
 selection_revision:typeof r.selection_revision==='number'&&Number.isSafeInteger(r.selection_revision)&&r.selection_revision>0?r.selection_revision:null,
 target_key:['$selection','guide','olympus-info','guild-announcements'].includes(r.target_key as string)?r.target_key:null,
 state:STATES.includes(r.state as string)?r.state:null,result_code:RESULTS.includes(r.result_code as string)?r.result_code:null,
 ...Object.fromEntries(['created_at','updated_at','actor_retain_until'].map(k=>[k,typeof r[k]==='number'&&Number.isSafeInteger(r[k])&&(r[k] as number)>=0?r[k]:null]))};
}
export async function rulesetPublicationManaged(env:Env,guild:string,target:string):Promise<boolean>{return !!await env.DB.prepare('SELECT 1 AS managed FROM ruleset_publications WHERE guild_id=?1 AND target_key=?2 LIMIT 1').bind(guild,target).first();}
export function rulesetPublicationEraseStatements(env:Env,id:string):D1PreparedStatement[]{return [env.DB.prepare(`UPDATE ruleset_publications
 SET actor=NULL,actor_generation=NULL,session_version=NULL,session_expires=NULL,
 state=CASE WHEN state IN('pending','refused') THEN 'held' WHEN state='claimed' THEN 'unknown' ELSE state END,
 result_code='actor_erased' WHERE actor=?1`).bind(id)];}
/** One bounded native statement; original actor clocks never move on retry/settlement. Shared slot custody is retained. */
export function rulesetPublicationRetentionStatement(env:Env):D1PreparedStatement{return env.DB.prepare(`UPDATE ruleset_publications
 SET actor=NULL,actor_generation=NULL,session_version=NULL,session_expires=NULL,
 state=CASE WHEN state IN('pending','refused') THEN 'held' WHEN state='claimed' THEN 'unknown' ELSE state END,
 result_code='actor_history_expired' WHERE rowid IN(SELECT rowid FROM ruleset_publications
 WHERE actor IS NOT NULL AND actor_retain_until<=${DB_NOW} ORDER BY actor_retain_until,rowid LIMIT 1000)`);}
export function rulesetPublicationExportPlan(env:Env,id:string):ExportPlan{
 const sql=`SELECT profile_revision,selection_revision,target_key,state,result_code,created_at,updated_at,actor_retain_until
 FROM ruleset_publications WHERE actor=?1 AND actor_retain_until>${DB_NOW} ORDER BY created_at,rowid`;
 return {statements:[env.DB.prepare(sql+' LIMIT 1000').bind(id),env.DB.prepare('SELECT COUNT(*) AS count FROM ('+sql+')').bind(id)],
 shape:r=>({operations:{rows:r[0]!.results.map(r=>projectOwnRulesetPublication(r as Record<string,unknown>)),total:(r[1]!.results[0] as {count:number}).count,limit:1000,complete:(r[1]!.results[0] as {count:number}).count<=1000},
 omitted:['staff session and generation','operation/claim secrets','provider pointers and destinations','payloads and digests'],sharedGuildConfigurationRetained:true})};
}
registerCommunityData('ruleset_publication',rulesetPublicationEraseStatements,rulesetPublicationExportPlan);
registerServingPrivacyFamilies('ruleset_publication',[{table:'ruleset_publications',columns:RULESET_PUBLICATION_COLUMNS}]);
