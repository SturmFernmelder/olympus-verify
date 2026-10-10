/** Dated accountless verification records use the same real erasure job and role prerequisite.
 * Undated legacy rows are held: the migration never invents historical activity or a cookie.
 */
import type {Env} from './env';
import {CURRENT_ERASURE_SQL,PRIVACY_DB_NOW as T,PRIVACY_YEAR,PRIVACY_REPLAY,privacyCaptureFromColumns,privacyGenerationFenceSql,currentAccountErasureProof,type AccountErasureProof} from './privacy-serving-authority';
import {inactiveBetaRetentionSatisfiedSql} from './privacy-retention-clocks';
const CLOCK=`MAX(COALESCE(m.activity_at,0),COALESCE(m.linked_at,0),COALESCE(m.bnet_linked_at,0),
 COALESCE((SELECT MAX(COALESCE(c.left_at,c.verified_at,c.bound_at)) FROM characters c WHERE c.discord_id=m.discord_id),0),
 COALESCE((SELECT MAX(p.created_at) FROM pending p WHERE p.discord_id=m.discord_id),0),
 COALESCE((SELECT MAX(COALESCE(q.joined_at,q.invited_at,q.written_at,q.created_at)) FROM invite_queue q WHERE q.discord_id=m.discord_id),0))`;
const eligible=`NOT EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=m.discord_id)
 AND NOT EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=m.discord_id AND c.status NOT IN('unbound','denied','left'))
 AND ${inactiveBetaRetentionSatisfiedSql('m.discord_id')}`;
const hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
export async function admitInactiveBotAccount(env:Env):Promise<AccountErasureProof|null>{
 if(env.PRIVACY_ERASURE_ENABLED!=='true'||env.PRIVACY_RETENTION_ENABLED!=='true')return null;
 const row=await env.DB.prepare(`SELECT m.discord_id,${CLOCK} AS activity_clock,p.generation AS privacy_generation,p.state AS privacy_state,p.revision AS privacy_revision
 FROM members m LEFT JOIN privacy_subjects p ON p.subject_id=m.discord_id WHERE ${eligible} AND ${CLOCK}>0 AND ${CLOCK}<=${T}-${PRIVACY_YEAR}
 AND (p.state IS NULL OR p.state='active') AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs j WHERE j.subject_id=m.discord_id AND j.state<>'complete')
 ORDER BY activity_clock,m.discord_id LIMIT 1`).first<{discord_id:string;activity_clock:number;privacy_generation:string|null;privacy_state:string|null;privacy_revision:number|null}>();
 if(!row||!/^\d{17,20}$/.test(row.discord_id))return null;
 const capture=privacyCaptureFromColumns(row.discord_id,row),generation=capture?.subjectGeneration??hex(),operationId=hex();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['inactive_bot_account',row.discord_id,generation,operationId,row.activity_clock])))),b=>b.toString(16).padStart(2,'0')).join('');
 const proof:AccountErasureProof={purpose:'account_erasure',subject:row.discord_id,subjectGeneration:generation,operationId,requestDigest:digest};
 const current=`EXISTS(SELECT 1 FROM members m WHERE m.discord_id=?1 AND ${eligible} AND ${CLOCK}=?2 AND ${CLOCK}>0 AND ${CLOCK}<=${T}-${PRIVACY_YEAR})
 AND ${privacyGenerationFenceSql(1,3)} AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs WHERE subject_id=?1 AND state<>'complete')`;
 try{
 const out=await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('privacy_inactive_bot_refused','$') END AS admitted`).bind(row.discord_id,row.activity_clock,capture?.subjectGeneration??null),
  env.DB.prepare(`INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'retiring',1,${T},${T})
   ON CONFLICT(subject_id)DO UPDATE SET state='retiring',revision=revision+1,updated_at=${T} WHERE generation=?2 AND state='active'`).bind(row.discord_id,generation),
  env.DB.prepare(`INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,state,created_at,retain_until)
   VALUES(?1,?2,?3,?4,0,0,'waiting_role',${T},${T}+${PRIVACY_REPLAY})`).bind(operationId,row.discord_id,generation,digest),
  env.DB.prepare(`SELECT CASE WHEN changes()=1 AND ${CURRENT_ERASURE_SQL} THEN 1 ELSE json_extract('privacy_inactive_bot_unconfirmed','$') END AS recorded`).bind(operationId,row.discord_id,generation,digest),
 ]);
 if(out.length!==4||(out.at(-1)?.results[0]as{recorded?:number})?.recorded!==1)throw Error('privacy_inactive_bot_unknown');
 }catch{return await currentAccountErasureProof(env,proof).catch(()=>false)?proof:null;}
 return proof;
}
