/** Single-attempt provider adapter. HTTP failures never cause a second write or a fresh selection. */
import type { Env } from './env';
import { rest, DiscordError } from './discord';
import { GUIDE_VERIFY, GUIDE_STATUS } from './guide';

export type PublicPayload={content?:string;embeds:unknown[];components?:unknown[];allowed_mentions:{parse:never[]}};
export type PublicationMessage={id:string;channel_id:string;author?:{id:string};content?:string;embeds?:unknown[];components?:unknown[];pinned?:boolean;nonce?:string|number};
const ID=/^\d{17,20}$/;
function samePayload(actual:unknown,wanted:unknown):boolean {
 if(Array.isArray(wanted))return Array.isArray(actual)&&actual.length===wanted.length&&wanted.every((v,i)=>samePayload(actual[i],v));
 if(wanted&&typeof wanted==='object'){
  if(!actual||typeof actual!=='object'||Array.isArray(actual))return false;
  const a=actual as Record<string,unknown>,w=wanted as Record<string,unknown>;
  if(!Object.keys(w).every(k=>Object.hasOwn(a,k)&&samePayload(a[k],w[k])))return false;
  // Only harmless response defaults are ignored. Source-defined type/flags/id still compare exactly.
  return Object.keys(a).every(k=>Object.hasOwn(w,k)||(k==='type'&&a[k]==='rich')
   ||(k==='id'&&Number.isSafeInteger(a[k])&&(a[k] as number)>=0)
   ||((k==='inline'||k==='disabled')&&a[k]===false)||(k==='flags'&&a[k]===0));
 }
 return actual===wanted;
}
/** Semantic equality preserves every source field and refuses added content or changed component types. */
export function messageMatches(m:PublicationMessage,p:PublicPayload):boolean{
 return (m.content??'')===(p.content??'')&&samePayload(m.embeds??[],p.embeds)&&samePayload(m.components??[],p.components??[]);
}
export function messageOwned(m:PublicationMessage,channel:string,bot:string):boolean{
 return ID.test(m?.id??'')&&m.channel_id===channel&&m.author?.id===bot;
}
export async function qualifyPublicationDestination(env:Env,guild:string,channel:string):Promise<string>{
 if(!ID.test(guild)||!ID.test(channel)||!ID.test(env.DISCORD_APP_ID??'')||guild!==env.INTROS_GUILD_ID||guild!==env.GUILD_ID)throw Error('publication_destination_unqualified');
 const bot=await rest<{id:string;bot?:boolean}>(env,'GET','/users/@me',undefined,0);
 if(bot.id!==env.DISCORD_APP_ID||bot.bot!==true)throw Error('publication_bot_unqualified');
 const c=await rest<{id:string;guild_id?:string;type?:number}>(env,'GET',`/channels/${channel}`,undefined,0);
 if(c.id!==channel||c.guild_id!==guild||c.type!==0)throw Error('publication_channel_unqualified');
 return bot.id;
}
export async function publicationMessage(env:Env,channel:string,id:string):Promise<PublicationMessage|null>{
 try{return await rest<PublicationMessage>(env,'GET',`/channels/${channel}/messages/${id}`,undefined,0);}
 catch(e){if(e instanceof DiscordError&&e.status===404){let code=0;try{code=JSON.parse(e.body).code;}catch{}if(code===10008)return null;}throw e;}
}
/** Discovery uses only a unique pinned guide owned by the qualified bot, never another author's embed. */
export async function discoverGuide(env:Env,channel:string,bot:string):Promise<PublicationMessage|null>{
 const raw=await rest<{items?:Array<{message:PublicationMessage}>}>(env,'GET',`/channels/${channel}/messages/pins`,undefined,0);
 if(!Array.isArray(raw.items)||raw.items.length>50)throw Error('publication_pins_unqualified');
 const matches=raw.items.map(i=>i.message).filter(m=>messageOwned(m,channel,bot)&&JSON.stringify(m.components??[]).includes(`"custom_id":"${GUIDE_VERIFY}"`)&&JSON.stringify(m.components??[]).includes(`"custom_id":"${GUIDE_STATUS}"`));
 if(matches.length>1)throw Error('publication_guide_ambiguous');
 return matches[0]??null;
}
export async function writePublication(env:Env,stage:'create'|'edit'|'pin',channel:string,message:string|null,payload:PublicPayload,nonce:string):Promise<PublicationMessage|null>{
 if(stage==='create')return rest<PublicationMessage>(env,'POST',`/channels/${channel}/messages`,{...payload,allowed_mentions:{parse:[]},nonce,enforce_nonce:true},0);
 if(!message||!ID.test(message))throw Error('publication_pointer_missing');
 if(stage==='edit')return rest<PublicationMessage>(env,'PATCH',`/channels/${channel}/messages/${message}`,{...payload,allowed_mentions:{parse:[]}},0);
 await rest(env,'PUT',`/channels/${channel}/messages/pins/${message}`,undefined,0);
 return null;
}
export const definitePublicationRefusal=(e:unknown):boolean=>e instanceof DiscordError&&[400,401,403,404,405,413,429].includes(e.status);
