'use strict';
// Finite successor for the intentional ban transport change. The160 PINS stay
// immutable and active for former reply content and every other twelve-row field.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const expected=require('./fixtures/ban210-identity-successor.json');
const sha=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const EPOCH='a'.repeat(32),ACTOR='810000000000000209',TARGET='810000000000000202',INTERACTION='810000000000000901';
const PATCH='/webhooks/810000000000000002/synthetic-token/messages/@original';
const MANIFEST='5ed124d8b626b5817154e09596593ab547c99168b5d1c5675c988d9ee1e1c55e';
const OLD_ID='2eacf5e1013c1d036dff53cb34ff8dbb',NEW_ID='65c08247e47467e7e9213cf5fbf1d9fd';
const OLD_NONCE='c5ac54da579d734954a3adfebd15a33b',NEW_NONCE='4a3ab7b226aa7ab3ee61e84039bd6a57';
const business=events=>events.filter(e=>e.k==='sql'&&!['WITH business','SELECT CASE','UPDATE privacy_write_admission'].some(x=>e.sql.startsWith(x)));
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
function sourceChecks(src,pins){
 return {source:sha(fs.readFileSync(path.join(src,'interactions.ts')))===expected.interactionsSHA256,
  fixture:sha(fs.readFileSync(path.join(__dirname,'fixtures/ban210-identity-successor.json')))==='79924df1ce3ad1b6d61c0d376d8654f2415c1bc7d758d8f89ed7bccce708cfaa',
  historicalPins:sha(pins)===expected.historicalPINSSHA256};
}
function inspect(r,context){
 const {phase,profile,variant,pin,mask,digestOf}=context,casePin=expected.cases[[phase,profile,variant].join('/')];
 const events=r.trace.filter(e=>e.tag==='legacy'),sql=events.filter(e=>e.k==='sql'),http=events.filter(e=>e.k==='http');
 const patch=http.filter(e=>e.method==='PATCH'),body=patch.length===1?parse(patch[0].body):null;
 const initial={status:200,body:JSON.stringify({type:5,data:{flags:64}})};
 const onePatch=patch.length===1&&patch[0].path===PATCH&&patch[0].reason===null&&body&&Object.keys(body).sort().join(',')==='allowed_mentions,content'&&typeof body.content==='string'&&body.content.length<=2000&&same(body.allowed_mentions,{parse:[]});
 const former=body&&{status:200,body:JSON.stringify({type:4,data:{content:body.content,flags:64,allowed_mentions:{parse:[]}}})};
 const actor=events.map((e,i)=>e.k==='sql'&&e.sql==='SELECT 1 AS admin_actor_current'?i:-1).filter(i=>i>=0);
 const triples=actor.length===2&&actor.every(i=>events[i-3]?.k==='batch'&&events[i-3].n===3&&events[i-2]?.sql?.startsWith('WITH business')&&events[i-1]?.sql?.includes("json_extract('privacy_bot_request_refused'")&&same(events[i-1].params,[ACTOR,null])&&same(events[i].params,[]));
 const targetGuards=sql.filter(e=>e.sql.includes("json_extract('privacy_bot_request_refused'")&&e.params[0]===TARGET);
 const cache=business(events),cacheIndex=cache.findIndex(e=>e.sql.startsWith('UPDATE seen_interactions SET response'));
 const cacheEvent=cache[cacheIndex];
 const manifests=sql.filter(e=>e.sql.startsWith('WITH business'));
 const native=manifests.length>0&&manifests.every(e=>sha(e.params[2])===MANIFEST&&e.params[3]===EPOCH)
  &&sql.filter(e=>e.sql.startsWith('UPDATE privacy_write_admission')).every(e=>e.params[2]===EPOCH)
  &&sql.filter(e=>e.sql.includes("json_extract('privacy_terminal_write")).every(e=>same(e.params,[EPOCH]));
 const banStart=events.findIndex(e=>e.k==='sql'&&e.sql.startsWith('INSERT INTO members'));
 const patchIndex=events.findIndex(e=>e.k==='http'&&e.method==='PATCH');
 const lastPost=Math.max(...events.map((e,i)=>e.k==='http'&&e.method==='POST'?i:-1));
 const rows=JSON.parse(JSON.stringify(r.twelve));let rowCorrelation=true;
 if(profile==='settlement'){
  const selected=rows.filter(row=>row.id===NEW_ID&&row.subject===TARGET&&row.purpose==='ban'&&row.role_id==='1552077551839617104'&&row.desired===0);
  const insert=sql.filter(e=>e.sql.startsWith('INSERT INTO role_settlements(id,subject,purpose'));
  const claim=sql.filter(e=>e.sql.startsWith("UPDATE role_settlements SET state='dispatching'"));
  const proof=sql.filter(e=>e.sql.startsWith('SELECT 1 WHERE ?1 IS NOT NULL')&&e.params.length===13);
  const terminal=sql.filter(e=>e.sql.startsWith("UPDATE role_settlements SET state='settled'"));
  rowCorrelation=selected.length===1&&selected[0].claim_nonce===NEW_NONCE&&insert.length===1&&insert[0].params[0]===NEW_ID&&claim.length===1&&claim[0].params[0]===NEW_ID&&claim[0].params[2]===NEW_NONCE&&proof.length===1&&proof[0].params[7]===NEW_ID&&proof[0].params[8]===NEW_NONCE&&terminal.length===1&&terminal[0].params[0]===NEW_ID;
  if(selected.length===1){selected[0].id=OLD_ID;selected[0].claim_nonce=OLD_NONCE;}
 }
 const receipt=r.patchReceipts?.[0];
 const physicalIntact=!!casePin&&sha(r.trace)===casePin.rawTraceSHA256;
 const checks={initial:same(r.response,initial),one_patch:!!onePatch,
  original_content:!!former&&sha(phase==='live'&&variant==='configured'?mask(JSON.stringify(former)):JSON.stringify(former))===pin.response,
  provider_shape:same(http.map(({method,path,reason})=>({method,path,reason})),expected.providerShape[profile]),
  patch_receipt:r.patchReceipts?.length===1&&receipt?.status===200&&receipt?.path===PATCH&&receipt?.contentSHA256===sha(body?.content??'')&&receipt?.mentionsDisabled===true,
  actor_triples:triples&&actor[0]<banStart&&actor[1]>lastPost&&actor[1]<patchIndex,
  target_guards:targetGuards.length===(profile==='settlement'?4:0)&&targetGuards.every(e=>same(e.params,[TARGET,null])),
  native_epoch_manifest:native,
  cache_position:cacheIndex===(profile==='plain'?4:5)&&same(cacheEvent?.params,[INTERACTION,JSON.stringify(initial)]),
  physical_trace:physicalIntact,
  sql_order:!!casePin&&sha(sql.map(e=>e.sql))===casePin.rawLegacySQLSequenceSHA256,
  batch_shapes:!!casePin&&same(events.filter(e=>e.k==='batch').map(e=>e.n),casePin.legacyBatchSizes),
  business_order:!!casePin&&sha(cache.map(e=>e.sql))===casePin.businessSQLSequenceSHA256,
  historical_rows:sha(rows)===pin.twelve,row_correlation:rowCorrelation,
  // Rejected synthetic mutations must not enter the original observed-manifest
  // ledger. Only an intact exact physical trace reaches that existing oracle.
  successor_digest:physicalIntact&&same(digestOf(r,phase==='live'&&variant==='configured'),casePin.successorDigest),
  bounded_counts:sql.length===(profile==='plain'?57:97)&&http.length===(profile==='plain'?4:9)};
 return {checks,failures:Object.keys(checks).filter(k=>!checks[k]),all:Object.values(checks).every(Boolean)};
}
function negativeMutations(r,context){
 const mutations=[],add=(name,key,mutate)=>mutations.push({name,key,mutate});
 const actor=x=>x.trace.findIndex(e=>e.sql==='SELECT 1 AS admin_actor_current');
 const patch=x=>x.trace.find(e=>e.k==='http'&&e.method==='PATCH'&&e.tag==='legacy');
 add('missing actor check','actor_triples',x=>x.trace.splice(actor(x),1));
 add('duplicate actor check','actor_triples',x=>x.trace.push({...x.trace[actor(x)]}));
 if(context.profile==='settlement'){
  add('missing target guard','target_guards',x=>x.trace.splice(x.trace.findIndex(e=>e.sql?.includes("json_extract('privacy_bot_request_refused'")&&e.params[0]===TARGET),1));
  add('foreign target guard','target_guards',x=>{x.trace.find(e=>e.sql?.includes("json_extract('privacy_bot_request_refused'")&&e.params[0]===TARGET).params[0]=ACTOR;});
 }
 add('changed epoch','native_epoch_manifest',x=>{x.trace.find(e=>e.sql?.startsWith('WITH business')).params[3]='b'.repeat(32);});
 add('changed manifest','native_epoch_manifest',x=>{x.trace.find(e=>e.sql?.startsWith('WITH business')).params[2]+=' ';});
 add('missing PATCH','one_patch',x=>x.trace.splice(x.trace.indexOf(patch(x)),1));
 add('duplicate PATCH','one_patch',x=>x.trace.push({...patch(x)}));
 add('relocated PATCH','one_patch',x=>{patch(x).path='/webhooks/foreign/synthetic-token/messages/@original';});
 add('mention widening','one_patch',x=>{const e=patch(x),b=JSON.parse(e.body);b.allowed_mentions.parse=['users'];e.body=JSON.stringify(b);});
 add('changed summary','original_content',x=>{const e=patch(x),b=JSON.parse(e.body);b.content+=' changed';e.body=JSON.stringify(b);});
 add('unconfirmed PATCH receipt','patch_receipt',x=>{x.patchReceipts[0].status=503;});
 add('late ACK cache','cache_position',x=>{const i=x.trace.findIndex(e=>e.sql?.startsWith('UPDATE seen_interactions SET response'));x.trace.push(...x.trace.splice(i,1));});
 add('reordered business effects','business_order',x=>{const a=x.trace.findIndex(e=>e.sql?.startsWith('UPDATE invite_queue')),b=x.trace.findIndex(e=>e.sql?.startsWith('UPDATE pending'));[x.trace[a],x.trace[b]]=[x.trace[b],x.trace[a]];});
 add('missing business effect','business_order',x=>x.trace.splice(x.trace.findIndex(e=>e.sql?.startsWith('UPDATE invite_queue')),1));
 add('extra business effect','business_order',x=>x.trace.push({...x.trace.find(e=>e.sql?.startsWith('UPDATE invite_queue'))}));
 add('unexpected provider call','provider_shape',x=>x.trace.push({k:'http',tag:'legacy',method:'GET',path:'/unexpected',body:null,reason:null}));
 const row=x=>x.twelve.find(v=>v.purpose==='ban')??x.twelve[0];
 for(const [field,value]of [['expires_at',1],['state','pending'],['attempts',99],['subject_generation','e'.repeat(32)]])add('changed row '+field,'historical_rows',x=>{row(x)[field]=value;});
 if(context.profile==='settlement'){
  add('wrong ban row identity','row_correlation',x=>{row(x).id='f'.repeat(32);});
  add('wrong claim correlation','row_correlation',x=>{x.trace.find(e=>e.sql?.startsWith("UPDATE role_settlements SET state='dispatching'")).params[2]='f'.repeat(32);});
 }
 return mutations.map(({name,key,mutate})=>{const copy=JSON.parse(JSON.stringify(r));mutate(copy);const result=inspect(copy,context);return{name,key,refused:!result.all&&result.checks[key]===false};});
}
module.exports={sourceChecks,inspect,negativeMutations};
