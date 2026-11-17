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
let downloaded,pacingNow=0,timerId=0;const timers=new Map();
const tick=milliseconds=>{pacingNow+=milliseconds;for(const [id,fn]of [...timers]){timers.delete(id);fn();}};
const context={window:{},document,Date,Blob,performance:{now:()=>pacingNow},URL:{createObjectURL(blob){downloaded=blob;return 'blob:synthetic';},revokeObjectURL(){}},setTimeout(fn,delay){if(!delay){fn();return 0;}const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
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
 const search=find(root,n=>n.tag==='input'&&n.type==='search');search.value=id;await search.fire('input');
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
 const pacingData=(seconds=2,resumeAvailable=true)=>{const serverNow=Math.floor(Date.now()/1000);return {error:'role_audit_unavailable',coverage:{complete:false,gap:'discord_rate_limited'},automaticRetry:false,resumeCursor:resumeAvailable?'signed-pause-original-page':null,readPacing:{version:1,kind:'original-discord-get429',serverNow,notBefore:serverNow+seconds,retryAfterSeconds:seconds,resumeAvailable,traversalExpiresAt:serverNow+900,observations:[]}};};
 const pacingRoot=new Node('main'),pacingCalls=[];let firstPacingPage,scanReads=0,pacingPosts=0;
 const pacingView=context.window.mountRoleAudit283(pacingRoot,{api:async(method,url,body)=>{
  pacingCalls.push({method,url,body});
  if(method==='POST'){pacingPosts++;return {result:{requests:1,results:[{subject:id,state:'unknown',reason:'original-delivery-unknown'}]}};}
  if(url.includes('?subject='))return freshPage();
  scanReads++;
  if(scanReads===1)return new Promise(resolve=>firstPacingPage=resolve);
  if(scanReads<=3)throw {status:429,retryAfterSeconds:60,data:pacingData()};
  return {...page,rows:[{...row,id:'900000000000000004',username:'later',displayName:'Later',repairable:false}],nextCursor:null,coverage:{...page.coverage,providerRowsProcessed:1}};
 }});
 const initialPacingRead=button(pacingRoot,'Compare current roster').click();await Promise.resolve();await button(pacingRoot,'Pause').click();firstPacingPage({...page,rows:[row],nextCursor:'original-next-page',coverage:{...page.coverage,providerRowsProcessed:1,complete:false}});await initialPacingRead;
 await button(pacingRoot,'Review reconciliation to Olympus Member').click();await button(pacingRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();
 await button(pacingRoot,'Resume scan').click();
 check('known original429 preserves completed pages and old uncertain outcome without renewing a spent confirmation',scanReads===2&&pacingPosts===1&&pacingRoot.textContent.includes('1 pages')&&pacingRoot.textContent.includes('original-delivery-unknown')&&pacingRoot.textContent.includes(row.displayName)&&button(pacingRoot,'Resume scan').disabled&&button(pacingRoot,'Start fresh').disabled&&!button(pacingRoot,'Export observed rows').disabled);
 check('read counter explicitly excludes incomplete pages instead of claiming zero total provider requests',pacingRoot.textContent.includes('Discord read requests from completed pages (incomplete-page requests are not included)'));
 await button(pacingRoot,'Resume scan').click();await button(pacingRoot,'Start fresh').click();
 check('read waiting cannot be bypassed by Resume or Start fresh and triggers no hidden provider retry',scanReads===2&&pacingPosts===1);
 tick(1000);check('relative observed wait remains locked until its full deadline',scanReads===2&&button(pacingRoot,'Resume scan').disabled);
 tick(1000);check('timer only enables deliberate Resume and does not perform a request',scanReads===2&&!button(pacingRoot,'Resume scan').disabled&&pacingRoot.textContent.includes('no automatic retry occurred'));
 await button(pacingRoot,'Resume scan').click();
 check('a second429 on resumed original page keeps progress again instead of restarting or replaying a write',scanReads===3&&pacingPosts===1&&pacingRoot.textContent.includes('1 pages')&&pacingRoot.textContent.includes('original-delivery-unknown')&&pacingCalls.filter(c=>c.method==='GET'&&!c.url.includes('?subject=')).at(-1).url.includes('cursor=signed-pause-original-page'));
 tick(2000);await button(pacingRoot,'Resume scan').click();
 check('explicit post-wait resume completes the remaining page while preserving prior observations and uncertain receipt wording',scanReads===4&&pacingPosts===1&&pacingRoot.textContent.includes('2 pages')&&pacingRoot.textContent.includes('2 unique visible candidates')&&pacingRoot.textContent.includes('original-delivery-unknown')&&pacingRoot.textContent.includes('Discord traversal finished'));
 pacingView.destroy();
 const prefixObservedAt=Math.floor(Date.now()/1000)-30;
 const prefixReply=(seconds=2)=>{
  const wait=pacingData(seconds),token='signed-completed-prefix-'+seconds;
  return {...page,comparisonScope:'native',generatedAt:prefixObservedAt+30,
   rows:[{...row,discordObservedAt:prefixObservedAt},{...row,id:'900000000000000004',username:'prefix-second',displayName:'Prefix second',repairable:false,discordObservedAt:prefixObservedAt+1}],
   nextCursor:token,automaticRetry:false,resumeCursor:token,readPacing:wait.readPacing,
   coverage:{...page.coverage,complete:false,completedPrefix:true,gap:'discord_rate_limited',readNotBefore:wait.readPacing.notBefore,providerRowsProcessed:2,providerRequests:4,observedOnly:0,nativeLinkedCandidateSubjects:4}};
 };
 for(const seconds of [2,0]){
  const prefixRoot=new Node('main'),prefixCalls=[];let prefixReads=0,prefixPosts=0;
  const prefixView=context.window.mountRoleAudit283(prefixRoot,{api:async(method,url)=>{
   prefixCalls.push({method,url});
   if(method==='POST'){prefixPosts++;throw Error('A completed read prefix has no role authority');}
   if(url.includes('?subject='))return {...freshPage({discordObservedAt:prefixObservedAt+20}),generatedAt:prefixObservedAt+30};
   prefixReads++;
   return prefixReads===1?prefixReply(seconds):{...page,comparisonScope:'native',rows:[{...row,id:'900000000000000005',username:'remaining-first',displayName:'Remaining first',repairable:false},{...row,id:'900000000000000006',username:'remaining-second',displayName:'Remaining second',repairable:false}],coverage:{...page.coverage,providerRowsProcessed:2,providerRequests:2,observedOnly:0,nativeLinkedCandidateSubjects:4}};
  }});
  await button(prefixRoot,'Compare current roster').click();
  check('completed-prefix200 with '+seconds+'second wait retains only reported progress and requires explicit Resume',prefixReads===1&&prefixPosts===0&&prefixRoot.textContent.includes('1 pages')&&prefixRoot.textContent.includes('2 linked-account candidates processed')&&prefixRoot.textContent.includes('4 Discord read requests')&&prefixRoot.textContent.includes('2 unique visible candidates')&&button(prefixRoot,'Resume scan').disabled===(seconds>0));
  check('completed-prefix observation has no cached confirmation authority with '+seconds+'second wait',!button(prefixRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)')&&prefixPosts===0);
  check('completed-prefix cards use each actual Discord read time instead of later disclosure with '+seconds+'second wait',prefixRoot.textContent.includes(new Date(prefixObservedAt*1000).toLocaleString())&&prefixRoot.textContent.includes(new Date((prefixObservedAt+1)*1000).toLocaleString()));
  await button(prefixRoot,'Export observed rows').click();const prefixCSV=await downloaded.text();
  check('completed-prefix CSV preserves original per-row read timestamps with '+seconds+'second wait',prefixCSV.includes(new Date(prefixObservedAt*1000).toISOString())&&prefixCSV.includes(new Date((prefixObservedAt+1)*1000).toISOString())&&!prefixCSV.includes(new Date((prefixObservedAt+30)*1000).toISOString()));
  if(seconds){await button(prefixRoot,'Resume scan').click();await button(prefixRoot,'Start fresh').click();check('completed-prefix wait blocks all early continuation and restart',prefixReads===1&&button(prefixRoot,'Resume scan').disabled&&button(prefixRoot,'Start fresh').disabled);tick(seconds*1000);}
  check('completed-prefix countdown including zero wait never performs hidden reads',prefixReads===1&&prefixPosts===0&&!button(prefixRoot,'Resume scan').disabled);
  await button(prefixRoot,'Resume scan').click();
  check('completed-prefix Resume uses its exact cursor and appends observations without double-counting with '+seconds+'second wait',prefixReads===2&&prefixPosts===0&&prefixCalls.filter(c=>!c.url.includes('?subject=')).at(-1).url.includes('cursor=signed-completed-prefix-'+seconds)&&prefixRoot.textContent.includes('2 pages')&&prefixRoot.textContent.includes('4 linked-account candidates processed')&&prefixRoot.textContent.includes('6 Discord read requests')&&prefixRoot.textContent.includes('4 unique visible candidates')&&prefixRoot.textContent.includes('Discord traversal finished'));
  if(seconds){await button(prefixRoot,'Review reconciliation to Olympus Member').click();check('separate current-account Review displays its actual Discord read time and alone enables confirmation',prefixCalls.filter(c=>c.url.includes('?subject=')).length===1&&prefixPosts===0&&prefixRoot.textContent.includes(new Date((prefixObservedAt+20)*1000).toLocaleString())&&!!button(prefixRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));}
  prefixView.destroy();
 }
 for(const kind of ['missing-prefix-flag','different-resume-cursor','inconsistent-wait','missing-pacing-metadata','missing-next-cursor']){
  const malformedPrefixRoot=new Node('main');let malformedPrefixReads=0;const data=prefixReply();
  if(kind==='missing-prefix-flag')delete data.coverage.completedPrefix;
  if(kind==='different-resume-cursor')data.resumeCursor='different-signed-prefix';
  if(kind==='inconsistent-wait')data.readPacing.retryAfterSeconds++;
  if(kind==='missing-pacing-metadata')delete data.readPacing;
  if(kind==='missing-next-cursor')data.nextCursor=null;
  const malformedPrefixView=context.window.mountRoleAudit283(malformedPrefixRoot,{api:async()=>{malformedPrefixReads++;if(malformedPrefixReads>1)throw Error('Malformed prefix must not be continued');return data;}});
  await button(malformedPrefixRoot,'Compare current roster').click();
  check('malformed completed prefix '+kind+' stops without an automatic continuation or confirmation',malformedPrefixReads===1&&malformedPrefixRoot.textContent.includes('Coverage stopped:')&&!button(malformedPrefixRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
  malformedPrefixView.destroy();
 }
 const unknownWaitRoot=new Node('main');let unknownWaitReads=0;
 context.window.mountRoleAudit283(unknownWaitRoot,{api:async()=>{unknownWaitReads++;throw {status:429,retryAfterSeconds:60,data:{coverage:{gap:'discord_rate_limited'}}};}});
 await button(unknownWaitRoot,'Compare current roster').click();tick(61000);
 check('generic api60second fallback cannot manufacture confirmed pacing or a resume cursor',unknownWaitReads===1&&button(unknownWaitRoot,'Compare current roster').disabled&&!button(unknownWaitRoot,'Resume scan'));
 const longWaitRoot=new Node('main');let longReads=0;
 const longView=context.window.mountRoleAudit283(longWaitRoot,{api:async()=>{longReads++;throw {status:429,retryAfterSeconds:900,data:pacingData(1200,false)};}});
 await button(longWaitRoot,'Compare current roster').click();tick(901000);
 check('long original provider wait is not shortened to api900second clamp or used to renew traversal',longReads===1&&button(longWaitRoot,'Start fresh').disabled&&button(longWaitRoot,'Resume scan').disabled);
 tick(299000);check('wait outlasting original traversal requires a new explicit read after full observed wait',longReads===1&&!button(longWaitRoot,'Start fresh').disabled&&button(longWaitRoot,'Resume scan').disabled&&longWaitRoot.textContent.includes('old source and cursor were not renewed'));longView.destroy();
 for(const status of [429,503]){
  const floorRoot=new Node('main');let floorReads=0;const data=pacingData();data.resumeCursor=null;data.readPacing.kind='original-discord-get429-floor';data.readPacing.resumeAvailable=false;if(status===503)data.coverage.gap='provider_or_admission_unavailable';
  const floorView=context.window.mountRoleAudit283(floorRoot,{api:async()=>{floorReads++;throw {status,data};}});
  await button(floorRoot,'Compare current roster').click();await button(floorRoot,'Start fresh').click();
  check('mixed'+status+' failure retains known minimum wait while leaving all other results unconfirmed',floorReads===1&&button(floorRoot,'Start fresh').disabled&&button(floorRoot,'Resume scan').disabled&&floorRoot.textContent.includes('at least')&&floorRoot.textContent.includes('Other read results remain unconfirmed'));
  tick(2000);check('mixed'+status+' floor expiry permits only a new explicit read and never resumes uncertain page',floorReads===1&&!button(floorRoot,'Start fresh').disabled&&button(floorRoot,'Resume scan').disabled&&floorRoot.textContent.includes('known minimum wait has ended')&&floorRoot.textContent.includes('other read results remain unconfirmed'));floorView.destroy();
 }
 const disposedRoot=new Node('main');let disposedReads=0;
 const disposed=context.window.mountRoleAudit283(disposedRoot,{api:async()=>{disposedReads++;throw {status:429,data:pacingData()};}});
 await button(disposedRoot,'Compare current roster').click();disposed.destroy();tick(3000);
 check('destroy cancels wait display without late UI repopulation or a new request',disposedReads===1&&disposedRoot.children.length===0&&timers.size===0);
 let finish;const deadRoot=new Node('main'),instance=context.window.mountRoleAudit283(deadRoot,{api:async()=>new Promise(done=>finish=done)}),deadRequest=button(deadRoot,'Compare current roster').click();await Promise.resolve();instance.destroy();finish(page);await deadRequest;
 check('destroy discards a late private page instead of repopulating a departed view',deadRoot.children.length===0);
 {
  const inputFor=root=>find(root,n=>n.tag==='input'&&n['aria-label']==='Discord account ID for one-account read');
  const chosenId='900000000000000009',chosenReply=(account=chosenId,changes={})=>freshPage({id:account,username:'chosen-user',displayName:'Chosen identity',previewToken:'initial-chosen-token',...changes});
  const directRoot=new Node('main'),directCalls=[];let directReads=0;
  const directView=context.window.mountRoleAudit283(directRoot,{api:async(method,url,body)=>{directCalls.push({method,url,body});if(method==='POST')return {result:{requests:0,results:[{subject:chosenId,state:'held',reason:'current_source_changed'}]}};directReads++;return chosenReply(chosenId,{previewToken:directReads===1?'initial-chosen-token':'review-only-token'});}});
  check('one-account controls mount without an initial request',!!inputFor(directRoot)&&!!button(directRoot,'Read one account')&&directCalls.length===0);
  if(inputFor(directRoot)){
   inputFor(directRoot).value=chosenId;await button(directRoot,'Read one account').click();
   check('direct account read uses only the exact existing subject endpoint and does not auto-review or confirm',directCalls.length===1&&directCalls[0].method==='GET'&&directCalls[0].url==='/api/admin/role-audit?subject='+chosenId&&directRoot.textContent.includes('Chosen identity')&&directRoot.textContent.includes('Single-account observation')&&!button(directRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));
   await button(directRoot,'Review reconciliation to Olympus Member').click();await button(directRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)').click();
   check('direct observation still requires separate current Review and Confirm and posts only the second token',directCalls.length===3&&directCalls[1].method==='GET'&&directCalls[2].method==='POST'&&directCalls[2].body.subject===chosenId&&directCalls[2].body.previewToken==='review-only-token'&&!JSON.stringify(directCalls[2]).includes('initial-chosen-token'));
   directView.destroy();
   const invalidRoot=new Node('main'),invalidCalls=[];
   const invalidView=context.window.mountRoleAudit283(invalidRoot,{api:async(method,url)=>{invalidCalls.push({method,url});return chosenReply(new URL(url,'https://fixture.invalid').searchParams.get('subject'));}});
   for(const value of ['', ' '+chosenId, chosenId+' ', '0900000000000000001', '1e18', '1234567890123456', '123456789012345678901', '18446744073709551616', '９００００００００００００００００１', chosenId+'?cursor=x']){
    inputFor(invalidRoot).value=value;await button(invalidRoot,'Read one account').click();
    check('invalid exact snowflake is refused without I/O '+JSON.stringify(value),invalidCalls.length===0&&invalidRoot.textContent.includes('No read was sent'));
   }
   inputFor(invalidRoot).value='18446744073709551615';await button(invalidRoot,'Read one account').click();
   check('maximum uint64 snowflake remains an exact string without numeric rounding',invalidCalls.length===1&&invalidCalls[0].url.endsWith('subject=18446744073709551615')&&invalidRoot.textContent.includes('18446744073709551615'));invalidView.destroy();
   for(const kind of ['wrong-id','two-rows','cursor','wrong-scope','not-complete','whole-complete','bad-arrays']){
    const badRoot=new Node('main');let calls=0;const reply=chosenReply();
    if(kind==='wrong-id')reply.rows[0].id=id;if(kind==='two-rows')reply.rows.push({...reply.rows[0]});if(kind==='cursor')reply.nextCursor='foreign-cursor';if(kind==='wrong-scope')reply.coverage.scope='one_linked_account_page';if(kind==='not-complete')reply.coverage.singleMemberReadComplete=false;if(kind==='whole-complete')reply.coverage.complete=true;if(kind==='bad-arrays')reply.rows[0].characters=null;
    const view=context.window.mountRoleAudit283(badRoot,{api:async()=>{calls++;return reply;}});inputFor(badRoot).value=chosenId;await button(badRoot,'Read one account').click();
    check('unconfirmed single-account '+kind+' cannot populate identity or a confirmation',calls===1&&badRoot.textContent.includes('One-account read unavailable')&&!badRoot.textContent.includes('Chosen identity')&&!button(badRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)'));view.destroy();
   }
   for(const kind of ['zero','history','privacy','pending','bot']){
    const unavailableRoot=new Node('main'),reply=chosenReply();
    if(kind==='zero')reply.rows=[];if(kind==='history')reply.rows[0].historyWithheld=true;if(kind==='privacy')reply.rows[0].cause='privacy_held';if(kind==='pending')reply.rows[0].pending=true;if(kind==='bot')reply.rows[0].bot=true;
    const view=context.window.mountRoleAudit283(unavailableRoot,{api:async()=>reply});inputFor(unavailableRoot).value=chosenId;await button(unavailableRoot,'Read one account').click();
    check('unavailable chosen '+kind+' is counts-only without cached identity or reason disclosure',unavailableRoot.textContent.includes('No reason is disclosed')&&!unavailableRoot.textContent.includes('Chosen identity')&&!unavailableRoot.textContent.includes('Why held')&&button(unavailableRoot,'Export observed rows').disabled);view.destroy();
   }
   for(const changedSource of [false,true]){
    const savedRoot=new Node('main'),calls=[];let resolvePage,scanCount=0;
    const view=context.window.mountRoleAudit283(savedRoot,{api:async(method,url)=>{calls.push({method,url});if(url.includes('?subject='))return {...chosenReply(),source:{id:2}};scanCount++;return scanCount===1?new Promise(done=>resolvePage=done):{...page,source:{id:changedSource?2:1},rows:[],coverage:{...page.coverage,providerRowsProcessed:0}};}});
    const reading=button(savedRoot,'Compare current roster').click();await Promise.resolve();await button(savedRoot,'Pause').click();resolvePage({...page,rows:[row],nextCursor:'saved-original-cursor',coverage:{...page.coverage,complete:false,providerRowsProcessed:1}});await reading;
    const searchInput=find(savedRoot,n=>n.tag==='input'&&n.type==='search');searchInput.value='does-not-match';await searchInput.fire('input');
    inputFor(savedRoot).value=chosenId;await button(savedRoot,'Read one account').click();
    check('chosen view is independent of saved scan filters and source '+changedSource,savedRoot.textContent.includes('Chosen identity')&&savedRoot.textContent.includes('retains 1 completed page')&&searchInput.disabled);
    await button(savedRoot,'Export observed rows').click();const selectedCSV=await downloaded.text();
    check('chosen CSV contains only that observation and does not merge scan identities '+changedSource,selectedCSV.includes(chosenId)&&!selectedCSV.includes(id));
    await button(savedRoot,'Return to scan observations').click();searchInput.value='';await searchInput.fire('input');
    check('return restores saved rows and filters without a request '+changedSource,calls.length===2&&savedRoot.textContent.includes(row.displayName)&&!savedRoot.textContent.includes('Chosen identity')&&savedRoot.textContent.includes('1 pages')&&!searchInput.disabled);
    await button(savedRoot,'Resume scan').click();
    check('selected source never renews original traversal cursor or source '+changedSource,calls.length===3&&calls[2].url.includes('cursor=saved-original-cursor')&&(changedSource?savedRoot.textContent.includes('native roster changed during this traversal'):savedRoot.textContent.includes('Discord traversal finished')));view.destroy();
   }
   for(const kind of ['zero','limited-private','review-zero','review-limited-private']){
    const evictedRoot=new Node('main'),unrelated={...row,id:'900000000000000008',username:'unrelated',displayName:'Unrelated identity'},calls=[];
    let chosenReads=0;const view=context.window.mountRoleAudit283(evictedRoot,{api:async(method,url)=>{calls.push({method,url});if(!url.includes('?subject='))return {...page,rows:[row,unrelated]};chosenReads++;return kind.startsWith('review-')&&chosenReads===1?chosenReply(id):{...chosenReply(id),rows:kind.endsWith('zero')?[]:[{id,historyWithheld:true}]};}});
    await button(evictedRoot,'Compare current roster').click();inputFor(evictedRoot).value=id;await button(evictedRoot,'Read one account').click();if(kind.startsWith('review-'))await button(evictedRoot,'Review reconciliation to Olympus Member').click();await button(evictedRoot,'Return to scan observations').click();
    check('fresh unavailable '+kind+' evicts only requested cached scan identity',calls.length===(kind.startsWith('review-')?3:2)&&!evictedRoot.textContent.includes(row.displayName)&&!evictedRoot.textContent.includes(id)&&evictedRoot.textContent.includes('Unrelated identity')&&evictedRoot.textContent.includes('1 pages'));
    await button(evictedRoot,'Export observed rows').click();const evictedCSV=await downloaded.text();
    check('fresh unavailable '+kind+' cannot restore target identity through saved-scan CSV',!evictedCSV.includes(id)&&evictedCSV.includes(unrelated.id));view.destroy();
   }
   const tokenRoot=new Node('main');let phase=0,posts=0;
   const tokenView=context.window.mountRoleAudit283(tokenRoot,{api:async(method)=>{if(method==='POST'){posts++;return {};}phase++;if(phase===3)throw {status:429,data:{...pacingData(),resumeCursor:'foreign-selected-cursor'}};return chosenReply(chosenId,{previewToken:phase===1?'discarded-initial':'fresh-reviewed'});}});
   inputFor(tokenRoot).value=chosenId;await button(tokenRoot,'Read one account').click();await button(tokenRoot,'Review reconciliation to Olympus Member').click();const detachedConfirm=button(tokenRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)');
   await button(tokenRoot,'Read one account').click();await detachedConfirm.click();
   check('failed new selected read revokes old confirmation and never treats its foreign cursor as traversal pacing',phase===3&&posts===0&&!tokenRoot.textContent.includes('Chosen identity')&&!button(tokenRoot,'Confirm Olympus Member reconciliation (up to 2 planned changes)')&&!button(tokenRoot,'Read one account').disabled);tokenView.destroy();
   const planChosenRoot=new Node('main'),planChosenCalls=[];
   const planChosenView=context.window.mountRoleAudit283(planChosenRoot,{api:async(method,url)=>{planChosenCalls.push({method,url});return chosenReply(chosenId,{activationRequired:true,repairable:false});}});
   const planSelect=select(planChosenRoot,'Role audit policy view');planSelect.value='steward-v3';await planSelect.fire('change');inputFor(planChosenRoot).value=chosenId;await button(planChosenRoot,'Read one account').click();
   check('single-account inactive-policy read retains planning URL and exposes no action authority',planChosenCalls.length===1&&planChosenCalls[0].method==='GET'&&planChosenCalls[0].url.endsWith('&policyPreview=steward-v3')&&planChosenRoot.textContent.includes('Active-policy expected rank')&&!button(planChosenRoot,'Review reconciliation to Olympus Member'));planChosenView.destroy();
   const waitingRoot=new Node('main'),waitCalls=[];let scans=0;
   const waitingView=context.window.mountRoleAudit283(waitingRoot,{api:async(method,url)=>{waitCalls.push({method,url});if(url.includes('?subject='))return chosenReply();scans++;return scans===1?prefixReply(2):{...page,rows:[],coverage:{...page.coverage,providerRowsProcessed:0}};}});
   await button(waitingRoot,'Compare current roster').click();inputFor(waitingRoot).value=chosenId;await button(waitingRoot,'Read one account').click();
   check('chosen read cannot bypass the saved traversal original observed wait',waitCalls.length===1&&button(waitingRoot,'Read one account').disabled);tick(2000);
   check('ending saved wait enables deliberate chosen read without issuing it',waitCalls.length===1&&!button(waitingRoot,'Read one account').disabled);
   await button(waitingRoot,'Read one account').click();await button(waitingRoot,'Return to scan observations').click();await button(waitingRoot,'Resume scan').click();
   check('chosen read does not replace the original signed prefix cursor',waitCalls.length===3&&waitCalls[2].url.includes('cursor=signed-completed-prefix-2')&&scans===2);waitingView.destroy();
   const changingRoot=new Node('main');let deliver,changingCalls=0;
   const changingView=context.window.mountRoleAudit283(changingRoot,{api:async()=>{changingCalls++;return new Promise(done=>deliver=done);}});inputFor(changingRoot).value=chosenId;
   const inFlight=button(changingRoot,'Read one account').click();await Promise.resolve();await button(changingRoot,'Read one account').click();inputFor(changingRoot).value=id;deliver(chosenReply());await inFlight;
   check('busy duplicate read and changed input cannot adopt a late different selection',changingCalls===1&&!changingRoot.textContent.includes('Chosen identity')&&changingRoot.textContent.includes('account selection changed'));changingView.destroy();
   const chosenDeadRoot=new Node('main');let lateChosen;
   const chosenDeadView=context.window.mountRoleAudit283(chosenDeadRoot,{api:async()=>new Promise(done=>lateChosen=done)});inputFor(chosenDeadRoot).value=chosenId;const chosenPending=button(chosenDeadRoot,'Read one account').click();await Promise.resolve();chosenDeadView.destroy();lateChosen(chosenReply());await chosenPending;
   check('destroy drops a late single-account observation without UI repopulation',chosenDeadRoot.children.length===0);
  }
 }
 assert.ok(cases.every(c=>c.pass),JSON.stringify(cases));console.log(JSON.stringify({ok:true,checks:cases.length,scope:'DOM module behavior; no browser or mobile acceptance'}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
