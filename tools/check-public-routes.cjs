'use strict';
// Reusable post-deployment observations, not a pre-deployment suite or operator loop.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  if(!['--build','--commit','--output'].includes(args[i])||!args[i+1]||Object.hasOwn(options,args[i]))throw Error('Use --build BUILD --commit SHA --output NEW_JSON');
  options[args[i]]=args[i+1];
}
const build=options['--build'],commit=options['--commit'],output=options['--output'],root=path.resolve(__dirname,'..');
if(!/^\d{4}-\d{2}-\d{2}\.\d+ .+$/.test(build??'')||!/^[a-f0-9]{40}$/.test(commit??'')||!output||!path.isAbsolute(output)||fs.existsSync(output))throw Error('Exact current build/commit and new absolute output file required');
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'public-route-cases.json'),'utf8')).cases;
if(cases.length!==90)throw Error('Expected the existing ninety public behaviors');
const hosts=new Set(['olympus.roachcouncil.com','olympus-verify.roach-council.workers.dev','guild.roachcouncil.com']);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function source(relative){
  const result=cp.spawnSync('git',['-C',root,'show',commit+':'+relative],{windowsHide:true,maxBuffer:32*1024*1024});
  if(result.status!==0)throw Error('Cannot read the supplied committed public artifact');
  return result.stdout;
}
function check(c,response,body,url){
  const failures=[];
  if(response.status!==c.status)failures.push('status');
  for(const h of c.headers){
    const actual=response.headers.get(h.name),wanted=h.name==='location'&&c.preserveQuery?h.value+url.search:h.value;
    if(!(h.mode==='absent'?actual===null:h.mode==='equals'?actual===wanted:typeof actual==='string'&&actual.includes(wanted)))failures.push('header:'+h.name);
  }
  if(response.headers.has('set-cookie')&&!c.form)failures.push('unexpected-cookie');
  if(c.method==='HEAD'&&body.length)failures.push('HEAD-body');
  if(c.bodySHA256&&hash(body)!==c.bodySHA256)failures.push('response-content');
  if(c.form&&!/<form\b/i.test(body.toString()))failures.push('account-form');
  if(url.pathname==='/health'){
    let value={};try{value=JSON.parse(body);}catch{}
    if(value.ok!==true||value.d1!=='ok'||value.build!==build)failures.push('actual-build-or-d1');
  }
  return failures;
}
(async()=>{
  const startedAt=new Date().toISOString(),rows=[];
  for(const original of cases){
    const c=structuredClone(original),url=new URL(c.url);
    if(url.protocol!=='https:'||!hosts.has(url.hostname)||url.username||url.password||url.port||url.hash||!['GET','HEAD','OPTIONS'].includes(c.method))throw Error('Anonymous fixed-host scope refused');
    if(c.status===200&&c.method==='GET'&&url.pathname.startsWith('/static/')){
      if(url.pathname.includes('..')||url.pathname.includes('%'))throw Error('Noncanonical artifact refused');
      c.bodySHA256=hash(source('worker/public'+url.pathname));
    }
    if(!c.queryFree)url.searchParams.set('olympus-release-probe',commit.slice(0,12)+'-'+rows.length+'-'+Date.now());
    try{
      const response=await fetch(url,{method:c.method,redirect:'manual',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)}),body=Buffer.from(await response.arrayBuffer());
      const strictFailures=check(c,response,body,url),effective=structuredClone(c),robots=c.url==='https://olympus-verify.roach-council.workers.dev/robots.txt';
      if(robots){effective.status=200;delete effective.bodySHA256;}
      const failures=check(effective,response,body,url);
      if(robots&&((c.method==='GET'&&(!body.length||!body.toString().split(/\r?\n/).every(line=>/^\s*(?:#.*)?$/.test(line))))||response.headers.has('location')||!/text\/plain/i.test(response.headers.get('content-type')??'')))failures.push('robots-comment-exception');
      const headers=Object.fromEntries(response.headers);if(headers['set-cookie'])headers['set-cookie']='<present; value redacted>';
      rows.push({ordinal:rows.length+1,method:c.method,url:c.url,status:response.status,bytes:body.length,sha256:hash(body),headers,strictFailures,failures,passed:failures.length===0,ownerAllowance:robots?'approved comment-only robots200':null});
    }catch(error){rows.push({ordinal:rows.length+1,method:c.method,url:c.url,passed:false,strictFailures:['transport'],failures:['transport:'+error.name]});}
  }
  const result={startedAt,at:new Date().toISOString(),build,sourceCommit:commit,cases:rows.length,passed:rows.filter(r=>r.passed).length,strictPassed:rows.filter(r=>r.strictFailures.length===0).length,anonymousOnly:true,credentialsSent:false,mutatingRequests:0,retries:0,rows};
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({cases:result.cases,passed:result.passed,strictPassed:result.strictPassed,failures:rows.filter(r=>!r.passed).map(r=>({ordinal:r.ordinal,failures:r.failures}))}));
  if(result.passed!==90)process.exitCode=1;
})().catch(()=>{console.error('Public-route observations incomplete; preserve original evidence.');process.exitCode=1;});
