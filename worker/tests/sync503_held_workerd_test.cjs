'use strict';
// 14 Nov 2026 (the refused reload, design SYNC503 2.7): the held-request answers and log lines through the REAL Worker
// on a REAL local D1 in Workerd (Miniflare). Only Discord (outbound HTTP) is replaced, and one native D1 batch per case
// is made to fail at the binding's own transport (tests/sync503_held_workerd_fixture.mjs). Every console argument of
// every request is checked against the closed sets. Native sends/statement counts and real post-commit effects are
// checked separately from fired injections. The whole command, including owned runtime cleanup, is bounded.
// Nothing is retried. Run from the worker folder:
//   node tests/sync503_held_workerd_test.cjs
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build,stop:stopBuild}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.join(__dirname,'..'),out=process.env.OLYMPUS_SYNC503_EVIDENCE||fs.mkdtempSync(path.join(os.tmpdir(),'olv-sync503-'));fs.mkdirSync(out,{recursive:true});
const H=b=>crypto.createHash('sha256').update(b).digest('hex');
const entry='import {sync503Fixture} from '+JSON.stringify(path.join(__dirname,'sync503_held_workerd_fixture.mjs'))+';export default sync503Fixture;';
let source=Buffer.alloc(0),pins=[];
const COMMAND_MS=180000,CLEANUP_MS=15000,startedAt=Date.now(),abort=new AbortController();
let deadlineTimer,cleanupCompleted=false;
const deadline=new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>{abort.abort();reject(Error('sync503 whole-command deadline exceeded'));},COMMAND_MS-CLEANUP_MS);});
const ID='300000000000000003',GUILD='236932545793490944',http=[];
let mf,passed=0,failed=0,memberMode='member';const results=[];
const check=(name,ok,detail)=>{results.push({name,ok:!!ok});if(ok){passed++;console.log('PASS '+name);}else{failed++;console.log('FAIL '+name+(detail===undefined?'':'\n    '+(typeof detail==='string'?detail:JSON.stringify(detail)).slice(0,1500)));}};
const jar=(...rs)=>rs.flatMap(r=>r.setCookies||[]).map(v=>v.split(';')[0]).join('; ');
const OLD_HELD='{"error":"erasure_held","message":"The original request is no longer admitted or its database outcome was not confirmed. Refresh the account state before proceeding."}';
const READ_UNAVAILABLE='{"error":"read_unavailable","message":"The site could not read its data for a moment. Please try again."}';
const WRITE_HELD='{"error":"write_admission_held","message":"The current source installation or transaction outcome is not confirmed."}';
const SITE_ACCESS='{"error":"site_access_unavailable"}';
// Cloudflare's documented texts as recorded in the groundwork of 14 Nov 2026 (not seen in this project's production log).
const DOCUMENTED=[
 ['D1 DB reset because its code was updated.','storage_reset'],
 ['Internal error while starting up D1 DB storage caused object to be reset.','storage_reset'],
 ['Internal error in D1 DB storage caused object to be reset.','storage_reset'],
 ['Network connection lost.','storage_network'],
 ['Replica disconnected from primary.','storage_transient'],
 ['Cannot resolve D1 DB due to transient issue on remote node.','storage_transient'],
 ["Can't read from request stream because client disconnected.",'storage_transient'],
 ['D1 DB is overloaded. Requests queued for too long.','storage_overloaded'],
 ['D1 DB is overloaded. Too many requests queued.','storage_overloaded'],
 ['D1 DB is overloaded. Too many resources consumed within a 10 second window','storage_overloaded'],
 ["D1 DB's isolate exceeded its memory limit and was reset.",'storage_limit'],
 ['D1 DB exceeded its CPU time limit and was reset.','storage_limit'],
 ['D1 DB storage operation exceeded timeout which caused object to be reset.','storage_limit'],
 ["Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan",'storage_limit'],
 ["Your account has exceeded D1's maximum account storage limit, please contact Cloudflare",'storage_limit'],
 ['Exceeded maximum DB size.','storage_limit'],
 ['D1 query result exceeded the maximum response size limit of 50 MB','storage_limit'],
];
// Only the classes Cloudflare lists as retryable say read_unavailable, and only for a GET or HEAD read group.
const RETRYABLE=new Set(['storage_reset','storage_network','storage_transient']);
const SECRET=' private token=abc.def.ghi Tag#1234 site_users 300000000000000093';
let HELD,ROUTES;const ELAPSED=new Set(['under_100ms','under_500ms','under_2s','2s_or_more','unknown']),DURATION=new Set(['under_10ms','under_50ms','under_200ms','under_1s','1s_or_more','unknown']),ROWS=new Set(['under_1k','under_10k','under_100k','under_1m','1m_or_more','unknown']),GROUPS=new Set(['read','write','unknown']);
const REF=/^(upstream|d1|timeout|aborted|type|syntax|range|error|thrown)(\([1-5][0-9]{2}\))?$/;
const allLines=[],transportAudits=[];
function auditTransport(v,route){
 if(!Array.isArray(v.wires))return;
 for(const w of v.wires){assert.equal(w.transportAttempts,1,'one binding transport attempt');assert.ok(Number.isInteger(w.statements)&&w.statements>0&&w.statements<=100,'actual native statement ceiling');assert.ok(w.nativeSends===0||w.nativeSends===1,'one actual native send per attempt');}
 if(v.fault){
  const affected=v.wires.filter(w=>w.injected!==null);assert.equal(affected.length,1,'one affected group');
  assert.equal(v.wires.filter(w=>w.kind===v.fault.target).length,v.fault.nth,'affected group was not repeated');
  const committed=['rotate','mutate','witness','commit-reject','commit-invalid'].includes(v.fault.kind);
  assert.equal(affected[0].nativeSends,committed?1:0,'real provider send count, distinct from an injected refusal');
 }else for(const w of v.wires)assert.equal(w.nativeSends,1,'normal groups reach actual D1 once');
 transportAudits.push({route,fault:v.fault??null,wires:v.wires});
}
function affectedCount(v,count){const w=v.wires.filter(w=>w.injected!==null);return w.length===1&&w[0].transportAttempts===1&&w[0].statements===count;}
const onlyGroup=(v,count)=>v.wires.length===1&&v.wires[0].statements===count&&v.wires[0].nativeSends===1;
// Each console line must be one of the fixed formats with every position from its closed set.
function closedLine(line){
 const a=line.args;if(!a.every(x=>typeof x==='string'))return false;
 switch(a[0]){
  case 'privacy request held':return line.level==='error'&&a.length===5&&['site_session','subject_generation'].includes(a[1])&&HELD.has(a[2])&&GROUPS.has(a[3])&&ELAPSED.has(a[4]);
  case 'request held':return line.level==='error'&&(a[1]==='site'?a.length===6&&GROUPS.has(a[4])&&ROUTES.has(a[5]):a[1]==='write_admission'&&a.length===5&&ROUTES.has(a[4]))&&REF.test(a[2])&&HELD.has(a[3]);
  case 'site access unavailable':return line.level==='error'&&a.length===4&&['current_user','membership'].includes(a[1])&&REF.test(a[2])&&HELD.has(a[3]);
  case 'unhandled':return line.level==='error'&&a.length===5&&/^[0-9a-f]{8}$/.test(a[1])&&ROUTES.has(a[2])&&REF.test(a[3])&&HELD.has(a[4]);
  case 'schema check failed':return line.level==='error'&&a.length===3&&REF.test(a[1])&&HELD.has(a[2]);
  case 'proof cost':return line.level==='log'&&a.length===3&&DURATION.has(a[1])&&ROWS.has(a[2]);
  default:return false;
 }
}
const visible=logs=>logs.filter(l=>l.args[0]!=='proof cost');
async function run(spec){if(abort.signal.aborted)throw Error('sync503 deadline');const r=await mf.dispatchFetch('http://fixture.invalid/run',{method:'POST',body:JSON.stringify(spec),signal:abort.signal});const raw=await r.text();assert.equal(r.status,200,raw);const v=JSON.parse(raw);allLines.push(...v.logs);auditTransport(v,'run');return v;}
async function post(route,spec){if(abort.signal.aborted)throw Error('sync503 deadline');const r=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(spec),signal:abort.signal});const raw=await r.text();assert.equal(r.status,200,raw);const v=JSON.parse(raw);if(v.logs)allLines.push(...v.logs);auditTransport(v,route);return v;}
const boundLine=(line,purpose,label,group)=>!!line&&JSON.stringify(line.args.slice(0,4))===JSON.stringify(['privacy request held',purpose,label,group])&&line.args.length===5&&ELAPSED.has(line.args[4])&&line.args[4]!=='unknown';
const same=(line,args)=>!!line&&JSON.stringify(line.args)===JSON.stringify(args);
const siteLine=(label,group='read',route='api_me')=>['request held','site','error',label,group,route];

