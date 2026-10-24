'use strict';
// One fixed hosted leaf. Its unchanged local Workerd uses controlled provider
// transport; the Linux process group contains Node and every descendant.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const PROCESS_MS=120000,DRAIN_MS=10000;
/** Pure injectable process lifecycle for synthetic tests; no command/path input. */
async function contain(launch,io){
  let child,timedOut=false,interrupted=false,terminationRequested=false,closed=false,spawnError=null,exitCode=null,signal=null,alarm,killAlarm,closeAlarm,removeAbort;
  const send=s=>{terminationRequested=true;try{io.signal(child.pid,s);}catch(error){if(error.code!=='ESRCH')throw error;}};
  try{
    child=launch();if(!Number.isSafeInteger(child.pid)||child.pid<1)throw Error('treasury_child_not_spawned');
    await new Promise((resolve,reject)=>{
      let ending=false;
      const terminate=()=>{if(ending)return;ending=true;try{send('SIGTERM');killAlarm=io.alarm(()=>{try{send('SIGKILL');}catch(error){reject(error);}},2000);closeAlarm=io.alarm(()=>reject(Error('treasury_group_close_timeout')),DRAIN_MS);}catch(error){reject(error);}};
      child.once('error',error=>{spawnError=error;reject(error);});
      child.once('close',(code,s)=>{closed=true;exitCode=code;signal=s;resolve();});
      alarm=io.alarm(()=>{timedOut=true;terminate();},PROCESS_MS);
      if(io.onAbort)removeAbort=io.onAbort(()=>{interrupted=true;terminate();});
    });
  }catch(error){spawnError=error;}
  let cleanupFailed=false;
  try{
    let remaining=!!child&&Number.isSafeInteger(child.pid)&&io.alive(child.pid);
    if(remaining){
      const began=io.now();send('SIGTERM');let killed=false;
      while(remaining&&io.now()-began<DRAIN_MS){
        if(!killed&&io.now()-began>=2000){send('SIGKILL');killed=true;}
        await io.wait(25);remaining=io.alive(child.pid);
      }
      cleanupFailed=remaining;
    }
  }finally{if(removeAbort)removeAbort();for(const timer of[alarm,killAlarm,closeAlarm])if(timer!==undefined)io.cancel(timer);}
  return{exitCode,signal,closed,timedOut,interrupted,terminationRequested,cleanupFailed,sourceProcessError:spawnError?spawnError.name:null,passed:closed&&exitCode===0&&signal===null&&!spawnError&&!timedOut&&!interrupted&&!terminationRequested&&!cleanupFailed};
}
async function main(){
  if(process.argv.length!==2||process.env.GITHUB_ACTIONS!=='true'||process.platform!=='linux')throw Error('fixed_hosted_linux_treasury_leaf_only');
  const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'olympus-treasury-workerd-')),resultDir=path.join(dir,'runtime'),stdout=path.join(dir,'stdout.log'),stderr=path.join(dir,'stderr.log');
  const out=fs.openSync(stdout,'wx'),err=fs.openSync(stderr,'wx'),began=Date.now();let liveChild;
  const groupSignal=(pid,signal)=>process.kill(-pid,signal),alive=pid=>{try{groupSignal(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
  let control;
  const onAbort=fn=>{process.once('SIGTERM',fn);process.once('SIGINT',fn);return()=>{process.removeListener('SIGTERM',fn);process.removeListener('SIGINT',fn);};};
  try{control=await contain(()=>{liveChild=cp.spawn(process.execPath,[path.join(root,'tests/treasury_expiry196_workerd_test.cjs')],{cwd:root,shell:false,detached:true,stdio:['ignore',out,err],env:{...process.env,WRANGLER_SEND_METRICS:'false',TREASURY196_WORKERD_RESULT_DIR:resultDir}});return liveChild;},{signal:groupSignal,alive,now:Date.now,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),alarm:setTimeout,cancel:clearTimeout,onAbort});}
  finally{fs.closeSync(out);fs.closeSync(err);}
  let leaf=null;try{leaf=JSON.parse(fs.readFileSync(path.join(resultDir,'result.json'),'utf8'));}catch{}
  const passed=control.passed&&leaf?.complete===true&&leaf.children?.length===1&&leaf.children.every(child=>child.closed===true);
  const receipt={schema:'hosted-fixed-treasury-workerd197-v1',sourceCommit:process.env.GITHUB_SHA||null,originalLeaf:'tests/treasury_expiry196_workerd_test.cjs',processTimeoutMs:PROCESS_MS,cleanupBoundMs:DRAIN_MS,elapsedMs:Date.now()-began,control,originalResult:path.join(resultDir,'result.json'),stdout,stderr,passed};
  fs.writeFileSync(path.join(dir,'containment.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  process.stdout.write(fs.readFileSync(stdout));process.stderr.write(fs.readFileSync(stderr));console.log('TREASURY_WORKERD_CONTAINMENT197 '+JSON.stringify(receipt));
  if(!passed)process.exitCode=1;
}
module.exports={contain,PROCESS_MS,DRAIN_MS};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
