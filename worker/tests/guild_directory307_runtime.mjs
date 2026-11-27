import {DEPARTURE_NOTICE_ACCOUNT_SQL} from '../src/role-settlements.ts';
import worker, {isReadOnly} from '../src/index.ts';
import {handleMemberProfile, PROFILE_COMMAND} from '../src/lookup.ts';
import {qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {guildRosterRowsSql} from '../src/guild-roster-directory.ts';

// All accounts, guild members and OAuth responses here belong to the local fixture.
export async function guildDirectoryReadback(base, db, ctx, check) {
  const viewer='800000000000000781', target='800000000000000782', replay='800000000000000783';
  const pending='800000000000000784', absent='800000000000000785', hidden='800000000000000786', officer='800000000000000789';
  const guild='OLYMPUS PRIME', realm='Directory Fixture', at=Math.floor(Date.now()/1000);
  const env={...base,SITE_GUILD_ID:base.GUILD_ID,ROLE_OFFICER:officer,DISCORD_CLIENT_SECRET:'directory-client-test-only',
    CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'directory-fixture',timestamp:new Date().toISOString()},
    VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild,realm})};
  const nativeEnv={...env,DB:db};
  const siteHost='https://guild.example', path='/api/community/guild-rosters';
  const site=(url,headers={})=>worker.fetch(new Request(siteHost+url,{headers}),nativeEnv,ctx);
  const denied=await site(path);
  check('guild roster refuses an unsigned website visitor',denied.status===401);
  const login=await site('/auth/login'), state=new URL(login.headers.get('Location')).searchParams.get('state');
  const callback=await site('/auth/callback?code=directory-test-only&state='+encodeURIComponent(state),
    {Cookie:login.headers.get('Set-Cookie').split(';')[0]});
  const session=callback.headers.getSetCookie().find(x=>x.startsWith('__Host-olg='));
  check('guild roster reader obtains session through the real site OAuth callback',callback.status===303&&!!session,callback.status);
  const page=async(query='')=>{
    const response=await site(path+query,{Cookie:session.split(';')[0]});
    return {body:await response.json(),status:response.status,cache:response.headers.get('Cache-Control')};
  };
  const member=(id,role=[officer])=>({type:2,id:'800000000000000799',guild_id:env.GUILD_ID,application_id:env.DISCORD_APP_ID,token:'directory-ephemeral-test-only',
    member:{user:{id,username:'fixture'},roles:role},data:{name:PROFILE_COMMAND,options:[{name:'member',type:6,value:target}]}});
  const run=async i=>{
    let continuation;
    const response=await handleMemberProfile(env,i,Math.floor(Date.now()/1000),fn=>{continuation=fn;}).json();
    if (response.type!==5 || response.data.flags!==64 || !continuation) throw Error('Missing original private acknowledgement');
    await continuation();
    const receipt=await (await fetch('https://discord.com/__fixture/member-profile')).json();
    return {...receipt.last,flags:response.data.flags};
  };
  const sql=(q,...v)=>v.length?env.DB.prepare(q).bind(...v):env.DB.prepare(q);
  const source=qualifiedNativeSnapshotSource(guild,realm);
  const snapshot=await sql('INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?1,?1,?2,3,1,1) RETURNING id',at,source).first();
  const id=snapshot.id;
  await env.DB.batch([sql('INSERT INTO members(discord_id) VALUES(?1),(?2)',target,hidden),
    sql("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES('directory rune','Directory Rune',?1,'member',?3,'Player-1-101'),('old echo','Old Echo',?2,'member',?3,'Player-1-103')",target,hidden,at),
    sql("INSERT INTO roster_members(snapshot_id,name_key,name,rank,level,class,guid,officer_note) VALUES(?1,'directory rune','Directory Rune','Member',60,'Mage','Player-1-101','PRIVATE NOTE'),(?1,'guild peer','Guild Peer','Initiate',30,'Druid','Player-1-102','PRIVATE NOTE'),(?1,'new echo','New Echo','Veteran',55,'Hunter','Player-1-103','PRIVATE NOTE')",id),
    sql("INSERT INTO site_settings(key,value,updated_at) VALUES('discordDirectoryHidden',?1,?2)",JSON.stringify({[hidden]:'discord-only-optout-v1'}),at)]);
  const initial=await page();
  check('signed-in Discord server member without a guild link sees only character and rank',initial.status===200&&
    initial.body.officer===false&&initial.body.roster?.asOf===at&&initial.cache?.includes('no-store')&&
    JSON.stringify(initial.body.roster.members)==='[{"name":"Directory Rune","rank":"Member"},{"name":"Guild Peer","rank":"Initiate"}]',initial.status);
  const detail=await page('?detail=officer');
  check('current officer receives class and level without notes, GUIDs or Discord IDs',detail.body.officer===true&&
    JSON.stringify(detail.body.roster?.members[0])==='{"name":"Directory Rune","rank":"Member","level":60,"class":"Mage"}'&&
    detail.body.roster.members.length===2);
  check('site roster uses literal search and withholds unapproved branch data',
    (await page('?search=%25')).body.roster.members.length===0&&(await page('?guild=Olympus%20II')).body.roster===null);
  const branch=await page('?guild=Olympus%20II&detail=officer'), branchBasic=await page('?guild=Olympus%20II');
  const primeState=body=>body.sources.find(s=>s.guild===guild)?.status;
  check('a branch visit shows PRIME availability and every pending branch without disclosing any named roster',
    branch.body.officer&&branch.body.roster===null&&branchBasic.body.roster===null&&!branchBasic.body.officer&&
    primeState(branch.body)==='available'&&branch.body.sources.length===10&&
    branch.body.sources.filter(s=>s.guild!==guild).every(s=>s.status==='pending-source')&&
    !JSON.stringify(branch.body).includes('Directory Rune'));
  const spoof=qualifiedNativeSnapshotSource('Olympus II',realm);
  await sql('UPDATE roster_snapshots SET source=?2 WHERE id=?1',id,spoof).run();
  const forged=await page('?guild=Olympus%20II&realm=Directory%20Fixture');
  check('a different guild label on a complete trusted row cannot publish a branch or advertise a working PRIME source',
    forged.body.roster===null&&primeState(forged.body)==='awaiting-roster'&&
    forged.body.sources.find(s=>s.guild==='Olympus II')?.status==='pending-source'&&(await page()).body.roster===null);
  await sql('UPDATE roster_snapshots SET source=?2 WHERE id=?1',id,source).run();
  const self=await run(member(target,[]));
  check('a regular member can view their own linked rank privately with no operational fields',
    self.flags===64&&self.content.includes('Directory Rune')&&self.content.includes('Member')&&
    !self.content.includes('Mage')&&!self.content.includes('level')&&!self.content.includes('/olympus-lookup'));
  const active=member(replay), first=await run(active), second=await run(active);
  check('expired reads cannot schedule a delivery to the old private response',
    (await handleMemberProfile(env,active,at-300,()=>{throw Error('Expired continuation');}).json()).type===4);
  check('Discord profile reruns current role lookup when the same read-only command is delivered again',
    isReadOnly(active)&&first.flags===64&&first.content.includes('Directory Rune')&&first.content.includes('level 60')&&
    second.content.includes('Directory Rune')&&second.content.includes('Member')&&!second.content.includes('Mage')&&
    !second.content.includes('level')&&!first.content.includes('PRIVATE NOTE')&&!first.content.includes('Player-1'));
  check('pending or departed Discord viewers cannot open public profiles',
    !(await run(member(pending))).content.includes('Directory Rune')&&!(await run(member(absent))).content.includes('Directory Rune'));
  check('provider unavailability completes the private response without returning a saved profile',
    (await run(member('800000000000000787'))).content==='Current server membership could not be confirmed.');
  const withoutSignedRole=await run(member(viewer,[]));
  check('signed basic interaction cannot acquire extra fields even when viewer now has an officer role',
    withoutSignedRole.content.includes('Directory Rune')&&!withoutSignedRole.content.includes('Mage'));
  await sql("UPDATE site_settings SET value=?1 WHERE key='discordDirectoryHidden'",JSON.stringify({[target]:'discord-only-optout-v1',[hidden]:'discord-only-optout-v1'})).run();
  check('new target opt-out takes effect on both site and repeat Discord profile without caching',
    (await page()).body.roster.members.length===1&&!(await run(member(viewer))).content.includes('Directory Rune'));
  await sql("UPDATE site_settings SET value='{}' WHERE key='discordDirectoryHidden'").run();
  await env.DB.batch([sql("INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?1,?2,?2,1)",target,at),
    sql("UPDATE members SET banned=1 WHERE discord_id=?1",hidden)]);
  check('denied targets and banned links across renames are withheld even from officers',
    (await page('?detail=officer')).body.roster.members.length===1&&!(await run(member(viewer))).content.includes('Directory Rune'));
  await env.DB.batch([sql('UPDATE site_users SET denied=0 WHERE discord_id=?1',target),
    sql("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',0,?3,?3)",target,'f'.repeat(32),at)]);
  check('retiring target disappears from both current profile surfaces',
    (await page()).body.roster.members.length===1&&!(await run(member(viewer))).content.includes('Directory Rune'));
  await sql("UPDATE privacy_subjects SET state='active' WHERE subject_id=?1",target).run();
  const alts=[];
  for (let n=0;n<51;n++) {
    const name='Directory Character '+String(n).padStart(2,'0'), guid='Player-1-'+(1024+n).toString(16);
    alts.push(sql("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) VALUES(?1,?2,?3,'member',?4,?5)",name.toLowerCase(),name,target,at,guid),
      sql("INSERT INTO roster_members(snapshot_id,name_key,name,rank,level,class,guid) VALUES(?1,?2,?3,'Veteran',60,'Paladin',?4)",id,name.toLowerCase(),name,guid));
  }
  while (alts.length) await env.DB.batch(alts.splice(0,24));
  await sql('UPDATE roster_snapshots SET member_count=54 WHERE id=?1',id).run();
  const many=await run(member(viewer)), nextPage=await page('?page=2');
  check('multiple linked characters fit Discord at complete row boundaries and the site paginates',
    many.content.length<=2000&&many.content.includes('Additional linked characters are omitted.')&&many.content.includes('level 60')&&
    nextPage.body.roster.members.length===3&&nextPage.body.roster.more===false);
  await env.DB.batch([sql("DELETE FROM characters WHERE name_key LIKE 'directory character %'"),
    sql("DELETE FROM roster_members WHERE snapshot_id=?1 AND name_key LIKE 'directory character %'",id),
    sql('UPDATE roster_snapshots SET member_count=3 WHERE id=?1',id)]);
  await sql("UPDATE characters SET guid='Player-1-999' WHERE discord_id=?1",target).run();
  check('Discord profile withholds namesake without a matching native GUID',!(await run(member(viewer))).content.includes('Directory Rune'));
  await sql("UPDATE characters SET guid='Player-1-101',status='left' WHERE discord_id=?1",target).run();
  check('Discord profile withholds characters whose verified link has left',!(await run(member(viewer))).content.includes('Directory Rune'));
  const wrong=qualifiedNativeSnapshotSource(guild,'Other Realm');
  for (const [label,complete,trusted,count,origin] of [['incomplete',0,1,3,source],['untrusted',1,0,3,source],
    ['inconsistent member count',1,1,4,source],['foreign realm',1,1,3,wrong]]) {
    await sql('UPDATE roster_snapshots SET complete=?2,trusted=?3,member_count=?4,source=?5 WHERE id=?1',id,complete,trusted,count,origin).run();
    check('site and Discord withhold '+label+' roster',(await page()).body.roster===null&&(await run(member(viewer))).content.includes('no trusted roster'));
  }
  await sql("UPDATE roster_snapshots SET complete=1,trusted=1,member_count=3,source=?2 WHERE id=?1",id,source).run();
  const numbers="WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<997) ";
  const name="printf('Directory Load %04d',x)", account="printf('810000000000%06d',x)", guid="printf('Player-2-%08X',x)";
  await env.DB.batch([
    sql('INSERT INTO members(discord_id) '+numbers+'SELECT '+account+' FROM n'),
    sql('INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid) '+numbers+
      "SELECT lower("+name+"),"+name+","+account+",'member',?1,"+guid+" FROM n",at),
    sql('INSERT INTO roster_members(snapshot_id,name_key,name,rank,level,class,guid) '+numbers+
      "SELECT ?1,lower("+name+"),"+name+",'Member',60,'Mage',"+guid+" FROM n",id),
    sql('UPDATE roster_snapshots SET member_count=1000 WHERE id=?1',id)]);
  const large=await page('?page=20');
  const statement=guildRosterRowsSql(false,false);
  const plan=await db.prepare('EXPLAIN QUERY PLAN '+statement).bind('%',51,950).all();
  check('1,000-member roster counts actual visible rows and uses the existing open-job subject index',
    large.status===200&&large.body.roster.members.length===49&&large.body.roster.more===false&&
    plan.results.some(r=>r.detail.includes('SEARCH j USING')&&r.detail.includes('privacy_serving_jobs_open'))&&
    !plan.results.some(r=>/\bSCAN j\b/.test(r.detail)));
  const departurePlan=await db.prepare('EXPLAIN QUERY PLAN '+DEPARTURE_NOTICE_ACCOUNT_SQL).bind(viewer,at).all();
  check('1,000-member directory resolves a departure notice using both the account and lifecycle indexes',
    departurePlan.results.some(r=>r.detail.includes('SEARCH c USING INDEX characters_discord'))&&
    departurePlan.results.some(r=>r.detail.includes('SEARCH s USING INDEX'))&&
    !departurePlan.results.some(r=>/\bSCAN (c|s)\b/.test(r.detail)),departurePlan.results.map(r=>r.detail));
  await sql("INSERT INTO members(discord_id,banned) VALUES(?1,1) ON CONFLICT(discord_id) DO UPDATE SET banned=1",viewer).run();
  check('new viewer ban denies the existing site session and the repeat Discord read',
    (await page()).status===403&&(await run(member(viewer))).content.includes('access could not be confirmed'));
  await sql('UPDATE members SET banned=0 WHERE discord_id=?1',viewer).run();
  await sql('UPDATE site_users SET in_server=0 WHERE discord_id=?1',viewer).run();
  check('cached signed site session cannot read after server membership ends',(await page()).status===403);
}
