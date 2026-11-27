import { captureGuildActor219 } from '../src/guild-command-authority219';
import { readCalendar219, calendarRoster219, raidCapacityText, attendanceCalendar219 } from '../src/guild-calendar219';
import worker from '../src/index';
import { raidAssignmentChoices307, decideRaidSignup307 } from '../src/guild-roster-decisions307';
import { siteMemberLink, siteEntryReturn, siteReturnLocation } from '../src/site-return';

export async function raidCalendarReadback(base, check, rawDB, ctx) {
  const guild=base.GUILD_ID, me='800000000000000761', peer='800000000000000762', retired='800000000000000763', undecided='800000000000000765';
  const env={...base,SITE_GUILD_ID:guild,INTROS_GUILD_ID:guild,INTROS_CHANNELS:'raid-signups=800000000000000764',COMMUNITY_FEATURES:'events,attendance',COMMUNITY_ORGANIZERS:me};
  const db=env.DB, at=Math.floor(Date.now()/1000);
  const upcoming='u'.repeat(22), past='p'.repeat(22), expired='x'.repeat(22);
  for(const [i,subject] of [me,peer,retired,undecided].entries()){
    await db.batch([
      db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login) VALUES(?1,?2,?3,?3)').bind(subject,'fixture'+i,at),
      db.prepare('INSERT INTO members(discord_id) VALUES(?1)').bind(subject),
      db.prepare("INSERT INTO characters(name_key,name,guid,discord_id,status,bound_at) VALUES(?1,?1,?2,?3,'member',?4)").bind('raider '+i,'Player-87-0000000'+i,subject,at),
    ]);
  }
  await db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',1,?3,?3)").bind(retired,'d'.repeat(32),at).run();
  for(const [id,start,retain] of [[upcoming,at+86400,at+172800],[past,at-86400,at+86400],[expired,at-172800,at-60]]) {
    await db.prepare('INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,capacity,created_by,created_at,updated_at,retain_until) VALUES(?1,?1,?1,?2,60,?3,3,?4,?5,?5,?6)')
      .bind(id,start,start+3600,me,at-200000,retain).run();
  }
  for(const [id,status,decision] of [[me,'yes','accepted'],[peer,'tentative','bench'],[retired,'yes','accepted'],[undecided,'yes',null]]) {
    await db.prepare('INSERT INTO community_event_signups(event_id,discord_id,status,rsvp_starts_at,updated_at,decision) VALUES(?1,?2,?3,?4,?4,?5)').bind(upcoming,id,status,at+86400,decision).run();
  }
  for(const [subject,state] of [[me,'present'],[peer,'excused']]){
    await db.prepare('INSERT INTO community_event_attendance(event_id,discord_id,state,recorded_at) VALUES(?1,?2,?3,?4)').bind(past,subject,state,at).run();
  }
  const actor=await captureGuildActor219(env,{guild_id:guild,member:{user:{id:me}}},at,at);
  const events=await readCalendar219(env,actor);
  check('upcoming raid slots count eligible yes responses, assignments and staff bench separately',events.length===1&&events[0].id===upcoming&&events[0].yes===2&&events[0].accepted===1&&events[0].bench===1&&raidCapacityText(events[0]).includes('1 open signup place · 2 unassigned roster places'));
  const roster=await calendarRoster219(env,actor,upcoming);
  check('officer decisions reach the roster and a retiring signup is withheld',roster.length===3&&roster.some(r=>r.decision==='bench')&&roster.some(r=>r.decision==='accepted'));
  const history=await readCalendar219(env,actor,undefined,1,true);
  check('history excludes upcoming and expired events and returns only this member’s attendance',history.length===1&&history[0].id===past&&history[0].own_attendance==='present'&&!JSON.stringify(history).includes('excused'));
  const ownLink=siteMemberLink(env.SITE_HOST,'community/calendar/'+upcoming+'/roster');
  check('roster deep link survives sign-in and arbitrary subpaths are refused',siteReturnLocation(siteEntryReturn(new URL(ownLink)))==='/#/community/calendar/'+upcoming+'/roster'&&siteEntryReturn(new URL(ownLink+'x'))===null);
  const event=events[0], choose=(who,rev,decision,until=actor.deadline)=>decideRaidSignup307(env,actor,event,until,who,rev,decision);
  const revision=async who=>db.prepare('SELECT decision,decision_revision,status FROM community_event_signups WHERE event_id=?1 AND discord_id=?2').bind(upcoming,who).first();
  const picks=await raidAssignmentChoices307(env,actor,event,actor.deadline,1);
  check('officer picker includes only this event’s eligible signup rows and decision revisions',picks.length===3&&picks.some(x=>x.discord_id===peer&&x.decision==='bench'&&x.decision_revision===0)&&picks.every(x=>x.discord_id!==retired));
  const accepted=await choose(peer,0,'accepted'), read=await revision(peer);
  check('Discord acceptance persists on the original tentative website signup with the next decision revision',accepted&&read.decision==='accepted'&&read.decision_revision===1&&read.status==='tentative');
  check('a reused decision revision cannot overwrite a completed officer assignment',!await choose(peer,0,'bench')&&(await revision(peer)).decision==='accepted');
  check('officer waitlist and clear preserve the RSVP and increment only its decision revision',await choose(peer,1,'bench')&&await choose(peer,2,null)&&(await revision(peer)).decision===null&&(await revision(peer)).decision_revision===3);
  await db.prepare('UPDATE community_events SET capacity=1 WHERE id=?1').bind(upcoming).run();
  check('existing eligible acceptances fill the shared cap and waitlisted members remain eligible for clear',!await choose(undecided,0,'accepted')&&await choose(undecided,0,'bench')&&await choose(undecided,1,null));
  await db.prepare("UPDATE community_event_signups SET status='no' WHERE event_id=?1 AND discord_id=?2").bind(upcoming,peer).run();
  check('a withdrawn RSVP or an expired original control cannot be accepted',!await choose(peer,3,'accepted')&&!await choose(undecided,2,'bench',at));
  check('a target under erasure cannot have their signup changed',!await choose(retired,0,null)&&(await revision(retired)).decision==='accepted');
  await db.batch([db.prepare('UPDATE community_events SET capacity=2 WHERE id=?1').bind(upcoming),
    db.prepare("UPDATE community_event_signups SET status='yes' WHERE event_id=?1 AND discord_id=?2").bind(upcoming,peer)]);
  const competing=await Promise.all([choose(peer,3,'accepted'),choose(undecided,2,'accepted')]);
  check('two concurrent decisions for the final eligible place produce exactly one acceptance',competing.filter(Boolean).length===1&&[await revision(peer),await revision(undecided)].filter(r=>r.decision==='accepted').length===1);
  await db.prepare("UPDATE community_events SET revision=revision+1 WHERE id=?1").bind(upcoming).run();
  check('an event revision changed by the website invalidates the prior Discord control',!await choose(undecided,2,'bench'));
  await db.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(me).run();
  let held=false;try { await readCalendar219(env,actor,undefined,1,true); }catch { held=true; }
  check('a changed account session cannot reuse the old raid history view',held);
  await raidLifecycle(env,rawDB,ctx,me,peer,check);
}

