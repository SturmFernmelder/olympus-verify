import type {Env} from './env';
import {registerCommunityData, type ExportPlan} from './community-data-registry';
import {registerServingPrivacyFamilies} from './privacy-business-catalog';

// Each row belongs to the person requesting the copy. Do not add other applicants,
// their notes, server identifiers, or the account-birth/write nonces to this projection.
const ownRows = `
  SELECT 'profile' AS entry,json_object('characterGuid',character_guid,'role',role,'class',class_name,'spec',spec,
    'availability',availability,'notes',notes,'listed',listed,'updatedAt',updated_at) AS value
    FROM raid_raider_profiles316 WHERE discord_id=?1
  UNION ALL SELECT 'charter:'||id,json_object('team',name,'philosophy',philosophy,'timezone',timezone,'schedule',schedule,
    'loot',loot,'expectations',expectations,'needs',needs,'weeklyWindows',json(weekly_windows),'roleNeeds',json(role_needs),'capacity',capacity,'status',status,'revision',revision)
    FROM raid_teams316 WHERE leader_id=?1
  UNION ALL SELECT 'seat:'||s.id,json_object('team',t.name,'characterGuid',s.character_guid,'role',s.role,
    'state',s.state,'note',s.note,'officer',s.is_officer,'group',s.group_number,'charterRevision',s.charter_revision,
    'createdAt',s.created_at,'updatedAt',s.updated_at)
    FROM raid_team_seats316 s JOIN raid_teams316 t ON t.id=s.team_id WHERE s.discord_id=?1
  UNION ALL SELECT 'invite:'||i.event_id||':'||s.id,json_object('eventId',i.event_id,'characterGuid',i.character_guid,
    'group',i.group_number,'answer',i.answer)
    FROM raid_team_seats316 s JOIN raid_team_invites316 i ON i.seat_id=s.id WHERE s.discord_id=?1`;
function copy(env: Env, subject: string): ExportPlan {
  return {
    statements:[env.DB.prepare(`SELECT entry,value FROM (${ownRows}) ORDER BY entry`).bind(subject)],
    shape:results=>({records:results[0]!.results.map(raw=>{const r=raw as {entry:string;value:string};return {entry:r.entry,value:JSON.parse(r.value)};})}),
    packed:{selectSql:ownRows,maxRows:1002,shape:records=>({records})},
  };
}
registerCommunityData('raid_teams', (env,id)=>[
  // Keep the ordinary event cleanup responsible for shared signup and attendance rows.
  // The permanent team event marker keeps the envelope private after its charter goes.
  env.DB.prepare(`UPDATE community_events SET status='cancelled',revision=revision+1,retain_until=min(retain_until,unixepoch())
    WHERE id IN(SELECT e.event_id FROM raid_teams316 t JOIN raid_team_events316 e ON e.team_id=t.id WHERE t.leader_id=?1)`).bind(id),
  env.DB.prepare('DELETE FROM raid_teams316 WHERE leader_id=?1').bind(id),
  env.DB.prepare('DELETE FROM raid_team_seats316 WHERE discord_id=?1').bind(id),
  env.DB.prepare('DELETE FROM raid_raider_profiles316 WHERE discord_id=?1').bind(id),
],copy);
registerServingPrivacyFamilies('raid_teams',[
  {table:'raid_teams316',columns:'id,leader_id,leader_birth,leader_guid,name,philosophy,schedule,timezone,loot,expectations,needs,weekly_windows,role_needs,status,capacity,revision,created_at,updated_at'},
  {table:'raid_team_seats316',columns:'id,team_id,discord_id,account_birth,character_guid,role,state,note,is_officer,group_number,charter_revision,revision,created_at,updated_at'},
  {table:'raid_raider_profiles316',columns:'discord_id,account_birth,character_guid,role,class_name,spec,availability,notes,listed,revision,updated_at'},
  {table:'raid_team_events316',columns:'event_id,team_id,series_id,occurrence,request_hash,title,timezone,group_mask,assembly_minutes,preparation,charter_revision,loot,expectations'},
  {table:'raid_team_invites316',columns:'event_id,seat_id,character_guid,group_number,answer,answer_nonce'},
]);