let complete=false;
async function exercise(){
const built=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'sync503-entry.mjs'},absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),metafile:true,logLevel:'silent'});if(abort.signal.aborted)throw Error('sync503 deadline before runtime creation');source=Buffer.from(built.outputFiles[0].contents);
pins=Object.keys(built.metafile.inputs).filter(p=>p!=='sync503-entry.mjs').map(p=>({path:path.resolve(root,p),sha256:H(fs.readFileSync(path.resolve(root,p)))}));
mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script:source.toString(),modules:true,name:'sync503-held',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),d1Databases:{DB:'sync503-held'},outboundService:async request=>{
 const u=new URL(request.url),p=u.pathname.replace(/^\/api\/v10/,''),auth=request.headers.get('authorization');http.push({method:request.method,origin:u.origin,path:p});assert.equal(u.origin,'https://discord.com');
 if(request.method==='POST'&&(p==='/oauth2/token'||p==='/api/oauth2/token'))return Response.json({access_token:'tok-'+ID,token_type:'Bearer',scope:'identify guilds.members.read'});
 if(auth==='Bearer tok-'+ID&&p==='/users/@me')return Response.json({id:ID,username:'sync503_member',global_name:'Synthetic member',avatar:null});
 if(auth==='Bearer tok-'+ID&&p==='/users/@me/guilds/'+GUILD+'/member')return Response.json({user:{id:ID},roles:[],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});
 if(auth==='Bot synthetic-native-bot'&&request.method==='GET'&&p==='/guilds/'+GUILD+'/members/'+ID)return memberMode==='404'?Response.json({message:'Unknown Member',code:10007},{status:404}):Response.json({user:{id:ID},roles:[],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});
 throw Error('unplanned synthetic provider request');
}}));await mf.ready;
let r=await mf.dispatchFetch('http://fixture.invalid/setup',{method:'POST'});const setup=await r.json();assert.equal(r.status,200);HELD=new Set(setup.heldCauses);ROUTES=new Set(setup.routeClasses);
check('real local Workerd D1 fixture with the closed lists of src/log.ts',setup.actualLocalWorkerdD1===true&&HELD.size>12&&ROUTES.has('api_me'));

