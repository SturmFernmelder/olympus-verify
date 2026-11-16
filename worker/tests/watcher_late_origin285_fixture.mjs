// Actual local Workerd Request/Headers/body primitives and original D1 wrapper.
// This isolates origin custody; it does not qualify an identity or execute SQL.
import {captureOriginalWatcherIntake285,originalWatcherIntake285,canonicalIntakeBodySHA285,INTAKE_CAPABILITY285,takeLegacyWatcherIntakeBody285} from '../src/watcher-late-origin285.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_SCOPE232,NATIVE_GUILD232} from '../src/native-rank-reconciliation232.ts';
import {postIntake242} from '../src/intake242.ts';
const TOKEN='synthetic-origin-only-'+ 'w'.repeat(40),ENC=new TextEncoder();
export default {async fetch(input,bindings){
 const spec=await input.json();
 if(spec.hash){let value=spec.value;if(spec.hash==='negative-zero')value={n:-0};
  if(spec.hash==='hole'){value={a:new Array(1)};}
  try{return Response.json({accepted:true,sha256:await canonicalIntakeBodySHA285(value)});}catch{return Response.json({accepted:false});}
 }
 const proto={},env=Object.assign(Object.create(proto),{DB:createPrivacyWriteAdmissionDatabase(bindings.DB,'writer','canonical','a'.repeat(32)),GUILD_ID:NATIVE_GUILD232,WATCHER_TOKEN:TOKEN,VERIFY_SECRET:'synthetic-native-key',VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),PUBLIC_BASE_URL:'https://verify.example',DISCORD_BOT_TOKEN:'synthetic-provider-token',LINKS_NOT_BEFORE:'0'});
 const body={entries:[{id:'origin:synthetic:1',type:'verify',source:'whisper',character:'Synthetic Ålice 😀',guid:'Player-1-AAAABBBB',observedAt:1794845000,nativeMembership:{version:1,member:true,observedAt:1794845000,scopeHash:'a'.repeat(16),mac:'b'.repeat(32)}}]};
 const mode=spec.mode||'valid',headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'},at=Math.floor(Date.now()/1000);let request,pulls=0;
 if(['capability-valid','capability-authorized-copy','capability-extra'].includes(mode))body.transportCapability=INTAKE_CAPABILITY285;
 if(mode==='capability-unknown')body.transportCapability='unknown-capability';
 if(mode==='capability-type')body.transportCapability=true;
 if(mode==='capability-extra')body.unapproved=true;
 let raw=JSON.stringify(body);
 if(mode==='fallback-fractional')raw=JSON.stringify({...body,entries:[...body.entries,{id:'fractional-only',type:'verify',observedAt:0.5}]});
 let url='https://verify.example/ingest/intake242?keyVersion=launch-membership-v1',method='POST';
 if(mode==='wrong-auth')headers.Authorization='Bearer '+ 'x'.repeat(40);
 if(mode==='wrong-content')headers['Content-Type']='text/plain';
 if(mode==='wrong-method')method='GET';
 if(mode==='wrong-origin')url=url.replace('verify.example','elsewhere.invalid');
 if(mode==='wrong-path')url=url.replace('/ingest/intake242','/api/admin/late-proof');
 if(mode==='wrong-version')url=url.replace('launch-membership-v1','forged');
 if(mode==='duplicate-query')url+='&keyVersion=launch-membership-v1';
 if(mode==='extra-query')url+='&other=1';
 if(mode==='duplicate-json')raw='{"entries":[],"entries":[]}';
 if(mode==='nested-duplicate-json')raw='{"entries":[{"id":"a","n":{"x":1,"x":2}}]}';
 if(mode==='capability-duplicate')raw='{"entries":[],"transportCapability":"'+INTAKE_CAPABILITY285+'","transportCapability":"'+INTAKE_CAPABILITY285+'"}';
 if(mode==='invalid-json')raw='{"entries":[';
 if(mode==='too-many')raw=JSON.stringify({entries:Array.from({length:26},(_,i)=>({id:'x'+i}))});
 if(mode==='oversized')raw=JSON.stringify({entries:[{id:'x',data:'a'.repeat(1048576)}]});
 const mutate=()=>{
  if(mode==='header-stream'||mode==='header-crypto')request.headers.set('Authorization','Bearer '+ 'y'.repeat(40));
  if(mode==='content-stream')request.headers.set('Content-Type','text/plain');
  if(mode==='config-stream'||mode==='config-crypto')env.WATCHER_TOKEN='changed-'+TOKEN;
  if(mode==='scope-stream')env.VERIFY_NATIVE_SCOPE=JSON.stringify({version:1,...NATIVE_SCOPE232,realm:'Different realm'});
  if(mode==='db-stream')env.DB={};
  if(mode==='inherited-stream')proto.BLOCKING_ROLE_IDS='800000000000000001';
  if(mode==='prototype-stream')Object.setPrototypeOf(env,{});
 };
 const stream=mode.endsWith('-stream')?new ReadableStream({pull(controller){pulls++;const bytes=ENC.encode(raw),half=Math.floor(bytes.length/2);if(pulls===1)controller.enqueue(bytes.slice(0,half));else{mutate();controller.enqueue(bytes.slice(half));controller.close();}}}):null;
 let legacyRaw=raw,wire=mode==='invalid-utf8'?new Uint8Array([0xc3,0x28]):stream??raw;
 if(mode==='fallback-invalid-utf8'){const prefix=ENC.encode(raw.slice(0,-1)+',"unused":"'),suffix=ENC.encode('"}');wire=new Uint8Array(prefix.length+2+suffix.length);wire.set(prefix);wire.set([0xc3,0x28],prefix.length);wire.set(suffix,prefix.length+2);legacyRaw=new TextDecoder().decode(wire);}
 request=new Request(url,{method,headers,...(method==='GET'?{}:{body:wire})});
 let invoked=false;
 if(mode==='request-own')Object.defineProperty(request,'text',{value(){invoked=true;throw Error('caller text must never run');}});
 if(mode==='headers-own')Object.defineProperty(request.headers,'get',{value(){invoked=true;throw Error('caller get must never run');}});
 if(mode==='consumed')await request.text();
 if(mode==='forged-db')env.DB=bindings.DB;
 if(mode==='config-accessor')Object.defineProperty(env,'WATCHER_TOKEN',{get(){invoked=true;return TOKEN;},configurable:true});
 if(mode==='request-prototype')Object.setPrototypeOf(request,{});
 if(mode==='post-forged-origin'){try{await postIntake242(env,{entries:body.entries},Object.freeze({kind:'original_watcher_intake285'}));return Response.json({refused:false});}catch{return Response.json({refused:true});}}
 let cap=null,second=null,concurrent=[];
 if(mode==='concurrent')concurrent=await Promise.all([captureOriginalWatcherIntake285(request,env),captureOriginalWatcherIntake285(request,env)]),cap=concurrent.find(Boolean)??null;
 else {const pending=mode==='forged-raw-arguments'?captureOriginalWatcherIntake285(request,env,'{"entries":[{"id":"forged"}]}',{entries:[{id:'forged'}]}):mode==='capability-forged-arguments'?captureOriginalWatcherIntake285(request,env,JSON.stringify({...body,transportCapability:INTAKE_CAPABILITY285}),{...body,transportCapability:INTAKE_CAPABILITY285}):captureOriginalWatcherIntake285(request,env);if(mode==='capability-caller-mutation')body.transportCapability=INTAKE_CAPABILITY285;if(mode==='capability-authorized-copy')body.transportCapability='changed-after-original-stream';if(mode.endsWith('-crypto'))mutate();if(mode==='competing-reader')await request.text().catch(()=>{});cap=await pending;}
 if(!cap){const copied=takeLegacyWatcherIntakeBody285(new Request(url,{method:'POST',headers,body:raw})),fallback=takeLegacyWatcherIntakeBody285(request),again=takeLegacyWatcherIntakeBody285(request);let cannotMint=false;try{originalWatcherIntake285(fallback);}catch{cannotMint=true;}return Response.json({captured:false,invoked,pulls,concurrent:concurrent.map(Boolean),fallbackExact:!!fallback&&JSON.stringify(fallback.body)===JSON.stringify(JSON.parse(legacyRaw)),fallbackRows:fallback?.body?.entries?.length??null,fallbackUsed:request.bodyUsed,copiedUnavailable:copied===null,oneShot:again===null,cannotMint});}
 const facts=originalWatcherIntake285(cap),before=facts.entries[0]?.character;
 if(mode==='post-env-copy'||mode==='post-entries-copy'){try{await postIntake242(mode==='post-env-copy'?{...env}:env,{entries:mode==='post-entries-copy'?[...facts.entries]:facts.entries},cap);return Response.json({refused:false});}catch{return Response.json({refused:true});}}
 if(mode.startsWith('retained-')){if(mode==='retained-header')request.headers.set('Authorization','Bearer changed');if(mode==='retained-config')env.WATCHER_TOKEN='changed';if(mode==='retained-inherited')proto.BLOCKING_ROLE_IDS='800000000000000001';try{facts.check();return Response.json({captured:true,retainedRefused:false});}catch{return Response.json({captured:true,retainedRefused:true});}}
 let copiedRejected=false,secondSpendRejected=false,mutationRejected=false,capabilityCopyRejected=false,capabilityMutationRejected=false;
 try{originalWatcherIntake285(JSON.parse(JSON.stringify(cap)));}catch{copiedRejected=true;}
 try{originalWatcherIntake285({...cap,supportsForward285:true});}catch{capabilityCopyRejected=true;}
 try{facts.supportsForward285=!facts.supportsForward285;}catch{capabilityMutationRejected=true;}
 try{facts.entries[0].character='forged';}catch{mutationRejected=true;}
 if(mode==='one-use'){facts.spend();try{facts.spend();}catch{secondSpendRejected=true;}}
 if(mode==='valid')second=await captureOriginalWatcherIntake285(request,env);
 return Response.json({captured:true,invoked,pulls,concurrent:concurrent.map(Boolean),legacyCopyUnavailable:takeLegacyWatcherIntakeBody285(request)===null,bodyUsed:request.bodyUsed,actualBody:JSON.stringify({entries:facts.entries,...(facts.supportsForward285?{transportCapability:INTAKE_CAPABILITY285}:{})})===raw,actualWireBody:JSON.parse(raw),supportsForward285:facts.supportsForward285,capabilityCopyRejected,capabilityMutationRejected,envMatched:facts.env===env,deepFrozen:Object.isFrozen(facts.entries)&&Object.isFrozen(facts.entries[0])&&Object.isFrozen(facts.entries[0].nativeMembership),copiedRejected,mutationRejected,unchanged:facts.entries[0].character===before,secondRejected:second===null,secondSpendRejected,expiresIn:facts.expiresAt-at,bodyDigest:facts.bodyDigest});
}};
