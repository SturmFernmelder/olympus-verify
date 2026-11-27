import type { Env } from './env';
import { refusal, type CommunityContext } from './community-context';
import { apiJson, PAGE_VERSION, readJson, sameOrigin } from './site-core';
import { RAID_TEAM_ID316, writeRaidTeam316 } from './raid-teams316';
import { writeRaidTeamCalendar316 } from './raid-team-calendar316';

const BASE='/api/community/raid-teams';
const invalid=()=>apiJson({error:'invalid_target',message:'Open the current raid team or calendar and try again.'},400);

/** The website posts to BASE. A former named POST URL may select its own team only. */
export async function handleRaidTeamWrite316(request:Request,env:Env,ctx:CommunityContext,path:string):Promise<Response> {
  if(!ctx.features.has('events'))return apiJson({error:'feature_off'},404);
  if(!ctx.subject||!ctx.capabilities.confirmedGuildData)return refusal(env,request,'confirmedGuildData');
  if(path===BASE+'/my-next-raid')return apiJson({error:'method_not_allowed'},405,{Allow:'GET'});
  if(!sameOrigin(request)||request.headers.get('X-Olympus')!==PAGE_VERSION)return apiJson({error:'reload_page'},403);
  const named=path===BASE?null:/^\/api\/community\/raid-teams\/([^/]+)(\/calendar)?$/.exec(path);
  if(path!==BASE && (!named || !RAID_TEAM_ID316.test(named[1]!)))return apiJson({error:'not_found'},404);
  if(new URL(request.url).search)return invalid();
  const body=await readJson(request);
  if(!body || ['path','url','route','method','target'].some(key=>Object.hasOwn(body,key)))return invalid();
  const namedTeam=named?.[1], namedArea=named ? (named[2]?'calendar':'team') : undefined;
  const area=Object.hasOwn(body,'area')?body.area:(namedArea??'team');
  const team=Object.hasOwn(body,'teamId')?body.teamId:namedTeam;
  if((area!=='team'&&area!=='calendar') || (team!==undefined && (typeof team!=='string'||!RAID_TEAM_ID316.test(team))))return invalid();
  if((namedTeam && team!==namedTeam) || (namedArea && area!==namedArea))return invalid();
  // Only founding a new charter takes a separate client-generated id. A target
  // is always an original team UUID, never an event id, API URL or route name.
  if(Object.hasOwn(body,'id') && !(area==='team' && team===undefined && body.action==='create'))return invalid();
  if(area==='calendar')return team ? writeRaidTeamCalendar316(env,ctx,team,body) : invalid();
  if(team && (body.action==='create'||body.action==='profile'))return invalid();
  return writeRaidTeam316(request,env,ctx,team??null,body);
}