console.log('\n== word for word: what the pinned binding throws ==');
{
 const a=await post('raw',{fault:{kind:'reply',message:'Network connection lost.'}}),b=await post('raw',{fault:{kind:'reject',message:'Network connection lost.'}});
 check('a provider error reply becomes D1_ERROR: <text> with the bare text as its cause',a.fired===1&&a.seen?.message==='D1_ERROR: Network connection lost.'&&a.seen.causeMessage==='Network connection lost.',a);
 check('  a rejected transport arrives raw, without the D1_ prefix and without a cause',b.fired===1&&b.seen?.message==='Network connection lost.'&&b.seen.hasCause===false,b);
}

async function signIn(){
 const login=await run({method:'GET',path:'/auth/login'}),state=new URL(login.location).searchParams.get('state');
 const cb=await run({method:'GET',path:'/auth/callback?code=code-'+ID+'&state='+encodeURIComponent(state),headers:{Cookie:jar(login)}});assert.equal(cb.status,303,JSON.stringify(cb));
 assert.equal(visible(login.logs).length+visible(cb.logs).length,0,JSON.stringify([login.logs,cb.logs]));return jar(cb);
}
let cookie=await signIn();
const verification=(method,cookieValue,fault)=>run({method,path:'/api/me/verification',headers:{Cookie:cookieValue,...(method==='GET'?{}:{'X-Olympus':'2',Origin:'https://guild.example'})},fault});
let ok=await verification('GET',cookie);
check('a signed-in GET /api/me/verification succeeds with no held line (bound read groups, the later ones nested)',ok.status===200&&visible(ok.logs).length===0&&ok.wires.filter(w=>w.kind==='bound').length>=2&&!ok.wires.find(w=>w.kind==='bound').nested&&ok.wires.filter(w=>w.nested).length>=1&&ok.wires.find(w=>w.kind==='bound').statements===3&&ok.wires.find(w=>w.nested).statements===4,ok);
ok=await verification('HEAD',cookie);
check('  a signed-in HEAD reaches the same first bound read group',ok.status===405&&visible(ok.logs).length===0&&ok.wires.filter(w=>w.kind==='bound').length===1,ok);
ok=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie}});
check('  a signed-in private static file is delivered',ok.status===200&&ok.body==='synthetic static'&&visible(ok.logs).length===0,ok);

