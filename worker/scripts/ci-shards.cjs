'use strict';
// CI scheduling only. Each original command remains a separate Node process and keeps its own clocks/assertions.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const ROOT = path.resolve(__dirname, '..');
const SHARDS = 8;

function expandScripts(scripts, name = 'test:all', parents = []) {
  if (parents.includes(name)) throw Error('Recursive npm script: '+[...parents,name].join(' -> '));
  if (typeof scripts[name] !== 'string' || !scripts[name].trim()) throw Error('Missing npm script: '+name);
  return scripts[name].split(/\s*&&\s*/).flatMap(command => {
    const alias = /^npm run ([\w:-]+)$/.exec(command.trim());
    return alias ? expandScripts(scripts, alias[1], [...parents,name]) : [command.trim()];
  });
}

function requireShardResult(result) {
  if (result !== 'success') throw Error('Every Worker shard must succeed; got '+String(result));
  return true;
}

function assertCoverage(commands, baseline) {
  const counts = new Map();
  for (const command of commands) counts.set(command,(counts.get(command)||0)+1);
  for (const command of baseline.commands) {
    if (!counts.get(command)) throw Error('Original command occurrence missing: '+command);
    counts.set(command,counts.get(command)-1);
  }
  if (baseline.shards !== SHARDS) throw Error('Unexpected baseline shard count');
  return true;
}

function buildPlan(pkg, weights = {}) {
  const commands = expandScripts(pkg.scripts);
  const fixed = new Map([
    ['node tests/full_release_roles_identity_test.cjs',0],
    ['node tests/privacy_account_coverage_test.cjs',1],
    ['node tests/frontend_check.cjs',2],
    ['node tests/bundle_runtime_test.cjs',3],
  ]);
  const tasks = commands.map((command,index) => {
    const observed = weights[command] ?? weights[path.basename(command.split(/\s+/).at(-1))];
    const weight = typeof observed === 'number' ? observed : observed?.seconds;
    return {id:'suite-'+String(index+1).padStart(3,'0'),command,weight:Number.isFinite(weight)&&weight>0?weight:15,
      exclusive:/\b(bundle_runtime_test|roster_effects_test|privacy_admission_job_census_experiment_test)\.cjs$/.test(command)};
  });
  const plan = Array.from({length:SHARDS},()=>[]), loads = Array(SHARDS).fill(0);
  const put = (task,shard) => {plan[shard].push(task);loads[shard]+=task.weight;};
  for (const task of tasks.filter(t=>fixed.has(t.command))) put(task,fixed.get(task.command));
  for (const task of tasks.filter(t=>!fixed.has(t.command)).sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id))) {
    put(task,loads.indexOf(Math.min(...loads)));
  }
  for (const shard of plan) shard.sort((a,b)=>b.weight-a.weight||a.id.localeCompare(b.id));
  if (plan.flat().length!==commands.length || new Set(plan.flat().map(t=>t.id)).size!==commands.length || plan.some(s=>!s.length)) throw Error('Incomplete shard plan');
  return plan;
}

async function runPool(tasks, {concurrency,runTask,signal} = {}) {
  if (!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>64||typeof runTask!=='function') throw Error('Invalid pool configuration');
  if (new Set(tasks.map(t=>t.id)).size!==tasks.length) throw Error('Duplicate task identity');
  const results=[], active=new Set(); let index=0, exclusive=false;
  const launch = task => {
    if (task.exclusive) exclusive=true;
    const promise = Promise.resolve().then(()=>runTask(task)).then(
      value=>results.push({...value,id:task.id,status:value?.status==='success'?'success':value?.status||'failure'}),
      error=>results.push({id:task.id,status:'failure',error:String(error?.message||error)})
    ).finally(()=>{active.delete(promise);if(task.exclusive)exclusive=false;});
    active.add(promise);
  };
  while(index<tasks.length || active.size) {
    if(signal?.aborted) {
      while(index<tasks.length) results.push({id:tasks[index++].id,status:'cancelled'});
    }
    while(index<tasks.length && active.size<concurrency && !exclusive && !signal?.aborted) {
      const task=tasks[index];
      if(task.exclusive && active.size) break;
      index++;launch(task);
      if(task.exclusive) break;
    }
    if(active.size) await Promise.race(active);
  }
  const complete=results.length===tasks.length && new Set(results.map(r=>r.id)).size===tasks.length;
  return {results,success:complete && results.every(r=>r.status==='success')};
}

