// Real browser forms, history and responsive layout of the production raid-teams
// module, using an isolated member/leader model. No production accounts or network.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

async function browserScenario() {
  const {renderRaidTeams,personalTeamAttendanceLabel}=await import('/static/raid-teams.js');
  const base='#/community/raid-teams',teamId='db9d29c6-1311-4fee-82a0-d3dbd670aaa2',eventId='E'.repeat(22);
  const character={name:'Fixture Healer',guid:'Player-87-00000200'};
  const leader={name:'Fixture Lead',guid:'Player-87-00000201'};
  const team={id:teamId,name:'Tuesday Learners',leader:leader.name,philosophy:'Learning',schedule:'Tuesday evenings',timezone:'America/Chicago',
    loot:'Two soft reserves',expectations:'Bring water',status:'recruiting',capacity:20,needs:'Restoration healer',primaryCount:1,reserveCount:0,revision:1};
  let seat,persona='member',answer=null,offerAccepted=0,tepoch=0,scheduled=false;
  const checks=[],assert=(name,v)=>{if(!v)throw Error(name);checks.push(name);},root=document.querySelector('main');
  function h(tag,attrs,...children) {
    const node=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs||{})) {
      if(v==null||v===false)continue;
      if(k==='text')node.textContent=v; else if(k==='class')node.className=v;
      else if(k.startsWith('on'))node.addEventListener(k.slice(2),v);
      else if(k==='value'||k==='selected'||k==='checked'||k==='disabled')node[k]=v;
      else node.setAttribute(k,v===true?'':String(v));
    }
    for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)node.append(child);
    return node;
  }
  const frame=(title,aside,...kids)=>h('section',{class:'card stack'},h('h2',{text:title}),aside,...kids);
  const raid={eventId,title:'BWL healer run',teamName:team.name,groupMask:3,groupLabel:'Groups 1, 2',timezone:'UTC',startsAt:Math.floor(Date.now()/1000)+36000,
    revision:1,status:'scheduled',assemblyMinutes:15,preparation:'Bring a flask',loot:team.loot,expectations:team.expectations};
  raid.endsAt=raid.startsAt+5400;
  const mine=()=>({...raid,answer,canRespond:true,canManage:persona==='leader',rsvpRevision:answer?1:0});
  async function api(method,url,body) {
    const path=url.split('?')[0],manager=persona==='leader';
    if(method==='GET') {
      if(path.endsWith('/my-next-raid')) return {characters:[character],selectedGuid:character.guid,events:scheduled&&seat?.state==='primary'?[mine()]:[],raid:mine(),addonImport:'OLR1|'+character.guid+'|123|1'};
      if(path.endsWith('/calendar'))return {events:scheduled&&seat?.state==='primary'?[mine()]:[],roster:seat?.state==='primary'?[{seatId:seat.id,name:character.name,role:'healer',answer,attendance:null}]:[]};
      if(path.endsWith(teamId))return {team,characters:[manager?leader:character],members:seat?.state==='primary'?[seat]:[],
        applications:manager&&seat?.state==='submitted'?[seat]:[],canManage:manager,isLeader:manager,mine:manager?{id:'s1',role:'tank',state:'primary'}:seat};
      return {teams:[team],players:[],characters:[character],profile:null};
    }
    switch(body.action) {
      case 'apply':if(manager||body.guid!==character.guid||body.role!=='healer')throw Error('wrong applicant');seat={id:'s2',character:character.name,guid:character.guid,role:body.role,note:body.note,revision:1,state:'submitted'};break;
      case 'decide':if(!manager||body.state!=='offered_primary')throw Error('wrong team office');seat.state=body.state;seat.revision++;break;
      case 'respond':if(manager||seat.state!=='offered_primary'||body.state!=='primary')throw Error('wrong self acceptance');seat.state='primary';seat.revision++;team.primaryCount++;offerAccepted++;break;
      case 'schedule':if(!manager||JSON.stringify(body.groups)!=='[1,2]'||body.capacity!==10||body.occurrences!==1)throw Error('wrong subgroup or capacity');scheduled=true;break;
      case 'rsvp':if(manager||seat.state!=='primary'||body.answer!=='late')throw Error('wrong RSVP');answer=body.answer;break;
      default:throw Error('unexpected write '+body.action);
    }
    return {};
  }
  async function draw(){
    const n=++tepoch,parts=location.hash.replace(base,'').split('/').filter(Boolean);
    await renderRaidTeams(root,parts,{h,frame,api,live:()=>n===tepoch,explain:e=>e.message,toast:()=>{}});
  }
  window.addEventListener('hashchange',draw);
  const by=(tag,text)=>[...root.querySelectorAll(tag)].find(el=>el.textContent.trim()===text);
  async function until(f){
    for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}
    throw Error('view did not settle: '+location.hash+' / '+root.innerText.slice(0,180));
  }
  async function click(tag,text,wait){const el=by(tag,text);assert('reachable '+text,!!el);el.click();await until(wait);}
  function fits(){return document.documentElement.scrollWidth<=innerWidth+1;}
  location.replace(base);await draw();
  await until(()=>by('a','View charter and roster'));
  assert('directory fits viewport',fits());
  await click('a','View charter and roster',()=>by('button','Submit application'));
  const apply=root.querySelector('form[aria-label="Apply to Tuesday Learners"]');
  apply.elements.role.value='healer';apply.elements.note.value='Private healer application';
  apply.requestSubmit();await until(()=>root.textContent.includes('Application submitted.'));
  assert('application does not create roster place',seat.state==='submitted'&&offerAccepted===0);
  persona='leader';await draw();
  const decision=root.querySelector('form[aria-label="Review Fixture Healer"]');
  decision.elements.state.value='offered_primary';decision.requestSubmit();await until(()=>seat.state==='offered_primary'&&!root.querySelector('[aria-busy="true"]'));
  assert('offer remains pending own confirmation',team.primaryCount===1&&offerAccepted===0);
  persona='member';await draw();
  assert('member sees own place and no managerial operation',!!by('button','Accept primary place')&&!by('summary','Edit team charter'));
  await click('button','Accept primary place',()=>root.textContent.includes('Roster place confirmed.'));
  assert('one accepted place and no implied RSVP',offerAccepted===1&&answer===null);
  persona='leader';await draw();
  await click('a','Team calendar',()=>by('summary','Schedule a raid'));
  by('summary','Schedule a raid').click();
  const schedule=root.querySelector('form[aria-label="Schedule a team raid"]');
  schedule.elements.title.value='BWL healer run';schedule.elements.localStart.value='2027-03-23T19:00';
  schedule.elements.capacity.value='10';schedule.elements.audience.value='selected';schedule.requestSubmit();
  await until(()=>root.textContent.includes('Choose at least one group to invite.'));
  assert('empty subgroup selection cannot invite whole team',!scheduled);
  for(const box of schedule.querySelectorAll('input[name=groups]'))box.checked=['1','2'].includes(box.value);
  schedule.requestSubmit();await until(()=>scheduled&&!!by('a','Review attendance and responses'));
  assert('leader schedules ten-player evening for two specific parties',root.textContent.includes('Groups 1, 2'));
  persona='member';await draw();await until(()=>by('a','View raid details'));
  assert('ordinary member sees one assigned occurrence and no organizer actions',root.textContent.includes(raid.title)&&!by('summary','Schedule a raid')&&fits());
  await click('a','View raid details',()=>location.hash.endsWith(eventId)&&by('a','All occurrences')&&by('button','Save response'));
  assert('single occurrence hides private manager attendance controls',!by('h3','Responses and attendance')&&!by('summary','Cancel this occurrence'));
  const rsvp=root.querySelector('form[aria-label="RSVP for BWL healer run"]');rsvp.elements.answer.value='late';rsvp.requestSubmit();
  await until(()=>root.textContent.includes('Your response is saved.'));
  assert('explicit healer response shown',root.textContent.includes('Running late')&&answer==='late'&&fits());
  history.back();await until(()=>!location.hash.endsWith(eventId)&&by('a','View raid details'));
  history.forward();await until(()=>location.hash.endsWith(eventId)&&by('a','All occurrences')&&by('button','Save response'));
  assert('back and forward reopen current occurrence',root.textContent.includes('Running late'));
  await click('a','My next raid',()=>root.querySelector('textarea[readonly]'));
  assert('own character schedule is copyable',root.querySelector('textarea[readonly]').value.startsWith('OLR1|'+character.guid)&&fits());
  const heldRow=personalTeamAttendanceLabel(h,{id:null,teamId:null,title:'Private team raid (retained attendance)'});
  const namedRow=personalTeamAttendanceLabel(h,{id:eventId,teamId,title:raid.title});
  assert('a former member sees a retained attendance label without a clickable destination',heldRow.textContent==='Private team raid (retained attendance)'&&heldRow.tagName!=='A'&&!heldRow.querySelector('a'));
  root.appendChild(namedRow);namedRow.click();
  await until(()=>location.hash===base+'/'+teamId+'/calendar/'+eventId&&by('a','All occurrences'));
  assert('a current member opens the matching private occurrence from their named attendance entry',root.textContent.includes(raid.title)&&!!by('button','Save response'));
  return {width:innerWidth,checks};
}

