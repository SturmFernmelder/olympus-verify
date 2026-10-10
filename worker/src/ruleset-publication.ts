/** Owner task7: explicit current-public-beta publication, never a future profile selector or automatic cron. */
import './ruleset-publication-data';
import type { Env } from './env';
import { apiJson,isSiteAdmin,readSession,sameOrigin,PAGE_VERSION,sign,verify } from './site-core';
import { DB_NOW,randomToken,fenceSql } from './community-context';
import { privacyProviderCustodyDatabase,PRIVACY_YEAR } from './privacy-serving-authority';
import { currentRulesetProfile } from './ruleset-profile';
import { guideMessage } from './guide';
import { INTROS,parseChannels,renderEmbeds,resolveText,introHash,validateEmbeds } from './intros';
import { qualifyPublicationDestination,publicationMessage,discoverGuide,messageOwned,messageMatches,writePublication,definitePublicationRefusal,type PublicPayload } from './ruleset-pin-publication';

const TARGETS=['guide','olympus-info','guild-announcements'] as const;
const TOKEN=/^[A-Za-z0-9_-]{22}$/;
type Session={u:string;v:number;e:number;g:string|null};
type Row={guild_id:string;publication_id:string;target_key:string;selection_revision:number;profile_revision:string;plan_hash:string;
 actor:string|null;actor_generation:string|null;session_version:number|null;session_expires:number|null;parent_id:string|null;channel_id:string|null;
 message_id:string|null;frozen_payload:string|null;payload_hash:string|null;record_hash:string|null;claim_nonce:string|null;stage:string;state:string;result_code:string|null;created_at:number;updated_at:number;actor_retain_until:number};
type Form={operationId:string;expectedRevision:number;expiresAt:number;token:string};
class Refused extends Error {constructor(readonly code:string,readonly status=409){super(code);}}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const sourceRevision=()=>currentRulesetProfile().revision;
const claims=(s:Session,f:Omit<Form,'token'>)=>JSON.stringify({purpose:'ruleset_publication',u:s.u,v:s.v,e:s.e,g:s.g,...f});
const latest=`COALESCE((SELECT MAX(selection_revision) FROM ruleset_publications WHERE guild_id=?1 AND target_key='$selection'),0)`;
const originalFence=(r:Row)=>fenceSql('applicantWrite',1,2,3,r.actor_generation);
const actorArgs=(r:Row)=>[r.actor,r.session_version,r.session_expires];
const current=`EXISTS(SELECT 1 FROM ruleset_publications s WHERE s.guild_id=r.guild_id AND s.target_key='$selection'
 AND s.publication_id=r.publication_id AND s.selection_revision=r.selection_revision
 AND s.selection_revision=(SELECT MAX(selection_revision) FROM ruleset_publications WHERE guild_id=r.guild_id AND target_key='$selection'))`;
