'use strict';
// Only independent fixture worlds may use this pool. A continuation/custody chain is never divided.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {runPool}=require('./ci-shards.cjs');

function writeCaseResult({group,ok,n,payload=null}) {
  const file=process.env.OLYMPUS_CI_CASE_RESULT;
  if(!file) return; // Ordinary standalone invocation is unchanged.
  if(process.env.GITHUB_ACTIONS!=='true'||!path.isAbsolute(file)||typeof group!=='string'||!Number.isSafeInteger(ok)||!Number.isSafeInteger(n)||n<1||ok!==n||process.exitCode) throw Error('Incomplete isolated fixture result');
  const expected=process.env.OLYMPUS_CI_EXPECTED_CHECKS;
  if(expected!==''&&expected!==undefined&&n!==Number(expected)) throw Error('Original fixture assertion count changed: '+group+' '+n+' != '+expected);
  fs.writeFileSync(file,JSON.stringify({group,ok,n,payload})+'\n',{flag:'wx'});
}

async function runCasePool({file,groups,childEnvKey,extraEnv={}}) {
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.OLYMPUS_CI_CASE_POOL!=='1') throw Error('Isolated case pool is hosted-CI opt-in only');
  if(!path.isAbsolute(file)||!/^OLYMPUS_CI_(ROSTER|CENSUS)_GROUP$/.test(childEnvKey)||!Array.isArray(groups)||groups.length<1||groups.length>32) throw Error('Invalid isolated case plan');
  const tasks=groups.map(group=>typeof group==='string'?{id:group}:group);
  if(tasks.some(g=>!/^[a-z0-9-]+$/.test(g.id))||new Set(tasks.map(g=>g.id)).size!==tasks.length) throw Error('Duplicate/invalid case identity');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-ci-cases-'));
  const concurrency=Math.max(1,Math.min(4,os.availableParallelism()));
  const children=new Set(),controller=new AbortController();let interrupted=false;
  const stop=()=>{interrupted=true;controller.abort();for(const child of children)try{child.kill('SIGTERM');}catch{}};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  let output=Promise.resolve();
  let result;
  try{result=await runPool(tasks,{concurrency,signal:controller.signal,runTask:task=>new Promise(resolve=>{
    const resultFile=path.join(directory,task.id+'.json'),log=path.join(directory,task.id+'.log'),evidence=path.join(directory,task.id+'-evidence');
    fs.mkdirSync(evidence);const fd=fs.openSync(log,'wx'),start=performance.now();
    const child=cp.spawn(process.execPath,[file],{cwd:path.dirname(path.dirname(file)),windowsHide:true,shell:false,stdio:['ignore',fd,fd],env:{...process.env,...extraEnv,[childEnvKey]:task.id,OLYMPUS_CI_CASE_RESULT:resultFile,OLYMPUS_CI_EXPECTED_CHECKS:task.expectedChecks===undefined?'':String(task.expectedChecks),PRIVACY_ADMISSION_OUTPUT_DIR:evidence}});
    fs.closeSync(fd);children.add(child);let error=null;child.once('error',e=>{error=e;});
    child.once('close',(exitCode,signal)=>{
      children.delete(child);let receipt=null;
      try{receipt=JSON.parse(fs.readFileSync(resultFile,'utf8'));if(receipt.group!==task.id||receipt.ok!==receipt.n||receipt.n<1||(task.expectedChecks!==undefined&&receipt.n!==task.expectedChecks))throw Error('Incomplete original fixture checks');}
      catch(e){error=error||e;}
      const status=exitCode===0&&!signal&&!error&&!interrupted?'success':signal?'cancelled':'failure';
      const row={status,group:task.id,exitCode,signal,elapsedMs:Math.round(performance.now()-start),resultFile,log,receipt,...(error?{error:error.message}:{})};
      console.log('CI_CASE_RESULT '+JSON.stringify({...row,receipt:receipt?{group:receipt.group,ok:receipt.ok,n:receipt.n}:null}));
      output=output.then(()=>new Promise((done,reject)=>{console.log('::group::'+path.basename(file)+' '+task.id);const s=fs.createReadStream(log);s.on('error',reject);s.on('end',()=>{console.log('\n::endgroup::');done();});s.pipe(process.stdout,{end:false});}));
      resolve(row);
    });
  })});await output;}
  finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
  result={...result,success:result.success&&!interrupted,directory,concurrency};
  fs.writeFileSync(path.join(directory,'pool.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  if(!result.success)process.exitCode=1;
  return result;
}
module.exports={runCasePool,writeCaseResult};
