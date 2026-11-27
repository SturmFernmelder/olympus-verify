import {overlapDetector316} from '../src/raid-team-times316.ts';
import {postRaidTeam316} from '../public/static/raid-teams.js';
import worker from '../src/index.ts';
import { PAGE_VERSION } from '../src/site-core.ts';
import { communityScopedExportPlan, communityScopedEraseStatements, communityEraseStatements } from '../src/community-data-registry.ts';

export async function raidTeamsReadback316(base,rawDB,ctx,check) {
  const guild=base.GUILD_ID,site='https://guild.example',env={...base,DB:rawDB,SITE_GUILD_ID:guild,INTROS_GUILD_ID:guild,
    COMMUNITY_FEATURES:'events,attendance',DISCORD_CLIENT_SECRET:'directory-client-test-only',
    CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'raid-teams-fixture',timestamp:new Date().toISOString()}};
  const overlap=overlapDetector316(Date.parse('2027-03-01T00:00:00Z')/1000);
  const overnight={zone:'America/Chicago',windows:[{day:7,start:'23:30',end:'01:00'}]};
  check('cross-zone overnight overlaps include the US daylight saving change',
    overlap(overnight,[{zone:'UTC',windows:[{day:1,start:'05:05',end:'05:20'}]}]) &&
    !overlap(overnight,[{zone:'UTC',windows:[{day:1,start:'08:00',end:'10:00'}]}]));
  const db=base.DB;
  const accounts=['Team Founder','Raid Healer','Standby Mage','New Arrival'].map((name,i)=>({
    id:'80000000000000086'+(i+1),guid:'Player-87-0010000'+i,name,
  }));
  const [leader,healer,mage,guest]=accounts;
  for (const [i,a] of accounts.entries()) {
    const login=await worker.fetch(new Request(site+'/auth/login'),env,ctx);
    const state=new URL(login.headers.get('Location')).searchParams.get('state');
    const callback=await worker.fetch(new Request(site+'/auth/callback?code=raid-team-test-'+i+'&state='+encodeURIComponent(state),{
      headers:{Cookie:login.headers.get('Set-Cookie').split(';')[0]},
    }),env,ctx);
    const cookie=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-olg='));
    if (callback.status!==303 || !cookie) throw Error('Missing original raid team fixture session '+i);
    a.cookie=cookie.split(';')[0];
    if (a!==guest) await db.batch([
      db.prepare('INSERT INTO members(discord_id) VALUES(?1)').bind(a.id),
      db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES(?1,?2,?3,?4,'member',unixepoch())").bind(a.name.toLowerCase(),a.name,a.guid,a.id),
    ]);
  }
  const basePath='/api/community/raid-teams',usedWebWrites=new Set();
  const http=async(a,method,path,body,pageVersion=PAGE_VERSION)=>{
    const response=await worker.fetch(new Request(site+path,{method,
      headers:{...(a?{Cookie:a.cookie}:{}),Origin:site,...(pageVersion===null?{}:{'X-Olympus':pageVersion}),'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined}),env,ctx);
    return {status:response.status,data:await response.json()};
  };
  const query=async(a,tail='',body,pageVersion=PAGE_VERSION)=>{
    if(!body)return http(a,'GET',basePath+tail,undefined,pageVersion);
    const [,teamId,section]=tail.split('/');
    const target=teamId?{teamId,area:section==='calendar'?'calendar':'team'}:{area:'team'};
    return postRaidTeam316((method,path,data)=>{
      if(method!=='POST'||path!==basePath)throw Error('Raid website attempted an unapproved write URL');
      usedWebWrites.add((data.teamId?data.area:'directory')+'/'+data.action);
      return http(a,method,path,data,pageVersion);
    },target,body);
  };
  const ok=async(...args)=>{
    const r=await query(...args);
    if(r.status!==200) throw Error('raid team fixture '+(args[2]?.action||'GET')+' expected 200, received '+r.status+' '+JSON.stringify(r.data));
    return r.data;
  };
  check('team directory requires authenticated verified guild membership',(await query(null)).status===401&&(await query(guest)).status===403);
  const team=crypto.randomUUID(),other=crypto.randomUUID(),one='/'+team;
  const charter={name:'Dawn Patrol',philosophy:'Learning',schedule:'Tuesday 20:00–22:00',timezone:'America/Chicago',loot:'One soft reserve',
    expectations:'Bring consumables',needs:'Healer or mage',status:'recruiting',capacity:2,weeklyWindows:[{day:2,start:'22:00',end:'02:00'}],roleNeeds:['healer']};
  const create={...charter,action:'create',id:team,guid:leader.guid,role:'tank'};
  check('missing or stale page headers cannot mutate the directory',
    (await query(leader,'',create,null)).status===403 && (await query(leader,'',create,'1')).data.error==='reload_page' &&
    (await query(leader,'/'+team)).status===404);
  check('team founder must own their selected verified character',(await query(healer,'',create)).status===409);
  const apply={action:'apply',guid:leader.guid,role:'tank',revision:0};
  const invalidTargets=[{area:'admin',teamId:team},{area:'calendar'},{teamId:'https://elsewhere.example/'},{teamId:null},
    {teamId:{path:'../admin'}},{teamId:team,id:other},{path:'/api/admin/roles'},{url:'/api/me'},{route:'calendar'}];
  check('one exact website POST rejects malformed targets and never dispatches an arbitrary path',
    (await Promise.all(invalidTargets.map(t=>http(leader,'POST',basePath,{...apply,...t})))).every(r=>r.status===400&&r.data.error==='invalid_target') &&
    (await http(leader,'POST',basePath+'?path=/api/admin',{...apply,teamId:team})).status===400 &&
    (await http(leader,'POST',basePath+'/'+team,{...apply,teamId:other})).status===400 &&
    (await http(leader,'POST',basePath+'/'+team+'/calendar',{...apply,area:'team'})).status===400 &&
    (await http(leader,'POST',basePath,{...apply,teamId:other})).status===409);
  await ok(leader,'',create);
  check('team search combines recruiting role, style and the viewer’s converted day and start time before pagination',
    (await ok(healer,'?teamRole=healer&style=learn&viewerZone=UTC&day=3&from=02:00&to=05:30')).teams.some(t=>t.id===team) &&
    !(await ok(healer,'?teamRole=tank&day=3&viewerZone=UTC')).teams.some(t=>t.id===team) &&
    !(await ok(healer,'?day=2&viewerZone=UTC')).teams.some(t=>t.id===team));
  let leaderPage=await ok(leader,one);
  check('ordinary verified member can found a team with a single founder seat',leaderPage.isLeader&&leaderPage.canManage&&leaderPage.team.primaryCount===1&&leaderPage.mine.state==='primary');
  await db.batch([
    db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES('founder alternate','Founder Alternate','Player-87-00100100',?1,'member',unixepoch())").bind(leader.id),
    db.prepare("UPDATE characters SET status='left' WHERE guid=?1").bind(leader.guid),
  ]);
  const heldFounder=await ok(leader,one);
  check('a charter owner with another verified character cannot abandon the founding seat while its chosen character is on hold',
    heldFounder.characters.length===1&&!heldFounder.canManage&&
    (await query(leader,one,{action:'leave',seatId:leaderPage.mine.id,revision:leaderPage.mine.revision})).status===409);
  await db.prepare("UPDATE characters SET status='member' WHERE guid=?1").bind(leader.guid).run();
  const returnedFounder=await ok(leader,one);
  check('restoring the founding character restores original leadership and management on its same active seat',
    returnedFounder.isLeader&&returnedFounder.canManage&&returnedFounder.mine.id===leaderPage.mine.id&&returnedFounder.mine.state==='primary');
  check('standings are public to guild members and team assignments are scoped',(await ok(healer,one)).members.length===0 && !JSON.stringify(leaderPage.members).includes(leader.id));
  const profile={action:'profile',guid:healer.guid,role:'healer',playerClass:'Priest',spec:'Holy',availability:'Tuesdays',notes:'Learning runs welcome',listed:false,revision:0};
  await ok(healer,'',profile);
  check('saved profile is private until its owner lists it',(await ok(mage)).players.length===0);
  await ok(healer,'',{...profile,listed:true,revision:1});
  check('class/spec filters search opt-in profiles without disclosing account or character IDs',
    (await ok(mage,'?role=healer&class=Priest&spec=hol')).players.some(p=>p.character===healer.name&&!p.guid&&!p.discord_id)
    &&(await ok(mage,'?class=Mage')).players.length===0);
  await ok(healer,one,{action:'apply',guid:healer.guid,role:'healer',note:'Private application note',revision:0});
  await ok(mage,one,{action:'apply',guid:mage.guid,role:'ranged',note:'Reserve available',revision:0});
  const healerSeat=(await ok(healer,one)).mine.id,mageSeat=(await ok(mage,one)).mine.id;
  check('team applicant cannot inspect other applications or self-issue an offer',(await ok(mage,one)).applications.length===0 &&
    (await query(healer,one,{action:'decide',seatId:healerSeat,revision:1,state:'offered_primary'})).status===409);
  let panel=await ok(leader,one);
  check('team leadership sees applicant notes and no one has been automatically rostered',
    panel.applications.length===2 && panel.applications.some(s=>s.note==='Private application note') && panel.team.primaryCount===1);
  const offer=(seatId,revision,state='offered_primary')=>ok(leader,one,{action:'decide',seatId,revision,state});
  await offer(healerSeat,1); await offer(mageSeat,1);
  await ok(leader,one,{...charter,action:'edit',revision:1,loot:'Two soft reserves'});
  const accept=(a,seatId,revision,state='primary')=>query(a,one,{action:'respond',seatId,revision,state});
  check('a charter edit invalidates outstanding offers until leadership reissues them',(await accept(healer,healerSeat,2)).status===409);
  await offer(healerSeat,2); await offer(mageSeat,2);
  const race=await Promise.all([accept(healer,healerSeat,3),accept(mage,mageSeat,3)]);
  check('concurrent acceptances for one primary place admit exactly one applicant',
    race.map(r=>r.status).sort().join(',')==='200,409' && (await ok(leader,one)).team.primaryCount===2);
  const winner=race[0].status===200?healer:mage,runner=winner===mage?healer:mage;
  let runnerSeat=(await ok(runner,one)).mine,winnerSeat=(await ok(winner,one)).mine;
  await offer(runnerSeat.id,runnerSeat.revision,'offered_reserve');
  await ok(runner,one,{action:'respond',seatId:runnerSeat.id,revision:runnerSeat.revision+1,state:'reserve'});
  panel=await ok(leader,one);
  check('an accepted reserve is recorded separately from occupied primary places',panel.team.primaryCount===2 && panel.team.reserveCount===1);
  await ok(leader,one,{action:'officer',seatId:winnerSeat.id,revision:winnerSeat.revision,enabled:true});
  let wp=await ok(winner,one);winnerSeat=wp.mine;
  check('delegation grants only that team management and no guild role',wp.canManage&&!wp.isLeader);
  await ok(winner,one,{action:'group',seatId:winnerSeat.id,revision:winnerSeat.revision,groupNumber:1});
  check('delegated officer can assign a primary member to a team group',(await ok(winner,one)).mine.groupNumber===1);
  // The original fourth Discord viewer has now linked an eligible member character.
  await db.batch([
    db.prepare('INSERT INTO members(discord_id) VALUES(?1)').bind(guest.id),
    db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES(?1,?2,?3,?4,'member',unixepoch())")
      .bind(guest.name.toLowerCase(),guest.name,guest.guid,guest.id),
  ]);
  await ok(guest,one,{action:'apply',guid:guest.guid,role:'flex',revision:0});
  const finalSeat=(await ok(guest,one)).mine;
  await offer(finalSeat.id,finalSeat.revision);
  await db.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(winner.id).run();
  const heldTeam=await ok(leader,one);
  check('a temporarily unverified primary member remains anonymous and keeps the last occupied place',
    heldTeam.team.primaryCount===1 && heldTeam.team.primaryOccupied===2 && !heldTeam.members.some(m=>m.id===winnerSeat.id) &&
    (await accept(guest,finalSeat.id,finalSeat.revision+1)).status===409 &&
    (await query(leader,one,{...charter,action:'edit',revision:2,capacity:1})).status===409);
  await db.prepare("UPDATE characters SET status='member' WHERE discord_id=?1").bind(winner.id).run();
  const afterReturn=await ok(leader,one);
  check('the returning member fits their original place without overbooking the other applicant',
    afterReturn.team.primaryCount===2 && afterReturn.team.primaryOccupied===2 && afterReturn.team.capacity===2 &&
    (await ok(guest,one)).mine.state==='offered_primary');
  await ok(leader,'',{...create,id:other,name:'Dusk Patrol',capacity:10});
  const otherPage='/'+other;
  check('a delegated officer on one team cannot change a separate charter',
    (await query(winner,otherPage,{...charter,action:'edit',revision:1})).status===409);
  await ok(winner,otherPage,{action:'apply',guid:winner.guid,role:'flex',revision:0});
  const otherSeat=(await ok(winner,otherPage)).mine;
  await ok(leader,otherPage,{action:'decide',seatId:otherSeat.id,revision:1,state:'offered_primary'});
  const take={action:'respond',seatId:otherSeat.id,revision:2,state:'primary'};
  check('multiple teams may offer places and another primary commitment requires confirmation',(await query(winner,otherPage,take)).data.error==='other_primary_commitment');
  await ok(winner,otherPage,{...take,confirmOverlap:true});
  await db.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<5)
    INSERT INTO raid_team_seats316(id,team_id,discord_id,account_birth,character_guid,role,state,group_number,charter_revision)
    SELECT 'held-group-'||i,?1,'79990000000000000'||i,printf('%032x',i),'Player-87-1000'||i,'flex','primary',5,1 FROM n`).bind(other).run();
  const currentOther=(await ok(winner,otherPage)).mine;
  check('the five-person subgroup keeps its held places anonymous and cannot take a sixth',
    (await query(leader,otherPage,{action:'group',seatId:currentOther.id,revision:currentOther.revision,groupNumber:5})).status===409 &&
    !(await ok(leader,otherPage)).members.some(m=>m.id.startsWith('held-group-')));
  await db.prepare("DELETE FROM raid_team_seats316 WHERE team_id=?1 AND id LIKE 'held-group-%'").bind(other).run();
  check('a member may explicitly accept a second team without losing their first seat',(await ok(winner)).myTeams.filter(x=>x.state==='primary').length===2);
  const nonoverlap=crypto.randomUUID(),third='/'+nonoverlap;
  await ok(leader,'',{...create,id:nonoverlap,name:'Sunday Picnic',weeklyWindows:[{day:7,start:'12:00',end:'14:00'}]});
  await ok(winner,third,{action:'apply',guid:winner.guid,role:'flex',revision:0});
  const thirdSeat=(await ok(winner,third)).mine;
  await ok(leader,third,{action:'decide',seatId:thirdSeat.id,revision:1,state:'offered_primary'});
  await ok(winner,third,{action:'respond',seatId:thirdSeat.id,revision:2,state:'primary'});
  check('nonoverlapping primary commitments need no override',(await ok(winner,third)).mine.state==='primary');
  await ok(runner,third,{action:'apply',guid:runner.guid,role:'flex',revision:0});
  const forgetSeat=(await ok(runner,third)).mine;
  await ok(runner,third,{action:'respond',seatId:forgetSeat.id,revision:forgetSeat.revision,state:'withdrawn'});
  await ok(runner,third,{action:'forget',seatId:forgetSeat.id,revision:forgetSeat.revision+1});
  check('withdrawn applications can be forgotten and their account slot reclaimed',
    (await ok(runner,third)).mine===null && !(await ok(runner)).myTeams.some(t=>t.teamId===nonoverlap));
  const occurrence=await query(leader,otherPage+'/calendar',{action:'schedule',opId:'S'.repeat(22),teamRevision:1,title:'Future raid for erasure fixture',
    timezone:'UTC',localStart:new Date(Date.now()+2*86400000).toISOString().slice(0,16),durationMin:90,occurrences:1,
    capacity:10,groups:[],assemblyMinutes:0,preparation:'Fixture'});
  if(occurrence.status!==201)throw Error('Raid erasure setup could not schedule the private occurrence: '+JSON.stringify(occurrence));
  const ownEvent=await db.prepare('SELECT event_id FROM raid_team_events316 WHERE team_id=?1').bind(other).first();
  const calendar=otherPage+'/calendar',future=ownEvent.event_id;
  const schedule=async(label)=>{
    const out=await query(leader,calendar,{action:'schedule',opId:label.repeat(22),teamRevision:1,title:'Original seat invitation',
      timezone:'UTC',localStart:new Date(Date.now()+86400000).toISOString().slice(0,16),durationMin:60,occurrences:1,
      capacity:10,groups:[],assemblyMinutes:0,preparation:''});
    if(out.status!==201)throw Error('Raid seat fixture could not schedule: '+JSON.stringify(out));
    return out.data.eventIds[0];
  };
  const answer=(actor,eventId)=>ok(actor,calendar,{action:'rsvp',eventId,answer:'confirmed',revision:1,rsvpRevision:0});
  const currentSeat=async()=>(await ok(winner,otherPage)).mine;
  const rejoin=async()=>{
    const last=await currentSeat();
    await ok(winner,otherPage,{action:'apply',guid:winner.guid,role:'flex',revision:last.revision});
    const next=await currentSeat();
    await ok(leader,otherPage,{action:'decide',seatId:next.id,revision:next.revision,state:'offered_primary'});
    await ok(winner,otherPage,{action:'respond',seatId:next.id,revision:next.revision+1,state:'primary',confirmOverlap:true});
    return currentSeat();
  };
  const past=await schedule('H');
  await answer(winner,future); await answer(leader,future); await answer(winner,past);
  await db.prepare('UPDATE community_events SET starts_at=unixepoch()-7200,ends_at=unixepoch()-7200+duration_min*60 WHERE id=?1').bind(past).run();
  const firstSeat=await currentSeat();
  await ok(leader,calendar,{action:'attendance',eventId:past,revision:1,seatId:firstSeat.id,state:'present',attendanceRevision:0});
  check('refused and stale departures do not revoke invitations or release RSVPs',
    (await query(runner,otherPage,{action:'remove',seatId:firstSeat.id,revision:firstSeat.revision})).status===409 &&
    (await query(winner,otherPage,{action:'leave',seatId:firstSeat.id,revision:firstSeat.revision+1})).status===409 &&
    (await ok(winner,calendar+'?eventId='+future)).events[0].answer==='confirmed');
  await ok(winner,otherPage,{action:'leave',seatId:firstSeat.id,revision:firstSeat.revision});
  const secondSeat=await rejoin();
  check('a same-character rejoin cannot see or answer its prior future or historical invitations',secondSeat.id!==firstSeat.id &&
    (await query(winner,calendar+'?eventId='+future)).status===404 && (await query(winner,calendar+'?eventId='+past)).status===404 &&
    (await query(winner,calendar,{action:'rsvp',eventId:future,revision:1,answer:'confirmed'})).status===409 &&
    !(await ok(winner,'/my-next-raid?guid='+winner.guid)).events.some(e=>e.eventId===future));
  const hasSignup=async(e,account)=>!!(await db.prepare('SELECT 1 FROM community_event_signups WHERE event_id=?1 AND discord_id=?2').bind(e,account.id).first());
  check('departures release only the departing future signup and preserve recorded past participation',
    !await hasSignup(future,winner) && await hasSignup(future,leader) && await hasSignup(past,winner) &&
    (await db.prepare('SELECT state FROM community_event_attendance WHERE event_id=?1 AND discord_id=?2').bind(past,winner.id).first()).state==='present');
  const later=await schedule('N');
  await answer(winner,later);
  await ok(leader,otherPage,{action:'remove',seatId:secondSeat.id,revision:secondSeat.revision});
  const thirdIncarnation=await rejoin();
  check('team removal frees the RSVP and reacceptance cannot restore old commitments',thirdIncarnation.id!==secondSeat.id &&
    !await hasSignup(later,winner) && (await query(winner,calendar+'?eventId='+later)).status===404 &&
    (await query(winner,otherPage,{action:'leave',seatId:secondSeat.id,revision:secondSeat.revision})).status===409);
  await db.prepare("UPDATE characters SET status='left' WHERE discord_id=?1").bind(winner.id).run();
  check('loss of guild membership immediately removes roster visibility and team administration',
    (await query(winner,one)).status===403 && !(await ok(leader,one)).members.some(m=>m.id===winnerSeat.id));
  await db.prepare("UPDATE characters SET status='member' WHERE discord_id=?1").bind(winner.id).run();
  await db.batch([
    db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES('fixture collision','Fixture Collision',?1,?2,'member',unixepoch())").bind(winner.guid,runner.id),
  ]);
  check('a disputed character GUID immediately holds grants for that seat',!(await ok(winner,one)).canManage);
  await db.prepare("DELETE FROM characters WHERE name_key='fixture collision'").run();
  await db.prepare("UPDATE privacy_subjects SET state='retiring',revision=revision+1,updated_at=unixepoch() WHERE subject_id=?1 AND state='active'").bind(runner.id).run();
  check('retiring member disappears from team reads, including member counts',!(await ok(leader,one)).members.some(m=>m.id===runnerSeat.id) && (await ok(leader,one)).team.reserveCount===0);
  await db.prepare("UPDATE characters SET name='Raider Renamed',name_key='raider renamed' WHERE discord_id=?1").bind(winner.id).run();
  check('renaming a still-proved GUID preserves the seat and shows its current name',(await ok(winner,one)).mine.character==='Raider Renamed');
  const plan=communityScopedExportPlan(base,winner.id,['raid_teams']);
  const own=JSON.stringify(plan.shape(await db.batch(plan.statements)));
  check('own raid data export includes this character and excludes other applicants',own.includes(winner.guid)&&!own.includes(runner.guid)&&!own.includes(leader.guid));
  const eraser=communityScopedEraseStatements(base,runner.id,['raid_teams']);
  await db.batch(eraser);
  check('erasure clears only the retiring applicant and retains the other team seats',
    !(await db.prepare('SELECT 1 FROM raid_team_seats316 WHERE discord_id=?1').bind(runner.id).first()) &&
    (await ok(leader,one)).members.some(m=>m.id===winnerSeat.id));
  const oldLeader=await ok(leader,one),successor=oldLeader.members.find(m=>m.id===winnerSeat.id);
  await ok(leader,one,{action:'transfer',seatId:successor.id,revision:successor.revision});
  check('leadership can be transferred without a guild rank or automatic membership change',
    (await ok(winner,one)).isLeader && !(await ok(leader,one)).isLeader);
  await db.batch(communityScopedEraseStatements(base,leader.id,['raid_teams']));
  const retiredEnvelope=await db.prepare('SELECT status,retain_until<=unixepoch() AS expired FROM community_events WHERE id=?1').bind(ownEvent.event_id).first();
  check('erasing the current charter owner cancels and expires the event while cascading its private team metadata',
    retiredEnvelope.status==='cancelled' && retiredEnvelope.expired===1 &&
    !(await db.prepare('SELECT 1 FROM raid_team_events316 WHERE event_id=?1').bind(ownEvent.event_id).first()));
  const communitySteps=communityEraseStatements(base,leader.id).length;
  check('raid erasure contributes four statements to the registered community cleanup',
    communityScopedEraseStatements(base,leader.id,['raid_teams']).length===4, {registeredCommunityStatements:communitySteps,raidStatements:4});
  check('erasing the prior leader preserves the transferred charter and removes the former leader from it',
    (await ok(winner,one)).isLeader && !(await ok(winner,one)).members.some(m=>m.character===leader.name));
  const series="WITH RECURSIVE n(v) AS (SELECT 1 UNION ALL SELECT v+1 FROM n WHERE v<1000) ";
  await db.batch([
    db.prepare(series+"INSERT INTO members(discord_id) SELECT '7999999999999'||printf('%05d',v) FROM n"),
    db.prepare(series+"INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) SELECT 'sim raider '||v,'Sim Raider '||v,'Player-87-'||printf('%08X',100000+v),'7999999999999'||printf('%05d',v),'member',unixepoch() FROM n"),
  ]);
  check('guild-scale character data preserves correct visible seats and verified char choices',
    (await ok(winner,one)).members.length===1 && (await ok(winner)).characters.some(c=>c.name==='Raider Renamed'));
  const lookup=await rawDB.prepare('EXPLAIN QUERY PLAN SELECT 1 FROM characters k WHERE k.guid=?1 AND k.discord_id=?2').bind(winner.guid,winner.id).all();
  check('character ownership lookup can use an index',lookup.results.some(row=>/SEARCH k USING.*INDEX/i.test(row.detail)));
  check('ordinary directory, team-application, offer and calendar writes use the website’s single POST',
    ['directory/create','directory/profile','team/apply','team/decide','team/respond','calendar/schedule','calendar/rsvp',
      'calendar/attendance'].every(key=>usedWebWrites.has(key)));
}
