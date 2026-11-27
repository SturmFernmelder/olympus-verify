/** Standing raid teams. A seat decision here never grants a guild rank or changes an event RSVP. */
import type { Env } from './env';
import { admitted, admittedRead, DB_NOW, FENCE_REFUSED, fenceSql, randomToken, refusal, type CommunityContext } from './community-context';
import { weeklyWindows316, canonicalZone316, validClock316, clock316, localStartRanges316, overlapDetector316, type WeeklyWindow316 } from './raid-team-times316';
import { apiJson, readJson } from './site-core';
import { privacySubjectWritableSql } from './privacy-serving-authority';

const BASE = '/api/community/raid-teams';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ROLE = ['tank','healer','melee','ranged','flex'];
const STATUS = ['forming','recruiting','full','reserves','inactive'];
const OPEN = "('submitted','waitlisted','offered_primary','offered_reserve')";
const ACTIVE = "('primary','reserve')";
const PAGE = 25;

class FieldError extends Error {}
function field(value: unknown, label: string, max: number, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new FieldError('Enter a valid ' + label + '.');
  const text = value.trim().normalize('NFC');
  if ((required && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    throw new FieldError('Enter ' + label + ' using up to ' + max + ' characters.');
  return text;
}
function choice(value: unknown, options: readonly string[], label: string): string {
  if (typeof value !== 'string' || !options.includes(value)) throw new FieldError('Choose a valid ' + label + '.');
  return value;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new FieldError('Choose a valid ' + label + '.');
  return value;
}
function toggle(value: unknown): number {
  if (typeof value !== 'boolean') throw new FieldError('Choose an explicit yes or no.');
  return Number(value);
}
function characterGuid(value: unknown): string {
  if (typeof value !== 'string' || !/^Player-\d{1,10}-[a-fA-F0-9]{1,16}$/.test(value)) throw new FieldError('Choose one of your verified characters.');
  return value;
}
function zone(v:unknown):string {
  try { return canonicalZone316(field(v,'time zone',64,true)); } catch { throw new FieldError('Choose an IANA time zone, such as America/Chicago.'); }
}
function charter(b: Record<string,unknown>) {
  const timezone=zone(b.timezone);
  let windows:WeeklyWindow316[];
  try { windows=weeklyWindows316(b.weeklyWindows); } catch { throw new FieldError('Add up to seven distinct weekly windows, each with a day and two different times.'); }
  const needs=b.roleNeeds??[];
  if (!Array.isArray(needs) || needs.length>ROLE.length || new Set(needs).size!==needs.length || needs.some(v=>!ROLE.includes(v))) throw new FieldError('Select distinct recruiting roles.');
  return [field(b.name,'team name',64,true),field(b.philosophy,'raid style',80),field(b.schedule,'raid schedule',240,true),timezone,
    field(b.loot,'loot rules',1000,true),field(b.expectations,'expectations',1000),field(b.needs,'recruiting needs',160),
    choice(b.status,STATUS,'recruitment status'),integer(b.capacity,1,100,'roster capacity'),JSON.stringify(windows),JSON.stringify(needs)];
}

// Expressions passed to these builders come exclusively from Worker source.
function proven(id: string, guid: string): string {
  return `EXISTS(SELECT 1 FROM characters k WHERE k.discord_id=${id} AND k.guid=${guid} AND k.status='member'
    AND NOT EXISTS(SELECT 1 FROM characters duplicate WHERE duplicate.guid=k.guid AND duplicate.name_key<>k.name_key))`;
}
function current(id: string, birth: string, guid: string): string {
  return `(EXISTS(SELECT 1 FROM site_users owner WHERE owner.discord_id=${id} AND owner.account_incarnation=${birth}
      AND owner.in_server=1 AND owner.denied=0)
    AND ${privacySubjectWritableSql(id)}
    AND NOT EXISTS(SELECT 1 FROM privacy_serving_jobs job WHERE job.subject_id=${id} AND job.state<>'complete' AND job.state IN ('held','erasing','waiting_role'))
    AND NOT EXISTS(SELECT 1 FROM members banned WHERE banned.discord_id=${id} AND banned.banned=1)
    AND ${proven(id,guid)})`;
}
function seatCurrent(alias: string): string { return current(alias+'.discord_id',alias+'.account_birth',alias+'.character_guid'); }
function authority(team: string, actor: string, manager: boolean): string {
  const scope = manager ? `AND (access316.is_officer=1 OR EXISTS(SELECT 1 FROM raid_teams316 lead
    WHERE lead.id=access316.team_id AND lead.leader_id=access316.discord_id AND lead.leader_birth=access316.account_birth))` : '';
  return `EXISTS(SELECT 1 FROM raid_team_seats316 access316 WHERE access316.team_id=${team} AND access316.discord_id=${actor}
    AND access316.state IN ${ACTIVE} ${scope} AND ${seatCurrent('access316')})`;
}
export function raidTeamManagerSql316(teamIdExpr: string, actorIdExpr: string): string { return authority(teamIdExpr,actorIdExpr,true); }
export function raidTeamMemberSql316(teamIdExpr: string, actorIdExpr: string): string { return authority(teamIdExpr,actorIdExpr,false); }
function isLeader(team: string, actor: string): string {
  return `EXISTS(SELECT 1 FROM raid_teams316 ownerTeam WHERE ownerTeam.id=${team} AND ownerTeam.leader_id=${actor}
    AND ${current('ownerTeam.leader_id','ownerTeam.leader_birth','ownerTeam.leader_guid')})`;
}
function seatCount(team: string, state: 'primary'|'reserve'): string {
  return `(SELECT count(*) FROM raid_team_seats316 filled WHERE filled.team_id=${team} AND filled.state='${state}' AND ${seatCurrent('filled')})`;
}
const teamProjection = () => `t.id,t.name,t.philosophy,t.schedule,t.timezone,t.loot,t.expectations,t.needs,t.status,t.capacity,t.revision,t.weekly_windows AS weeklyWindows,t.role_needs AS roleNeeds,
  (SELECT k.name FROM characters k WHERE k.guid=t.leader_guid AND k.discord_id=t.leader_id AND ${current('t.leader_id','t.leader_birth','t.leader_guid')}) AS leader,
  ${seatCount('t.id','primary')} AS primaryCount, ${seatCount('t.id','reserve')} AS reserveCount`;
const seatProjection = `s.id,k.name AS character,s.role,s.state,s.is_officer AS isOfficer,s.group_number AS groupNumber,s.revision,s.charter_revision AS charterRevision`;
const profileProjection = `k.name AS character,p.role,p.class_name AS playerClass,p.spec,p.availability,p.notes`;
function teamDto(r:Record<string,unknown>) {
  return {...r,weeklyWindows:JSON.parse(String(r.weeklyWindows)),roleNeeds:JSON.parse(String(r.roleNeeds))};
}
function page(value: string|null): number {
  if (value===null) return 1;
  if (!/^[1-9][0-9]{0,3}$/.test(value)) throw new FieldError('Choose an available page.');
  return Number(value);
}
function ownCharacters(env:Env, me:string) {
  return env.DB.prepare(`SELECT c.guid,c.name FROM characters c WHERE c.discord_id=?1 AND c.status='member' AND c.guid IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM characters d WHERE d.guid=c.guid AND d.name_key<>c.name_key) ORDER BY c.name COLLATE NOCASE`).bind(me);
}
async function listing(request: Request, env: Env, ctx: CommunityContext) {
  const me=ctx.subject!.discordId, q=new URL(request.url).searchParams, teamPage=page(q.get('teamPage')), playerPage=page(q.get('playerPage'));
  const query=field(q.get('q'),'search',100).toLowerCase(), zoneFilter=field(q.get('timezone'),'time zone',64);
  const playerClass=field(q.get('class'),'class',40),spec=field(q.get('spec'),'specialization',80).toLowerCase();
  const status=q.get('status') || '', role=q.get('role') || '';
  if (status) choice(status,STATUS,'team status');
  if (role) choice(role,ROLE,'role');
  const teamRole=q.get('teamRole')||'',style=field(q.get('style'),'raid style',80).toLowerCase();
  if(teamRole)choice(teamRole,ROLE,'recruitment role');
  const hasDay=q.has('day')&&q.get('day')!=='',from=q.get('from')||'00:00',to=q.get('to')||'23:59';
  const day=hasDay?integer(Number(q.get('day')),1,7,'local raid day'):null;
  if(!validClock316(from)||!validClock316(to))throw new FieldError('Choose valid local search times.');
  const wantsTimes=hasDay||!!q.get('from')||!!q.get('to');
  let localRanges='';
  if(wantsTimes){
    const viewerZone=zone(q.get('viewerZone')||'UTC');
    const dates=await admittedRead(env,ctx,'confirmedGuildData',[env.DB.prepare("SELECT DISTINCT timezone FROM raid_teams316 WHERE weekly_windows<>'[]'")]);
    if(dates===FENCE_REFUSED)return refusal(env,request,'confirmedGuildData');
    const zones=dates[0]!.results.map(row=>String((row as {timezone:string}).timezone));
    localRanges=JSON.stringify(localStartRanges316(Math.floor(Date.now()/1000),viewerZone,day,clock316(from),clock316(to),zones));
  }
  const weekMinute="((json_extract(w.value,'$.day')-1)*1440+CAST(substr(json_extract(w.value,'$.start'),1,2) AS INTEGER)*60+CAST(substr(json_extract(w.value,'$.start'),4,2) AS INTEGER))";
  const result=await admittedRead(env,ctx,'confirmedGuildData',[
    env.DB.prepare(`SELECT ${teamProjection()} FROM raid_teams316 t
      WHERE (?1='' OR instr(lower(t.name||' '||t.needs||' '||t.philosophy||' '||t.schedule),?1)>0)
      AND (?2='' OR t.status=?2) AND (?3='' OR t.timezone=?3 COLLATE NOCASE)
      AND (?5='' OR EXISTS(SELECT 1 FROM json_each(t.role_needs) n WHERE n.value=?5))
      AND (?6='' OR instr(lower(t.philosophy),?6)>0)
      AND (?7='' OR EXISTS(SELECT 1 FROM json_each(t.weekly_windows) w JOIN json_each(?7,'$."'||t.timezone||'"') span
        WHERE ${weekMinute}>=json_extract(span.value,'$[0]') AND ${weekMinute}<json_extract(span.value,'$[1]')))
      ORDER BY t.name COLLATE NOCASE,t.id LIMIT 26 OFFSET ?4`).bind(query,status,zoneFilter,(teamPage-1)*PAGE,teamRole,style,localRanges),
    env.DB.prepare(`SELECT ${profileProjection} FROM raid_raider_profiles316 p JOIN characters k ON k.discord_id=p.discord_id AND k.guid=p.character_guid
      WHERE p.listed=1 AND ${current('p.discord_id','p.account_birth','p.character_guid')} AND (?1='' OR p.role=?1)
      AND (?2='' OR instr(lower(k.name||' '||p.spec||' '||p.availability),?2)>0)
      AND (?3='' OR p.class_name=?3 COLLATE NOCASE) AND (?4='' OR instr(lower(p.spec),?4)>0)
      ORDER BY k.name COLLATE NOCASE,p.discord_id LIMIT 26 OFFSET ?5`).bind(role,query,playerClass,spec,(playerPage-1)*PAGE),
    ownCharacters(env,me),
    env.DB.prepare(`SELECT ${profileProjection},p.character_guid AS guid,p.listed,p.revision FROM raid_raider_profiles316 p
      LEFT JOIN characters k ON k.guid=p.character_guid AND k.discord_id=p.discord_id AND k.status='member'
      WHERE p.discord_id=?1 AND p.account_birth=?2 LIMIT 1`).bind(me,ctx.subject!.accountIncarnation),
    env.DB.prepare(`SELECT t.id AS teamId,t.name,s.id,s.state,s.revision FROM raid_team_seats316 s JOIN raid_teams316 t ON t.id=s.team_id
      WHERE s.discord_id=?1 AND s.account_birth=?2 ORDER BY s.updated_at DESC,s.id LIMIT 100`).bind(me,ctx.subject!.accountIncarnation),
  ]);
  if (result===FENCE_REFUSED) return refusal(env,request,'confirmedGuildData');
  return apiJson({teams:(result[0]!.results.slice(0,PAGE) as Record<string,unknown>[]).map(teamDto),players:result[1]!.results.slice(0,PAGE),characters:result[2]!.results,
    profile:result[3]!.results[0]??null,myTeams:result[4]!.results,nextTeams:result[0]!.results.length>PAGE?teamPage+1:null,nextPlayers:result[1]!.results.length>PAGE?playerPage+1:null});
}
async function detail(request: Request, env: Env, ctx: CommunityContext, id: string) {
  const me=ctx.subject!.discordId;
  const from=`FROM raid_team_seats316 s JOIN characters k ON k.guid=s.character_guid AND k.discord_id=s.discord_id
    WHERE s.team_id=?1 AND ${seatCurrent('s')}`;
  const result=await admittedRead(env,ctx,'confirmedGuildData',[
    env.DB.prepare(`SELECT ${teamProjection()},${raidTeamManagerSql316('t.id','?2')} AS canManage,${isLeader('t.id','?2')} AS isLeader,${raidTeamMemberSql316('t.id','?2')} AS canViewRoster
      FROM raid_teams316 t WHERE t.id=?1`).bind(id,me),
    env.DB.prepare(`SELECT ${seatProjection} ${from} AND s.state IN ${ACTIVE} AND ${raidTeamMemberSql316('s.team_id','?2')} ORDER BY s.state,s.group_number,k.name COLLATE NOCASE`).bind(id,me),
    env.DB.prepare(`SELECT ${seatProjection},s.note ${from} AND s.state IN ${OPEN} AND ${raidTeamManagerSql316('s.team_id','?2')}
      ORDER BY s.created_at,s.id`).bind(id,me),
    env.DB.prepare(`SELECT s.id,s.state,s.revision,s.note,s.role,s.group_number AS groupNumber,s.is_officer AS isOfficer,s.charter_revision AS charterRevision,
      (SELECT k.name FROM characters k WHERE k.guid=s.character_guid AND k.discord_id=s.discord_id AND k.status='member' LIMIT 1) AS character
      FROM raid_team_seats316 s WHERE s.team_id=?1 AND s.discord_id=?2 AND s.account_birth=?3`).bind(id,me,ctx.subject!.accountIncarnation),
    ownCharacters(env,me),
  ]);
  if (result===FENCE_REFUSED) return refusal(env,request,'confirmedGuildData');
  const team=result[0]!.results[0] as Record<string,unknown>|undefined;
  if (!team) return apiJson({error:'not_found',message:'This raid team could not be found.'},404);
  const {canManage,isLeader:leader,canViewRoster,...summary}=team;
  return apiJson({team:teamDto(summary),canManage:!!canManage,isLeader:!!leader,canViewRoster:!!canViewRoster,members:result[1]!.results,applications:result[2]!.results,mine:result[3]!.results[0]??null,characters:result[4]!.results});
}

type SqlValue = string|number|null;
interface WritePlan { first: D1PreparedStatement; after: D1PreparedStatement[]; id?: string }

function writePlan(env:Env, ctx:CommunityContext, teamId:string|null, b:Record<string,unknown>,checkedPrimaries?:string):WritePlan {
  const s=ctx.subject!, args:SqlValue[]=[s.discordId,s.sessionVersion,s.expiresAt];
  const param=(v:SqlValue)=>'?' + args.push(v);
  const guard=fenceSql('confirmedGuildData',1,2,3,s.privacyGeneration,s.accountIncarnation);
  const prepare=(sql:string)=>env.DB.prepare(sql).bind(...args);
  const result=(sql:string,after:D1PreparedStatement[]=[],id?:string):WritePlan=>({first:prepare(sql),after,id});
  const unlist=()=>env.DB.prepare(`UPDATE raid_raider_profiles316 SET listed=0,revision=revision+1,updated_at=${DB_NOW}
    WHERE changes()=1 AND discord_id=?1 AND account_birth=?2 AND listed=1`).bind(s.discordId,s.accountIncarnation);
  const rev=(minimum=1)=>param(integer(b.revision,minimum,2147483646,'current revision'));
  const seatId=()=>param(field(b.seatId,'seat reference',64,true));
  const birth=param(s.accountIncarnation);
  if (!teamId) {
    if (b.action==='profile') {
      const guid=param(characterGuid(b.guid)),role=param(choice(b.role,ROLE,'role')),spec=param(field(b.spec,'specialization',80)),playerClass=param(field(b.playerClass,'class',40)),
        availability=param(field(b.availability,'availability',240)),notes=param(field(b.notes,'profile notes',400)),
        listed=param(toggle(b.listed)), revision=rev(0);
      return result(`INSERT INTO raid_raider_profiles316(discord_id,account_birth,character_guid,role,class_name,spec,availability,notes,listed)
        SELECT ?1,${birth},${guid},${role},${playerClass},${spec},${availability},${notes},${listed}
        WHERE ${guard} AND ${proven('?1',guid)} AND (${revision}=0 OR EXISTS(SELECT 1 FROM raid_raider_profiles316 p WHERE p.discord_id=?1 AND p.account_birth=${birth} AND p.revision=${revision}))
        ON CONFLICT(discord_id) DO UPDATE SET character_guid=excluded.character_guid,role=excluded.role,class_name=excluded.class_name,spec=excluded.spec,
          availability=excluded.availability,notes=excluded.notes,listed=excluded.listed,revision=revision+1,updated_at=${DB_NOW}
        WHERE raid_raider_profiles316.account_birth=excluded.account_birth AND revision=${revision}`);
    }
    if (b.action!=='create') throw new FieldError('Choose a directory action.');
    const id=field(b.id,'team reference',36,true);
    if (!UUID.test(id)) throw new FieldError('Refresh the team creation form.');
    const team=param(id),guid=param(characterGuid(b.guid)),values=charter(b).map(param),role=choice(b.role,ROLE,'role');
    return result(`INSERT INTO raid_teams316(id,leader_id,leader_birth,leader_guid,name,philosophy,schedule,timezone,loot,expectations,needs,status,capacity,weekly_windows,role_needs)
      SELECT ${team},?1,${birth},${guid},${values.join(',')} WHERE ${guard} AND ${proven('?1',guid)}
        AND (SELECT count(*) FROM raid_teams316 owned WHERE owned.leader_id=?1)<10
        AND (SELECT count(*) FROM raid_team_seats316 seated WHERE seated.discord_id=?1)<100 ON CONFLICT DO NOTHING`,[
      env.DB.prepare(`INSERT INTO raid_team_seats316(id,team_id,discord_id,account_birth,character_guid,role,state,charter_revision)
        SELECT ?1,t.id,t.leader_id,t.leader_birth,t.leader_guid,?3,'primary',t.revision FROM raid_teams316 t WHERE changes()=1 AND t.id=?2`)
        .bind(randomToken(),id,role),unlist(),
    ],id);
  }
  const team=param(teamId);
  const canManage=raidTeamManagerSql316(team,'?1');
  const leader=isLeader(team,'?1');
  const teamRev=`(SELECT v.revision FROM raid_teams316 v WHERE v.id=${team})`;
  const seatMatch=(id:string,r:string)=>`s.team_id=${team} AND s.id=${id} AND s.revision=${r}`;
  if (b.action==='edit') {
    const values=charter(b).map(param),revision=rev();
    return result(`UPDATE raid_teams316 AS t SET (name,philosophy,schedule,timezone,loot,expectations,needs,status,capacity,weekly_windows,role_needs)=(${values.join(',')}),
      revision=revision+1,updated_at=${DB_NOW}
      WHERE t.id=${team} AND t.revision=${revision} AND ${guard} AND ${canManage}
      AND EXISTS(SELECT 1 FROM site_users u WHERE u.discord_id=?1 AND u.account_incarnation=${birth})
      AND ${seatCount('t.id','primary')}<=${values[8]} AND NOT EXISTS(SELECT 1 FROM raid_teams316 other WHERE other.name=${values[0]} AND other.id<>t.id)`);
  }
  if (b.action==='apply') {
    const guid=param(characterGuid(b.guid)),role=param(choice(b.role,ROLE,'role')),note=param(field(b.note,'application note',500)),
      revision=rev(0),id=param(randomToken());
    return result(`INSERT INTO raid_team_seats316(id,team_id,discord_id,account_birth,character_guid,role,note,state,charter_revision)
      SELECT ${id},t.id,?1,${birth},${guid},${role},${note},'submitted',t.revision FROM raid_teams316 t WHERE t.id=${team}
      AND t.status IN ('recruiting','forming','reserves') AND ${guard} AND ${proven('?1',guid)}
      AND (${revision}=0 OR EXISTS(SELECT 1 FROM raid_team_seats316 own WHERE own.team_id=t.id AND own.discord_id=?1 AND own.account_birth=${birth} AND own.revision=${revision}))
      AND (EXISTS(SELECT 1 FROM raid_team_seats316 existing WHERE existing.team_id=t.id AND existing.discord_id=?1) OR
           (SELECT count(*) FROM raid_team_seats316 seated WHERE seated.discord_id=?1)<100)
      AND (SELECT count(*) FROM raid_team_seats316 open WHERE open.team_id=t.id AND open.state IN ${OPEN})<200
      ON CONFLICT(team_id,discord_id) DO UPDATE SET character_guid=excluded.character_guid,role=excluded.role,note=excluded.note,
        state='submitted',charter_revision=excluded.charter_revision,revision=revision+1,updated_at=${DB_NOW}
      WHERE account_birth=excluded.account_birth AND state IN ('withdrawn','declined') AND revision=${revision}`);
  }
  const id=seatId(),revision=rev(),match=seatMatch(id,revision);
  const self=`s.discord_id=?1 AND s.account_birth=${birth}`;
  // Binding the actor's birth is part of every mutation, including on a different person's seat.
  const originalActor=`EXISTS(SELECT 1 FROM site_users actor WHERE actor.discord_id=?1 AND actor.account_incarnation=${birth})`;
  const common=`${match} AND ${guard} AND ${originalActor}`;
  const patch=(sets:string,where:string,after:D1PreparedStatement[]=[])=>result(`UPDATE raid_team_seats316 AS s SET ${sets},revision=revision+1,updated_at=${DB_NOW} WHERE ${common} AND ${where}`,after);
  if (b.action==='decide') {
    const state=choice(b.state,['offered_primary','offered_reserve','waitlisted','declined'],'application decision'),next=param(state);
    // A new offer after edits carries the current charter. A reserve-only listing cannot offer a primary seat.
    return patch(`state=${next},charter_revision=${teamRev}`,`s.state IN ${OPEN} AND ${canManage} AND ${seatCurrent('s')}
      AND EXISTS(SELECT 1 FROM raid_teams316 t WHERE t.id=s.team_id AND
      (${next} IN ('declined','waitlisted') OR (t.status<>'inactive' AND (${next}<>'offered_primary' OR t.status<>'reserves'))))`);
  }
  if (b.action==='respond' && b.state!=='withdrawn') {
    const state=choice(b.state,['primary','reserve'],'offered position'),next=param(state);
    // If no overlap was confirmed, compare every still-qualified primary with the snapshot checked in JavaScript.
    // A concurrent acceptance or change to either contributing charter requires reevaluation.
    const sameOthers=state==='primary' && b.confirmOverlap!==true ? ` AND NOT EXISTS(
      SELECT 1 FROM raid_team_seats316 other JOIN raid_teams316 ot ON ot.id=other.team_id WHERE other.discord_id=?1 AND other.account_birth=${birth}
      AND other.team_id<>${team} AND other.state='primary' AND ${seatCurrent('other')}
      AND NOT EXISTS(SELECT 1 FROM json_each(${param(checkedPrimaries??'[]')}) frozen
        WHERE json_extract(frozen.value,'$[0]')=ot.id AND json_extract(frozen.value,'$[1]')=ot.revision))` : '';
    return patch(`state=${next},note=''`,`${self} AND ${seatCurrent('s')} AND s.state='offered_'||${next}
      AND EXISTS(SELECT 1 FROM raid_teams316 t WHERE t.id=${team} AND t.revision=s.charter_revision AND t.status<>'inactive'
        AND (${next}<>'primary' OR (t.status<>'reserves' AND ${seatCount('t.id','primary')}<t.capacity))
        AND (${next}<>'reserve' OR ${seatCount('t.id','reserve')}<100))
      ${sameOthers}`,state==='primary'?[unlist()]:[]);
  }
  if (b.action==='leave' || (b.action==='respond' && b.state==='withdrawn')) {
    const prior=b.action==='leave'?ACTIVE:OPEN;
    return patch("state='withdrawn',note='',group_number=NULL,is_officer=0",`${self} AND s.state IN ${prior} AND NOT ${leader}`);
  }
  if (b.action==='forget') {
    return result(`DELETE FROM raid_team_seats316 AS s WHERE ${common} AND ${self} AND s.state IN ('withdrawn','declined')`);
  }
  if (b.action==='officer') {
    const enabled=param(toggle(b.enabled));
    return patch(`is_officer=${enabled}`,`${leader} AND s.discord_id<>?1 AND s.state IN ${ACTIVE} AND ${seatCurrent('s')}`);
  }
  if (b.action==='group') {
    const group=param(b.groupNumber===null?null:integer(b.groupNumber,1,8,'five-player group'));
    return patch(`group_number=${group}`,`${canManage} AND s.state='primary' AND ${seatCurrent('s')}
      AND (${group} IS NULL OR (SELECT count(*) FROM raid_team_seats316 g WHERE g.team_id=s.team_id AND g.id<>s.id
        AND g.group_number=${group} AND g.state='primary' AND ${seatCurrent('g')})<5)`);
  }
  if (b.action==='remove') {
    return patch("state='withdrawn',note='',group_number=NULL,is_officer=0",`${canManage} AND s.state IN ${ACTIVE} AND s.discord_id<>?1
      AND NOT EXISTS(SELECT 1 FROM raid_teams316 t WHERE t.id=s.team_id AND t.leader_id=s.discord_id)
      AND (s.is_officer=0 OR ${leader})`);
  }
  if (b.action==='transfer') {
    const dest=`SELECT s.discord_id,s.account_birth,s.character_guid FROM raid_team_seats316 s
      WHERE ${match} AND s.state IN ${ACTIVE} AND s.discord_id<>?1 AND ${seatCurrent('s')}
      AND (SELECT count(*) FROM raid_teams316 owned WHERE owned.leader_id=s.discord_id)<10`;
    return result(`UPDATE raid_teams316 SET (leader_id,leader_birth,leader_guid)=(${dest}),revision=revision+1,updated_at=${DB_NOW}
      WHERE id=${team} AND ${guard} AND ${originalActor} AND ${leader} AND EXISTS(${dest})`);
  }
  throw new FieldError('Choose a supported raid team action.');
}

export async function raidTeams316(request:Request,env:Env,ctx:CommunityContext,path=new URL(request.url).pathname):Promise<Response> {
  if (!ctx.features.has('events')) return apiJson({error:'feature_off'},404);
  if (!ctx.capabilities.confirmedGuildData || !ctx.subject) return refusal(env,request,'confirmedGuildData');
  const id=path===BASE?null:path.startsWith(BASE+'/')?path.slice(BASE.length+1):'';
  if (id!==null && !UUID.test(id)) return apiJson({error:'not_found'},404);
  try {
    if (request.method==='GET') return id ? await detail(request,env,ctx,id) : await listing(request,env,ctx);
    if (request.method!=='POST') return apiJson({error:'method_not_allowed'},405,{Allow:'GET, POST'});
    const b=await readJson(request);
    if (!b) throw new FieldError('Submit a JSON object with the requested fields.');
    let checkedPrimaries:string|undefined;
    if(id && b.action==='respond' && b.state==='primary' && b.confirmOverlap!==true) {
      const subject=ctx.subject,seat=field(b.seatId,'seat reference',64,true),revision=integer(b.revision,1,2147483646,'current revision');
      const schedule=await admittedRead(env,ctx,'confirmedGuildData',[env.DB.prepare(`SELECT t.id,t.revision,t.timezone,t.weekly_windows
        FROM raid_team_seats316 s JOIN raid_teams316 t ON t.id=s.team_id
        WHERE s.discord_id=?1 AND s.account_birth=?2 AND ${seatCurrent('s')}
        AND ((s.state='primary' AND t.id<>?3) OR (s.id=?4 AND s.state='offered_primary' AND t.id=?3 AND s.revision=?5 AND s.charter_revision=t.revision))`)
        .bind(subject.discordId,subject.accountIncarnation,id,seat,revision)]);
      if(schedule===FENCE_REFUSED)return refusal(env,request,'confirmedGuildData');
      const rows=schedule[0]!.results as {id:string;revision:number;timezone:string;weekly_windows:string}[], target=rows.find(r=>r.id===id),others=rows.filter(r=>r!==target);
      if(!target)return apiJson({error:'conflict',message:'Refresh the current offer and charter before accepting.'},409);
      const timings=(r:typeof target)=>({zone:r!.timezone,windows:JSON.parse(r!.weekly_windows) as WeeklyWindow316[]});
      if(overlapDetector316(Math.floor(Date.now()/1000))(timings(target),others.map(timings)))
        return apiJson({error:'other_primary_commitment',message:'A disclosed weekly raid window overlaps another primary team in the next eight weeks. Confirm if you intend to keep both places.'},409);
      checkedPrimaries=JSON.stringify(others.map(r=>[r.id,r.revision]));
    }
    const plan=writePlan(env,ctx,id,b,checkedPrimaries);
    const result=await admitted(env,ctx,[plan.first,...plan.after]);
    if (result!==FENCE_REFUSED) return apiJson({ok:true,...(plan.id?{id:plan.id}:{})});
    const access=await refusal(env,request,'confirmedGuildData');
    if (access.status!==409) return access;
    return apiJson({error:'conflict',message:'The request could not be applied. Reload the team and check the current offer, charter, permissions and available places.'},409);
  } catch (err) {
    if (err instanceof FieldError) return apiJson({error:'invalid',message:err.message},400);
    throw err;
  }
}
