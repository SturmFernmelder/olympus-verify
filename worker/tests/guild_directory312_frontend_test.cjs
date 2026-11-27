// Render the shipped roster route with a signed-in website session and local SQLite.
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const fixture = fs.readFileSync(path.join(__dirname, 'frontend_check.cjs'), 'utf8');
const [setup, ...runs] = fixture.split(/(?=\(async \(\) => \{\r?\n  await siteUser\(MEMBER)/);
if (runs.length !== 1) throw Error('Expected the authenticated website fixture');

async function checkDirectory() {
  const guild='OLYMPUS PRIME', realm='Directory test realm', discordGuild='236932545793490944';
  const options={GUILD_ID:discordGuild,DISCORD_BOT_TOKEN:'fixture-directory-only',ROLE_OFFICER:'1549581672272625734',VERIFY_MEMBERSHIP_ONLY:'true',
    VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild,realm})};
  await siteUser(MEMBER);
  const source=load('./native-rank-schemes').qualifiedNativeSnapshotSource(guild,realm);
  const inserted=await fixtureRun('INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,complete,trusted) VALUES(?,?,?,1,1,1)',now,now,source);
  await fixtureRun('INSERT INTO roster_members(snapshot_id,name_key,name,rank,level,class,guid) VALUES(?,?,?,?,?,?,?)',inserted.lastInsertRowid,'test paladin','Test Paladin','Member',40,'PALADIN','Player-1-0001');
  let officer=false;
  originalTestFetch=async(url,init)=>{
    if (String(url)!=='https://discord.com/api/v10/guilds/'+discordGuild+'/members/'+MEMBER||init.method!=='GET') throw Error('Unexpected local fixture URL');
    return Response.json({user:{id:MEMBER},pending:false,roles:officer?[options.ROLE_OFFICER]:[]});
  };
  stubs['./discord'].rest=realDiscord.rest;
  const client=await openPage(MEMBER,options);
  await client.go('#/guild-rosters');
  const choose=()=>client.app.querySelector('select[aria-label="Guild"]');
  const output=()=>client.app.querySelector('[aria-live="polite"]');
  const option=name=>choose().querySelectorAll('option').find(o=>o.value===name);
  const select=name=>{choose().value=name;fire(choose(),'change');};
  const details=()=>choose().closest('form').querySelector('input[type="checkbox"]');
  await waitFor(()=>output()?.textContent.includes('Test Paladin'),'initial trusted native roster');
  check('the directory labels PRIME and its nine pending branches',option(guild).textContent.includes('Roster available')&&
    choose().querySelectorAll('option').filter(o=>o.textContent.includes('Source pending')).length===9);
  select('Olympus II');
  await waitFor(()=>output().textContent.includes('Olympus II is waiting'),'branch pending status');
  check('switching to a branch clears PRIME names, rank table and pagination',
    !output().textContent.includes('Test Paladin')&&!output().querySelector('table')&&!byText(output(),'button','Next'));
  details().checked=true;fire(details(),'change');
  await waitFor(()=>output().textContent.includes('current officer role'),'basic viewer role readback');
  check('a basic viewer sees the pending branch without an officer setup prompt',!output().textContent.includes('public key')&&!details().checked,output().textContent);
  officer=true;details().checked=true;fire(details(),'change');
  await waitFor(()=>output().textContent.includes('public key'),'officer source prerequisites');
  check('officer guidance identifies the guild, realm, signing observer and complete roster',output().textContent.includes('exact in-game guild and realm')&&
    output().textContent.includes('signing observer')&&output().textContent.includes('complete roster export'),output().textContent);
  select(guild);
  await waitFor(()=>output().textContent.includes('PALADIN'),'officer PRIME roster');
  check('returning to PRIME restores the officer roster and removes the branch instructions',output().textContent.includes('PALADIN')&&
    output().textContent.includes('Test Paladin')&&!output().textContent.includes('public key'));
  await fixtureRun('UPDATE roster_snapshots SET trusted=0 WHERE id=?',inserted.lastInsertRowid);
  select('Olympus II');
  await waitFor(()=>option(guild)?.textContent.includes('Awaiting roster'),'updated source health');
  check('a withdrawn PRIME source updates the selector even while a different guild is selected',
    option(guild).textContent.includes('Awaiting roster')&&option('Olympus II').textContent.includes('Source pending')&&!output().querySelector('table'));
  console.log(n+' roster directory UI checks, '+ok+' passed');process.exitCode=n===ok?0:1;
}
const runner=new Module(__filename,module);
runner.filename=__filename;runner.paths=Module._nodeModulePaths(__dirname);
runner._compile(setup+'\n('+checkDirectory.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',__filename);
