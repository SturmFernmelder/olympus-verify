'use strict';
// Permanent owner-directed bounded qualification (10 Nov 2026). Historical
// scripts remain manual diagnostics; this graph never loads their census/pins.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),CAP_MS=180000,started=performance.now(),targets=[];
let output;
for(let i=2;i<process.argv.length;i++){
  const arg=process.argv[i];
  if(arg==='--output'&&output===undefined){output=process.argv[++i];if(!output)throw Error('--output requires a directory');}
  else if(arg==='--target')targets.push(process.argv[++i]);
  else if(arg==='--help'){
    console.log('npm run qualify -- [--output <new absolute directory>] [--target lease] [--target treasury] [--target reconciliation]\nRuns tsc --noEmit and one genuine local Workerd/D1 baseline, once. Additional targets are explicit and run in the same runtime. Whole-run cap:180 seconds; no retries.');
    process.exit(0);
  }else throw Error('unknown qualification argument: '+arg);
}
if(targets.some(x=>!['lease','treasury','reconciliation'].includes(x))||new Set(targets).size!==targets.length)throw Error('unknown or duplicate runtime target');
if(output!==undefined&&(!path.isAbsolute(output)||fs.existsSync(output)))throw Error('output must be a new absolute directory');
output=output??fs.mkdtempSync(path.join(os.tmpdir(),'olympus-qualification-'));
if(!fs.existsSync(output))fs.mkdirSync(output,{recursive:true});
const stages=[],record=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
record('intent.json',{startedAt:new Date().toISOString(),capSeconds:CAP_MS/1000,targets:['baseline',...targets],retries:0,providerCalls:0});
console.log('QUALIFICATION_OUTPUT '+output);
function stage(name,args){return new Promise((resolve,reject)=>{
  // Reserve five seconds for owned-child closure and final result publication.
  const timeout=CAP_MS-(performance.now()-started)-5000;
  if(timeout<=0)return reject(Error('qualification deadline reached before '+name));
  const began=performance.now(),stdout=fs.createWriteStream(path.join(output,name+'.stdout.log'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(output,name+'.stderr.log'),{flags:'wx'});
  const child=cp.spawn(process.execPath,args,{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
  let timedOut=false,spawnError=null;
  child.stdout.on('data',b=>{stdout.write(b);process.stdout.write(b);});child.stderr.on('data',b=>{stderr.write(b);process.stderr.write(b);});
  child.once('error',error=>{spawnError=String(error);});
  const timer=setTimeout(()=>{
    timedOut=true;
    if(child.exitCode!==null||child.signalCode!==null)return;
    if(process.platform==='win32')cp.spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:4000});
    else{try{process.kill(-child.pid,'SIGKILL');}catch{}}
  },timeout);
  child.once('close',(code,signal)=>{
    clearTimeout(timer);stdout.end();stderr.end();
    const result={name,pid:child.pid,elapsedSeconds:(performance.now()-began)/1000,exitCode:code,signal,timedOut,spawnError};stages.push(result);record(name+'-result.json',result);
    if(code===0&&!signal&&!timedOut&&!spawnError)resolve();else reject(Error(name+' failed; original logs retained'));
  });
});}
(async()=>{let complete=false,error=null;
  try{
    await stage('typecheck',[require.resolve('typescript/bin/tsc'),'--noEmit']);
    await stage('workerd',[path.join(__dirname,'qualification-workerd.cjs'),output,...targets]);
    complete=true;
  }catch(failure){error=String(failure);console.error(error);process.exitCode=1;}
  finally{record('result.json',{complete,elapsedSeconds:(performance.now()-started)/1000,capSeconds:CAP_MS/1000,stages,targets:['baseline',...targets],error,runtimeStagePassed:stages.some(s=>s.name==='workerd'&&s.exitCode===0&&!s.timedOut&&!s.spawnError),retries:0,providerCalls:0,scope:'Bounded source typecheck and genuine local behavior; live acceptance remains separate.'});}
})();