console.log('\n== each documented message: a retryable class says read_unavailable on GET and HEAD, everything else keeps erasure_held; POST and a static file keep their answers ==');
for(const [message,label] of DOCUMENTED){
 const fault={target:'bound',nth:1,kind:'reply',message:message+SECRET},want=RETRYABLE.has(label)?READ_UNAVAILABLE:OLD_HELD,word=RETRYABLE.has(label)?'read_unavailable':'erasure_held';
 const g=await verification('GET',cookie,fault),h=await verification('HEAD',cookie,fault),p=await verification('POST',cookie,fault);
 const lines=[g,h,p].map(x=>visible(x.logs));
 check(label+' GET 503 '+word+': '+message,g.status===503&&g.body===want&&g.fault.fired===1&&affectedCount(g,3)&&lines[0].length===2&&boundLine(lines[0][0],'site_session',label,'read')&&same(lines[0][1],siteLine(label)),g);
 check(label+' HEAD 503 '+word+': '+message,h.status===503&&h.body===want&&h.fault.fired===1&&affectedCount(h,3)&&lines[1].length===2&&boundLine(lines[1][0],'site_session',label,'read')&&same(lines[1][1],siteLine(label)),h);
 check(label+' POST 503 erasure_held exactly as before: '+message,p.status===503&&p.body===OLD_HELD&&p.fault.fired===1&&affectedCount(p,4)&&lines[2].length===2&&boundLine(lines[2][0],'site_session',label,'read')&&same(lines[2][1],siteLine(label)),p);
 const st=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie},fault:{target:'user',nth:1,kind:'reply',message:message+SECRET}}),sl=visible(st.logs);
 check(label+' static file 503 site_access_unavailable with four values: '+message,st.status===503&&st.body===SITE_ACCESS&&st.fault.fired===1&&affectedCount(st,2)&&sl.length===1&&same(sl[0],['site access unavailable','current_user','d1',label]),st);
}

console.log('\n== negative controls and an error without the D1_ prefix ==');
{
 const fault={target:'bound',nth:1,kind:'reject',message:'Network connection lost.'};
 const g=await verification('GET',cookie,fault),l=visible(g.logs);
 check('raw Network connection lost on a GET: read_unavailable, storage_network',g.status===503&&g.body===READ_UNAVAILABLE&&g.fault.fired===1&&l.length===2&&boundLine(l[0],'site_session','storage_network','read')&&same(l[1],siteLine('storage_network')),g);
 const st=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie},fault:{target:'user',nth:1,kind:'reject',message:'Network connection lost.'}}),sl=visible(st.logs);
 check('  raw rejection at the gate: category error, label storage_network',st.status===503&&st.body===SITE_ACCESS&&sl.length===1&&same(sl[0],['site access unavailable','current_user','error','storage_network']),st);
 for(const [text,label,how] of [['something else entirely'+SECRET,'other','reject'],['no such table: site_users'+SECRET,'d1_other','reply'],['privacy_write_admission_required: SQLITE_CONSTRAINT','sql_trigger_refused','reply'],['Failed to parse body as JSON, got: D1 DB reset because its code was updated.','d1_other','reply'],['upstream said Network connection lost.','other','reject']]){
  const o=await verification('GET',cookie,{target:'bound',nth:1,kind:how,message:text}),ol=visible(o.logs);
  check('  '+label+' keeps erasure_held on a GET: '+text.slice(0,48),o.status===503&&o.body===OLD_HELD&&o.fault.fired===1&&ol.length===2&&boundLine(ol[0],'site_session',label,'read')&&same(ol[1],siteLine(label)),o);
 }
}

