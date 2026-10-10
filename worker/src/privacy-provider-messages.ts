/** One-use bot message custody. No copied message content is stored in this ledger.
 * Known bot pointers have bounded automatic cleanup; unknown sends are retained and never blindly repeated.
 */
import type { Env } from './env';
import { rest,DiscordError } from './discord';
import { PRIVACY_DB_NOW,PRIVACY_REPLAY,privacyProviderCustodyDatabase,privacyGenerationExpressionFenceSql,type PrivacySubject } from './privacy-serving-authority';
import { isPrivacyWriteAdmissionDatabase } from './privacy-write-admission';
const ID=/^\d{17,20}$/,HEX=/^[0-9a-f]{32}$/;
export type MessageSubject={subject:string;capture:PrivacySubject|null};
const CURRENT=privacyGenerationExpressionFenceSql("json_extract(x.value,'$.id')","json_extract(x.value,'$.g')");
const random=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
type CronNoticeState='pending'|'attempted'|'known'|'refused'|'unknown'|'held';
export type RosterCronNotice={p:'roster_cron_notice_v1';v:1;nonce:string;run:number;seq:number;subject:string;generation:string|null;name:string;nameKey:string;guid:string|null;createdAt:number;expiresAt:number;guild:string;bot:string;welcome:{channel:string;hash:string;operation:string;state:CronNoticeState};log:{channel:string;hash:string;operation:string;state:CronNoticeState}};
const hash=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const cronPayload=(n:RosterCronNotice,kind:'welcome'|'log')=>kind==='welcome'?{content:`<@${n.subject}> Welcome to Olympus — **${n.name}** is on the guild roster.`,allowed_mentions:{parse:[],users:[n.subject]},nonce:n.welcome.operation,enforce_nonce:true}:{content:`➕ roster: **${n.name}** (<@${n.subject}>) confirmed on the roster — Guild Member pending the central role sweep.`,allowed_mentions:{parse:[]},nonce:n.log.operation,enforce_nonce:true};
/** A cron-only second phase, saved by the original member claim. No account, purpose credential or new schema. */
export async function prepareRosterCronNotice(env:Env,input:{run:number;seq:number;subject:string;generation:string|null;name:string;nameKey:string;guid:string|null;createdAt:number}):Promise<string>{
 if(!isPrivacyWriteAdmissionDatabase(privacyProviderCustodyDatabase(env))||env.PRIVACY_ERASURE_ENABLED!=='true')throw Error('cron_notice_lane_disabled');
 const n:RosterCronNotice={...input,p:'roster_cron_notice_v1',v:1,nonce:random(),expiresAt:input.createdAt+86400,guild:env.GUILD_ID,bot:env.DISCORD_APP_ID,welcome:{channel:(env.CHANNEL_NOTICES??'').trim(),hash:'',operation:random(),state:'pending'},log:{channel:env.CHANNEL_SERVER_LOG??'',hash:'',operation:random(),state:'pending'}};
 n.welcome.hash=await hash(JSON.stringify(cronPayload(n,'welcome')));n.log.hash=await hash(JSON.stringify(cronPayload(n,'log')));return JSON.stringify(n);
}
export function parseRosterCronNotice(claim:string):RosterCronNotice|null{
 try{const n=JSON.parse(claim) as RosterCronNotice;if(n.p!=='roster_cron_notice_v1'||n.v!==1||!HEX.test(n.nonce)||!ID.test(n.subject)||!ID.test(n.guild)||!ID.test(n.bot)||n.generation!==null&&!HEX.test(n.generation)||!Number.isSafeInteger(n.run)||n.run<1||!Number.isSafeInteger(n.seq)||n.seq<0||!Number.isSafeInteger(n.createdAt)||n.expiresAt!==n.createdAt+86400||typeof n.name!=='string'||n.name.length>64||typeof n.nameKey!=='string'||n.nameKey.length>128||n.guid!==null&&typeof n.guid!=='string')return null;for(const x of[n.welcome,n.log])if(!x||typeof x.channel!=='string'||x.channel.length>20||!HEX.test(x.operation)||!/^([0-9a-f]{64})$/.test(x.hash)||!['pending','attempted','known','refused','unknown','held'].includes(x.state))return null;return n;}catch{return null;}
}
/** One original phase dispatch, followed by response-only native custody. Attempted/unknown phases never re-POST. */
export async function settleRosterCronNotice(env:Env,claim:string):Promise<{state:'known'|'refused'|'unknown'|'held'|'pending';finished:boolean}>{
 const n=parseRosterCronNotice(claim),DB=privacyProviderCustodyDatabase(env);if(!n||!isPrivacyWriteAdmissionDatabase(DB)||env.PRIVACY_ERASURE_ENABLED!=='true')throw Error('cron_notice_proof_invalid');
 const kind=n.welcome.state==='pending'?'welcome':n.log.state==='pending'?'log':null;if(!kind)return{state:'held',finished:false};const x=n[kind];
 const base=`run_id=?1 AND seq=?2 AND claim=?3 AND done_at=?4 AND discord_id=?5 AND subject_generation IS ?6 AND name=?7 AND name_key=?8 AND guid IS ?9`;
 const values=[n.run,n.seq,claim,n.createdAt,n.subject,n.generation,n.name,n.nameKey,n.guid];
 const disposition=async()=>{n[kind].state='held';await DB.prepare(`UPDATE roster_effects SET claim=?7
  WHERE run_id=?1 AND seq=?2 AND claim=?3 AND done_at=?4 AND discord_id=?5 AND subject_generation IS ?6`)
  .bind(n.run,n.seq,claim,n.createdAt,n.subject,n.generation,JSON.stringify(n)).run();return{state:'held' as const,finished:false};};
 if(n.guild!==env.GUILD_ID||n.bot!==env.DISCORD_APP_ID||x.channel!==(kind==='welcome'?(env.CHANNEL_NOTICES??'').trim():env.CHANNEL_SERVER_LOG??'')||!ID.test(x.channel)||n.expiresAt<=Math.floor(Date.now()/1000)||x.hash!==await hash(JSON.stringify(cronPayload(n,kind))))return disposition();
 if(kind==='welcome'){
  // Keep the existing post cap. Unlike ordinary notices, a cron intent remains pending when the minute is full.
  const recent=await DB.prepare(`SELECT COUNT(*) AS n FROM audit WHERE action='notice.posted' AND ts>${PRIVACY_DB_NOW}-60`).first<{n:number}>();
  const cap=Math.max(1,Number.isSafeInteger(Number(env.NOTICE_RATE_CAP))?Number(env.NOTICE_RATE_CAP):10);if((recent?.n??0)>=cap)return{state:'pending',finished:false};
 }
 n[kind].state='attempted';const attempted=JSON.stringify(n),refs=JSON.stringify([{id:n.subject,g:n.generation}]);
 const out=await DB.batch([
  DB.prepare(`UPDATE roster_effects SET claim=?10 WHERE ${base} AND ${privacyGenerationExpressionFenceSql('discord_id','subject_generation')}
   AND ${PRIVACY_DB_NOW}<?11 AND EXISTS(SELECT 1 FROM characters c WHERE c.name_key=?8 AND c.name=?7 AND c.discord_id=?5 AND c.guid IS ?9 AND c.status='member')
   AND NOT EXISTS(SELECT 1 FROM privacy_provider_messages WHERE operation_id=?12)`).bind(...values,attempted,n.expiresAt,x.operation),
  DB.prepare(`INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,state,created_at,updated_at,retain_until)
   SELECT ?10,?11,?12,?13,'claimed',?14,?14,?14+${PRIVACY_REPLAY}
   WHERE changes()=1 AND ?14<=${PRIVACY_DB_NOW} AND EXISTS(SELECT 1 FROM roster_effects WHERE ${base})`).bind(n.run,n.seq,attempted,n.createdAt,n.subject,n.generation,n.name,n.nameKey,n.guid,x.operation,kind==='welcome'?'notice':'guild_log',refs,x.channel,n.createdAt)
 ]);
 if(out[0]?.meta.changes!==1||out[1]?.meta.changes!==1)return disposition();
 let state:'known'|'refused'|'unknown'='unknown',pointer:string|null=null;
 try{const response=await rest<{id:string}>(env,'POST',`/channels/${x.channel}/messages`,cronPayload(n,kind),1);if(response&&ID.test(response.id)){pointer=response.id;state='known';}}
 catch(e){if(e instanceof DiscordError&&[400,401,403,404,429].includes(e.status))state='refused';}
 n[kind].state=state;const settled=JSON.stringify(n),finished=n.welcome.state==='known'&&n.log.state==='known';
 // Original operation/channel/refs and original row only. No generation refresh, payload resurrection or admission renewal.
 await DB.batch([
  DB.prepare(`UPDATE privacy_provider_messages SET message_id=?2,state=?3,updated_at=${PRIVACY_DB_NOW},cleanup_requested=MAX(cleanup_requested,
   CASE WHEN EXISTS(SELECT 1 FROM json_each(subjects)x WHERE NOT(${CURRENT}))THEN 1 ELSE 0 END)
   WHERE operation_id=?1 AND purpose=?4 AND channel_id=?5 AND created_at=?7 AND retain_until=?7+${PRIVACY_REPLAY}
   AND (subjects=?6 OR subjects='[]' AND cleanup_requested=1) AND state IN('claimed','unknown')`).bind(x.operation,pointer,state,kind==='welcome'?'notice':'guild_log',x.channel,refs,n.createdAt),
  DB.prepare(`UPDATE roster_effects SET claim=?10 WHERE ${base} AND changes()=1`).bind(n.run,n.seq,attempted,n.createdAt,n.subject,n.generation,n.name,n.nameKey,n.guid,settled),
  ...(state==='known'&&kind==='welcome'?[DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details) SELECT ${PRIVACY_DB_NOW},'system','notice.posted',NULL,'{"users":1}'
   WHERE EXISTS(SELECT 1 FROM privacy_provider_messages WHERE operation_id=?1 AND state='known' AND message_id=?2)`).bind(x.operation,pointer)]:[]),
  ...(finished?[DB.prepare(`DELETE FROM roster_effects WHERE ${base}`).bind(n.run,n.seq,settled,n.createdAt,n.subject,n.generation,n.name,n.nameKey,n.guid),DB.prepare(`UPDATE roster_effect_runs SET done_at=${PRIVACY_DB_NOW} WHERE id=?1 AND done_at IS NULL AND NOT EXISTS(SELECT 1 FROM roster_effects WHERE run_id=?1)`).bind(n.run)]:[]),
  DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM privacy_provider_messages WHERE operation_id=?1 AND purpose=?4 AND channel_id=?5
   AND created_at=?6 AND retain_until=?6+${PRIVACY_REPLAY} AND message_id IS ?2 AND state=?3) THEN 1 ELSE json_extract('cron_notice_custody_unconfirmed','$') END AS recorded`).bind(x.operation,pointer,state,kind==='welcome'?'notice':'guild_log',x.channel,n.createdAt)
 ]);
 return{state,finished};
}
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
 const admission=isPrivacyWriteAdmissionDatabase(DB),pageSize=admission?1:5;
 if(subject)await DB.prepare(`UPDATE privacy_provider_messages SET cleanup_requested=1 WHERE state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(subject).run();
 const page=await DB.prepare(`SELECT operation_id,channel_id,message_id,state,subjects,created_at,updated_at,retain_until FROM privacy_provider_messages WHERE cleanup_requested=1 AND state IN('known','cleaning')
 ${subject?"AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)":''} ORDER BY ${admission?'updated_at,':''}created_at,operation_id LIMIT ${pageSize}`).bind(...(subject?[subject]:[])).all<{operation_id:string;channel_id:string;message_id:string;state:string;subjects:string;created_at:number;updated_at:number;retain_until:number}>();
 let removed=0,held=0;
 for(const row of page.results){
  // Cron rotation is operational progress only: it neither renews retention nor authorizes a DELETE.
  // Even a held cleaning row rotates, so its GET-only debt cannot permanently hide later known work.
  if(admission){const visited=await DB.prepare(`UPDATE privacy_provider_messages SET updated_at=${PRIVACY_DB_NOW}
   WHERE operation_id=?1 AND cleanup_requested=1 AND state=?2 AND channel_id=?3 AND message_id IS ?4
   AND subjects=?5 AND created_at=?6 AND retain_until=?7 AND updated_at=?8`)
   .bind(row.operation_id,row.state,row.channel_id,row.message_id,row.subjects,row.created_at,row.retain_until,row.updated_at).run();if(visited.meta.changes!==1)continue;}
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
   const claim=await DB.prepare(`UPDATE privacy_provider_messages SET state='cleaning',updated_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND cleanup_requested=1 AND state='known' AND channel_id=?2 AND message_id=?3
    ${admission?'AND subjects=?4 AND created_at=?5 AND retain_until=?6':''}`).bind(row.operation_id,row.channel_id,row.message_id,...(admission?[row.subjects,row.created_at,row.retain_until]:[])).run();
   if(claim.meta.changes!==1)continue;
   if(alreadyAbsent)absent=true;
   else try{await rest(env,'DELETE',`/channels/${row.channel_id}/messages/${row.message_id}`,undefined,1);absent=true;}catch(e){absent=e instanceof DiscordError&&e.status===404;}
  }else{
   absent=alreadyAbsent;
  }
  if(absent){const done=await DB.prepare(`UPDATE privacy_provider_messages SET state='removed',subjects='[]',updated_at=${PRIVACY_DB_NOW} WHERE operation_id=?1 AND state='cleaning' AND channel_id=?2 AND message_id=?3
   ${admission?"AND (subjects=?4 OR subjects='[]' AND cleanup_requested=1) AND created_at=?5 AND retain_until=?6":''}`).bind(row.operation_id,row.channel_id,row.message_id,...(admission?[row.subjects,row.created_at,row.retain_until]:[])).run();if(done.meta.changes===1)removed++;else held++;}else held++;
 }
 return{removed,held};
}
export async function privacyMessageDebt(env:Env,subject:string):Promise<{known:number;unknown:number}>{
 return await privacyProviderCustodyDatabase(env).prepare(`SELECT SUM(CASE WHEN state IN('known','cleaning')THEN 1 ELSE 0 END)AS known,SUM(CASE WHEN state IN('claimed','unknown')THEN 1 ELSE 0 END)AS unknown
 FROM privacy_provider_messages WHERE state NOT IN('removed','refused') AND EXISTS(SELECT 1 FROM json_each(subjects)x WHERE json_extract(x.value,'$.id')=?1)`).bind(subject).first<{known:number;unknown:number}>().then(r=>({known:r?.known??0,unknown:r?.unknown??0}));
}
