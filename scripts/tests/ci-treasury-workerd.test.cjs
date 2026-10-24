'use strict';
// Synthetic lifecycle only: never launches a child or Workerd and never changes a clock outside this fake IO.
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{contain,PROCESS_MS,DRAIN_MS}=require('../../worker/scripts/ci-treasury-workerd.cjs');
async function world(mode){
 let time=0,alive=true,abort,removed=false;const child=new EventEmitter();child.pid=12345;const signals=[],alarms=[];
 const io={now:()=>time,alive:()=>alive,signal:(_,s)=>{signals.push(s);if(s==='SIGKILL'){alive=false;queueMicrotask(()=>child.emit('close',null,s));}},wait:async ms=>{time+=ms;},alarm:(fn,ms)=>{const item={fn,ms};alarms.push(item);return item;},cancel:item=>{item.cancelled=true;},onAbort:fn=>{abort=fn;return()=>{removed=true;};}};
 const pending=contain(()=>{queueMicrotask(()=>{
  if(mode==='success'){alive=false;child.emit('close',0,null);}
  if(mode==='failure'){alive=false;child.emit('close',1,null);}
  if(mode==='orphan'){child.emit('close',0,null);}
  if(mode==='timeout'){const deadline=alarms.find(x=>x.ms===PROCESS_MS);time+=PROCESS_MS;deadline.fn();const kill=alarms.find(x=>x.ms===2000);time+=2000;kill.fn();}
  if(mode==='cancel'){abort();const kill=alarms.find(x=>x.ms===2000);time+=2000;kill.fn();}
 });return child;},io);
 const result=await pending;return{result,signals,alarms,time,removed};
}
(async()=>{
 const ok=await world('success');assert.equal(ok.result.passed,true);assert.deepEqual(ok.signals,[]);
 const bad=await world('failure');assert.equal(bad.result.passed,false);assert.equal(bad.result.exitCode,1);assert.deepEqual(bad.signals,[]);
 const timeout=await world('timeout');assert.equal(timeout.result.passed,false);assert.equal(timeout.result.timedOut,true);assert.deepEqual(timeout.signals,['SIGTERM','SIGKILL']);assert.equal(timeout.result.closed,true);assert.equal(timeout.result.cleanupFailed,false);
 const orphan=await world('orphan');assert.equal(orphan.result.passed,false);assert.equal(orphan.result.terminationRequested,true);assert.deepEqual(orphan.signals,['SIGTERM','SIGKILL']);assert.ok(orphan.time<=DRAIN_MS);assert.equal(orphan.result.cleanupFailed,false);
 const cancelled=await world('cancel');assert.equal(cancelled.result.passed,false);assert.equal(cancelled.result.interrupted,true);assert.equal(cancelled.result.timedOut,false);assert.deepEqual(cancelled.signals,['SIGTERM','SIGKILL']);
 assert.ok([ok,bad,timeout,orphan,cancelled].every(w=>w.removed&&w.alarms.every(a=>a.cancelled)));
 const fs=require('node:fs'),path=require('node:path'),workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/ci.yml'),'utf8');
 assert.equal((workflow.match(/run: node scripts\/ci-treasury-workerd\.cjs/g)||[]).length,1);assert.ok(/Contained Treasury expiry in actual local Workerd\r?\n        if: matrix.shard == 8\r?\n        timeout-minutes: 3/.test(workflow));assert.ok(workflow.includes('python3 tests/test_restart197.py'));
 console.log('7/7 fixed Treasury containment lifecycle/workflow cases passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
