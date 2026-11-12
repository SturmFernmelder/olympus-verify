'use strict';
// Real source/clock/Workerd/D1. The external Discord service alone is replaced.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {buildSync}=require('esbuild'),{Miniflare,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'olv-roster-pacing271-'));
const started=performance.now();
const sourceFiles=['src/site-launch229.ts','src/launch-discord-reads271.ts','src/launch-operations229.ts','src/officer-invites233.ts','src/roster-verification275.ts','src/unverified.ts','src/routine-membership-authority232.ts'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const testFiles=['tests/launch_roster_pacing271_runtime.mjs','tests/launch_roster_pacing271_workerd_test.cjs'];
const testHashes=()=>Object.fromEntries(testFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const http=[],checks=[],perMode=new Map(),inflightMutations=new Set();let mf,active=0,maxActive=0,sourceChanged=false,unrelatedChanged=false;
const check=(name,value)=>{assert(value,name);checks.push({name,passed:true});};
const modes={'429-body':{header:'1.1',body:3.2,reset:'2.4',expected:4},
  '429-header':{header:'5.2',body:2.1,reset:'3.1',expected:6},
  '429-reset':{header:'2.1',body:1.2,reset:'7.2',expected:8},
  '429-persistent':{header:'1',body:1,reset:'1',expected:1}};
async function fixtureCall(route,body={}){
  const response=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
  const raw=await response.text();assert.equal(response.status,200,raw);const result=JSON.parse(raw);
  assert.equal(result.complete,true,raw);return result;
}
async function refused(route,body,code,status){
  const before=http.length,response=await mf.dispatchFetch('http://fixture.invalid/'+route,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
  const raw=await response.text();assert.equal(response.status,status,raw);assert.equal(JSON.parse(raw).complete,false);
  assert(raw.includes(code),raw);assert.equal(http.length,before,'a refused cursor cannot dispatch Discord reads');
}
async function verificationChurn272(){
  await fixtureCall('source-state',{kind:'link',index:950});
  await fixtureCall('source-state',{kind:'link',index:5});
  const first=(await fixtureCall('page',{mode:'link-churn'})).page;
  assert.equal(first.entitlements.offset,0);assert.equal(first.promotions.length,19);assert(first.nextCursor);
  await fixtureCall('source-state',{kind:'link',index:950,restore:true});
  const next=(await fixtureCall('page',{mode:'link-churn',cursor:first.nextCursor})).page;
  check('a future-page link becoming verified does not invalidate the original native discovery scan',next.entitlements.offset===20&&next.promotions.length===20&&next.nextCursor&&JSON.stringify(next.scan)===JSON.stringify(first.scan));
  await fixtureCall('source-state',{kind:'link',index:5,restore:true});
  const later=(await fixtureCall('page',{mode:'link-churn',cursor:next.nextCursor})).page;
  check('a past-page link becoming verified does not invalidate later-page discovery',later.entitlements.offset===40&&later.promotions.length===20&&later.nextCursor&&JSON.stringify(later.scan)===JSON.stringify(first.scan));
  check('unrelated past and future link changes during selected-page Discord awaits do not discard its result',unrelatedChanged&&later.status!=='held'&&later.promotions.length===20);
  assert.equal((await fixtureCall('source-observe',{index:5})).guid,null);
  assert.equal((await fixtureCall('source-observe',{index:950})).guid,null);
  await fixtureCall('source-state',{kind:'link',index:5,restore:true});
  await fixtureCall('source-state',{kind:'link',index:950,restore:true});
  check('verification churn preserves original scan and snapshot deadlines without repairing the other links',later.snapshotAt===first.snapshotAt&&later.scan.expiresAt===first.scan.expiresAt&&later.expiresAt<=later.fetchedAt+60);

  const before=http.length,cached=(await fixtureCall('page',{mode:'identity-switch'})).page;
  assert.equal(http.length-before,6);assert.equal(cached.promotions.length,5);
  const captured=JSON.parse(Buffer.from(cached.pageCursor.split('.')[0],'base64url').toString('utf8'));
  await fixtureCall('source-state',{kind:'identity'});
  const beforeSwitch=http.length,switched=(await fixtureCall('page',{mode:'identity-switch',cursor:cached.pageCursor})).page;
  const reads=http.slice(beforeSwitch),replacement=reads.filter(row=>row.subject==='800000000000009999');
  const target=switched.promotions.find(row=>row.guid==='Player-6933-00000001');
  check('selected-page account change invalidates its cached role and freshly reads the exact replacement account',replacement.length===1&&!reads.some(row=>row.subject==='800000000000001000')&&target?.targetSlot===6&&target.reason==='knight-veteran'&&reads.length===16);
  check('unchanged cached successes retain their original expiry across an account switch',JSON.stringify(switched.scan)===JSON.stringify(cached.scan)&&switched.snapshotAt===cached.snapshotAt&&switched.expiresAt<=Math.min(...captured.roleReads.slice(1).map(row=>row[2]+60)));
  assert.equal((await fixtureCall('source-observe')).originalIdentity,false);
  await fixtureCall('source-state',{kind:'identity',restore:true});

  for(const kind of ['privacy','denial','native','cutoff','credential','secret']){
    const result=(await fixtureCall('page',{mode:'await-'+kind})).page;
    check('selected '+kind+' mutation during provider await remains fail-closed',inflightMutations.has(kind)&&result.status==='held'&&result.promotions.length===0&&result.invites.length===0&&result.pageCursor===null&&result.nextCursor===null);
    await fixtureCall('source-state',{kind,restore:true});
  }
}
async function reviewRecords275(){
  const setup=await fixtureCall('review-records275',{action:'setup'}),guids=setup.guids,target=guids[0];
  const read=(extra={})=>fixtureCall('review-records275',{action:'read',...extra});
  const mutate=(kind,restore=false)=>fixtureCall('review-records275',{action:'mutate',kind,restore});
  const verified=(report,guid)=>report?.verified.some(row=>row.guid===guid&&row.status==='member');
  const unknown=(report,guid)=>report?.unknown.some(row=>row.guid===guid);
  const recommendation=(page,guid)=>page.promotions.find(row=>row.guid===guid);
  try{
    const base=await read();
    check('genuine D1 canonical post-cutoff observed-without-dispatch lineage verifies an exact old-proof GUID without changing proof clocks',setup.syntheticSourceFacts&&base.actualLocalWorkerdD1&&verified(base.display,target)&&recommendation(base.page,target)?.targetSlot===8&&base.readOnlySourceUnchanged);
    const unbound=base.display.unverified.find(row=>row.guid===guids[1]),pending=base.display.unverified.find(row=>row.guid===guids[2]);
    check('unbound null-GUID history without a current GUID owner is unverified while a fresh active request remains pending',unbound?.pending===false&&pending?.pending===true&&!recommendation(base.page,guids[1])&&!recommendation(base.page,guids[2]));
    const baselineHTTP=http.filter(row=>row.mode==='review-records');
    check('unbound and pending histories cause no role read for the historical account and risk stays review-only',![1,2].some(index=>baselineHTTP.some(row=>row.subject===String(800000000000001000n+BigInt(index))))&&base.page.riskBuffer.some(row=>row.guid===guids[1]&&row.reviewOnly===true)&&base.page.actions.automatic===false&&base.page.actions.removals===false);
    check('malformed missing wrong-generation cross-GUID denied private and rename-held canonical records stay unknown',guids.slice(3,10).every(guid=>unknown(base.display,guid)&&!recommendation(base.page,guid))&&verified(base.display,guids[10]));
    const selected=await read({mode:'review-records-selected',selection:await selectedInput273(0)});
    check('actual selected reader shares the corrected classification without exposing lineage or granting invites risk or role writes',selected.selection.protocol==='promotion-selection-v274'&&selected.selection.coveredGuids.includes(target)&&recommendation(selected.page,target)?.targetSlot===8&&selected.page.invites.length===0&&selected.page.riskBuffer.length===0&&selected.readOnlySourceUnchanged&&!JSON.stringify(selected.selection).includes('lineageAnchorId'));
    const archived=await mutate('anchor-historical'),archivedRead=await read({mode:'review-records-archived',selection:await selectedInput273(0)});
    check('an archived post-cutoff identity receipt keeps its expired original300s interval while fresh source and role observations admit display and selected readiness',archived.postCutoff&&archived.originalIntervalSeconds===300&&archived.originalCheckWithinInterval&&archived.originalIntervalExpired&&verified(archivedRead.display,target)&&recommendation(archivedRead.page,target)?.targetSlot===8&&archivedRead.readOnlySourceUnchanged);
    await mutate('anchor-restore');
    for(const kind of ['anchor-subject','anchor-guid','anchor-role','anchor-rank','anchor-digest','anchor-generation','anchor-precutoff','anchor-future','anchor-interval']){
      await mutate(kind);const held=await read();
      check('canonical lineage rejects '+kind+' through real display and promotion readers',unknown(held.display,target)&&!recommendation(held.page,target)&&held.readOnlySourceUnchanged);
      await mutate('anchor-restore');
    }
    for(const kind of ['config','scope','denial','privacy','rename','native-duplicate']){
      await mutate(kind);const held=await read();
      check('canonical '+kind+' guard cannot turn an old proof into current display or promotion authority',!verified(held.display,target)&&!recommendation(held.page,target)&&held.readOnlySourceUnchanged);
      await mutate(kind,true);
    }
    await mutate('owner-conflict');const owned=await read();
    check('an unbound namesake with another active GUID owner stays unknown instead of inheriting unverified or verified status',unknown(owned.display,guids[1])&&!owned.display.unverified.some(row=>row.guid===guids[1])&&!recommendation(owned.page,guids[1]));
    await mutate('owner-conflict',true);
    for(const kind of ['anchor','config','native-config']){
      const held=await read({mode:'review-await-'+kind,selection:await selectedInput273(0)});
      check('selected canonical '+kind+' change during actual provider await holds the entire overlay',inflightMutations.has('review-'+kind)&&held.page.status==='held'&&held.page.promotions.length===0&&held.selection.coveredGuids.length===0&&held.page.pageCursor===null&&held.page.nextCursor===null);
      await mutate(kind==='anchor'?'anchor-restore':kind,true);
    }
    // A real 429 first warms the source's shared pacer. The next query starts
    // before its bounded cooldown, while role observedAt is captured AFTER the
    // real wait. Neither D1 nor either clock is replaced to cross the second.
    const warm=await read({mode:'review-records-cache'});
    assert.equal(warm.page.promotions.length,0);assert.equal(warm.page.entitlements.retryAfterSeconds,3);
    const cached=await read({mode:'review-records-cache'}),cursor=cached.page.pageCursor,body=JSON.parse(Buffer.from(cursor.split('.')[0],'base64url').toString('utf8')),originalPage=JSON.stringify(cached.page);
    assert.equal(body.roleReads.length,5);assert(body.roleReads.some(row=>row[0]===target));
    await mutate('newer-anchor');const beforeWitness=http.length,witness=await read({mode:'review-records-cache',cursor}),witnessBody=JSON.parse(Buffer.from(witness.page.pageCursor.split('.')[0],'base64url').toString('utf8'));
    assert.equal(witness.page.entitlements.retryAfterSeconds,1);assert.deepEqual(witnessBody.roleReads,body.roleReads);assert.equal(witnessBody.roleScope,body.roleScope);
    const beforeNew=http.length,newer=await read({mode:'review-records-cache',cursor:witness.page.pageCursor});
    const cachedSubjects=new Set(body.roleReads.map(row=>String(800000000000001000n+BigInt(parseInt(row[0].split('-').at(-1),16)-1))));
    const originalRoleCeiling=Math.min(...body.roleReads.map(row=>row[2]+60)),permittedExpiry=Math.min(originalRoleCeiling,cached.page.scan.expiresAt,newer.page.fetchedAt+60);
    const operands={newReads:http.length-beforeNew,promotions:newer.page.promotions.length,sameScan:JSON.stringify(newer.page.scan)===JSON.stringify(cached.page.scan),sameOriginalPage:JSON.stringify(cached.page)===originalPage,exactCachedTuplesRetained:JSON.stringify(witnessBody.roleReads)===JSON.stringify(body.roleReads),cachedAccountReads:http.slice(beforeWitness).filter(row=>cachedSubjects.has(row.subject)).length,originalRoleExpiryCap:originalRoleCeiling,permittedExpiry,newExpiryWithinOriginalCaps:newer.page.expiresAt<=permittedExpiry,sourceUnchanged:newer.readOnlySourceUnchanged,oldInitialEnvelopeConjunct:newer.page.expiresAt<=cached.page.expiresAt};
    const clocks={scope:'Real-clock shared-pacer boundary; synthetic external Discord only',initialPageFetchedAt:cached.page.fetchedAt,initialPageExpiresAt:cached.page.expiresAt,initialQueryAtInferredFromConservative60sCap:cached.page.expiresAt-60,originalRoleReads:body.roleReads,retryRetainedRoleReads:witnessBody.roleReads,retryFetchedAt:newer.page.fetchedAt,retryExpiresAt:newer.page.expiresAt,originalScan:cached.page.scan,operands};
    fs.writeFileSync(path.join(out,'review-canonical-cache-clocks.json'),JSON.stringify(clocks,null,2)+'\n',{flag:'wx'});console.log('REVIEW275_CACHE_CLOCKS '+JSON.stringify(clocks));
    assert(originalRoleCeiling>cached.page.expiresAt&&cached.page.expiresAt<cached.page.scan.expiresAt,'real pacer wait must cross a second before recording the first role observation');
    assert.equal(operands.oldInitialEnvelopeConjunct,false,'the real-clock case must expose the older overstrict envelope assertion');
    check('a newer qualifying canonical receipt leaves the stable oldest witness and its cached role observations unchanged',operands.newReads===6&&operands.promotions===11&&operands.sameScan&&operands.sameOriginalPage&&operands.exactCachedTuplesRetained&&operands.cachedAccountReads===0&&operands.newExpiryWithinOriginalCaps&&operands.sourceUnchanged);
    await mutate('remove-old-anchor');const beforeRemoved=http.length,removed=await read({mode:'review-records-cache',cursor});
    check('removing the original canonical witness forces a fresh exact-account role read before using its replacement',http.length-beforeRemoved===7&&http.slice(beforeRemoved).some(row=>row.subject==='800000000000001000')&&recommendation(removed.page,target)?.targetSlot===8&&JSON.stringify(removed.page.scan)===JSON.stringify(cached.page.scan)&&removed.page.expiresAt<=Math.min(...body.roleReads.filter(row=>row[0]!==target).map(row=>row[2]+60))&&removed.readOnlySourceUnchanged);
    await mutate('generation');
    await refused('review-records275',{action:'read',mode:'review-records-cache',cursor},'launch_cursor_role_source_changed',409);
    const invalid=await read();check('a changed privacy generation invalidates cached lineage and holds the current GUID without role authority',unknown(invalid.display,target)&&!recommendation(invalid.page,target)&&invalid.readOnlySourceUnchanged);
    await mutate('generation',true);
    await mutate('stale');const stale=await read();
    check('canonical lineage never renews a stale Native source or its display and promotion deadlines',stale.display===null&&stale.page.status==='held'&&stale.page.promotions.length===0&&stale.readOnlySourceUnchanged);
    await mutate('stale',true);
  }finally{
    const restored=await fixtureCall('review-records275',{action:'restore'});
    check('isolated canonical classification facts restore all original identity proof and effect rows before the existing audit',restored.originalProofsRestored&&restored.originalEffectsRestored);
  }
}
let selectedSerial=300;
async function selectedInput273(index=399){
  const source=await fixtureCall('selection-observe',{index});
  return {selectionId:source.at+':'+(++selectedSerial),targetGuid:source.targetGuid,snapshotId:source.snapshotId,snapshotAt:source.snapshotAt};
}
async function selectedCursorCapacity273(){
  await fixtureCall('selection-native',{kind:'long-guids'});
  const selection=await selectedInput273(0),before=http.length,first=(await fixtureCall('selection',{mode:'selected-late-limit',selection})).selection;
  const cursor=first.page.pageCursor,value=JSON.parse(Buffer.from(cursor.split('.')[0],'base64url').toString('utf8'));
  fs.writeFileSync(path.join(out,'selected-cursor-capacity.json'),JSON.stringify({actualLocalWorkerdD1:true,cursorCharacters:cursor.length,readerLimit:4096,cachedSuccesses:value.roleReads.length,coveredGuids:first.coveredGuids.length,maximumGuidCharacters:Math.max(...first.coveredGuids.map(g=>g.length)),providerCalls:0},null,2)+'\n',{flag:'wx'});
  check('actual v4 late429 cursor with20maximum-lengthGUIDs and19cached successes fits its4096byte reader limit',cursor.length<=4096&&first.coveredGuids.length===20&&first.coveredGuids.every(g=>g.length===30)&&value.roleReads.length===19&&http.length-before===20);
  const next=(await fixtureCall('selection',{mode:'selected-late-limit',selection,cursor})).selection;
  check('the maximum-size genuine selected cursor retries only the one unknown account without expiry renewal',http.length-before===21&&next.page.promotions.length===20&&JSON.stringify(next.page.scan)===JSON.stringify(first.page.scan)&&next.page.expiresAt===first.page.expiresAt&&next.page.expiresAt<=Math.min(...value.roleReads.map(r=>r[2]+600))&&JSON.stringify(next.coveredGuids)===JSON.stringify(first.coveredGuids));
  await fixtureCall('selection-native',{kind:'restore'});
}
async function selectedReads273(originalDiscovery){
  const frozen=JSON.stringify(originalDiscovery);
  await fixtureCall('selection-native',{kind:'routine'});
  await fixtureCall('selection-native',{kind:'reorder'});
  const selection=await selectedInput273(),before=http.length,response=await fixtureCall('selection',{mode:'selected-new-source',selection}),fresh=response.selection;
  fs.writeFileSync(path.join(out,'selected-success.json'),JSON.stringify(fresh,null,2)+'\n',{flag:'wx'});
  check('new explicit selected read resolves its exact GUID on the freshly accepted reordered native page',fresh.version===1&&fresh.protocol==='promotion-selection-v274'&&fresh.controlId===selection.selectionId&&fresh.targetGuid===selection.targetGuid&&fresh.page.entitlements.offset===400&&fresh.coveredGuids.length===20&&fresh.coveredGuids.includes(selection.targetGuid)&&fresh.page.promotions.some(row=>row.guid===selection.targetGuid)&&http.length-before===20);
  check('selected promotion observation exceeds60s but keeps original control-time600 and native-age600 clocks without changing dated discovery',fresh.page.scan.startedAt===Number(selection.selectionId.split(':')[0])&&fresh.page.scan.expiresAt===Math.min(fresh.page.scan.startedAt+600,selection.snapshotAt+600)&&fresh.page.expiresAt===fresh.page.scan.expiresAt&&fresh.page.expiresAt>fresh.page.fetchedAt+60&&fresh.page.expiresAt<=fresh.page.fetchedAt+600&&fresh.page.nextCursor===null&&JSON.stringify(originalDiscovery)===frozen&&originalDiscovery.expiresAt<=originalDiscovery.fetchedAt+60);
  check('selected response is private no-store and supplies no invites or risk-buffer authority',response.cacheControl.includes('no-store')&&fresh.page.invites.length===0&&fresh.page.riskBuffer.length===0);
  await refused('selection',{mode:'selected-new-source',selection:{...selection,snapshotAt:selection.snapshotAt-1}},'selection_native_source_changed',409);
  await refused('selection',{mode:'selected-new-source',selection,cursor:originalDiscovery.pageCursor},'invalid_selection_cursor',400);
  await refused('page',{mode:'full',cursor:fresh.page.pageCursor},'invalid_launch_cursor',400);
  const query=new URLSearchParams({keyVersion:'officer-operations-v233',...selection});
  for(const rawQuery of [String(query)+'&targetGuid='+selection.targetGuid,String(query)+'&offset=0',String(query).replace(/&snapshotAt=[^&]+/,''),String(query).replace('keyVersion=officer-operations-v233','keyVersion=old-wire')])await refused('selection',{mode:'selected-new-source',selection,rawQuery},'invalid_launch_query',400);
  await refused('selection',{mode:'selected-new-source',selection,admin:true},'invalid_launch_query',400);
  await refused('selection',{mode:'selected-new-source',selection:{...selection,selectionId:(Number(selection.selectionId.split(':')[0])-61)+':999'}},'expired_selection_request',400);
  const futureInput=await selectedInput273(),beforeFuture=http.length,future=(await fixtureCall('selection',{mode:'selected-future',selection:{...futureInput,selectionId:(Number(futureInput.selectionId.split(':')[0])+4)+':998'}})).selection;
  check('future-skew selection does not mint a page queried before its original start',http.length===beforeFuture&&future.coveredGuids.length===0&&future.page.status==='held');
  check('legacy cursors query smuggling wrong ACK and unsupported admin selection are refused before provider reads',true);
  await fixtureCall('selection-native',{kind:'restore'});
  for(const kind of ['missing','duplicate']){
    await fixtureCall('selection-native',{kind});const input=await selectedInput273(),start=http.length,value=(await fixtureCall('selection',{mode:'selected-'+kind,selection:input})).selection;
    if(kind==='missing')fs.writeFileSync(path.join(out,'selected-held.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    check('selected '+kind+' GUID holds without offset fallback or role reads',http.length===start&&value.coveredGuids.length===0&&value.page.status==='held'&&value.page.heldReasons.includes('selected-target-unavailable'));
    await fixtureCall('selection-native',{kind:'restore'});
  }
  await fixtureCall('selection-native',{kind:'mixed'});
  const mixedInput=await selectedInput273(),mixedStart=http.length,mixed=(await fixtureCall('selection',{mode:'selected-mixed',selection:mixedInput})).selection;
  check('genuine mixed verified/unverified selected page remains promotion-only with exact20GUID coverage',mixed.coveredGuids.length===20&&mixed.page.entitlements.scanned===20&&mixed.page.promotions.length===19&&mixed.page.riskBuffer.length===0&&mixed.page.invites.length===0&&http.length-mixedStart===19);
  await fixtureCall('selection-native',{kind:'restore'});
  await fixtureCall('selection-native',{kind:'rank-complete'});
  const negativeInput=await selectedInput273(),negative=(await fixtureCall('selection',{mode:'selected-negative',selection:negativeInput})).selection;
  check('selected current-rank negative covers its exact GUID without refreshing an obsolete promotion',negative.coveredGuids.includes(negativeInput.targetGuid)&&!negative.page.promotions.some(row=>row.guid===negativeInput.targetGuid)&&negative.page.riskBuffer.length===0&&negative.page.invites.length===0);
  await fixtureCall('selection-native',{kind:'restore'});
  const partialInput=await selectedInput273(0),partialStart=http.length,partial=(await fixtureCall('selection',{mode:'selected-partial',selection:partialInput})).selection;
  fs.writeFileSync(path.join(out,'selected-partial.json'),JSON.stringify(partial,null,2)+'\n',{flag:'wx'});
  const cached=JSON.parse(Buffer.from(partial.page.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.equal(http.length-partialStart,6);assert.equal(cached.version,4);assert.equal(cached.roleReads.length,5);assert.equal(partial.page.nextCursor,null);
  const recovered=(await fixtureCall('selection',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor})).selection;
  check('v4 selected retry reuses only same-context original successes and retains original observation expiry',http.length-partialStart===21&&recovered.page.promotions.length===20&&JSON.stringify(recovered.page.scan)===JSON.stringify(partial.page.scan)&&recovered.page.expiresAt===partial.page.expiresAt&&recovered.page.expiresAt<=Math.min(...cached.roleReads.map(row=>row[2]+600))&&JSON.stringify(recovered.coveredGuids)===JSON.stringify(partial.coveredGuids));
  await refused('selection',{mode:'selected-partial',selection:{...partialInput,targetGuid:'Player-6933-00000002'},cursor:partial.page.pageCursor},'invalid_selection_cursor',400);
  for(const kind of ['shared-secret','legacy-purpose','expired-read'])await refused('selection-boundary',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor,kind},'invalid_selection_cursor',400);
  await refused('selection-boundary',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor,kind:'wrong-guid'},'launch_cursor_role_source_changed',409);
  await refused('selection-boundary',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor,kind:'wrong-offset'},'launch_cursor_source_changed',409);
  check('selected retry derives exact coverage from signed Native digest offset and target before using any cached GUID',true);
  const staleStart=http.length,stale=await fixtureCall('selection-boundary',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor,kind:'expired-role'});
  check('a selected600s observation does not loosen60s retry-cache reuse: original61s-old roles require20fresh GETs',stale.syntheticSignedInputBoundary&&http.length-staleStart===20&&stale.selection.page.promotions.length===20);
  await fixtureCall('source-state',{kind:'identity'});
  const switchStart=http.length,switched=(await fixtureCall('selection',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor})).selection;
  check('selected cached GUID cannot transfer role authority to a changed linked account',http.length-switchStart===16&&http.slice(switchStart).some(row=>row.subject==='800000000000009999')&&switched.page.promotions.find(row=>row.guid===partialInput.targetGuid)?.targetSlot===6);
  await fixtureCall('source-state',{kind:'identity',restore:true});
  await fixtureCall('selection-native',{kind:'drift'});
  await refused('selection',{mode:'selected-partial',selection:partialInput,cursor:partial.page.pageCursor},'launch_cursor_source_changed',409);
  await fixtureCall('selection-native',{kind:'restore'});
  check('selected retry source drift shared-key forgery and cross-purpose contexts stay refused',true);
  for(const kind of ['privacy','denial','native','cutoff','credential','secret','link']){
    const input=await selectedInput273(0),result=(await fixtureCall('selection',{mode:'selected-await-'+kind,selection:input})).selection;
    check('selected original '+kind+' change during provider await yields no overlay authority',inflightMutations.has('selected-'+kind)&&result.coveredGuids.length===0&&result.page.status==='held'&&result.page.promotions.length===0&&result.page.pageCursor===null&&result.page.nextCursor===null);
    await fixtureCall('source-state',{kind,restore:true});
  }
  await fixtureCall('selection-native',{kind:'routine'});
  const cacheInput=await selectedInput273(0),cacheFirst=(await fixtureCall('selection',{mode:'selected-cache-age',selection:cacheInput})).selection;
  const cacheStart=http.length,cacheBoundary=await fixtureCall('selection-boundary',{mode:'selected-cache-age',selection:cacheInput,cursor:cacheFirst.page.pageCursor,kind:'aged-cache'}),cachePage=cacheBoundary.selection.page;
  check('fixture-signed30s-old selected cache retains original90s-old control deadline instead of query-plus600',cacheBoundary.syntheticSignedInputBoundary&&http.length-cacheStart===15&&cachePage.promotions.length===20&&cachePage.fetchedAt-cachePage.scan.startedAt>=90&&cachePage.expiresAt===cachePage.scan.expiresAt&&cachePage.expiresAt===cachePage.scan.startedAt+600&&cachePage.expiresAt<cachePage.fetchedAt+600);
  await fixtureCall('selection-native',{kind:'near-expiry'});
  const nearInput=await selectedInput273(0),near=(await fixtureCall('selection',{mode:'selected-near-expiry',selection:nearInput})).selection;
  check('selected600s policy cannot outlive a native source with only10s remaining',near.page.status!=='held'&&near.page.promotions.length===20&&near.page.expiresAt===nearInput.snapshotAt+600&&near.page.expiresAt===near.page.scan.expiresAt&&near.page.expiresAt-near.page.fetchedAt<=10&&near.page.expiresAt>near.page.fetchedAt);
  await fixtureCall('selection-native',{kind:'restore'});
  const text=Buffer.from(partial.page.pageCursor.split('.')[0],'base64url').toString('utf8');
  check('selected signed context serializes no account IDs credentials or invite traversal',!['800000000000001000','synthetic-roster-pacing','DISCORD_BOT_TOKEN','discordId','discord_id'].some(value=>text.includes(value))&&Object.keys(fresh).sort().join(',')==='controlId,coveredGuids,page,protocol,targetGuid,version');
}
async function run(){
  const seed=await fixtureCall('seed');check('fixture runs inside actual local Workerd with genuine D1',seed.actualLocalWorkerdD1);
  await selectedCursorCapacity273();
  let cursor=null,originalScan,offset=0;const recommendations=new Set(),pages=[];
  do{
    const before=http.length,{page}=await fixtureCall('page',{mode:'full',cursor});pages.push(page);
    assert.equal(page.entitlements.offset,offset);assert.equal(page.entitlements.total,1000);assert.equal(page.entitlements.scanned,20);
    assert.equal(page.entitlements.retryAfterSeconds,null);assert.equal(page.promotions.length,20);assert.equal(page.invites.length,0);
    assert(page.pageCursor&&typeof page.pageCursor==='string');assert.equal(page.snapshotAt,seed.at-120);
    assert(page.expiresAt<=page.fetchedAt+60&&page.scan.expiresAt===seed.at-120+600);
    if(!originalScan)originalScan=page.scan;else assert.deepEqual(page.scan,originalScan);
    for(const row of page.promotions){assert(!recommendations.has(row.guid));recommendations.add(row.guid);assert.equal(row.currentSlot,9);assert.equal(row.targetSlot,8);assert.equal(row.targetName,'Member');}
    assert.equal(http.length-before,20,'each real page uses exactly 20 external role reads');
    cursor=page.nextCursor;offset+=20;
  }while(cursor);
  check('all 50 signed cursor pages cover 1000 unique current native GUID recommendations',pages.length===50&&recommendations.size===1000);
  check('the final native row retains its Member recommendation',recommendations.has('Player-6933-000003e8'));
  check('all source snapshot and 60/600-second deadlines remain original',pages.every(p=>p.snapshotId===1&&p.snapshotAt===seed.at-120&&p.scan.expiresAt===originalScan.expiresAt));
  const full=http.filter(r=>r.mode==='full');
  check('real Discord role reads are serialized',maxActive===1&&full.length===1000);
  const paced=full.filter(r=>r.resetMilliseconds);
  check('fractional successful-response bucket resets are honored before the next dispatch',paced.length>=50&&paced.every(r=>{
    const next=full[full.indexOf(r)+1];return !next||next.started-r.completed>=r.resetMilliseconds-3;
  }));
  const beforePartial=http.length,firstPartial=(await fixtureCall('page',{mode:'partial-recover'})).page;
  assert.equal(http.length-beforePartial,6);assert.equal(firstPartial.promotions.length,5);assert.equal(firstPartial.nextCursor,null);
  const captured=JSON.parse(Buffer.from(firstPartial.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.equal(captured.version,3);assert.equal(captured.roleReads.length,5);assert(captured.roleReads.every(row=>row.length===4));
  const recovered=(await fixtureCall('page',{mode:'partial-recover',cursor:firstPartial.pageCursor})).page;
  assert.equal(http.length-beforePartial,21);assert.equal(recovered.promotions.length,20);assert.deepEqual(recovered.scan,firstPartial.scan);
  assert.equal(recovered.snapshotAt,firstPartial.snapshotAt);assert(recovered.expiresAt<=Math.min(...captured.roleReads.map(row=>row[2]+60)));
  const recoveredCursor=JSON.parse(Buffer.from(recovered.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.deepEqual(recoveredCursor.roleReads,[]);
  const partialHTTP=http.slice(beforePartial);
  check('signed same-page retry reuses only original fresh successes without rereading or renewing them',captured.roleReads.every(row=>{
    const index=parseInt(row[0].split('-').at(-1),16)-1,subject=String(800000000000001000n+BigInt(index));
    return partialHTTP.filter(request=>request.subject===subject).length===1;
  }));
  const beforeRecheck=http.length,rechecked=(await fixtureCall('page',{mode:'partial-recover',cursor:recovered.pageCursor})).page;
  check('a successful same-page cursor requires 20 fresh role reads for an explicit recheck',http.length-beforeRecheck===20&&rechecked.promotions.length===20);
  const beforeStale=http.length,stale=await fixtureCall('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'expired-role'});
  check('synthetic signed-input boundary rereads stale role observations under real clock and source',stale.syntheticSignedInputBoundary&&http.length-beforeStale===20&&stale.page.promotions.length===20);
  const [tamperBody,tamperMAC]=firstPartial.pageCursor.split('.'),tampered=JSON.parse(Buffer.from(tamperBody,'base64url').toString('utf8'));
  tampered.roleReads[0][1]='knight';
  await refused('page',{mode:'partial-recover',cursor:Buffer.from(JSON.stringify(tampered)).toString('base64url')+'.'+tamperMAC},'invalid_launch_cursor',400);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'wrong-guid'},'launch_cursor_role_source_changed',409);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'wrong-role-scope'},'launch_cursor_role_source_changed',409);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'expired-scan'},'expired_or_invalid_launch_cursor',400);
  await refused('page',{mode:'credential-change',cursor:firstPartial.pageCursor},'invalid_launch_cursor',400);
  check('tampered expired wrong-target and credential-mismatched cache cursors are refused before HTTP',true);
  await refused('cursor-boundary',{cursor:firstPartial.pageCursor,kind:'shared-secret-forgery'},'invalid_launch_cursor',400);
  const beforeLegacyMint=http.length,legacyOriginal=(await fixtureCall('legacy-page')).page;
  const legacyBody=JSON.parse(Buffer.from(legacyOriginal.pageCursor.split('.')[0],'base64url').toString('utf8'));
  assert.equal(http.length,beforeLegacyMint);assert.equal(legacyBody.version,1);assert.equal(legacyBody.roleReads,undefined);
  assert.equal(legacyOriginal.promotions.length,0);
  await refused('cursor-boundary',{cursor:legacyOriginal.pageCursor,kind:'legacy-v1-cache-forgery',injectedReads:captured.roleReads},'expired_or_invalid_launch_cursor',400);
  const beforeLegacy=http.length,legacy=(await fixtureCall('page',{mode:'partial-recover',cursor:legacyOriginal.pageCursor})).page;
  check('exact cache-free legacy v1 selection requires fresh genuine role reads',http.length-beforeLegacy===20&&legacy.promotions.length===20&&JSON.stringify(legacy.scan)===JSON.stringify(legacyOriginal.scan));
  assert.equal(JSON.parse(Buffer.from(legacy.pageCursor.split('.')[0],'base64url').toString('utf8')).version,2);
  await refused('cursor-boundary',{cursor:legacy.pageCursor,kind:'shared-secret-forgery'},'invalid_launch_cursor',400);
  check('the shared addon secret cannot mint v2 or v3 cached roles or inject a cache into legacy v1',true);
  for(const kind of ['privacy','link']){
    await fixtureCall('source-state',{kind});
    await refused('page',{mode:'partial-recover',cursor:firstPartial.pageCursor},'launch_cursor_role_source_changed',409);
    await fixtureCall('source-state',{kind,restore:true});
  }
  check('actual D1 privacy or exact-link source change rejects previously valid cached successes',true);
  const cursors=[...pages.flatMap(p=>[p.pageCursor,p.nextCursor]),firstPartial.pageCursor,recovered.pageCursor].filter(Boolean);
  check('serialized cursor data contains no Discord ID or raw fixture credential',cursors.every(cursor=>{
    const text=Buffer.from(cursor.split('.')[0],'base64url').toString('utf8');
    return !['800000000000001000','synthetic-roster-pacing','DISCORD_BOT_TOKEN','discordId','discord_id'].some(value=>text.includes(value));
  }));
  await verificationChurn272();
  for(const [mode,spec] of Object.entries(modes)){
    let samePage=null,sameScan;
    for(let attempt=0;attempt<(mode==='429-persistent'?3:1);attempt++){
      const before=http.length,{page}=await fixtureCall('page',{mode,cursor:samePage});
      assert.equal(page.promotions.length,0);assert.equal(page.invites.length,0);assert.equal(page.entitlements.retryAfterSeconds,spec.expected);
      assert.equal(page.status,'partial');assert(page.heldReasons.includes('discord-rate-limited'));assert(page.pageCursor);assert.equal(page.nextCursor,null);
      assert.equal(http.length-before,1,'429 stops additional role dispatch and never retries within this read');
      if(sameScan)assert.deepEqual(page.scan,sameScan);
      sameScan=page.scan;
      samePage=page.pageCursor;
    }
    check(mode+' takes the greatest header/body/reset delay and stays held without an in-call retry',true);
  }
  const malformed=await fixtureCall('page',{mode:'malformed'});
  check('malformed headers and role bodies cannot invent an entitlement',malformed.page.promotions.length===0&&malformed.page.held.length===20&&malformed.page.entitlements.retryAfterSeconds===null);
  const beforeSlow=http.length,slowStarted=performance.now(),slow=await fixtureCall('page',{mode:'slow-read'}),slowDuration=performance.now()-slowStarted;
  check('real local read window exhaustion is held separately from an upstream Discord 429',slowDuration>=9000&&slowDuration<16000&&http.length-beforeSlow<=10&&slow.page.status==='held'&&slow.page.promotions.length===0&&slow.page.heldReasons.includes('launch-read-window-exhausted')&&!slow.page.heldReasons.includes('discord-rate-limited')&&slow.page.entitlements.retryAfterSeconds===null);
  await selectedReads273(pages[19]);
  await reviewRecords275();
  await fixtureCall('ranks');const beforeSkip=http.length,skip=await fixtureCall('page',{mode:'skip-native'});
  const expected=Array.from({length:7},(_,i)=>'Player-6933-'+(i+1).toString(16).padStart(8,'0'));
  check('exact native ranks 0 through 6 need neither Discord reads nor unknown-entitlement holds',http.length-beforeSkip===13&&skip.page.promotions.length===13&&http.slice(beforeSkip).every(row=>BigInt(row.subject)-800000000000001000n>=7n)&&expected.every(id=>!skip.page.held.some(r=>r.guid===id)&&!skip.page.promotions.some(r=>r.guid===id)));
  const changed=await fixtureCall('page',{mode:'source-change'});
  check('actual D1 native source change during Discord await refuses the whole projection',sourceChanged&&changed.page.status==='held'&&changed.page.promotions.length===0&&changed.page.heldReasons.includes('native-snapshot-changed'));
  const audit=await fixtureCall('audit');for(const item of audit.checks){assert(item.passed);checks.push(item);}
  check('all mocked external traffic is Discord GET only',http.every(r=>r.method==='GET'));
  return {complete:true,actualLocalWorkerdD1:true,checks,syntheticDiscordGETs:http.length,providerCalls:0,pages:pages.length};
}
(async()=>{
  let timer;
  try{
    const sourceSHA256=hashes(),testSHA256=testHashes();
    fs.writeFileSync(path.join(out,'source-sha256.json'),JSON.stringify(sourceSHA256,null,2)+'\n',{flag:'wx'});
    const script=buildSync({entryPoints:[path.join(__dirname,'launch_roster_pacing271_runtime.mjs')],absWorkingDir:root,bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['node:async_hooks'],tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'}).outputFiles[0].text;
    mf=new Miniflare(convertV4MiniflareOptions({rootPath:out,script,modules:true,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.NONE),logRequests:false,telemetry:{enabled:false},unsafeRegisterWorker:false,unsafeLocalExplorer:false,unsafeObservability:false,d1Databases:{DB:'roster-pacing271'},resourceTmpPath:path.join(out,'tmp'),resourcePersistencePath:path.join(out,'persist'),isolatedResourcePersistencePath:path.join(out,'isolated'),outboundService:async request=>{
      const url=new URL(request.url),match=url.pathname.match(/^\/api\/v10\/guilds\/800000000000000001\/members\/(\d{18})$/),mode=(request.headers.get('Authorization')||'').replace('Bot synthetic-roster-pacing-','');
      assert.equal(url.origin,'https://discord.com');assert.equal(url.search,'');assert.equal(request.method,'GET');assert(match);
      const index=BigInt(match[1])-800000000000001000n;assert(index>=0n&&index<1000n||match[1]==='800000000000009999');
      const n=(perMode.get(mode)||0)+1;perMode.set(mode,n);
      const row={mode,method:request.method,subject:match[1],started:performance.now(),completed:0,resetMilliseconds:mode==='full'&&n%10===0?30:0};http.push(row);
      active++;maxActive=Math.max(maxActive,active);
      try{
        await new Promise(resolve=>setTimeout(resolve,mode==='slow-read'?1000:2)); // real external latency, never a fake clock
        if(mode==='source-change'&&!sourceChanged){sourceChanged=true;await fixtureCall('source-change');}
        if(mode==='link-churn'&&index>=40n&&index<60n&&!unrelatedChanged){
          unrelatedChanged=true;
          await fixtureCall('source-state',{kind:'link',index:5});await fixtureCall('source-state',{kind:'link',index:950});
        }
        if(mode.startsWith('await-')&&!inflightMutations.has(mode.slice(6))){
          const kind=mode.slice(6);inflightMutations.add(kind);await fixtureCall('source-state',{kind});
        }
        if(mode.startsWith('selected-await-')&&!inflightMutations.has('selected-'+mode.slice(15))){
          const kind=mode.slice(15);inflightMutations.add('selected-'+kind);await fixtureCall('source-state',{kind});
        }
        if(mode.startsWith('review-await-')&&!inflightMutations.has('review-'+mode.slice(13))){
          const kind=mode.slice(13);inflightMutations.add('review-'+kind);await fixtureCall('review-records275',{action:'mutate',kind:kind==='anchor'?'anchor-digest':kind});
        }
        const reviewLimit=mode==='review-records-cache'&&[1,7,8].includes(n)?(n===1?{header:'2.2',body:2.2,reset:'2.2'}:{header:'0.03',body:0.03,reset:'0.03'}):null;
        const limited=reviewLimit??((['partial-recover','identity-switch','selected-partial','selected-cache-age'].includes(mode)&&n===6||mode==='selected-late-limit'&&n===20)?{header:'0.03',body:0.03,reset:'0.03'}:modes[mode]);
        if(limited)return Response.json({retry_after:limited.body,global:false},{status:429,headers:{'Retry-After':limited.header,'X-RateLimit-Reset-After':limited.reset}});
        return Response.json({user:{id:match[1]},roles:mode==='malformed'?'invalid-role-body':match[1]==='800000000000009999'?['1299841745550311535']:[]},{headers:mode==='malformed'?{'X-RateLimit-Remaining':'not-a-number','X-RateLimit-Reset-After':'Infinity'}:row.resetMilliseconds?{'X-RateLimit-Remaining':'0','X-RateLimit-Reset-After':'0.03'}:{'X-RateLimit-Remaining':'1','X-RateLimit-Reset-After':'0'}});
      }finally{row.completed=performance.now();active--;}
    }}));
    const result=await Promise.race([run(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('roster pacing qualification exceeded 170 seconds')),170000);})]);
    assert.deepEqual(hashes(),sourceSHA256,'source files changed during qualification');
    assert.deepEqual(testHashes(),testSHA256,'test files changed during qualification');
    result.sourceSHA256=sourceSHA256;result.testSHA256=testSHA256;result.bundleSHA256=createHash('sha256').update(script).digest('hex');
    result.elapsedSeconds=(performance.now()-started)/1000;
    fs.writeFileSync(path.join(out,'runtime-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    for(const item of result.checks)console.log('PASS '+item.name);
    console.log('ROSTER_PACING271_RESULT '+JSON.stringify({...result,checks:undefined,passed:result.checks.length,evidence:out}));
  }finally{
    clearTimeout(timer);if(mf)await mf.dispose();
    fs.writeFileSync(path.join(out,'synthetic-http.json'),JSON.stringify(http,null,2)+'\n',{flag:'wx'});
  }
})().catch(error=>{console.error(error);console.error('ROSTER_PACING271_EVIDENCE '+out);process.exitCode=1;});
