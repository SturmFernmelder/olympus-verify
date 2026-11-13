import type {Env} from './env';
import type {Interaction} from './discord';
import {now} from './db';

/** Called only within the signature-verified interaction dispatcher. Captures
 * the original private message context before awaits; this selects a reply
 * mode only and grants no account, staff or event authority. Existing control
 * parsers and current actor/effect fences still decide every action. */
export function capturePrivateComponent280(env:Env,i:Interaction,signedAt:number,family:'hub'|'access'):(actor:string)=>boolean{
 const message=i.message,data=i.data,actor=i.member?.user??i.user,app=env.DISCORD_APP_ID,guild=env.GUILD_ID;
 const id=i.id,token=i.token,channel=i.channel_id,custom=data?.custom_id,flags=message?.flags,messageId=message?.id,messageChannel=message?.channel_id,actorId=actor?.id,at=now();
 const parts=custom?.split(':')??[],known=family==='hub'?(parts[0]==='o224'||parts[0]==='r222'):parts[0]==='access242';
 const expiry=parts[family==='hub'?2:3],snow=(v:unknown)=>typeof v==='string'&&/^[1-9][0-9]{16,19}$/.test(v);
 const admitted=i.type===3&&known&&snow(app)&&i.application_id===app&&i.guild_id===guild&&snow(actorId)&&parts[1]===actorId&&typeof expiry==='string'&&/^[0-9]{10}$/.test(expiry)&&Number(expiry)>at&&Number(expiry)<=at+180&&Number.isSafeInteger(signedAt)&&Math.abs(at-signedAt)<=300&&Number(expiry)<=signedAt+300&&snow(messageId)&&snow(channel)&&messageChannel===channel&&typeof flags==='number'&&Number.isSafeInteger(flags)&&flags>=0&&flags<=0xffffffff&&(flags&64)===64;
 return who=>!!admitted&&who===actorId&&env.DISCORD_APP_ID===app&&env.GUILD_ID===guild&&i.type===3&&i.id===id&&i.token===token&&i.application_id===app&&i.guild_id===guild&&i.channel_id===channel&&i.data===data&&data?.custom_id===custom&&i.message===message&&message?.id===messageId&&message?.channel_id===messageChannel&&message?.flags===flags&&(i.member?.user??i.user)===actor&&actor?.id===actorId&&now()<Number(expiry);
}