function invocation(command) {
  // These are the existing literal package scripts, not a shell language. New syntax must receive explicit review.
  if (/["'`$;|<>\r\n]/.test(command)) throw Error('Unsupported shell syntax in Worker command: '+command);
  const [bin,...args]=command.split(/\s+/);
  if(bin==='node') return {file:process.execPath,args};
  if(bin==='tsc') return {file:process.execPath,args:[path.join(ROOT,'node_modules/typescript/bin/tsc'),...args]};
  throw Error('Unsupported Worker executable: '+bin);
}

async function main(argv) {
  if(argv[0]==='--help') {console.log('ci-shards.cjs --plan | --shard 1..8 (GitHub Actions only)');return;}
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'ci-worker-baseline.json'),'utf8'));
  const weights=JSON.parse(fs.readFileSync(path.join(__dirname,'ci-worker-timings.json'),'utf8')).commands;
  const commands=expandScripts(pkg.scripts);assertCoverage(commands,baseline);
  commands.forEach(invocation);
  const plan=buildPlan(pkg,weights);
  const concurrency=Math.max(1,Math.min(4,os.availableParallelism()));
  if(argv.length===1&&argv[0]==='--plan') {console.log(JSON.stringify({occurrences:commands.length,unique:new Set(commands).size,concurrency,shards:plan.map((tasks,i)=>({shard:i+1,estimatedSerialSeconds:tasks.reduce((n,t)=>n+t.weight,0),tasks}))},null,2));return;}
  if(argv.length!==2 || argv[0]!=='--shard' || !/^[1-8]$/.test(argv[1])) throw Error('Expected --shard 1..8');
  if(process.env.GITHUB_ACTIONS!=='true') throw Error('Hosted shard execution only; the owner-stopped local aggregate must not be restarted');
  const shard=Number(argv[1]), tasks=plan[shard-1], logs=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-ci-shard-'+shard+'-'));
  const children=new Set(), controller=new AbortController(); let signalName=null;
  const cancel = sig => {
    if(signalName) return; signalName=sig;controller.abort();
    for(const child of children) {try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGTERM');}catch{}}
  };
  const interrupt=()=>cancel('SIGINT'),terminate=()=>cancel('SIGTERM');
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  let output=Promise.resolve();
  const started=performance.now();
  const runTask = task => new Promise(resolve=>{
    const {file,args}=invocation(task.command), logfile=path.join(logs,task.id+'.log'), fd=fs.openSync(logfile,'wx');
    const began=performance.now();console.log('CI_SUITE_START '+JSON.stringify({shard,id:task.id,command:task.command}));
    let child;
    const partitioned=/\b(roster_effects_test|privacy_admission_job_census_experiment_test)\.cjs$/.test(task.command);
    try{child=cp.spawn(file,args,{cwd:ROOT,shell:false,detached:process.platform!=='win32',windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,...(partitioned?{OLYMPUS_CI_CASE_POOL:'1'}:{})}});}
    catch(error){fs.closeSync(fd);resolve({status:'failure',error:String(error.message),command:task.command});return;}
    fs.closeSync(fd);children.add(child);let spawnError=null;
    child.once('error',error=>{spawnError=error;});
    child.once('close',(exitCode,signal)=>{
      children.delete(child);
      const result={status:exitCode===0&&!signal&&!spawnError?'success':signal?'cancelled':'failure',command:task.command,exitCode,signal,elapsedMs:Math.round(performance.now()-began),logfile,...(spawnError?{error:spawnError.message}:{})};
      console.log('CI_SUITE_END '+JSON.stringify({shard,id:task.id,...result}));
      // Raw output is retained per process; groups serialize only log presentation, never suite execution.
      output=output.then(()=>new Promise((done,reject)=>{console.log('::group::'+task.id+' '+task.command);const stream=fs.createReadStream(logfile);stream.on('error',reject);stream.on('end',()=>{console.log('\n::endgroup::');done();});stream.pipe(process.stdout,{end:false});}));
      resolve(result);
    });
  });
  let result;
  try{result=await runPool(tasks,{concurrency,runTask,signal:controller.signal});await output;}
  finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);}
  const receipt={shard,concurrency,sourceCommit:process.env.GITHUB_SHA||null,elapsedMs:Math.round(performance.now()-started),assigned:tasks.map(t=>t.id),...result,signal:signalName};
  fs.writeFileSync(path.join(logs,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### Worker shard '+shard+'\n\n'+result.results.map(r=>'- '+r.id+': '+r.status+' — '+r.command+' ('+Math.round((r.elapsedMs||0)/1000)+'s)').join('\n')+'\n');
  console.log('CI_SHARD_RESULT '+JSON.stringify(receipt));
  if(!result.success||signalName) process.exitCode=1;
}

module.exports={expandScripts,assertCoverage,buildPlan,runPool,requireShardResult,invocation};
if(require.main===module) main(process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
