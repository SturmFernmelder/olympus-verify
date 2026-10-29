'use strict';
// RT06's new held-restoration warning, independent of ban deferral and Get my
// code. Only five pre/settlement verify observations differ from H4/H6.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const expected=require('./fixtures/rt06-verify210-successor.json');
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function sourceChecks(src){return{restore:sha(fs.readFileSync(path.join(src,'restore.ts')))===expected.restoreSHA256,fixture:sha(fs.readFileSync(path.join(__dirname,'fixtures/rt06-verify210-successor.json')))==='bb12938e1b55b0047ab6d841c78895131173ac1db88522325e93f674de658b8e'};}
function inspect(r,{variant,pin,digestOf}){
 const e=expected.cases[variant],cache=r.trace.filter(v=>v.sql==='UPDATE seen_interactions SET response = ?2 WHERE id = ?1');
 const physical=!!e&&sha(r.trace)===e.rawTraceSHA256;
 const reconstructed={...r,trace:r.trace.slice(),response:e?.oldResponse};
 // One closed whole event is checked before replacing its sole response bind.
 // Nothing is searched/replaced inside text and no other event is reordered.
 const exactCache=!!e&&cache.length===1&&same(r.trace[48],e.currentCacheEvent);
 if(exactCache)reconstructed.trace[48]={...r.trace[48],params:[r.trace[48].params[0],e.oldCacheEvent.params[1]]};
 const checks={whole_response:!!e&&same(r.response,e.currentResponse),cache_delta:exactCache,
  physical_trace:physical,counts:r.trace.length===51&&r.trace.filter(v=>v.k==='sql').length===41&&r.trace.every(v=>v.k!=='http'),
  batch_shapes:!!e&&same(r.trace.filter(v=>v.k==='batch').map(v=>v.n),e.legacyBatchSizes),
  custody_rows:sha(r.twelve)===pin.twelve&&r.errors.length===0&&r.laneCalls.length===0&&r.freshFailed.length===0&&r.patchReceipts.length===0,
  historical_trace:physical&&exactCache&&same(digestOf(reconstructed),pin),
  current_trace:physical&&same(digestOf(r),e.currentDigest)};
 return{checks,failures:Object.keys(checks).filter(k=>!checks[k]),all:Object.values(checks).every(Boolean)};
}
function negativeMutations(r,context){
 const list=[],add=(name,key,mutate)=>list.push({name,key,mutate}),editBody=(x,change)=>{const b=JSON.parse(x.response.body);change(b);x.response.body=JSON.stringify(b);};
 add('missing held warning','whole_response',x=>{x.response=expected.cases[context.variant].oldResponse;});
 add('changed held warning','whole_response',x=>editBody(x,b=>{b.data.content+=' changed';}));
 add('extra held warning','whole_response',x=>editBody(x,b=>{b.data.content+='\nAutomatic restoration of your **Guild Member** role is currently on hold. Ask an officer to check your access.';}));
 add('wrong response status','whole_response',x=>{x.response.status=201;});
 add('missing cache update','cache_delta',x=>x.trace.splice(48,1));
 add('duplicated cache update','cache_delta',x=>x.trace.push({...x.trace[48]}));
 add('historical cache body','cache_delta',x=>{x.trace[48].params[1]=expected.cases[context.variant].oldCacheEvent.params[1];});
 add('foreign interaction cache','cache_delta',x=>{x.trace[48].params[0]='810000000000000999';});
 add('unexpected other cache bind','cache_delta',x=>{x.trace[48].params.push('extra');});
 add('changed other SQL bind','physical_trace',x=>{x.trace.find(v=>v.params?.length&&v.sql!=='UPDATE seen_interactions SET response = ?2 WHERE id = ?1').params[0]='foreign';});
 add('changed statement order','physical_trace',x=>{[x.trace[0],x.trace[1]]=[x.trace[1],x.trace[0]];});
 add('unexpected provider call','counts',x=>x.trace.push({k:'http',tag:'legacy',method:'GET',path:'/unexpected',body:null,reason:null}));
 add('changed custody row','custody_rows',x=>{x.twelve[0].state='pending';});
 add('changed lane custody','custody_rows',x=>x.laneCalls.push('settleLaneBan'));
 add('changed error state','custody_rows',x=>x.errors.push('synthetic'));
 return list.map(({name,key,mutate})=>{const copy=JSON.parse(JSON.stringify(r));mutate(copy);const result=inspect(copy,context);return{name,key,refused:!result.all&&result.checks[key]===false};});
}
module.exports={sourceChecks,inspect,negativeMutations};
