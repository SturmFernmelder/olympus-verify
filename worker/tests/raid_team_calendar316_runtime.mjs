import worker from '../src/index.ts';
import {weeklyRaidStarts316} from '../src/raid-team-calendar316.ts';

export async function checkTeamCalendar316(base,rawDB,ctx,check) {
  const db=base.DB;
  const zone='America/Chicago';
  const dst=weeklyRaidStarts316('2027-03-07T19:00',zone,2);
  check('weekly raids retain the Chicago wall clock across daylight saving time',dst[1]-dst[0]===7*86400-3600);
  for(const wall of ['2027-03-14T02:30','2027-11-07T01:30','2027-02-29T12:00']) {
    let held=false;try{weeklyRaidStarts316(wall,zone,1);}catch{held=true;}
    check('invalid or ambiguous local raid time is held: '+wall,held);
  }
  const site='https://guild.example',env={...base,DB:rawDB,SITE_GUILD_ID:base.GUILD_ID,INTROS_GUILD_ID:base.GUILD_ID,
    SITE_ADMINS:'800000000000000761',INTROS_CHANNELS:'raid-signups=800000000000000789',EVENT_DISCORD_DELIVERY:'on',EVENT_DISCORD_REMINDERS:'on',
    COMMUNITY_FEATURES:'events,attendance',ROLE_OFFICER:'800000000000000789',DISCORD_CLIENT_SECRET:'directory-client-test-only',
    CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'raid-calendar-316',timestamp:new Date().toISOString()}};
  const member='800000000000000761',leader='800000000000000762',memberGuid='Player-87-00000000',leaderGuid='Player-87-00000001';
  async function login(code) {
    const res=await worker.fetch(new Request(site+'/auth/login'),env,ctx),state=new URL(res.headers.get('Location')).searchParams.get('state');
    const cb=await worker.fetch(new Request(site+'/auth/callback?code='+code+'&state='+encodeURIComponent(state),{headers:{Cookie:res.headers.get('Set-Cookie').split(';')[0]}}),env,ctx);
    const cookie=cb.headers.getSetCookie().find(c=>c.startsWith('__Host-olg='));
    if(cb.status!==303||!cookie)throw Error('calendar test original OAuth failed');
    return cookie.split(';')[0];
  }
  const lm=await login('raid-attendee-test-only'),mm=await login('raid-organizer-test-only');
  const id='db9d29c6-1311-4fee-82a0-d3dbd670aaa2',team='/raid-teams/'+id+'/calendar',my='/raid-teams/my-next-raid';
  const at=Math.floor(Date.now()/1000);
  for(const [id,guid] of [[member,memberGuid],[leader,leaderGuid]]) {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO members(discord_id) VALUES(?1)').bind(id),
      db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) SELECT ?1,?1,?2,?3,'member',?4 WHERE NOT EXISTS(SELECT 1 FROM characters WHERE guid=?2)").bind('calendar '+id.slice(-3),guid,id,at)]);
  }
  await db.prepare(`INSERT INTO raid_teams316(id,leader_id,leader_birth,leader_guid,name,philosophy,schedule,timezone,loot,expectations,needs,status,capacity)
    SELECT ?1,discord_id,account_incarnation,?3,'Calendar team','Learning','Weekly','America/Chicago','Original loot','Bring flasks','','forming',40
    FROM site_users WHERE discord_id=?2`).bind(id,leader,leaderGuid).run();
  for(const [subject,guid,seat,g] of [[member,memberGuid,'calendar-seat-member',1],[leader,leaderGuid,'calendar-seat-leader',2]]){
    await db.prepare(`INSERT INTO raid_team_seats316(id,team_id,discord_id,account_birth,character_guid,role,state,group_number,charter_revision)
      SELECT ?1,?2,discord_id,account_incarnation,?4,'tank','primary',?5,1 FROM site_users WHERE discord_id=?3`).bind(seat,id,subject,guid,g).run();
  }
  const api=async(cookie,path,body,method)=>{
    const res=await worker.fetch(new Request(site+'/api/community'+path,{method:method??(body?'POST':'GET'),
      headers:{Cookie:cookie,Origin:site,'X-Olympus':'2','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,ctx);
    return {status:res.status,data:await res.json()};
  };
  const start=new Date((at+2*86400)*1000).toISOString().slice(0,16);
  const form={action:'schedule',opId:'T'.repeat(22),teamRevision:1,title:'Test \u03a9 | Raid',localStart:start,timezone:'UTC',occurrences:2,
    durationMin:90,groups:[1,3],assemblyMinutes:15,preparation:'Bring 2 flasks\n+ food',capacity:10};
  check('guild officer who is not delegated for this team cannot schedule', (await api(mm,team,form)).status===409);
  const made=await api(lm,team,form);
  if(made.status!==201)throw Error('private calendar schedule HTTP '+made.status+':'+JSON.stringify(made.data));
  const [first,second]=made.data.eventIds;
  check('two independent occurrences share existing event clock with private notices closed',made.data.eventIds.length===2&&
    !!await db.prepare("SELECT 1 FROM community_events WHERE id=?1 AND title='Team raid' AND details='' AND publication_closed=1 AND reminder_closed=1").bind(first).first());
  check('retry of same original schedule preserves occurrence IDs and frozen invitation set', (await api(lm,team,form)).data.eventIds[0]===first&&
    !(await db.prepare('SELECT 1 FROM community_event_signups WHERE event_id=?1').bind(first).first()));
  check('different payload cannot reuse original operation', (await api(lm,team,{...form,title:'Different'})).status===409);
  const selected=await api(mm,my+'?guid='+memberGuid),excluded=await api(lm,my+'?guid='+leaderGuid);
  check('personal 7-day export contains one assigned occurrence with Unicode and delimiters encoded, no implicit response',
    selected.data.events.length===1&&selected.data.events[0].answer===null&&selected.data.events[0].groupLabel==='Groups 1, 3'&&selected.data.addonImport.startsWith('OLR1|'+memberGuid+'|')&&selected.data.addonImport.includes('%CE%A9%20%7C')&&selected.data.addonImport.includes('Bring%202%20flasks%20%2B%20food')
    &&excluded.data.events.length===0&&excluded.data.addonImport.endsWith('|0'),{selected,excluded});
  const packed=selected.data.addonImport.split('\n')[1].split('|').map(decodeURIComponent);
  const assembly=new Date((Date.parse(start+'Z')-15*60000)).toISOString().slice(0,16).replace('T',' ');
  check('selected member receives the correct assembly instant without dropping subgroup or preparation',
    packed.length===8&&packed[6]==='Groups 1, 3 · Assemble '+assembly+' UTC'&&packed[7]==='Bring 2 flasks + food');
  check('other verified character and stale team officer controls are refused', (await api(lm,my+'?guid='+memberGuid)).status===404&&
    (await api(mm,team,{action:'edit',eventId:first,revision:1,...Object.fromEntries(['title','localStart','timezone','durationMin','assemblyMinutes','preparation'].map(k=>[k,form[k]]))})).status===409);
  check('legacy event detail and personal RSVP route cannot expose or change a private occurrence',
    (await api(mm,'/event?id='+first)).status===404&&(await api(lm,'/events/rsvp',{eventId:first,revision:0,status:'yes'},'PUT')).status>=400);
  const officialPreview=await api(mm,'/events/discord?eventId='+first),officialReminder=await api(mm,'/events/reminder?eventId='+first);
  check('a server-wide site administrator sees no private event from either legacy Discord preview',
    officialPreview.status===404&&officialReminder.status===404,{officialPreview,officialReminder});
  const publish=await api(mm,'/events/discord/publish',{eventId:first,revision:1,opId:'Z'.repeat(22),payloadHash:'a'.repeat(64)});
  const arm=await api(mm,'/events/reminder',{eventId:first,revision:1,enabled:true});
  check('production publication and reminder controls refuse a private occurrence before any Discord send or claim',
    publish.status===404&&arm.status===404&&!(await db.prepare('SELECT 1 FROM community_event_deliveries WHERE event_id=?1 UNION ALL SELECT 1 FROM community_event_reminders WHERE event_id=?1').bind(first).first()),{publish,arm});
  const RSVP={action:'rsvp',eventId:first,revision:1,answer:'late'};
  check('current invite accepts an explicit running-late response in shared RSVP, excluding the unassigned team leader',
    (await api(lm,team,RSVP)).status===409&&(await api(mm,team,RSVP)).status===200&&
    (await db.prepare('SELECT status FROM community_event_signups WHERE event_id=?1 AND discord_id=?2').bind(first,member).first())?.status==='yes');
  const single={...form,opId:'U'.repeat(22),groups:[],occurrences:1,capacity:1};
  const one=(await api(lm,team,single)).data.eventIds[0];
  const confirm={action:'rsvp',eventId:one,revision:1,answer:'confirmed'};
  check('the current response holds the single place and a second current player waits', (await api(mm,team,confirm)).status===200&&(await api(lm,team,confirm)).status===409);
  const later=new Date((at+3*86400)*1000).toISOString().slice(0,16);
  check('rescheduled team raiders reconfirm the new time and a stale yes cannot hold the only place',
    (await api(lm,team,{...single,action:'edit',eventId:one,revision:1,localStart:later})).status===200&&
    (await api(lm,team,{...confirm,revision:2})).status===200&&(await api(mm,team,{...confirm,revision:2,rsvpRevision:1})).status===409);
  check('a cancelled occurrence releases both own personal views',(await api(lm,team,{action:'cancel',eventId:one,revision:2})).status===200);
  await db.prepare("UPDATE raid_teams316 SET loot='New terms',revision=revision+1 WHERE id=?1").bind(id).run();
  check('original loot terms remain frozen for existing occurrence', (await api(mm,team+'?eventId='+first)).data.events[0].loot==='Original loot');
  check('cancel one occurrence removes it from personal cache and keeps the sibling scheduled',
    (await api(lm,team,{action:'cancel',eventId:first,revision:1})).status===200&&(await api(mm,my+'?guid='+memberGuid)).data.events.length===0&&
    (await db.prepare('SELECT status FROM community_events WHERE id=?1').bind(second).first()).status==='scheduled');
  await db.prepare("UPDATE raid_teams316 SET status='inactive' WHERE id=?1").bind(id).run();
  check('inactive team retains its earlier calendar without an enabled reply or a personal invitation',
    !(await api(mm,team+'?eventId='+second)).data.events[0].canRespond&&!(await api(mm,my+'?guid='+memberGuid)).data.events.length);
  await db.prepare("UPDATE raid_teams316 SET status='forming' WHERE id=?1").bind(id).run();
  const save={action:'attendance',eventId:second,revision:1,seatId:'calendar-seat-member',state:'present',attendanceRevision:0};
  check('team leader cannot record attendance before the occurrence starts',(await api(lm,team,save)).status===409);
  await db.prepare('UPDATE community_events SET starts_at=?1,ends_at=?1+duration_min*60 WHERE id=?2').bind(at-60,second).run();
  check('scoped team leader may record observed attendance only on an original current invite and revision',
    (await api(lm,team,{...save,seatId:'calendar-seat-leader'})).status===409&&(await api(lm,team,save)).status===200&&(await api(lm,team,save)).status===409&&
    (await db.prepare('SELECT state FROM community_event_attendance WHERE event_id=?1 AND discord_id=?2').bind(second,member).first())?.state==='present');
  const ownHistory=async()=>(await api(mm,'/attendance/me')).data.entries;
  const ordinary='O'.repeat(22);
  await db.prepare(`INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,created_by,nonce,created_at,updated_at,retain_until)
      VALUES(?1,?1,'Open guild raid','',?2,60,?2+3600,?3,?1,?2,?2,?2+86400)`).bind(ordinary,at-120,leader).run();
  await db.prepare(`INSERT INTO community_event_attendance(event_id,discord_id,state,source,recorded_by,recorded_at,revision,write_nonce)
      VALUES(?1,?2,'present','officer',?3,?4,1,?1)`).bind(ordinary,member,leader,at).run();
  const regularRow=(await ownHistory()).find(a=>a.event.id===ordinary);
  check('ordinary guild attendance retains its existing event DTO and generic calendar route',
    regularRow?.event.title==='Open guild raid'&&!Object.hasOwn(regularRow.event,'teamId')&&(await api(mm,'/event?id='+ordinary)).status===200);
  const authorizedRow=(await ownHistory()).find(a=>a.event.id===second);
  check('own attendance names an authorized team occurrence and opens its actual authorized route',
    authorizedRow?.event.teamId===id&&authorizedRow.event.title===form.title&&authorizedRow.state==='present'&&
    (await api(mm,team+'?eventId='+authorizedRow.event.id)).data.events[0]?.title===form.title);
  check('leaving the team succeeds even with retained earlier attendance',
    (await api(mm,'/raid-teams/'+id,{action:'leave',seatId:'calendar-seat-member',revision:1})).status===200);
  const afterLeave=await ownHistory(), retained=afterLeave.find(a=>a.event.teamId===null&&a.state==='present'&&a.event.startsAt===authorizedRow?.event.startsAt);
  check('after a team departure own attendance remains with a neutral label, without private title or route',
    !!retained&&retained.event.id===null&&retained.event.title==='Private team raid (retained attendance)'&&
    !JSON.stringify(afterLeave).includes(form.title)&&(await api(mm,team+'?eventId='+second)).status===404);

  const boundaryTime=at-60, tie='z'.repeat(22);
  const preceding=await db.prepare(`SELECT COUNT(*) n FROM community_event_attendance a JOIN community_events e ON e.id=a.event_id
    WHERE a.discord_id=?1 AND (e.starts_at>?2 OR (e.starts_at=?2 AND e.id<?3))`).bind(member,boundaryTime,second).first();
  const needed=99-preceding.n;
  if(needed<0||tie<=second)throw Error('Attendance pagination fixture does not put the retained event on the boundary.');
  const generate=`WITH RECURSIVE seq(n) AS (SELECT 1 WHERE ?1>0 UNION ALL SELECT n+1 FROM seq WHERE n<?1),
    raids(id,start) AS (SELECT 'B'||printf('%021d',n),?2+10 FROM seq UNION ALL SELECT ?3,?2)`;
  await db.batch([db.prepare(generate+` INSERT INTO community_events(id,op_id,title,details,starts_at,duration_min,ends_at,created_by,nonce,created_at,updated_at,retain_until)
    SELECT id,id,'Attendance fixture','',start,60,start+3600,?4,id,start,start,start+86400 FROM raids`).bind(needed,boundaryTime,tie,leader),
    db.prepare(generate+` INSERT INTO community_event_attendance(event_id,discord_id,state,source,recorded_by,recorded_at,revision,write_nonce)
    SELECT id,?4,'present','officer',?5,start,1,id FROM raids`).bind(needed,boundaryTime,tie,member,leader)]);
  const page=await api(mm,'/attendance/me'), token=page.data.nextCursor;
  const decoded=JSON.parse(atob(token.replace(/-/g,'+').replace(/_/g,'/')));
  const next=await api(mm,'/attendance/me?cursor='+encodeURIComponent(token));
  check('an attendance page ending on a former-team raid emits an owned attendance key and preserves equal-start rows on the next page',
    page.data.entries.length===100&&page.data.entries.at(-1).event.teamId===null&&decoded.length===4&&decoded[0]===2&&decoded[2]===boundaryTime&&
    Number.isSafeInteger(decoded[3])&&decoded[3]>0&&!JSON.stringify(decoded).includes(second)&&next.status===200&&
    next.data.entries.some(row=>row.event.id===tie)&&!next.data.entries.some(row=>row.event.teamId===null&&row.event.startsAt===retained.event.startsAt));
  const legacy=btoa(JSON.stringify([1,'attendance-me',boundaryTime,second])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const oldNext=await api(mm,'/attendance/me?cursor='+encodeURIComponent(legacy));
  check('a previously issued event-key cursor returns the same next page as the new attendance key',
    oldNext.status===200&&JSON.stringify(oldNext.data.entries)===JSON.stringify(next.data.entries));
  await db.prepare('DELETE FROM community_event_attendance WHERE event_id=?1 AND discord_id=?2').bind(second,member).run();
  const stale=await api(mm,'/attendance/me?cursor='+encodeURIComponent(token));
  check('a removed private attendance anchor requests a fresh first page',stale.status===409&&stale.data.error==='cursor_stale');

}
