'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {build} = require('esbuild');
const {Miniflare,Log,LogLevel,convertV4MiniflareOptions} = require('miniflare');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'prime-realm-'));
  const root = path.resolve(__dirname,'..');
  const fixtureHash = createHash('sha256').update('prime-guild-master|1|Player-9999-00000001').digest('hex');
  // Only the independently provisioned enrollment is a fixture. The handler, rank policy, auth,
  // database, clocks and overlap checks execute from their production modules.
  const fixtureEnrollment = {name:'fixture-enrollment',setup(plugin) {
    plugin.onResolve({filter:/^\.\/prime-realm-enrollment$/},()=>({path:'enrollment',namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const PRIME_GUILD_MASTER_SHA256 = '${fixtureHash}';`}));
  }};
  try {
    for (const scenario of ['production','canonical','recorded-live']) {
      const productionPin=scenario==='production';
      const bundle = await build({entryPoints:[path.join(__dirname,'prime_realm_binding_runtime.mjs')],absWorkingDir:root,
        bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],
        tsconfig:path.join(root,'tsconfig.json'),plugins:productionPin?[]:[fixtureEnrollment],logLevel:'silent'});
      const outbound=[];
      const mf = new Miniflare(convertV4MiniflareOptions({rootPath:temp,script:bundle.outputFiles[0].text,modules:true,
        compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,
        telemetry:{enabled:false},log:new Log(LogLevel.WARN),logRequests:false,unsafeRegisterWorker:false,
        unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'prime-'+scenario},
        resourceTmpPath:path.join(temp,'tmp'),resourcePersistencePath:path.join(temp,'persist'),
        isolatedResourcePersistencePath:path.join(temp,'isolated'),outboundService:async request=>{
          const url=new URL(request.url),id=url.pathname.split('/').pop();
          outbound.push(request.method+' '+url.pathname);
          if(request.method==='GET'&&url.hostname==='discord.com'&&['800000000000000012','800000000000000013'].includes(id)){
            if(request.headers.get('Authorization')==='Bot synthetic-advance-roster-during-discord'){
              const advanced=await mf.dispatchFetch('http://fixture.invalid/fixture-advance/'+scenario);
              assert.equal(advanced.status,204);
            }
            return Response.json({user:{id},roles:id.endsWith('13')?['1299841745550311535']:[]});
          }
          return new Response(null,{status:503});
        }}));
      try {
        const response=await mf.dispatchFetch('http://fixture.invalid/'+scenario);
        const payload=await response.json();
        assert.equal(response.status,200,JSON.stringify(payload));
        // Count what actually reached the external transport. Any lookup for a pending
        // Initiate or changed rank, or any role mutation, fails this assertion.
        const attended=[12,13,12,13,12],background=[12,13,12,13,12,13];
        assert.deepEqual(outbound,productionPin?[]:[...attended,...background].map(id=>
          'GET /api/v10/guilds/236932545793490944/members/8000000000000000'+id));
        for (const row of payload.checks)console.log('PASS ['+scenario+'] '+row);
      } finally { await mf.dispose(); }
    }
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
