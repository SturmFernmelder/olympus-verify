/** Owner-only, create-if-observed-absent registration of one fixed command.
 * A durable attempt is never reset after an unknown reply. Other commands are
 * read and compared, never submitted to Discord or rewritten. */
import type {Env} from './env';
import {rest} from './discord';
import {apiJson,originalUserSession,PAGE_VERSION,sameOrigin,type SiteUser} from './site-core';
import {admittedReadAs,FENCE_REFUSED,fenceSql,type CommunitySubject} from './community-context';
import {discordCommandOwner225} from './discord-command-owner225';
import {OLYMPUS_PROFILE_COMMAND307 as COMMAND} from './discord-profile-command-definition307';

const APP='1550176895671341076',GUILD='236932545793490944',KEY='discordProfileCommandRegistration307';
const ENDPOINT=`/applications/${APP}/guilds/${GUILD}/commands`;
const ID=/^[1-9][0-9]{16,19}$/;
type Row=Record<string,unknown>;
class Held extends Error {constructor(readonly code:string,readonly status=409){super(code);}}
const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):record(value)
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function census(value:unknown):Row[]{
 if(!Array.isArray(value)||value.length>100)throw new Held('discord_registry_unconfirmed',503);
 const ids=new Set<string>(),names=new Set<string>();
 for(const row of value){
  if(!record(row)||typeof row.id!=='string'||!ID.test(row.id)||row.application_id!==APP||row.guild_id!==GUILD
    ||typeof row.name!=='string'||!row.name||![1,2,3].includes(row.type as number)||ids.has(row.id)
    ||names.has(`${row.type}:${row.name}`))throw new Held('discord_registry_unconfirmed',503);
  ids.add(row.id);names.add(`${row.type}:${row.name}`);
 }
 return value;
}
function exact(row:Row):boolean{
 const ignored=new Set(['id','application_id','guild_id','version']);
 const defaults:Record<string,unknown>={default_member_permissions:null,default_permission:true,dm_permission:true,nsfw:false};
 const clean:Row={};
 for(const [key,value] of Object.entries(row)){
  if(ignored.has(key))continue;
  if(Object.hasOwn(defaults,key)&&(value===null||value===defaults[key]))continue;
  if(['name_localizations','description_localizations'].includes(key)&&(value===null||record(value)&&Object.keys(value).length===0))continue;
  clean[key]=value;
 }
 if(Array.isArray(clean.options))clean.options=clean.options.map(option=>{
  if(!record(option))return option;
  return Object.fromEntries(Object.entries(option).filter(([key,value])=>!(['name_localizations','description_localizations'].includes(key)
    &&(value===null||record(value)&&Object.keys(value).length===0))));
 });
 return equal(clean,COMMAND);
}
const other=(rows:Row[])=>rows.filter(row=>!(row.type===1&&row.name===COMMAND.name))
  .sort((a,b)=>String(a.id).localeCompare(String(b.id)));

