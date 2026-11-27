import type {Env} from './env';
import {DiscordError, rest} from './discord';
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
type Tag={id?:string;name:string;moderated:boolean;emoji_id:string|null;emoji_name:string|null};
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
export function recruitmentTags316(ch:Channel) {
  const before=snapshot(ch),missing:string[]=[];
  for(const {tag} of RAID_FORUM_TEMPLATES){
    const matches=before.filter(t=>t.name.toLowerCase()===tag.toLowerCase());
    if(matches.length>1||matches[0]?.moderated) throw Error('Ambiguous or moderator-only recruitment tag.');
    if(!matches.length)missing.push(tag);
  }
  if(before.length+missing.length>20)throw Error('The forum is at its tag limit. Existing tags were preserved.');
  return {before,missing};
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
export async function publishRaidForum316(env:Env,guild:string,actor:string):Promise<string> {
  if(guild!==GUILD||env.GUILD_ID!==GUILD||env.INTROS_GUILD_ID!==GUILD||!(env.SITE_ADMINS??'').split(',').map(v=>v.trim()).includes(actor))throw Error('A configured site administrator is required.');
  const bot=env.DISCORD_APP_ID;
  if(!snow(bot))throw Error('The bot identity is unavailable.');
  // Direct POSTs are attempted once. An uncertain reply leaves a durable pending row.
  const api=<T>(method:string,path:string,body?:unknown)=>rest<T>(env,method,path,body,1,method==='GET'?undefined:'Olympus raid recruitment templates');
  const channel=()=>api<Channel>('GET','/channels/'+FORUM);
  const {before,missing}=recruitmentTags316(await channel());
  if(missing.length){
    if(JSON.stringify(snapshot(await channel()))!==JSON.stringify(before))throw Error('Forum tags changed. Refresh to review again.');
    await api('PATCH','/channels/'+FORUM,{available_tags:[...before,...missing.map(name=>({name,moderated:false}))]});
  }
  const after=snapshot(await channel());
  if(before.some((t,i)=>JSON.stringify(after[i])!==JSON.stringify(t))||after.length!==before.length+missing.length)throw Error('Forum tag readback differs. Inspect the forum before retrying.');
  const links:string[]=[];
  for(const spec of RAID_FORUM_TEMPLATES){
    const tag=after.find(t=>t.name.toLowerCase()===spec.tag.toLowerCase()&&!t.moderated);
    if(!tag?.id)throw Error('Missing recruitment tag on readback.');
    const db=env.DB, at=now();
    const claimed=await db.prepare(`INSERT INTO intro_posts(guild_id,intro_key,parent_id,channel_id,message_id,hash,posted_at,updated_at)
      VALUES(?1,?2,?3,?3,'','pending',?4,?4) ON CONFLICT(guild_id,intro_key) DO NOTHING`).bind(guild,spec.key,FORUM,at).run();
    const saved=await db.prepare('SELECT parent_id,message_id,hash FROM intro_posts WHERE guild_id=?1 AND intro_key=?2').bind(guild,spec.key).first<{parent_id:string;message_id:string;hash:string}>();
    if(!saved||saved.parent_id!==FORUM)throw Error('Recruitment template reference changed.');
    let thread:Thread;
    if(snow(saved.message_id)){
      thread=await api<Thread>('GET','/channels/'+saved.message_id);
    }else if(claimed.meta.changes===1&&saved.hash==='pending'){
      try {
        thread=await api<Thread>('POST','/channels/'+FORUM+'/threads',{name:spec.title,applied_tags:[tag.id],message:{content:spec.content,allowed_mentions:{parse:[]}}});
      }catch(e){
        if(definitelyRefused(e))await db.prepare("DELETE FROM intro_posts WHERE guild_id=?1 AND intro_key=?2 AND hash='pending' AND message_id=''").bind(guild,spec.key).run();
        throw e;
      }
    }else{
      const active=await api<{threads:Thread[]}>('GET','/guilds/'+GUILD+'/threads/active');
      const archived=await api<{threads:Thread[]}>('GET','/channels/'+FORUM+'/threads/archived/public?limit=100');
      const matching=[...active.threads,...archived.threads].filter(t=>t.parent_id===FORUM&&t.owner_id===bot&&t.name===spec.title);
      if(matching.length!==1)throw Error('The earlier post has no unique Discord readback. No duplicate was sent.');
      thread=matching[0]!;
    }
    assertThread(thread,bot,spec.title);
    if(!thread.applied_tags?.includes(tag.id))throw Error('The original post has different tags.');
    const first=await api<{id:string;author:{id:string};content:string}>('GET','/channels/'+thread.id+'/messages/'+thread.id);
    if(first.id!==thread.id||first.author?.id!==bot||first.content!==spec.content)throw Error('The template starter message differs on readback.');
    if(!saved.message_id)await db.prepare(`UPDATE intro_posts SET channel_id=?1,message_id=?1,hash='raid-template-v1',updated_at=?2
      WHERE guild_id=?3 AND intro_key=?4 AND parent_id=?5 AND message_id='' AND hash='pending'`).bind(thread.id,at,guild,spec.key,FORUM).run();
    links.push('<#'+thread.id+'>');
  }
  return links.join(' · ');
}
