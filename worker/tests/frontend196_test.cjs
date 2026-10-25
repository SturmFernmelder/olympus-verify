// Current app + real Worker/SQLite admission. DTO substitution qualifies presentation only.
const fs196=require('node:fs'), path196=require('node:path'), {Module}=require('node:module');
const fixture196=fs196.readFileSync(path196.join(__dirname,'frontend_check.cjs'),'utf8');
const starts196=[...fixture196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(starts196.length!==1)throw Error('One actual frontend fixture boundary required');
const body196=String.raw`
(async()=>{
  await siteUser(MEMBER,{global_name:'Mia'}); await character(MEMBER,'Mia One','Player-1-0001');
  await siteUser(OTHER,{global_name:'Oz'}); await character(OTHER,'Oz Two','Player-1-0002');
  await siteUser(STAFF,{global_name:'Vik'});
  await fixtureRun("INSERT INTO site_settings(key,value,updated_at) VALUES('newsOn','true',?) ON CONFLICT(key) DO UPDATE SET value='true'",now);
  const member=await openPage(MEMBER), staff=await openPage(STAFF);
  const archive=byText(member.app,'h2','Beta Epoch Archive')?.closest('section');
  check('archive contains published nonpersonal dates and disclaims member records',!!archive && archive.textContent.includes('21 October 2026') && archive.textContent.includes('no former-member roster') && !archive.textContent.includes('Mia One'));
  check('unappointed member has no Stream Shield affordance',!byText(member.app,'button','Stream Shield'));
  const shield=byText(staff.app,'button','Stream Shield'), commands=[];
  staff.before((pathname,init)=>{if((init.method||'GET')!=='GET')commands.push(pathname);return false;});
  check('administrator has an explicitly reversible shield button',!!shield && shield.getAttribute('aria-pressed')==='false');
  shield.click();
  check('shield only masks presentation without a provider or API command',staff.document.documentElement.getAttribute('data-stream-shield')==='on' && shield.getAttribute('aria-pressed')==='true' && commands.length===0);
  shield.click();
  check('second attended action restores the normal view',staff.document.documentElement.getAttribute('data-stream-shield')==='off');
  await staff.go('#/admin/settings');
  await waitFor(()=>!!staff.app.querySelector('[data-appointment-status="office_95"]'),'all offices rendered');
  check('all131 stable office and rank keys have a real Discord picker',staff.boot.meta.appointments.length===131 && staff.app.querySelectorAll('.appointed-row').length===131 && staff.app.querySelectorAll('.appointed-row [role="combobox"]').length===131);
  check('expanded picker consent does not confer native, bank or signer authority',staff.app.textContent.includes('do not change Discord roles, native ranks, bank access or signing authority'));
  check('annual member intent renewal is visible with exact application and date',staff.app.textContent.includes('1550176895671341076') && staff.app.textContent.includes('2027-10-23'));
  check('dormant Battle.net collection exposes no future enable checkbox',!staff.app.querySelector('#bnet-switch'));
  await member.go('#/apply');
  check('application form offers a private bounded talent attachment',!!member.app.querySelector('[data-field="talentBuild"] input[maxlength="512"]'));
  const api196=load('./site-api'), talent196=JSON.parse(fs.readFileSync(path.join(root,'public/static/talents/data.json')));
  const warrior196=talent196.classes.find(c=>c.id==='warrior');
  const code196='ot1.260cf99b52db.warrior.60.'+'0'.repeat(warrior196.trees.flatMap(t=>t.talents).length);
  const application196={position:'member',backups:[],class:'warrior',role:'dps',region:'eu',character:'',avail:'f'.repeat(42),availTz:'Europe/Stockholm',ack:true,board:false,answers:{experience:'A deliberately fictional application.',why:'Joining this fictional test guild.',voice:'listen',talentBuild:'https://guild.example/#/talents/warrior/'+code196}};
  const valid196=api196.validateApplication(application196,MEMBER,{},[],'guild.example');
  check('real application validator stores the code without the URL',!valid196.error && JSON.parse(valid196.answers).talentBuild===code196 && !valid196.answers.includes('https://'));
  const wrong196=api196.validateApplication({...application196,class:'mage'},MEMBER,{},[],'guild.example');
  check('a valid build for another selected class is refused',wrong196.field==='talentBuild');
  const hostile196=api196.validateApplication({...application196,answers:{...application196.answers,talentBuild:'https://untrusted.example/#/talents/warrior/'+code196}},MEMBER,{},[],'guild.example');
  check('application validation rejects a foreign URL without fetching it',hostile196.field==='talentBuild');
  const directory=await openPage(MEMBER), avatar='https://cdn.discordapp.com/embed/avatars/3.png';
  let reads196=0;
  directory.answer(pathname=>{
    if(pathname!=='/api/community/discord-directory')return null;
    reads196++;
    return {source:'discord_members',generatedAt:new Date(now*1000).toISOString(),members:[{ref:'opaque-a',displayName:'Mia',username:'mia',avatarUrl:avatar,roles:['Guild Member'],verifiedCharacters:[{name:'Mia One',status:'member'}]},{ref:'opaque-b',displayName:'Other Display',username:'other.user',avatarUrl:'https://untrusted.example/private.png',roles:[],verifiedCharacters:[]}],nextCursor:null,complete:true,traversal:{atomicSnapshot:false,expiresAt:new Date(Date.now()+60000).toISOString()}};
  });
  await directory.go('#/community/directory');
  await waitFor(()=>directory.app.textContent.includes('End of this traversal.'),'directory DTO render');
  const cards196=directory.app.querySelectorAll('.card.member');
  check('current Discord directory shows members and only nondeduplicated usernames',cards196.length===2 && cards196[0].textContent.includes('Mia') && !cards196[0].textContent.includes('(mia)') && cards196[1].textContent.includes('Other Display (other.user)'));
  check('permitted public roles and published character names are rendered',cards196[0]?.textContent.includes('Guild Member') && cards196[0]?.textContent.includes('Mia One · verified character'));
  check('directory portraits retain closed CDN validation and no-referrer',cards196[0]?.querySelector('img').getAttribute('src')===avatar && cards196[0]?.querySelector('img').getAttribute('referrerpolicy')==='no-referrer' && cards196[1]?.querySelector('img').getAttribute('src')==='/static/wow/pos-member.png');
  check('directory makes traversal and changing membership explicit',reads196===1 && directory.app.textContent.includes('not an atomic roster snapshot'));
  await waitFor(()=>!!directory.app.querySelector('#discord-directory-listed'),'own visibility control');
  const listed196=directory.app.querySelector('#discord-directory-listed');
  check('own directory visibility defaults listed with a separate explicit opt-out',listed196.checked===true && directory.app.textContent.includes('additional profile details remain a separate opt-in'));
  listed196.checked=false; byText(directory.app,'button','Save my listing preference').click();
  await waitFor(()=>directory.app.textContent.includes('Earlier reader copies cannot be recalled.'),'explicit opt-out save');
  check('explicit directory opt-out commits through the real own-only Worker path',listed196.checked===false && directory.app.textContent.includes('Your whole directory row is hidden.'));
  directory.document.hidden=true; directory.document.dispatchEvent(new Event('visibilitychange'));
  check('hiding the directory clears member cards immediately',directory.app.querySelectorAll('.card.member').length===0);
  const malformed196=await openPage(MEMBER);
  malformed196.answer(pathname=>pathname==='/api/community/discord-directory'?{members:[],nextCursor:null,complete:true,generatedAt:new Date().toISOString()}:null);
  await malformed196.go('#/community/directory');
  await waitFor(()=>malformed196.app.textContent.includes('response could not be read'),'malformed directory refusal');
  check('a DTO missing its source cannot assert an empty complete directory',malformed196.app.textContent.includes('response could not be read') && !malformed196.app.textContent.includes('End of this traversal.'));
  const late196=await openPage(MEMBER);
  late196.answer(pathname=>pathname==='/api/community/discord-directory'?{source:'discord_members',generatedAt:new Date().toISOString(),members:[{ref:'late',displayName:'Late member',username:'late',roles:[],verifiedCharacters:[]}],nextCursor:null,complete:true}:null);
  late196.hold(pathname=>pathname.startsWith('/api/community/discord-directory')?50:0);
  await late196.go('#/community/directory'); await late196.go('#/roles');
  await new Promise(resolve=>setTimeout(resolve,80));
  check('a departed directory reply cannot populate another route',!late196.app.textContent.includes('Late member') && late196.document.title==='Roles — Olympus');
  // Additional presentation-only fixtures: actual app/Worker owner and timer paths,
  // substituted bounded directory DTOs. No real guild traversal is claimed.
  const traversal196=await openPage(MEMBER);let traversalReads196=0;
  const traversalReply196=(count,complete=false)=>({source:'discord_members',generatedAt:new Date().toISOString(),members:[{ref:'traversal-'+count,displayName:'Traversal '+count,username:'traversal.'+count,roles:['Guild Member'],verifiedCharacters:[]}],nextCursor:complete?null:'cursor-'+count,complete,traversal:{atomicSnapshot:false,expiresAt:new Date(Date.now()+60000).toISOString()}});
  traversal196.answer(p=>p.startsWith('/api/community/discord-directory')&&!p.includes('/visibility')?traversalReply196(++traversalReads196,traversalReads196===3):null);
  await traversal196.go('#/community/directory');await waitFor(()=>traversalReads196===1&&!byText(traversal196.app,'button','Load all eligible Olympus members').hidden,'explicit traversal control');
  check('opening the directory does not automatically enumerate the remaining source',traversalReads196===1);
  byText(traversal196.app,'button','Load all eligible Olympus members').click();
  await waitFor(()=>traversalReads196===3&&traversal196.app.textContent.includes('End of this traversal.'),'explicit paced continuation completes');
  check('explicit continuation renders each bounded page and stops at confirmed completion',traversal196.app.querySelectorAll('.card.member').length===3&&byText(traversal196.app,'button','Load all eligible Olympus members').hidden);
  await traversal196.go('#/roles');
  for(const boundary196 of ['pause','hidden','route']) {
    const page=await openPage(MEMBER);let readN=0;
    page.answer(p=>p.startsWith('/api/community/discord-directory')&&!p.includes('/visibility')?traversalReply196(++readN):null);
    await page.go('#/community/directory');await waitFor(()=>readN===1&&!byText(page.app,'button','Load all eligible Olympus members').hidden,'traversal boundary initial '+boundary196);
    byText(page.app,'button','Load all eligible Olympus members').click();await waitFor(()=>readN===2&&!!byText(page.app,'button','Pause loading remaining members'),'traversal boundary second '+boundary196);
    if(boundary196==='pause')byText(page.app,'button','Pause loading remaining members').click();
    else if(boundary196==='hidden'){page.document.hidden=true;page.document.dispatchEvent(new Event('visibilitychange'));}
    else await page.go('#/roles');
    await new Promise(resolve=>setTimeout(resolve,1850));
    check('explicit continuation stops at '+boundary196+' without another provider-page request',readN===2&&(boundary196!=='hidden'||page.app.querySelectorAll('.card.member').length===0)&&(boundary196!=='route'||!page.app.textContent.includes('Traversal 2')));
    if(boundary196!=='route')await page.go('#/roles');
  }
  const attended196=await openPage(STAFF),attendedRequests196=[],attendedId196='730000000000000101';
  attended196.before((p,init)=>{if(p.startsWith('/api/admin/discord-directory/'))attendedRequests196.push({path:p,method:init.method,body:JSON.parse(init.body)});return false;});
  attended196.answer(p=>p==='/api/admin/discord-directory/status'?{discordId:attendedId196,listed:true,restoreAllowed:true,visibilityOrigin:'attended_request'}:p==='/api/admin/discord-directory/visibility'?{discordId:attendedId196,listed:false}:null);
  await attended196.go('#/admin/directory-visibility');
  const attendedTarget196=attended196.app.querySelector('#attended-directory-id'),attendedSave196=byText(attended196.app,'button','Save requested listing preference');
  check('attended preference page sends no command on entry and requires an exact-ID read',attendedRequests196.length===0&&attendedSave196.disabled);
  attendedTarget196.value=attendedId196;attendedTarget196.dispatchEvent(new Event('input'));byText(attended196.app,'button','Read this member’s preference').click();
  await waitFor(()=>attended196.app.textContent.includes('The eligible Olympus row can be listed.'),'attended exact-ID status');
  check('an attended status read alone cannot enable a listing write',attendedSave196.disabled&&attendedRequests196.length===1&&attendedRequests196[0].path.endsWith('/status'));
  attended196.app.querySelector('#attended-directory-listed').checked=false;const requestConsent196=attended196.app.querySelector('#attended-directory-confirmed');requestConsent196.checked=true;requestConsent196.dispatchEvent(new Event('change'));attendedSave196.click();
  await waitFor(()=>attended196.app.textContent.includes('no website account was created.'),'explicit attended preference save');
  check('attended save carries exact target, requested preference and explicit confirmation once',attendedRequests196.length===2&&attendedRequests196[1].method==='POST'&&JSON.stringify(attendedRequests196[1].body)===JSON.stringify({discordId:attendedId196,listed:false,requestConfirmed:true})&&attendedSave196.disabled&&!requestConsent196.checked);
  await attended196.go('#/roles');
  const attendedLate196=await openPage(STAFF),lateRequests196=[];
  attendedLate196.before((p,init)=>{if(p.startsWith('/api/admin/discord-directory/'))lateRequests196.push({path:p,method:init.method,body:JSON.parse(init.body)});return false;});
  attendedLate196.answer(p=>p==='/api/admin/discord-directory/status'?{discordId:attendedId196,listed:true,restoreAllowed:true,visibilityOrigin:'attended_request'}:null);attendedLate196.hold(p=>p==='/api/admin/discord-directory/status'?180:0);
  await attendedLate196.go('#/admin/directory-visibility');const lateTarget196=attendedLate196.app.querySelector('#attended-directory-id'),lateListed196=attendedLate196.app.querySelector('#attended-directory-listed'),lateConfirmed196=attendedLate196.app.querySelector('#attended-directory-confirmed'),lateSave196=byText(attendedLate196.app,'button','Save requested listing preference');
  lateTarget196.value=attendedId196;lateTarget196.dispatchEvent(new Event('input'));byText(attendedLate196.app,'button','Read this member’s preference').click();
  check('pending attended status locks target, desired preference and confirmation',lateTarget196.disabled&&lateListed196.disabled&&lateConfirmed196.disabled&&lateSave196.disabled);
  // Programmatic edits exercise the generation guard even though actual controls are disabled.
  lateTarget196.value='730000000000000103';lateTarget196.dispatchEvent(new Event('input'));lateTarget196.value=attendedId196;lateTarget196.dispatchEvent(new Event('input'));lateListed196.checked=false;lateListed196.dispatchEvent(new Event('change'));
  await new Promise(resolve=>setTimeout(resolve,230));
  // The held response starts its180ms wait only after the real Worker completes.
  // Observe the actual original handler's release before judging a stale reply or starting another read.
  if(!await waitFor(()=>!lateTarget196.disabled&&lateListed196.disabled&&lateConfirmed196.disabled&&!byText(attendedLate196.app,'button','Read this member’s preference').disabled,'stale attended read releases target/read only; unqualified preference controls remain disabled'))throw Error('Original stale attended read did not finish');
  check('late A read cannot revive an A-to-B-to-A target or overwrite its desired preference',lateRequests196.length===1&&lateSave196.disabled&&lateListed196.checked===false&&!lateConfirmed196.checked&&!attendedLate196.app.textContent.includes('The eligible Olympus row can be listed.'));
  attendedLate196.hold(null);byText(attendedLate196.app,'button','Read this member’s preference').click();if(!await waitFor(()=>attendedLate196.app.textContent.includes('The eligible Olympus row can be listed.'),'fresh attended read after stale generation'))throw Error('Fresh exact attended read did not return');
  lateConfirmed196.checked=true;lateConfirmed196.dispatchEvent(new Event('change'));check('fresh confirmation is bound to the exact returned target and preference',!lateSave196.disabled&&lateTarget196.value===attendedId196&&lateListed196.checked===true&&lateConfirmed196.checked&&lateRequests196.length===2&&lateRequests196.every(request=>request.path==='/api/admin/discord-directory/status'&&request.method==='POST'&&JSON.stringify(request.body)===JSON.stringify({discordId:attendedId196})));
  lateListed196.checked=false;lateListed196.dispatchEvent(new Event('change'));check('changing requested preference invalidates the earlier confirmation',lateSave196.disabled&&!lateConfirmed196.checked&&lateRequests196.length===2);
  await attendedLate196.go('#/roles');
  const workshop=await openPage(MEMBER); await workshop.go('#/community/workshop');
  check('workshop reuses real recipe search with accurate listing provenance',workshop.app.textContent.includes('Crafters & Artisans Workshop') && workshop.app.textContent.includes('Offers and rarity are member supplied') && !!workshop.app.querySelector('input[type="search"]'));
  const treasury196=await openPage(STAFF), treasuryCommands196=[], op196='1'.repeat(32);
  treasury196.before((p,init)=>{if(p.startsWith('/api/admin/treasury/'))treasuryCommands196.push({path:p,method:init.method,body:init.body?JSON.parse(init.body):null});return false;});
  treasury196.answer(p=>p.startsWith('/api/search?')?{results:[{id:OTHER,label:'Oz',shown:'Oz',onSite:true,appointmentStatus:'eligible'}]}:p==='/api/admin/treasury/target'?{discordId:OTHER,mailReference:'TITHE-ABCD-2345'}:p==='/api/admin/treasury/preview'?{token:'synthetic-ui-preview-only',expiresAt:Math.floor(Date.now()/1000)+180,qualifyingGold:25,seasonEndsAt:Math.floor(Date.now()/1000)+86400,dispatchEnabled:true,recognitionConsent:true,recognitionMode:'recognize',changes:[{operationId:op196,roleId:'123456789012345678',label:'Tithe Payer',desired:1}]}:p==='/api/admin/treasury/confirm'?{state:'unknown'}:p==='/api/admin/treasury/status'?{operation:{id:op196,state:'unknown',reason:'synthetic-ui-outcome',attempts:1},noRetry:true}:null);
  await treasury196.go('#/admin/treasury');
  check('opening Treasury renders the seasonal tiers without issuing a command',treasuryCommands196.length===0 && treasury196.app.textContent.includes('Tithe Payer 25g+') && treasury196.app.textContent.includes('no channel access, votes, office or immunity'));
  const treasurySearch196=treasury196.app.querySelector('.picker input[role="combobox"]'); treasurySearch196.value='Oz'; treasurySearch196.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));
  await waitFor(()=>!!treasury196.app.querySelector('[role="option"]'),'Treasury current member lookup');
  treasury196.app.querySelector('[role="option"]').dispatchEvent(new Event('mousedown',{bubbles:true}));
  byText(treasury196.app,'button',"Read member's TITHE reference").click();
  await waitFor(()=>treasury196.app.querySelector('#treasury-mail').value==='TITHE-ABCD-2345','Treasury read-only reference');
  check('reading a Treasury reference sends only the selected account to the bound target reader',treasuryCommands196.length===1 && treasuryCommands196[0].path.endsWith('/target') && treasuryCommands196[0].body.discordId===OTHER);
  const recognition196=treasury196.app.querySelector('#treasury-recognition');recognition196.checked=true;recognition196.dispatchEvent(new Event('change'));
  byText(treasury196.app,'button','Preview cosmetic role changes').click();
  await waitFor(()=>!!byText(treasury196.app,'button','Grant Tithe Payer'),'Treasury preview-only renderer');
  const grant196=byText(treasury196.app,'button','Grant Tithe Payer');
  check('a role preview is inert until its separate exact-change confirmation',grant196.disabled && treasuryCommands196.filter(x=>x.path.endsWith('/confirm')).length===0);
  const exact196=grant196.parentNode.querySelector('input[type="checkbox"]');exact196.checked=true;exact196.dispatchEvent(new Event('change'));grant196.click();grant196.click();
  await waitFor(()=>treasury196.app.textContent.includes('Read its status; do not send it again.'),'Treasury unknown outcome');
  check('one deliberate confirmation sends the original bound token and operation once',treasuryCommands196.filter(x=>x.path.endsWith('/confirm')).length===1 && treasuryCommands196.find(x=>x.path.endsWith('/confirm')).body.token==='synthetic-ui-preview-only' && treasuryCommands196.find(x=>x.path.endsWith('/confirm')).body.operationId===op196);
  byText(treasury196.app,'button','Read original operation status').click();
  await waitFor(()=>treasury196.app.textContent.includes('synthetic-ui-outcome'),'Treasury original status');
  check('an unknown role outcome permits status reads but keeps new previews held',byText(treasury196.app,'button','Preview cosmetic role changes').disabled && treasuryCommands196.filter(x=>x.path.endsWith('/confirm')).length===1);
  const racingTreasury196=await openPage(STAFF), racingCommands196=[];
  racingTreasury196.before((p,init)=>{if(p.startsWith('/api/admin/treasury/'))racingCommands196.push({path:p,body:JSON.parse(init.body)});return false;});
  racingTreasury196.answer(p=>p.startsWith('/api/search?')?{results:[{id:OTHER,label:'Target A',shown:'Target A',onSite:true,appointmentStatus:'eligible'},{id:MEMBER,label:'Target B',shown:'Target B',onSite:true,appointmentStatus:'eligible'}]}:p==='/api/admin/treasury/preview'?{token:'old-target-preview',expiresAt:Math.floor(Date.now()/1000)+180,qualifyingGold:25,seasonEndsAt:Math.floor(Date.now()/1000)+86400,dispatchEnabled:true,recognitionConsent:true,recognitionMode:'recognize',changes:[{operationId:op196,roleId:'123456789012345678',label:'Stale target tier',desired:1}]}:null);
  await racingTreasury196.go('#/admin/treasury');
  const pickRace196=async index=>{const input=racingTreasury196.app.querySelector('.picker input[role="combobox"]');input.value='Target';input.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));await waitFor(()=>racingTreasury196.app.querySelectorAll('[role="option"]').length===2,'race picker');racingTreasury196.app.querySelectorAll('[role="option"]')[index].dispatchEvent(new Event('mousedown',{bubbles:true}));};
  await pickRace196(0);
  const raceConsent196=racingTreasury196.app.querySelector('#treasury-recognition');raceConsent196.checked=true;raceConsent196.dispatchEvent(new Event('change'));
  racingTreasury196.hold(p=>p==='/api/admin/treasury/preview'?350:0);
  byText(racingTreasury196.app,'button','Preview cosmetic role changes').click();
  await waitFor(()=>racingCommands196.some(x=>x.path.endsWith('/preview')),'original preview started');
  await pickRace196(1); await pickRace196(0);
  await new Promise(resolve=>setTimeout(resolve,400));
  check('a delayed Treasury preview is discarded after target A to B to A selection changes',!byText(racingTreasury196.app,'button','Grant Stale target tier') && !racingTreasury196.app.textContent.includes('Preview only. No role command was sent.') && racingCommands196.filter(x=>x.path.endsWith('/confirm')).length===0);
  check('a Treasury selection names the current exact Discord account and resets consent',racingTreasury196.app.textContent.includes('Target A · '+OTHER) && !raceConsent196.checked);
  check('an inert Treasury preview explicitly identifies its captured target',treasury196.app.textContent.includes('Oz · '+OTHER));

  // Presentation-only decline fixtures use the real current app, owner and route
  // lifecycle. The API DTOs below are explicitly synthetic, not provider proof.
  const decline196=await openPage(STAFF),declineCommands196=[],declineOp196='8'.repeat(32);let declineBad196=false;
  decline196.before((p,init)=>{if(p.startsWith('/api/admin/treasury/'))declineCommands196.push({path:p,body:JSON.parse(init.body)});return false;});
  decline196.answer(p=>p.startsWith('/api/search?')?{results:[{id:OTHER,label:'Declining member',shown:'Declining member',onSite:true,appointmentStatus:'eligible'}]}:p==='/api/admin/treasury/preview'?{token:'synthetic-decline-only',recognitionConsent:false,recognitionMode:'decline',expiresAt:Math.floor(Date.now()/1000)+180,qualifyingGold:25,seasonEndsAt:Math.floor(Date.now()/1000)+86400,dispatchEnabled:true,changes:[{operationId:declineOp196,roleId:'123456789012345678',label:'Tithe Payer',desired:declineBad196?1:0}]}:p==='/api/admin/treasury/confirm'?{state:'unknown'}:p==='/api/admin/treasury/status'?{operation:null,noRetry:true}:null);
  await decline196.go('#/admin/treasury');const declineSearch196=decline196.app.querySelector('.picker input[role="combobox"]');declineSearch196.value='Declining';declineSearch196.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));await waitFor(()=>!!decline196.app.querySelector('[role="option"]'),'decline member lookup');decline196.app.querySelector('[role="option"]').dispatchEvent(new Event('mousedown',{bubbles:true}));
  const acceptMode196=decline196.app.querySelector('#treasury-recognition'),declineMode196=decline196.app.querySelector('#treasury-decline-recognition'),declineReview196=byText(decline196.app,'button','Preview cosmetic role changes');
  check('Treasury requires an explicit recognize or removal-only decline decision',!!declineMode196&&declineReview196.disabled&&declineCommands196.length===0);
  acceptMode196.checked=true;acceptMode196.dispatchEvent(new Event('change'));declineMode196.checked=true;declineMode196.dispatchEvent(new Event('change'));
  check('decline and recognition controls are mutually exclusive',!acceptMode196.checked&&declineMode196.checked&&!declineReview196.disabled);
  declineReview196.click();await waitFor(()=>!!byText(decline196.app,'button','Remove Tithe Payer'),'removal-only decline renderer');
  let declineRemove196=byText(decline196.app,'button','Remove Tithe Payer');
  check('decline preview sends false and displays retained credit without an automatic effect',declineCommands196.filter(x=>x.path.endsWith('/preview')).length===1&&declineCommands196.find(x=>x.path.endsWith('/preview')).body.recognitionConsent===false&&declineRemove196.disabled&&decline196.app.textContent.includes('25g')&&decline196.app.textContent.includes('extra-gold credit is kept')&&!byText(decline196.app,'button','Grant Tithe Payer')&&declineCommands196.every(x=>!x.path.endsWith('/confirm')));
  acceptMode196.checked=true;acceptMode196.dispatchEvent(new Event('change'));
  check('changing the recognition mode discards its exact previous preview',!declineMode196.checked&&!byText(decline196.app,'button','Remove Tithe Payer')&&declineCommands196.every(x=>!x.path.endsWith('/confirm')));
  declineMode196.checked=true;declineMode196.dispatchEvent(new Event('change'));declineBad196=true;declineReview196.click();await waitFor(()=>decline196.app.textContent.includes('Unreadable preview'),'decline malformed grant refusal');
  check('a purported decline DTO containing a grant exposes no effect control',!byText(decline196.app,'button','Grant Tithe Payer')&&!byText(decline196.app,'button','Remove Tithe Payer')&&declineCommands196.every(x=>!x.path.endsWith('/confirm')));
  declineBad196=false;declineReview196.click();await waitFor(()=>!!byText(decline196.app,'button','Remove Tithe Payer'),'fresh decline removal preview');declineRemove196=byText(decline196.app,'button','Remove Tithe Payer');const exactDecline196=declineRemove196.parentNode.querySelector('input[type="checkbox"]');exactDecline196.checked=true;exactDecline196.dispatchEvent(new Event('change'));declineRemove196.click();declineRemove196.click();await waitFor(()=>decline196.app.textContent.includes('Read its status; do not send it again.'),'decline original unknown outcome');
  check('one explicit decline confirmation keeps its original removal operation and token',declineCommands196.filter(x=>x.path.endsWith('/confirm')).length===1&&declineCommands196.find(x=>x.path.endsWith('/confirm')).body.operationId===declineOp196&&declineCommands196.find(x=>x.path.endsWith('/confirm')).body.token==='synthetic-decline-only');
  byText(decline196.app,'button','Read original operation status').click();await waitFor(()=>decline196.app.textContent.includes('This does not establish that an unconfirmed provider command did not apply.'),'decline no-row status remains held');
  check('a no-row status cannot unlock an invoked decline confirmation',declineReview196.disabled&&declineMode196.disabled&&declineCommands196.filter(x=>x.path.endsWith('/confirm')).length===1);
  await decline196.go('#/roles');
  // Fresh status only: these DTOs exercise the actual current app controls.
  // The real stored-receipt producer and its failed-write case are covered in
  // treasury_cosmetic196_test.cjs; no provider result is inferred from this UI.
  const noSendChecked197=Math.floor(Date.now()/1000),noSendOp197='9'.repeat(32);
  const noSendOriginal197={id:noSendOp197,state:'held',reason:'treasury_pre_dispatch_refused',attempts:1,checked_at:noSendChecked197};
  for(const [name,operation,unlocks]of[
    ['pre-request stored refusal',noSendOriginal197,true],
    ['provider stored definitive refusal',{...noSendOriginal197,reason:'treasury_provider_definite_refusal'},true],
    ['missing original row',null,false],
    ['another operation',{...noSendOriginal197,id:'8'.repeat(32)},false],
    ['unknown original',{...noSendOriginal197,state:'unknown'},false],
    ['still dispatching after failed receipt',{...noSendOriginal197,state:'dispatching',reason:'treasury_dispatching',checked_at:null},false],
    ['acknowledged but unconfirmed',{...noSendOriginal197,reason:'treasury_acknowledged_unconfirmed'},false],
    ['unspent original',{...noSendOriginal197,attempts:0},false],
    ['malformed attempt count',{...noSendOriginal197,attempts:'1'},false],
    ['missing stored observation',{...noSendOriginal197,checked_at:null},false],
    ['invalid stored observation',{...noSendOriginal197,checked_at:0},false],
    ['future stored observation',{...noSendOriginal197,checked_at:noSendChecked197+86400},false],
    ['unsupported similarly named reason',{...noSendOriginal197,reason:'treasury_provider_refused'},false],
  ]){
    const page=await openPage(STAFF),requests=[],key='olympus.treasuryAttempt';let replies=0;
    page.sessionStorage.setItem(key,JSON.stringify({owner:STAFF,operationId:noSendOp197}));
    page.before((p,init)=>{if(p.startsWith('/api/admin/treasury/'))requests.push({path:p,body:JSON.parse(init.body)});return false;});
    page.answer(p=>p==='/api/admin/treasury/status'?(replies++,{operation,noRetry:true}):null);
    await page.go('#/admin/treasury');const recognition=page.app.querySelector('#treasury-recognition'),decline=page.app.querySelector('#treasury-decline-recognition'),readStatus=byText(page.app,'button','Read original operation status');
    if(!recognition.disabled||!page.sessionStorage.getItem(key))throw Error('Original marker was not actually mounted for '+name);
    readStatus.click();if(!await waitFor(()=>replies===1&&!readStatus.disabled,'fresh original no-send status '+name))throw Error('Original status reply did not complete for '+name);
    check('.197 '+name+' releases only a proven original no-send marker',unlocks?page.sessionStorage.getItem(key)===null&&!recognition.disabled&&!decline.disabled&&!recognition.checked&&!decline.checked&&byText(page.app,'button','Preview cosmetic role changes').disabled:!!page.sessionStorage.getItem(key)&&recognition.disabled&&decline.disabled&&byText(page.app,'button','Preview cosmetic role changes').disabled);
    check('.197 '+name+' status never replays the old command or silently starts a new preview',requests.length===1&&requests[0].path==='/api/admin/treasury/status'&&requests[0].body.operationId===noSendOp197);
    await page.go('#/roles');
  }
  const webhookNotice196='w'.repeat(22);
  await fixtureRun('INSERT INTO site_news_notices(id,op_hash,title,body,revision,created_by,created_at,updated_by,updated_at,retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)',webhookNotice196,'a'.repeat(64),'Synthetic revised notice','Current saved revision, not the old Discord copy.',2,STAFF,now,STAFF,now,now+86400);
  const editor=await openPage(STAFF),webhookCommands196=[];
  const cleanup196={id:webhookNotice196,revision:2,enabled:false,canPublish:false,cleanupOnly:true,cleanupRevision:1,cleanupDestination:{guild:'123456789012345678',channel:'223456789012345678'},destination:{guild:'123456789012345678',channel:'223456789012345678'},payload:null,confirmation:null,expiresAt:null,state:'known',removalPending:true};
  editor.before((p,init)=>{if(p.startsWith('/api/news/editor/webhook/')&&init.method==='POST')webhookCommands196.push({path:p,body:JSON.parse(init.body)});return false;});
  editor.answer(p=>p.startsWith('/api/news/editor/webhook/preview?')?cleanup196:p==='/api/news/editor/webhook/reconcile'?{id:webhookNotice196,revision:1,state:'unknown'}:null);
  await editor.go('#/news/edit');
  await waitFor(()=>!!byText(editor.app,'button','Post notice'),'Town Crier editor');
  check('Town Crier editor opens inside the parent site header',editor.document.title==='Town Crier — Olympus' && !!editor.app.querySelector('header.topbar') && !!byText(editor.app,'button','Post notice'));
  byText(editor.app,'button','Review optional Discord cross-post').click();
  await waitFor(()=>!!byText(editor.app,'button','Continue requested removal'),'retained cleanup revision UI');
  if(!byText(editor.app,'button','Continue requested removal'))throw Error('Retained cleanup UI diagnosis: '+editor.app.querySelector('.news-webhook196')?.textContent);
  check('disabled webhook cleanup displays original revision and exposes no send',editor.app.textContent.includes('Original cross-post revision 1') && editor.app.textContent.includes('It authorizes no new send.') && !byText(editor.app,'button','Publish this exact Discord cross-post'));
  const cleanupButton196=byText(editor.app,'button','Continue requested removal');cleanupButton196.click();cleanupButton196.click();
  await waitFor(()=>editor.app.textContent.includes('Original cleanup state: unknown'),'original cleanup UI outcome');
  check('one cleanup continuation carries retained revision1 rather than edited notice revision2',webhookCommands196.length===1 && webhookCommands196[0].path.endsWith('/reconcile') && webhookCommands196[0].body.revision===1 && webhookCommands196[0].body.id===webhookNotice196);
  editor.answer(p=>p.startsWith('/api/news/editor/webhook/preview?')?{...cleanup196,cleanupRevision:0}:null);
  byText(editor.app,'button','Review optional Discord cross-post').click();
  await waitFor(()=>editor.app.textContent.includes('Unreadable cross-post preview'),'malformed cleanup refusal');
  check('unreadable cleanup custody exposes a refusal and no cleanup or send controls',editor.app.textContent.includes('Unreadable cross-post preview') && !byText(editor.app,'button','Continue requested removal') && !byText(editor.app,'button','Request cross-post removal') && !byText(editor.app,'button','Publish this exact Discord cross-post') && webhookCommands196.length===1);
  const sendPreview196={...cleanup196,enabled:true,canPublish:true,cleanupOnly:false,cleanupRevision:null,cleanupDestination:null,removalPending:false,state:'not_published',confirmation:'synthetic-ui-original-confirmation',expiresAt:Math.floor(Date.now()/1000)+600,payload:{embeds:[{title:'Saved notice title',description:'Exact reviewed body.'}],allowed_mentions:{parse:[]}}};
  editor.answer(p=>p.startsWith('/api/news/editor/webhook/preview?')?sendPreview196:p==='/api/news/editor/webhook/publish'?{state:'unknown'}:null);
  byText(editor.app,'button','Review optional Discord cross-post').click();
  await waitFor(()=>!!byText(editor.app,'button','Publish this exact Discord cross-post'),'explicit cross-post send controls');
  const sendButton196=byText(editor.app,'button','Publish this exact Discord cross-post');
  check('optional cross-post shows reviewed text and requires a separate explicit confirmation',sendButton196.disabled && editor.app.textContent.includes('Exact reviewed body.') && webhookCommands196.length===1);
  const sendConsent196=editor.app.querySelector('.news-webhook196 input[type="checkbox"]');sendConsent196.checked=true;sendConsent196.dispatchEvent(new Event('change'));sendButton196.click();sendButton196.click();
  await waitFor(()=>editor.app.textContent.includes('Original cross-post outcome: unknown'),'spent cross-post status');
  check('one confirmation sends the exact original proof once and removes repeat controls',webhookCommands196.filter(x=>x.path.endsWith('/publish')).length===1 && webhookCommands196.find(x=>x.path.endsWith('/publish')).body.confirmation==='synthetic-ui-original-confirmation' && !byText(editor.app,'button','Publish this exact Discord cross-post'));
  const unauthorized=await openPage(MEMBER,{}, {bootTransform:boot=>{boot.user.canEditTownCrier=true;}}); await unauthorized.go('#/news/edit');
  await waitFor(()=>unauthorized.app.textContent.includes('could not') || unauthorized.app.textContent.includes('forbidden'),'real editor refusal');
  check('forging the presentation capability cannot obtain the actual editor',!byText(unauthorized.app,'button','Post notice'));
  // Explicitly synthetic HTTP receipts after the real Worker handled the actual
  // UI action. These qualify disposed-view error handling, never provider effects.
  // A remount of the same URL must not make an old panel's receipt current again.
  const departedReply196=status=>new Response(JSON.stringify(status===401?{error:'signed_out'}:{error:'reload',message:'Synthetic obsolete196 response.'}),{status,headers:{'Content-Type':'application/json'}});
  const cosmeticPreview196={token:'synthetic-disposal-preview-only',recognitionConsent:true,recognitionMode:'recognize',expiresAt:Math.floor(Date.now()/1000)+180,qualifyingGold:25,seasonEndsAt:Math.floor(Date.now()/1000)+86400,dispatchEnabled:true,changes:[{operationId:op196,roleId:'123456789012345678',label:'Disposal fixture tier',desired:1}]};
  const pickTreasury196=async page=>{const input=page.app.querySelector('.picker input[role="combobox"]');input.value='Disposable';input.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));if(!await waitFor(()=>!!page.app.querySelector('[role="option"]'),'disposal target picker'))throw Error('No actual target picker response');page.app.querySelector('[role="option"]').dispatchEvent(new Event('mousedown',{bubbles:true}));};
  const startTreasury196=async(kind,status)=>{
    const page=await openPage(STAFF), endpoint='/api/admin/treasury/'+kind;
    let held=0;
    page.answer(p=>p===endpoint?departedReply196(status):p.startsWith('/api/search?')?{results:[{id:OTHER,label:'Disposable Target',shown:'Disposable Target',onSite:true,appointmentStatus:'eligible'}]}:p==='/api/admin/treasury/preview'?cosmeticPreview196:null);
    page.hold(p=>p===endpoint?(held++,300):0);
    await page.go('#/admin/treasury');
    await pickTreasury196(page);
    if(kind==='target')byText(page.app,'button',"Read member's TITHE reference").click();
    else if(kind==='record'){
      page.app.querySelector('#treasury-reference').value='synthetic-disposed-'+status;
      page.app.querySelector('#treasury-gold').value='25';
      page.app.querySelector('#treasury-observed').value=new Date(now*1000).toISOString().slice(0,16);
      page.app.querySelector('#treasury-mail').value='TITHE-ABCD-2345';
      const verified=page.app.querySelector('#treasury-gold-verified');verified.checked=true;verified.dispatchEvent(new Event('change'));
      byText(page.app,'button','Record verified extra gold').click();
    }else if(kind==='status'){
      const operation=page.app.querySelector('#treasury-operation');operation.value=op196;operation.dispatchEvent(new Event('input'));
      byText(page.app,'button','Read original operation status').click();
    }else{
      const consent=page.app.querySelector('#treasury-recognition');consent.checked=true;consent.dispatchEvent(new Event('change'));
      byText(page.app,'button','Preview cosmetic role changes').click();
      if(kind==='confirm'){
        if(!await waitFor(()=>!!byText(page.app,'button','Grant Disposal fixture tier'),'disposal preview'))throw Error('Missing actual confirm control');
        const grant=byText(page.app,'button','Grant Disposal fixture tier'),exact=grant.parentNode.querySelector('input[type="checkbox"]');exact.checked=true;exact.dispatchEvent(new Event('change'));grant.click();
      }
    }
    if(!await waitFor(()=>held===1,'held Treasury '+kind+' '+status))throw Error('Treasury response was not held');
    return {page,held:()=>held};
  };
  const startWebhook196=async(kind,status)=>{
    const page=await openPage(STAFF), endpoint='/api/news/editor/webhook/'+kind;
    let held=0;
    const initial=kind==='publish'?sendPreview196:kind==='revoke'?{...cleanup196,removalPending:false}:cleanup196;
    page.answer(p=>p===endpoint||kind==='preview'&&p.startsWith(endpoint+'?')?departedReply196(status):p.startsWith('/api/news/editor/webhook/preview?')?initial:null);
    page.hold(p=>p===endpoint||kind==='preview'&&p.startsWith(endpoint+'?')?(held++,300):0);
    await page.go('#/news/edit');
    if(!await waitFor(()=>!!byText(page.app,'button','Review optional Discord cross-post'),'disposal webhook editor'))throw Error('Missing actual cross-post reader');
    byText(page.app,'button','Review optional Discord cross-post').click();
    if(kind==='publish'){
      if(!await waitFor(()=>!!byText(page.app,'button','Publish this exact Discord cross-post'),'disposal publish preview'))throw Error('Missing actual publish confirmation');
      const consent=page.app.querySelector('.news-webhook196 input[type="checkbox"]');consent.checked=true;consent.dispatchEvent(new Event('change'));
      byText(page.app,'button','Publish this exact Discord cross-post').click();
    }else if(kind==='revoke'){
      if(!await waitFor(()=>!!byText(page.app,'button','Request cross-post removal'),'disposal original removal'))throw Error('Missing actual removal confirmation');
      const consent=page.app.querySelector('.news-webhook196 input[type="checkbox"]');consent.checked=true;consent.dispatchEvent(new Event('change'));
      byText(page.app,'button','Request cross-post removal').click();
    }else if(kind==='reconcile'){
      if(!await waitFor(()=>!!byText(page.app,'button','Continue requested removal'),'disposal original reconciliation'))throw Error('Missing actual reconcile control');
      byText(page.app,'button','Continue requested removal').click();
    }
    if(!await waitFor(()=>held===1,'held webhook '+kind+' '+status))throw Error('Webhook response was not held');
    return {page,held:()=>held};
  };
  for(const family of ['treasury','webhook'])for(const kind of family==='treasury'?['target','record','preview','confirm','status']:['preview','publish','revoke','reconcile'])for(const status of [401,409]){
    const started=await(family==='treasury'?startTreasury196(kind,status):startWebhook196(kind,status)), page=started.page;
    await page.go('#/roles');
    // Re-enter the same URL on409: route equality alone cannot revive the old
    // DOM/operation owner. This is a fresh view of the current signed-in account.
    if(status===409){await page.go(family==='treasury'?'#/admin/treasury':'#/news/edit');if(family==='webhook'&&!await waitFor(()=>!!byText(page.app,'button','Post notice'),'fresh editor remount'))throw Error('No fresh current editor');}
    const currentMain=page.app.querySelector('main'),title=page.document.title;
    await new Promise(resolve=>setTimeout(resolve,350));
    check('synthetic delayed '+family+' '+kind+' '+status+' after disposal cannot sign out, reload or redraw the current account view',started.held()===1&&!!byText(page.app,'button','Sign out')&&page.app.querySelector('main')===currentMain&&page.document.title===title&&!page.document.body.textContent.includes('You were signed out')&&!page.document.body.querySelector('.reload-bar')&&!page.location.reloaded&&!page.document.body.textContent.includes('Synthetic obsolete196 response.'));
  }
  // Keep the shared helper's ordinary current-view handling: stale suppression
  // must not turn all401/409 responses into ignored errors.
  for(const [family,status]of [['treasury',401],['webhook',409]]){
    const started=await(family==='treasury'?startTreasury196('target',status):startWebhook196('preview',status)),page=started.page;
    if(status===401){if(!await waitFor(()=>page.document.body.textContent.includes('You were signed out'),'current Treasury401'))throw Error('Current401 was silently ignored');check('a synthetic current Treasury401 still signs out the owning shell',!byText(page.app,'button','Sign out')&&page.document.body.textContent.includes('You were signed out'));}
    else{if(!await waitFor(()=>!!page.document.body.querySelector('.reload-bar'),'current webhook409'))throw Error('Current409 was silently ignored');check('a synthetic current webhook409 still offers reload on its owning shell',!!byText(page.app,'button','Sign out')&&!!page.document.body.querySelector('.reload-bar'));}
  }
  const effectTarget196=await openPage(STAFF);let effectHeld196=0;
  effectTarget196.answer(p=>p.startsWith('/api/search?')?{results:[{id:OTHER,label:'Original Target A',shown:'Original Target A',onSite:true,appointmentStatus:'eligible'},{id:MEMBER,label:'Later Target B',shown:'Later Target B',onSite:true,appointmentStatus:'eligible'}]}:p==='/api/admin/treasury/preview'?cosmeticPreview196:p==='/api/admin/treasury/confirm'?{state:'settled'}:null);
  effectTarget196.hold(p=>p==='/api/admin/treasury/confirm'?(effectHeld196++,300):0);
  await effectTarget196.go('#/admin/treasury');
  const effectPick196=async index=>{const input=effectTarget196.app.querySelector('.picker input[role="combobox"]');input.value='Target';input.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));if(!await waitFor(()=>effectTarget196.app.querySelectorAll('[role="option"]').length===2,'effect target picker'))throw Error('No actual effect target choices');effectTarget196.app.querySelectorAll('[role="option"]')[index].dispatchEvent(new Event('mousedown',{bubbles:true}));};
  await effectPick196(0);const effectConsent196=effectTarget196.app.querySelector('#treasury-recognition');effectConsent196.checked=true;effectConsent196.dispatchEvent(new Event('change'));
  byText(effectTarget196.app,'button','Preview cosmetic role changes').click();
  if(!await waitFor(()=>!!byText(effectTarget196.app,'button','Grant Disposal fixture tier'),'effect original preview'))throw Error('No effect confirmation');
  const effectGrant196=byText(effectTarget196.app,'button','Grant Disposal fixture tier'),effectExact196=effectGrant196.parentNode.querySelector('input[type="checkbox"]');effectExact196.checked=true;effectExact196.dispatchEvent(new Event('change'));effectGrant196.click();
  if(!await waitFor(()=>effectHeld196===1,'held original target effect'))throw Error('No held original effect');
  await effectPick196(1);
  if(!await waitFor(()=>effectTarget196.app.textContent.includes('original role operation for Original Target A'),'original effect attribution'))throw Error('Original effect feedback was not attributed');
  check('a synthetic settled Treasury reply names its original exact target after the picker changes',effectTarget196.app.textContent.includes('Later Target B · '+MEMBER)&&effectTarget196.app.textContent.includes('original role operation for Original Target A · '+OTHER+' settled.')&&!effectTarget196.app.textContent.includes('original role operation for Later Target B'));
  // Real current-source retained reads and removal requests: fake original
  // metadata/pointers are source-admitted fixture seeds, never real messages.
  const retainedGuild196='236932545793490944', retainedChannel196='223456789012345678', expired196='x'.repeat(22), deleted196='y'.repeat(22);
  const retainedBirth196=one('SELECT account_incarnation FROM site_users WHERE discord_id=?',STAFF).account_incarnation;
  const retainedGeneration196=one('SELECT generation FROM privacy_subjects WHERE subject_id=?',STAFF)?.generation??null;
  for(const [id,suffix]of [[expired196,'a'],[deleted196,'b']]){
    const operation='news_webhook_v1:'+id+':'+suffix.repeat(42),createdAt=now-1000,until=createdAt+366*86400;
    const metadata={v:1,id,revision:1,operation,payloadHash:'1'.repeat(64),configHash:'2'.repeat(64),credentialPin:'A'.repeat(43),guild:retainedGuild196,channel:retainedChannel196,webhook:'323456789012345678',actor:STAFF,birth:retainedBirth196,generation:retainedGeneration196,createdAt,noticeUntil:now-1,retainUntil:until};
    await fixtureRun('INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)','newsWebhook:'+id,JSON.stringify(metadata),now,STAFF);
    await fixtureRun("INSERT INTO privacy_provider_messages(operation_id,purpose,subjects,channel_id,message_id,state,cleanup_requested,created_at,updated_at,retain_until) VALUES(?,'notice',?,?,?,'known',0,?,?,?)",operation,JSON.stringify([{id:STAFF,g:retainedGeneration196}]),retainedChannel196,'423456789012345678',createdAt,now,until);
    if(id===expired196)await fixtureRun('INSERT INTO site_news_notices(id,op_hash,title,body,revision,created_by,created_at,updated_by,updated_at,retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)',id,'d'.repeat(64),'Expired fixture notice','A private expired fixture body.',1,STAFF,createdAt,STAFF,createdAt,now-1);
  }
  // The preceding synthetic matrix intentionally visits many read/write paths.
  // Use a separately source-issued synthetic editor for the real positive path:
  // news-wh shares an actor bucket, with POST capped at10 including prior reads.
  const retainedAdmin196='472099715253796865';await siteUser(retainedAdmin196,{global_name:'Retained fixture editor'});
  const retainedPage196=await openPage(retainedAdmin196,{GUILD_ID:retainedGuild196,SITE_ADMINS:retainedAdmin196}),retainedCommands196=[];
  retainedPage196.before((p,init)=>{if(p.startsWith('/api/news/editor/webhook/'))retainedCommands196.push({path:p,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});return false;});
  await retainedPage196.go('#/news/edit');
  const retainedRoot196=()=>retainedPage196.app.querySelector('.news-webhook-retained196');
  if(!await waitFor(()=>!!retainedRoot196(),'real retained custody controls'))throw Error('No retained custody reader');
  check('opening the retained cleanup controls does not read or send without an attended action',retainedCommands196.length===0&&!retainedPage196.app.textContent.includes('Expired fixture notice'));
  byText(retainedRoot196(),'button','Read retained cross-posts').click();
  if(!await waitFor(()=>retainedRoot196().textContent.includes(expired196)&&retainedRoot196().textContent.includes(deleted196),'actual expired/deleted retained list'))throw Error('Real retained metadata absent');
  check('real retained list exposes both expired and deleted original custody without notice bodies or send controls',retainedRoot196().querySelectorAll('.card').length===2&&!retainedRoot196().textContent.includes('A private expired fixture body.')&&!byText(retainedRoot196(),'button','Publish this exact Discord cross-post')&&retainedCommands196.every(x=>x.method==='GET'));
  for(const id of [expired196,deleted196]){
    const card=retainedRoot196().querySelectorAll('.card').find(c=>c.textContent.includes(id));
    byText(card,'button','Review retained Discord cross-post').click();
    if(!await waitFor(()=>!!byText(card,'button','Request cross-post removal'),'actual retained original preview'))throw Error('Original cleanup preview absent');
    check('real '+(id===expired196?'expired':'deleted')+' notice preview remains cleanup-only and never revives its body',card.textContent.includes('Original cross-post revision 1')&&card.textContent.includes('It authorizes no new send.')&&!byText(card,'button','Publish this exact Discord cross-post')&&!card.textContent.includes('A private expired fixture body.'));
    const consent=card.querySelector('input[type="checkbox"]');consent.checked=true;consent.dispatchEvent(new Event('change'));
    byText(card,'button','Request cross-post removal').click();
    if(!await waitFor(()=>card.textContent.includes('Original cleanup state: known'),'real original removal request'))throw Error('Removal request outcome absent: '+card.textContent+' / ledger '+JSON.stringify(one('SELECT state,cleanup_requested FROM privacy_provider_messages WHERE operation_id=?','news_webhook_v1:'+id+':'+(id===expired196?'a':'b').repeat(42))));
    const original='news_webhook_v1:'+id+':'+(id===expired196?'a':'b').repeat(42);
    check('actual '+(id===expired196?'expired':'deleted')+' original removal request marks only its known custody with sending unconfigured',one('SELECT state,cleanup_requested FROM privacy_provider_messages WHERE operation_id=?',original)?.state==='known'&&one('SELECT cleanup_requested FROM privacy_provider_messages WHERE operation_id=?',original)?.cleanup_requested===1&&retainedCommands196.filter(x=>x.path.endsWith('/revoke')&&x.body.id===id&&x.body.revision===1).length===1&&!retainedCommands196.some(x=>x.path.endsWith('/publish')));
  }
  // Synthetic keyset DTOs qualify only pagination/refusal/no-send presentation.
  const paging196=await openPage(STAFF),pagingReads196=[],firstCursor196='s'.repeat(22),lastId196='t'.repeat(22);
  const retainedRow196={id:lastId196,cleanupRevision:1,cleanupDestination:{guild:retainedGuild196,channel:retainedChannel196},state:'known',removalPending:true,uncertain:false};
  const firstPage196={records:[],returnedCount:0,inspectedCount:50,invalidCount:1,limit:50,nextCursor:firstCursor196,truncated:true,exhausted:false,complete:false,readOnly:true,scope:'synthetic bounded source-shaped page'};
  const secondPage196={records:[retainedRow196],returnedCount:1,inspectedCount:1,invalidCount:0,limit:50,nextCursor:null,truncated:false,exhausted:true,complete:true,readOnly:true,scope:'synthetic bounded source-shaped page'};
  paging196.before((p,init)=>{if(p.startsWith('/api/news/editor/webhook/retained'))pagingReads196.push(p);return false;});
  paging196.answer(p=>p==='/api/news/editor/webhook/retained'?firstPage196:p==='/api/news/editor/webhook/retained?after='+firstCursor196?secondPage196:p.startsWith('/api/news/editor/webhook/preview?')?{...sendPreview196,id:lastId196,revision:1,cleanupRevision:1,cleanupDestination:retainedRow196.cleanupDestination}:null);
  await paging196.go('#/news/edit');
  const pagingRoot196=()=>paging196.app.querySelector('.news-webhook-retained196');
  if(!await waitFor(()=>!!pagingRoot196(),'synthetic retained pagination controls'))throw Error('No actual retained pagination reader');
  byText(pagingRoot196(),'button','Read retained cross-posts').click();
  if(!await waitFor(()=>!byText(pagingRoot196(),'button','Next retained cross-posts').disabled,'empty retained page continuation'))throw Error('Empty page discarded its keyset continuation');
  check('a synthetic empty retained page preserves its continuation and unreadable-entry warning',pagingRoot196().querySelectorAll('.card').length===0&&pagingRoot196().textContent.includes('unreadable')&&!byText(pagingRoot196(),'button','Next retained cross-posts').disabled);
  byText(pagingRoot196(),'button','Next retained cross-posts').click();
  if(!await waitFor(()=>pagingRoot196().textContent.includes(lastId196),'retained second page'))throw Error('No second retained page');
  check('synthetic Next sends the exact last-inspected key and retains earlier invalid-slot incompleteness',pagingReads196.length===2&&pagingReads196[1]==='/api/news/editor/webhook/retained?after='+firstCursor196&&byText(pagingRoot196(),'button','Next retained cross-posts').disabled&&pagingRoot196().textContent.includes('unreadable')&&pagingRoot196().textContent.includes('incomplete'));
  byText(pagingRoot196(),'button','Review retained Discord cross-post').click();
  if(!await waitFor(()=>pagingRoot196().textContent.includes('It authorizes no new send.'),'forged positive retained preview'))throw Error('Retained-only preview absent');
  check('even a synthetic forged positive publish DTO cannot add send controls to retained-only custody',!byText(pagingRoot196(),'button','Publish this exact Discord cross-post')&&pagingRoot196().textContent.includes('Exact reviewed body.')&&pagingRoot196().textContent.includes('It authorizes no new send.'));
  for(const [label,bad]of [['missing read-only claim',{...secondPage196,readOnly:false}],['inconsistent exhaustion cursor',{...secondPage196,nextCursor:firstCursor196}],['duplicate custody rows',{...secondPage196,records:[retainedRow196,retainedRow196],returnedCount:2,inspectedCount:2}]]){
    paging196.answer(p=>p.startsWith('/api/news/editor/webhook/retained')?bad:null);
    byText(pagingRoot196(),'button','Read retained cross-posts').click();
    if(!await waitFor(()=>pagingRoot196().textContent.includes('Unreadable retained cross-post list'),'malformed retained '+label))throw Error('Malformed retained DTO was accepted');
    check('synthetic malformed retained '+label+' clears records and disables all continuation/send controls',pagingRoot196().querySelectorAll('.card').length===0&&byText(pagingRoot196(),'button','Next retained cross-posts').disabled&&!byText(pagingRoot196(),'button','Publish this exact Discord cross-post')&&!byText(pagingRoot196(),'button','Request cross-post removal'));
  }
  // Fresh real memberSeats plus source-shaped synthetic refusals. The lazy Army
  // module stub represents unverified observation DOM only; it is not a game feed.
  const capacityHour196=Math.floor((now-3600)/3600)*3600;
  const capacitySnapshot196=Number((await fixtureRun("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at) VALUES(?,?,'addon',963,'capacity196',1,1,?)",capacityHour196,capacityHour196,capacityHour196)).lastInsertRowid);
  const capacityStubs196=page=>{
    page.window.OlympusGuildQRProtocol={};page.window.OlympusSanitizedExport={};
    page.window.OlympusArmyReader={mount(node){node.textContent='Unverified community snapshot: Olympus II 1000 of1000 reported characters.';return{destroy(){node.textContent='';}};}};
  };
  const capacityPanel196=page=>page.app.querySelector('[data-army-capacity="current"]');
  const capacityFirst196=page=>capacityPanel196(page)?.querySelector('[data-army-capacity-guild="I"]');
  const capacityPage196=await openPage(MEMBER,{}, {clockNow:now*1000,bootTransform(boot){boot.seats={state:'full',source:'roster',members:1000,cap:1000,free:0,asOf:capacityHour196-100*86400};}});
  capacityStubs196(capacityPage196);let capacityReads196=0;
  capacityPage196.before((p,init)=>{if(p==='/api/me')capacityReads196++;return false;});
  await capacityPage196.go('#/army');
  if(!await waitFor(()=>capacityFirst196(capacityPage196)?.textContent.includes('963 of 1000'),'actual fresh open roster'))throw Error('Fresh actual memberSeats never rendered: '+capacityPanel196(capacityPage196)?.textContent);
  check('Army capacity shows all10 named branches and reads current /api/me instead of stale boot seats',capacityPanel196(capacityPage196).querySelectorAll('[data-army-capacity-guild]').map(e=>e.getAttribute('data-army-capacity-guild')).join(',')==='I,II,III,IV,V,VI,VII,VIII,IX,X'&&capacityReads196===1&&!capacityFirst196(capacityPage196).textContent.includes('1000 of 1000'));
  check('a real open checked-roster DTO supplies the I meter and hour-rounded current evidence time',capacityFirst196(capacityPage196).querySelector('meter')?.value==='963'&&capacityFirst196(capacityPage196).querySelector('meter')?.getAttribute('max')==='1000'&&capacityFirst196(capacityPage196).querySelector('time')?.getAttribute('datetime')===new Date(capacityHour196*1000).toISOString()&&capacityFirst196(capacityPage196).textContent.includes('does not reserve or promise a place'));
  check('all9 other branches stay unavailable despite unverified Army observation counts',capacityPage196.app.textContent.includes('Olympus II 1000 of1000')&&capacityPanel196(capacityPage196).querySelectorAll('[data-army-capacity-guild]').slice(1).every(row=>row.textContent.includes('Capacity unavailable')&&!row.querySelector('meter')&&!row.querySelector('time')&&!/[0-9]/.test(row.textContent)));
  check('Alt placement points only to current leadership and creates no automatic or invented Alt guild route',capacityPanel196(capacityPage196).querySelector('a[href="#/community/leadership"]')?.textContent==='guild officers and leadership'&&capacityPanel196(capacityPage196).textContent.includes('no automatic Alt routing or dedicated Alt guild'));
  await fixtureRun('UPDATE roster_snapshots SET member_count=1000 WHERE id=?',capacitySnapshot196);
  const capacityRefreshFocus196=byText(capacityPanel196(capacityPage196),'button','Refresh capacity evidence');capacityRefreshFocus196.focus();capacityRefreshFocus196.click();
  if(!await waitFor(()=>capacityFirst196(capacityPage196)?.textContent.includes('Full in this roster report'),'actual full roster'))throw Error('Fresh actual full roster absent');
  check('explicit capacity refresh preserves the original focused button and announces its result',capacityPage196.document.activeElement===capacityRefreshFocus196&&byText(capacityPanel196(capacityPage196),'button','Refresh capacity evidence')===capacityRefreshFocus196&&capacityPanel196(capacityPage196).querySelector('[role="status"]')?.textContent.includes('1000 of 1000'));
  check('a later explicit capacity refresh uses actual full-roster evidence and never touches an invite path',capacityReads196===2&&capacityFirst196(capacityPage196).querySelector('meter')?.value==='1000'&&capacityFirst196(capacityPage196).textContent.includes('not a promise of the present guild state'));
  capacityPage196.clock((capacityHour196+48*3600)*1000);
  if(!await waitFor(()=>capacityFirst196(capacityPage196)?.textContent.includes('out of date'),'live48h capacity expiry'))throw Error('48h evidence did not expire');
  check('the existing48h roster window removes the meter and evidence timestamp when it expires',!capacityFirst196(capacityPage196).querySelector('meter')&&!capacityFirst196(capacityPage196).querySelector('time'));
  capacityPage196.clock(now*1000);await capacityPage196.go('#/community/army');
  if(!await waitFor(()=>capacityFirst196(capacityPage196)?.querySelector('meter'),'community Army capacity alias'))throw Error('Community alias lacks current capacity');
  check('the community Army alias mounts the same10-row capacity panel separately from observations',capacityPanel196(capacityPage196).querySelectorAll('[data-army-capacity-guild]').length===10&&capacityPage196.app.textContent.includes('Unverified community observations'));
  capacityPage196.document.hidden=true;capacityPage196.document.dispatchEvent(new Event('visibilitychange'));
  check('hiding an Army view immediately clears every capacity count and evidence timestamp',capacityPanel196(capacityPage196).hidden&&capacityPanel196(capacityPage196).childNodes.length===0);
  capacityPage196.document.hidden=false;capacityPage196.document.dispatchEvent(new Event('visibilitychange'));
  if(!await waitFor(()=>capacityFirst196(capacityPage196)?.querySelector('meter'),'new read after visibility'))throw Error('Visible capacity did not re-read');
  check('showing Army again obtains a new original-owner capacity read',capacityReads196===4&&capacityFirst196(capacityPage196).querySelector('meter')?.value==='1000');
  await capacityPage196.go('#/roles');
  const capacityDTO196=(seats,owner=MEMBER)=>({signedIn:true,denied:false,user:{id:owner},now,seats});
  const capacityOpen196={state:'open',source:null,members:963,cap:1000,free:37,asOf:capacityHour196};
  for(const [label,seats,owner]of [
    ['absent',null,MEMBER],['stale48h roster',{...capacityOpen196,asOf:capacityHour196-49*3600},MEMBER],
    ['stale6h refusal',{state:'full',source:'refused_invite',members:555,cap:1000,free:445,asOf:capacityHour196-7*3600},MEMBER],
    ['unrounded evidence',{...capacityOpen196,asOf:capacityHour196+1},MEMBER],['invalid cap',{...capacityOpen196,cap:899},MEMBER],
    ['inconsistent free count',{...capacityOpen196,free:99},MEMBER],['unverified observation source',{...capacityOpen196,state:'full',source:'community-observation'},MEMBER],
    ['unknown with forged counts',{...capacityOpen196,state:'unknown'},MEMBER],['another original account',capacityOpen196,OTHER]
  ]){
    const page=await openPage(MEMBER);capacityStubs196(page);page.answer(p=>p==='/api/me'?capacityDTO196(seats,owner):null);await page.go('#/army');
    if(!await waitFor(()=>capacityFirst196(page)&&!capacityFirst196(page).textContent.includes('Checking current'),'capacity refusal '+label))throw Error('Capacity refusal did not settle');
    check('synthetic '+label+' cannot claim an I count, meter, timestamp or current admission',!capacityFirst196(page).querySelector('meter')&&!capacityFirst196(page).querySelector('time')&&!capacityFirst196(page).textContent.includes('963')&&capacityFirst196(page).textContent.includes('No count or free-place estimate'));
    await page.go('#/roles');
  }
  const refusalPage196=await openPage(MEMBER);capacityStubs196(refusalPage196);
  refusalPage196.answer(p=>p==='/api/me'?capacityDTO196({state:'full',source:'refused_invite',members:555,cap:1000,free:445,asOf:capacityHour196}):null);await refusalPage196.go('#/army');
  if(!await waitFor(()=>capacityFirst196(refusalPage196)?.textContent.includes('refused for lack of space'),'current refused invitation evidence'))throw Error('Current refusal evidence absent');
  check('a recent refused-invite DTO shows only its dated full report even when older roster counts accompany it',!!capacityFirst196(refusalPage196).querySelector('time')&&!capacityFirst196(refusalPage196).querySelector('meter')&&!capacityFirst196(refusalPage196).textContent.includes('555')&&!capacityFirst196(refusalPage196).textContent.includes('445'));
  await refusalPage196.go('#/roles');
  const raceCapacity196=await openPage(MEMBER);capacityStubs196(raceCapacity196);const capacityRequestIds196=new WeakMap();let capacityRequestN196=0;
  raceCapacity196.before((p,init)=>{if(p==='/api/me')capacityRequestIds196.set(init,++capacityRequestN196);return false;});
  raceCapacity196.hold((p,init)=>p==='/api/me'&&capacityRequestIds196.get(init)===1?180:0);
  raceCapacity196.answer((p,init)=>p==='/api/me'?capacityDTO196({...capacityOpen196,members:capacityRequestIds196.get(init)===1?777:888,free:capacityRequestIds196.get(init)===1?223:112}):null);
  await raceCapacity196.go('#/army');
  if(!await waitFor(()=>capacityRequestN196===1,'first current capacity held'))throw Error('No held first capacity read');
  byText(capacityPanel196(raceCapacity196),'button','Refresh capacity evidence').click();
  if(!await waitFor(()=>capacityFirst196(raceCapacity196)?.textContent.includes('888 of 1000'),'newer current capacity read'))throw Error('Newer capacity read missing');
  await new Promise(resolve=>setTimeout(resolve,220));
  check('a late earlier capacity response cannot replace a newer exact-view read',capacityRequestN196===2&&capacityFirst196(raceCapacity196).textContent.includes('888 of 1000')&&!capacityFirst196(raceCapacity196).textContent.includes('777'));
  await raceCapacity196.go('#/roles');
  for(const status of [401,409]){
    const page=await openPage(MEMBER);capacityStubs196(page);let count=0;const ids=new WeakMap();
    page.before((p,init)=>{if(p==='/api/me')ids.set(init,++count);return false;});page.hold((p,init)=>p==='/api/me'&&ids.get(init)===1?160:0);
    page.answer((p,init)=>p!=='/api/me'?null:ids.get(init)===1?new Response(JSON.stringify({error:status===401?'signed_out':'reload',message:'Obsolete capacity response.'}),{status,headers:{'Content-Type':'application/json'}}):capacityDTO196(capacityOpen196));
    await page.go('#/army');if(!await waitFor(()=>count===1,'late capacity response held'))throw Error('Capacity response not held');
    await page.go('#/roles');await page.go('#/army');
    if(!await waitFor(()=>capacityFirst196(page)?.querySelector('meter'),'replacement same-route capacity view'))throw Error('Replacement capacity view missing');
    const current=page.app.querySelector('main');await new Promise(resolve=>setTimeout(resolve,200));
    check('synthetic late capacity'+status+' after leave/re-enter cannot sign out or stale-reload the new view',!!byText(page.app,'button','Sign out')&&page.app.querySelector('main')===current&&!!capacityFirst196(page).querySelector('meter')&&!page.document.body.querySelector('.reload-bar')&&!page.document.body.textContent.includes('Obsolete capacity response.'));
    await page.go('#/roles');
  }
  const reporterCapacity196=await openPage(STAFF);await reporterCapacity196.go('#/army/report');
  if(!await waitFor(()=>capacityPanel196(reporterCapacity196)?.querySelectorAll('[data-army-capacity-guild]').length===10,'Admin reporter capacity'))throw Error('Admin reporter lost its capacity panel');
  check('the current Admin reporter also retains the same explicit10-branch panel without publishing',capacityPanel196(reporterCapacity196).querySelectorAll('[data-army-capacity-guild]').length===10);
  await reporterCapacity196.go('#/roles');
  const logoutCapacity196=await openPage(OTHER);capacityStubs196(logoutCapacity196);let logoutCapacityReads196=0,logoutCapacityPosts196=0;
  const logoutOriginalVersion196=one('SELECT session_version FROM site_users WHERE discord_id=?',OTHER).session_version;
  logoutCapacity196.before((p,init)=>{if(p==='/api/me')logoutCapacityReads196++;if(p==='/auth/logout'&&init.method==='POST')logoutCapacityPosts196++;return false;});logoutCapacity196.hold(p=>p==='/api/me'?160:0);
  logoutCapacity196.answer(p=>p==='/api/me'?capacityDTO196(capacityOpen196,OTHER):null);await logoutCapacity196.go('#/army');
  if(!await waitFor(()=>logoutCapacityReads196===1,'logout capacity read held'))throw Error('No held capacity read before logout');
  const logoutPanel196=capacityPanel196(logoutCapacity196);byText(logoutCapacity196.app,'button','Sign out').click();
  check('the actual Sign out action clears only capacity synchronously before its transport settles',logoutPanel196.hidden&&logoutPanel196.childNodes.length===0&&logoutCapacityPosts196===1);
  if(!await waitFor(()=>logoutCapacity196.location.navigated==='/','genuine logout navigation'))throw Error('Actual logout did not request root navigation');
  await new Promise(resolve=>setTimeout(resolve,220));
  // The minimal fixture records href navigation; it does not fake a new document.
  check('one actual synthetic logout advances its session and requests navigation while late capacity cannot reappear',logoutCapacityPosts196===1&&one('SELECT session_version FROM site_users WHERE discord_id=?',OTHER).session_version===logoutOriginalVersion196+1&&logoutCapacity196.location.navigated==='/'&&logoutPanel196.hidden&&logoutPanel196.childNodes.length===0&&!logoutCapacity196.app.textContent.includes('963 of 1000'));
  await fixtureRun('DELETE FROM roster_snapshots WHERE id=?',capacitySnapshot196);
  console.log('\n'+ok+'/'+n+' master196 frontend checks passed'); process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
`;
const execution196=new Module(__filename,module); execution196.filename=__filename; execution196.paths=Module._nodeModulePaths(__dirname);
execution196._compile(fixture196.slice(0,starts196[0].index)+'\n'+body196,__filename);
