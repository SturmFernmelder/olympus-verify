'use strict';
// Behavior regression: a pending role action must not lose its outcome or reuse
// its consumed preview when ordinary audit filters rerender. Optional --source
// measures the same case against an explicitly retained historical module.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--source'))throw Error('Usage: node site_role_audit285_ui_test.cjs [--source path]');
const source=args.length?path.resolve(args[1]):path.join(__dirname,'../public/static/role-audit283.js');
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.events=new Map();this.disabled=false;this.value='';this.ownText='';}
 set textContent(value){this.ownText=String(value);this.children=[];}
 get textContent(){return this.ownText+this.children.map(c=>c.textContent).join('');}
 set innerHTML(value){throw Error('Audit text cannot become HTML');}
 append(...nodes){for(const n of nodes){if(this.tag==='select'&&!this.children.length&&n.tag==='option')this.value=n.value;this.children.push(...(n.tag==='fragment'?n.children:[n]));}}
 replaceChildren(...nodes){this.children=[];this.ownText='';this.append(...nodes);}
 setAttribute(key,value){this[key]=String(value);}
 addEventListener(key,fn){this.events.set(key,fn);}
 async fire(key){if(!this.disabled)return this.events.get(key)?.({target:this});}
 click(){return this.fire('click');}
}
const document={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment')};
const context={window:{},document,Date,Blob,URL:{createObjectURL(){return'blob:test';},revokeObjectURL(){}},setTimeout(fn){fn();}};
vm.runInNewContext(fs.readFileSync(source,'utf8'),context);
const find=(root,test)=>test(root)?root:root.children.map(c=>find(c,test)).find(Boolean),button=(root,text)=>find(root,n=>n.tag==='button'&&n.textContent===text),select=(root,label)=>find(root,n=>n.tag==='select'&&n['aria-label']===label);
const scan=root=>find(root,n=>n.tag==='button'&&['Scan server','Compare current roster','Compare linked accounts','Scan whole server'].includes(n.textContent));
const id='900000000000000001',role='1552077551839617104';
const row={id,username:'synthetic',displayName:'Synthetic',nativeCharacter:'Synthetic Member',nativeRank:'Member',cause:'eligible',expected:role,actual:[],missing:[role],extraOwned:[],extraUnowned:[],unknown:0,expiredUnattempted:0,sourceHeld:false,review:false,repairable:true,previewToken:null,characters:[],historyTruncated:false,maxPlannedEffects:2,snapshotId:1};
const page={source:{id:1},generatedAt:Math.floor(Date.now()/1000),managedRoles:[{roleId:role,name:'Olympus Member'}],rows:[row],nextCursor:null,coverage:{scope:'one_linked_account_page',atomicSnapshot:false,complete:true,providerRowsProcessed:1,providerRequests:1,observedOnly:0,nativeLinkedCandidateSubjects:1}};
const fresh=()=>({...page,rows:[{...row,previewToken:'fresh-original-token',previewExpiresAt:Math.floor(Date.now()/1000)+300,confirmReserveSeconds:112,confirmBy:Math.floor(Date.now()/1000)+188}],coverage:{scope:'single_discord_member_read',singleMemberReadComplete:true,atomicSnapshot:false,complete:false}});
const checks=[],check=(name,pass)=>{checks.push({name,pass:!!pass});console.log((pass?'PASS ':'FAIL ')+name);};
(async()=>{
 const root=new Node('main'),calls=[];let finish;
 context.window.mountRoleAudit283(root,{api:async(method,url,body)=>{calls.push({method,url,body});if(method==='GET')return url.includes('?subject=')?fresh():page;return new Promise(resolve=>finish=resolve);}});
 await scan(root).click();await button(root,'Review reconciliation to Olympus Member').click();
 const pending=button(root,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();await Promise.resolve();
 const filter=select(root,'Filter role audit status'),sort=select(root,'Sort role audit'),search=find(root,n=>n.tag==='input');
 check('pending attended action locks filtering, sorting and searching',filter.disabled&&sort.disabled&&search.disabled);
 finish({result:{requests:0,results:[{subject:id,state:'held',reason:'source_changed'}]}});await pending;
 check('completed action restores an enabled deliberate Review without retaining Confirm',!!button(root,'Review reconciliation to Olympus Member')&&!button(root,'Review reconciliation to Olympus Member').disabled&&!button(root,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
 filter.value='all';await filter.fire('change');sort.value='issues';await sort.fire('change');
 check('completed exact outcome survives a filter and sort rerender',root.textContent.includes('held: source_changed. No role change was sent by this request.'));
 check('consumed original preview was posted exactly once',calls.filter(c=>c.method==='POST').length===1&&calls.find(c=>c.method==='POST').body.previewToken==='fresh-original-token');
 const scope=select(root,'Role comparison scope');
 check('normal audit starts from current native links and sends explicit focused scope',scope?.value==='native'&&calls[0].url==='/api/admin/role-audit?scope=native');
 if(scope){scope.value='server';await scope.fire('change');await button(root,'Scan whole server').click();check('whole-server inventory remains an explicit separate read',calls.at(-1).url==='/api/admin/role-audit?scope=server');}
 else check('whole-server inventory remains an explicit separate read',false);
 const heldRoot=new Node('main');let posts=0;
 context.window.mountRoleAudit283(heldRoot,{api:async(method)=>{if(method==='POST')posts++;return{...page,rows:[{...row,sourceHeld:true,cause:'source_or_identity_held',holdReason:'identity_proof_missing',expected:null,missing:[],repairable:false}]};}});
 await scan(heldRoot).click();
 check('specific hold explanation remains read-only with no repair control',heldRoot.textContent.includes('lacks a recognized original identity proof')&&!button(heldRoot,'Review reconciliation to Olympus Member')&&posts===0);
 const hostileRoot=new Node('main');
 context.window.mountRoleAudit283(hostileRoot,{api:async()=>({...page,rows:[{...row,sourceHeld:true,holdReason:'private-do-not-echo',expected:null,missing:[],repairable:false}]})});await scan(hostileRoot).click();
 check('unknown reason codes use generic copy rather than echoing unrecognized details',!hostileRoot.textContent.includes('private-do-not-echo'));
 const oldRole='1561097105974628372',oldId='a'.repeat(32),uncertain={...row,actual:[oldRole],extraUnowned:[oldRole],unknown:1,repairable:false};
 const uncertainPage={...page,managedRoles:[...page.managedRoles,{roleId:oldRole,name:'Olympus Initiate'}],rows:[uncertain]};
 const baselineRoot=new Node('main'),baselineCalls=[];let recorded=false,finishAdoption;
 const baselineController=context.window.mountRoleAudit283(baselineRoot,{api:async(method,url,body)=>{
  baselineCalls.push({method,url,body});
  if(method==='GET'&&url.startsWith('/api/admin/role-baseline'))return recorded?{adopted:true,roleChangesSent:0}:{previewToken:'separate-baseline-token',expiresAt:Math.floor(Date.now()/1000)+300,roleChangesSent:0,observedRoles:[oldRole,...Array.from({length:64},(_v,i)=>String(900000000000000100n+BigInt(i)))],receipt:{id:oldId,roleId:role,desired:1,createdAt:Math.floor(Date.now()/1000)-90000},expectedRole:role,snapshotId:1,snapshotAt:Math.floor(Date.now()/1000)};
  if(method==='POST'&&url==='/api/admin/role-baseline')return new Promise(resolve=>finishAdoption=()=>{recorded=true;resolve({adopted:true,roleChangesSent:0});});
  if(method==='POST')return{result:{requests:1,results:[{subject:id,state:'settled',reason:'canonical285_grant_only_manual_removal_custody'}]}};
  if(url.includes('?subject='))return{...fresh(),managedRoles:uncertainPage.managedRoles,rows:[{...uncertain,...(recorded?{baselineGrantOnly:true,baselineFindingId:123,blockingUnknown:0,repairable:true}:{}),previewToken:'new-grant-token',previewExpiresAt:Math.floor(Date.now()/1000)+300,confirmReserveSeconds:112,confirmBy:Math.floor(Date.now()/1000)+188}]};
  return uncertainPage;
 }});
 await scan(baselineRoot).click();
 check('uncertain row offers a separate review without a grant or automatic adoption',!!button(baselineRoot,'Review uncertain operation')&&!button(baselineRoot,'Review reconciliation to Olympus Member')&&baselineCalls.every(c=>c.method==='GET'));
 assert.ok(button(baselineRoot,'Review uncertain operation'),'Product is missing the separate uncertain-operation review control');
 await button(baselineRoot,'Review uncertain operation').click();
 check('decision shows the newly read roles and original request before its separate confirmation',baselineRoot.textContent.includes('Roles read for this decisionOlympus Initiate')&&baselineRoot.textContent.includes(oldId)&&!!button(baselineRoot,'Accept new starting point — no role changes')&&baselineCalls.every(c=>c.method==='GET'));
 check('supported account with65 roles can review the entire starting point without a false UI hold',baselineRoot.textContent.includes('900000000000000163')&&!!button(baselineRoot,'Accept new starting point — no role changes'));
 const adopt=button(baselineRoot,'Accept new starting point — no role changes').click();await Promise.resolve();
 check('pending decision locks filters and consumes its preview',select(baselineRoot,'Filter role audit status').disabled&&!button(baselineRoot,'Accept new starting point — no role changes'));
 finishAdoption();await adopt;
 check('adoption sends only its original decision token and does not start reconciliation',baselineCalls.filter(c=>c.method==='POST').length===1&&baselineCalls.find(c=>c.method==='POST').url==='/api/admin/role-baseline'&&baselineCalls.find(c=>c.method==='POST').body.previewToken==='separate-baseline-token'&&baselineRoot.textContent.includes('No role changed; existing roles and later removals need staff.'));
 await button(baselineRoot,'Read current account').click();
 check('changed starting point requires a new deliberate grant Review',!!button(baselineRoot,'Review reconciliation to Olympus Member')&&!button(baselineRoot,'Confirm fresh Olympus Member grant only')&&baselineCalls.filter(c=>c.method==='POST').length===1);
 await button(baselineRoot,'Review reconciliation to Olympus Member').click();
 check('fresh grant-only preview retains uncertain history and manual-removal disclosure',!!button(baselineRoot,'Confirm fresh Olympus Member grant only')&&baselineRoot.textContent.includes('historically uncertain attempted effects')&&baselineRoot.textContent.includes('later demotions and guild-departure removals need staff'));
 await button(baselineRoot,'Confirm fresh Olympus Member grant only').click();
 check('new grant uses a different token and ordinary guarded route, never the old receipt',baselineCalls.filter(c=>c.method==='POST').length===2&&baselineCalls.at(-1).url==='/api/admin/role-audit'&&baselineCalls.at(-1).body.previewToken==='new-grant-token'&&!JSON.stringify(baselineCalls.at(-1).body).includes(oldId));
 baselineController.destroy();
 check('leaving the page clears decision and account data',baselineRoot.children.length===0);
 const lostRoot=new Node('main');let lostPosts=0;
 context.window.mountRoleAudit283(lostRoot,{api:async(method,url)=>{
  if(method==='POST'){lostPosts++;throw Error('synthetic decision reply lost');}
  if(url.startsWith('/api/admin/role-baseline'))return{previewToken:'lost-decision-token',expiresAt:Math.floor(Date.now()/1000)+300,roleChangesSent:0,observedRoles:[oldRole],receipt:{id:oldId,roleId:role,desired:1,createdAt:Math.floor(Date.now()/1000)-90000},expectedRole:role,snapshotId:1,snapshotAt:Math.floor(Date.now()/1000)};
  return uncertainPage;
 }});
 await scan(lostRoot).click();await button(lostRoot,'Review uncertain operation').click();await button(lostRoot,'Accept new starting point — no role changes').click();
 check('lost decision response is held for a read with no automatic repost or grant',lostPosts===1&&lostRoot.textContent.includes('Read this account again to check whether it was recorded')&&!button(lostRoot,'Accept new starting point — no role changes')&&!!button(lostRoot,'Read current account'));
 assert.ok(checks.every(c=>c.pass),JSON.stringify(checks));console.log(JSON.stringify({ok:true,checks:checks.length,source,scope:'DOM behavior only; no native/browser acceptance'}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