console.log('\n== the other held classes keep erasure_held on a GET ==');
{
 const a=await verification('GET',cookie,{target:'bound',nth:1,kind:'proof0'}),al=visible(a.logs);
 check('a PrivacyWriteAdmissionHeld inside a bound batch: admission:read_epoch_unconfirmed, erasure_held',a.status===503&&a.body===OLD_HELD&&a.fault.fired===1&&al.length===2&&boundLine(al[0],'site_session','admission:read_epoch_unconfirmed','read')&&same(al[1],siteLine('admission:read_epoch_unconfirmed')),a);
 const sh=await verification('GET',cookie,{target:'bound',nth:1,kind:'shape'}),shl=visible(sh.logs);
 check('a reply of the wrong shape after the try: shape, erasure_held',sh.status===503&&sh.body===OLD_HELD&&sh.fault.fired===1&&shl.length===2&&boundLine(shl[0],'site_session','shape','read')&&same(shl[1],siteLine('shape')),sh);
 const w=await verification('GET',cookie,{target:'bound',nth:1,kind:'witness'}),wl=visible(w.logs);
 check('a failed check() after a successful batch (the session witness): session, logged once, erasure_held',w.status===503&&w.body===OLD_HELD&&w.fault.fired===1&&wl.length===2&&boundLine(wl[0],'site_session','session','read')&&same(wl[1],siteLine('session')),w);
 const n=await verification('GET',cookie,{target:'bound',nth:2,kind:'reply',message:'Network connection lost.'+SECRET}),nl=visible(n.logs);
 check('a nested bound environment (subject over site) logs exactly once, at the innermost layer',n.status===503&&n.body===READ_UNAVAILABLE&&n.fault.fired===1&&n.wires.some(x=>x.nested&&x.injected==='reply')&&nl.length===2&&boundLine(nl[0],'site_session','storage_network','read')&&same(nl[1],siteLine('storage_network')),n);
 const u=await verification('GET',cookie,{target:'user',nth:1,kind:'reply',message:'D1 DB is overloaded. Too many requests queued.'+SECRET}),ul=visible(u.logs),ub=JSON.parse(u.body);
 check('an unbound read failure still reaches unhandled: 500, route family and labels only',u.status===500&&ub.error==='internal'&&/^[0-9a-f]{8}$/.test(ub.requestId)&&ul.length===1&&same(ul[0],['unhandled',ub.requestId,'api_me','d1','storage_overloaded']),u);
 const sc=await verification('GET',cookie,{target:'schema',nth:1,kind:'reply',message:'D1 DB reset because its code was updated.'+SECRET}),scl=visible(sc.logs);
 check('a failed schema check: its label, then write_admission_held as before',sc.status===503&&sc.body===WRITE_HELD&&sc.fault.fired===1&&scl.length===2&&same(scl[0],['schema check failed','d1','storage_reset'])&&same(scl[1],['request held','write_admission','error','admission:current_schema_unconfirmed','api_me']),sc);
}

console.log('\n== the gate membership stage: a write group (Discord 404 branch) ==');
{
 await post('age',{seconds:-7200});memberMode='404';
 const m=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie},fault:{target:'bound',nth:1,kind:'reply',message:'D1 DB reset because its code was updated.'+SECRET}}),ml=visible(m.logs);
 memberMode='member';await post('age',{seconds:7200});
 check('a failed membership write: one bound line with write, the gate line with four values, site_access_unavailable',m.status===503&&m.body===SITE_ACCESS&&m.fault.fired===1&&ml.length===2&&boundLine(ml[0],'site_session','storage_reset','write')&&same(ml[1],['site access unavailable','membership','error','storage_reset']),m);
 ok=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie}});
 check('  the next request is delivered after the explicitly pre-execution injection',ok.status===200&&visible(ok.logs).length===0,ok);
}

