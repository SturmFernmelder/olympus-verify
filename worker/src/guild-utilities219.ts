import type { Env } from './env';
import { DB_NOW, communityFeatures, qualifiesSql } from './community-context';
import { scanLimit } from './community-directory';
import { destination } from './community-event-delivery';
import { guildActorBatch219, currentGuildActor219, type GuildActor219 } from './guild-command-authority219';
import { privacySubjectWritableSql } from './privacy-serving-authority';
import { APPLICATION_SPECS_219 } from './application-specs219';
import { TALENT_ATTACHMENT_CLASSES } from './talent-build-contract';
import { talentBuildAttachment } from './talent-build-attachment';
import { parsedArmySnapshot219, armyKey, branchArmySnapshots229, type ArmySnapshot } from './army-census';
import { canonicalOlympusGuildName } from './guild-affiliation229';
import { ROYAL_WRIT_POLICY } from './royal-writs199';
import { NATIVE_RANKS_199 } from './governance-offices';
import { FOREVER_SCHEDULE } from './site-data';

export interface GuildEmbed219 { title:string;description?:string;url?:string;fields?:{name:string;value:string;inline?:boolean}[];footer?:{text:string} }
export const safeDiscordText219=(input:unknown,max=1000)=>String(input??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[@`*_~|<>\\]/g,c=>'\\'+c).slice(0,max);
/** Discord option labels are plain text, not Markdown. Keep literal punctuation
 * while bounding UTF16 units without splitting a surrogate pair. */
export function plainDiscordLabel280(input:unknown,max=100):string{
 let result='';for(const ch of String(input??'').replace(/[\u0000-\u001f\u007f]/g,' ')){if(result.length+ch.length>max)break;result+=ch;}return result;
}
// Only caller-owned separators survive per-item sanitization.
const discordLines219=(parts:readonly unknown[],separator:'\n'|'\n\n',max:number)=>
 parts.map(part=>safeDiscordText219(part,max)).join(separator).slice(0,max);
const field=(name:string,value:unknown)=>({name:safeDiscordText219(name,150),value:safeDiscordText219(value,1000)||'Unavailable'});
const NOVEMBER_TALENT_NOTES219='https://us.forums.blizzard.com/en/wow/t/2360696/9';
type Any219=Record<string,any>;
async function assetJson219(env:Env,a:GuildActor219,path:string):Promise<Any219> {
 if(!['/static/guides218.json','/static/governance/organization.json'].includes(path)||!await currentGuildActor219(env,a))throw Error('The guide could not be confirmed.');
 const d=destination(env)!;const response=await env.ASSETS.fetch(new Request('https://'+d.host+path));
 if(response.status!==200||!response.body)throw Error('The current guide is unavailable; open the website.');
 const reader=response.body.getReader();let length=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>1024*1024){await reader.cancel();throw Error('The guide is too large.');}text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 if(!await currentGuildActor219(env,a))throw Error('Your account changed; open the website again.');
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The guide data is unavailable.');return value;
}
export async function guideLookup219(env:Env,a:GuildActor219,sub:string,v:Record<string,unknown>):Promise<GuildEmbed219> {
 const base='https://'+destination(env)!.host;
 if(sub==='talent'){
  const build=talentBuildAttachment(v.build,destination(env)!.host);
  if(!build?.code||!build.className||!build.level)throw Error('Paste a valid current Olympus talent code or its exact site share URL. Historical or third-party URLs are not fetched.');
  const ranks=build.code.split('.')[4]!,rows=TALENT_ATTACHMENT_CLASSES[build.className]!,specs=APPLICATION_SPECS_219[build.className]!;
  return {title:'Talent preview · '+build.className,url:base+'/#/talents/'+build.className+'/'+build.code,
   description:'This preview shows the allocation encoded against the 16 October beta talent snapshot. Check the talents on your character in game before using the build.',
   fields:[field('Level / allocated points',build.level+' / '+build.points),...specs.map((spec,index)=>field(spec.label,rows.reduce((n,row,i)=>n+(row[2]===index?Number(ranks[i]):0),0)+' points')),
    field('Blizzard’s 2 November notes',NOVEMBER_TALENT_NOTES219)]};
 }
 const guide=await assetJson219(env,a,'/static/guides218.json');
 if(guide.schema!=='olympus-guides-v1'||!Array.isArray(guide.classes)||!Array.isArray(guide.presets)||!guide.tools)throw Error('The current guide catalogue is unavailable.');
 // Evergreen Stage 2 (4 Nov 2026): true before and after the launch; the pinned data stays a beta snapshot until replaced.
 const evidence='Grades: A pinned client data · B official announcement · C community · D derived · E Classic reference · U unknown. Pinned data comes from the beta; the released game can differ.';
 if(sub==='class'){
  const cls=guide.classes.find((row:Any219)=>row.id===v.class),specQuery=typeof v.spec==='string'?v.spec.trim().toLowerCase():'';
  if(!cls||!Array.isArray(cls.specs))throw Error('Choose one of the nine classes.');
  const spec=specQuery?cls.specs.find((row:Any219)=>row.id===specQuery||row.name?.toLowerCase()===specQuery):null;
  if(specQuery&&!spec)throw Error('Choose a specialization for that class, or omit spec to see the class guide.');
  const presets=guide.presets.filter((row:Any219)=>row.classId===cls.id&&(!spec||row.specId===spec.id)).slice(0,4);
  const presetFields=presets.map((row:Any219)=>({name:safeDiscordText219(row.label,150),value:'[Open level '+row.level+' talent preset]('+base+'/#/talents/'+cls.id+'/'+row.code+')'}));
  if(presetFields.length) presetFields.unshift(field('16 October beta builds','Check these builds against your current in-game talents and Blizzard’s 2 November notes: '+NOVEMBER_TALENT_NOTES219));
  return {title:cls.name+(spec?' · '+spec.name:''),url:base+'/#/guides/class/'+cls.id+(spec?'/'+spec.id:''),description:discordLines219((spec?.beginner?.summary??cls.overview??[]).slice(0,2),'\n\n',1700),fields:presetFields,footer:{text:evidence}};
 }
 if(sub==='attunement'){
  const id=v.raid==='onyxia'?'onyxias-lair':null,raid=id?guide.tools.attunements.find((row:Any219)=>row.id===id):null;
  if(!['onyxia','mc','bwl'].includes(String(v.raid)))throw Error('Choose Onyxia, Molten Core or Blackwing Lair.');
  if(!raid){const change=guide.tools.whatChanged.find((row:Any219)=>row.topic==='Molten Core and Blackwing Lair');return {title:v.raid==='mc'?'Molten Core':'Blackwing Lair',url:base+'/#/guides/tools/attunements',description:safeDiscordText219(change?.text??'No current Forever attunement is confirmed. Classic reference steps must not be presented as a live requirement.',1700),footer:{text:evidence}};}
  return {title:raid.raid+' · attunement',url:base+'/#/guides/tools/attunements',description:discordLines219([raid.opens,raid.requirement.value],'\n',1500),fields:raid.steps.slice(0,8).map((row:Any219)=>field(row.label+' ['+row.grade+']',row.value??row.note??'Unknown')),footer:{text:evidence}};
 }
 if(sub==='consumes'||sub==='buffs'){
  const rows=sub==='buffs'?guide.tools.worldBuffs:guide.tools.consumables;
  const rules=guide.tools.whatChanged.filter((row:Any219)=>sub==='buffs'?['World buffs','Raid auras','Raid-wide buffs'].includes(row.topic):['Consumable rules','New recipes','Alchemy and First Aid'].includes(row.topic));
  return {title:sub==='buffs'?'World buffs & raid-wide buffs':'Raid consumable checklist',url:base+'/#/guides/tools/buffs',description:discordLines219(rules.map((row:Any219)=>row.text),'\n\n',1700),fields:rows.slice(0,8).map((row:Any219)=>field(row.name+' ['+row.grade+']',row.foreverStatus??row.effect)),footer:{text:evidence+' '+rows.length+' catalogue entries; open the guide for the complete checklist.'}};
 }
 throw Error('Choose a guide lookup.');
}
export async function workshopLookup219(env:Env,a:GuildActor219,query:unknown,page=1):Promise<GuildEmbed219> {
 if(!communityFeatures(env).has('crafting'))throw Error('The guild Workshop is switched off.');
 const q=typeof query==='string'?query.normalize('NFC').trim().toLowerCase():'';
 if(q.length>60||/[\u0000-\u001f\u007f]/.test(q))throw Error('Use a recipe, profession or crafter name up to 60 characters.');
 const visible=`p.listed=1 AND ${qualifiesSql('p.discord_id')} AND ${privacySubjectWritableSql('p.discord_id')}`,limit=scanLimit(env);
 const rows=await guildActorBatch219(env,a,[
  env.DB.prepare(`SELECT COUNT(*) n FROM (SELECT 1 FROM community_profiles p WHERE ${visible} LIMIT ?1)`).bind(limit+1),
  env.DB.prepare(`SELECT COALESCE(u.nick,u.global_name,u.username,'Member') crafter,o.recipe_name,o.profession,(SELECT skill FROM community_professions x WHERE x.discord_id=p.discord_id AND x.profession=o.profession) skill
   FROM community_profiles p JOIN site_users u ON u.discord_id=p.discord_id JOIN community_craft_offers o ON o.discord_id=p.discord_id WHERE ${visible}
   AND (?1='' OR instr(o.recipe_key,?1)>0 OR instr(o.profession,?1)>0 OR instr(lower(COALESCE(u.nick,u.global_name,u.username,'')),?1)>0)
   ORDER BY o.recipe_key,p.ref LIMIT 11 OFFSET ?2`).bind(q,(page-1)*10)]);
 if(Number((rows[0]!.results[0] as {n:number}).n)>limit)throw Error('The directory needs an attended view. Use the website Workshop.');
 const offers=rows[1]!.results as Record<string,unknown>[];
 return {title:'Guild Workshop · page '+page,url:'https://'+destination(env)!.host+'/#/community/workshop',description:'Opted-in, currently roster-confirmed members. Recipes and skill are self-reported; a listing is not proof of recipe ownership, delivery or escrow.',fields:offers.slice(0,10).map(row=>field(String(row.recipe_name)+' · '+String(row.profession),String(row.crafter)+(row.skill===null?'':' · claimed skill '+row.skill))),footer:{text:offers.length>10?'More matches: use the next /workshop page.':offers.length?'End of current matches.':'No current listed matches. Unlisted, departed and retiring accounts are excluded.'}};
}
export async function referenceLookup219(env:Env,a:GuildActor219,name:string):Promise<GuildEmbed219> {
 const base='https://'+destination(env)!.host;
 if(name==='launch'){
  // Evergreen Stage 2 (4 Nov 2026): a countdown before the launch; after it the live date and the next milestone, the
  // first raids (date only), until 9 December ends in PST. /olympus Branch capacity & launch shows this same card.
  const {launchAt,firstRaids,raidDayEndAt}=FOREVER_SCHEDULE,at=Math.floor(Date.now()/1000),remaining=Math.max(0,launchAt-at),official=[{name:'Official reference',value:'https://worldofwarcraft.blizzard.com/en-us/forever/'}];
  if(remaining){const days=Math.floor(remaining/86400),hours=Math.floor(remaining%86400/3600),minutes=Math.floor(remaining%3600/60);
   return {title:'World of Warcraft: Forever · November 4',url:base+'/#/',description:'Announced global launch: <t:'+launchAt+':F>\n'+days+' days, '+hours+' hours, '+minutes+' minutes remaining.',fields:official};}
  return {title:'World of Warcraft: Forever · Launch date',url:base+'/#/',description:'The announced launch time <t:'+launchAt+':F> has passed. Check Blizzard for current availability.'+(at<raidDayEndAt?'\nThe first raids are scheduled for '+firstRaids+'. Check Blizzard for the opening time.':''),fields:[{name:'Official reference',value:'https://news.blizzard.com/en-us/article/24315820/world-of-warcraft-forever-now-live'}]};
 }
 if(name==='stockades')return {title:'The Stockades & Court of Appeals',url:base+'/#/governance',description:ROYAL_WRIT_POLICY.stockadesStatus,fields:[
  field('Eligible conditional clemency only',`100g standard. An unconflicted reviewer may set 250–500g for eligible repeat or escalated minor community or RP infractions. Send in-game gold to ${ROYAL_WRIT_POLICY.recipient} only after an officer accepts the case. Include the Case ID in the mail subject. Payment never guarantees an unban.`),
  field('Excluded severe safety offenses','Doxxing, clear Discord Trust & Safety / ToS violations, exploitation, credible threats and severe harassment are not eligible for gold bail. No automated unban or removal of keyed login rejections is performed by this command.')]};
 if(name==='treasury'){
  const out=await guildActorBatch219(env,a,[env.DB.prepare("SELECT value FROM site_settings WHERE key='royalWritsOn'")]);
  const on=(out[0]!.results[0] as {value?:unknown}|undefined)?.value==='1';
  return {title:'Imperial Treasury · Fernmelder',url:base+'/#/governance',description:ROYAL_WRIT_POLICY.banner,fields:[
   field('Royal Writs schedule',on?'The website reference schedule is ON. Every transaction still needs the separately authorized officer process.':'The website Royal Writs schedule is OFF. The existing MEE6 appeal and eligible 100g standard bail remain available through /stockades.'),
   field('Information only','This command does not take gold, make payments, change roles or apply appearance rewards. Ask an Olympus officer about a transaction.')]};
 }
 if(name==='branches'){
  const org=await assetJson219(env,a,'/static/governance/organization.json');
  if(!Array.isArray(org.guildPlaceholders)||org.guildPlaceholders.length!==10)throw Error('The current ten-branch catalogue is unavailable.');
  const rows=await guildActorBatch219(env,a,[env.DB.prepare(`SELECT ${DB_NOW} now`),env.DB.prepare("SELECT key,value,updated_at,updated_by FROM site_settings WHERE key GLOB 'army:census:v2:*' ORDER BY CAST(SUBSTR(key,16) AS INTEGER),key LIMIT 12")]);
  const at=Number((rows[0]!.results[0] as {now:number}).now),snapshots=new Map<string,ArmySnapshot>();let held=false;
  for(const raw of rows[1]!.results){const row=raw as {key:string;value:string;updated_at:number;updated_by:string|null},snapshot=parsedArmySnapshot219(row,at);if(!snapshot||armyKey(snapshot)!==row.key||snapshots.has(snapshot.guilds[0].name)){held=true;break;}snapshots.set(snapshot.guilds[0].name,snapshot);}
  const aliases=branchArmySnapshots229([...snapshots.values()]);
  const empty=!held&&snapshots.size===0;
  const scope='These are reports from members’ game clients, not proof of current free guild slots or an invitation. Automatic branch updates are off. October Beta counts are historical only.';
  const description=empty?'No published capacity snapshot for OLYMPUS PRIME / Olympus II–X yet. Live capacity is unknown. '+scope:scope;
  return {title:'OLYMPUS PRIME / Olympus II–X · branch status',url:base+'/#/army',description,fields:empty?[]:org.guildPlaceholders.map((branch:Any219)=>{
   const name=canonicalOlympusGuildName(branch.name),ambiguous=!!name&&aliases.ambiguous.has(name),snapshot=held||!name?null:aliases.byGuild.get(name),row=snapshot?.guilds[0],age=row?Math.max(0,at-row.receivedAt):null;
   return field(name??branch.name,branch.state+'. '+(!row?'Live capacity unknown; '+(held?'the saved report needs review.':ambiguous?'conflicting guild reports need review.':'no accepted report is available.'):'Report from a member’s game client for '+row.name+': '+(row.reportedCharacters==='few'?'fewer than 5':row.reportedCharacters)+' reported characters; received '+new Date(row.receivedAt*1000).toISOString()+'. '+(age!>86400?'Out of date; live capacity unknown.':'This report may be out of date and does not confirm free guild slots.')));
  }),footer:{text:'No automatic invitation, transfer, ranking or Link action. Officer review uses current evidence; small populations retain the Army suppression rules.'}};
 }
 if(name==='council'){
  const org=await assetJson219(env,a,'/static/governance/organization.json'),seats=org.councilComposition?.currentSeats;
  if(!Array.isArray(seats)||seats.length!==14||!Array.isArray(org.nativeRanks))throw Error('The current Council guide is unavailable.');
  const labels=seats.filter((row:Any219)=>row.id!=='gm-chair').map((row:Any219,index:number)=>index===0?row.label:index+'. '+row.label);
  const ladder=NATIVE_RANKS_199.map(rank=>`${rank.nativeRankOrdinal} ${rank.nativeSlot===0?'Leader (Guild Master)':rank.name}`).join(' · ');
  return {title:'The ten ranks & current High Council',url:base+'/#/organization',description:'The Guild Master chairs the High Council. The in-game name for slot 0 is Guild Master. The Co-Guild Master serves alongside twelve numbered portfolios. Council portfolios, Officer Corps remits and native rank standing remain separate; this guide appoints nobody.',fields:[field('Exact in-game ladder',ladder),{name:'Current Council portfolios',value:discordLines219(labels,'\n',1000)||'Unavailable'},field('Reserved authority','Leadership seats are reserved appointments, not public application tracks. A title, roster entry or payment creates no Discord, bank, cryptographic or addon authority.')]};
 }
 throw Error('Unknown guild reference.');
}
