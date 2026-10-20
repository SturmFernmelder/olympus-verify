'use strict';
// Local website integration. The actual Worker and its original test-cookie
// issuer run against SQLite :memory:. No production environment is loaded.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { createLabServer } = require('../shared-census-lab/serve.cjs');
const { transformApp } = require('./website-overlay.cjs');
const { createFixture } = require('./qr-fixtures.cjs');
const { createAttendedServer } = require('../attended-census-local/serve.cjs');
const ROOT = path.resolve(__dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let active = false;

async function createWorkerFixture(assets) {
  const fixture = path.join(ROOT, 'worker/tests/frontend_check.cjs');
  const source = fs.readFileSync(fixture, 'utf8');
  const matches = [...source.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
  if (matches.length !== 1) throw Error('One exact original frontend fixture boundary required');
  // Reuse definitions only. The original broad test body is never executed.
  const run = String.raw`
return (async () => {
  await siteUser(MEMBER, {global_name:'Synthetic Member',username:'synthetic.member'});
  await character(MEMBER,'Synthetic One','Player-1-0001');
  await siteUser(OTHER,{global_name:'Synthetic Unconfirmed',username:'synthetic.unconfirmed'});
  await siteUser(DENIED,{global_name:'Synthetic Refused',username:'synthetic.refused',denied:1});
  await siteUser(STAFF,{global_name:'Synthetic Administrator',username:'synthetic.admin'});
  await fixtureRun('UPDATE characters SET verified_at=? WHERE discord_id=?',now,MEMBER);
  const snap=Number((await fixtureRun("INSERT INTO roster_snapshots(exported_at,received_at,source,member_count,content_hash,trusted,complete,first_received_at) VALUES(?,?,'synthetic-website-only',1,'local-census-integration',1,1,?)",now-60,now-50,now-50)).lastInsertRowid);
  await fixtureRun('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(?,?,?,?,?,?)',snap,'synthetic one','Synthetic One','Member',7,'Player-1-0001');
  const cookies = new Map();
  for (const [mode,id] of [['member',MEMBER],['admin',STAFF],['unconfirmed',OTHER],['denied',DENIED]]) cookies.set(mode,await cookieFor(id));
  let outboundProviderRequests=0,workerReadRequests=0;
  originalTestFetch=async()=>{outboundProviderRequests++;throw Error('External provider transport is forbidden in the local census website preview');};
  const environment=env({ASSETS:assets});
  let queue=Promise.resolve();
  async function read(mode,pathname,method='GET') {
    if(!['GET','HEAD'].includes(method)) throw Error('Worker mutations are not available');
    let answer;
    const task=queue.then(async()=>{
      workerReadRequests++;
      const headers={Origin:'https://guild.example','X-Olympus':'2'};
      if(cookies.has(mode))headers.Cookie=cookies.get(mode);
      answer=await indexMod.default.fetch(new Request('https://guild.example'+pathname,{method,headers}),environment,ctx);
    });
    queue=task.catch(()=>{});await task;return answer;
  }
  const settingsBefore=JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all());
  const nativeBefore=JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all());
  return {read,counts:()=>({outboundProviderRequests,workerReadRequests}),
    guards:()=>({settingsEqual:settingsBefore===JSON.stringify(db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all()),nativeAdmissionEqual:nativeBefore===JSON.stringify(db.prepare('SELECT * FROM privacy_write_admission').all())}),
    close:async()=>{await queue;db.close();}};
})().catch(error=>{db.close();throw error;});`;
  return new Function('require', '__dirname', '__filename', 'assets', source.slice(0, matches[0].index) + '\n' + run)(createRequire(fixture), path.dirname(fixture), fixture, assets);
}

const PREVIEW_CSP = "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
const SECURITY = {'Cache-Control':'no-store','Content-Security-Policy':PREVIEW_CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), display-capture=(), geolocation=(), payment=(), usb=()','X-Robots-Tag':'noindex, nofollow','X-Olympus-Preview':'synthetic-local-website'};
const MIME = {'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.pdf':'application/pdf','.zip':'application/zip'};
const LOCAL_ASSETS = new Map([['/__census-local/census-view.js','census-view.js'],['/__census-local/census-view.css','census-view.css'],['/__census-local/preview-shell.css','preview-shell.css'],['/__census-local/qr-protocol.js','../guild-qr-pilot/protocol.js'],['/__census-local/qr-decoder.js','../guild-qr-pilot/decoder.js'],['/__census-local/vendor/jsqr-1.4.0.js','../guild-qr-pilot/vendor/jsqr-1.4.0.js'],['/__census-local/vendor/NOTICE.txt','../guild-qr-pilot/vendor/NOTICE.txt'],['/__census-local/vendor/jsqr-1.4.0.LICENSE.txt','../guild-qr-pilot/vendor/jsqr-1.4.0.LICENSE.txt']]);
const ARMY_ASSETS = new Map([['/__army-view/army-view.js','army-view.js'],['/__army-view/army-view.css','army-view.css'],['/__army-view/frame-host.js','frame-host.js']]);
const ARMY_SECURITY = Object.freeze({...SECURITY,'Content-Security-Policy':PREVIEW_CSP+"; frame-src 'self'",'Permissions-Policy':'camera=(self), display-capture=(self), microphone=(), geolocation=(), payment=(), usb=()','X-Olympus-Preview':'attended-local-army'});
const toolbar = '<aside class="census-preview-shell" aria-label="Local synthetic website fixtures"><strong>LOCAL PREVIEW · SYNTHETIC DATA ONLY</strong><span>No production connection. Census submissions stay in this process memory.</span><nav aria-label="Synthetic website identity"><a href="/__preview/member">Member fixture</a><a href="/__preview/admin">Admin fixture</a><a href="/__preview/unconfirmed">Unconfirmed fixture</a><a href="/__preview/denied">Refused fixture</a><a href="/__preview/guest">Signed-out fixture</a></nav><small>These are fictional site identities. The census reporter selector is a separate fictional permission test. No real sign-in or account action is connected.</small></aside>';
const fail = (code,status=400) => Object.assign(new Error(code),{code,status});
const getCookie = (request,name) => {
  const rows=(request.headers.cookie||'').split(';').map(row=>row.trim()).filter(row=>row.startsWith(name+'='));
  if(rows.length!==1)return null;
  const value=rows[0].slice(name.length+1);return /^[a-f0-9]{48}$/.test(value)?value:null;
};

async function createWebsiteServer(options={}) {
  if(active)throw Error('One isolated website preview per process required');
  if(options.attendedArmy!==undefined&&typeof options.attendedArmy!=='boolean')throw TypeError('Explicit local Army process selection required');
  const attendedArmy=options.attendedArmy===true;
  const security=attendedArmy?ARMY_SECURITY:SECURITY;
  const localToolbar=attendedArmy?toolbar.replace('LOCAL PREVIEW · SYNTHETIC DATA ONLY','LOCAL ARMY PREVIEW · NO PRODUCTION CONNECTION').replace('No production connection. Census submissions stay in this process memory.','Website identities and original site figures are synthetic. Deliberate own-guild QR observations stay in this process memory.').replace('The census reporter selector is a separate fictional permission test.','The QR census uses a separate fictional Reporter A ownership test.'):toolbar;
  const originalFetch=globalThis.fetch;
  let worker,lab,attended,closed=false,port=0;
  const origin=()=>`http://127.0.0.1:${port}`;
  const sessions=new Map(),censusOwners=new Map(),attendedOwners=new Map(),requestSessions=new WeakMap();
  const counts={requests:0,refusedAppWrites:0,refusedAuthStarts:0,admissionChecks:0};
  const pinnedFiles=['worker/tests/frontend_check.cjs','worker/public/static/app.js','worker/public/static/app.css','worker/src/site-access.ts','worker/src/community-context.ts','tools/shared-census-lab/core.cjs','tools/shared-census-lab/serve.cjs','tools/shared-census-website/website-overlay.cjs','tools/shared-census-website/census-view.js','tools/shared-census-website/census-view.css','tools/shared-census-website/preview-shell.css','tools/shared-census-website/serve.cjs','tools/shared-census-website/qr-fixtures.cjs','tools/shared-census-website/render-qr.py','tools/guild-qr-pilot/protocol.js','tools/guild-qr-pilot/decoder.js','tools/guild-qr-pilot/vendor/jsqr-1.4.0.js','addon/OlympusStatsPilot/Libs/StatsPilotQr.lua'];
  if(attendedArmy)pinnedFiles.push('tools/army-qr-local/website-overlay.cjs','tools/army-qr-local/army-view.js','tools/army-qr-local/army-view.css','tools/army-qr-local/frame-host.js','tools/attended-census-local/serve.cjs','tools/attended-census-local/overlay.cjs','tools/attended-census-local/bridge.js','tools/attended-census-local/local.css','tools/guild-qr-pilot/pilot.js','tools/guild-qr-pilot/index.html','tools/guild-qr-pilot/pilot.css');
  const sourcePins=Object.fromEntries(pinnedFiles.map(file=>[file,digest(fs.readFileSync(path.join(ROOT,file)))]));
  // Fail before starting any service if the exact production app no longer
  // matches the reviewed local-only overlay seam.
  const transform=attendedArmy?require('../army-qr-local/website-overlay.cjs').transformApp:transformApp;
  const transformed=transform(fs.readFileSync(path.join(ROOT,'worker/public/static/app.js'),'utf8'));
  const publicRoot=fs.realpathSync(path.join(ROOT,'worker/public'));
  const assets={fetch:async request=>{
    const pathname=new URL(request.url).pathname;
    if(!/^\/static\/[A-Za-z0-9_./-]+$/.test(pathname)||pathname.includes('..'))return new Response('Not found',{status:404});
    const file=path.resolve(publicRoot,'.'+pathname);
    if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).startsWith(publicRoot+path.sep))return new Response('Not found',{status:404});
    return new Response(pathname==='/static/app.js'?transformed:fs.readFileSync(file),{headers:{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}});
  }};
  const json=(response,status,value,headers={})=>{response.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8',...headers});response.end(JSON.stringify(value));};
  const text=(response,status,value,headers={})=>{response.writeHead(status,{...security,'Content-Type':'text/plain; charset=utf-8',...headers});response.end(value);};
  const currentRequestSession=request=>{
    const s=requestSessions.get(request);
    if(closed||!s||sessions.get(s.token)!==s||performance.now()-s.issuedAt>=3600000)throw fail('website_session_changed',403);
    return s;
  };
  const admit=async request=>{
    const s=currentRequestSession(request);
    if(!['member','admin'].includes(s.mode))throw fail('website_reader_required',403);
    counts.admissionChecks++;
    const answer=await worker.read(s.mode,'/api/community/context');
    currentRequestSession(request);
    if(!answer.ok)throw fail(answer.status===401?'website_session_required':'website_reader_required',answer.status===401?401:answer.status>=500?503:403);
    const data=await answer.json();
    currentRequestSession(request);
    if(data.capabilities?.communityRead!==true||data.capabilities?.applicantWrite!==true)throw fail('website_reader_required',403);
  };
  function session(request) {
    const s=sessions.get(getCookie(request,'olympus_census_preview'));
    if(!s||performance.now()-s.issuedAt>=3600000)throw fail('website_session_required',401);
    return s;
  }
  function selectSession(request,mode) {
    for(const [token,s]of sessions)if(performance.now()-s.issuedAt>=3600000)sessions.delete(token);
    let existing;try{existing=session(request);}catch{}
    if(existing?.mode===mode)return existing;
    if(sessions.size>=64)throw fail('website_session_capacity',429);
    const next={token:crypto.randomBytes(24).toString('hex'),mode,issuedAt:performance.now()};
    if(existing)sessions.delete(existing.token);
    sessions.set(next.token,next);return next;
  }
  function cookies(s,clearCensus=false) {
    const rows=[`olympus_census_preview=${s.token}; HttpOnly; SameSite=Strict; Path=/`];
    if(clearCensus){rows.push('census_lab=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');if(attendedArmy)rows.push('census_local=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
    return rows;
  }
  const server=http.createServer(async(request,response)=>{
    counts.requests++;
    try {
      if(closed)throw fail('website_closed',503);
      if(request.headers.host!==`127.0.0.1:${port}`)throw fail('loopback_host_required',403);
      if(!request.url||!request.url.startsWith('/')||request.url.startsWith('//')||request.url.includes('\\'))throw fail('invalid_local_path');
      const url=new URL(request.url,origin());
      if(url.origin!==origin())throw fail('local_origin_required',403);
      if(request.headers.origin&&request.headers.origin!==origin())throw fail('local_origin_required',403);
      const privatePath=url.pathname.startsWith('/api/')||url.pathname.startsWith('/__lab/')||url.pathname.startsWith('/__army-qr/')||url.pathname.startsWith('/__army-view/')||url.pathname.startsWith('/local/')||url.pathname==='/__preview/status';
      if(privatePath&&request.headers['sec-fetch-site']&&!['same-origin','none'].includes(request.headers['sec-fetch-site']))throw fail('cross_site_refused',403);
      if(LOCAL_ASSETS.has(url.pathname)&&['GET','HEAD'].includes(request.method)&&!url.search){
        const file=path.join(__dirname,LOCAL_ASSETS.get(url.pathname)),bytes=fs.readFileSync(file);
        response.writeHead(200,{...SECURITY,'Content-Type':MIME[path.extname(file)],'Content-Length':bytes.length});response.end(request.method==='HEAD'?undefined:bytes);return;
      }
      const armyAsset=attendedArmy&&ARMY_ASSETS.has(url.pathname);
      const armyFrame=attendedArmy&&url.pathname.startsWith('/__army-qr/');
      const armyOperation=attendedArmy&&url.pathname.startsWith('/local/');
      if(armyAsset||armyFrame||armyOperation){
        const s=session(request);requestSessions.set(request,s);await admit(request);
        if(armyAsset){
          if(!['GET','HEAD'].includes(request.method)||url.search)throw fail('exact_army_asset_required');
          const file=path.join(__dirname,'../army-qr-local',ARMY_ASSETS.get(url.pathname)),bytes=fs.readFileSync(file);
          currentRequestSession(request);response.writeHead(200,{...security,'Content-Type':MIME[path.extname(file)],'Content-Length':bytes.length});response.end(request.method==='HEAD'?undefined:bytes);return;
        }
        const localToken=getCookie(request,'census_local');
        if(localToken&&attendedOwners.get(localToken)?.owner!==s.token)throw fail('website_session_changed',403);
        for(const [token,row]of attendedOwners)if(performance.now()-row.issuedAt>=3600000||!sessions.has(row.owner))attendedOwners.delete(token);
        if(attendedOwners.size>=4096)throw fail('website_session_capacity',429);
        const writeHead=response.writeHead,originalURL=request.url;
        response.writeHead=function(status,headers,...rest){
          currentRequestSession(request);
          const raw=headers?.['Set-Cookie'];
          for(const row of(Array.isArray(raw)?raw:raw?[raw]:[])){
            const token=/^census_local=([a-f0-9]{48});/.exec(row)?.[1];
            if(token)attendedOwners.set(token,{owner:s.token,issuedAt:performance.now()});
          }
          return writeHead.call(this,status,headers,...rest);
        };
        if(armyFrame)request.url=request.url.slice('/__army-qr'.length);
        try{await attended.handler(request,response);}finally{response.writeHead=writeHead;request.url=originalURL;}
        return;
      }
      const censusPath=url.pathname.startsWith('/__lab/')||url.pathname.startsWith('/api/community/shared-census/');
      if(censusPath){
        if(attendedArmy)throw fail('synthetic_census_not_mounted',404);
        const s=session(request);
        requestSessions.set(request,s);
        // Fresh real Worker context, including its original admission fences, is
        // mandatory on every operation. An old rendered shell grants nothing.
        await admit(request);
        const censusToken=getCookie(request,'census_lab');
        if(censusToken&&censusOwners.get(censusToken)?.owner!==s.token)throw fail('website_session_changed',403);
        for(const [token,row]of censusOwners)if(performance.now()-row.issuedAt>=3600000||!sessions.has(row.owner))censusOwners.delete(token);
        if(censusOwners.size>=4096)throw fail('website_session_capacity',429);
        // Same-origin callable adapter; no forwarding, listener, rewritten
        // credentials, generic upload, external transport or arbitrary DTO.
        const writeHead=response.writeHead;
        response.writeHead=function(status,headers,...rest){
          const raw=headers?.['Set-Cookie'];
          for(const row of(Array.isArray(raw)?raw:raw?[raw]:[])){
            const token=/^census_lab=([a-f0-9]{48});/.exec(row)?.[1];
            if(token)censusOwners.set(token,{owner:s.token,issuedAt:performance.now()});
          }
          return writeHead.call(this,status,headers,...rest);
        };
        try{await lab.handler(request,response);}finally{response.writeHead=writeHead;}
        return;
      }
      if(!['GET','HEAD'].includes(request.method)){counts.refusedAppWrites++;text(response,405,'Actual website writes are disabled in this synthetic preview.',{Allow:'GET, HEAD'});return;}
      if(/^\/(auth|oauth|bnet|login|verify|privacy)(\/|$)/.test(url.pathname)){counts.refusedAuthStarts++;text(response,405,'Real sign-in and account operations are not connected.');return;}
      if(url.pathname==='/__preview/status'){
        if(url.search)throw fail('query_refused');
        json(response,200,status());return;
      }
      const selection=/^\/__preview\/(member|admin|unconfirmed|denied|guest)$/.exec(url.pathname);
      let s,changed=false;
      if(selection){
        if(url.search)throw fail('query_refused');
        let old;try{old=session(request);}catch{}
        s=selectSession(request,selection[1]);changed=old!==s;
      }else if(url.pathname==='/'){
        try{s=session(request);}catch{s=selectSession(request,'member');changed=true;}
      }else{try{s=session(request);}catch{s={mode:'guest'};}}
      const pathname=selection?'/':url.pathname;
      if(!(pathname==='/'||pathname==='/health'||pathname.startsWith('/static/')||pathname.startsWith('/api/'))) {text(response,404,'Not found');return;}
      const answer=await worker.read(s.mode,pathname+url.search,request.method);
      const headers=Object.fromEntries([...answer.headers].filter(([key])=>!['set-cookie','content-length'].includes(key.toLowerCase())));
      // Fetch normalizes header names to lowercase. Replace case-insensitively:
      // duplicate CSP/Permissions-Policy fields intersect and would retain the
      // original frame/capture denial even in this explicit local-only process.
      for(const[key,value]of Object.entries(security))headers[key.toLowerCase()]=value;
      if(selection||pathname==='/')headers['Set-Cookie']=cookies(s,changed);
      let bytes=Buffer.from(await answer.arrayBuffer());
      if((headers['content-type']||'').includes('text/html')&&request.method!=='HEAD'){
        const html=bytes.toString('utf8');
        const bodies=[...html.matchAll(/<body(?:\s[^>]*)?>/g)];
        if(html.split('</head>').length!==2||bodies.length!==1)throw fail('website_shell_shape',503);
        bytes=Buffer.from(html.replace('</head>','<link rel="stylesheet" href="/__census-local/preview-shell.css">\n</head>').replace(bodies[0][0],bodies[0][0]+localToolbar));
      }
      response.writeHead(answer.status,headers);response.end(request.method==='HEAD'?undefined:bytes);
    }catch(error){
      const code=/^[a-z][a-z0-9_]{0,70}$/.test(error.code||'')?error.code:'internal_refusal';
      const httpStatus=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:500;
      if(!response.headersSent)json(response,httpStatus,{error:{code,message:httpStatus===500?'The synthetic website refused an internal operation.':`The synthetic request was refused: ${code}.`}});else response.end();
    }
  });
  server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  function status(){return{kind:attendedArmy?'attended-local-army-website':'synthetic-only-shared-census-website',syntheticOnly:!attendedArmy,websiteIdentitiesSynthetic:true,productionConnection:false,productionActivation:false,outboundNetwork:false,inMemory:true,arbitraryInput:false,actualWebsiteWrites:false,sourcePins,...counts,...worker.counts(),fixtureGuards:worker.guards(),census:attendedArmy?attended.status():lab.counts()};}
  const close=async()=>{
    if(closed)return;closed=true;
    await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});
    await lab?.close();await attended?.close();await worker.close();sessions.clear();censusOwners.clear();attendedOwners.clear();globalThis.fetch=originalFetch;active=false;
  };
  try{
    active=true;
    worker=await createWorkerFixture(assets);
    if(attendedArmy){
      const originalOverlay=require('../attended-census-local/overlay.cjs');
      const overlay={renderPilot:originalOverlay.renderPilot,renderHTML(source){const html=originalOverlay.renderHTML(source);if(html.split('</head>').length!==2)throw Error('One embedded local HTML head required');return html.replace('</head>','<script src="/__army-view/frame-host.js" defer></script></head>');}};
      attended=createAttendedServer({origin,admit,guard:currentRequestSession,embeddedLocal:true,overlay,...(options.now?{now:options.now}:{})});
    }else lab=createLabServer({origin,admit,guard:currentRequestSession,qrFixtureFactory:options.qrFixtureFactory||createFixture,...(options.now?{now:options.now}:{})});
    const requested=options.port===undefined?0:options.port;
    if(!Number.isInteger(requested)||requested<0||requested>65535)throw Error('Valid loopback TCP port required');
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(requested,'127.0.0.1',()=>{port=server.address().port;resolve();});});
    return{server,origin,close,status,syntheticOnly:!attendedArmy};
  }catch(error){closed=true;await lab?.close();await attended?.close();await worker?.close();globalThis.fetch=originalFetch;active=false;throw error;}
}

if(require.main===module){
  const args=process.argv.slice(2);let port=0;
  if(args.length){if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||Number(args[1])<1024||Number(args[1])>65535)throw Error('Use --port 1024..65535');port=Number(args[1]);}
  createWebsiteServer({port}).then(app=>{
    console.log(JSON.stringify({kind:'synthetic-only-shared-census-website',origin:app.origin(),pid:process.pid,inMemory:true,productionConnection:false}));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>console.log('SYNTHETIC_WEBSITE_STOPPED')));
  }).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
module.exports={createWebsiteServer,SECURITY};
