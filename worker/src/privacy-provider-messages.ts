/** One-use bot message custody. No copied message content is stored in this ledger.
 * Known bot pointers have bounded automatic cleanup; unknown sends are retained and never blindly repeated.
 */
import type { Env } from './env';
import { rest,DiscordError } from './discord';
import { PRIVACY_DB_NOW,PRIVACY_REPLAY,privacyProviderCustodyDatabase,privacyGenerationExpressionFenceSql,type PrivacySubject } from './privacy-serving-authority';
const ID=/^\d{17,20}$/,HEX=/^[0-9a-f]{32}$/;
export type MessageSubject={subject:string;capture:PrivacySubject|null};
const CURRENT=privacyGenerationExpressionFenceSql("json_extract(x.value,'$.id')","json_extract(x.value,'$.g')");
const random=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function messageOperationId(purpose:string,stable:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(purpose+'\0'+stable)))].slice(0,16).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function postPrivacyMessage(env:Env,purpose:'review'|'notice'|'guild_log',channel:string,payload:unknown,subjects:MessageSubject[],operationId=random()):Promise<{id:string}|null>{
 if(!ID.test(channel)||!HEX.test(operationId)||!subjects.length||subjects.length>20||subjects.some(s=>!ID.test(s.subject)||s.capture!==null&&(s.capture.subject!==s.subject||s.capture.state!=='active'||!HEX.test(s.capture.subjectGeneration))))throw Error('privacy_message_proof_invalid');
 // Until serving privacy is enabled, preserve the existing ordinary message path and create no
 // dormant cleanup records that its OFF sweeper would never age. This is not privacy qualification.
 if(env.PRIVACY_ERASURE_ENABLED!=='true')return rest<{id:string}>(env,'POST',`/channels/${channel}/messages`,payload);
 const refs=JSON.stringify(subjects.map(s=>({id:s.subject,g:s.capture?.subjectGeneration??null}))),DB=privacyProviderCustodyDatabase(env);
 const claim=await DB.prepare(`INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,state,created_at,updated_at,retain_until)
 SELECT ?1,?2,?3,?4,'claimed',${PRIVACY_DB_NOW},${PRIVACY_DB_NOW},${PRIVACY_DB_NOW}+${PRIVACY_REPLAY}
 WHERE NOT EXISTS(SELECT 1 FROM json_each(?3)x WHERE NOT(${CURRENT})) ON CONFLICT(operation_id)DO NOTHING`).bind(operationId,purpose,refs,channel).run();
 if(claim.meta.changes!==1)return null;
 try{
  // attempt=1 disables the generic 429 retry. This logical operation dispatches once.
  const response=await rest<{id:string}>(env,'POST',`/channels/${channel}/messages`,payload,1);
  if(!response||typeof response.id!=='string'||!ID.test(response.id))throw Error('privacy_message_pointer_unknown');
  const recorded=await DB.prepare(`UPDATE privacy_provider_messages SET message_id=?2,state='known',updated_at=${PRIVACY_DB_NOW},
   cleanup_requested=MAX(cleanup_requested,CASE WHEN EXISTS(SELECT 1 FROM json_each(subjects)x WHERE NOT(${CURRENT}))THEN 1 ELSE 0 END)
   WHERE operation_id=?1 AND state='claimed'`).bind(operationId,response.id).run();
  if(recorded.meta.changes!==1)throw Error('privacy_message_custody_unknown');
  return response;
 }catch(error){
  const refused=error instanceof DiscordError&&[400,401,403,404,429].includes(error.status);
  await DB.prepare(`UPDATE privacy_provider_messages SET state=?2,updated_at=${PRIVACY_DB_NOW},cleanup_requested=MAX(cleanup_requested,
   CASE WHEN EXISTS(SELECT 1 FROM json_each(subjects)x WHERE NOT(${CURRENT}))THEN 1 ELSE 0 END) WHERE operation_id=?1 AND state='claimed'`).bind(operationId,refused?'refused':'unknown').run().catch(()=>{});
  throw Error(refused?'privacy_message_refused':'privacy_message_outcome_unknown');
 }
}
/** Fixed bounded page. A lost DELETE settles only by a later GET proving absence; it never re-dispatches DELETE. */
export async function cleanupPrivacyMessages(env:Env,subject?:string):Promise<{removed:number;held:number}>{
 if(subject!==undefined&&!ID.test(subject))throw Error('privacy_cleanup_subject_invalid');
 const DB=privacyProviderCustodyDatabase(env);
 if(subject)await DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(subject).run();
 const page=await DB.prepare(`SELECT operation_id,channel_id,message_id,state FROM privacy_provider_messages WHERE cleanup_requested=1 AND state IN('known','cleaning')
 ${subject?"AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)":''} ORDER BY created_at,operation_id LIMIT 5`).bind(...(subject?[subject]:[])).all<{operation_id:string;channel_id:string;message_id:string;state:string}>();
 let removed=0,held=0;
 for(const row of page.results){
  if(!ID.test(row.channel_id)||!ID.test(row.message_id)){held++;continue;}
  let absent=false,alreadyAbsent=false;
  // A saved pointer is not permission to delete another bot's message after credential/configuration drift.
  // Qualify the current bot and exact message author on every attempt; reads never authorize a repeat DELETE.
  try{
   const bot=await rest<{id:string}>(env,'GET','/users/@me',undefined,1);
   if(!ID.test(env.DISCORD_APP_ID)||bot?.id!==env.DISCORD_APP_ID){held++;continue;}
   try{const message=await rest<{id:string;channel_id:string;author:{id:string}}>(env,'GET',`/channels/${row.channel_id}/messages/${row.message_id}`,undefined,1);
    if(message?.id!==row.message_id||message.channel_id!==row.channel_id||message.author?.id!==bot.id){held++;continue;}
   }catch(e){if(e instanceof DiscordError&&e.status===404)alreadyAbsent=true;else throw e;}
  }catch{held++;continue;}
  if(row.state==='known'){
   const claim=await DB.prepare(`UPDATE privacy_provider_messages SET state='cleaning',updated_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND cleanup_requested=1 AND state='known' AND channel_id=?2 AND message_id=?3`).bind(row.operation_id,row.channel_id,row.message_id).run();
   if(claim.meta.changes!==1)continue;
   if(alreadyAbsent)absent=true;
   else try{await rest(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,undefined,1);absent=true;}catch(e){absent=e instanceof DiscordError&&e.status===404;}
  }else{
   absent=alreadyAbsent;
  }
  if(absent){const done=await DB.prepare(`UPDATE privacy_provider_messages SET state='removed',subjects='[]',updated_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND state='cleaning' AND channel_id=?2 AND message_id=?3`).bind(row.operation_id,row.channel_id,row.message_id).run();if(done.meta.changes===1)removed++;else held++;}else held++;
 }
 return{removed,held};
}
export async function privacyMessageDebt(env:Env,subject:string):Promise<{known:number;unknown:number}>{
 return await privacyProviderCustodyDatabase(env).prepare(`SELECT SUM(CASE WHEN state IN('known','cleaning')THEN 1 ELSE 0 END)AS known,SUM(CASE WHEN state IN('claimed','unknown')THEN 1 ELSE 0 END)AS unknown
 FROM privacy_provider_messages WHERE state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(subject).first<{known:number;unknown:number}>().then(r=>({known:r?.known??0,unknown:r?.unknown??0}));
}
