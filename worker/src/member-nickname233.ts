/** Explicit, own-account nickname buttons. No automatic nickname changes,
 * DM, role action, timer, restored capability or unknown-effect retry. */
import type {Env} from './env';
import {API,credentialFetch,json,reply,rest,userOf,patchNicknameOnce233,type Interaction} from './discord';
import {captureCanonicalRankConfig233,hasCanonicalMemberAccess233} from './canonical-ranks233';
import {captureRoutineMembership232,assertRoutineMembership232,routineMembership232Facts,routineMembership232Environment,routineMembership232Predicate,closeRoutineMembership232,type RoutineMembership232} from './routine-membership-authority232';
import {NICKNAME_GUILD233,nicknameKey233,parseNicknameRecord233,validStoredNickname233,type NicknameRecord233} from './member-nickname-data233';
import {normalizeCharacter} from './codes';

export const NICKNAME_USE233='nickname233:use',NICKNAME_RESET233='nickname233:reset';
export const nicknameButtons233=()=>[
 {type:2 as const,style:2 as const,label:'🏷️ Use Character & Guild Name',custom_id:NICKNAME_USE233},
 {type:2 as const,style:2 as const,label:'↩️ Reset Nickname',custom_id:NICKNAME_RESET233},
];
export const isNicknameInteraction233=(i:Interaction)=>i.type===3&&[NICKNAME_USE233,NICKNAME_RESET233].includes(i.data?.custom_id??'');
const ID=/^[1-9][0-9]{16,19}$/,at=()=>Math.floor(Date.now()/1000);
const held='Your nickname could not be changed. Verify your current character and wait for a fresh complete roster, then try this button again.';
const unknown='The previous nickname request has an unconfirmed outcome. No second change was sent. Ask High Council for help before another nickname change.';
function data(o:unknown,k:string):unknown{if(!o||typeof o!=='object')throw Error('nickname_provider_held');const d=Object.getOwnPropertyDescriptor(o,k);if(!d)return undefined;if(!Object.hasOwn(d,'value'))throw Error('nickname_provider_held');return d.value;}
function graph(input:unknown):()=>void{
 const seen=new Set<object>(),checks:(()=>void)[]=[];const visit=(v:unknown)=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);const proto=Object.getPrototypeOf(v),keys=Reflect.ownKeys(v),slots=keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k)!;if(!Object.hasOwn(d,'value'))throw Error('nickname_provider_held');return d;});
 checks.push(()=>{if(Object.getPrototypeOf(v)!==proto||Reflect.ownKeys(v).length!==keys.length||Reflect.ownKeys(v).some((k,n)=>k!==keys[n]))throw Error('nickname_provider_changed');for(let n=0;n<keys.length;n++){const d=Object.getOwnPropertyDescriptor(v,keys[n]!);if(!d||['value','writable','enumerable','configurable'].some(k=>!Object.is(d[k as keyof PropertyDescriptor],slots[n]![k as keyof PropertyDescriptor])))throw Error('nickname_provider_changed');}});for(const d of slots)visit(d.value);};visit(input);return()=>{for(const c of checks)c();};
}
/** Discord documents1..32characters; this is conservatively<=32UTF16 units,
 * cutting at grapheme boundaries and never inside a surrogate pair. */
