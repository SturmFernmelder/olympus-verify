'use strict';
// .217 recovery copy: validate the whole current unbind reply and its sole cache event,
// then invert only that pair for unchanged historical PINS. Raw observations are never mutated.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const SOURCE_SHA='ebdf0262e17ede0fd8ad408a2a671fd6b5fd9593646c9a88d0ddc9bb4ddf7633';
const RECOVERY="For verification, **Get my code** uses a request code while those are available. A same-day character-code request can keep by-name `/verify` closed until 00:00 UTC.";
const CACHE='UPDATE seen_interactions SET response = ?2 WHERE id = ?1',INTERACTION='810000000000000902';
const LEGACY='The Guild Member role is left as it is; remove it in Discord by hand if they should lose it.';
const FRESH='The guild roles are removed automatically if no other character of this account is still in the guild.';
function pair(masked){
 const prefix='**Charlie** unbound from <@810000000000000203>. ',tail=masked?FRESH:LEGACY;
 const envelope=content=>({status:200,body:JSON.stringify({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}})});
 const oldPromise='They can run '+String.fromCharCode(96)+'/verify'+String.fromCharCode(96)+' again.';
 return{current:envelope(prefix+RECOVERY+' '+tail),old:envelope(prefix+oldPromise+' '+tail)};
}
function sourceChecks(src){return{exact_current:sha(fs.readFileSync(path.join(src,'interactions.ts')))===SOURCE_SHA};}
function inspect(r,{pin,digestOf,masked}){
 const p=pair(masked),cache=r.trace.map((event,index)=>({event,index})).filter(x=>x.event.sql===CACHE);
 const expected={k:'sql',tag:'legacy',sql:CACHE,params:[INTERACTION,JSON.stringify(p.current)]};
 const exactCache=cache.length===1&&same(cache[0].event,expected),projected={...r,response:p.old,trace:r.trace.slice()};
 if(exactCache)projected.trace[cache[0].index]={...cache[0].event,params:[INTERACTION,JSON.stringify(p.old)]};
 const legacy=r.trace.filter(e=>e.tag==='legacy');
 const checks={
  whole_response:same(r.response,p.current),
  cache_delta:exactCache,
  counts:legacy.filter(e=>e.k==='sql').length===pin.statements&&legacy.filter(e=>e.k==='http').length===pin.requests,
  no_lane:r.trace.every(e=>e.tag!=='lane')&&r.laneCalls.length===0,
  custody_rows:sha(r.twelve)===pin.twelve&&r.errors.length===0&&r.freshFailed.length===0&&r.patchReceipts.length===0,
  historical_trace:exactCache&&same(digestOf(projected,masked),pin),
 };
 return{checks,all:Object.values(checks).every(Boolean),failures:Object.keys(checks).filter(k=>!checks[k])};
}
function negativeMutations(r,context){
 const probes=[],add=(name,key,mutate)=>probes.push({name,key,mutate});
 const cache=x=>x.trace.find(e=>e.sql===CACHE),body=(x,change)=>{const value=JSON.parse(x.response.body);change(value);x.response.body=JSON.stringify(value);};
 add('historical recovery promise','whole_response',x=>{x.response=pair(context.masked).old;});
 add('missing UTC wait','whole_response',x=>body(x,b=>{b.data.content=b.data.content.replace('00:00 UTC','later');}));
 add('extra recovery occurrence','whole_response',x=>body(x,b=>{b.data.content+=' '+RECOVERY;}));
 add('foreign target reply','whole_response',x=>body(x,b=>{b.data.content=b.data.content.replace('810000000000000203','810000000000000999');}));
 add('unexpected response field','whole_response',x=>{x.response.extra='unreviewed';});
 add('wrong response status','whole_response',x=>{x.response.status=201;});
 add('missing cache update','cache_delta',x=>{x.trace=x.trace.filter(e=>e.sql!==CACHE);});
 add('extra cache occurrence','cache_delta',x=>{x.trace.push(JSON.parse(JSON.stringify(cache(x))));});
 add('historical cache reply','cache_delta',x=>{cache(x).params[1]=JSON.stringify(pair(context.masked).old);});
 add('foreign cache interaction','cache_delta',x=>{cache(x).params[0]='810000000000000999';});
 add('extra cache bind','cache_delta',x=>{cache(x).params.push('unreviewed');});
 add('changed unrelated SQL bind','historical_trace',x=>{x.trace.find(e=>e.params?.length&&e.sql!==CACHE&&!String(e.params[0]).startsWith('{"tables"')).params[0]='unreviewed';});
 add('changed original event order','historical_trace',x=>{[x.trace[0],x.trace[1]]=[x.trace[1],x.trace[0]];});
 add('unexpected provider effect','counts',x=>{x.trace.push({k:'http',tag:'legacy',method:'POST',path:'/unexpected',body:'{}'});});
 add('unexpected lane event','no_lane',x=>{x.trace.push({k:'sql',tag:'lane',sql:'SELECT 1',params:[]});});
 add('changed custody row','custody_rows',x=>{if(x.twelve.length)x.twelve[0].state='unreviewed';else x.twelve.push({state:'unreviewed'});});
 add('unexpected deferred error','custody_rows',x=>{x.errors.push('unreviewed');});
 add('unexpected lane dispatch','no_lane',x=>{x.laneCalls.push('unreviewed');});
 return probes.map(({name,key,mutate})=>{const changed=JSON.parse(JSON.stringify(r));mutate(changed);const result=inspect(changed,context);return{name,key,refused:!result.all&&result.checks[key]===false};});
}
module.exports=Object.freeze({sourceChecks,inspect,negativeMutations});
