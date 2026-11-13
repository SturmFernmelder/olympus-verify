import {capturePrivateComponent280} from './private-component280';
/** Private current-access diagnostics and explicit guarded repair. No role is
 * inferred from a Discord name, and staff access never becomes identity proof. */
import type {Env} from './env';
import {API,credentialFetch,json,option,reply,subcommand,userOf,type Interaction} from './discord';
import {now} from './db';
import {captureGuildActor219,currentGuildActor219,guildActorBatch219,guildStaffNow219} from './guild-command-authority219';
import {discordCommandOwner225} from './discord-command-owner225';
import {reconcileRoleBatch242,type RoleWorkDefer242} from './role-reconcile242';
import {captureRoutineMembership232,routineMembership232Facts,closeRoutineMembership232} from './routine-membership-authority232';
import {errorRef} from './log';

const BUTTON=/^access242:([1-9][0-9]{16,19}):([1-9][0-9]{16,19}):([0-9]{10})$/;
export const isAccessCheck242=(i:Interaction)=>i.type===2&&(i.data?.name==='check-access'||i.data?.name==='olympus'&&subcommand(i)==='check')||i.type===3&&(i.data?.custom_id??'').startsWith('access242:');
export async function handleAccessCheck242(env:Env,i:Interaction,signedAt:number,defer?:RoleWorkDefer242):Promise<Response>{
 if(!defer||!isAccessCheck242(i))return reply('Run a fresh /olympus check command.');
 const privateUpdate=capturePrivateComponent280(env,i,signedAt,'access');
 const actor=userOf(i),button=BUTTON.exec(i.data?.custom_id??''),subject=button?.[2]??option<string>(i,'member')??actor.id;
 if(!/^[1-9][0-9]{16,19}$/.test(subject)||i.type===3&&(!button||button[1]!==actor.id||Number(button[3])<=now()||Number(button[3])>now()+180))return reply('This private Fix button expired. Run /olympus check again.');
 let a;try{a=await captureGuildActor219(env,i,now(),signedAt);}catch{return reply('Sign in on the Olympus website and use a current eligible server account first.');}
 const privileged=discordCommandOwner225(env,actor.id,i.guild_id??'')||await guildStaffNow219(env,a);
 if((subject!==actor.id||button)&&!privileged)return reply('Only the primary owner or current authorized guild staff can check another account or use Fix.');
 const app=env.DISCORD_APP_ID,token=i.token;
 if(!app||typeof token!=='string'||token.length<20||token.length>2048||!/^[A-Za-z0-9_.-]+$/.test(token))return reply('This interaction cannot receive a private response.');
 const update=privateUpdate(a.id);
 defer('interaction_access242',async()=>{
  let content='',components:unknown[]=[];
  try{
   if(!await currentGuildActor219(env,a))throw Error('account_changed');
   if(button){
    if(!discordCommandOwner225(env,actor.id,i.guild_id??'')&&!await guildStaffNow219(env,a))throw Error('staff_authority_changed');
    const result=await reconcileRoleBatch242(env,[subject]);
    content=result.results.length?'Guarded Fix result: **'+result.results[0]!.state+'** — '+result.results[0]!.reason+'.':'No role action was admitted within the current request budget.';
   }
   const records=await guildActorBatch219(env,a,[env.DB.prepare('SELECT name,status FROM characters WHERE discord_id=?1 ORDER BY bound_at LIMIT 16').bind(subject),env.DB.prepare("SELECT state,purpose,role_id FROM role_settlements WHERE subject=?1 AND attempts=1 AND state IN('dispatching','unknown') ORDER BY id LIMIT 6").bind(subject)]);
   const chars=records[0]!.results as {name:string;status:string}[],holds=records[1]!.results;
   const cap=await captureRoutineMembership232(env,subject);
   let native='Current Native target is unproven. A new name or roster snapshot alone cannot prove ownership.';
   if(cap)try{const facts=routineMembership232Facts(cap);native='Native source: '+facts.cause+(facts.primary?' · current highest '+facts.primary.rank+' ('+facts.primary.index+')':' · no current ranked character')+'.';}finally{closeRoutineMembership232(cap);}
   content+=(content?'\n\n':'')+'**Olympus access check**\n'+chars.map(c=>c.name.replace(/[\r\n`*_<>@]/g,'')+' — '+c.status).join('\n')+'\n'+native+'\n'+(holds.length?'**Held:** '+holds.length+' unresolved original role effect(s). Fix does not replay or clear these.':'No unresolved attempted role effect was returned for this account.');
   if(privileged&&!holds.length)components=[{type:1,components:[{type:2,style:1,label:'Fix current guild access',custom_id:`access242:${actor.id}:${subject}:${Math.min(a.deadline,now()+180)}`}]}];
  }catch(error){console.error('access242_held',errorRef(error));content='The current account or role proof could not be confirmed. Nothing was bypassed. Run a fresh check after the source facts are available.';components=[];}
  if(now()>=a.deadline||!await currentGuildActor219(env,a)||update&&!privateUpdate(a.id))return;
  const response=await credentialFetch(`${API}/webhooks/${app}/${token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:content.slice(0,1950),components,allowed_mentions:{parse:[]}})},()=>{if(now()>=a.deadline||update&&!privateUpdate(a.id))throw Error('access_reply_expired_or_changed');});
  await response.body?.cancel();
 });
 return update?json({type:6}):json({type:5,data:{flags:64}});
}
