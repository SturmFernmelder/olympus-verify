/** Own staff authorization metadata is distinct from independent, source-rendered public guild configuration. */
import type { Env } from './env';
import { registerCommunityData,type ExportPlan,DB_NOW } from './community-context';
import { registerServingPrivacyFamilies } from './privacy-business-catalog';
import { RULESET_PUBLICATION_COLUMNS } from './ruleset-publication-schema';
import { FUTURE_REVISION } from './ruleset-profile';
const STATES=['selected','pending','claimed','unknown','known','applied','refused','superseded','held'];
const RESULTS=['confirmed','authority_closed','unknown','refused','actor_erased','actor_history_expired'];
/** Unknown restored metadata cannot become a free-form own-copy disclosure channel. */
export function projectOwnRulesetPublication(r:Record<string,unknown>):Record<string,unknown>{
 // Item 7: the beta revision or an opaque full-release revision shape; a restored or free-form string stays withheld.
 return {profile_revision:r.profile_revision==='forever-beta-pvp2-v1'||(typeof r.profile_revision==='string'&&FUTURE_REVISION.test(r.profile_revision))?r.profile_revision:null,
 selection_revision:typeof r.selection_revision==='number'&&Number.isSafeInteger(r.selection_revision)&&r.selection_revision>0?r.selection_revision:null,
 target_key:['$selection','guide','olympus-info','guild-announcements'].includes(r.target_key as string)?r.target_key:null,
 state:STATES.includes(r.state as string)?r.state:null,result_code:RESULTS.includes(r.result_code as string)?r.result_code:null,
 ...Object.fromEntries(['created_at','updated_at','actor_retain_until'].map(k=>[k,typeof r[k]==='number'&&Number.isSafeInteger(r[k])&&(r[k] as number)>=0?r[k]:null]))};
}
export async function rulesetPublicationManaged(env:Env,guild:string,target:string):Promise<boolean>{return !!await env.DB.prepare('SELECT 1 AS managed FROM ruleset_publications WHERE guild_id=?1 AND target_key=?2 LIMIT 1').bind(guild,target).first();}
export function rulesetPublicationEraseStatements(env:Env,id:string):D1PreparedStatement[]{return [env.DB.prepare(`UPDATE ruleset_publications
 SET actor=NULL,actor_generation=NULL,actor_account_incarnation=NULL,session_version=NULL,session_expires=NULL,
 state=CASE WHEN state IN('pending','refused') THEN 'held' WHEN state='claimed' THEN 'unknown' ELSE state END,
 result_code='actor_erased' WHERE actor=?1`).bind(id),
 // Item 7 v2 (finding 4): the activation's attribution leaves with the actor; the activation itself stays resolved (ruleset-profile.ts accepts an empty actor pin).
 env.DB.prepare("UPDATE site_settings SET value='' WHERE key='rulesetActivatedBy' AND value=?1").bind(id)];}
/** Item 7 v3: finite automatic retention of the activation's attribution, bound to the activation time and the database
 * clock: a year after activation (the publication rows' own actor horizon) the actor pin is emptied; mode, revision, digest
 * and time stay. One statement, at most one row. Not part of the ordinary half-hour declaration (full at 700): it is to be
 * declared in the bounded lifecycle branch. */
export function rulesetActivationAttributionRetentionStatement(env:Env):D1PreparedStatement{return env.DB.prepare(`UPDATE site_settings SET value='' WHERE key='rulesetActivatedBy' AND value<>''
 AND EXISTS(SELECT 1 FROM site_settings a WHERE a.key='rulesetActivatedAt' AND a.value GLOB '[0-9]*' AND a.value NOT GLOB '*[^0-9]*' AND length(a.value)<=12 AND CAST(a.value AS INTEGER)+31536000<=${DB_NOW})`);}
/** One bounded native statement; original actor clocks never move on retry/settlement. Shared slot custody is retained. */
export function rulesetPublicationRetentionStatement(env:Env):D1PreparedStatement{return env.DB.prepare(`UPDATE ruleset_publications
 SET actor=NULL,actor_generation=NULL,actor_account_incarnation=NULL,session_version=NULL,session_expires=NULL,
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
