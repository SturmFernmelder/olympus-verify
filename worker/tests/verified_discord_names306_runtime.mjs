import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const here=path.dirname(fileURLToPath(import.meta.url));
const temp=mkdtempSync(path.join(tmpdir(),'olympus-names306-'));
const calls=[];
const worker=buildSync({entryPoints:[path.join(here,'verified_discord_names306_fixture.mjs')],bundle:true,write:false,platform:'browser',format:'esm',
  target:'es2022',external:['node:async_hooks'],logLevel:'silent'}).outputFiles[0].text;
const runtime=new Miniflare(convertV4MiniflareOptions({rootPath:temp,script:worker,modules:true,compatibilityDate:'2026-09-01',
  compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},
  unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'names306'},
  resourceTmpPath:path.join(temp,'tmp'),resourcePersistencePath:path.join(temp,'persist'),isolatedResourcePersistencePath:path.join(temp,'isolated'),
  outboundService(request){
    const url=new URL(request.url),p=url.pathname;
    assert.equal(url.hostname,'discord.com');
    assert.equal(request.method,'GET');
    const route=p.match(/^\/api\/v10\/(guilds\/900000000000000001\/members|users)\/(80000000000000000[1-8])$/);
    assert.ok(route,'unexpected synthetic provider route');
    const [,kind,id]=route, n=Number(id.slice(-1));calls.push([kind,n]);
    if(kind==='users'&&n===4)return Response.json({message:'Unavailable'},{status:403});
    if(kind==='users')return Response.json({id,username:'fallback_handle'});
    if(n===3)return Response.json({message:'Unavailable'},{status:503});
    return Response.json({pending:n===6,user:{id:n===2?'800000000000000001':id,username:n===4?'':'valid_account',global_name:'Valid Account'}});
  }}));
try {
  const response=await runtime.dispatchFetch('https://fixture.invalid/names',{method:'POST'});
  assert.equal(response.status,200,(await response.clone().text())+'; provider calls '+JSON.stringify(calls));
  const {checks}=await response.json();
  assert.deepEqual(calls.map(([kind,n])=>[kind==='users'?'user':'member',n]),[['member',1],['member',2],['member',3],['member',4],['member',6],['user',4],['user',2],['user',1],['member',8]]);
  for(const check of checks)console.log('PASS '+check);
  console.log('Verified names runtime PASS ('+checks.length+' D1 checks and exact provider requests)');
} finally {
  await runtime.dispose();
  assert.equal(path.dirname(temp),path.resolve(tmpdir()));
  assert(path.basename(temp).startsWith('olympus-names306-'));
  rmSync(temp,{recursive:true,force:true});
}