async function raidLifecycle(base,rawDB,ctx,organizer,attendee,check) {
  const env={...base,ROLE_OFFICER:'800000000000000789',DISCORD_CLIENT_SECRET:'directory-client-test-only',
    CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'raid-fixture',timestamp:new Date().toISOString()}};
  const site='https://guild.example', api=(path,init={})=>worker.fetch(new Request(site+path,init),{...env,DB:rawDB},ctx);
  async function cookie(code) {
    const login=await api('/auth/login');
    const state=new URL(login.headers.get('Location')).searchParams.get('state');
    const callback=await api('/auth/callback?code='+code+'&state='+encodeURIComponent(state),{headers:{Cookie:login.headers.get('Set-Cookie').split(';')[0]}});
    const session=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-olg='));
    if(callback.status!==303||!session)throw Error('Raid fixture missing original OAuth session');
    return session.split(';')[0];
  }
  const organizerCookie=await cookie('raid-organizer-test-only'), attendeeCookie=await cookie('raid-attendee-test-only');
  async function page(session,method,path,body) {
    const headers={Cookie:session,Origin:site,'X-Olympus':'2','Content-Type':'application/json'};
    const response=await api('/api/community/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw Error('Raid fixture '+method+' '+path+' returned '+response.status+' '+data.error);
    return data;
  }
  const id='R'.repeat(22),now=Math.floor(Date.now()/1000),startsAt=new Date((now+3600)*1000).toISOString();
  const created=await page(organizerCookie,'POST','events',{opId:id,title:'Cross-surface raid',startsAt,durationMin:60,capacity:1});
  const signup=await page(attendeeCookie,'PUT','events/rsvp',{eventId:id,status:'yes',raidRole:'healer',revision:0});
  const staff=await captureGuildActor219(env,{guild_id:env.GUILD_ID,member:{user:{id:organizer}}},now,now);
  const event=(await readCalendar219(env,staff,id))[0];
  check('website creation and member signup appear on the Discord roster with separate signup and assignment capacity',
    created.event.id===id&&signup.event.mine?.raidRole==='healer'&&event.id===id&&event.yes===1&&event.accepted===0&&event.capacity===1);
  const {ref}=await env.DB.prepare('SELECT ref FROM community_refs WHERE discord_id=?1').bind(attendee).first();
  await page(organizerCookie,'POST','events/decide',{eventId:id,entries:[{ref,revision:0,decision:'bench'}]});
  const waitlist=await calendarRoster219(env,staff,id);
  const accepted=await decideRaidSignup307(env,staff,event,staff.deadline,attendee,1,'accepted');
  const joined=await page(attendeeCookie,'GET','event?id='+id);
  check('website waitlisting and Discord acceptance update the same D1 signup the attendee sees on the site',
    waitlist.length===1&&waitlist[0].decision==='bench'&&accepted===true&&joined.event.mine?.decision==='accepted');

  // Move only this fixture event across its start. Worker and D1 clocks remain real.
  await env.DB.prepare('UPDATE community_events SET starts_at=?1, ends_at=?2 WHERE id=?3').bind(now-60,now+3540,id).run();
  const recorded=await attendanceCalendar219(env,staff,id,'record',attendee,'present');
  const locked=await attendanceCalendar219(env,staff,id,'lock',null,null);
  const later=await attendanceCalendar219(env,staff,id,'record',attendee,'absent');
  const own=await page(attendeeCookie,'GET','attendance/me'),other=await page(organizerCookie,'GET','attendance/me');
  check('Discord attendance lock preserves the recording and personal website history returns only the signed-in account’s rows',
    recorded&&locked&&!later&&own.entries.some(row=>row.event.id===id&&row.state==='present'&&row.source==='officer')
    &&other.entries.every(row=>row.event.id!==id));
}
