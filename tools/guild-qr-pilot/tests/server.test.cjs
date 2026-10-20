'use strict';
// Loopback-only static contract. No request to production or external services.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('../serve.cjs');
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.stack);}}
(async()=>{
 const app=createServer();await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
 const address=app.server.address(),port=address.port;
 function request(route,options={}){return new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port,path:route,method:options.method||'GET',headers:{Host:'127.0.0.1:'+port,
     ...(options.body===undefined?{}:{'Content-Length':Buffer.byteLength(options.body,'utf8')}),...options.headers}},res=>{
    const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
   });req.setTimeout(2000,()=>req.destroy(new Error('Local test request timed out')));req.on('error',reject);req.end(options.body);
 });}
 try{
  await check('ephemeral server binds IPv4 loopback only and reports exact origin',()=>{assert.equal(address.address,'127.0.0.1');assert.equal(address.family,'IPv4');assert.equal(app.origin(),'http://127.0.0.1:'+port);});
  const known={'/':'index.html','/index.html':'index.html','/pilot.css':'pilot.css','/pilot.js':'pilot.js','/protocol.js':'protocol.js','/decoder.js':'decoder.js','/vendor/jsqr-1.4.0.js':'vendor/jsqr-1.4.0.js','/vendor/jsqr-1.4.0.LICENSE.txt':'vendor/jsqr-1.4.0.LICENSE.txt'};
  for(const [route,file] of Object.entries(known))await check('GET serves exact known file '+route,async()=>{const out=await request(route);assert.equal(out.status,200);assert.deepEqual(out.body,fs.readFileSync(path.join(__dirname,'..',file)));assert.equal(Number(out.headers['content-length']),out.body.length);assert.match(out.headers['content-type'],/charset=utf-8/);});
  await check('all static responses deny network and unsafe document capabilities',async()=>{
   const out=await request('/'),csp=out.headers['content-security-policy'];
   for(const clause of ["default-src 'none'","connect-src 'none'","base-uri 'none'","form-action 'none'","frame-ancestors 'none'","object-src 'none'","script-src 'self'","worker-src 'self'"])assert.ok(csp.split('; ').includes(clause),clause);
   assert.ok(!csp.includes("'unsafe-inline'")&&!csp.includes('https:')&&!csp.includes('http:'));
   assert.equal(out.headers['cache-control'],'no-store');assert.equal(out.headers['referrer-policy'],'no-referrer');assert.equal(out.headers['x-content-type-options'],'nosniff');assert.equal(out.headers['x-frame-options'],'DENY');
   assert.equal(out.headers['cross-origin-opener-policy'],'same-origin');assert.equal(out.headers['cross-origin-resource-policy'],'same-origin');
   assert.match(out.headers['permissions-policy'],/microphone=\(\)/);assert.match(out.headers['permissions-policy'],/camera=\(self\)/);assert.match(out.headers['permissions-policy'],/display-capture=\(self\)/);
  });
  await check('HEAD has zero body and same byte count as GET',async()=>{const get=await request('/'),head=await request('/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(head.headers['content-length'],get.headers['content-length']);assert.equal(head.headers['content-security-policy'],get.headers['content-security-policy']);});
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])await check(method+' rejects submissions without echoing body',async()=>{const out=await request('/',{method,body:'private-canary-must-not-echo'});assert.equal(out.status,405);assert.equal(out.headers.allow,'GET, HEAD');assert.ok(!out.body.toString().includes('private-canary'));assert.equal(out.headers['cache-control'],'no-store');});
  for(const route of ['/upload','/api/news','/../CLAUDE.md','/%2e%2e/CLAUDE.md','/..%2fCLAUDE.md','/pilot.js?token=x','/vendor/NOTICE.txt','/serve.cjs','//pilot.js','/vendor/../pilot.js'])await check('unknown or traversal path refuses '+route,async()=>{const out=await request(route);assert.equal(out.status,404);assert.equal(out.body.toString(),'Not found.');assert.equal(out.headers['cache-control'],'no-store');});
  for(const host of ['example.com','127.0.0.1','127.0.0.1:'+port+'.example.com','localhost','[::1]:'+port,'127.0.0.2:'+port])await check('spoofed Host refuses '+host,async()=>{const out=await request('/',{headers:{Host:host}});assert.equal(out.status,403);assert.equal(out.body.toString(),'Local viewer only.');});
  await check('localhost Host allowed only with exact ephemeral port',async()=>{const out=await request('/',{headers:{Host:'localhost:'+port}});assert.equal(out.status,200);});
  await check('foreign Origin receives no CORS grant,cookie or reflected data',async()=>{const out=await request('/',{headers:{Origin:'https://untrusted.invalid',Cookie:'private-cookie-never-echo'}});assert.equal(out.status,200);assert.equal(out.headers['access-control-allow-origin'],undefined);assert.equal(out.headers['access-control-allow-credentials'],undefined);assert.equal(out.headers['set-cookie'],undefined);assert.ok(!out.body.toString().includes('private-cookie-never-echo'));});
  await check('HEAD refuses unknown path and spoofed Host with empty body',async()=>{for(const options of [{method:'HEAD'},{method:'HEAD',headers:{Host:'not-local.invalid'}}]){const out=await request('/unknown',options);assert.equal(out.status,options.headers?403:404);assert.equal(out.body.length,0);}});
  await check('counters contain only static/refusal totals,no observations or request bodies',()=>{assert.deepEqual(Object.keys(app.counts),['staticGet','staticHead','refusedMethod','refusedHost','notFound']);assert.ok(app.counts.staticGet>=8);assert.equal(app.counts.refusedMethod,5);assert.equal(app.counts.staticHead,1);assert.equal(app.counts.refusedHost,7);assert.equal(app.counts.notFound,11);for(const value of Object.values(app.counts))assert.ok(Number.isInteger(value));});
 }finally{await new Promise(resolve=>app.server.close(resolve));app.server.closeAllConnections();}
 console.log('\n'+passed+' passed, '+failed+' failed');if(failed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