console.log('\n== the subject_generation purpose (module level, real admission database) ==');
for(const depth of [1,2]){
 const v=await post('subject',{depth,fault:{target:'subject',nth:1,kind:'reply',message:'Internal error in D1 DB storage caused object to be reset.'+SECRET}}),vl=visible(v.logs);
 check('subject_generation depth '+depth+': one line, the labels on the thrown PrivacySiteRequestHeld',v.held===true&&v.message==='privacy_site_request_held'&&v.heldCause==='storage_reset'&&v.heldGroup==='read'&&v.fault.fired===1&&affectedCount(v,depth+2)&&v.factsFrozen===true&&vl.length===1&&boundLine(vl[0],'subject_generation','storage_reset','read'),v);
 const wv=await post('subject',{depth,write:true,fault:{target:'subject',nth:1,kind:'reply',message:'Network connection lost.'+SECRET}}),wl=visible(wv.logs);
 check('  a write group is marked write (depth '+depth+')',wv.held===true&&wv.heldCause==='storage_network'&&wv.heldGroup==='write'&&wv.fault.fired===1&&affectedCount(wv,depth+5)&&wv.effect.after===wv.effect.before&&wl.length===1&&boundLine(wl[0],'subject_generation','storage_network','write'),wv);
 const mv=await post('subject',{depth,capture:true,fault:{target:'subject',nth:1,kind:'mutate'}}),ml=visible(mv.logs);
 check('  a failed check() after a successful batch is logged once as authority (depth '+depth+')',mv.held===true&&mv.heldCause==='authority'&&mv.heldGroup==='read'&&mv.fault.fired===1&&affectedCount(mv,depth+2)&&ml.length===1&&boundLine(ml[0],'subject_generation','authority','read'),mv);
}
{
 const v=await post('subject',{depth:1});
 check('  without a fault the same read succeeds and logs nothing',v.held===false&&visible(v.logs).length===0&&onlyGroup(v,3),v);
 const t=await post('subject',{depth:2,throwingConsole:true,fault:{target:'subject',nth:1,kind:'reply',message:'D1 DB reset because its code was updated.'}});
 check('  a throwing console changes nothing: the same held error and labels',t.held===true&&t.message==='privacy_site_request_held'&&t.heldCause==='storage_reset'&&t.heldGroup==='read'&&visible(t.logs).length===1,t);
}

console.log('\n== admitted writes commit before the reply is lost; real readback, one send, no replay ==');
for(const depth of [1,2]){
 const normal=await post('subject',{depth,capture:true,write:true});
 check('normal admitted mutation depth '+depth+' changes the real synthetic row once',normal.held===false&&normal.effect.after===normal.effect.before+1&&onlyGroup(normal,depth+5)&&visible(normal.logs).length===0,normal);
 for(const kind of ['commit-reject','commit-invalid']){
  const v=await post('subject',{depth,capture:true,write:true,fault:{target:'subject',nth:1,kind}}),lines=visible(v.logs),label=kind==='commit-reject'?'storage_network':'admission:known_commit_reply_unconfirmed';
  check(kind+' depth '+depth+': actual commit, held write outcome, one native transaction and no replay',v.held===true&&v.message==='privacy_site_request_held'&&v.heldGroup==='write'&&v.heldCause===label&&v.factsFrozen===true&&v.effect.after===v.effect.before+1&&v.wires.length===1&&affectedCount(v,depth+5)&&lines.length===1&&boundLine(lines[0],'subject_generation',label,'write'),v);
 }
}
{
 const e=await post('subject',{depth:1,empty:true,fault:{target:'subject',nth:1,kind:'reject',message:'Network connection lost.'}}),el=visible(e.logs);
 check('empty selected group cannot mint read provenance',e.held===true&&e.heldGroup==='unknown'&&e.heldCause==='storage_network'&&affectedCount(e,2)&&el.length===1&&boundLine(el[0],'subject_generation','storage_network','unknown'),e);
}
for(const kind of ['commit-reject','commit-invalid']){
 await post('age',{seconds:-7200});memberMode='404';const before=await post('probe',{});
 const v=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie},fault:{target:'bound',nth:1,kind}}),after=await post('probe',{}),lines=visible(v.logs),label=kind==='commit-reject'?'storage_network':'admission:known_commit_reply_unconfirmed';
 memberMode='member';
 check('HTTP GET membership '+kind+': 503 preserves an actually committed write, never read_unavailable',v.status===503&&v.body===SITE_ACCESS&&before.inServer===1&&after.inServer===0&&after.sessionVersion===before.sessionVersion+1&&after.auditCount===before.auditCount+1&&affectedCount(v,7)&&lines.length===2&&boundLine(lines[0],'site_session',label,'write')&&same(lines[1],['site access unavailable','membership','error',label]),{...v,effect:{before,after}});
 cookie=await signIn();
}

