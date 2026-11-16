'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.events=new Map();this.value='';this.disabled=false;this.ownText='';}
 set textContent(v){this.ownText=String(v);this.children=[];}get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
 set innerHTML(v){throw Error('Private evidence must remain text');}
 append(...nodes){for(const n of nodes){if(this.tag==='select'&&!this.children.length&&n.tag==='option')this.value=n.value;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.ownText='';if(this.tag==='select')this.value='';this.append(...nodes);}
 setAttribute(k,v){this[k]=String(v);}addEventListener(k,f){this.events.set(k,f);}
 async fire(k){if(!this.disabled)return this.events.get(k)?.({target:this});}click(){return this.fire('click');}
}
const document={createElement:t=>new Node(t)},context={window:{},document,Date,JSON,Map,Number};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/static/late-proof285.js'),'utf8'),context);
const find=(n,p)=>p(n)?n:n.children.map(c=>find(c,p)).find(Boolean),button=(r,t)=>find(r,n=>n.tag==='button'&&n.textContent===t);
const envelope={version:285,kind:'late-verification-claim',inventory:{currentStateSHA256:'a'.repeat(64),quarantineSHA256:'b'.repeat(64)},observations:[{input:'quarantine',source:'whisper',character:'Private Original',guid:'Player-4613-12345678',code:'PRIVATE_CODE',nativeMembership:{}}]};
const inventory=JSON.stringify({version:285,kind:'late-verification-inventory',groups:[envelope]});
const zero={roleChangesSent:0,noticesSent:0,linksChanged:0,inventoryScope:'submitted-group-only'},countData={...zero,counts:{eligible:1,held:0,unavailable:0},reason:null};
const candidate={subject:'900000000000000001',character:'Synthetic Member',guid:'Player-4613-12345678',requestId:42,observedAt:Math.floor(Date.now()/1000)-3600,snapshotId:7,snapshotAt:Math.floor(Date.now()/1000)};
async function load(root){const input=find(root,n=>n.tag==='input');input.files=[{size:inventory.length,text:async()=>inventory}];await input.fire('change');return input;}
let passed=0;const check=(name,yes)=>{assert.ok(yes,name);passed++;console.log('PASS '+name);};
(async()=>{
 const root=new Node('main'),calls=[];let resolveApply,token=0;
 const instance=context.window.mountLateProof285(root,{api:async(method,url,body)=>{calls.push({method,url,body});
  if(body.action==='count')return countData;
  if(body.action==='preview')return{...zero,candidate,previewToken:'fresh-'+(++token),expiresAt:Math.floor(Date.now()/1000)+120};
  return new Promise(resolve=>{resolveApply=resolve;});
 }});
 const input=await load(root);
 check('loading inventory is local and never displays original codes or proof payload',calls.length===0&&!root.textContent.includes('PRIVATE_CODE')&&!root.textContent.includes('Private Original'));
 await button(root,'Count stored proof groups').click();
 check('first server request is counts only and shows no account identity',calls.length===1&&calls[0].body.action==='count'&&!root.textContent.includes(candidate.subject)&&button(root,'Confirm this new verification claim').disabled);
 await button(root,'Review selected group').click();
 check('separate fresh preview shows the original request and current source before confirmation',calls.length===2&&calls[1].body.action==='preview'&&root.textContent.includes(candidate.subject)&&root.textContent.includes('42')&&!button(root,'Confirm this new verification claim').disabled);
 const choose=find(root,n=>n.tag==='select');await choose.fire('change');
 check('changing the reviewed selection consumes local confirmation authority',button(root,'Confirm this new verification claim').disabled);
 await button(root,'Review selected group').click();
 const submitted=button(root,'Confirm this new verification claim').click();
 check('apply consumes its fresh token and locks input while pending',input.disabled&&button(root,'Confirm this new verification claim').disabled&&calls.at(-1).body.action==='apply'&&calls.at(-1).body.previewToken==='fresh-2'&&calls.at(-1).body.confirm===true);
 await button(root,'Confirm this new verification claim').click();resolveApply({result:'linked',roleChangesSent:0,noticesSent:0,automaticRetry:false,linksChanged:1});await submitted;
 check('a completed claim is not automatically repeated or reviewed again',calls.filter(c=>c.body.action==='apply').length===1&&button(root,'Review selected group').disabled&&root.textContent.includes('New claim linked'));
 instance.destroy();check('leaving clears all private account and inventory UI',root.children.length===0&&input.value==='');
 const lost=new Node('main');let posts=0;
 context.window.mountLateProof285(lost,{api:async(_m,_u,b)=>{if(b.action==='count')return countData;if(b.action==='preview')return{...zero,candidate,previewToken:'lost',expiresAt:Math.floor(Date.now()/1000)+120};posts++;throw Error('reply lost');}});
 await load(lost);await button(lost,'Count stored proof groups').click();await button(lost,'Review selected group').click();await button(lost,'Confirm this new verification claim').click();
 check('lost apply response stays unknown with no automatic repost or renewed button',posts===1&&lost.textContent.includes('Outcome unconfirmed')&&button(lost,'Review selected group').disabled&&button(lost,'Confirm this new verification claim').disabled);
 const limited=new Node('main');let attempts=0;
 context.window.mountLateProof285(limited,{api:async()=>{attempts++;throw Object.assign(Error('rate limited'),{data:{error:'slow_down'}});}});
 await load(limited);await button(limited,'Count stored proof groups').click();
 check('failed count stops immediately without an automatic retry',attempts===1&&limited.textContent.includes('No automatic retry')&&!button(limited,'Count stored proof groups').disabled);
 const malformed=new Node('main');
 context.window.mountLateProof285(malformed,{api:async()=>({...countData,candidate})});await load(malformed);await button(malformed,'Count stored proof groups').click();
 check('unexpected identity in counts does not enter the UI or enable a review',!malformed.textContent.includes(candidate.subject)&&button(malformed,'Review selected group').disabled&&malformed.textContent.includes('read was not confirmed'));
 const held=new Node('main');
 context.window.mountLateProof285(held,{api:async()=>({...zero,counts:{eligible:0,held:1,unavailable:0},reason:'no_unconsumed_original_request'})});await load(held);await button(held,'Count stored proof groups').click();
 check('held counts explain the closed reason without revealing the submitted identity',held.textContent.includes('No qualifying unconsumed original request. 1')&&!held.textContent.includes('Private Original')&&!held.textContent.includes('PRIVATE_CODE')&&button(held,'Review selected group').disabled);
 const unknownReason=new Node('main');
 context.window.mountLateProof285(unknownReason,{api:async()=>({...zero,counts:{eligible:0,held:0,unavailable:1},reason:'PRIVATE_CODE '+candidate.subject})});await load(unknownReason);await button(unknownReason,'Count stored proof groups').click();
 check('unrecognized refusal text cannot disclose raw response content through counts',!unknownReason.textContent.includes(candidate.subject)&&!unknownReason.textContent.includes('PRIVATE_CODE')&&unknownReason.textContent.includes('could not qualify'));
 const privateError=new Node('main');let errorPosts=0;
 context.window.mountLateProof285(privateError,{api:async()=>{errorPosts++;throw Error('PRIVATE_CODE '+candidate.subject);}});
 const badInput=find(privateError,n=>n.tag==='input');badInput.files=[{size:16,text:async()=> 'ABCDEFJ private original'}];await badInput.fire('change');
 check('malformed private JSON never exposes the parser excerpt or sends a request',errorPosts===0&&!privateError.textContent.includes('ABCDEFJ')&&privateError.textContent.includes('not valid JSON'));
 await load(privateError);await button(privateError,'Count stored proof groups').click();
 check('failed API error details remain private rather than echoed before review',errorPosts===1&&!privateError.textContent.includes('PRIVATE_CODE')&&!privateError.textContent.includes(candidate.subject));
 console.log(JSON.stringify({ok:true,checks:passed,scope:'DOM behavior only; no browser/native/provider acceptance'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
