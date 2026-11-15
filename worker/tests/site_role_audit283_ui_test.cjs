'use strict';
// DOM-level module behavior only. This is not a browser/mobile acceptance claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.events=new Map();this.disabled=false;this.value='';this.ownText='';}
 set textContent(value){this.ownText=String(value);this.children=[];}
 get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 set innerHTML(value){throw Error('Untrusted audit data must not be interpreted as HTML');}
 append(...nodes){for(const n of nodes){if(this.tag==='select'&&!this.children.length&&n.tag==='option')this.value=n.value;this.children.push(...(n.tag==='fragment'?n.children:[n]));}}
 replaceChildren(...nodes){this.children=[];this.ownText='';this.append(...nodes);}
 setAttribute(key,value){this[key]=String(value);}
 addEventListener(key,fn){this.events.set(key,fn);}
 async fire(key){if(!this.disabled)return this.events.get(key)?.({target:this});}
 click(){return this.fire('click');}
}
const document={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment')};
let downloaded;const context={window:{},document,Date,Blob,URL:{createObjectURL(blob){downloaded=blob;return 'blob:synthetic';},revokeObjectURL(){}},setTimeout(fn){fn();}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/static/role-audit283.js'),'utf8'),context);
const find=(node,test)=>test(node)?node:node.children.map(c=>find(c,test)).find(Boolean);
const button=(root,text)=>find(root,n=>n.tag==='button'&&n.textContent===text);
const select=(root,label)=>find(root,n=>n.tag==='select'&&n['aria-label']===label);
const cases=[];const check=(name,value)=>{cases.push({name,pass:!!value});console.log((value?'PASS ':'FAIL ')+name);};
const id='900000000000000001',role='1552077551839617104';
const row={id,username:' \t=2+2',displayName:'\n ＝HYPERLINK("https://invalid.example","x")',nativeCharacter:'<img src=x onerror=alert(1)>',nativeRank:'Member',cause:'eligible',expected:role,actual:[],missing:[role],extraOwned:[],extraUnowned:[],unknown:0,expiredUnattempted:0,sourceHeld:false,review:false,repairable:true,previewToken:'opaque-preview',characters:[],discordJoinedAt:'2026-11-01T10:00:00Z',historyTruncated:false};
const page={source:{id:1},generatedAt:1800000000,managedRoles:[{roleId:role,name:'Olympus Member'}],rows:[row,{...row,id:'900000000000000002',username:'zulu',displayName:'Zulu',repairable:false,sourceHeld:true,unknown:1,previewToken:null},{...row,id:'900000000000000003',username:'private',displayName:'Private held',cause:'privacy_held',repairable:false,sourceHeld:true,historyWithheld:true,unknown:null,expiredUnattempted:null,expected:null,missing:[],previewToken:null}],nextCursor:null,coverage:{atomicSnapshot:false,complete:true,providerRowsProcessed:1000,observedOnly:997,nativeLinkedCandidateSubjects:3}};
(async()=>{
 const root=new Node('main'),calls=[];
 context.window.mountRoleAudit283(root,{api:async(method,url,body)=>{calls.push({method,url,body});return method==='GET'?page:{result:{results:[{subject:id,state:'held',reason:'source_changed'}]}};}});
 check('mount does not start reads or repairs automatically',calls.length===0);
 await button(root,'Scan server').click();
 check('explicit read renders candidate text without interpreting malicious display/character markup',calls.length===1&&root.textContent.includes(row.nativeCharacter)&&!find(root,n=>n.tag==='img'));
 const privateCard=find(root,n=>n.tag==='article'&&n.textContent.includes('Private held'));
 check('privacy-held history renders withheld/count unavailable rather than zero or complete',privateCard.textContent.includes('Withheld. Completeness is unavailable.')&&!privateCard.textContent.includes('0 unresolved attempted'));
 const filter=select(root,'Filter role audit status');filter.value='unknown';await filter.fire('change');
 check('status filtering is functional',root.textContent.includes('1 matching rows')&&root.textContent.includes('Zulu'));
 filter.value='all';await filter.fire('change');
 const search=find(root,n=>n.tag==='input');search.value=id;await search.fire('input');
 check('search finds exact private candidate ID',root.textContent.includes('1 matching rows')&&root.textContent.includes(row.displayName));
 await button(root,'Export observed rows').click();const csv=await downloaded.text();
 check('malicious-display CSV cells are literal across leading LF/whitespace/fullwidth formula prefixes',csv.includes('"\'\n ＝HYPERLINK(')&&csv.includes('"\' \t=2+2"'));
 check('CSV preserves full 18-digit Discord snowflakes as literal text',csv.includes('"\''+id+'"'));
 const repair=button(root,'Reconcile this account');await repair.click();await repair.click();
 check('one deliberate repair sends exact subject/token once and never auto-retries',calls.filter(c=>c.method==='POST').length===1&&calls[1].body.subject===id&&calls[1].body.previewToken==='opaque-preview'&&root.textContent.includes('Run a fresh audit'));
 const errorRoot=new Node('main');let failedCalls=0;
 context.window.mountRoleAudit283(errorRoot,{api:async()=>{failedCalls++;throw {data:{coverage:{gap:'discord_rate_limited'}}};}});
 await button(errorRoot,'Scan server').click();
 check('provider failure stops traversal with an explicit gap and no automatic retry',failedCalls===1&&errorRoot.textContent.includes('discord_rate_limited')&&button(errorRoot,'Scan server').disabled);
 let resolve,counter=0;const pauseRoot=new Node('main');
 context.window.mountRoleAudit283(pauseRoot,{api:async()=>{counter++;return counter===1?await new Promise(done=>resolve=done):{...page,rows:[],coverage:{...page.coverage,providerRowsProcessed:0},nextCursor:null};}});
 const pending=button(pauseRoot,'Scan server').click();await Promise.resolve();await button(pauseRoot,'Pause').click();resolve({...page,nextCursor:'opaque-cursor',coverage:{...page.coverage,complete:false}});await pending;
 check('pause ends after the current read-only page',counter===1&&pauseRoot.textContent.includes('Paused.'));
 await button(pauseRoot,'Resume scan').click();check('resume continues the same explicit traversal',counter===2&&pauseRoot.textContent.includes('Discord traversal finished'));
 let finish;const deadRoot=new Node('main'),instance=context.window.mountRoleAudit283(deadRoot,{api:async()=>new Promise(done=>finish=done)}),deadRequest=button(deadRoot,'Scan server').click();await Promise.resolve();instance.destroy();finish(page);await deadRequest;
 check('destroy discards a late private page instead of repopulating a departed view',deadRoot.children.length===0);
 assert.ok(cases.every(c=>c.pass),JSON.stringify(cases));console.log(JSON.stringify({ok:true,checks:cases.length,scope:'DOM module behavior; no browser or mobile acceptance'}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