console.log('\n== handler GET write-group failures reach index, not the member-gate catch ==');
for(const kind of ['reply','commit-reject']){
 // /api/me/verification GET is deliberately own-status-only and does not call
 // stillMember. /api/board does: after the gate's fresh read, a genuine concurrent
 // checked_at update makes the handler's separate native read hourly-due.
 memberMode='member';cookie=await signIn();const before=await post('probe',{});memberMode='404';
 const label=kind==='reply'?'storage_reset':'storage_network';
 const v=await run({method:'GET',path:'/api/board',headers:{Cookie:cookie},expireMembershipAfterGateRead:true,
  fault:{target:'bound',nth:1,kind,...(kind==='reply'?{message:'D1 DB reset because its code was updated.'+SECRET}:{})}});
 const after=await post('probe',{}),lines=visible(v.logs),affected=v.wires.filter(w=>w.injected!==null);memberMode='member';
 const effect=kind==='reply'
  ?after.inServer===before.inServer&&after.sessionVersion===before.sessionVersion&&after.auditCount===before.auditCount&&after.checkedAt===before.checkedAt-7200
  :after.inServer===0&&after.sessionVersion===before.sessionVersion+1&&after.auditCount===before.auditCount+1&&after.checkedAt>=before.checkedAt;
 check('index handler GET '+kind+' keeps exact erasure_held for a retry-listed write-group failure',
  v.status===503&&v.body===OLD_HELD&&v.body!==READ_UNAVAILABLE&&v.membershipAgedAfterGateRead===true&&before.inServer===1&&effect
  &&v.wires.filter(w=>w.kind==='user').length===2&&affectedCount(v,7)&&affected[0].nativeSends===(kind==='reply'?0:1)
  &&lines.length===2&&boundLine(lines[0],'site_session',label,'write')&&same(lines[1],siteLine(label,'write','api_other')),
  {...v,effectReadback:{before,after}});
}
cookie=await signIn();

console.log('\n== caller-shaped labels cannot mint private read-failure provenance ==');
{
 const p=await post('provenance',{});check('public constructor arguments, descriptors, getters and plain objects have no private facts',p.cases.length===4&&p.cases.every(v=>v.recorded===false),p);
 for(const variant of ['constructor','descriptor','getter']){
  const v=await verification('GET',cookie,{target:'user',nth:1,kind:'forged',variant}),lines=visible(v.logs);
  check('forged '+variant+' metadata cannot select read_unavailable',v.status===503&&v.body===OLD_HELD&&affectedCount(v,2)&&lines.length===1&&same(lines[0],siteLine('authority','unknown')),v);
 }
}

console.log('\n== complete real catches tolerate hostile values and a throwing console ==');
for(const [variant,ref] of [['status','thrown'],['message','thrown'],['name','thrown'],['cause','error'],['revoked','thrown'],['nonstring','error'],['string','thrown']]){
 const fault={target:'user',nth:1,kind:'hostile',variant};
 const gate=await run({method:'GET',path:'/static/wow/icon-warning.png',headers:{Cookie:cookie},fault}),gl=visible(gate.logs);
 check('hostile '+variant+' current-user catch retains 503 and one closed line',gate.status===503&&gate.body===SITE_ACCESS&&affectedCount(gate,2)&&gl.length===1&&same(gl[0],['site access unavailable','current_user',ref,'other']),gate);
 const raw=await verification('GET',cookie,fault),rl=visible(raw.logs),body=JSON.parse(raw.body??'null');
 check('hostile '+variant+' unhandled catch retains 500 and one closed line',raw.status===500&&body.error==='internal'&&rl.length===1&&same(rl[0],['unhandled',body.requestId,'api_me',ref,'other']),raw);
 const bound=await verification('GET',cookie,{...fault,target:'bound'}),bl=visible(bound.logs),group=variant==='revoked'?'unknown':'read';
 check('hostile '+variant+' bound catch retains held response and closed provenance',bound.status===503&&bound.body===OLD_HELD&&affectedCount(bound,3)&&bl.length===2&&boundLine(bl[0],'site_session','other',group)&&same(bl[1],siteLine('other',group)),bound);
 const schema=await verification('GET',cookie,{...fault,target:'schema'}),sl=visible(schema.logs);
 check('hostile '+variant+' schema catch retains write_admission_held',schema.status===503&&schema.body===WRITE_HELD&&affectedCount(schema,1)&&sl.length===2&&same(sl[0],['schema check failed',ref,'other'])&&same(sl[1],['request held','write_admission','error','admission:current_schema_unconfirmed','api_me']),schema);
}
for(const target of ['bound','user','schema']){
 const v=await run({method:'GET',path:target==='user'?'/static/wow/icon-warning.png':'/api/me/verification',headers:{Cookie:cookie},throwingConsole:true,fault:{target,nth:1,kind:'reject',message:'Network connection lost.'}}),lines=visible(v.logs);
 const wanted=target==='bound'?READ_UNAVAILABLE:target==='user'?SITE_ACCESS:WRITE_HELD;
 check('throwing console at '+target+' leaves the original HTTP answer unchanged',v.status===503&&v.body===wanted&&lines.length===(target==='user'?1:2),v);
}
{
 const v=await run({method:'GET',path:'/api/me/verification',headers:{Cookie:cookie},throwingConsole:true,fault:{target:'user',nth:1,kind:'hostile',variant:'status'}}),lines=visible(v.logs),body=JSON.parse(v.body??'null');
 check('throwing console at hostile unhandled catch preserves500',v.status===500&&body.error==='internal'&&lines.length===1&&same(lines[0],['unhandled',body.requestId,'api_me','thrown','other']),v);
}

