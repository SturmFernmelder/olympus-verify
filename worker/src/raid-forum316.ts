import type {Env} from './env';
import {DiscordError, explainDiscordError} from './discord';
import {now} from './db';

const GUILD='236932545793490944', FORUM='1554265340286861352';
const site='https://olympus.roachcouncil.com/#/community/raid-teams';
export const RAID_FORUM_TEMPLATES = [
  {key:'raid-team-template',tag:'Team recruiting',title:'Template · Recruit for your raid team',
   content:[
     '**Starting or recruiting for a standing team?** Create a post with the **Team recruiting** tag. Lead with the days, time zone and open roles so members can see whether the team suits them.',
     '**Team and raid leader**\n**Raid days, start/end time and time zone**\n**Open roles, classes/specs, raid size, starter or reserve places**\n**Team style and experience, gear or preparation expected**\n**Attendance, bench rotation and trial policy**\n**Loot system, hard reserves, trial/reserve eligibility**\n**Consumables, funding and how raid materials are shared**\n**How to apply / team charter link**',
     'Publish rules before someone accepts a place. Keep this post current as places fill. Use #raid-signups for individual raid nights.',
     'Find or charter a team: '+site,
   ].join('\n\n')},
  {key:'raid-player-template',tag:'Looking for team',title:'Template · Find a raid team for your character',
   content:[
     '**Looking for a standing team or a substitute spot?** Create a post using **Looking for team**, or list yourself in the member website’s raider directory.',
     '**Verified character and class**\n**Main and off-spec, preferred and alternate roles**\n**Available days, start/end times and time zone**\n**Preferred size and team style**\n**Starter, substitute or leadership interest**\n**Raid or raid-leading experience**\n**Optional logs or other notes**',
     'Share only what you want guild members to see. Update or close your listing when you find a team. A team leader can offer you a place and you choose whether to accept it.',
     'Manage your listing: '+site+'/profile',
   ].join('\n\n')},
] as const;
type Tag={id:string;name:string;moderated:boolean;emoji_id:string|null;emoji_name:string|null};
type Channel={id:string;guild_id:string;type:number;available_tags:Tag[]};
type Thread={id:string;name:string;guild_id?:string;parent_id:string;owner_id:string;applied_tags?:string[]};
const snow=(s:unknown):s is string=>typeof s==='string'&&/^\d{17,20}$/.test(s);
function snapshot(ch:Channel):Tag[]{
  if(ch.id!==FORUM||ch.guild_id!==GUILD||ch.type!==15||!Array.isArray(ch.available_tags)||ch.available_tags.length>20) throw Error('The configured recruitment forum could not be verified.');
  const known=new Set<string>();
  return ch.available_tags.map(t=>{
    if(!snow(t.id)||known.has(t.id)||typeof t.name!=='string'||typeof t.moderated!=='boolean'||!(t.emoji_id===null||snow(t.emoji_id))||!(t.emoji_name===null||typeof t.emoji_name==='string'))throw Error('Unexpected forum tag format.');
    known.add(t.id);return {id:t.id,name:t.name,moderated:t.moderated,emoji_id:t.emoji_id,emoji_name:t.emoji_name};
  });
}
type ForumApi=<T>(method:'GET'|'POST',path:string,body?:unknown)=>Promise<T>;
// Initial and final forum readback plus, per template, one fresh tag read,
// two queries to recover an uncertain post, and one starter-message read.
export const RAID_FORUM_MAX_CALLS316=2+4*RAID_FORUM_TEMPLATES.length;
function requiredTag(tags:Tag[],name:string) {
  const matches=tags.filter(t=>t.name.toLowerCase()===name.toLowerCase());
  if(matches.length>1||matches[0]?.moderated)throw Error('The '+name+' forum tag must be unique and available to members.');
  if(!matches.length)throw Error('In #looking-for-group, open Edit Channel → Tags. Add the missing “Team recruiting” or “Looking for team” tags without moderator restrictions, then refresh this forum again.');
  return matches[0]!;
}
function assertThread(t:Thread,bot:string,title:string) {
  if(!snow(t.id)||t.parent_id!==FORUM||t.owner_id!==bot||t.name!==title)throw Error('The original Olympus template could not be confirmed.');
}
function definitelyRefused(error:unknown):boolean {
  if (!(error instanceof DiscordError)) return false;
  try {
    const body=JSON.parse(error.body);
    if (error.status===429) return typeof body?.retry_after==='number' && body.retry_after>=0 && typeof body.message==='string';
    return [400,401,403,404].includes(error.status) && Number.isInteger(body?.code) && typeof body.message==='string';
  } catch { return false; }
}
async function publishTemplate(env:Env,guild:string,bot:string,spec:typeof RAID_FORUM_TEMPLATES[number],tag:Tag,api:ForumApi) {
  const db=env.DB, at=now();
  const claimed=await db.prepare(`INSERT INTO intro_posts(guild_id,intro_key,parent_id,channel_id,message_id,hash,posted_at,updated_at)
    VALUES(?1,?2,?3,?3,'','pending',?4,?4) ON CONFLICT(guild_id,intro_key) DO NOTHING`).bind(guild,spec.key,FORUM,at).run();
  const saved=await db.prepare('SELECT parent_id,message_id,hash FROM intro_posts WHERE guild_id=?1 AND intro_key=?2').bind(guild,spec.key).first<{parent_id:string;message_id:string;hash:string}>();
  if(!saved||saved.parent_id!==FORUM)throw Error('Recruitment template reference changed.');
  let thread:Thread;
  let action: "current"|"posted"|"recovered"="current";
  if(snow(saved.message_id)){
    thread=await api<Thread>('GET','/channels/'+saved.message_id);
  }else if(claimed.meta.changes===1&&saved.hash==='pending'){
    try {
      thread=await api<Thread>('POST','/channels/'+FORUM+'/threads',{name:spec.title,applied_tags:[tag.id],message:{content:spec.content,allowed_mentions:{parse:[]}}});
    }catch(e){
      if(definitelyRefused(e))await db.prepare("DELETE FROM intro_posts WHERE guild_id=?1 AND intro_key=?2 AND hash='pending' AND message_id=''").bind(guild,spec.key).run();
      throw e;
    }
    action="posted";
  }else{
    const active=await api<{threads:Thread[]}>('GET','/guilds/'+GUILD+'/threads/active');
    const archived=await api<{threads:Thread[]}>('GET','/channels/'+FORUM+'/threads/archived/public?limit=100');
    const matching=[...active.threads,...archived.threads].filter(t=>t.parent_id===FORUM&&t.owner_id===bot&&t.name===spec.title);
    if(matching.length!==1)throw Error('The earlier post has no unique Discord readback. No duplicate was sent.');
    thread=matching[0]!;
    action="recovered";
  }
  assertThread(thread,bot,spec.title);
  if(!thread.applied_tags?.includes(tag.id))throw Error('The original post has different tags.');
  const first=await api<{id:string;author:{id:string};content:string}>('GET','/channels/'+thread.id+'/messages/'+thread.id);
  if(first.id!==thread.id||first.author?.id!==bot||first.content!==spec.content)throw Error('The template starter message differs on readback.');
  if(!saved.message_id)await db.prepare(`UPDATE intro_posts SET channel_id=?1,message_id=?1,hash='raid-template-v1',updated_at=?2
    WHERE guild_id=?3 AND intro_key=?4 AND parent_id=?5 AND message_id='' AND hash='pending'`).bind(thread.id,at,guild,spec.key,FORUM).run();
  return {id:thread.id,action};
}