export async function handleProfileCommand307(request:Request,env:Env,admin:SiteUser,body:Record<string,unknown>):Promise<Response>{
 let attempted=false;
 try{
  if(!['GET','POST'].includes(request.method))throw new Held('method_not_allowed',405);
  if(new URL(request.url).search)throw new Held('bad_request',400);
  if(request.method==='POST'&&(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION))throw new Held('bad_origin_or_page',403);
  if(request.method==='POST'&&(Object.keys(body).length!==1||body.confirm!==true))throw new Held('confirm',400);
  const session=originalUserSession(admin),keys=['DB','SITE_ADMINS','GUILD_ID','DISCORD_APP_ID','DISCORD_BOT_TOKEN','COOKIE_SECRET'] as const;
  const slots=keys.map(key=>Object.getOwnPropertyDescriptor(env,key));
  const check=()=>{
   if(originalUserSession(admin)!==session||!discordCommandOwner225(env,session.u,GUILD)||keys.some((key,index)=>{
    const initial=slots[index],current=Object.getOwnPropertyDescriptor(env,key);
    return !initial||!current||!Object.hasOwn(initial,'value')||!Object.hasOwn(current,'value')||initial.value!==current.value;
   }))throw new Held('forbidden',403);
  };
  const subject:CommunitySubject=Object.freeze({discordId:session.u,sessionVersion:session.v,expiresAt:session.e,
    privacyGeneration:session.g,accountIncarnation:session.n,originalSession:session});
  const admitted=async()=>{
   check();const result=await admittedReadAs(env,subject,'applicantWrite',[
    env.DB.prepare('SELECT NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?1 AND banned=1) AS ok').bind(session.u)]);
   check();if(result===FENCE_REFUSED||(result[0]?.results[0] as {ok?:number}|undefined)?.ok!==1)throw new Held('account_changed',403);
  };
  const read=async()=>{await admitted();const rows=census(await rest<unknown>(env,'GET',ENDPOINT+'?with_localizations=true'));await admitted();return rows;};
  const before=await read(),existing=before.find(row=>row.type===1&&row.name===COMMAND.name);
  if(existing)return exact(existing)?apiJson({registered:true,outcome:'already_registered',postAttempted:false})
    :apiJson({registered:false,error:'command_conflict',message:'An existing /olympus-profile definition differs. It was left unchanged.'},409);
  if(request.method==='GET')return apiJson({registered:false,outcome:'absent',postAttempted:false});

  await admitted();
  const value=JSON.stringify({version:1,command:COMMAND.name,state:'attempted',nonce:crypto.randomUUID()});
  const fence=fenceSql('applicantWrite',2,3,4,session.g,session.n);
  const claim=await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
   SELECT ?1,?5,CAST(strftime('%s','now') AS INTEGER),?2 WHERE ${fence}
   AND NOT EXISTS(SELECT 1 FROM members WHERE discord_id=?2 AND banned=1)
   ON CONFLICT(key) DO NOTHING RETURNING value`).bind(KEY,session.u,session.v,session.e,value).all<{value:string}>();
  if(claim.success!==true||claim.meta.changes!==1||claim.results.length!==1||claim.results[0]?.value!==value)
   return apiJson({registered:false,error:'registration_held',postAttempted:false,
     message:'A prior registration attempt is retained or this account changed. Nothing was sent again. Use Check registration.'},409);
  // POST is Discord's upsert, not an atomic create-only API. Recheck after the
  // durable claim and do not overwrite a command created in the meantime.
  const current=await read(),concurrent=current.find(row=>row.type===1&&row.name===COMMAND.name);
  if(!equal(other(before),other(current)))throw new Held('discord_registry_changed');
  if(concurrent)return exact(concurrent)?apiJson({registered:true,outcome:'already_registered',postAttempted:false,otherCommandsPreserved:true})
    :apiJson({registered:false,error:'command_conflict',message:'An existing /olympus-profile definition differs. It was left unchanged.'},409);
  await admitted();
  attempted=true;
  let ack:Row|null=null;
  // attempt1 disables the generic429 replay. A second click never resets the claim.
  try{const reply=await rest<unknown>(env,'POST',ENDPOINT,COMMAND,1);if(record(reply))ack=reply;}catch{/* Read once below; never retry this POST. */}
  const after=await read(),registered=after.find(row=>row.type===1&&row.name===COMMAND.name);
  if(!registered||!exact(registered)||!equal(other(before),other(after)))throw new Held('registration_readback_unconfirmed',503);
  const acknowledged=!!ack&&ack.application_id===APP&&ack.guild_id===GUILD&&exact(ack)&&ack.id===registered.id;
  return apiJson({registered:true,outcome:acknowledged?'registered':'observed_after_unconfirmed_attempt',
    postAttempted:true,acknowledged,otherCommandsPreserved:true});
 }catch(error){
  return apiJson({registered:false,error:error instanceof Held?error.code:'registration_unavailable',postAttempted:attempted,
   message:attempted?'Registration outcome is unconfirmed. Nothing will be sent again automatically. Use Check registration.'
    :'Registration could not be admitted. No command change was sent.'},error instanceof Held?error.status:503);
 }
}