export function formatNickname233(character:string):string{
 if(typeof character!=='string'||!character.trim()||/[\u0000-\u001f\u007f]/u.test(character)||!validStoredNickname233(character))throw Error('nickname_character_held');
 const suffix=' <OLYMPUS PRIME>',limit=32-suffix.length;let head='';
 for(const {segment} of new Intl.Segmenter('en',{granularity:'grapheme'}).segment(character.trim())){if(head.length+segment.length>limit)break;head+=segment;}
 if(!head.trim())throw Error('nickname_character_held');return head.trimEnd()+suffix;
}
/** Display the confirmed value as quoted, escaped text in this own-only reply. */
function nicknameConfirmation233(action:'use'|'reset',desired:string|null,character:string,earlier=false):string{
 const label=desired===null?'no custom nickname':'“'+desired.replace(/([\`*_{}\[\]()#+\-.!|~<>@])/g,'\\$1')+'”';
 let shortened=false;
 if(action==='use'&&desired!==null)try{shortened=desired===formatNickname233(character)&&desired!==character.trim()+' <OLYMPUS PRIME>';}catch{/* A saved original is displayed, never reformatted or replayed. */}
 return (earlier?'Your earlier nickname change is confirmed. ':'')+(action==='reset'?'Your server nickname is restored to ':'Your server nickname is now ')+label+'.'
  +(shortened?' The character name was shortened to keep the guild tag within the nickname length limit.':'')
  +(earlier?' No second change was sent.':action==='use'?' Reset Nickname restores your saved previous nickname.':'');
}

type Member={roles:string[];nick:string|null;id:string};
function member(raw:unknown,subject:string):Member{
 const roles=data(raw,'roles'),user=data(raw,'user'),nick=data(raw,'nick');
 if(data(user,'id')!==subject||!Array.isArray(roles)||roles.some(r=>typeof r!=='string'||!ID.test(r))||nick!==undefined&&!validStoredNickname233(nick))throw Error('nickname_provider_held');
 return {id:subject,roles:roles.slice(),nick:nick===undefined?null:nick as string|null};
}
function canManage(roles:unknown,bot:Member,target:Member,guild:unknown):boolean{
 if(!Array.isArray(roles)||data(guild,'id')!==NICKNAME_GUILD233||data(guild,'owner_id')===target.id)return false;
 let botPosition=-1,targetPosition=0,permissions=0n;
 const known=new Set<string>();for(const raw of roles){const id=data(raw,'id'),position=data(raw,'position'),p=data(raw,'permissions');
  if(typeof id!=='string'||!ID.test(id)||known.has(id)||!Number.isSafeInteger(position)||(position as number)<0||typeof p!=='string'||!/^(0|[1-9][0-9]{0,24})$/.test(p))return false;known.add(id);
  if(bot.roles.includes(id)){botPosition=Math.max(botPosition,position as number);permissions|=BigInt(p);}if(target.roles.includes(id))targetPosition=Math.max(targetPosition,position as number);
  if(id===NICKNAME_GUILD233)permissions|=BigInt(p);
 }
 if(bot.roles.some(id=>!known.has(id))||target.roles.some(id=>!known.has(id)))return false;
 return botPosition>targetPosition&&((permissions&8n)!==0n||(permissions&(1n<<27n))!==0n);
}
type Capture=ReturnType<typeof captureCanonicalRankConfig233>;
async function perform(env:Env,subject:string,operation:string,action:'use'|'reset',selection:Capture,deadline:number):Promise<string>{
 let cap:RoutineMembership232|null=null,key='',raw:string|null=null,claimed:string|null=null,acknowledged=false,effectStarted=false;
 const baseCheck=()=>{if(selection.mode!=='enabled'||!selection.current()||at()>=deadline)throw Error('nickname_context_held');};
 try{
  baseCheck();cap=await captureRoutineMembership232(env,subject);baseCheck();if(!cap)return held;
  const f=routineMembership232Facts(cap);if(f.cause!=='eligible'||!f.primary)return held;
  env=routineMembership232Environment(env,cap);key=nicknameKey233(subject);
  const check=()=>{baseCheck();assertRoutineMembership232(env,cap!);};check();
  const rows=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(key).all<{value:string}>();check();
  if(!rows.success||rows.results.length>1)return held;raw=rows.results[0]?.value??null;const saved=raw===null?null:parseNicknameRecord233(raw);
  if(raw!==null&&(!saved||saved.generation!==f.subjectGeneration||saved.state==='dispatching'||saved.state==='unknown'))return unknown;
  const source=await env.DB.prepare('SELECT name FROM roster_members WHERE snapshot_id=?1 AND name_key=?2 AND guid=?3').bind(f.snapshotId,f.primary.nameKey,f.primary.guid).all<{name:string}>();check();
  if(!source.success||source.results.length!==1||normalizeCharacter(source.results[0]!.name)!==f.primary.nameKey)return held;
  const get=async(p:string)=>{check();const r=await rest(env,'GET',p,undefined,1);check();return r;};
  const me=await get('/users/@me'),botId=data(me,'id');if(typeof botId!=='string'||!ID.test(botId))return held;
  const rolesRaw=await get(`/guilds/${NICKNAME_GUILD233}/roles`),guildRaw=await get(`/guilds/${NICKNAME_GUILD233}`),botRaw=await get(`/guilds/${NICKNAME_GUILD233}/members/${botId}`),targetRaw=await get(`/guilds/${NICKNAME_GUILD233}/members/${subject}`);
  const witnesses=graph([me,rolesRaw,guildRaw,botRaw,targetRaw]),bot=member(botRaw,botId),target=member(targetRaw,subject);witnesses();
  if(!hasCanonicalMemberAccess233(env,target.roles))return held;
  if(!canManage(rolesRaw,bot,target,guildRaw))return 'Discord cannot change your nickname because your role is at or above the bot, you own the server, or the bot lacks Manage Nicknames. No nickname change was sent.';
  // A returned original PATCH ACK is persisted before its confirmation GET.
  // A later click may only read-confirm that ACK, never retransmit its effect.
  if(saved?.state==='acknowledged'){
   if(target.nick!==saved.desired)return 'The acknowledged nickname changed again. No new change was sent; ask an officer to review your saved nickname.';
   const next=JSON.stringify({...saved,state:'applied',updatedAt:at()});const p=routineMembership232Predicate(env,cap,4);
   const statement=saved.action==='reset'?env.DB.prepare(`DELETE FROM site_settings WHERE key=?1 AND value=?2 AND ?3 IS NOT NULL AND (${p.sql}) RETURNING key`):env.DB.prepare(`UPDATE site_settings SET value=?3,updated_at=CAST(strftime('%s','now') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2 AND (${p.sql}) RETURNING key`);
   const r=await statement.bind(key,raw,next,...p.values).all();check();
   return r.success&&r.results.length===1?nicknameConfirmation233(saved.action,saved.desired,source.results[0]!.name,true):unknown;
  }
  const desired=action==='use'?formatNickname233(source.results[0]!.name):saved?.previous??null;
  const previous=saved?saved.previous:action==='use'?target.nick:null,record:NicknameRecord233={v:1,guild:NICKNAME_GUILD233,generation:f.subjectGeneration,previous,desired,expected:target.nick,state:'dispatching',action,operation,nonce:crypto.randomUUID().replaceAll('-',''),createdAt:at(),updatedAt:at()};
  claimed=JSON.stringify(record);const p=routineMembership232Predicate(env,cap,5);check();witnesses();
  const claim=await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by) SELECT ?1,?3,CAST(strftime('%s','now') AS INTEGER),NULL WHERE (${p.sql}) AND ((?4=0 AND NOT EXISTS(SELECT 1 FROM site_settings WHERE key=?1)) OR (?4=1 AND EXISTS(SELECT 1 FROM site_settings WHERE key=?1 AND value=?2))) ON CONFLICT(key)DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=NULL WHERE site_settings.value=?2 RETURNING key`).bind(key,raw,claimed,raw===null?0:1,...p.values).all();check();
  if(!claim.success||claim.results.length!==1){claimed=null;return 'Another nickname request is already in progress. No new change was sent.';}
  const finalRaw=await get(`/guilds/${NICKNAME_GUILD233}/members/${subject}`),finalWitness=graph(finalRaw),finalMember=member(finalRaw,subject);
  if(finalMember.nick!==record.expected||!hasCanonicalMemberAccess233(env,finalMember.roles)||!canManage(rolesRaw,bot,finalMember,guildRaw)){
   const next=JSON.stringify({...record,state:'refused',updatedAt:at()});await env.DB.prepare('UPDATE site_settings SET value=?3,updated_at=CAST(strftime(\'%s\',\'now\') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2').bind(key,claimed,next).run();claimed=null;return 'Your Discord membership or nickname changed while this request was being checked. No change was sent. Use a fresh button.';
  }
  check();witnesses();finalWitness();
  // Repeat the original DB predicate immediately before handing over the one PATCH.
  const guard=routineMembership232Predicate(env,cap,3),ready=await env.DB.prepare(`SELECT 1 AS ok WHERE EXISTS(SELECT 1 FROM site_settings WHERE key=?1 AND value=?2) AND (${guard.sql})`).bind(key,claimed,...guard.values).first();check();witnesses();finalWitness();if(!ready)throw Error('nickname_context_held');
  const status=await patchNicknameOnce233(env,subject,desired,()=>{check();witnesses();finalWitness();effectStarted=true;});
  if(status!==200&&status!==204){
   if([400,401,403,404,429].includes(status)){const next=JSON.stringify({...record,state:'refused',updatedAt:at()});await env.DB.prepare('UPDATE site_settings SET value=?3,updated_at=CAST(strftime(\'%s\',\'now\') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2').bind(key,claimed,next).run();claimed=null;return status===403?'Discord refused the nickname change. The bot needs Manage Nicknames and a role above yours; no change was confirmed.':status===429?'Discord rate-limited the nickname change. No automatic retry was sent. Try a new button later.':'Discord refused the nickname change. No change was confirmed; ask an officer if this continues.';}
   throw Error('nickname_outcome_unknown');
  }
  acknowledged=true;const ack=JSON.stringify({...record,state:'acknowledged',updatedAt:at()});
  const receipt=await env.DB.prepare('UPDATE site_settings SET value=?3,updated_at=CAST(strftime(\'%s\',\'now\') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2 RETURNING key').bind(key,claimed,ack).all();if(!receipt.success||receipt.results.length!==1)return unknown;claimed=ack;
  const after=member(await get(`/guilds/${NICKNAME_GUILD233}/members/${subject}`),subject);if(after.nick!==desired)return 'Discord acknowledged the nickname change, but the current nickname differs. No second change was sent; ask an officer for help.';
  const done=routineMembership232Predicate(env,cap,4),next=JSON.stringify({...record,state:'applied',updatedAt:at()});
  const finish=action==='reset'?env.DB.prepare(`DELETE FROM site_settings WHERE key=?1 AND value=?2 AND ?3 IS NOT NULL AND (${done.sql}) RETURNING key`).bind(key,ack,next,...done.values):env.DB.prepare(`UPDATE site_settings SET value=?3,updated_at=CAST(strftime('%s','now') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2 AND (${done.sql}) RETURNING key`).bind(key,ack,next,...done.values);
  const finished=await finish.all();check();if(!finished.success||finished.results.length!==1)return unknown;claimed=null;
  return nicknameConfirmation233(action,after.nick,source.results[0]!.name);
 }catch{
  if(claimed&&!acknowledged)try{await env.DB.prepare('UPDATE site_settings SET value=json_set(value,\'$.state\',?3),updated_at=CAST(strftime(\'%s\',\'now\') AS INTEGER),updated_by=NULL WHERE key=?1 AND value=?2').bind(key,claimed,effectStarted?'unknown':'refused').run();}catch{/* Original spent custody is retained even if its final receipt is lost. */}
  return claimed&&(effectStarted||acknowledged)?unknown:held;
 }finally{if(cap)closeRoutineMembership232(cap);}
}
/** Signature and replay validation remain in index.ts. The interaction token is
 * retained only by this original private continuation and is never stored. */
export function handleNicknameInteraction233(env:Env,i:Interaction,defer?:(label:string,work:()=>Promise<unknown>)=>void):Response{
 const actor=userOf(i),selection=captureCanonicalRankConfig233(env),deadline=at()+180;
 if(!isNicknameInteraction233(i)||i.guild_id!==NICKNAME_GUILD233||env.GUILD_ID!==NICKNAME_GUILD233||!actor||!ID.test(actor.id)||!ID.test(i.id??'')||!defer||typeof i.token!=='string'||i.token.length<20||i.token.length>2048||!/^[A-Za-z0-9_.-]+$/.test(i.token)||!ID.test(env.DISCORD_APP_ID??''))return reply(held);
 const subject=actor.id,operation=i.id,action=i.data!.custom_id===NICKNAME_USE233?'use':'reset',token=i.token,application=env.DISCORD_APP_ID;
 defer('interaction_nickname233',async()=>{const content=await perform(env,subject,operation,action,selection,deadline);if(at()>=deadline)return;try{const response=await credentialFetch(`${API}/webhooks/${application}/${token}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}})},()=>{if(at()>=deadline)throw Error('nickname_reply_expired');});await response.body?.cancel();}catch{/* Ephemeral reply unavailable; no public or DM fallback/retry. */}});
 return json({type:5,data:{flags:64}});
}