function channels(env:Env):Record<string,string>{
 const raw=env.INTROS_CHANNELS??'',pairs=raw.split(',').map(p=>p.split('=').map(s=>s.trim()));
 if(pairs.some(p=>p.length!==2||!p[0]||!/^\d{17,20}$/.test(p[1]!))||new Set(pairs.map(p=>p[0])).size!==pairs.length||new Set(pairs.map(p=>p[1])).size!==pairs.length)throw new Refused('publication_channels_unqualified');
 const c=parseChannels(raw);if(!c['join-olympus']||!c['olympus-info']||!c['guild-announcements'])throw new Refused('publication_channels_unqualified');return c;
}
async function plan(env:Env){
 const c=channels(env),guild=env.INTROS_GUILD_ID;
 if(!guild||guild!==env.GUILD_ID)throw new Refused('publication_guild_unqualified');
 const rows=await env.DB.prepare('SELECT * FROM intro_posts WHERE guild_id=?1').bind(guild).all<{intro_key:string;parent_id:string;channel_id:string;message_id:string}>();
 const targets=await Promise.all(TARGETS.map(async key=>{
  const intro=INTROS.find(i=>i.key===key),parent=key==='guide'?c['join-olympus']!:c[intro!.channel]!;
  const p:PublicPayload=key==='guide'?{content:'',...guideMessage(env)} as PublicPayload:{content:resolveText(intro!.content??'',c),embeds:renderEmbeds(intro!,c),allowed_mentions:{parse:[]}};
  if(validateEmbeds(p.embeds as Parameters<typeof validateEmbeds>[0]).length||JSON.stringify(p).length>16000)throw new Refused('publication_payload_unqualified');
  const old=rows.results.find(r=>r.intro_key===key);
  if(old&&(old.parent_id!==parent||old.channel_id!==parent))throw new Refused('publication_destination_changed');
  return {target_key:key,parent_id:parent,channel_id:parent,message_id:old?.message_id??null,frozen_payload:JSON.stringify(p),payload_hash:await hash(JSON.stringify(p)),record_hash:intro?await introHash(intro,p.embeds as Parameters<typeof introHash>[1]):null};
 }));
 return {guild,targets,planHash:await hash(JSON.stringify({profile:currentRulesetProfile(),targets:targets.map(({message_id,...t})=>t)}))};
}
async function session(request:Request,env:Env):Promise<Session>{
 const s=await readSession(env,request);if(!s||!isSiteAdmin(env,s.u))throw new Refused('publication_staff_required',403);
 return s;
}
async function staffProof(env:Env,s:Session):Promise<void>{
 const proof=await env.DB.prepare(`SELECT 1 AS ok WHERE ${fenceSql('applicantWrite',1,2,3,s.g)}`).bind(s.u,s.v,s.e).first<{ok:number}>();
 if(proof?.ok!==1||!isSiteAdmin(env,s.u))throw new Refused('publication_authority_closed');
}
async function checkForm(env:Env,s:Session,input:unknown):Promise<Form>{
 const f=input as Form;if(!f||typeof f!=='object'||Object.keys(f).sort().join(',')!=='expectedRevision,expiresAt,operationId,token'||!TOKEN.test(f.operationId)||!Number.isSafeInteger(f.expectedRevision)||f.expectedRevision<0||!Number.isSafeInteger(f.expiresAt)||f.expiresAt>s.e||typeof f.token!=='string')throw new Refused('publication_form_refused',400);
 if(!await verify(env.COOKIE_SECRET,'ruleset_publication',claims(s,{operationId:f.operationId,expectedRevision:f.expectedRevision,expiresAt:f.expiresAt}),f.token))throw new Refused('publication_form_refused',403);
 const live=await env.DB.prepare(`SELECT 1 AS ok WHERE ?1>${DB_NOW}`).bind(f.expiresAt).first<{ok:number}>();if(live?.ok!==1)throw new Refused('publication_form_expired');return f;
}
export async function rulesetPublicationStatus(env:Env,s:Session){
 await staffProof(env,s);const guild=env.INTROS_GUILD_ID??'';
 const selected=await env.DB.prepare(`SELECT * FROM ruleset_publications WHERE guild_id=?1 AND target_key='$selection' ORDER BY selection_revision DESC LIMIT 1`).bind(guild).first<Row>();
 const rows=selected?(await env.DB.prepare('SELECT target_key,state,stage,result_code,message_id FROM ruleset_publications WHERE guild_id=?1 AND publication_id=?2 AND target_key<>?3 ORDER BY target_key').bind(guild,selected.publication_id,'$selection').all<Row>()).results:[];
 const source=await plan(env);
 const blockers=(await env.DB.prepare(`SELECT publication_id,target_key,selection_revision,state,stage,channel_id,message_id
 FROM ruleset_publications WHERE guild_id=?1 AND target_key IN('guide','olympus-info','guild-announcements')
 AND state IN('claimed','unknown') ORDER BY selection_revision,target_key LIMIT 4`).bind(guild).all<Row>()).results;
 const targets=source.targets.map(t=>{const r=rows.find(r=>r.target_key===t.target_key);return {target:t.target_key,parentId:t.parent_id,channelId:t.channel_id,
  state:r&&['pending','claimed','unknown','known','applied','refused','held'].includes(r.state)?r.state:'unselected',
  stage:r&&['pending','create','edit','pin'].includes(r.stage)?r.stage:null,
  messageId:r?.message_id&&/^\d{17,20}$/.test(r.message_id)?r.message_id:null,payload:JSON.parse(t.frozen_payload) as PublicPayload};});
 await staffProof(env,s);
 const f={operationId:randomToken(),expectedRevision:selected?.selection_revision??0,expiresAt:Math.min(s.e,Math.floor(Date.now()/1000)+600)};
 return {currentProfile:currentRulesetProfile(),futureSwitchAvailable:false,automaticPublication:false,selected:selected?{publicationId:selected.publication_id,revision:selected.selection_revision,profileRevision:selected.profile_revision}:null,targets,
 blockingOperations:blockers.map(r=>({publicationId:r.publication_id,target:r.target_key,revision:r.selection_revision,state:r.state,stage:r.stage,channelId:r.channel_id,messageId:r.message_id})),
 form:{...f,token:await sign(env.COOKIE_SECRET,'ruleset_publication',claims(s,f))}};
}
export async function selectRulesetPublication(env:Env,s:Session,body:Record<string,unknown>){
 if(body.profileRevision!==sourceRevision())throw new Refused('publication_profile_unavailable');
 const f=await checkForm(env,s,body.form),p=await plan(env);
 const old=await env.DB.prepare("SELECT * FROM ruleset_publications WHERE guild_id=?1 AND publication_id=?2 AND target_key='$selection'").bind(p.guild,f.operationId).first<Row>();
 if(old){if(old.actor!==s.u||old.actor_generation!==s.g||old.session_version!==s.v||old.session_expires!==s.e||old.plan_hash!==p.planHash)throw new Refused('publication_operation_conflict');await staffProof(env,s);return {publicationId:old.publication_id,revision:old.selection_revision,replayed:true};}
 const predicate=`${fenceSql('applicantWrite',3,4,5,s.g)} AND ?6>${DB_NOW} AND ${latest}=?7`;
 try{await env.DB.batch([
 env.DB.prepare(`SELECT CASE WHEN ${predicate} THEN 1 ELSE json_extract('publication_selection_refused','$') END AS admitted`).bind(p.guild,f.operationId,s.u,s.v,s.e,f.expiresAt,f.expectedRevision),
 env.DB.prepare(`INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,stage,state,created_at,updated_at,actor_retain_until)
 VALUES(?1,?2,'$selection',?3,?4,?5,?6,?7,?8,?9,'selection','selected',${DB_NOW},${DB_NOW},${DB_NOW}+${PRIVACY_YEAR})`).bind(p.guild,f.operationId,f.expectedRevision+1,sourceRevision(),p.planHash,s.u,s.g,s.v,s.e),
 env.DB.prepare(`INSERT INTO ruleset_publications(guild_id,publication_id,target_key,selection_revision,profile_revision,plan_hash,actor,actor_generation,session_version,session_expires,parent_id,channel_id,message_id,frozen_payload,payload_hash,record_hash,stage,state,created_at,updated_at,actor_retain_until)
 SELECT ?1,?2,json_extract(value,'$.target_key'),?3,?4,?5,?6,?7,?8,?9,json_extract(value,'$.parent_id'),json_extract(value,'$.channel_id'),json_extract(value,'$.message_id'),json_extract(value,'$.frozen_payload'),json_extract(value,'$.payload_hash'),json_extract(value,'$.record_hash'),'pending','pending',${DB_NOW},${DB_NOW},${DB_NOW}+${PRIVACY_YEAR} FROM json_each(?10)`).bind(p.guild,f.operationId,f.expectedRevision+1,sourceRevision(),p.planHash,s.u,s.g,s.v,s.e,JSON.stringify(p.targets)),
 env.DB.prepare(`SELECT CASE WHEN (SELECT COUNT(*) FROM ruleset_publications WHERE guild_id=?1 AND publication_id=?2 AND actor=?3
 AND selection_revision=?7+1 AND profile_revision=?8 AND plan_hash=?9)=4 AND ${fenceSql('applicantWrite',3,4,5,s.g)} AND ?6>${DB_NOW}
 THEN 1 ELSE json_extract('publication_selection_unconfirmed','$') END AS admitted`).bind(p.guild,f.operationId,s.u,s.v,s.e,f.expiresAt,f.expectedRevision,sourceRevision(),p.planHash),
 ]);}catch{throw new Refused('publication_selection_unconfirmed',503);}
 return {publicationId:f.operationId,revision:f.expectedRevision+1,replayed:false};
}
async function getRow(env:Env,publication:string,key:string):Promise<Row>{
 if(!TOKEN.test(publication)||!TARGETS.includes(key as typeof TARGETS[number]))throw new Refused('publication_target_invalid',400);
 const row=await env.DB.prepare('SELECT * FROM ruleset_publications WHERE guild_id=?1 AND publication_id=?2 AND target_key=?3').bind(env.INTROS_GUILD_ID,publication,key).first<Row>();
 if(!row)throw new Refused('publication_not_found',404);return row;
}
async function originalProof(env:Env,r:Row):Promise<boolean>{
 if(!r.actor||!isSiteAdmin(env,r.actor)||r.profile_revision!==sourceRevision())return false;
 const found=await env.DB.prepare(`SELECT 1 AS ok FROM ruleset_publications r WHERE r.guild_id=?4 AND r.publication_id=?5 AND r.target_key=?6
 AND ${current} AND ${originalFence(r)} AND r.actor=?1 AND r.actor_generation IS ?7 AND r.session_version=?2 AND r.session_expires=?3
 AND r.payload_hash=?8 AND r.frozen_payload=?9 AND r.parent_id=?10 AND r.channel_id=?11 AND r.claim_nonce IS ?12
 AND r.stage=?13 AND r.state=?14 AND r.message_id IS ?15 AND r.profile_revision=?16 AND r.selection_revision=?17
 AND r.plan_hash=?18`).bind(...actorArgs(r),r.guild_id,r.publication_id,r.target_key,r.actor_generation,r.payload_hash,r.frozen_payload,r.parent_id,r.channel_id,r.claim_nonce,r.stage,r.state,r.message_id,r.profile_revision,r.selection_revision,r.plan_hash).first<{ok:number}>();return found?.ok===1;
}
/** Custody only. This cannot create rows, restore actor fields or authorize a provider effect. */
async function settle(env:Env,r:Row,messageId:string|null,pinned:boolean,state?:'unknown'|'refused'){
 const db=privacyProviderCustodyDatabase(env),active=r.actor&&isSiteAdmin(env,r.actor)&&r.profile_revision===sourceRevision();
 const valid=active?`${current} AND ${originalFence(r)} AND r.actor=?1 AND r.actor_generation IS ?7 AND r.session_version=?2 AND r.session_expires=?3`:'0';
 const args=[...actorArgs(r),r.guild_id,r.publication_id,r.target_key,r.actor_generation,r.claim_nonce,r.channel_id,r.parent_id,r.payload_hash,r.profile_revision,r.selection_revision,r.stage,messageId,pinned?1:0,state??null,r.frozen_payload,r.plan_hash,r.record_hash,r.created_at,r.actor_retain_until];
 const out=await db.prepare(`UPDATE ruleset_publications AS r SET message_id=COALESCE(?15,message_id),
 state=CASE WHEN ?17 IS NOT NULL THEN ?17 WHEN (${valid}) THEN CASE WHEN ?16=1 THEN 'applied' ELSE 'known' END ELSE 'held' END,
 result_code=CASE WHEN ?17 IS NOT NULL THEN ?17 WHEN (${valid}) THEN 'confirmed' ELSE 'authority_closed' END,updated_at=${DB_NOW}
 WHERE r.guild_id=?4 AND r.publication_id=?5 AND r.target_key=?6 AND r.claim_nonce=?8 AND r.channel_id=?9 AND r.parent_id=?10
 AND r.payload_hash=?11 AND r.profile_revision=?12 AND r.selection_revision=?13 AND r.stage=?14 AND r.state IN('claimed','unknown','held')
 AND r.frozen_payload=?18 AND r.plan_hash=?19 AND r.record_hash IS ?20 AND r.created_at=?21 AND r.actor_retain_until=?22
 AND (?15 IS NULL OR r.message_id IS NULL OR r.message_id=?15) RETURNING state,message_id`).bind(...args).all<{state:string;message_id:string|null}>();
 if(out.results.length!==1)throw new Refused('publication_custody_unconfirmed',503);
 return {state:out.results[0]!.state,messageId:out.results[0]!.message_id};
}
export async function publishRulesetTarget(env:Env,s:Session,publication:string,key:string){
 await staffProof(env,s);let r=await getRow(env,publication,key);
 if(r.actor!==s.u||r.actor_generation!==s.g||r.session_version!==s.v||r.session_expires!==s.e||!await originalProof(env,r))throw new Refused('publication_authority_closed');
 if(r.state==='applied')return {state:'applied',messageId:r.message_id};
 if(!['pending','known','refused'].includes(r.state))throw new Refused('publication_reconciliation_required');
 const payload=JSON.parse(r.frozen_payload!) as PublicPayload;if(await hash(r.frozen_payload!)!==r.payload_hash)throw new Refused('publication_payload_unqualified');
 const source=await plan(env);if(source.planHash!==r.plan_hash)throw new Refused('publication_source_changed');
 const bot=await qualifyPublicationDestination(env,r.guild_id,r.channel_id!);
 // A fresh selection's legacy seed is only a fallback. Consumed publication custody records
 // the replacement pointer, including after a deleted legacy message was replaced and pinned.
 const prior=r.stage==='pending'?await env.DB.prepare(`SELECT message_id FROM ruleset_publications WHERE guild_id=?1 AND target_key=?2
 AND channel_id=?3 AND parent_id=?3 AND message_id IS NOT NULL AND claim_nonce IS NOT NULL
 AND publication_id<>?4 AND selection_revision<?5 ORDER BY selection_revision DESC LIMIT 1`).bind(r.guild_id,key,r.channel_id,r.publication_id,r.selection_revision).first<{message_id:string}>():null;
 const knownPointer=prior?.message_id??r.message_id??null;
 let msg=knownPointer?await publicationMessage(env,r.channel_id!,knownPointer):null;
 if(!msg&&key==='guide')msg=await discoverGuide(env,r.channel_id!,bot);
 if(msg&&!messageOwned(msg,r.channel_id!,bot))throw new Refused('publication_message_unqualified');
 const stage=!msg?'create':!messageMatches(msg,payload)?'edit':!msg.pinned?'pin':null;
 const pointer=msg?.id??null,nonce=randomToken();
 const predicate=`${current} AND ${originalFence(r)} AND r.actor=?1 AND r.actor_generation IS ?7 AND r.session_version=?2 AND r.session_expires=?3
 AND r.payload_hash=?8 AND r.frozen_payload=?9 AND r.channel_id=?10 AND r.parent_id=?11 AND r.state=?12 AND r.claim_nonce IS ?13
 AND r.profile_revision=?17 AND r.selection_revision=?18 AND r.plan_hash=?19 AND r.record_hash IS ?20 AND r.message_id IS ?21
 AND NOT EXISTS(SELECT 1 FROM ruleset_publications other WHERE other.guild_id=r.guild_id AND other.target_key=r.target_key
 AND other.publication_id<>r.publication_id AND other.state IN('claimed','unknown'))`;
 const args=[...actorArgs(r),r.guild_id,r.publication_id,r.target_key,r.actor_generation,r.payload_hash,r.frozen_payload,r.channel_id,r.parent_id,r.state,r.claim_nonce,nonce,pointer,stage??'pending',r.profile_revision,r.selection_revision,r.plan_hash,r.record_hash,r.message_id];
 const claimed=await env.DB.prepare(`UPDATE ruleset_publications AS r SET claim_nonce=?14,message_id=?15,stage=?16,state='claimed',updated_at=${DB_NOW}
 WHERE r.guild_id=?4 AND r.publication_id=?5 AND r.target_key=?6 AND ${predicate} RETURNING *`).bind(...args).all<Row>();
 if(claimed.results.length!==1)throw new Refused('publication_claim_refused');r=claimed.results[0]!;
 if(!stage)return settle(env,r,pointer,true);
 // The consuming last proof keeps the ORIGINAL selected row, nonce, destination and privacy generation after every GET.
 if(!await originalProof(env,r))return settle(env,r,pointer,false,'refused');
 try{
  const result=await writePublication(env,stage,r.channel_id!,pointer,payload,nonce);
  const id=stage==='pin'?pointer:result?.id??null;
  if(stage!=='pin'&&(!result||!messageOwned(result,r.channel_id!,bot)||!messageMatches(result,payload)))return settle(env,r,null,false,'unknown');
  try{return await settle(env,r,id,stage==='pin'||result?.pinned===true);}
  catch{return {state:'known_response_unrecorded',messageId:id,publicationId:publication,target:key};}
 }catch(e){return settle(env,r,null,false,definitePublicationRefusal(e)?'refused':'unknown');}
}
export async function reconcileRulesetTarget(env:Env,s:Session,publication:string,key:string,messageId:unknown){
 await staffProof(env,s);const r=await getRow(env,publication,key);
 if(!['claimed','unknown','held'].includes(r.state)||!r.claim_nonce)throw new Refused('publication_reconciliation_unavailable');
 const id=typeof messageId==='string'?messageId:r.message_id;if(!id||!/^\d{17,20}$/.test(id)||r.message_id&&r.message_id!==id)throw new Refused('publication_pointer_required');
 const bot=await qualifyPublicationDestination(env,r.guild_id,r.channel_id!),msg=await publicationMessage(env,r.channel_id!,id);
 if(!r.frozen_payload||await hash(r.frozen_payload)!==r.payload_hash)throw new Refused('publication_payload_unqualified');
 const payload=JSON.parse(r.frozen_payload!) as PublicPayload;
 if(!msg||!messageOwned(msg,r.channel_id!,bot)||!messageMatches(msg,payload)||(r.stage==='create'&&String(msg.nonce)!==r.claim_nonce)||(r.stage==='pin'&&msg.pinned!==true))throw new Refused('publication_reconciliation_unqualified');
 return settle(env,r,id,msg.pinned===true);
}
export async function handleRulesetPublication(request:Request,env:Env,parts:string[],body:Record<string,unknown>):Promise<Response>{
 try{
  const s=await session(request,env);
  if(request.method==='GET'&&!parts.length)return apiJson(await rulesetPublicationStatus(env,s));
  if(request.method!=='POST'||!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)return apiJson({error:'publication_request_refused'},403);
  if(parts[0]==='select'&&parts.length===1)return apiJson(await selectRulesetPublication(env,s,body));
  if(parts.length===1&&['publish','reconcile'].includes(parts[0]!))return apiJson(parts[0]==='publish'?await publishRulesetTarget(env,s,String(body.publicationId??''),String(body.target??'')):await reconcileRulesetTarget(env,s,String(body.publicationId??''),String(body.target??''),body.messageId));
  return apiJson({error:'not_found'},404);
 }catch(e){return apiJson({error:e instanceof Refused?e.code:'publication_outcome_unconfirmed'},e instanceof Refused?e.status:503);}
}
