// Run the shipped calendar UI with its real authenticated Worker and SQLite.
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const fixture = fs.readFileSync(path.join(__dirname, 'frontend_check.cjs'), 'utf8');
const [before, ...runs] = fixture.split(/(?=\(async \(\) => \{\r?\n  await siteUser\(MEMBER)/);
if (runs.length !== 1) throw Error('Expected the standard authenticated frontend fixture.');

async function raidCalendarFrontend() {
  await siteUser(MEMBER, { global_name: 'Tank fixture' });
  await character(MEMBER, 'Tank fixture', 'Player-307-0001');
  await siteUser(OTHER, { global_name: 'Officer fixture' });
  await character(OTHER, 'Officer fixture', 'Player-307-0002');
  await siteUser(DENIED, { global_name: 'Retiring fixture' });
  await character(DENIED, 'Retiring fixture', 'Player-307-0003');
  const eventId = 'u'.repeat(22), pastId = 'p'.repeat(22);
  for (const [id, start, title] of [[eventId, now+86400, 'Upcoming fixture raid'], [pastId, now-86400, 'Past fixture raid']]) {
    await fixtureRun('INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,capacity,created_by,created_at,updated_at,retain_until) VALUES(?,?,?,?,60,?,3,?,?,?,?)',id,id,title,start,start+3600,OTHER,now-172800,now-172800,now+172800);
  }
  for (const [who, answer, decision] of [[MEMBER,'yes','accepted'], [OTHER,'tentative','bench'], [DENIED,'yes','accepted']]) {
    await fixtureRun('INSERT INTO community_event_signups(event_id,discord_id,status,rsvp_starts_at,updated_at,decision) VALUES(?,?,?,?,?,?)',eventId,who,answer,now+86400,now,decision);
  }
  await fixtureRun('INSERT INTO community_refs(discord_id,ref,created_at) VALUES(?,?,?)',MEMBER,'r'.repeat(22),now);
  await fixtureRun("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?,?,'retiring',1,?,?)",DENIED,'e'.repeat(32),now,now);
  const officer = await openPage(OTHER);
  await officer.go('#/community/calendar/'+eventId+'/roster');
  const finder = () => officer.app.querySelector('select[aria-label="Filter roster by officer decision"]');
  await waitFor(finder, 'the linked roster page');
  const panel = finder().closest('section');
  check('exact event roster deep link focuses the signup panel',officer.document.activeElement===panel);
  check('site distinguishes open signup places and open roster places',officer.app.textContent.includes('2 signup places · 2 unassigned roster places'));
  check('retiring members are excluded from the calendar page and its place counts',!panel.textContent.includes('Retiring fixture')&&panel.textContent.includes('1 accepted'));
  const visibleNames = () => panel.querySelectorAll('tbody tr').filter(row=>!row.hidden).map(row=>row.textContent);
  const filter = (key) => {finder().value=key;fire(finder(),'change');};
  filter('bench');
  check('officer waitlist filter shows just benched members',visibleNames().length===1&&visibleNames()[0].includes('Officer fixture'));
  filter('undecided');
  check('an empty decision filter keeps the list and can be cleared',visibleNames().length===0&&panel.textContent.includes('0 matching signups'));
  filter('all');
  check('clearing the filter restores all loaded signups',visibleNames().length===2);
  const tank=panel.querySelectorAll('tbody tr').find(row=>row.textContent.includes('Tank fixture'));
  const pick=tank.querySelector('select[aria-label="Roster decision"]');
  pick.value='bench';fire(pick,'change');byText(tank,'button','Save').click();
  await waitFor(()=>one('SELECT decision FROM community_event_signups WHERE event_id=? AND discord_id=?',eventId,MEMBER).decision==='bench','the website waitlist decision');
  await waitFor(()=>panel.textContent.includes('0 accepted'),'the refreshed assignment count');
  filter('bench');
  check('an accepted member moved to the waitlist by the website appears immediately under the shared filter',visibleNames().length===2&&one('SELECT decision_revision FROM community_event_signups WHERE event_id=? AND discord_id=?',eventId,MEMBER).decision_revision===1);
  await officer.go('#/community/calendar');
  const history = () => byText(officer.app,'button','Recent history');
  await waitFor(history, 'the history range control');history().click();
  await waitFor(()=>!!byText(officer.app,'a','Past fixture raid'), 'past raid history');
  check('recent history switches to past raids',!byText(officer.app,'a','Upcoming fixture raid'));
  console.log(n+' calendar UI checks, '+ok+' passed');process.exitCode=n===ok?0:1;
}
const runner = new Module(__filename,module);
runner.filename=__filename;runner.paths=Module._nodeModulePaths(__dirname);
runner._compile(before+'\n('+raidCalendarFrontend.toString()+')().catch(e=>{console.error(e.stack);process.exitCode=1;});',__filename);
