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
const row={id,username:' \t=2+2',displayName:'\n ＝HYPERLINK("https://invalid.example","x")',nativeCharacter:'<img src=x onerror=alert(1)>',nativeRank:'Member',cause:'eligible',expected:role,actual:[],missing:[role],extraOwned:[],extraUnowned:[],unknown:0,expiredUnattempted:0,sourceHeld:false,review:false,repairable:true,previewToken:'old-scan-preview-must-never-post',characters:[],discordJoinedAt:'2026-11-01T10:00:00Z',historyTruncated:false,maxPlannedEffects:2,snapshotId:1};
const page={source:{id:1},generatedAt:1800000000,managedRoles:[{roleId:role,name:'Olympus Member'}],rows:[row,{...row,id:'900000000000000002',username:'zulu',displayName:'Zulu',repairable:false,sourceHeld:true,unknown:1,previewToken:null},{...row,id:'900000000000000003',username:'private',displayName:'Private held',cause:'privacy_held',repairable:false,sourceHeld:true,historyWithheld:true,unknown:null,expiredUnattempted:null,expected:null,missing:[],previewToken:null}],nextCursor:null,coverage:{atomicSnapshot:false,complete:true,providerRowsProcessed:1000,observedOnly:997,nativeLinkedCandidateSubjects:3}};
const freshPage=(changes={})=>({...page,rows:[{...row,previewToken:'fresh-per-row-preview',previewIssuedAt:Math.floor(Date.now()/1000),previewExpiresAt:Math.floor(Date.now()/1000)+300,confirmReserveSeconds:112,confirmBy:Math.floor(Date.now()/1000)+188,...changes}],coverage:{atomicSnapshot:false,complete:false,scope:'single_discord_member_read',singleMemberReadComplete:true,providerRowsProcessed:1}});
(async()=>{
 const root=new Node('main'),calls=[];
 context.window.mountRoleAudit283(root,{api:async(method,url,body)=>{calls.push({method,url,body});return method==='GET'?(url.includes('?subject=')?freshPage():page):{result:{requests:0,results:[{subject:id,state:'held',reason:'source_changed'}]}};}});
 check('mount does not start reads or repairs automatically',calls.length===0);
 await button(root,'Compare current roster').click();
 check('explicit read renders candidate text without interpreting malicious display/character markup',calls.length===1&&root.textContent.includes(row.nativeCharacter)&&!find(root,n=>n.tag==='img'));
 check('cached old privacy-held identities are discarded and represented only by unavailable aggregate coverage',!root.textContent.includes('Private held')&&!root.textContent.includes('900000000000000003')&&root.textContent.includes('1 privacy-held, erased, screening-pending or bot candidates withheld'));
 const filter=select(root,'Filter role audit status');filter.value='unknown';await filter.fire('change');
 check('status filtering is functional',root.textContent.includes('1 matching rows')&&root.textContent.includes('Zulu'));
 filter.value='all';await filter.fire('change');
 const search=find(root,n=>n.tag==='input');search.value=id;await search.fire('input');
 check('search finds exact private candidate ID',root.textContent.includes('1 matching rows')&&root.textContent.includes(row.displayName));
 await button(root,'Export observed rows').click();const csv=await downloaded.text();
 check('malicious-display CSV cells are literal across leading LF/whitespace/fullwidth formula prefixes',csv.includes('"\'\n ＝HYPERLINK(')&&csv.includes('"\' \t=2+2"'));
 check('CSV preserves full 18-digit Discord snowflakes as literal text',csv.includes('"\''+id+'"'));
 check('withheld privacy identity is absent from private CSV',!csv.includes('Private held')&&!csv.includes('900000000000000003'));
 check('CSV omits account hold classifications under the approved export policy',!csv.includes('Hold reason')&&!csv.includes('rename_hold')&&!csv.includes('"ban"')&&csv.split('\r\n')[0].split(',').length===15);
 const repair=button(root,'Review reconciliation to Olympus Member');await repair.click();
 check('Review performs a new exact-account read and names desired consequences before any POST',calls.filter(c=>c.method==='POST').length===0&&calls.length===2&&calls[1].url==='/api/admin/role-audit?subject='+id&&!!button(root,'Confirm Olympus Member reconciliation (up to 2 planned changes)')&&root.textContent.includes('acknowledged unwanted-role removal and/or the desired grant')&&root.textContent.includes('additional owned compensation')&&root.textContent.includes('112-second allowance'));
 const confirm=button(root,'Confirm Olympus Member reconciliation (up to 2 planned changes)');await confirm.click();await confirm.click();
 check('separate Confirm sends only new token once and zero-request writer hold truthfully reports no sent role change',calls.filter(c=>c.method==='POST').length===1&&calls[2].body.subject===id&&calls[2].body.previewToken==='fresh-per-row-preview'&&!JSON.stringify(calls.filter(c=>c.method==='POST')).includes(row.previewToken)&&root.textContent.includes('No role change was sent by this request')&&!root.textContent.includes('may have changed'));
 const lostRoot=new Node('main');let lostPosts=0;
 context.window.mountRoleAudit283(lostRoot,{api:async(method,url)=>{if(method==='GET')return url.includes('?subject=')?freshPage():{...page,rows:[{...row}]};lostPosts++;throw {data:{error:'repair_outcome_unconfirmed'}};}});
 await button(lostRoot,'Compare current roster').click();await button(lostRoot,'Review reconciliation to Olympus Member').click();await button(lostRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();
 check('lost or revoked reply is honestly outcome-unconfirmed and never says no roles changed',lostPosts===1&&lostRoot.textContent.includes('Outcome unconfirmed: managed roles may have changed')&&!lostRoot.textContent.includes('Repair held:'));
 const refusedRoot=new Node('main');let refusedPosts=0;
 context.window.mountRoleAudit283(refusedRoot,{api:async(method,url)=>{if(method==='GET')return url.includes('?subject=')?freshPage():page;refusedPosts++;throw {data:{error:'preview_source_changed',outcome:'not_started',roleChangeSent:false}};}});
 await button(refusedRoot,'Compare current roster').click();await button(refusedRoot,'Review reconciliation to Olympus Member').click();await button(refusedRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();
 check('confirmed pre-writer refusal reports no change sent and allows a new explicit read',refusedPosts===1&&refusedRoot.textContent.includes('Request refused before the writer')&&refusedRoot.textContent.includes('No role change was sent by this request')&&!refusedRoot.textContent.includes('Outcome unconfirmed'));
 const reserveRoot=new Node('main');let reservePosts=0;
 context.window.mountRoleAudit283(reserveRoot,{api:async(method,url)=>{if(method==='POST')reservePosts++;return url.includes('?subject=')?freshPage({confirmBy:Math.floor(Date.now()/1000)-1,previewExpiresAt:Math.floor(Date.now()/1000)+100}):page;}});
 await button(reserveRoot,'Compare current roster').click();await button(reserveRoot,'Review reconciliation to Olympus Member').click();
 check('valid token with insufficient two-job reserve offers new Review and no late Confirm/POST',reservePosts===0&&reserveRoot.textContent.includes('insufficient confirmation reserve')&&!!button(reserveRoot,'Review reconciliation to Olympus Member')&&!button(reserveRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
 const realDate=context.Date;let uiAt=Date.now();context.Date=class extends Date{static now(){return uiAt;}};
 const lateRoot=new Node('main');let latePosts=0;
 context.window.mountRoleAudit283(lateRoot,{api:async(method,url)=>{if(method==='POST')latePosts++;return url.includes('?subject=')?freshPage():page;}});
 await button(lateRoot,'Compare current roster').click();await button(lateRoot,'Review reconciliation to Olympus Member').click();uiAt+=200000;await button(lateRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();context.Date=realDate;
 check('DOM-clock late Confirm is converted to a fresh-read offer without posting or extending original token',latePosts===0&&lateRoot.textContent.includes('no longer has the full confirmation reserve')&&!!button(lateRoot,'Review reconciliation to Olympus Member'));
 const candidateRoot=new Node('main'),officer='1554262223038324840',candidateRow={...row,actual:[officer],extraOwned:[officer]},candidateRoles=[...page.managedRoles,{roleId:officer,name:'Olympus Officer'}];
 context.window.mountRoleAudit283(candidateRoot,{api:async(method,url)=>url.includes('?subject=')?{...freshPage(candidateRow),managedRoles:candidateRoles,rows:[{...freshPage(candidateRow).rows[0],previewToken:'fresh-candidate-preview'}]}:{...page,managedRoles:candidateRoles,rows:[candidateRow]}});
 await button(candidateRoot,'Compare current roster').click();await button(candidateRoot,'Review reconciliation to Olympus Member').click();
 check('Confirm names acknowledged-grant removal candidate and distinguishes writer custody approval',!!button(candidateRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)')&&candidateRoot.textContent.includes('Observed acknowledged-grant removal candidates: Olympus Officer')&&candidateRoot.textContent.includes("original writer's custody approval; its actual plan may differ"));
 const changedRoot=new Node('main'),changedCalls=[];
 context.window.mountRoleAudit283(changedRoot,{api:async(method,url)=>{changedCalls.push({method,url});return url.includes('?subject=')?freshPage({snapshotId:2}):page;}});
 await button(changedRoot,'Compare current roster').click();await button(changedRoot,'Review reconciliation to Olympus Member').click();
 check('fresh changed native source replaces displayed facts and exposes no Confirm or write',changedCalls.length===2&&changedCalls.every(c=>c.method==='GET')&&changedRoot.textContent.includes('account or native source changed')&&!button(changedRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
 const removedRoot=new Node('main');let removedPosts=0;
 context.window.mountRoleAudit283(removedRoot,{api:async(method,url)=>{if(method==='POST')removedPosts++;return url.includes('?subject=')?{rows:[],counts:{subjects:0,unavailable:1},nextCursor:null,coverage:{scope:'single_discord_member_read',singleMemberReadComplete:true,complete:false,atomicSnapshot:false}}:page;}});
 await button(removedRoot,'Compare current roster').click();await button(removedRoot,'Review reconciliation to Olympus Member').click();
 check('single unavailable read removes cached identity without classifying the chosen account as private',removedPosts===0&&!removedRoot.textContent.includes(id)&&removedRoot.textContent.includes('1 chosen-account reads unavailable (no classification disclosed)')&&removedRoot.textContent.includes('1 privacy-held, erased, screening-pending or bot candidates withheld in traversal')&&!button(removedRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
 const planRoot=new Node('main'),planCalls=[];
 context.window.mountRoleAudit283(planRoot,{api:async(method,url)=>{planCalls.push({method,url});return {...page,activationRequired:true,rows:[{...row,activationRequired:true,activeExpected:null,activeCause:'rank_source_held',repairable:false,previewToken:null}]};}});
 const planPolicy=select(planRoot,'Role audit policy view');planPolicy.value='steward-v3';await planPolicy.fire('change');await button(planRoot,'Compare current roster').click();
 check('explicit inactive-v3 view requests planning URL, labels active-policy difference, and exposes no repair control',planCalls.length===1&&planCalls[0].method==='GET'&&planCalls[0].url.includes('policyPreview=steward-v3')&&planRoot.textContent.includes('Active-policy expected rank')&&planRoot.textContent.includes('activation requires a separately reviewed rollout')&&!button(planRoot,'Review reconciliation to Olympus Member'));
 const errorRoot=new Node('main');let failedCalls=0;
 context.window.mountRoleAudit283(errorRoot,{api:async()=>{failedCalls++;throw {data:{coverage:{gap:'discord_rate_limited'}}};}});
 await button(errorRoot,'Compare current roster').click();
 check('provider failure stops traversal with an explicit gap and no automatic retry',failedCalls===1&&errorRoot.textContent.includes('discord_rate_limited')&&button(errorRoot,'Compare current roster').disabled);
 let resolve,counter=0;const pauseRoot=new Node('main');
 context.window.mountRoleAudit283(pauseRoot,{api:async()=>{counter++;return counter===1?await new Promise(done=>resolve=done):{...page,rows:[],coverage:{...page.coverage,providerRowsProcessed:0},nextCursor:null};}});
 const pending=button(pauseRoot,'Compare current roster').click();await Promise.resolve();await button(pauseRoot,'Pause').click();resolve({...page,nextCursor:'opaque-cursor',coverage:{...page.coverage,complete:false}});await pending;
 check('pause ends after the current read-only page',counter===1&&pauseRoot.textContent.includes('Paused.'));
 await button(pauseRoot,'Resume scan').click();check('resume continues the same explicit traversal',counter===2&&pauseRoot.textContent.includes('Discord traversal finished'));
 let finish;const deadRoot=new Node('main'),instance=context.window.mountRoleAudit283(deadRoot,{api:async()=>new Promise(done=>finish=done)}),deadRequest=button(deadRoot,'Compare current roster').click();await Promise.resolve();instance.destroy();finish(page);await deadRequest;
 check('destroy discards a late private page instead of repopulating a departed view',deadRoot.children.length===0);
 assert.ok(cases.every(c=>c.pass),JSON.stringify(cases));console.log(JSON.stringify({ok:true,checks:cases.length,scope:'DOM module behavior; no browser or mobile acceptance'}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