const assets=new URL('../public/static/',import.meta.url);
const candidates=[process.env.OLYMPUS_CHROMIUM,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let executable;
for(const candidate of candidates)try{await fs.access(candidate);executable=candidate;break;}catch{}
assert.ok(executable,'Set OLYMPUS_CHROMIUM to an installed Chromium browser.');
const profiles=await fs.mkdtemp(path.join(os.tmpdir(),'olympus-raid-browser-'));
let complete;
const script='('+browserScenario.toString()+')().then(result=>fetch("/result",{method:"POST",body:JSON.stringify(result)}),err=>fetch("/result",{method:"POST",body:JSON.stringify({error:String(err.stack||err)})}));';
const server=http.createServer(async(req,res)=>{
  if(req.method==='POST'&&req.url==='/result'){
    let text='';for await(const chunk of req)text+=chunk;
    res.end();complete(JSON.parse(text));return;
  }
  if(/^\/viewport\/(390|1440)$/.test(req.url)){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><iframe src="/index.html" title="Raid teams" width="'+req.url.split('/')[2]+'" height="900" frameborder="0"></iframe>');return;
  }
  if(req.url==='/index.html'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; font-src 'none'; img-src 'none'");
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/app.css"><main class="container"></main><script type="module" src="/scenario.js"></script>');return;
  }
  if(req.url==='/scenario.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(script);return;}
  const name={'/static/app.css':'app.css','/static/raid-teams.js':'raid-teams.js'}[req.url];
  if(name){res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');res.end(await fs.readFile(new URL(name,assets)));return;}
  res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  for(const width of [1440,390]){
    let timer;
    const p=new Promise((r,j)=>{complete=r;timer=setTimeout(()=>j(Error('browser workflow timeout')),20000);});
    const browser=spawn(executable,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync',
      '--hide-scrollbars','--window-size='+width+',900','--user-data-dir='+path.join(profiles,String(width)),
      'http://127.0.0.1:'+server.address().port+'/viewport/'+width],{stdio:'ignore',windowsHide:true});
    try{
      const result=await p;
      assert.equal(result.error,undefined,result.error);console.log(JSON.stringify({requestedWidth:width,...result}));
      assert.ok(Math.abs(result.width-width)<=2,'chromium viewport width did not match the intended layout');
    }finally{clearTimeout(timer);browser.kill();await new Promise(r=>browser.exitCode!==null?r():browser.once('exit',r));}
  }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));
  // Only the isolated browser profile made by this test.
  await fs.rm(profiles,{recursive:true,force:true,maxRetries:6,retryDelay:150}).catch(()=>{});}