console.log('\n== a changed session (real guard refusal through its JSON sentinel) ==');
{
 const c=await verification('GET',cookie,{target:'bound',nth:1,kind:'rotate'}),cl=visible(c.logs);
 check('a changed session gives erasure_held and exactly one bound line site_session sql_json_refused',c.status===503&&c.body===OLD_HELD&&c.fault.fired===1&&cl.length===2&&boundLine(cl[0],'site_session','sql_json_refused','read')&&same(cl[1],siteLine('sql_json_refused')),c);
 cookie=await signIn();
}

console.log('\n== the sampled proof-cost line (design 2.5) ==');
{
 let last=null;for(let i=0;i<200;i++){last=await verification('GET',cookie);assert.equal(last.status,200,JSON.stringify(last));if(allLines.some(l=>l.args[0]==='proof cost'))break;}
 const proof=allLines.filter(l=>l.args[0]==='proof cost'),groups=last.readGroupsOk;
 check('one proof-cost line per 256 successful read groups of the isolate, in fixed classes',proof.length>=1&&proof.length===Math.floor(groups/256)&&proof.every(closedLine),{lines:proof.length,groups,proof});
}

check('every argument of every console call in these requests is from the closed sets ('+allLines.length+' lines)',allLines.length>0&&allLines.every(closedLine),allLines.filter(l=>!closedLine(l)));
check('no console argument carries injected text',!JSON.stringify(allLines).match(/abc\.def|Tag#1234|token=|300000000000000093|Network connection|overloaded\.|SQLITE|Failed to parse/));
check('provider HTTP was Discord only',http.every(h=>h.origin==='https://discord.com'));
for(const p of pins)assert.equal(H(fs.readFileSync(p.path)),p.sha256,'compiled source custody: '+p.path);check('exact source bytes unchanged during run',true);
complete=failed===0;
}
(async()=>{
 try{await Promise.race([exercise(),deadline]);}
 catch(e){console.error(e.stack);failed++;}
 finally{
  clearTimeout(deadlineTimer);abort.abort();
  let cleanupTimer;
  try{await Promise.race([Promise.all([mf?mf.dispose():Promise.resolve(),Promise.resolve().then(()=>stopBuild())]),new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(Error('owned runtime/build cleanup deadline')),CLEANUP_MS);})]);cleanupCompleted=true;}
  catch(e){console.error(e.message);failed++;}
  finally{clearTimeout(cleanupTimer);}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({complete:complete&&failed===0,passed,failed,results,lines:allLines.length,bundleSha256:H(source),sourcePins:pins,transportAudits,commandDeadlineMs:COMMAND_MS,cleanupCompleted,elapsedMs:Date.now()-startedAt},null,2));
 }
 console.log(`\n${passed}/${passed+failed} passed; evidence ${out}`);
 if(failed)process.exitCode=1;
 if(!cleanupCompleted)process.exit(1);
})();
