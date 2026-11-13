'use strict';
// Closed genuine Workerd/D1 cases. No source clock/Native authority substitution.
// node tests/erasure196_debt280_workerd_test.cjs --out <new-dir> [--cases combined-known,original-inactive] [--priority]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),option=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
const out=path.resolve(option('--out')||'');assert(option('--out')&&!fs.existsSync(out),'new explicit evidence directory required');fs.mkdirSync(out,{recursive:true});
const kinds=(option('--cases')||'combined-known,original-inactive').split(',');assert(kinds.length&&new Set(kinds).size===kinds.length&&kinds.every(x=>['combined-known','original-inactive'].includes(x)),'closed cases');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),checks=[],observations=[];
const check=(name,pass,observed)=>{checks.push({name,pass:!!pass,observed});console.log((pass?'PASS ':'FAIL ')+name);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitOriginal=async(at,label)=>{const delay=Math.max(0,at*1000-Date.now());assert(delay<=122000,label+' original wait bounded');if(delay)await sleep(delay);};
const tableRows=x=>x??[],immutablePointer=x=>({operation_id:x.operation_id,purpose:x.purpose,channel_id:x.channel_id,message_id:x.message_id,created_at:x.created_at,retain_until:x.retain_until});
(async()=>{
  const compiled=await build({entryPoints:[path.join(__dirname,'erasure196_debt280_workerd_fixture.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],metafile:true,logLevel:'silent'});
  const bundle=compiled.outputFiles[0].text,pins=Object.keys(compiled.metafile.inputs).map(x=>({path:path.resolve(root,x),sha256:hash(fs.readFileSync(path.resolve(root,x)))}));
  fs.writeFileSync(path.join(out,'bundle.mjs'),bundle);
  for(const kind of kinds){
    const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'ed196-')),directory=path.join(out,kind);fs.mkdirSync(directory);let mf;
    const http=[],messagePresent=new Map(['1551234567890123461','1551234567890123462','1551234567890123471','1551234567890123472','1551234567890123473'].map(x=>[x,true]));
    const G='236932545793490944',B='300000000000000099',C='1551234567890123460',W='1551234567890123491',T='synthetic-erasure196-webhook-token-01234567890123456789';
    const provider=async request=>{
      const u=new URL(request.url),route=u.pathname.replace(/^\/api\/v10/,''),auth=request.headers.get('Authorization'),entry={method:request.method,origin:u.origin,path:route,at:Date.now(),status:null};http.push(entry);assert.equal(u.origin,'https://discord.com','closed synthetic provider origin');
      const reply=(status,body)=>{entry.status=status;return new Response(body===undefined?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});};
      if(request.method==='POST'&&['/oauth2/token','/api/oauth2/token'].includes(route)){
        const p=new URLSearchParams(await request.text()),id=p.get('code')?.slice(5);assert(['300000000000000003','300000000000000004','300000000000000005'].includes(id)&&p.get('client_secret')==='synthetic-erasure196-client');return reply(200,{access_token:'tok-'+id,token_type:'Bearer',scope:'identify guilds.members.read'});
      }
      if(auth?.startsWith('Bearer tok-')){
        const id=auth.slice('Bearer tok-'.length);if(route==='/users/@me')return reply(200,{id,username:'synthetic-'+id.slice(-1),global_name:'Synthetic E2',avatar:null});
        if(route==='/users/@me/guilds/'+G+'/member')return reply(200,{user:{id},roles:[],joined_at:'2020-01-01T00:00:00Z',pending:false,nick:null});
      }
      if(route==='/webhooks/'+W+'/'+T&&request.method==='GET')return reply(200,{id:W,type:1,guild_id:G,channel_id:C});
      if(route.startsWith('/webhooks/'+W+'/'+T+'/messages/')){
        const id=route.split('/').at(-1);assert(messagePresent.has(id));if(request.method==='GET')return messagePresent.get(id)?reply(200,{id,channel_id:C,webhook_id:W}):reply(404,{});
        if(request.method==='DELETE'){messagePresent.set(id,false);return reply(204);}
      }
      if(!['Bot synthetic-erasure196-bot','Bot synthetic-erasure196-bot-hold'].includes(auth))throw Error('unexpected synthetic credentials/route');
      if(route==='/guilds/'+G+'/roles'&&request.method==='GET')return auth.endsWith('-hold')?reply(503,{message:'synthetic inventory unavailable'}):reply(200,[{id:G,name:'@everyone',position:0,permissions:'0',managed:false},...['1551234567890123456','1551234567890123457','1551234567890123458','1551234567890123476','1551234567890123477','1551234567890123478'].map((id,i)=>({id,name:'Synthetic role '+i,position:i+1,permissions:'0',managed:false}))]);
      if(route==='/users/@me'&&request.method==='GET')return reply(200,{id:B,bot:true});
      if(route.startsWith('/guilds/'+G+'/members/')&&request.method==='GET'){const id=route.split('/').at(-1);assert(['300000000000000003','300000000000000004','300000000000000005',B].includes(id));return reply(200,{user:{id,bot:id===B},roles:[],joined_at:'2020-01-01T00:00:00Z'});}
      if(route.startsWith('/channels/'+C+'/messages/')){
        const id=route.split('/').at(-1);assert(messagePresent.has(id));if(request.method==='GET')return messagePresent.get(id)?reply(200,{id,channel_id:C,author:{id:B}}):reply(404,{code:10008});
        if(request.method==='DELETE'){
          if(id==='1551234567890123472')return reply(403,{code:50013,message:'Missing Permissions'});
          messagePresent.set(id,false);if(id==='1551234567890123473'){entry.status='lost-after-effect';throw Error('synthetic original DELETE reply lost after effect');}return reply(204);
        }
      }
      throw Error('unexpected synthetic provider '+request.method+' '+route);
    };
    try{
      mf=new Miniflare(convertV4MiniflareOptions({rootPath:runtime,script:bundle,modules:true,name:'erasure196-debt280',compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.WARN),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,resourceTmpPath:path.join(runtime,'t'),resourcePersistencePath:path.join(runtime,'p'),isolatedResourcePersistencePath:path.join(runtime,'i'),d1Databases:{DB:'erasure196-debt280'},outboundService:provider}));await mf.ready;
      let requestNumber=0;
      const request=async name=>{const response=await mf.dispatchFetch('http://fixture.invalid/'+name+'?kind='+kind,{method:'POST'}),text=await response.text();fs.writeFileSync(path.join(directory,String(++requestNumber).padStart(2,'0')+'-'+name+'.json'),text);const value=JSON.parse(text);assert.equal(response.status,200,value.error);return value;};
      const prepared=await request('prepare');check(kind+' actual OAuth and signed original collector admission',prepared.actualLocalWorkerdD1&&prepared.clockOverride===false&&prepared.cookieReady&&prepared.intake.status===200&&prepared.intake.body.acknowledgements.length===1&&prepared.extraReceipt.status===200,prepared.admission);
      if(kind==='original-inactive')check(kind+' source inactive admission does not fabricate an immediate terminal attempt',prepared.admission.attempted===0&&prepared.originalQueue.state==='waiting_role'&&prepared.originalQueue.last_attempt_at===null,prepared.originalQueue);
      await waitOriginal(prepared.notBefore,kind);const beforeHTTP=http.length,terminal=await request('terminal'),t=terminal.turns.find(x=>x.label==='original-native-terminal'),after=terminal.after;
      check(kind+' actual original job reaches retired complete local state',terminal.result.completed===1&&after.jobs.some(x=>x.operation_id===prepared.originalQueue.operation_id&&x.state==='complete')&&!after.users.some(x=>x.discord_id==='300000000000000003')&&after.subjects.some(x=>x.subject_id==='300000000000000003'&&x.state==='retired'),{result:terminal.result,jobs:after.jobs});
      const immutableJob=x=>({operation_id:x.operation_id,subject_id:x.subject_id,subject_generation:x.subject_generation,request_digest:x.request_digest,original_account_incarnation:x.original_account_incarnation,created_at:x.created_at,retain_until:x.retain_until});
      check(kind+' original job identity and fixed clock custody unchanged',JSON.stringify(immutableJob(after.jobs.find(x=>x.operation_id===prepared.originalQueue.operation_id)))===JSON.stringify(immutableJob(prepared.originalQueue)));
      check(kind+' terminal within unchanged196 physical statements',t.physical>0&&t.physical<=196,t);
      const emitted=terminal.wires.slice(t.first,t.last).flatMap(w=>w.request),issuer=emitted.filter(x=>x.sql.startsWith('INSERT INTO audit')&&x.sql.includes("'system','treasury.erased_replay280'")),proof=emitted.filter(x=>x.sql.includes('erased_receipt_replay_scope_held'));
      check(kind+' actual terminal includes marker issuer and completeness proof',issuer.length===1&&proof.length===1,{issuer:issuer.length,proof:proof.length});
      const original=JSON.parse(prepared.original),markers=after.markers.filter(x=>x.subject===original.id);
      check(kind+' receipt erased only with original-expiry minimal marker',after.receipts.length===0&&markers.length===1&&markers[0].details===null&&markers[0].ts===original.requestedAt+2592000,markers);
      check(kind+' terminal preserves requested pointer custody and emits no message DELETE',after.pointers.length===2&&after.pointers.every(x=>x.state==='known'&&x.cleanup_requested===1)&&http.slice(beforeHTTP).every(x=>x.method!=='DELETE'),{pointers:after.pointers,http:http.slice(beforeHTTP)});
      if(kind==='combined-known')check(kind+' actual private status separates local completion and known external debt',terminal.status?.status===200&&terminal.status.body.servingAccountErased===true&&terminal.status.body.allCopiesErased===false&&terminal.status.body.externalCleanup.known===2,terminal.status);
      check(kind+' terminal preserves original pointer tuple and retention',prepared.originalBefore.pointers.every(x=>after.pointers.some(y=>JSON.stringify(immutablePointer(x))===JSON.stringify(immutablePointer(y)))));
      check(kind+' terminal anonymizes metadata without losing exact cleanup witness',after.metadata.every(x=>{const m=JSON.parse(x.value);return m.actor===null&&m.birth===null&&m.generation===null&&m.credentialPin.length===43;}));
      const debts=[];let d=await request('debt');debts.push(d.turn);
      check(kind+' no-jobs invocation actually drains one retained pointer',d.before.jobs.every(x=>x.state==='complete')&&d.turn.outcome.attempted===0&&d.after.pointers.filter(x=>x.state==='removed').length===1&&d.turn.physical<=196,d.turn);
      const noJobsBranch=d.wires.slice(d.turn.first,d.turn.last).flatMap(x=>x.request).some(x=>x.sql.includes('ORDER BY m.created_at,m.operation_id LIMIT 1'));
      if(noJobsBranch)check(kind+' actual no-job fallback branch reaches retained debt',d.turn.phase===1&&noJobsBranch,d.turn);
      else console.log('HELD '+kind+' no-job fallback branch unavailable during actual even debt-reservation phase');
      d=await request('debt');debts.push(d.turn);check(kind+' next separate debt turn drains second original pointer',d.after.pointers.every(x=>x.state==='removed')&&d.turn.physical<=196,d.turn);
      const controls=await request('controls'),controlRows=controls.after.pointers.filter(x=>x.operation_id.startsWith('control-'));
      const row=tag=>controlRows.find(x=>x.operation_id===('control-'+tag).padEnd(32,'x'));
      check(kind+' unknown and refused sends remain exactly held with no provider adoption',JSON.stringify(row('unknown'))===JSON.stringify(controls.before.pointers.find(x=>x.operation_id===row('unknown').operation_id))&&JSON.stringify(row('refused'))===JSON.stringify(controls.before.pointers.find(x=>x.operation_id===row('refused').operation_id))&&!http.some(x=>x.path.endsWith('1551234567890123474')||x.path.endsWith('1551234567890123475')));
      check(kind+' lost DELETE is reconciled by GET without repeating effect',row('lost').state==='removed'&&http.filter(x=>x.method==='DELETE'&&x.path.endsWith('1551234567890123473')).length===1);
      check(kind+' refused DELETE is not automatically resent',row('refusal').state==='cleaning'&&http.filter(x=>x.method==='DELETE'&&x.path.endsWith('1551234567890123472')).length===1);
      check(kind+' held pointer rotation reaches other known work',row('known').state==='removed'&&controls.turns.every(x=>x.physical<=196),controls.turns);
      const selector=await request('selector-controls');check(kind+' exact source selector excludes unknown/refused sends',selector.sourceSelector&&!selector.selected.some(x=>x.operation_id===row('unknown').operation_id||x.operation_id===row('refused').operation_id));
      let priority=null;if(args.includes('--priority')){
        priority=await request('priority');if(priority.phaseUnavailable)console.log('HELD '+kind+' even-quarter-hour priority unavailable on actual DB clock');
        else{await waitOriginal(priority.notBefore,kind+' priority');const observed=await request('priority-turn');
          check(kind+' actual even-phase debt turn precedes two eligible original waiting jobs',observed.turn.phase===0&&observed.before.jobs.filter(x=>x.state!=='complete').length===2&&observed.result.attempted===0&&JSON.stringify(observed.before.jobs)===JSON.stringify(observed.after.jobs)&&observed.turn.physical<=196,{turn:observed.turn,jobs:observed.after.jobs});
          priority={...priority,observed};
        }
      }
      observations.push({kind,runtime,directory,terminal:t,debtTurns:debts,noJobsFallbackBranchObserved:noJobsBranch,priority,clockOverride:false,actualLocalWorkerdD1:true,http});
    }finally{if(mf)await mf.dispose();}
  }
  const stable=pins.every(p=>hash(fs.readFileSync(p.path))===p.sha256);check('compiled source and fixture inputs byte-stable',stable);
  const result={at:new Date().toISOString(),passed:checks.filter(x=>x.pass).length,total:checks.length,checks,observations,stable,bundleSHA256:hash(bundle),pins,limits:['Actual local Workerd/D1, original source clocks/Native and full-index OAuth/erasure; external Discord and fixture seed custody are synthetic','Even-quarter-hour priority is UNVERIFIED when its actual phase is unavailable; no fake Date/SQLite clock is substituted','Component196 slices only; whole700 scheduled callback and production/native-client acceptance remain separate','Independent message cleanup has bounded opportunities, not an unconditional wall-clock completion SLA']};
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(result.passed+'/'+result.total+' genuine Native/debt checks');if(result.passed!==result.total)process.exitCode=1;
})().catch(error=>{fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:String(error.stack??error),checks,observations},null,2)+'\n');console.error(error.stack??error);process.exitCode=1;});
