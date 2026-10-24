// Proposed actual-app/Worker/MiniDOM presentation checks, not live Discord/proof or physical browser qualification.
// Retains the original frontend fixture's clocks. A separate finite outer bound is chosen by Root, not this leaf.
const fs196=require('node:fs'),path196=require('node:path'),{Module}=require('node:module');
const fixture196=path196.join(__dirname,'frontend_check.cjs'),source196=fs196.readFileSync(fixture196,'utf8');
const cuts196=[...source196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cuts196.length!==1)throw Error('one original frontend fixture boundary required');
const body196=String.raw`
(async()=>{
  await siteUser(MEMBER);await character(MEMBER,'Catalogue Reader','Player-1-0196');await siteUser(OTHER);await siteUser(STAFF);
  const account196='300000000000196008',tag196='<@'+account196+'>',name196='Admitted Office Holder (office.fixture)';
  const pointerBoot196=boot=>{boot.settings.appointed=Object.fromEntries(boot.meta.appointments.map(office=>[office.key,tag196]));};
  const row196=role=>({role,appointment:tag196,displayName:'Admitted Office Holder',username:'office.fixture',characters:[{name:'Admitted Character',status:'member',verifiedAt:new Date(now*1000).toISOString()}],charactersTruncated:false});
  const projection196=(identities,extra={})=>({scope:'qualified_community_readers',identities,revision:'A'.repeat(43),nextCursor:null,complete:true,...extra});
  const page=await openPage(MEMBER,{}, {bootTransform:pointerBoot196});let identityReads196=0;
  page.before((url,init)=>{if(url==='/api/appointed-identities')identityReads196++;return false;});
  page.answer(url=>url==='/api/appointed-identities'?projection196(['office_95','rank_guild_master','rank_high_council','rank_treasurer'].map(row196)):null);
  page.hold(url=>url==='/api/appointed-identities'?60:0);await page.go('#/roles');
  const panel=page.app.querySelector('[data-office-assignment-catalogue="true"]');
  check('complete current catalogue lists131 unique office/rank/class/leadership records',!!panel&&panel.querySelectorAll('[data-office-assignment]').length===131&&new Set(panel.querySelectorAll('[data-office-assignment]').map(node=>node.getAttribute('data-office-assignment'))).size===131&&page.boot.meta.appointments.every(office=>!!panel.querySelector('[data-office-assignment="'+office.key+'"]')));
  check('new catalogue is opaque before admitted identity reply and never reveals account pointers',!panel.textContent.includes(name196)&&!panel.textContent.includes(account196)&&panel.querySelector('[data-office-assignment="office_95"]').textContent.includes('Filled by appointment'));
  await waitFor(()=>panel.querySelector('[data-office-assignment="office_95"]').textContent.includes(name196),'extended and native current identity projection');
  check('extended offices and each configured native display use the same admitted name and character reader',['office_95','rank_guild_master','rank_high_council','rank_treasurer'].every(key=>panel.querySelector('[data-office-assignment="'+key+'"]').textContent.includes(name196)&&panel.querySelector('[data-office-assignment="'+key+'"]').textContent.includes('Verified characters: Admitted Character'))&&!panel.textContent.includes(account196));
  const native196=panel.querySelectorAll('details').find(node=>node.querySelector('summary')?.textContent==='Native-rank display records (10)');
  check('exact10 native display records do not invent an eleventh slot for historical Officer Alt',!!native196&&native196.querySelectorAll('[data-office-assignment]').length===10&&!native196.querySelector('[data-office-assignment="rank_officer_alt"]')&&!!panel.querySelector('[data-office-assignment="rank_officer_alt"]')&&panel.textContent.includes('does not create another native-rank slot'));
  page.document.hidden=true;page.document.dispatchEvent(new Event('visibilitychange'));
  check('hiding the shared catalogue clears admitted names and characters from every retained node',!panel.textContent.includes(name196)&&!panel.textContent.includes('Admitted Character')&&panel.querySelector('[data-office-assignment="office_95"]').textContent.includes('Filled by appointment'));
  page.document.hidden=false;page.document.dispatchEvent(new Event('visibilitychange'));await waitFor(()=>panel.textContent.includes(name196),'fresh catalogue after visibility');
  const detached196=panel;await page.go('#/');
  check('leaving Roles disposes the existing private reader and clears its detached complete catalogue',!detached196.textContent.includes(name196)&&!detached196.textContent.includes('Admitted Character'));
  page.hold(null);page.answer(url=>url==='/api/appointed-identities'?projection196([row196('office_95')],{scope:'wrong_audience'}):null);await page.go('#/roles');await settle();
  check('wrong-audience identity response cannot decorate any of the new complete display rows',!page.app.querySelector('[data-office-assignment-catalogue="true"]').textContent.includes(name196));
  const withheld=await openPage(MEMBER,{}, {bootTransform:boot=>{boot.settings.appointed={office_95:'Name withheld',rank_treasurer:tag196,office_01:account196};}});await withheld.go('#/roles');
  const withheldPanel=withheld.app.querySelector('[data-office-assignment-catalogue="true"]');
  check('withheld, unfilled and malformed ID-like legacy records remain opaque without fabricated proof',withheldPanel.querySelector('[data-office-assignment="office_95"]').textContent.includes('Name withheld')&&withheldPanel.querySelector('[data-office-assignment="office_01"]').textContent.includes('Name withheld')&&withheldPanel.querySelector('[data-office-assignment="office_02"]').textContent.includes('No website appointment recorded')&&!withheldPanel.textContent.includes(account196));
  const unqualified=await openPage(OTHER,{}, {bootTransform:pointerBoot196});let unqualifiedReads196=0;unqualified.before(url=>{if(url==='/api/appointed-identities')unqualifiedReads196++;return false;});await unqualified.go('#/roles');await settle();
  check('an unqualified viewer gets no complete holder catalogue and no current-identity lookup',!unqualified.app.querySelector('[data-office-assignment-catalogue="true"]')&&unqualifiedReads196===0&&!unqualified.app.textContent.includes(account196));
  const broken=await openPage(MEMBER,{}, {bootTransform:boot=>{pointerBoot196(boot);boot.meta.appointments=[boot.meta.appointments[0],boot.meta.appointments[0]];}});let brokenReads196=0;broken.before(url=>{if(url==='/api/appointed-identities')brokenReads196++;return false;});await broken.go('#/roles');await settle();
  check('duplicate catalogue keys fail closed rather than rendering an incomplete proof-facing register',broken.app.textContent.includes('The display catalogue is unavailable')&&!broken.app.querySelector('[data-office-assignment-catalogue="true"]')&&brokenReads196===0);
  // This asserts wiring, not an executed physical Organization import/render.
  const orgStart196=APP_JS.indexOf('  ROUTES.organization = async'),orgEnd196=APP_JS.indexOf('\n  };',orgStart196),orgSource196=APP_JS.slice(orgStart196,orgEnd196);
  check('Organization wires the identical catalogue after its existing renderer with original-view fences',orgStart196>=0&&orgSource196.includes('disposeOrganization = renderOrganization(')&&orgSource196.includes('add(main, officeAssignmentPanel())')&&orgSource196.includes('S.user === user && S.settings === settings && COM() === context')&&orgSource196.includes('if (!current()) return;'));

  // Same-reader revision and opaque source-key cursor are presentation fixtures, never fabricated server proof.
  const paged196=await openPage(MEMBER,{}, {bootTransform:pointerBoot196});let pagedReads196=0;const pagedURLs196=[];
  paged196.before(url=>{if(url.startsWith('/api/appointed-identities')){pagedReads196++;pagedURLs196.push(url);}return false;});
  paged196.hold(url=>url.startsWith('/api/appointed-identities?')?90:0);
  const firstPerson196={...row196('office_01'),displayName:'Buffered First'},lastPerson196={...row196('office_95'),displayName:'Buffered Last'};
  paged196.answer(url=>!url.startsWith('/api/appointed-identities')?null:url.includes('?')?projection196([lastPerson196]):projection196([firstPerson196],{nextCursor:'office_32',complete:false}));
  await paged196.go('#/roles');await waitFor(()=>pagedReads196===2,'identity continuation pending');const buffered196=paged196.app.querySelector('[data-office-assignment-catalogue="true"]');
  check('a complete holder view does not paint even the first name from a partial projection',!!buffered196&&!buffered196.textContent.includes('Buffered First')&&!buffered196.textContent.includes('Buffered Last'));
  await waitFor(()=>buffered196.textContent.includes('Buffered Last'),'complete same-revision identity collection');
  check('only completed same-reader pages paint the complete catalogue through the original opaque cursor',buffered196.textContent.includes('Buffered First')&&buffered196.textContent.includes('Buffered Last')&&pagedReads196===2&&pagedURLs196[1]==='/api/appointed-identities?after=office_32&revision='+'A'.repeat(43));
  await paged196.go('#/');
  const changedPage196=await openPage(MEMBER,{}, {bootTransform:pointerBoot196});let changedReads196=0;changedPage196.before(url=>{if(url.startsWith('/api/appointed-identities'))changedReads196++;return false;});changedPage196.answer(url=>!url.startsWith('/api/appointed-identities')?null:url.includes('?')?projection196([lastPerson196],{revision:'B'.repeat(43)}):projection196([firstPerson196],{nextCursor:'office_32',complete:false}));await changedPage196.go('#/roles');await waitFor(()=>changedReads196===2,'changed-revision continuation');await settle();
  check('different revision on a continuation cannot publish the buffered first or later holder name',!changedPage196.app.textContent.includes('Buffered First')&&!changedPage196.app.textContent.includes('Buffered Last')&&changedReads196===2);
  await changedPage196.go('#/');
  // .197 changed this convenience to an explicit account association. Seed one
  // genuine original Native fixture account; only Discord's exact member GET is mocked below.
  await siteUser(account196,{username:'office.fixture',global_name:'Agreed Display Name'});await character(account196,'Office Holder','Player-1-0197');await cookieFor(account196);
  const branchEnv197={DISCORD_BOT_TOKEN:'synthetic-office-picker-only'};
  const staff=await openPage(STAFF,branchEnv197);const writes196=[];staff.before((url,init)=>{if(url==='/api/admin/leadership'&&init.method==='PUT')writes196.push(JSON.parse(init.body));return false;});
  const searchDto196=(label,id=account196)=>({results:[{id,label,shown:label,appointmentStatus:'eligible',onSite:true}],limited:false,unavailable:false});
  const labeledPicker196=(page,label)=>{const node=page.app.querySelectorAll('label[for]').find(node=>node.textContent===label);return node?page.app.querySelector('#'+node.getAttribute('for')):null;};
  let searchLabel196='  Agreed   Display Name  ',searchId196=account196;
  staff.answer(url=>url.startsWith('/api/search?purpose=appointment&')?searchDto196(searchLabel196,searchId196):null);
  await staff.go('#/admin/settings');await waitFor(()=>!!labeledPicker196(staff,'Olympus I: associate Guild Master account'),'current leadership account pickers mounted');
  check('all10 branches expose separate account associations without changing131 office pickers or inferring authority',staff.app.querySelectorAll('label[for]').filter(node=>node.textContent.endsWith('associate Guild Master account')).length===10&&staff.app.querySelectorAll('label[for]').filter(node=>node.textContent.endsWith('associate officer account')).length===10&&staff.app.querySelectorAll('.appointed-row').length===131&&staff.app.textContent.includes('A typed name remains a staff-entered, unverified label')&&staff.app.textContent.includes('Neither form proves a game character or grants any permission'));
  const pick196=async(label)=>{const input=labeledPicker196(staff,label);if(!input)throw Error('current leadership picker absent');input.value='Agreed';input.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));await waitFor(()=>!!input.closest('.picker').querySelector('[role="option"]'),'eligible account result');input.closest('.picker').querySelector('[role="option"]').dispatchEvent(new Event('mousedown',{bubbles:true}));};
  const consent196=staff.app.querySelector('#lead-names-ok'),identityConsent197=staff.app.querySelector('#lead-identities-ok');consent196.checked=identityConsent197.checked=true;await pick196('Olympus I: associate Guild Master account');
  check('GM pick stores only the canonical account pointer and invalidates both independent publication consents',staff.app.querySelector('#lead-gm-0').value===tag196&&!consent196.checked&&!identityConsent197.checked&&!staff.app.querySelector('#lead-gm-0').value.includes(searchLabel196));
  consent196.checked=identityConsent197.checked=true;await pick196('Olympus I: associate officer account');await pick196('Olympus I: associate officer account');
  check('officer pick deduplicates the exact account pointer and invalidates both consents',staff.app.querySelector('#lead-off-0').value===tag196&&!consent196.checked&&!identityConsent197.checked);
  for(const bad of [tag196,'not-an-account-id','x'.repeat(41)]){searchId196=bad;await pick196('Olympus I: associate Guild Master account');check('malformed or oversize search account key is refused without truncation: '+bad.slice(0,18),staff.app.querySelector('#lead-gm-0').value===tag196);}
  searchId196=account196;searchLabel196='Another Officer';staff.app.querySelector('#lead-off-0').value=Array.from({length:12},(_,i)=>'Officer '+i).join('\n');await pick196('Olympus I: associate officer account');
  check('account picker cannot append a thirteenth officer',staff.app.querySelector('#lead-off-0').value.split('\n').length===12&&!staff.app.querySelector('#lead-off-0').value.includes(tag196));
  staff.app.querySelector('#lead-off-0').value=tag196;staff.app.querySelector('#lead-off-0').dispatchEvent(new Event('input'));
  const readLeadership197=async()=>{const response=await indexMod.default.fetch(new Request('https://guild.example/api/admin/leadership',{headers:{Cookie:staff.cookie}}),env(branchEnv197),ctx);if(response.status!==200)throw Error('actual original leadership revision unavailable');return response.json();};
  const beforeRevision197=(await readLeadership197()).revision,originalProviderFetch197=originalTestFetch,originalLeadershipFetch197=indexMod.default.fetch;let memberGets197=0;
  const leadershipResponses197=[];
  // The original fixture loads the real Discord module before its spread stub through the privacy import cycle.
  // Use that module's stable transport seam; only this exact synthetic member GET is permitted.
  originalTestFetch=async(input,init={})=>{
    const request=input instanceof Request?input:null,url=new URL(request?request.url:input),method=request?request.method:init.method||'GET',headers=new Headers(request?request.headers:init.headers);
    if(url.href!=='https://discord.com/api/v10/guilds/236932545793490944/members/'+account196||method!=='GET'||headers.get('Authorization')!=='Bot '+branchEnv197.DISCORD_BOT_TOKEN||(request?request.redirect:init.redirect)!=='manual')throw Error('unexpected synthetic leadership provider request');
    memberGets197++;return Response.json({user:{id:account196,username:'office.fixture',global_name:'Agreed Display Name'},nick:null,roles:[],pending:false});
  };
  // Clone each actual Worker PUT response for the oracle, returning the original unchanged and making no extra request.
  indexMod.default.fetch=async function(...args){const response=await originalLeadershipFetch197.apply(this,args),request=args[0];if(request.method==='PUT'&&new URL(request.url).pathname==='/api/admin/leadership')leadershipResponses197.push({status:response.status,body:await response.clone().json()});return response;};
  try{
  consent196.checked=true;identityConsent197.checked=false;byText(staff.app,'button','Save the directory').click();await waitFor(()=>writes196.length===1,'explicit account consent refusal sent');await waitFor(()=>!byText(staff.app,'button','Save the directory').disabled,'account consent refusal terminal');
  check('real Worker refuses missing account-publication consent before profile lookup or persistence',writes196[0].leadershipIdentitiesConfirmed===false&&writes196[0].expectedRevision===beforeRevision197&&memberGets197===0&&!one("SELECT value FROM site_settings WHERE key='leadership'"));
  const refusal197=leadershipResponses197[0],exactRefusal197=leadershipResponses197.length===1&&refusal197.status===400&&refusal197.body?.error==='identity_confirmation';
  check('real missing-consent PUT returns the exact identity_confirmation refusal',exactRefusal197,leadershipResponses197);
  if(!exactRefusal197)throw Error('actual missing-consent response did not match its required refusal');
  consent196.checked=identityConsent197.checked=true;byText(staff.app,'button','Save the directory').click();await waitFor(()=>writes196.length===2,'current account association write captured');await waitFor(()=>!byText(staff.app,'button','Save the directory').disabled,'account association write terminal');
  const savedResponse197=leadershipResponses197[1],savedRow197=one("SELECT value FROM site_settings WHERE key='leadership'"),exactSaved197=leadershipResponses197.length===2&&savedResponse197.status===200&&savedResponse197.body?.ok===true&&!!savedRow197;
  check('real account association PUT returns success and persists before inspecting its server proofs',exactSaved197,leadershipResponses197);
  if(!exactSaved197)throw Error('actual account-association save did not succeed and persist');
  const associated197=JSON.parse(one("SELECT value FROM site_settings WHERE key='leadership'").value),sentAssociation197=writes196[1];
  check('real admitted save binds10 branches, both explicit consents and the exact original revision while server owns both seat proofs',sentAssociation197.guilds.length===10&&sentAssociation197.guilds[0].gm===tag196&&sentAssociation197.guilds[0].officers.join(',')===tag196&&sentAssociation197.namesConfirmed===true&&sentAssociation197.leadershipIdentitiesConfirmed===true&&sentAssociation197.expectedRevision===beforeRevision197&&Object.keys(sentAssociation197).sort().join(',')==='expectedRevision,guilds,leadershipIdentitiesConfirmed,namesConfirmed'&&memberGets197===1&&Object.keys(associated197.publications).sort().join(',')==='guild_01_gm,guild_01_officer_01'&&associated197.publications.guild_01_gm.pointer===tag196&&associated197.publications.guild_01_gm.birth===one('SELECT account_incarnation FROM site_users WHERE discord_id=?',account196).account_incarnation&&!Object.hasOwn(sentAssociation197,'publications'));
  check('successful account publication clears both consents for the next edit',!consent196.checked&&!identityConsent197.checked);
  consent196.checked=identityConsent197.checked=true;staff.app.querySelector('#lead-gm-0').value='Hand edited name';staff.app.querySelector('#lead-gm-0').dispatchEvent(new Event('input'));staff.app.querySelector('#lead-off-0').value='Agreed Display Name';staff.app.querySelector('#lead-off-0').dispatchEvent(new Event('input'));
  check('manual legacy field edits remain possible and invalidate both publication consents',!consent196.checked&&!identityConsent197.checked);
  const nextRevision197=(await readLeadership197()).revision;consent196.checked=true;byText(staff.app,'button','Save the directory').click();await waitFor(()=>writes196.length===3,'manual legacy leadership write captured');await waitFor(()=>!byText(staff.app,'button','Save the directory').disabled,'manual legacy write terminal');
  const legacy197=JSON.parse(one("SELECT value FROM site_settings WHERE key='leadership'").value),sentLegacy197=writes196[2];
  check('manual legacy save retains10 plain-text branches and fresh revision without account consent or client proof',sentLegacy197.guilds.length===10&&sentLegacy197.namesConfirmed===true&&sentLegacy197.leadershipIdentitiesConfirmed===false&&sentLegacy197.expectedRevision===nextRevision197&&sentLegacy197.guilds[0].gm==='Hand edited name'&&sentLegacy197.guilds[0].officers[0]==='Agreed Display Name'&&Object.keys(sentLegacy197).sort().join(',')==='expectedRevision,guilds,leadershipIdentitiesConfirmed,namesConfirmed'&&!JSON.stringify(sentLegacy197).includes(account196)&&legacy197.guilds[0].gm==='Hand edited name'&&Object.keys(legacy197.publications).length===0&&!JSON.stringify(legacy197).includes(account196)&&memberGets197===1);
  }finally{originalTestFetch=originalProviderFetch197;indexMod.default.fetch=originalLeadershipFetch197;}
  const detachedSave196=byText(staff.app,'button','Save the directory');await staff.go('#/roles');detachedSave196.click();await settle();check('a detached I-X form cannot write',writes196.length===3);
  for(const status of [401,409]){
    const late=await openPage(STAFF);let reads196=0;late.before(url=>{if(url==='/api/admin/leadership')reads196++;return false;});late.hold(url=>url==='/api/admin/leadership'?70:0);late.answer(url=>url==='/api/admin/leadership'?new Response(JSON.stringify({error:status===401?'signed_out':'reload'}),{status,headers:{'Content-Type':'application/json'}}):null);
    await late.go('#/admin/settings');await waitFor(()=>reads196===1,'I-X read held');await late.go('#/roles');await settle();const text196=late.app.textContent;await new Promise(resolve=>setTimeout(resolve,100));
    check('late I-X GET'+status+' cannot mutate the replacement route or account shell',late.location.hash==='#/roles'&&!!byText(late.app,'button','Sign out')&&late.app.textContent===text196);
  }
  const lateSearch=await openPage(STAFF);await lateSearch.go('#/admin/settings');await waitFor(()=>!!labeledPicker196(lateSearch,'Olympus I: associate Guild Master account'),'late search picker');let searchReads196=0;lateSearch.before(url=>{if(url.startsWith('/api/search?purpose=appointment&'))searchReads196++;return false;});lateSearch.hold(url=>url.startsWith('/api/search?purpose=appointment&')?70:0);lateSearch.answer(url=>url.startsWith('/api/search?purpose=appointment&')?new Response('{"error":"signed_out"}',{status:401,headers:{'Content-Type':'application/json'}}):null);
  const oldPicker196=labeledPicker196(lateSearch,'Olympus I: associate Guild Master account');oldPicker196.value='Held';oldPicker196.dispatchEvent(new Event('keydown',{key:'ArrowDown',bubbles:true}));await waitFor(()=>searchReads196===1,'picker search held');await lateSearch.go('#/roles');await new Promise(resolve=>setTimeout(resolve,100));check('late private picker search cannot sign out or decorate a replacement view',!!byText(lateSearch.app,'button','Sign out')&&lateSearch.location.hash==='#/roles'&&!oldPicker196.closest('.picker').querySelector('[role="option"]'));

  // Root supplies the exact public contract revision; backend preservation cases remain a separate actual API leaf.
  const data196=JSON.parse(fs.readFileSync(path.join(root,'public/static/talents/data.json'),'utf8')),currentRevision196=data196.revision;
  const currentCode196='ot1.'+currentRevision196+'.warrior.60.'+'0'.repeat(data196.classes.find(c=>c.id==='warrior').trees.flatMap(t=>t.talents).length);
  const attachmentPage196=async(code,metaRevision=currentRevision196,selectedClass='warrior')=>{const p=await openPage(MEMBER,{}, {bootTransform:boot=>{boot.meta.talentSnapshotRevision=metaRevision;boot.application={status:'accepted',updatedAt:now,position:'member',backups:[],class:selectedClass,role:'dps',region:'eu',answers:{talentBuild:code}};}});await p.go('#/apply');const summaryReady=await waitFor(()=>p.app.textContent.includes('Your application was accepted.')&&!!byText(p.app,'h4',p.boot.meta.questions.find(q=>q.key==='talentBuild').label),'actual private attachment summary');if(!summaryReady)throw Error('attachment fixture never reached the private application summary');return p;};
  const currentAttachment196=await attachmentPage196(currentCode196),link196=byText(currentAttachment196.app,'a','Open the attached talent build');
  check('current attachment link uses exact public revision and class capture, without a board-sharing claim',link196?.getAttribute('href')==='#/talents/warrior/'+currentCode196);
  for(const [code,revision,selectedClass] of [[currentCode196.replace(currentRevision196,'000000000000'),currentRevision196,'warrior'],[currentCode196,undefined,'warrior'],[currentCode196,currentRevision196,'mage'],['https://evil.example/'+currentCode196,currentRevision196,'warrior']]){
    const p=await attachmentPage196(code,revision===undefined?'':revision,selectedClass);check('unavailable revision/class/URL attachment stays opaque in the summary',!byText(p.app,'a','Open the attached talent build')&&p.app.textContent.includes('This attachment is unavailable in the current calculator'));
  }
  check('actual boot publishes the exact current talent snapshot contract for safe links',page.boot.meta.talentSnapshotRevision===currentRevision196);
  console.log('\n'+ok+'/'+n+' office holder, static picker and current attachment presentation checks passed');process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
`;
const execution196=new Module(fixture196,module);execution196.filename=fixture196;execution196.paths=Module._nodeModulePaths(path196.dirname(fixture196));execution196._compile(source196.slice(0,cuts196[0].index)+'\n'+body196,fixture196);