export async function publishRaidForum316(env:Env,guild:string,actor:string,api:ForumApi) {
  if(guild!==GUILD||env.GUILD_ID!==GUILD||env.INTROS_GUILD_ID!==GUILD||!(env.SITE_ADMINS??'').split(',').map(v=>v.trim()).includes(actor))throw Error('A configured site administrator is required.');
  const bot=env.DISCORD_APP_ID;
  if(!snow(bot))throw Error('The bot identity is unavailable.');
  // Discord's channel PATCH replaces all tags, with no conditional or per-tag update.
  // A moderator provisions them in Discord. The publisher only reads this list.
  const readTags=async()=>snapshot(await api<Channel>('GET','/channels/'+FORUM));
  const before=await readTags();
  const selected=RAID_FORUM_TEMPLATES.map(spec=>requiredTag(before,spec.tag));
  const stable=async()=>{
    if(JSON.stringify(await readTags())!==JSON.stringify(before))throw Error('The forum tags changed during this refresh. Check the current tags and refresh again.');
  };
  const links:string[]=[],problems:string[]=[];
  let posted=0,recovered=0;
  for(const [index,spec] of RAID_FORUM_TEMPLATES.entries()){
    try { await stable(); } catch(err) { problems.push(explainDiscordError(err)); break; }
    try {
      const result=await publishTemplate(env,guild,bot,spec,selected[index]!,api);
      if(result.action==='posted')posted++;
      if(result.action==='recovered')recovered++;
      links.push('<#'+result.id+'>');
    } catch(err) {
      problems.push(spec.tag+' — '+explainDiscordError(err));
    }
  }
  if(links.length)try { await stable(); } catch(err) { problems.push(explainDiscordError(err)); }
  return {links:links.join(' · '),posted,recovered,problems};
}
