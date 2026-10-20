'use strict';
// Isolated synthetic adapter. Never imported by the Worker or connected to a provider.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createCensusStore,FIXTURES,CONSENT_VERSION,parseStrictJSON}=require('./core.cjs');
const ASSETS=new Map([['/',['index.html','text/html; charset=utf-8']],['/lab.js',['lab.js','text/javascript; charset=utf-8']],['/lab.css',['lab.css','text/css; charset=utf-8']]]);
const HEADERS={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), display-capture=(), geolocation=()','X-Robots-Tag':'noindex, nofollow'};
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
const closed=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==keys.slice().sort().join('|'))throw fail('invalid_control_body');return v;};
const uuid=()=>crypto.randomUUID();
function createLabServer(options={}){
  let offset=0,port=0,closedLab=false;
  const now=()=>Math.floor((options.now||(()=>Date.now()/1000))())+offset;
  let store=createCensusStore({now});
  const sessions=new Map(),previews=new Map(),intents=new Map(),receiptOwners=new Map(),qrScans=new Map();
  let qrRendering=0;
  const counters={requests:0,fixturePreviews:0,syntheticSubmissions:0,unknownResponses:0,qrScansCreated:0,qrPreviewsAccepted:0,qrScansCancelled:0};
  const aliases={'reporter-a':{ctx:FIXTURES.reporterA,label:'Synthetic reporter A',reporter:true},'reporter-b':{ctx:FIXTURES.reporterB,label:'Synthetic reporter B',reporter:true},reader:{ctx:FIXTURES.reader,label:'Synthetic reader',reporter:false}};
  // A containing loopback preview may mount this same handler without a second
  // listener or proxy. Resolve its exact origin on every request, never from Host.
  const origin=()=>{
    const value=options.origin?options.origin():`http://127.0.0.1:${port}`;
    const parsed=new URL(value);
    if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw Error('Exact IPv4 loopback origin required');
    return parsed.origin;
  };
  const guard=(req,expected)=>{if(closedLab)throw fail('lab_closed',503);if(options.guard)options.guard(req);if(expected&&sessionFor(req)!==expected)throw fail('original_synthetic_session_required',403);};
  const json=(res,status,value,extra={})=>{res.writeHead(status,{...HEADERS,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
  function cookieToken(req){const values=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('census_lab='));if(values.length!==1)return null;const token=values[0].slice(11);return /^[a-f0-9]{48}$/.test(token)?token:null;}
  function newSession(account='reporter-a'){
    if(!Object.hasOwn(aliases,account))throw fail('unknown_synthetic_account');
    for(const [token,s] of sessions)if(performance.now()-s.issuedWall>3600000)sessions.delete(token);
    if(sessions.size>=64)throw fail('synthetic_session_capacity',429);
    const token=crypto.randomBytes(24).toString('hex'),alias=aliases[account];
    const session={token,csrf:crypto.randomBytes(24).toString('hex'),account,ctx:{...alias.ctx},issuedWall:performance.now()};sessions.set(token,session);return session;
  }
  function sessionFor(req){const s=sessions.get(cookieToken(req));if(!s||performance.now()-s.issuedWall>3600000)throw fail('synthetic_session_required',401);return s;}
  const cookie=s=>`census_lab=${s.token}; HttpOnly; SameSite=Strict; Path=/`;
  function ownedPreview(s,id,guildKey){const p=previews.get(id);if(!p||p.owner!==s.token||p.account!==s.account||p.guildKey!==guildKey)throw fail('synthetic_preview_required',403);if(now()>=p.expiresAt)throw fail('preview_expired',409);return p;}
  function ownedIntent(s,id){const i=intents.get(id);if(!i||i.owner!==s.token||i.account!==s.account)throw fail('original_synthetic_session_required',403);return i;}
  function viewState(s){
    const alias=aliases[s.account],contract=store.contract(s.ctx),summary=store.summary(s.ctx),receipts=[];
    for(const [id,owner] of receiptOwners)if(owner===s.token){try{receipts.push(store.receipt(s.ctx,id));}catch(error){if(![403,404,409,410].includes(error.status))throw error;}}
    return{syntheticOnly:true,now:now(),identity:{id:s.account,label:alias.label,reporter:alias.reporter},csrfToken:s.csrf,contract,summary,receipts};
  }
  async function body(req){
    if(req.headers['content-type']!=='application/json')throw fail('json_content_type_required',415);
    if(req.headers['content-encoding']||req.headers['transfer-encoding']&&req.headers['transfer-encoding']!=='chunked')throw fail('encoded_body_refused',415);
    const raw=await new Promise((resolve,reject)=>{let size=0,done=false;const parts=[];req.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>4096){done=true;reject(fail('body_too_large',413));return;}parts.push(chunk);});req.on('end',()=>{if(!done){done=true;resolve(Buffer.concat(parts));}});req.on('aborted',()=>reject(fail('request_aborted',400)));req.on('error',()=>reject(fail('request_aborted',400)));});
    const value=parseStrictJSON(raw);
    // A mounted website's original admission can change while a slow body is
    // arriving. Recheck after receipt; route guards run again synchronously
    // before the operation so an awaited check cannot adopt a later session.
    if(options.admit)await options.admit(req);
    return value;
  }
  function makeObservation(guildKey,scenario){
    const second=now(),source=Math.floor(second/60)*60;
    // Stay invalid throughout the full 300-second preview, rather than becoming admissible after one second.
    const choices={fresh:{reportedCharacters:240,reportedOnline:60,source},masked:{reportedCharacters:'few',reportedOnline:null,source},older:{reportedCharacters:240,reportedOnline:null,source:second-1800},conflict:{reportedCharacters:143,reportedOnline:67,source},'invalid-future':{reportedCharacters:240,reportedOnline:60,source:second+361}};
    if(!Object.hasOwn(choices,scenario))throw fail('unknown_synthetic_scenario');const row=choices[scenario];
    return{format:'olympus-shared-census-observation-v1',source:'unverified-volunteer-client',sourceVerified:false,membershipProof:false,guildKey,addonVersion:'0.1.0',observedAt:row.source,sourceReceivedAt:row.source,capturedAt:Math.max(second,row.source),completeRosterClaimed:true,reportedCharacters:row.reportedCharacters,reportedOnline:row.reportedOnline};
  }
  function dropQR(id){const scan=qrScans.get(id);if(scan?.expiryTimer)clearTimeout(scan.expiryTimer);if(scan?.fixture?.images)for(const image of scan.fixture.images)image.fill(0);if(scan)scan.fixture=null;qrScans.delete(id);}
  function pruneQR(){for(const[id,scan]of qrScans)if(now()>=scan.expiresAt||performance.now()>=scan.monotonicDeadline||!sessions.has(scan.owner))dropQR(id);}
  function ownQR(s,id){
    const scan=qrScans.get(id);
    if(!scan||scan.owner!==s.token||scan.account!==s.account)throw fail('original_qr_session_required',403);
    if(now()>=scan.expiresAt||performance.now()>=scan.monotonicDeadline){dropQR(id);throw fail('qr_scan_expired',409);}
    return scan;
  }
  const handler=async(req,res)=>{
    counters.requests++;
    try{
      guard(req);
      if(req.headers.host!==new URL(origin()).host)throw fail('loopback_host_required',403);
      if(!req.url||!req.url.startsWith('/')||req.url.startsWith('//')||req.url.includes('\\'))throw fail('invalid_local_path',400);
      const url=new URL(req.url,origin());if(url.origin!==origin())throw fail('local_origin_required',403);
      if(req.headers.origin&&req.headers.origin!==origin())throw fail('local_origin_required',403);
      if(url.search)throw fail('query_refused',400);
      if(['GET','HEAD'].includes(req.method)&&ASSETS.has(url.pathname)){
        const [name,type]=ASSETS.get(url.pathname),bytes=fs.readFileSync(path.join(__dirname,name));res.writeHead(200,{...HEADERS,'Content-Type':type,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
      }
      // Ordinary top-level navigation may be cross-site; it can read only public static lab files.
      // Private state and every operation still require same-origin fetch metadata and session fences.
      if(req.headers['sec-fetch-site']&& !['same-origin','none'].includes(req.headers['sec-fetch-site']))throw fail('cross_site_refused',403);
      if(req.method==='HEAD')throw fail('method_refused',405);
      const mutation=['POST','DELETE'].includes(req.method);
      if(!['GET','POST','DELETE'].includes(req.method))throw fail('method_refused',405);
      if(mutation&&req.headers.origin!==origin())throw fail('local_origin_required',403);
      let s;
      if(req.method==='GET'&&url.pathname==='/__lab/state'){
        try{s=sessionFor(req);}catch(error){if(error.code!=='synthetic_session_required')throw error;s=newSession();}
        json(res,200,viewState(s),{'Set-Cookie':cookie(s)});return;
      }
      s=sessionFor(req);
      if(mutation&&req.headers['x-census-csrf']!==s.csrf)throw fail('csrf_required',403);
      if(req.method==='POST'&&url.pathname==='/__lab/qr/start'&&options.qrFixtureFactory){
        const v=closed(await body(req),['guildKey','scenario']);guard(req,s);
        const contract=store.contract(s.ctx);
        if(!contract.canReport||!contract.allowedGuildKeys.includes(v.guildKey))throw fail('reporter_admission_required',403);
        if(!['fresh','masked','older','conflict'].includes(v.scenario))throw fail('unknown_synthetic_scenario');
        pruneQR();
        if(qrRendering>=2)throw fail('qr_renderer_busy',429);
        for(const[id,scan]of qrScans)if(scan.owner===s.token)dropQR(id);
        if(qrScans.size>=32)throw fail('qr_scan_capacity',429);
        // The original scan budget includes generation, delivery and decoding.
        const second=now(),qrId=uuid(),nonce=crypto.randomBytes(16).toString('hex');
        const scan={owner:s.token,account:s.account,guildKey:v.guildKey,nonce,expiresAt:second+30,monotonicDeadline:performance.now()+30000,fixture:null,acceptedPreview:null};
        qrScans.set(qrId,scan);
        // Erase expired synthetic QR material even if the browser disappears
        // and makes no further read. This never polls, reports or renews data.
        scan.expiryTimer=setTimeout(()=>dropQR(qrId),30000);scan.expiryTimer.unref();
        qrRendering++;
        let generated;
        try{
          generated=await options.qrFixtureFactory({guildKey:v.guildKey,scenario:v.scenario,nowSeconds:second,nonce});
          if(res.destroyed||req.aborted)throw fail('qr_scan_cancelled',409);
          if(options.admit)await options.admit(req);
          if(res.destroyed||req.aborted)throw fail('qr_scan_cancelled',409);
          guard(req,s);
          if(ownQR(s,qrId)!==scan)throw fail('original_qr_session_required',403);
          if(!generated||!/^[a-f0-9]{64}$/.test(generated.payloadSHA256||'')||!Array.isArray(generated.images)||!generated.images.length||generated.images.length>14||generated.images.some(image=>!Buffer.isBuffer(image)||image.length>65536))throw fail('qr_fixture_refused',503);
          scan.fixture=generated;generated=null;counters.qrScansCreated++;
          json(res,201,{syntheticOnly:true,qrId,nonce,expiresAt:scan.expiresAt,frameCount:scan.fixture.images.length,images:scan.fixture.images.map((_,i)=>`/__lab/qr/${qrId}/images/${i+1}`),payloadSHA256:scan.fixture.payloadSHA256});return;
        }catch(error){dropQR(qrId);if(generated?.images)for(const image of generated.images)image.fill(0);throw error;}
        finally{qrRendering--;}
      }
      const qrImage=/^\/__lab\/qr\/([A-Za-z0-9-]{1,100})\/images\/([1-9][0-9]?)$/.exec(url.pathname);
      if(req.method==='GET'&&qrImage&&options.qrFixtureFactory){
        const scan=ownQR(s,qrImage[1]),index=Number(qrImage[2])-1,image=scan.fixture?.images[index];
        if(!image||scan.acceptedPreview)throw fail('qr_image_unavailable',404);
        res.writeHead(200,{...HEADERS,'Content-Type':'image/png','Content-Length':image.length});res.end(image);return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/qr/cancel'&&options.qrFixtureFactory){
        const v=closed(await body(req),['qrId']);guard(req,s);ownQR(s,v.qrId);dropQR(v.qrId);counters.qrScansCancelled++;
        json(res,200,{syntheticOnly:true,state:'cancelled'});return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/qr/accept'&&options.qrFixtureFactory){
        const v=closed(await body(req),['qrId','nonce','payloadSHA256']);guard(req,s);
        const scan=ownQR(s,v.qrId),contract=store.contract(s.ctx);
        if(!contract.canReport||!contract.allowedGuildKeys.includes(scan.guildKey))throw fail('reporter_admission_required',403);
        if(!scan.fixture||v.nonce!==scan.nonce||v.payloadSHA256!==scan.fixture.payloadSHA256)throw fail('qr_original_payload_required',409);
        if(scan.acceptedPreview){const p=ownedPreview(s,scan.acceptedPreview,scan.guildKey);json(res,200,{syntheticOnly:true,previewId:scan.acceptedPreview,expiresAt:p.expiresAt,observation:p.observation});return;}
        for(const[id,p]of previews)if(now()>=p.expiresAt||!sessions.has(p.owner))previews.delete(id);
        if(previews.size>=128)throw fail('synthetic_preview_capacity',429);
        const previewId=uuid(),expiresAt=Math.min(now()+300,scan.expiresAt-30+900),observation=Object.freeze({...scan.fixture.observation});
        // Only the original server fixture is mapped. No decoded JSON or real
        // observation enters this route, and no consent/intent/report is made.
        previews.set(previewId,{owner:s.token,account:s.account,guildKey:scan.guildKey,observation,expiresAt});scan.acceptedPreview=previewId;
        for(const image of scan.fixture.images)image.fill(0);
        counters.fixturePreviews++;counters.qrPreviewsAccepted++;
        json(res,200,{syntheticOnly:true,previewId,expiresAt,observation});return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/session'){
        const v=closed(await body(req),['account']);guard(req,s);if(typeof v.account!=='string'||!Object.hasOwn(aliases,v.account))throw fail('unknown_synthetic_account');
        const next=newSession(v.account);sessions.delete(s.token);pruneQR();json(res,200,viewState(next),{'Set-Cookie':cookie(next)});return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/preview'){
        const v=closed(await body(req),['guildKey','scenario']);guard(req,s);const contract=store.contract(s.ctx);
        if(!contract.canReport||!contract.allowedGuildKeys.includes(v.guildKey))throw fail('reporter_admission_required',403);
        for(const [id,p] of previews)if(now()>=p.expiresAt||!sessions.has(p.owner))previews.delete(id);
        if(previews.size>=128)throw fail('synthetic_preview_capacity',429);
        const observation=makeObservation(v.guildKey,v.scenario),previewId=uuid(),expiresAt=now()+300;
        // Only these server-created fictional observations can reach the submit adapter.
        previews.set(previewId,{owner:s.token,account:s.account,guildKey:v.guildKey,observation,expiresAt});counters.fixturePreviews++;
        json(res,200,{syntheticOnly:true,previewId,expiresAt,observation});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/community/shared-census/contract'){json(res,200,store.contract(s.ctx));return;}
      if(req.method==='GET'&&url.pathname==='/api/community/shared-census/summary'){json(res,200,store.summary(s.ctx));return;}
      if(req.method==='POST'&&url.pathname==='/api/community/shared-census/intents'){
        const v=closed(await body(req),['guildKey','previewId','consentVersion']);guard(req,s);ownedPreview(s,v.previewId,v.guildKey);
        if(v.consentVersion!==CONSENT_VERSION)throw fail('current_consent_required',403);
        for(const [id,i] of intents)if(now()-i.issuedAt>=86400||!sessions.has(i.owner))intents.delete(id);
        for(const [id,owner] of receiptOwners)if(!sessions.has(owner))receiptOwners.delete(id);
        if(intents.size>=512)throw fail('synthetic_intent_capacity',429);
        const result=store.createIntent(s.ctx,{guildKey:v.guildKey,consentVersion:v.consentVersion});intents.set(result.intent,{owner:s.token,account:s.account,previewId:v.previewId,guildKey:v.guildKey,issuedAt:now()});json(res,201,result);return;
      }
      if(req.method==='POST'&&url.pathname==='/api/community/shared-census/reports'){
        const v=closed(await body(req),['intent','previewId','simulateLostResponse']);guard(req,s);if(typeof v.simulateLostResponse!=='boolean')throw fail('invalid_control_body');
        const intent=ownedIntent(s,v.intent);if(intent.previewId!==v.previewId)throw fail('original_preview_required',409);
        // A consumed intent can still recover exactly the original outcome after preview expiry.
        let prior=store.outcome(s.ctx,v.intent);
        if(prior.receipt){receiptOwners.set(prior.receipt.receiptId,s.token);json(res,200,prior.receipt);return;}
        const preview=ownedPreview(s,v.previewId,intent.guildKey),raw=Buffer.from(JSON.stringify({...preview.observation,intent:v.intent}));
        const result=store.submit(s.ctx,raw);receiptOwners.set(result.receiptId,s.token);counters.syntheticSubmissions++;
        if(v.simulateLostResponse){counters.unknownResponses++;json(res,202,{state:'unknown',intent:v.intent,syntheticOnly:true});return;}
        json(res,201,result);return;
      }
      const outcome=/^\/api\/community\/shared-census\/intents\/([a-zA-Z0-9-]{1,100})\/outcome$/.exec(url.pathname);
      if(req.method==='GET'&&outcome){ownedIntent(s,outcome[1]);json(res,200,store.outcome(s.ctx,outcome[1]));return;}
      const receipt=/^\/api\/community\/shared-census\/receipts\/([a-zA-Z0-9-]{1,100})$/.exec(url.pathname);
      if(receipt&&['GET','DELETE'].includes(req.method)){
        if(receiptOwners.get(receipt[1])!==s.token)throw fail('original_synthetic_session_required',403);
        if(req.method==='DELETE'){closed(await body(req),[]);guard(req,s);}
        json(res,200,req.method==='DELETE'?store.withdraw(s.ctx,receipt[1]):store.receipt(s.ctx,receipt[1]));return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/advance'){
        const v=closed(await body(req),['seconds']);guard(req,s);if(![301,901,86401].includes(v.seconds))throw fail('synthetic_clock_step_refused');offset+=v.seconds;json(res,200,viewState(s));return;
      }
      if(req.method==='POST'&&url.pathname==='/__lab/reset'){
        closed(await body(req),[]);guard(req,s);store.close();offset=0;store=createCensusStore({now});previews.clear();intents.clear();receiptOwners.clear();sessions.clear();for(const id of qrScans.keys())dropQR(id);const next=newSession();json(res,200,viewState(next),{'Set-Cookie':cookie(next)});return;
      }
      throw fail('local_route_not_found',404);
    }catch(error){const code=/^[a-z][a-z0-9_]{0,70}$/.test(error.code||'')?error.code:'internal_refusal',status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:500;if(!res.headersSent)json(res,status,{error:{code,message:status===500?'The synthetic lab refused an internal operation.':`The synthetic request was refused: ${code}.`}});else res.end();}
  };
  const server=http.createServer(handler);
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  server.on('listening',()=>{const address=server.address();if(!address||typeof address==='string')throw Error('Loopback TCP server required');port=address.port;});
  const close=()=>new Promise(resolve=>{closedLab=true;server.close(()=>{store.close();sessions.clear();previews.clear();intents.clear();receiptOwners.clear();for(const id of qrScans.keys())dropQR(id);resolve();});server.closeIdleConnections();});
  return{server,handler,origin,close,counts:()=>({...counters,...store.inspect(),qrActiveScans:qrScans.size,qrRendering}),syntheticOnly:true};
}
if(require.main===module){
  const args=process.argv.slice(2);let port=0;if(args.length){if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||Number(args[1])<1024||Number(args[1])>65535)throw Error('Use --port 1024..65535');port=Number(args[1]);}
  const app=createLabServer();app.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({kind:'synthetic-only-shared-census-lab',origin:app.origin(),pid:process.pid,inMemory:true,productionConnection:false,realInput:false})));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>console.log('SYNTHETIC_LAB_STOPPED')));
}
module.exports={createLabServer,HEADERS};
