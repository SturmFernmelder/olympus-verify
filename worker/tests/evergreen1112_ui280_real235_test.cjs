'use strict';
// Evergreen 12 Nov 2026, lane ui280, round 5 build (13 Nov 2026): the v235 launch reader against REAL v235 replies.
// Every page here is made by the real Worker (worker/src/index.ts -> site-admin.ts -> site-launch229.ts
// handleDiscoveryOperations235) on a real SQLite database through the repo's frontend fixture (frontend_check.cjs, the
// same reuse as evergreen1112_ui280_test.cjs), and read by the real page script (app.js) with the real view modules
// (launch-operations234.js, launch-discovery235.js). No fixture page, no provider, no network: the one Discord answer
// the invite read needs (a member's roles) is a synthetic reply to the fixture's transport.
// Codex's Workerd budget fixture (launch_roster_pacing271_runtime.mjs) drives the same route on a 1,000-member roster, but
// it is a Workerd module that keeps its replies to itself (it returns only counts), so it cannot be imported unchanged
// for the page; this test seeds the same shape (1,000 Native members, one qualified source, the directive policy).
// Covered: the held page of an unconfigured site and of a site with no export; a qualified first page and the later page
// reached through its real nextCursor; a rank-held first page with a real invite and its later page, then stale after
// 61 seconds while its scan is current; a rank-held last page (partial, nextCursor null); the real errors
// invalid_discovery_cursor, discovery_cursor_capacity and launch_cursor_source_changed as "start again from the first page";
// single-field changes of real pages that a scan must refuse (codex-reviews-r5/discovery235.md section 5).
// Review of 13 Nov 2026 (findings 1-3): a held later page of a scan (the server's clock passes the page window during a
// rank-held read; the export changes between the inner reader's two reads of a qualified page) ends the scan with its own
// holds; the default export and rank codes of a held reply are worded as not reported; a page's counts match its rows.
// Item 6 (13 Nov 2026, Codex's reading of the reader): a rank-held page's own words (badge, page sentence, scan line,
// continuation, read status, introduction) name the roster page and never role evidence or role checks, through first,
// next, recheck, current and stale pages; a qualified page keeps the v234 words; a held page says no confirmed rows are
// available; a qualified page's member count and page size are tied to its scan.
// Run from worker/: node tests/evergreen1112_ui280_real235_test.cjs  (UI280_APP_JS / UI280_STATIC_DIR: another page script
// or static folder, for the fail-before run on the base).
const fsR=require('node:fs'),pathR=require('node:path'),{Module:ModuleR}=require('node:module');
const fixtureR=fsR.readFileSync(pathR.join(__dirname,'frontend_check.cjs'),'utf8'),cutsR=[...fixtureR.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(cutsR.length!==1)throw Error('real235_original_frontend_fixture_boundary');
const APP_LINE_R='const APP_JS = fs.readFileSync(path.join(root, "public", "static", "app.js"), "utf8");';
if(fixtureR.split(APP_LINE_R).length!==2)throw Error('real235_app_js_line_moved');
const runR=String.raw`
(async()=>{
 const STATIC=process.env.UI280_STATIC_DIR||path.join(root,'public','static');
 const SRC234=fs.readFileSync(path.join(STATIC,'launch-operations234.js'),'utf8'),SRC235=fs.readFileSync(path.join(STATIC,'launch-discovery235.js'),'utf8');
 const SEL234='script[src="/static/launch-operations234.js"]',SEL235='script[src="/static/launch-discovery235.js"]';
 const realm={Object,Array,JSON,String,Number,RegExp,Map,Set,Error};
 await siteUser(STAFF,{global_name:'Synthetic launch officer'});
 const schemes=load('./native-rank-schemes'),canon=load('./canonical-ranks233'),ops=load('./launch-operations229');
 const at=Math.floor(Date.now()/1000),SCOPE={version:1,guild:'OLYMPUS PRIME',realm:'Fixture Realm'};
 const policy=JSON.stringify({version:2,enabled:true,profile:schemes.DIRECTIVE_CANONICAL_PROFILE,guildId:canon.CANONICAL_GUILD233,ranks:canon.CANONICAL_RANKS233.map(rank=>({...rank,permissions:'0'}))});
 // The launch configuration of a members-only site (the shape of Codex's runtime fixture). GUILD_ID and SITE_GUILD_ID are
 // the flagship guild, which the invite read requires (officer-invites233.ts selection). Only the launch route gets it.
 const CONFIGURED={VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify(SCOPE),LINKS_NOT_BEFORE:String(at-3600),VERIFY_SECRET:'synthetic-real235-verify',
  DISCORD_BOT_TOKEN:'synthetic-real235-bot',GUILD_ID:canon.CANONICAL_GUILD233,SITE_GUILD_ID:canon.CANONICAL_GUILD233,CANONICAL_RANKS233:policy};
 let LAUNCH={...CONFIGURED};
 // The only provider answer: a member's current roles (one Knight role), for the invite candidate's standing read.
 originalTestFetch=async url=>{const m=/\/guilds\/(\d{17,20})\/members\/(\d{17,20})$/.exec(String(url));if(m)return new Response(JSON.stringify({user:{id:m[2]},roles:[ops.KNIGHT_ROLE_IDS229[0]]}),{status:200,headers:{'Content-Type':'application/json'}});throw Error('no network in tests: '+url);};
 // Fault injection for the one real error the data cannot reach: the cursor writer's 8,192 limit (writeDiscoveryCursor235).
 // With at most 1,000 members the outer cursor stays near 6,000 characters, so only an oversized seal triggers the
 // handler's own capacity branch. Verification is untouched; only seals of the v235 discovery purpose are affected.
 const subtle=globalThis.crypto.subtle,sign=subtle.sign.bind(subtle);let oversizeSeal=false;
 subtle.sign=async(alg,key,data)=>{const out=await sign(alg,key,data);return oversizeSeal&&new TextDecoder().decode(data).startsWith('officer-discovery-cursor|235|')?new Uint8Array(4200).buffer:out;};
 // Review of 13 Nov 2026 (finding 1): two real held replies of a later page need something to happen DURING one read: the
 // server's clock passing the page's 60 second window, or the export changing between the inner reader's two reads. A
 // statement hook on the fixture's database (armed for one request, cleared after it) does either; the server code is not
 // touched. skew moves Date.now for the server only while that one request runs.
 const realNow=Date.now.bind(Date);let skew=0;Date.now=()=>realNow()+skew;
 const prepare=db.prepare.bind(db);let stmtHook=null,pendingWrite=null;
 db.prepare=sql=>{const st=prepare(sql);if(!stmtHook)return st;for(const k of ['all','get','run','iterate']){const f=st[k]?.bind(st);if(f)try{st[k]=(...a)=>{const r=f(...a);if(stmtHook)stmtHook(sql,k);return r;};}catch{}}return st;};

 // ---------------------------------------------------------------- the page, every launch read answered by the real Worker
 let jump=0;const replies=[];let override=null;
 const pg=await openPage(STAFF,{},{clockNow:()=>Date.now()+jump});
 pg.intercept(async(url,init)=>{
  if(!url.startsWith('/api/admin/launch-operations'))return null;
  const readingNow=pg.app.querySelector('[data-launch234] [role=status]')?.textContent||'';
  const r=await indexMod.default.fetch(new Request('https://guild.example'+url,{method:init.method||'GET',headers:{Origin:'https://guild.example',...(init.headers||{}),Cookie:pg.cookie}}),env({ASSETS:governanceAssets,...LAUNCH}),ctx);
  const text=await r.text();let json=null;try{json=JSON.parse(text);}catch{}
  skew=0;stmtHook=null;
  const cursor=new URL('https://fixture.invalid'+url).searchParams.get('cursor');replies.push({url,cursor,status:r.status,json,reading:readingNow});
  const o=override&&json?override(JSON.parse(text),cursor):null;
  return new Response(o?JSON.stringify(o):text,{status:o?200:r.status,headers:{'Content-Type':'application/json; charset=utf-8'}});
 });
 const supply=()=>{for(const [sel,src,ns] of [[SEL234,SRC234,'OlympusLaunch234'],[SEL235,SRC235,'OlympusDiscovery235']]){const t=pg.document.head.querySelector(sel);if(t&&!pg.window[ns]){vm.runInNewContext(src,{window:pg.window,...realm},{filename:sel});t.dispatchEvent(new Event('load'));}}};
 const app=()=>pg.app.textContent;
 const settled=()=>{supply();return !app().includes('Reading at most 20')&&(!!pg.app.querySelector('#launch-motd229')||!!pg.app.querySelector('[data-launch234-held]')||!!pg.app.querySelector('[data-launch235-restart]')||app().includes('could not be confirmed'));};
 const calm=async()=>{for(let i=0;i<6;i++)await settle();await waitFor(settled,'launch page settlement',10000);for(let i=0;i<4;i++)await settle();};
 const open=async()=>{replies.length=0;await pg.go('#/');await pg.go('#/admin/launch-operations');await calm();};
 const btn=t=>byText(pg.app,'button',t);
 // Item 6: the continuation is "Load next 20 role checks" on a qualified page and "Load next 20 roster members" on a rank-held one; 'next' presses whichever the page shows.
 const NEXT234='Load next 20 role checks',NEXT_ROSTER='Load next 20 roster members',nextBtn=()=>btn(NEXT234)||btn(NEXT_ROSTER);
 const press=async t=>{const b=t==='next'?nextBtn():btn(t);if(!b||b.disabled||b.hidden)return false;replies.length=0;b.click();await calm();return true;};
 const outcome=()=>{const r=pg.app.querySelector('[data-launch235-restart]');if(r)return 'restart:'+r.getAttribute('data-launch235-restart');const h=pg.app.querySelector('[data-launch234-held]');if(h)return 'refused:'+h.getAttribute('data-launch234-held');if(app().includes('could not be confirmed'))return 'unconfirmed';return pg.app.querySelector('#launch-motd229')?'shown':'other';};
 const frameOf=title=>pg.app.querySelectorAll('h2').find(x=>x.textContent===title)?.closest('section')||null;
 const holds=()=>pg.app.querySelectorAll('[data-launch234-hold]').map(li=>[li.getAttribute('data-launch234-hold'),li.textContent]);
 const progress=()=>pg.app.querySelector('[data-launch-progress229]')?.textContent||'';
 const scopeText=()=>{const f=frameOf('Discovery and current eligibility');return f?f.querySelectorAll('p')[0]?.textContent||'':'';};
 const invites=()=>pg.app.querySelectorAll('[data-launch-invite233]').map(tr=>({source:tr.getAttribute('data-launch234-invite-source'),cells:tr.querySelectorAll('td').map(td=>td.textContent)}));
 const badges=()=>pg.app.querySelectorAll('h2').filter(x=>/^Examined page /.test(x.textContent)).map(x=>x.textContent+' = '+(x.parentNode.querySelector('.badge')?.textContent||''));
 const last=()=>replies[replies.length-1]||{};
 const viewText=()=>pg.app.querySelector('[data-launch234]')?.textContent||'';
 const words=()=>{const v=pg.app.querySelector('[data-launch234]');return {intro:v?.querySelectorAll('p')[0]?.textContent||'',status:pg.app.querySelector('[data-launch234] [role=status]')?.textContent||'',scanLine:frameOf('Discovery and current eligibility')?.querySelectorAll('p')[2]?.textContent||'',
  next:nextBtn()?{label:nextBtn().textContent,shown:!nextBtn().hidden&&!nextBtn().disabled}:null,
  pages:pg.app.querySelectorAll('h2').filter(x=>/^Examined page /.test(x.textContent)).map(x=>{const sec=x.closest('section');return {title:x.textContent,badge:x.parentNode.querySelector('.badge')?.textContent||'',sentence:sec?.querySelectorAll('p')[0]?.textContent||''};})};};
 // Words of a role read. The invite table's own "Stale advisory · fresh native proof required" (launch-operations234.js) is about
 // the invite's native proof, the independent invite handling, so it is not in this list; the page badges are checked by name.
 const ROLE_WORDS=/Role evidence|role evidence|role-evidence|role checks|Discord role records|currently eligible/;
 const plainHolds=list=>list.length>0&&list.every(([code,text])=>!!text&&!text.includes(code)&&!text.startsWith('Held for a reason')&&!/does not recognise/.test(text));
 const D=()=>pg.window.OlympusDiscovery235,L=()=>pg.window.OlympusLaunch234;
 const table=[];const record=(name,r)=>table.push({name,status:r.status,protocol:r.json?.protocol??null,pageStatus:r.json?.status??null,error:r.json?.error??null,heldReasons:r.json?.heldReasons??null,rowReasons:r.json?.held?[...new Set(r.json.held.map(x=>x.reason))]:null,offset:r.json?.entitlements?.offset??null,nextCursor:typeof r.json?.nextCursor==='string'?r.json.nextCursor.length+' chars':null,shown:outcome()});

 console.log('\n== Part R1: held pages of the real route ==');
 LAUNCH={...CONFIGURED,VERIFY_MEMBERSHIP_ONLY:undefined};await open();
 const unconfigured={o:outcome(),r:last(),holds:holds(),scope:scopeText(),progress:progress()};record('unconfigured site',unconfigured.r);
 const uniq=r=>[...new Set(r.json?.heldReasons||[])];
 check('R1 the real held page of an unconfigured site (v235, held) is read and shown with plain sentences: each hold once, no rank or refusal wording',unconfigured.o==='shown'&&unconfigured.r.status===200&&unconfigured.r.json.protocol==='officer-operations-v235'&&unconfigured.r.json.status==='held'
  &&JSON.stringify(unconfigured.holds.map(x=>x[0]))===JSON.stringify(uniq(unconfigured.r))&&plainHolds(unconfigured.holds)&&unconfigured.holds.some(([c,t])=>c==='flagship-native-scope-unconfirmed'&&t==='The site is not set up to read the OLYMPUS PRIME roster.')
  &&!app().includes('Ranks are held because')&&!!pg.app.querySelector('[data-launch234-ranks="unconfirmed"]')&&!pg.app.querySelector('[data-launch-promotion229]')&&!pg.app.querySelector('[data-launch235-scan-ended]'),JSON.stringify(unconfigured));
 check('R2 the held page says that it carries nothing from a roster export and that no confirmed rows are available from the read (not "nothing was examined", not "flagship scope not confirmed", not "Discovery partial")',unconfigured.scope==='This reply carries nothing from a roster export. The holds below say why.'&&unconfigured.progress==='No confirmed rows are available from this read.',JSON.stringify({scope:unconfigured.scope,progress:unconfigured.progress}));
 LAUNCH={...CONFIGURED};await open();
 const noExport={o:outcome(),r:last(),holds:holds()};record('configured site, no export',noExport.r);
 check('R3 the real held page of a configured site without a roster export (the harness reply: native-snapshot-unavailable listed twice) shows that hold once, in plain words',noExport.o==='shown'&&noExport.r.json.status==='held'&&noExport.r.json.heldReasons.filter(c=>c==='native-snapshot-unavailable').length===2
  &&noExport.holds.filter(([c])=>c==='native-snapshot-unavailable').length===1&&noExport.holds.find(([c])=>c==='native-snapshot-unavailable')?.[1]==='There is no complete roster export from the last ten minutes.'&&plainHolds(noExport.holds)&&!app().includes('Ranks are held because'),JSON.stringify(noExport));

 // Review of 13 Nov 2026 (finding 2): held229 lists the export and rank codes once on every held reply, whatever the reason.
 const NOT_SNAPSHOT='This reply does not say whether there is a complete roster export from the last ten minutes.',NOT_RANKS='This reply does not say whether the roster export’s ranks match the 12 November ladder.';
 const holdOf=(list,code)=>list.find(([c])=>c===code)?.[1];
 const exportFact=list=>list.some(([,t])=>t.startsWith('The latest roster export does not show'));
 check('R3b the default export and rank codes of a held reply are worded as not reported (unconfigured site: both; no export: the rank code, while the export code the server also gave as its reason keeps its sentence); no sentence states a fact about an export the reply does not carry',
  holdOf(unconfigured.holds,'native-snapshot-unavailable')===NOT_SNAPSHOT&&holdOf(unconfigured.holds,'native-rank-scheme-unconfirmed')===NOT_RANKS&&holdOf(noExport.holds,'native-rank-scheme-unconfirmed')===NOT_RANKS
  &&holdOf(noExport.holds,'native-snapshot-unavailable')==='There is no complete roster export from the last ten minutes.'&&!exportFact(unconfigured.holds)&&!exportFact(noExport.holds),JSON.stringify({unconfigured:unconfigured.holds,noExport:noExport.holds}));

 console.log('\n== Part R2: a qualified 1,000-member scan ==');
 const members=(n,prefix)=>Array.from({length:n},(_,i)=>({name:prefix+' '+String(i).padStart(4,'0'),key:prefix.toLowerCase()+' '+String(i).padStart(4,'0'),guid:'Player-6933-'+(prefix==='Discovery Member'?i+1:5000+i).toString(16).padStart(8,'0'),slot:i===0?0:9}));
 const seed=async(id,source,rows,exportedAt=at-120)=>{await fixtureRun("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted) VALUES(?1,?2,?2,?2,?3,?4,1,1)",id,exportedAt,source,rows.length);
  await fixtureRun("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level) SELECT ?1,json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.guid'),CASE json_extract(value,'$.slot') WHEN 0 THEN 'Guild Master' ELSE 'Initiate' END,json_extract(value,'$.slot'),60 FROM json_each(?2)",id,JSON.stringify(rows));};
 await seed(1,schemes.qualifiedNativeSnapshotSource(SCOPE.guild,SCOPE.realm),members(1000,'Discovery Member'));
 await open();const q1={o:outcome(),r:last(),progress:progress(),words:words(),risks:frameOf('Initiate space buffer · review only')?.querySelectorAll('tbody tr').length??0};record('qualified first page',q1.r);
 check('R4 a real qualified first page (v235, rank table pinned) is shown: the rank table in force, 20 of 1000 examined, its 19 unverified Initiates in the space buffer',q1.o==='shown'&&q1.r.json.protocol==='officer-operations-v235'&&q1.r.json.status==='partial'&&q1.r.json.rankProfile===L().PROFILE&&!!pg.app.querySelector('[data-launch234-ranks="current"]')&&q1.progress.startsWith('Discovery partial: 20 of 1000')&&q1.risks===19&&typeof q1.r.json.nextCursor==='string',JSON.stringify({o:q1.o,progress:q1.progress,risks:q1.risks}));
 const q1next=q1.r.json.nextCursor;await press('next');const q2={o:outcome(),r:last(),progress:progress(),words:words()};record('qualified later page',q2.r);
 check('R5 its later page, read through the real nextCursor sent unchanged, is shown as page 2 of the same scan (40 of 1000)',q2.o==='shown'&&q2.r.cursor===q1next&&q2.r.json.entitlements.offset===20&&q2.r.json.scan.id===q1.r.json.scan.id&&q2.progress.startsWith('Discovery partial: 40 of 1000')&&badges().length===2,JSON.stringify({o:q2.o,progress:q2.progress,badges:badges()}));

 console.log('\n== Part R3: the real errors of a later page are a restart ==');
 const restartCase=async(label,before,after)=>{await open();const first=outcome();await before();const pressed=await press('next');const r=last(),o=outcome(),notice=pg.app.querySelector('[data-launch235-restart]')?.textContent||'',status=pg.app.querySelector('[data-launch234] [role=status]')?.textContent||'';record(label,r);await after();
  const shown=pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229],[data-launch-invite233]').length;const refresh=btn('Refresh first page');const refreshOk=!!refresh&&!refresh.disabled&&!refresh.hidden;await press('Refresh first page');return {first,pressed,status:r.status,error:r.json?.error,o,notice,statusLine:status,rowsLeft:shown,refreshOk,again:outcome()};};
 const secret=CONFIGURED.VERIFY_SECRET;
 const invalid=await restartCase('invalid_discovery_cursor (VERIFY_SECRET rotated)',async()=>{LAUNCH={...LAUNCH,VERIFY_SECRET:secret+'-rotated'};},async()=>{LAUNCH={...CONFIGURED};});
 const capacity=await restartCase('discovery_cursor_capacity (seal over the 8,192 limit)',async()=>{oversizeSeal=true;},async()=>{oversizeSeal=false;});
 const changed=await restartCase('launch_cursor_source_changed (export changed)',async()=>{await fixtureRun("UPDATE roster_members SET level=59 WHERE snapshot_id=1 AND name_key='discovery member 0500'");},async()=>{await fixtureRun("UPDATE roster_members SET level=60 WHERE snapshot_id=1 AND name_key='discovery member 0500'");});
 const restartOk=(c,code,status)=>c.first==='shown'&&c.pressed&&c.status===status&&c.error===code&&c.o==='restart:'+code&&/Start again from the first page/.test(c.notice)&&c.statusLine===c.notice&&!c.notice.includes(code)&&c.rowsLeft===0&&c.refreshOk&&c.again==='shown';
 check('R6 the real 400 invalid_discovery_cursor (the seal key changed) is shown as "start again from the first page", nothing of the scan stays, and Refresh first page reads again',restartOk(invalid,'invalid_discovery_cursor',400),JSON.stringify(invalid));
 check('R7 the real 400 discovery_cursor_capacity is shown as a site limit and "start again from the first page"',restartOk(capacity,'discovery_cursor_capacity',400)&&/limit of the site/.test(capacity.notice),JSON.stringify(capacity));
 check('R8 the real 409 launch_cursor_source_changed (the export changed during the scan) is shown as "start again from the first page"',restartOk(changed,'launch_cursor_source_changed',409),JSON.stringify(changed));

 console.log('\n== Part R3b: a held later page ends the scan with its own holds (review of 13 Nov 2026, finding 1) ==');
 const ENDED_STATUS='The site held this page, so the scan stopped. Start again from the first page.';
 const heldLater=async(label,arm,disarm)=>{await open();const first=outcome();arm();const pressed=await press('next');const r=last();await disarm();
  const text=app(),v={first,pressed,status:r.status,protocol:r.json?.protocol??null,pageStatus:r.json?.status??null,heldReasons:r.json?.heldReasons??null,o:outcome(),
   ended:pg.app.querySelector('[data-launch235-scan-ended]')?.textContent||'',endedFirst:text.indexOf('This scan stopped')>=0&&text.indexOf('This scan stopped')<text.indexOf('Guild message of the day'),
   statusLine:pg.app.querySelector('[data-launch234] [role=status]')?.textContent||'',holds:holds(),pages:badges().length,rows:pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229],[data-launch-invite233]').length,
   more:!!nextBtn()&&!nextBtn().hidden,refreshOk:!!btn('Refresh first page')&&!btn('Refresh first page').disabled,scope:scopeText(),progress:progress(),
   wrongSentence:/Ranks were held on one page|The rank table changed between pages|Ranks are held because/.test(text)};record(label,r);
  await press('Refresh first page');v.again=outcome();v.endedAgain=!!pg.app.querySelector('[data-launch235-scan-ended]');return v;};
 const endedOk=(v,code,sentence)=>v.first==='shown'&&v.pressed&&v.status===200&&v.protocol==='officer-operations-v235'&&v.pageStatus==='held'&&Array.isArray(v.heldReasons)&&v.heldReasons.includes(code)
  &&v.o==='shown'&&/the scan stopped here/.test(v.ended)&&/Start again from the first page/.test(v.ended)&&v.endedFirst&&v.statusLine===ENDED_STATUS&&holdOf(v.holds,code)===sentence
  &&holdOf(v.holds,'native-snapshot-unavailable')===NOT_SNAPSHOT&&holdOf(v.holds,'native-rank-scheme-unconfirmed')===NOT_RANKS&&plainHolds(v.holds)&&v.pages===0&&v.rows===0&&!v.more&&v.refreshOk
  &&v.scope==='This reply carries nothing from a roster export. The holds below say why.'&&v.progress==='No confirmed rows are available from this read.'&&!v.wrongSentence&&v.again==='shown'&&!v.endedAgain;
 // The export changes after the inner reader's first roster read (sourceRows229) and before its check (readLaunchPage229).
 const innerChanged=await heldLater('qualified later page, export changed during the inner read (native-snapshot-changed)',()=>{let count=0;stmtHook=sql=>{if(/FROM roster_snapshots/.test(sql)&&/roster_members/.test(sql)&&!/'unknown' AS verification/.test(sql)&&++count===1){stmtHook=null;pendingWrite=fixtureRun("UPDATE roster_members SET level=58 WHERE snapshot_id=1 AND name_key='discovery member 0030'");}};},
  async()=>{await pendingWrite;pendingWrite=null;await fixtureRun("UPDATE roster_members SET level=60 WHERE snapshot_id=1 AND name_key='discovery member 0030'");});
 check('R8b a real held later page of a qualified scan (the export changed during the inner read: 200, v235, held, native-snapshot-changed) ends the scan and is shown with its own holds, not refused as a rank-table change; Refresh first page starts a new scan',endedOk(innerChanged,'native-snapshot-changed','The roster export or the site’s settings changed during the read. Read the page again.'),JSON.stringify(innerChanged));

 console.log('\n== Part R4: a rank-held 1,000-member scan with a real invite ==');
 const scopeHash=require('node:crypto').createHash('sha256').update('native-scope|1|'+SCOPE.guild+'|'+SCOPE.realm).digest('hex').slice(0,16);
 const queueInvite=async()=>{const t=Math.floor(Date.now()/1000);await fixtureRun("DELETE FROM invite_queue WHERE approved_by='officer233'");await fixtureRun("INSERT INTO invite_queue(name_key,name,discord_id,note,status,created_at,approved_by,attempts) VALUES(?,?,?,?,'queued',?,'officer233',0)",'synthetic whisperer','Synthetic Whisperer','300000000000000777',JSON.stringify({version:242,proofId:'e'.repeat(32),guid:'Player-6933-0000ffff',fullName:'Synthetic Whisperer',scopeHash,observedAt:t-2,expiresAt:t+58,generation:null,pendingId:1,source:'native-who-whisper-v242'}),t-2);};
 await queueInvite();LAUNCH={...CONFIGURED,CANONICAL_RANKS233:undefined};await open();
 const policySentence='Ranks are held because the site’s Discord rank settings do not use the 12 November ladder yet.';
 const h1={o:outcome(),r:last(),rank:pg.app.querySelector('[data-launch235-rank-held]')?.textContent||'',also:!!pg.app.querySelector('[data-launch235-rank-also]'),invites:invites(),badge:frameOf('Unguilded Knight+ invite queue')?.querySelector('.badge')?.textContent,
  enabled:['Refresh first page','Scan entire roster','Copy MOTD','Copy expanded bulletin','Recheck this page',NEXT_ROSTER].map(t=>[t,!!btn(t)&&!btn(t).disabled&&!btn(t).hidden]),progress:progress(),words:words(),view:viewText(),note:pg.app.querySelector('[data-launch235-no-promotions]')?.textContent||'',rankFrame:frameOf('Ranks held on this read')?.textContent||'',holds:holds()};record('rank-held first page (policy off)',h1.r);
 check('R9 a real rank-held first page (partial, rank fields null, reason directive-rank-policy-held) is shown and says why in one sentence, with the export check named as still to come',h1.o==='shown'&&h1.r.json.status==='partial'&&h1.r.json.rankProfile===null&&h1.r.json.heldReasons.includes('directive-rank-policy-held')&&h1.r.json.held.length===20&&h1.rank===policySentence&&h1.also&&!h1.holds.some(([c])=>c==='directive-rank-policy-held')&&!pg.app.querySelector('[data-launch234-ranks]'),JSON.stringify({o:h1.o,rank:h1.rank,also:h1.also,holds:h1.holds}));
 check('R10 the reply qualifies its v242 invite on its own, and the page shows it current with the read, copy, recheck and next-page controls enabled',h1.r.json.invites.length===1&&h1.invites.length===1&&h1.invites[0].source==='native-who-whisper-v242'&&h1.invites[0].cells[3]==='Recheck and invite in-game'&&h1.badge==='1'&&h1.enabled.every(([,on])=>on),JSON.stringify({invites:h1.invites,badge:h1.badge,enabled:h1.enabled}));
 check('R11 "no promotions" on a rank-held page is worded as recommendations being held, never as nobody being due (no "0 currently eligible", no empty promotion table)',/Promotion recommendations for this page are held/.test(h1.note)&&/Promotion recommendations are held until ranks are confirmed\. This does not mean that nobody is due/.test(h1.rankFrame)&&/Promotion recommendations are held while ranks are held, so none are counted\./.test(h1.progress)&&!/currently eligible recommendations/.test(app())&&!app().includes('None on this page.')&&!pg.app.querySelector('[data-launch-promotion229],[data-launch-advisory229]'),JSON.stringify({note:h1.note,progress:h1.progress}));
 // A minute later (page clock +61 s; the server's clock is real): the first page's 60 second window is over, the scan's is not.
 jump=61000;const h1next=h1.r.json.nextCursor;await press('next');
 const h2={o:outcome(),r:last(),badges:badges(),words:words(),view:viewText(),invites:invites(),badge:frameOf('Unguilded Knight+ invite queue')?.querySelector('.badge')?.textContent,scanLine:frameOf('Discovery and current eligibility')?.querySelectorAll('p')[2]?.textContent||'',progress:progress()};record('rank-held later page',h2.r);
 check('R12 the rank-held later page is read through the real nextCursor and shown; a minute after the first page, that page is stale while the 600 second scan is still current',h2.o==='shown'&&h2.r.cursor===h1next&&h2.r.json.entitlements.offset===20&&h2.r.json.scan.expiresAt-h2.r.json.fetchedAt>120
  &&JSON.stringify(h2.badges)===JSON.stringify(['Examined page 1 = Roster page stale','Examined page 2 = Roster page current'])&&h2.invites.length===1&&h2.invites[0].cells[3]!=='Recheck and invite in-game'&&h2.badge==='0'&&/^This scan is current until [^.]+[.] Recheck a page to read its roster members again[.]$/.test(h2.scanLine),JSON.stringify(h2));
 // Item 6: a recheck of the stale first page, a minute on (the page clock still +61 s), sends that page's own link.
 replies.length=0;pg.app.querySelector('#launch-recheck229-0')?.click();await calm();const h3={o:outcome(),r:last(),words:words(),view:viewText()};record('rank-held first page rechecked',h3.r);
 jump=0;
 // The server's clock passes the page's 60 second window between the page's two membership reads (readDiscoveryOperations235).
 const windowOut=await heldLater('rank-held later page, server clock +61 s during the read (launch-read-window-exhausted)',()=>{let count=0;stmtHook=sql=>{if(/'unknown' AS verification/.test(sql)&&++count===2){stmtHook=null;skew=61000;}};},async()=>{skew=0;});
 check('R12b a real held later page of a rank-held scan (the read window ran out: 200, v235, held, launch-read-window-exhausted) ends the scan and is shown with its own holds, not refused as a rank-mode change; Refresh first page starts a new scan',endedOk(windowOut,'launch-read-window-exhausted','The read ran out of time before it finished, so nothing from it is shown.'),JSON.stringify(windowOut));

 console.log('\n== Part R5: a rank-held last page (partial, nextCursor null) ==');
 await seed(2,'addon-native-v1:'+JSON.stringify(SCOPE),members(45,'Held Member'));LAUNCH={...CONFIGURED};await queueInvite();await open();
 const n1={o:outcome(),r:last(),rank:pg.app.querySelector('[data-launch235-rank-held]')?.textContent||''};record('rank-held first page (export ranks)',n1.r);
 await press('next');const n2={o:outcome(),r:last()};record('rank-held middle page',n2.r);
 await press('next');const n3={o:outcome(),r:last(),more:nextBtn(),progress:progress(),words:words(),view:viewText(),heldRows:frameOf('Held evidence')?.querySelectorAll('tbody tr').length??0};record('rank-held last page',n3.r);
 check('R13 a real rank-held scan of an export without the ten ranks (reason native-rank-scheme-unconfirmed) is read to its last page: partial with nextCursor null, no next-page control, 45 of 45 examined, every member held',n1.o==='shown'&&n1.rank==='Ranks are held because the latest roster export does not show the ten ranks of the 12 November ladder, or a member’s rank does not match its slot.'
  &&n2.o==='shown'&&n3.o==='shown'&&n3.r.json.status==='partial'&&n3.r.json.nextCursor===null&&n3.r.json.entitlements.offset===40&&n3.r.json.entitlements.scanned===5&&n3.r.json.held.every(r=>r.reason==='native-rank-scheme-unconfirmed')&&!!n3.more&&n3.more.hidden&&n3.progress.startsWith('Discovery complete: 45 of 45 roster members examined')&&n3.heldRows===45,JSON.stringify({n1:n1.o,n2:n2.o,n3:{o:n3.o,status:n3.r.json?.status,next:n3.r.json?.nextCursor,progress:n3.progress,held:n3.heldRows}}));
 // Item 6 (13 Nov 2026, Codex's reading of the reader): the per-page words of real rank-held and qualified pages.
 const INTRO234='Read-only discovery for up to 1,000 roster members. Scan follows at most 50 bounded pages when you ask. Each page has its own short role-evidence window: discovery complete does not mean every recommendation is still actionable. The addon rechecks GUID, guild, realm, rank and permission before each hardware action.';
 const INTRO_ROSTER='Read-only discovery for up to 1,000 roster members. Scan follows at most 50 bounded pages when you ask. While ranks are held, each page lists roster members without promotion recommendations and is current for a short time. The addon rechecks GUID, guild, realm, rank and permission before each hardware action.';
 const DONE_ROSTER='Read complete. While ranks are held, this page lists roster members and invites only.',READING_ROSTER='Reading at most 20 roster members…',READING234='Reading at most 20 current Discord role records…';
 const rosterCurrent=(from,to,total)=>new RegExp('^Roster members '+from+' to '+to+' of '+total+', read from the roster export[.] This page is current until [^.]+[.]$');
 const rosterStale=(from,to,total)=>new RegExp('^Roster members '+from+' to '+to+' of '+total+', read from the roster export[.] This page was current until [^.]+[.] Recheck it to read it again[.]$');
 const pageIs=(p,title,badge,re)=>!!p&&p.title===title&&p.badge===badge&&re.test(p.sentence);
 const rh=[h1,h2,h3,n3];
 check('R18 a real rank-held scan speaks of roster pages, never of role evidence or role checks: first page current with "Load next 20 roster members", the next page read under that label and the first page then stale, a recheck of that page sending its own link and making it current again, the last page of 45 members; a qualified page keeps the v234 words',
  pageIs(h1.words.pages[0],'Examined page 1','Roster page current',rosterCurrent(1,20,1000))&&h1.words.pages.length===1&&h1.words.next?.label===NEXT_ROSTER&&h1.words.next.shown&&h1.words.intro===INTRO_ROSTER&&h1.words.status===DONE_ROSTER&&/^This scan is current until [^.]+[.] Recheck a page to read its roster members again[.]$/.test(h1.words.scanLine)&&h1.r.reading===READING234
  &&h2.r.reading===READING_ROSTER&&pageIs(h2.words.pages[0],'Examined page 1','Roster page stale',rosterStale(1,20,1000))&&pageIs(h2.words.pages[1],'Examined page 2','Roster page current',rosterCurrent(21,40,1000))&&h2.words.next?.label===NEXT_ROSTER&&h2.words.status===DONE_ROSTER
  &&h3.o==='shown'&&h3.r.cursor===h1.r.json.pageCursor&&h3.r.json?.entitlements?.offset===0&&h3.r.reading===READING_ROSTER&&pageIs(h3.words.pages[0],'Examined page 1','Roster page current',rosterCurrent(1,20,1000))&&pageIs(h3.words.pages[1],'Examined page 2','Roster page current',rosterCurrent(21,40,1000))
  &&pageIs(n3.words.pages[2],'Examined page 3','Roster page current',rosterCurrent(41,45,45))&&n3.words.next?.label===NEXT_ROSTER&&!n3.words.next.shown
  &&rh.every(v=>!ROLE_WORDS.test(v.view)&&v.words.intro===INTRO_ROSTER)
  &&pageIs(q1.words.pages[0],'Examined page 1','Role evidence current',/^Role evidence expires [^.]+[.] Each rank step needs its own attended click or key press in the addon[.]$/)&&q1.words.next?.label===NEXT234&&q1.words.next.shown&&q1.words.intro===INTRO234&&/^Scan witness expires [^.]+[.] Recheck an examined page to refresh only its role evidence[.]$/.test(q1.words.scanLine)
  &&q1.words.status==='Read complete. Discovery and current action eligibility are shown separately.'&&q2.r.reading===READING234&&q2.words.pages.length===2&&q2.words.pages.every(p=>p.badge==='Role evidence current'&&/^Role evidence expires /.test(p.sentence)),
  JSON.stringify({h1:h1.words,h1reading:h1.r.reading,h2:h2.words,h2reading:h2.r.reading,h3:{o:h3.o,sameLink:h3.r.cursor===h1.r.json.pageCursor,reading:h3.r.reading,words:h3.words},n3:n3.words,roleWords:rh.map(v=>(v.view.match(ROLE_WORDS)||[null])[0]),q1:q1.words,q2:{reading:q2.r.reading,pages:q2.words.pages}}));
 const changedHeld=await restartCase('launch_cursor_source_changed (rank-held scan, export changed)',async()=>{await fixtureRun("UPDATE roster_members SET level=59 WHERE snapshot_id=2 AND name_key='held member 0030'");},async()=>{await fixtureRun("UPDATE roster_members SET level=60 WHERE snapshot_id=2 AND name_key='held member 0030'");});
 check('R14 the same real 409 on a rank-held scan is a restart too',restartOk(changedHeld,'launch_cursor_source_changed',409),JSON.stringify(changedHeld));

 console.log('\n== Part R6: single-field changes of real pages that one scan must refuse ==');
 // Each case reads a real first page, then asks for the next (or the same) page; the real reply to that read is changed in
 // one field before the page sees it. The scan must be refused as a whole, with its own plain reason.
 const mutated=async(label,mutate,action='next')=>{if(action==='first'){override=(d,cursor)=>cursor?null:mutate(d);await open();override=null;return {label,first:'shown',pressed:true,o:outcome(),drawn:pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229],[data-launch-invite233]').length+(pg.app.querySelector('#launch-motd229')?1:0)};}await open();const first=outcome();override=(d,cursor)=>cursor?mutate(d):null;const pressed=action==='recheck'?!!pg.app.querySelector('#launch-recheck229-0')&&(replies.length=0,pg.app.querySelector('#launch-recheck229-0').click(),await calm(),true):await press(action);override=null;
  return {label,first,pressed,o:outcome(),drawn:pg.app.querySelectorAll('[data-launch-promotion229],[data-launch-advisory229],[data-launch-invite233]').length+(pg.app.querySelector('#launch-motd229')?1:0)};};
 const M=[];
 M.push([await mutated('offset 40 in answer to the link for offset 20',d=>{d.entitlements.offset=40;return d;}),'refused:page-offset']);
 M.push([await mutated('a recheck of page 1 answered with offset 20',d=>{d.entitlements.offset=20;d.entitlements.unscanned-=20;return d;},'recheck'),'refused:page-offset']);
 M.push([await mutated('roster size 999 on page 2',d=>{d.entitlements.total=999;return d;}),'refused:scan-changed']);
 M.push([await mutated('member count 999 on page 2',d=>{d.memberCount=999;return d;}),'refused:scan-changed']);
 M.push([await mutated('an invite on page 2',d=>{d.invites=[{queueId:9,proofId:'f'.repeat(32),name:'Synthetic Whisperer',guid:'Player-6933-0000ffff',fullName:'Synthetic Whisperer',scopeHash:d.scopeHash,observedAt:d.fetchedAt,expiresAt:d.fetchedAt+60,reason:'knight-unguilded',source:'native-who-whisper-v242'}];return d;}),'refused:invite-not-first-page']);
 M.push([await mutated('a first page whose 60 s window outlasts its scan (scan ends in 30 s)',d=>{d.scan.expiresAt=d.fetchedAt+30;return d;},'first'),'refused:page-clock']);
 M.push([await mutated('page window over 60 s',d=>{d.expiresAt=d.fetchedAt+61;return d;}),'refused:page-clock']);
 M.push([await mutated('rank-held reason swapped mid-scan',d=>{d.heldReasons=d.heldReasons.map(c=>c==='native-rank-scheme-unconfirmed'?'directive-rank-policy-held':c);for(const r of d.held)r.reason='directive-rank-policy-held';return d;}),'refused:rank-mode-changed']);
 M.push([await mutated('rank-held page continued as ready',d=>{d.status='ready';return d;}),'refused:rank-mode-changed']);
 M.push([await mutated('page 2 under the v234 label',d=>{d.protocol='officer-operations-v234';return d;}),'unconfirmed']);
 M.push([await mutated('next-page link of 8,193 characters',d=>{d.nextCursor='A'.repeat(8128)+'.'+'a'.repeat(64);return d;}),'unconfirmed']);
 const badM=M.filter(([c,want])=>c.first!=='shown'||!c.pressed||c.o!==want||c.drawn!==0);
 check('R15 '+M.length+' single-field changes of real rank-held pages are each refused as a whole with their own reason (page offset, roster size, invites after page 1, page window inside the scan window, rank mode, family, link bound)',badM.length===0,JSON.stringify(badM.map(([c,want])=>({...c,want}))));
 const linkOk=await mutated('a next-page link of exactly 8,192 characters is followed (the server then refuses it)',d=>({...d,nextCursor:'A'.repeat(8127)+'.'+'a'.repeat(64)}));
 check('R16 the 8,192 bound is the v235 family\'s: a real page whose next-page link has exactly 8,192 characters is shown',linkOk.o==='shown'&&linkOk.first==='shown',JSON.stringify(linkOk));
 // Review of 13 Nov 2026 (finding 3): a rank-held page counts exactly its own rows, and space-buffer rows of a qualified page have the producer's shape.
 const C=[];
 C.push([await mutated('one held row removed on page 2',d=>{d.held.pop();return d;}),'refused:page-counts']);
 C.push([await mutated('scanned 7 on page 2 (20 held rows)',d=>{d.entitlements.scanned=7;return d;}),'refused:page-counts']);
 C.push([await mutated('unscanned +20 on page 2',d=>{d.entitlements.unscanned+=20;return d;}),'refused:page-counts']);
 C.push([await mutated('member count one more than the roster size on a first page',d=>{d.memberCount+=1;return d;},'first'),'refused:page-counts']);
 C.push([await mutated('roster size one more than the member count on a first page',d=>{d.entitlements.total+=1;d.entitlements.unscanned+=1;return d;},'first'),'refused:page-counts']);
 C.push([await mutated('export id -1 on a first page',d=>{d.snapshotId=-1;return d;},'first'),'refused:page-counts']);
 C.push([await mutated('export id missing on a first page',d=>{delete d.snapshotId;return d;},'first'),'refused:page-counts']);
 C.push([await mutated('no next-page link on a first page with members left',d=>{d.nextCursor=null;return d;},'first'),'refused:page-counts']);
 C.push([await mutated('page size 21 on a first page',d=>{d.entitlements.pageSize=21;return d;},'first'),'refused:page-counts']);
 const badC=C.filter(([c,want])=>c.first!=='shown'||!c.pressed||c.o!==want||c.drawn!==0);
 check('R16b '+C.length+' changes of the counts of real rank-held pages (held rows, scanned, unscanned, member count, roster size, export id, next-page link, page size) are each refused as a whole',badC.length===0,JSON.stringify(badC.map(([c,want])=>({...c,want}))));
 await seed(3,schemes.qualifiedNativeSnapshotSource(SCOPE.guild,SCOPE.realm),members(40,'Risk Member'),Math.floor(Date.now()/1000)-120);
 await open();const riskControl={o:outcome(),risks:frameOf('Initiate space buffer · review only')?.querySelectorAll('tbody tr').length??0};
 const K=[];
 for(const [label,mutate] of [['a space-buffer row replaced by a number',d=>{d.riskBuffer[0]=7;}],['a space-buffer row replaced by text',d=>{d.riskBuffer[0]='x';}],['a space-buffer row replaced by a list',d=>{d.riskBuffer[0]=[];}],['a space-buffer row replaced by an empty object',d=>{d.riskBuffer[0]={};}],
  ['a space-buffer row with level 0',d=>{d.riskBuffer[0].level=0;}],['a space-buffer row with an extra field',d=>{d.riskBuffer[0].targetSlot=7;}],['a space-buffer row under another reason',d=>{d.riskBuffer[0].reason='knight-veteran';}],['a space-buffer row in slot 8',d=>{d.riskBuffer[0].currentSlot=8;}],
  ['a space-buffer row not review-only',d=>{d.riskBuffer[0].reviewOnly=false;}],['a space-buffer row with a bad character id',d=>{d.riskBuffer[0].guid='Not a GUID';}],['a space-buffer row offline for minus one day',d=>{d.riskBuffer[0].lastOnlineDays=-1;}]])
  K.push([await mutated(label,d=>{mutate(d);return d;},'first'),'refused:risk-row-shape']);
 K.push([await mutated('a space-buffer row without a name on page 2',d=>{delete d.riskBuffer[0].name;return d;}),'refused:risk-row-shape']);
 const badK=K.filter(([c,want])=>c.first!=='shown'||!c.pressed||c.o!==want||c.drawn!==0);
 check('R16c the unchanged real qualified page shows its space buffer, and '+K.length+' changes of one of its rows are each refused as a whole',riskControl.o==='shown'&&riskControl.risks>0&&badK.length===0,JSON.stringify({riskControl,bad:badK.map(([c,want])=>({...c,want}))}));
 // Our review of 13 Nov 2026 (LOW a): a qualified page ties its member count and page size to its scan, as a rank-held page does.
 const Q=[];
 Q.push([await mutated('member count one more than the roster size on a qualified first page',d=>{d.memberCount+=1;return d;},'first'),'refused:page-counts']);
 Q.push([await mutated('page size 21 on a qualified first page',d=>{d.entitlements.pageSize=21;return d;},'first'),'refused:page-counts']);
 Q.push([await mutated('page size 21 on qualified page 2',d=>{d.entitlements.pageSize=21;return d;}),'refused:page-counts']);
 Q.push([await mutated('member count 41 on qualified page 2',d=>{d.memberCount=41;return d;}),'refused:scan-changed']);
 const badQ=Q.filter(([c,want])=>c.first!=='shown'||!c.pressed||c.o!==want||c.drawn!==0);
 check('R16d a real qualified page whose member count is not its roster size, or whose page size is not 20, is refused as a whole (first page and page 2); a member count that changes between pages is a changed scan',riskControl.o==='shown'&&badQ.length===0,JSON.stringify(badQ.map(([c,want])=>({...c,want}))));
 const src235=SRC235,launchFn=fs.readFileSync(process.env.UI280_APP_JS||path.join(root,'public','static','app.js'),'utf8').split('async function adminLaunchOperations229')[1]?.split('async function adminOverview')[0]||'';
 check('R17 the page never decodes a cursor body: neither the v235 reader nor the launch view decodes base64 or parses a cursor',launchFn.length>1000&&!/atob\(|base64|\.split\('\.'\)|JSON\.parse\(/.test(src235)&&!/atob\(|JSON\.parse\(/.test(launchFn));

 console.log('\n== The real replies seen, and what the page showed ==');
 for(const row of table)console.log('  '+JSON.stringify(row));
 subtle.sign=sign;Date.now=realNow;db.prepare=prepare;
 console.log('\n'+ok+'/'+n+' real v235 launch checks passed');process.exit(ok===n?0:1);
})().catch(e=>{console.error(e);process.exit(1)});`;
const mR=new ModuleR(__filename,module);mR.filename=__filename;mR.paths=module.paths;
mR._compile(fixtureR.slice(0,cutsR[0].index).replace(APP_LINE_R,'const APP_JS = fs.readFileSync(process.env.UI280_APP_JS || path.join(root, "public", "static", "app.js"), "utf8");')+'\n'+runR,__filename);
