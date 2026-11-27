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
  const owner={},writes=[];
  let attendanceEnabled=true,refusal=null,refreshes=0,releaseContext,garbleSchedule=true,loseApplication=true;
  let dropDecision=null,missingDecision=false,waitForContext=true;
  let charterRead={},profile=null,profileReply='lost',releaseProfile,offerReply='lost',ownerOnHold=false;
  let charterAccessFixture;
  const acceptedCharter={name:'Café Raiders',philosophy:'Learning',schedule:'Weeknight raids',timezone:'America/Chicago',
    loot:'Two soft reserves',expectations:'',needs:'',status:'recruiting',capacity:20,roleNeeds:[],
    weeklyWindows:[{day:2,start:'19:00',end:'21:00'},{day:2,start:'22:00',end:'01:00'},{day:5,start:'18:00',end:'20:00'}]};
  const decisionReceipts=new Map();
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
    if(refusal?.method===method)throw Object.assign(Error('Review guild membership'),{status:refusal.status,data:{error:'standing_held'}});
    if(method==='GET') {
      const params=new URL(url,location.href).searchParams;
      if(params.has('receipt'))return {operationId:params.get('receipt'),decision:params.get('decision'),
        state:decisionReceipts.has(params.get('receipt'))?'applied':'unrecorded'};
      if(path.endsWith('/my-next-raid')) return {characters:[character],selectedGuid:character.guid,events:scheduled&&seat?.state==='primary'?[mine()]:[],raid:mine(),addonImport:'OLR1|'+character.guid+'|123|1'};
      if(path.endsWith('/calendar'))return {events:scheduled&&seat?.state==='primary'?[mine()]:[],attendanceEnabled,roster:seat?.state==='primary'?[{seatId:seat.id,name:character.name,role:'healer',answer,...(attendanceEnabled?{attendance:null}:{})}]:[]};
      if(path.endsWith(teamId))return {team:{...team,...charterRead},characters:[manager?leader:character],members:seat?.state==='primary'?[seat]:[],
        applications:manager&&seat?.state==='submitted'?[seat]:[],canManage:manager,canViewRoster:manager||seat?.state==='primary',isLeader:manager,ownsCharter:manager||ownerOnHold,mine:manager?{id:'s1',role:'tank',state:'primary'}:seat};
      return {teams:[team],players:[],characters:[character],profile};
    }
    writes.push(JSON.stringify(body));
    if(dropDecision && body.operationId) {
      const kind=body.action==='decide'?'decline':body.action;
      if(kind!==dropDecision)throw Error('Unexpected destructive fixture request');
      if(!missingDecision) {
        decisionReceipts.set(body.operationId,kind);
        if(kind==='transfer')persona='member';else seat.state=kind==='remove'?'withdrawn':'declined';
      }
      dropDecision=null;
      throw Object.assign(Error('Connection closed after dispatch'),{status:0});
    }
    switch(body.action) {
      case 'profile':
        profile={guid:character.guid,revision:body.revision+1,role:body.role,listed:body.listed?1:0,
          playerClass:'Druid',spec:'Restoración',availability:'Evenings',notes:'Bring water'};
        if(profileReply==='lost')throw Object.assign(Error('Lost profile reply'),{status:0});
        await new Promise(resolve=>{releaseProfile=resolve;});break;
      case 'edit':
        if(body.area==='calendar') {
          if(!manager || body.eventId!==raid.eventId)throw Error('wrong occurrence edit');
          Object.assign(raid,{title:'Café practice',preparation:'Bring water\nMeet early',durationMin:body.durationMin,revision:raid.revision+1});
          throw Object.assign(Error('Lost occurrence reply'),{status:0});
        }
        if(!manager || body.area!=='team' || body.teamId!==teamId)throw Error('wrong charter editor');
        Object.assign(team,acceptedCharter,{revision:team.revision+1});
        throw Object.assign(Error('Connection closed after charter save'),{status:0});
      case 'apply':if(manager||body.guid!==character.guid||body.role!=='healer')throw Error('wrong applicant');seat={id:'s2',character:character.name,guid:character.guid,role:body.role,note:'Private healer application Café',revision:1,state:'submitted'};break;
      case 'decide':if(!manager||body.state!=='offered_primary')throw Error('wrong team office');seat.state=body.state;seat.revision++;break;
      case 'respond':
        if(manager||seat.state!=='offered_primary'||body.state!=='primary')throw Error('wrong self acceptance');
        if(offerReply==='lost'){offerReply='conflict';throw Object.assign(Error('Connection lost'),{status:0});}
        if(offerReply==='conflict')throw Object.assign(Error('Schedule conflict'),{status:409,data:{error:'other_primary_commitment'}});
        seat.state='primary';seat.revision++;team.primaryCount++;offerAccepted++;break;
      case 'schedule':if(!manager||JSON.stringify(body.groups)!=='[1,2]'||body.capacity!==10||body.occurrences!==1)throw Error('wrong subgroup or capacity');scheduled=true;break;
      case 'rsvp':if(manager||seat.state!=='primary'||body.answer!=='late')throw Error('wrong RSVP');answer=body.answer;break;
      default:throw Error('unexpected write '+body.action);
    }
    if(body.action==='apply' && loseApplication) {loseApplication=false;throw Object.assign(Error('Network connection closed'),{status:0});}
    if(body.action==='schedule') {
      if(garbleSchedule) {garbleSchedule=false;throw Object.assign(Error('Unreadable response'),{status:201,data:{error:'unreadable_answer'}});}
      return {eventIds:[eventId]};
    }
    if(body.action==='rsvp')throw Object.assign(Error('Saved reply lost'),{status:0});
    return {ok:true};
  }
  async function draw(){
    const n=++tepoch,parts=location.hash.replace(base,'').split('/').filter(Boolean);
    const access=parts[0]==='new' && charterAccessFixture;
    async function charterApi(method,url,...args) {
      access.calls.push({method,path:url.split('?')[0]});
      const outcome=access.outcomes.shift()??200;
      if(outcome==='unreadable')throw Object.assign(Error('Unreadable response'),{status:200,data:{error:'unreadable_answer'}});
      if(outcome!==200)throw Object.assign(Error('Charter access check failed'),{status:outcome});
      return api(method,url,...args);
    }
    await renderRaidTeams(root,parts,{h,frame,api:access?charterApi:api,owner,live:()=>n===tepoch,explain:e=>e.message,
      refreshCommunity:async({live})=>{
        refreshes++;
        if(waitForContext)await new Promise(r=>{releaseContext=r;});
        if(live() && refusal?.status===403) {tepoch++;root.replaceChildren(h('p',{text:'Verify your guild character.'}));}
      }});
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
  await click('a','My raider profile',()=>by('button','Save profile'));
  const profileForm=()=>root.querySelector('form[aria-label="My raider profile"]');
  Object.entries({playerClass:' Druid ',spec:'Restoracio\u0301n ',availability:' Evenings',notes:'  Bring water '})
    .forEach(([key,value])=>{profileForm().elements[key].value=value;});
  profileForm().requestSubmit();await until(()=>by('button','Check the current record'));
  await click('button','Check the current record',()=>root.textContent.includes('The current record confirms'));
  assert('profile readback recognizes normalized fields and a saved false listing flag',profileForm().elements.spec.value==='Restoración' && !profileForm().elements.listed.checked);
  profileReply='delay';profileForm().elements.listed.checked=true;profileForm().requestSubmit();await until(()=>!!releaseProfile);
  await click('a','Find a team',()=>by('a','View charter and roster'));
  history.back();await until(()=>root.textContent.includes('Waiting for the original save response'));
  assert('the replacement profile view blocks writes during the in-flight request',!!profileForm().closest('[inert]')&&!by('button','Retry the same request'));
  releaseProfile();await until(()=>root.textContent.includes('Raider profile saved.') && !root.querySelector('[inert]'));
  assert('the original successful response refreshes and unlocks the mounted view once',profileForm().elements.listed.checked&&writes.filter(s=>JSON.parse(s).action==='profile').length===2);
  await click('a','Find a team',()=>by('a','View charter and roster'));
  await click('a','View charter and roster',()=>by('button','Submit application'));
  const apply=root.querySelector('form[aria-label="Apply to Tuesday Learners"]');
  apply.elements.role.value='healer';apply.elements.note.value=' Private healer application Cafe\u0301 ';
  apply.requestSubmit();await until(()=>by('button','Check the current record'));
  await click('button','Check the current record',()=>root.textContent.includes('The current record confirms'));
  assert('a lost application reply is proved by a fresh read without resubmitting',writes.filter(s=>JSON.parse(s).action==='apply').length===1);
  assert('application does not create roster place',seat.state==='submitted'&&offerAccepted===0);
  persona='leader';await draw();
  const decision=root.querySelector('form[aria-label="Review Fixture Healer"]');
  decision.elements.state.value='offered_primary';decision.requestSubmit();await until(()=>seat.state==='offered_primary'&&!root.querySelector('[aria-busy="true"]'));
  assert('offer remains pending own confirmation',team.primaryCount===1&&offerAccepted===0);
  persona='member';await draw();
  assert('member sees own place and no managerial operation',!!by('button','Accept primary place')&&!by('summary','Edit team charter'));
  await click('button','Accept primary place',()=>by('button','Retry the same request'));
  await click('button','Retry the same request',()=>root.textContent.includes('weekly raid times overlap'));
  assert('a refused replay explains the overlap and keeps the unused offer intact',seat.state==='offered_primary' && !by('button','Stop retrying and reload current access'));
  await click('button','Check the current record',()=>by('button','Stop retrying and reload current access'));
  waitForContext=false;await click('button','Stop retrying and reload current access',()=>root.textContent.includes('You stopped retrying.'));
  assert('stopping an unknown acceptance preserves the refusal and original offer without a third POST',root.textContent.includes('weekly raid times overlap') &&
    writes.filter(s=>JSON.parse(s).action==='respond').length===2 && !root.querySelector('[inert]') && seat.state==='offered_primary');
  waitForContext=true;refreshes=0;offerReply='accept';
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
  schedule.requestSubmit();await until(()=>scheduled && !!by('button','Retry the same request'));
  assert('an unreadable HTTP 201 freezes the original schedule and keeps its status unknown',!!schedule.closest('[inert]') && root.textContent.includes('save result is unknown'));
  schedule.elements.title.value='Changed after the lost answer'; schedule.requestSubmit();
  assert('frozen form cannot submit a replacement operation',writes.filter(s=>JSON.parse(s).action==='schedule').length===1);
  await click('button','Check the current record',()=>root.textContent.includes('does not confirm the original request'));
  assert('an existing similar-looking event does not confirm the original scheduling request',!!by('button','Retry the same request'));
  await click('button','Retry the same request',()=>root.textContent.includes('Raid schedule saved.'));
  const operations=writes.filter(s=>JSON.parse(s).action==='schedule');
  assert('intentional replay preserves exact schedule bytes and the original operation ID',operations.length===2 && operations[0]===operations[1]);
  assert('leader schedules ten-player evening for two specific parties',root.textContent.includes('Groups 1, 2'));
  persona='member';await draw();await until(()=>by('a','View raid details'));
  assert('ordinary member sees one assigned occurrence and no organizer actions',root.textContent.includes(raid.title)&&!by('summary','Schedule a raid')&&fits());
  await click('a','View raid details',()=>location.hash.endsWith(eventId)&&by('a','All occurrences')&&by('button','Save response'));
  assert('single occurrence hides private manager attendance controls',!by('h3','Responses and attendance')&&!by('summary','Cancel this occurrence'));
  const rsvp=root.querySelector('form[aria-label="RSVP for BWL healer run"]');rsvp.elements.answer.value='late';rsvp.requestSubmit();
  await until(()=>by('button','Retry the same request'));
  history.back();await until(()=>!location.hash.endsWith(eventId)&&by('a','View raid details')&&by('button','Check the current record'));
  const sameEvent=root.querySelector('form[aria-label="RSVP for BWL healer run"]');sameEvent.requestSubmit();
  assert('Back to the calendar list preserves the same event hold and prevents a replacement RSVP',!!sameEvent.closest('[inert]')&&writes.filter(s=>JSON.parse(s).action==='rsvp').length===1);
  await click('button','Check the current record',()=>root.textContent.includes('The current record confirms'));
  assert('explicit healer response shown',root.textContent.includes('Running late')&&answer==='late'&&fits());
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
  persona='leader';await draw();by('summary','Edit this occurrence').click();
  const occurrence=root.querySelector('form[aria-label="Edit BWL healer run"]');
  occurrence.elements.title.value='  Cafe\u0301 practice  ';occurrence.elements.timezone.value=' Etc/UTC ';
  occurrence.elements.preparation.value=' Bring water\r\nMeet early  ';occurrence.requestSubmit();await until(()=>by('button','Check the current record'));
  await click('button','Check the current record',()=>root.textContent.includes('The current record confirms'));
  assert('calendar edit readback recognizes normalized title, zone and multiline preparation',!!by('h3','Café practice')&&writes.filter(s=>JSON.parse(s).action==='edit'&&JSON.parse(s).area==='calendar').length===1);
  raid.startsAt=Math.floor(Date.now()/1000)-100;attendanceEnabled=false;await draw();
  assert('disabled attendance omits states and recording controls but retains member responses',
    !!by('h3','Responses') && !by('dt','Attendance') && !by('button','Save attendance') && root.textContent.includes('Running late'));
  attendanceEnabled=true;await draw();
  assert('enabled attendance allows team managers to record participation after the start',!!by('button','Save attendance'));
  location.hash=base+'/'+teamId;await until(()=>by('button','Confirm transfer to '+character.name));
  persona='member';ownerOnHold=true;await draw();
  assert('charter owner on verification hold sees the transfer requirement and cannot leave or manage',root.textContent.includes('Restore verification of its founding character') && !by('button','Confirm leave team') && !by('summary','Edit team charter'));
  ownerOnHold=false;await draw();assert('a regular primary member can still leave',!!by('button','Confirm leave team'));
  persona='leader';await draw();
  by('summary','Edit team charter').click();
  const edit=root.querySelector('form[aria-label="Edit charter"]');
  Object.entries({name:'  Cafe\u0301 Raiders  ',schedule:'  Weeknight raids ',timezone:' US/Central ',loot:' Two soft reserves ',expectations:'   ',needs:''})
    .forEach(([key,value])=>{edit.elements.namedItem(key).value=value;});
  const enteredWindows=[acceptedCharter.weeklyWindows[2],acceptedCharter.weeklyWindows[1],acceptedCharter.weeklyWindows[0]];
  enteredWindows.forEach((w,i)=>{
    [...edit.querySelectorAll('button')].find(el=>el.textContent==='Add weekly time').click();
    edit.elements['windowDay'+(i+1)].value=String(w.day);edit.elements['windowStart'+(i+1)].value=w.start;edit.elements['windowEnd'+(i+1)].value=w.end;
  });
  edit.requestSubmit();await until(()=>by('button','Check the current record'));
  const frozenEdit=writes.at(-1),original=JSON.parse(frozenEdit);
  assert('the submitted charter preserves its input order, decomposed text and time-zone alias',JSON.stringify(original.weeklyWindows)===JSON.stringify(enteredWindows) &&
    original.name==='  Cafe\u0301 Raiders  ' && original.timezone===' US/Central ' && original.expectations==='   ');
  for(const alternate of [{weeklyWindows:acceptedCharter.weeklyWindows.map((w,i)=>i===1?{...w,end:'02:00'}:w)},
      {timezone:'America/Denver'},{loot:'One soft reserve'},{roleNeeds:['healer']},{capacity:21},{status:'full'},{revision:original.revision}]) {
    charterRead=alternate;
    const previous=by('button','Check the current record');previous.click();
    await until(()=>!previous.isConnected && root.textContent.includes('does not confirm the original request'));
    assert('charter readback refuses a different '+Object.keys(alternate)[0],!!by('button','Retry the same request'));
  }
  charterRead={};await click('button','Check the current record',()=>root.textContent.includes('The current record confirms'));
  assert('canonical windows, trimmed NFC text, empty optional values and IANA aliases confirm one edit',writes.at(-1)===frozenEdit &&
    writes.filter(s=>JSON.parse(s).area==='team' && JSON.parse(s).action==='edit').length===1 && !root.querySelector('[inert]') && !by('button','Retry the same request'));
  for(const kind of ['transfer','remove','decline','missing']) {
    persona='leader';seat.state=kind==='decline'||kind==='missing'?'submitted':'primary';
    await draw();
    const before=writes.length;
    dropDecision=kind==='missing'?'decline':kind;
    missingDecision=kind==='missing';
    if(dropDecision==='decline') {
      const decision=root.querySelector('form[aria-label="Review Fixture Healer"]');
      decision.elements.state.value='declined';decision.requestSubmit();
    } else {
      by('button',kind==='transfer'?'Confirm transfer to '+character.name:'Confirm removal of '+character.name).click();
    }
    await until(()=>by('button','Check the current record'));
    await click('button','Check the current record',()=>kind==='missing'?by('button','Stop retrying and reload current access'):
      root.textContent.includes('The original decision was recorded.'));
    if(kind==='missing') {
      waitForContext=false;
      await click('button','Stop retrying and reload current access',()=>root.textContent.includes('You stopped retrying.'));
      waitForContext=true;refreshes=0;
    }
    assert('lost '+kind+' is resolved without a second mutation or a stuck form',
      writes.length===before+1 && !root.querySelector('[inert]') && !by('button','Retry the same request'));
  }
  missingDecision=false;
  seat.state='submitted';await draw();await until(()=>by('button','Save decision'));
  refusal={method:'POST',status:403};
  root.querySelector('form[aria-label="Review Fixture Healer"]').requestSubmit();
  await until(()=>refreshes===1 && releaseContext);
  assert('403 clears private application notes and management controls before access refresh completes',
    !root.textContent.includes('Private healer application') && !by('button','Save decision'));
  releaseContext();await until(()=>root.textContent.includes('Verify your guild character.'));
  refusal={method:'GET',status:503}; releaseContext=undefined;
  const accessRead=draw();await until(()=>refreshes===2 && releaseContext);
  assert('a 503 roster read clears private data and refreshes the community context',!by('button','Save decision') && !root.textContent.includes('Private healer application'));
  releaseContext();await accessRead;
  waitForContext=false;refusal=null;
  function trackCharter(...outcomes) {
    charterAccessFixture={outcomes,calls:[]};
    return charterAccessFixture;
  }
  const onlyAccessReads=(fixture,count)=>fixture.calls.length===count &&
    fixture.calls.every(c=>c.method==='GET' && c.path==='/api/community/raid-teams');
  const publish=()=>by('button','Publish charter');
  const retry=()=>by('button','Check current access');
  const charterStatus=()=>root.querySelector('[role="status"]')?.textContent;
  const loadedCharter=()=>publish() && !retry() && !charterStatus() &&
    root.querySelector('form[aria-label="Create a raid team"]').elements.guid.value===character.guid;
  const initial=trackCharter(503,200), beforeRetry=writes.length;
  location.hash=base+'/new';
  await until(()=>initial.calls.length===1 && charterStatus());
  const charterView=tepoch;
  assert('the first temporary charter refusal gives feedback while the form and manual retry are unavailable',!publish() && !retry());
  await until(loadedCharter);
  assert('the charter recovers automatically, clears its warning and keeps the same page',tepoch===charterView && onlyAccessReads(initial,2));
  for(const fault of [0,524,'unreadable']) {
    const recovered=trackCharter(fault,200);
    await draw();await until(loadedCharter);
    assert('a temporary '+fault+' read also reopens the charter automatically',onlyAccessReads(recovered,2));
  }

  const persistent=trackCharter(503,503,503,200);
  await draw();await until(retry);
  assert('two transient failures leave the manual retry available and the charter closed',
    onlyAccessReads(persistent,2) && !publish() && !!charterStatus());
  await click('button','Check current access',()=>retry() && persistent.calls.length>=3);
  // Leave enough time for another automatic attempt to expose an accidental polling loop.
  await new Promise(resolve=>setTimeout(resolve,1500));
  assert('a failed manual access check stays manual',onlyAccessReads(persistent,3) && !!retry() && !publish());
  const manualView=tepoch;
  await click('button','Check current access',loadedCharter);
  assert('successful manual recovery immediately clears the warning on the same mounted page',
    onlyAccessReads(persistent,4) && manualView===tepoch);

  for(const status of [401,403,429]) {
    const denied=trackCharter(status);
    await draw();await until(retry);
    assert('a '+status+' refusal allows manual recovery without an automatic GET',onlyAccessReads(denied,1) && !publish());
  }
  const leaving=trackCharter(503);
  const staleView=draw();
  await until(()=>leaving.calls.length===1 && charterStatus() && !retry());
  await click('a','Find a team',()=>by('a','View charter and roster'));
  await staleView;
  await new Promise(resolve=>setTimeout(resolve,1500));
  assert('leaving before the scheduled retry prevents the old request and preserves the directory',
    onlyAccessReads(leaving,1) && !!by('a','View charter and roster') && !retry());
  assert('automatic and manual access recovery sent no writes',writes.length===beforeRetry);
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
