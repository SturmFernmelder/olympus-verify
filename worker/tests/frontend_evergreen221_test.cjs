// Current SPA and real Worker/Native SQLite. Synthetic clocks and identities only.
const fs221=require('node:fs'),path221=require('node:path'),crypto221=require('node:crypto'),{Module}=require('node:module');
const original221=fs221.readFileSync(path221.join(__dirname,'frontend_check.cjs'),'utf8');
const cuts221=[...original221.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cuts221.length!==1)throw Error('evergreen221_original_frontend_boundary');
const prefix221=original221.slice(0,cuts221[0].index);
if(crypto221.createHash('sha256').update(require('./frontend_fixture_prefix217.cjs').historicalFrontendPrefix217(prefix221)).digest('hex')!=='bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5')throw Error('evergreen221_original_frontend_prefix_drift');
async function evergreen221(){
 await siteUser(MEMBER,{global_name:'Evergreen reader'});await character(MEMBER,'Reader One','Player-221-0001');
 const page=await openPage(MEMBER,{}, {clockNow:Date.parse('2026-11-01T12:00:00Z')});
 await page.go('#/roles');
 const search=page.app.querySelector('#application-role-search201');
 const visible=key=>{const family=page.app.querySelector('[data-role-family203="'+key+'"]');return !!family&&!family.hidden;};
 for(const query of ['Raid Leader NA','NA raid lead','Raid Leader (NA)','Ｒａｉｄ Ｌｅａｄｅｒ ＮＡ']){
  search.value=query;fire(search,'input');
  check('punctuation, order and full-width search finds the NA Raid Leader: '+query,visible('raid_leader')&&page.app.querySelector('[data-role-family203="raid_leader"] .role-search-match203').textContent.includes('NA'));
 }
 search.value='PvP Lead NA';fire(search,'input');check('PvP regional search has its own reserved family',visible('pvp_leadership')&&!page.app.querySelector('[data-role-family203="pvp_leadership"] [data-family-apply203]'));
 search.value='rank 5';fire(search,'input');check('the public rank number finds the Raid Leader family',visible('raid_leader'));
 search.value='NA';fire(search,'input');check('a short region token does not match Finance',!visible('bank_custody')&&!visible('treasurer'));
 search.value='<img src=x onerror=alert(1)>';fire(search,'input');check('hostile search stays text and creates no executable node',!page.app.querySelector('img[onerror],script[src="x"]'));
 search.value='';fire(search,'input');
 const nativeRanks118=page.app.querySelectorAll('.role-ranks203 [data-native-slot]');
 const leader118=page.app.querySelector('[data-role-family203="leader"] summary .rank-office199');
 const rosettaLeader118=page.app.querySelector('[data-rank-crosswalk="1"] td a');
 check('CC-118 Roles and Rosetta present Leader (Guild Master) while the canonical rank name and slot remain stable',
  nativeRanks118.length===10&&nativeRanks118[0].textContent.endsWith('Leader (Guild Master)')
  &&nativeRanks118[1].textContent.endsWith('High Council')&&leader118?.textContent.includes('Rank 1 Leader (Guild Master) (Slot 0)')
  &&rosettaLeader118?.textContent==='Rank 1 Leader (Guild Master)'&&page.app.textContent.includes('The in-game name for slot 0 is Guild Master.')
  &&page.boot.meta.roleDirectory203.ranks[0].label==='Leader'&&page.boot.meta.roleDirectory203.ranks[0].nativeSlot===0);
 const council=page.app.querySelector('[data-rank-crosswalk="2"]');
 const cells=council.querySelectorAll('td');
 check('Council portal guidance is one specification rather than concatenated near-duplicates',(cells[3].textContent.match(/High Council access requires/g)||[]).length<=1&&!/appointment;.*appointment;/s.test(cells[3].textContent));
 check('statutory titles follow canonical I to V order',cells[1].querySelectorAll('a').map(a=>a.textContent).join(' / ')==='Title I / Title II / Title III / Title IV / Title V');
 const groups=page.app.querySelectorAll('[data-role-section201]').map(el=>el.getAttribute('data-role-section201'));
 check('role catalogue uses the six prescribed sections in order',JSON.stringify(groups)===JSON.stringify(['council','officers','raid','workshop','members','royal']));
 const cards=page.app.querySelectorAll('[data-role-family203]');
 // Evergreen 12 Nov 2026 (CL2-100): the per-card reference row is a plain group, not a navigation landmark.
 check('all canonical role cards link to organization and a statutory Title',cards.length===72&&cards.every(card=>
  card.querySelectorAll('.role-primary203 .role-reference-links228 a').some(a=>a.getAttribute('href').startsWith('#/organization/'))&&
  card.querySelectorAll('.role-primary203 .role-reference-links228 a').some(a=>a.getAttribute('href').startsWith('#/governance/title-'))));
 const councilCards=page.app.querySelector('[data-role-section201="council"]').querySelectorAll('[data-role-family203]');
 check('the chair and Co-Guild Master precede twelve canonically ordered portfolios',JSON.stringify(councilCards.slice(0,14).map(card=>card.getAttribute('data-role-family203')))===JSON.stringify(['leader',...page.boot.meta.roleDirectory203.councilOrder])&&councilCards[13].getAttribute('data-role-family203')==='systems_heraldry'&&!councilCards[13].querySelector('[data-family-apply203]'));
 check('ordinary readers see ten crosswalk role links without a staff planner link',page.app.querySelectorAll('[data-rank-crosswalk]').every(row=>row.querySelectorAll('a').some(a=>a.getAttribute('href').startsWith('#/roles/'))&&!row.querySelectorAll('a').some(a=>a.getAttribute('href').startsWith('/admin/ranks'))));
 await page.go('#/governance/title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord/article-v-4');
 await waitFor(()=>!!page.app.querySelector('#governance-title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord-article-v-4'),'Article V.4 deep link');
 check('all fifty statutory and Title articles have unique anchors and a deep link opens its chapter',page.app.querySelectorAll('h3[id]').filter(h=>h.getAttribute('id').startsWith('governance-')).length===50&&page.app.querySelector('[data-chapter="title-v-the-guild-workshop-artisans-charter-and-the-heralds-accord"]').open);
 await siteUser(STAFF,{global_name:'Evergreen administrator'});
 const staff=await openPage(STAFF);
 await staff.go('#/roles/rosetta-stone');
 check('the staff crosswalk points directly to every matching native planner slot',staff.app.querySelectorAll('[data-rank-crosswalk]').every((row,index)=>row.querySelector('a[href="/admin/ranks#current-rank-'+(index+1)+'"]')));
 await staff.go('#/admin/settings');
 check('both admin layouts share the five section labels in order',JSON.stringify(staff.app.querySelectorAll('#admin-section-select optgroup').map(node=>node.getAttribute('label')))===JSON.stringify(['Applications & Roster','Governance, Ranks & Appointments','Imperial Treasury & Stockades','News, Calendar & Operations','System Settings & Compliance'])&&staff.app.querySelectorAll('.admin-section-group228').length===5);
 const before=await openPage(MEMBER,{}, {clockNow:Date.parse('2026-11-02T12:00:00Z')});await before.go('#/apply');
 const copy=before.app.querySelector('.launch-application-copy218');
 check('application instructions have no orphan separator after their sentence',!!copy&&!copy.textContent.includes('.  · ')&&!copy.textContent.includes('. · '));
 const after=await openPage(MEMBER,{}, {clockNow:Date.parse('2026-11-05T12:00:00Z')});
 const afterNotice=after.app.querySelector('.launch-notice218');
 check('the launch milestone advances to the announced December raid date',!!afterNotice&&afterNotice.textContent.includes('9 December 2026')&&afterNotice.textContent.includes('Check Blizzard for the opening time.')&&!afterNotice.querySelector('[role="timer"]'));
 check('post-reservation instructions do not ask people to claim early names',!!afterNotice&&!afterNotice.querySelector('.launch-application-copy218').textContent.startsWith('Claim'));
 // Evergreen Stage 2 (4 Nov 2026): once 9 December has ended in PST the notice retires instead of announcing a passed date.
 const later=await openPage(MEMBER,{}, {clockNow:Date.parse('2026-12-10T12:00:00Z')});
 const laterNotice=later.app.querySelector('.launch-notice218');
 check('a passed raid date retires the notice and never asserts observed server availability',!laterNotice&&!later.app.textContent.includes('announced raid date has passed'));
 console.log('\n'+ok+'/'+n+' passed');process.exit(ok===n?0:1);
}
const run221=new Module(__filename,module);run221.filename=__filename;run221.paths=Module._nodeModulePaths(__dirname);
run221._compile(prefix221+'\n('+evergreen221.toString()+')().catch(e=>{console.error(e.stack);process.exit(1)});',__filename);
