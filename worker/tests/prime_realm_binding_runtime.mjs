import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {admitPrimeRoster,recordPrimeBinding} from '../src/prime-realm-binding.ts';
import {LAUNCH_OPERATIONS_PROTOCOL229,DISCOVERY_OPERATIONS_PROTOCOL235} from '../src/launch-operations229.ts';
import {captureLaunchVerification,captureNativeMembershipProof,verifyNativeMembershipProof,captureLaunchMembershipSource} from '../src/launch-verification227.ts';
import {NATIVE_GUILD232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {STEWARD_RANK_NAMES} from '../src/native-rank-schemes.ts';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
import {REFRESH_ROSTER_SNAPSHOT,START_ROSTER_SNAPSHOT,COMPLETE_ROSTER_SNAPSHOT} from '../src/roster.ts';

const EPOCH='a'.repeat(32), token='synthetic-roster-only-bearer-for-this-fixture';
const names=['Fixture Master','Ñò Example','Other Member','Fourth Member','Fifth Member','Sixth Member','Ordinary Member','Unlinked Member'];
const members=names.map((name,i)=>({name,guid:'Player-9999-'+String(i+1).padStart(8,'0'),
  rankIndex:i>=2&&i<=4?9:i?8:0,rank:i>=2&&i<=4?'Initiate':i?'Member':'Guild Master'}));
const rankTable={version:1,names:STEWARD_RANK_NAMES};
const marker={version:1,kind:'prime-guild-master',observerGuid:members[0].guid};
const scope={version:1,...NATIVE_SCOPE232};
const endpoint='/ingest/roster?keyVersion=native-roster-v2';

async function checkSelected(check,env,writer,snapshot,ctx,refreshNamed) {
  const selectedEnv={...env,SITE_GUILD_ID:CANONICAL_GUILD233,DISCORD_BOT_TOKEN:'synthetic-blank-selected',
    CANONICAL_RANKS233:JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:CANONICAL_GUILD233,
      ranks:CANONICAL_RANKS233.map(row=>({...row,permissions:'0'}))})};
  const targets=members.slice(2,6),at=Math.floor(Date.now()/1000);
  // Two verified Initiates (a Knight and non-Knight), an unverified Initiate,
  // and a verified Member whose selection became stale. Only the first two qualify.
  for(const [index,id] of [[2,'800000000000000012'],[3,'800000000000000013'],[5,'800000000000000015'],[6,'800000000000000016']]){
    const row=members[index];
    await writer.DB.batch([writer.DB.prepare('INSERT INTO members(discord_id) VALUES(?1)').bind(id),
      writer.DB.prepare(`INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)
        VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)`).bind(row.name.toLowerCase(),row.name,id,at-55,row.guid)]);
  }
  const query={keyVersion:LAUNCH_OPERATIONS_PROTOCOL229,selectionId:at+':17',targetGuids:JSON.stringify(targets.map(row=>row.guid)),
    actorGuid:members[0].guid,snapshotId:String(snapshot.id),snapshotAt:String(snapshot.exported_at),confirmations:'[]',primeBinding:marker.kind};
  const read=async(params={},bearer=token)=>{
    const q=new URLSearchParams({...query,...params});
    for(const [k,v] of Object.entries(params))if(v===null)q.delete(k);
    const response=await worker.fetch(new Request('https://verify.example/queue/launch-operations?'+q,
      {headers:{Authorization:'Bearer '+bearer}}),selectedEnv,ctx);
    return {status:response.status,body:response.headers.get('Content-Type')?.includes('application/json')
      ?await response.json():await response.text()};
  };
  const before=await writer.DB.prepare('SELECT name_key,guid,status FROM characters ORDER BY name_key').all();
  const result=await read(),page=result.body.page;
  check('Attended blank-realm selected read serves both verified Initiates and only their sealed original recommendations',
    result.status===200&&result.body.coveredGuids.join()===targets.map(row=>row.guid).join()&&page.promotions.length===2&&
    [[2,'verified-initiate',8],[3,'knight-veteran',6]].every(([i,reason,slot])=>page.promotions.some(r=>r.guid===members[i].guid&&
      r.reason===reason&&r.currentSlot===9&&r.targetSlot===slot&&r.intent.actorGuid===members[0].guid&&r.intent.acknowledgedSteps===0&&
      r.intent.originSnapshotId===snapshot.id&&r.intent.originSnapshotAt===snapshot.exported_at&&typeof r.intentToken==='string')),result);
  check('Mixed selection holds unverified or changed-rank rows independently, with zero invitation, purge or automatic actions',
    page.held.some(r=>r.guid===members[4].guid&&r.reason==='unverified-initiate')&&
    page.held.some(r=>r.guid===members[5].guid&&r.reason==='selected-rank-changed')&&
    !page.actions.automatic&&!page.actions.roleGrants&&!page.actions.removals&&page.actions.requiresNativeRecheck&&
    !page.invites.length&&!page.riskBuffer.length,page.held);
  check('Selected read left all character links intact',JSON.stringify((await writer.DB.prepare('SELECT name_key,guid,status FROM characters ORDER BY name_key').all()).results)===JSON.stringify(before.results));
  const denied=await read({actorGuid:members[1].guid});
  check('Blank selected read requires enrolled GM',denied.body.page?.heldReasons.includes('promotion-actor-unconfirmed'),denied);
  const stale=await read({snapshotAt:String(snapshot.exported_at-1)});
  check('Selected read requires the exact ACK export clock',stale.status===409,stale);
  const readWithoutMark=await read({primeBinding:null,cursor:page.pageCursor});
  check('A blank-realm cursor cannot be replayed through the ordinary selection route',readWithoutMark.status===400,readWithoutMark);
  const narrowed=await read({targetGuids:JSON.stringify([members[2].guid]),cursor:page.pageCursor});
  check('Changing the selected GUIDs invalidates the signed continuation cursor',narrowed.status===400,narrowed);
  const continued=await read({cursor:page.pageCursor});
  check('A fresh retry of the same marked selection returns the matching GUIDs',continued.status===200&&continued.body.page?.promotions.length===2,continued);
  const confirmation=await read({targetGuids:JSON.stringify([members[3].guid]),confirmations:JSON.stringify([{
    guid:members[3].guid,token:page.promotions.find(r=>r.guid===members[3].guid).intentToken,from:9,to:8,observedAt:at}])});
  check('Blank initial check cannot continue officer rank steps',confirmation.status===400,confirmation);
  const onlyMember={primeBinding:'prime-guild-master-member',targetGuids:JSON.stringify([members[5].guid])};
  const knight=await read(onlyMember),memberPromotion=knight.body.page?.promotions[0];
  check('Attended Member check binds one fresh Knight entitlement to the enrolled GM and exact current Member',
    knight.status===200&&knight.body.coveredGuids.join()===members[5].guid&&knight.body.page.promotions.length===1&&
    memberPromotion.currentSlot===8&&memberPromotion.targetSlot===6&&memberPromotion.reason==='knight-veteran'&&
    memberPromotion.intent.startSlot===8&&memberPromotion.intent.acknowledgedSteps===0&&memberPromotion.intent.actorGuid===members[0].guid&&
    memberPromotion.intent.originSnapshotId===snapshot.id&&!!memberPromotion.intentToken&&!knight.body.page.actions.automatic,knight);
  for(const [label,params] of [['automatic',{...onlyMember,autoInitiates:'1'}],['bulk',{primeBinding:onlyMember.primeBinding}]]){
    const refused=await read(params);
    check('Single Member protocol refuses '+label,refused.status===400,refused);
  }
  for(const [label,params] of [['another observer',{...onlyMember,actorGuid:members[1].guid}],
    ['an Initiate',{...onlyMember,targetGuids:JSON.stringify([members[2].guid])}]]){
    const refused=await read(params);
    check('Single Member protocol holds '+label,refused.body.page?.status==='held'&&!refused.body.page.promotions.length,refused);
  }
  const swap=await read({...onlyMember,cursor:page.pageCursor});
  check('Bulk and single Member cursors cannot be exchanged',swap.status===400,swap);
  const stripped=await read({...onlyMember,primeBinding:null});
  check('Stripping the binding cannot borrow a blank roster through a named attended read',stripped.body.page?.status==='held'&&
    !stripped.body.page.promotions.length,stripped);
  selectedEnv.DISCORD_BOT_TOKEN='synthetic-without-knight';
  const ordinaryMember=await read(onlyMember);
  check('Member without live Knight standing receives no recommendation',ordinaryMember.body.coveredGuids.join()===members[5].guid&&
    !ordinaryMember.body.page.promotions.length,ordinaryMember);
  selectedEnv.DISCORD_BOT_TOKEN='synthetic-blank-selected';
  const veteranTargets=members.slice(5).map(row=>row.guid);
  const group={memberChecks:'1',primeBinding:'prime-guild-master-members',targetGuids:JSON.stringify(veteranTargets)};
  function checkVeteranGroup(label,result,clock) {
    const data=result.body.page,row=data?.promotions[0];
    check(label,result.status===200&&result.body.coveredGuids?.join()===veteranTargets.join()&&data.promotions.length===1&&
      row.guid===members[5].guid&&row.currentSlot===8&&row.targetSlot===6&&row.reason==='knight-veteran'&&
      row.intent.originSnapshotId===snapshot.id&&row.intent.originSnapshotAt===clock&&row.intent.actorGuid===members[0].guid&&
      row.intent.acknowledgedSteps===0&&row.intentToken&&data.expiresAt<=clock+600&&data.actions.requiresNativeRecheck&&
      !data.actions.automatic&&!data.actions.roleGrants&&!data.actions.removals&&!data.invites.length&&!data.riskBuffer.length,result);
  }
  const checkedGroup=await read(group);
  checkVeteranGroup('One enrolled blank-realm Veteran check handles a Knight, non-Knight and unlinked Member independently',
    checkedGroup,snapshot.exported_at);
  const memberStep={guid:memberPromotion.guid,token:memberPromotion.intentToken,from:8,to:7,observedAt:at};
  const confirmUnderGroup=await read({...group,targetGuids:onlyMember.targetGuids,confirmations:JSON.stringify([memberStep])});
  check('A plural Member check cannot consume even one signed previous step',confirmUnderGroup.status===400,confirmUnderGroup);
  for(const [label,variation] of [
    ['an invalid toggle',{memberChecks:'yes'}],['a missing Veteran toggle',{memberChecks:null}],
    ['Initiate background mode',{autoInitiates:'1'}],['an Initiate marker',{primeBinding:marker.kind}],
    ['a single-Member marker on a batch',{primeBinding:'prime-guild-master-member'}],
      ['a queued single-Member continuation with no observed step',{...onlyMember,memberChecks:'1'}],
    ['a previous unrelated cursor',{cursor:page.pageCursor}],
    ['an expired original request',{selectionId:(at-600)+':20'}],
    ['an expired original observation',{snapshotAt:String(at-600)}],
  ]){
    const rejected=await read({...group,...variation});
    check('Veteran batch refuses '+label,rejected.status===400,rejected);
  }
  for(const [label,variation] of [
    ['an unenrolled officer',{actorGuid:members[1].guid}],['a stripped blank-realm binding',{primeBinding:null}],
    ['a now-Initiate target',{targetGuids:JSON.stringify([members[2].guid,...veteranTargets])}],
    ['a missing target',{targetGuids:JSON.stringify([...veteranTargets,'Player-9999-FFFFFFFF'])}],
  ]){
    const rejected=await read({...group,...variation});
    check('Veteran batch holds '+label,rejected.body.page?.status==='held'&&!rejected.body.page.promotions.length,rejected);
  }
  const wrongAuth=await read(group,'wrong-fixture-token');
  check('Bulk Veteran check requires the Watcher credential',wrongAuth.status===401,wrongAuth);
  const earlierRead=await read({...group,snapshotAt:String(snapshot.exported_at-1)});
  check('Bulk Veteran check refuses a changed ACK clock',earlierRead.status===409,earlierRead);
  const discovery=await read({keyVersion:DISCOVERY_OPERATIONS_PROTOCOL235});
  check('The marker grants no discovery read',discovery.status===400,discovery);
  const beforeNamed=await writer.DB.prepare('UPDATE roster_snapshots SET exported_at=exported_at+1 WHERE id=?1').bind(snapshot.id).run();
  const noReceipt=await read({snapshotAt:String(snapshot.exported_at+1)});
  check('A later same-ID clock without its own blank-realm receipt cannot authorize a selected read',
    beforeNamed.meta.changes===1&&noReceipt.body.page?.status==='held'&&!noReceipt.body.page?.promotions.length,noReceipt);
  await writer.DB.prepare('UPDATE roster_snapshots SET exported_at=?1 WHERE id=?2').bind(snapshot.exported_at,snapshot.id).run();
  // The provider fixture advances the same snapshot clock while this
  // request is reading Discord. The second D1 read must consume the receipt again.
  selectedEnv.DISCORD_BOT_TOKEN='synthetic-advance-roster-during-discord';
  const raced=await read({targetGuids:JSON.stringify([members[2].guid])});
  check('Same-ID refresh during the Discord read holds the entire result before any intent is issued',
    raced.body.page?.heldReasons.includes('native-snapshot-changed')&&!raced.body.page.promotions.length,raced);
  await writer.DB.prepare('UPDATE roster_snapshots SET exported_at=?1 WHERE id=?2').bind(snapshot.exported_at,snapshot.id).run();

  selectedEnv.DISCORD_BOT_TOKEN='synthetic-blank-selected';
  const automatic={autoInitiates:'1'};
  const unauthorized=await read(automatic,'invalid-fixture-bearer');
  check('Automatic reads require the Watcher credential',unauthorized.status===401,unauthorized);
  const missingScope=await read({...automatic,primeBinding:null});
  check('Automatic named mode cannot read a blank-realm observation without its GM binding',
    missingScope.body.page?.status==='held'&&!missingScope.body.page.promotions.length,missingScope);
  const wrongActor=await read({...automatic,actorGuid:members[1].guid});
  check('A blank-realm automatic request requires the enrolled GM',
    wrongActor.body.page?.heldReasons.includes('promotion-actor-unconfirmed'),wrongActor);
  const pending=members[4];
  await writer.DB.prepare('INSERT INTO pending(discord_id,name_key,name,created_at,expires_at) VALUES(?1,?2,?3,?4,?5)')
    .bind('800000000000000014',pending.name.toLowerCase(),pending.name,at-10,at+300).run();
  const assertAutoPage=(label,response)=>{
    const page=response.body.page;
    check(label,response.status===200&&response.body.coveredGuids.join()===queryGuids.join()&&
      page.promotions.length===2&&[[2,'verified-initiate',8],[3,'knight-veteran',6]].every(([index,reason,slot])=>
        page.promotions.some(r=>r.guid===members[index].guid&&r.currentSlot===9&&r.targetSlot===slot&&r.reason===reason&&
          r.intent.actorGuid===members[0].guid&&r.intent.acknowledgedSteps===0))&&
      page.held.some(r=>r.guid===pending.guid&&r.reason==='pending-verification')&&
      page.held.some(r=>r.guid===members[5].guid&&r.reason==='selected-rank-changed')&&
      page.actions.requiresNativeRecheck&&!page.actions.automatic&&!page.actions.roleGrants&&!page.actions.removals&&
      !page.invites.length&&!page.riskBuffer.length,response);
  };
  const queryGuids=targets.map(r=>r.guid);
  const currentAuto=await read(automatic);
  assertAutoPage('Blank-realm automatic read yields only verified Initiate recommendations and holds pending or changed ranks',currentAuto);
  for(const [label,params] of [
    ['manual cursor in automatic mode',{...automatic,cursor:page.pageCursor}],
    ['automatic cursor in manual mode',{cursor:currentAuto.body.page.pageCursor}],
    ['automatic cursor with stripped realm binding',{...automatic,cursor:currentAuto.body.page.pageCursor,primeBinding:null}],
  ]){
    const deniedCursor=await read(params);
    check('Refuses '+label,deniedCursor.status===400&&deniedCursor.body.error==='invalid_selection_cursor',deniedCursor);
  }
  const late={selectionId:(at-90)+':18'};
  const lateAuto=await read({...automatic,...late});
  assertAutoPage('An automatic selection older than sixty seconds can finish within its original freshness window',lateAuto);
  check('Background result expires at the earlier original clock',lateAuto.body.page.expiresAt===Math.min(at-90,snapshot.exported_at)+600,lateAuto);
  const lateManual=await read(late);
  check('The attended initial request still expires after sixty seconds',
    lateManual.status===400&&lateManual.body.error==='expired_selection_request',lateManual);
  for(const [label,clock] of [['control',{selectionId:(at-600)+':19'}],['source',{snapshotAt:String(at-600)}]]){
    const expired=await read({...automatic,...clock});
    check('Automatic admission rejects a '+label+' clock at least 600 seconds old',
      expired.status===400&&expired.body.error==='expired_selection_request',expired);
  }
  const confirmInput={targetGuids:JSON.stringify([members[3].guid]),confirmations:JSON.stringify([{
    guid:members[3].guid,token:currentAuto.body.page.promotions.find(r=>r.guid===members[3].guid).intentToken,from:9,to:8,observedAt:at}])};
  const named=await refreshNamed();
  check('A genuine named upload refreshes its original snapshot with a distinct clock',named.id===snapshot.id&&named.exported_at>snapshot.exported_at,named);
  const namedQuery={...automatic,primeBinding:null,snapshotAt:String(named.exported_at)};
  assertAutoPage('Named-realm background read enforces the same per-Initiate eligibility and click restrictions',await read(namedQuery));
  const namedGroup={...group,primeBinding:null,snapshotAt:String(named.exported_at)};
  checkVeteranGroup('One named-realm Veteran batch serves only the Knight and requires the same separate officer click',
    await read(namedGroup),named.exported_at);
  for(const [label,params] of [['named',namedQuery],['blank',automatic]]){
    const confirmed=await read({...params,...confirmInput});
    check('Automatic '+label+' selections refuse even a valid prior step confirmation',
      confirmed.status===400&&confirmed.body.error==='invalid_selection_request',confirmed);
  }
  const addedMarker=await read({...namedQuery,primeBinding:marker.kind});
  check('A named automatic selection cannot acquire a blank GM binding by adding a marker',
    addedMarker.body.page?.status==='held'&&!addedMarker.body.page.promotions.length,addedMarker);
  check('Automatic eligibility never changes the native character links',
    JSON.stringify((await writer.DB.prepare('SELECT name_key,guid,status FROM characters ORDER BY name_key').all()).results)===JSON.stringify(before.results));
  return async next=>{
    const params={...onlyMember,snapshotId:String(next.id),snapshotAt:String(next.exported_at)};
    const noOwner=await read(params);
    check('Current Alt cannot start a Knight promotion',noOwner.body.page?.heldReasons.includes('selected-target-unavailable')&&
      !noOwner.body.page.promotions.length,noOwner);
    const prior={guid:members[5].guid,token:memberPromotion.intentToken,from:8,to:7,observedAt:memberPromotion.intent.issuedAt};
    const bad=await read({...params,confirmations:JSON.stringify([{...prior,token:prior.token.slice(0,-64)+'0'.repeat(64)}])});
    check('A different seal cannot carry an Alt to Veteran',!bad.body.page?.promotions.length&&
      bad.body.page?.held.some(r=>r.reason==='same-intent-continuation-held'),bad);
    const nextStep=await read({...params,confirmations:JSON.stringify([prior])}),row=nextStep.body.page?.promotions[0];
    check('Only the signed original Knight step continues after the newer native Alt observation',row?.currentSlot===7&&
      row.targetSlot===6&&row.intent.id===memberPromotion.intent.id&&row.intent.acknowledgedSteps===1&&
      row.intent.expiresAt===memberPromotion.intent.expiresAt&&row.intent.lastSnapshotId===next.id,nextStep);
    const attended=await read({...params,memberChecks:'1',confirmations:JSON.stringify([prior])}),continued=attended.body.page?.promotions[0];
    check('A single owned Veteran continuation in memberChecks mode retains its original seal lineage and expiry',
      continued?.guid===members[5].guid&&continued.intent.id===memberPromotion.intent.id&&continued.intent.acknowledgedSteps===1&&
      continued.intent.expiresAt===memberPromotion.intent.expiresAt&&!attended.body.page.actions.automatic,attended);
  };
}

async function install(db,layout) {
  const c=layout==='canonical'?JSON.parse(ADMISSION_EXPECTED_JSON):JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
  const statements=[...c.tables,...c.indexes].map(x=>db.prepare(x.sql));
  statements.push(db.prepare(c.slotSQL));
  while(statements.length)await db.batch(statements.splice(0,40));
  await db.batch([
    db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL,EPOCH),
    db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
    db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',unixepoch())"),
  ]);
  const triggers=c.triggers.map(x=>db.prepare(x.sql));
  while(triggers.length)await db.batch(triggers.splice(0,40));
}

export default {async fetch(request,bindings,ctx) {
  const checks=[],db=bindings.DB;
  const check=(name,value,detail)=>{if(!value)throw Error(name+' '+JSON.stringify(detail));checks.push(name);};
  try {
    const path=new URL(request.url).pathname;
    const layout=path.endsWith('/recorded-live')?'recorded-live-pre-seal-20261017':'canonical';
    if(path.startsWith('/fixture-advance/')){
      const writer=createPrivacyWriteAdmissionDatabase(db,'writer',layout,EPOCH);
      await writer.prepare('UPDATE roster_snapshots SET exported_at=exported_at+1 WHERE id=(SELECT MAX(id) FROM roster_snapshots)').run();
      return new Response(null,{status:204});
    }
    await install(db,layout);
    const t=Math.floor(Date.now()/1000);
    const env={DB:db,PUBLIC_BASE_URL:'https://verify.example',SITE_HOST:'guild.example',GUILD_ID:NATIVE_GUILD232,
      WATCHER_TOKEN:token,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),VERIFY_MEMBERSHIP_ONLY:'true',
      VERIFY_SECRET:'fixture-member-secret',LINKS_NOT_BEFORE:String(t-2000),ROSTER_MIN_MEMBERS:'4',ROSTER_MAX_SHRINK_PCT:'10',
      PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:layout,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH};
    const named={exportedAt:t-150,nativeGuild:scope.guild,nativeRealm:scope.realm,nativeRankTable:rankTable,members};
    const body={...named,exportedAt:t-100,nativeRealm:'',nativeScopeBinding:marker,nativeRosterTotal:members.length};
    const call=async (b,opts={})=>{
      const response=await worker.fetch(new Request('https://verify.example'+(opts.path??endpoint),{method:'POST',
        headers:{Authorization:'Bearer '+(opts.token??token),'Content-Type':'application/json'},body:JSON.stringify(b)}),{...env,...opts.env},ctx);
      return {status:response.status,body:await response.text()};
    };
    const latest=()=>db.prepare('SELECT id,source,exported_at,member_count,complete,trusted FROM roster_snapshots ORDER BY id DESC LIMIT 1').first();
    const witness=async()=>JSON.stringify([await latest(),await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='roster.prime_realm_binding'").first()]);
    const reject=async(name,b,opts={},status=409)=>{
      const before=await witness(),response=await call(b,opts);
      check(name,response.status===status&&await witness()===before,response);
    };
    await reject('A blank roster cannot establish the first canonical baseline',body);
    const original=await call(named),base=await latest();
    check('Normal named realm upload creates trusted canonical snapshot',original.status===200&&base?.trusted===1&&base?.complete===1,original);
    if (new URL(request.url).pathname==='/production') {
      await reject('Unmodified production enrollment refuses the synthetic guild master',body);
      return Response.json({checks});
    }
    await reject('A named upload cannot stand in for an attested same-second replay',{...body,exportedAt:named.exportedAt},{},422);
    await reject('Authenticated transport is required',body,{token:'wrong'},401);
    await reject('Unversioned roster refuses marker',body,{path:'/ingest/roster'});
    await reject('Legacy membership mode refuses marker',body,{env:{VERIFY_MEMBERSHIP_ONLY:'false'}},400);
    await reject('Unscoped legacy collector refuses marker',body,{env:{VERIFY_MEMBERSHIP_ONLY:'false'},path:'/ingest/roster'});
    await reject('Nonblank conflicting realm with a marker is refused',{...body,nativeRealm:'Other Realm'});
    await reject('Nonblank configured realm with a marker is refused',{...body,nativeRealm:scope.realm});
    await reject('Different server refused',body,{env:{GUILD_ID:'800000000000000001'}});
    await reject('Different configured realm refused',body,{env:{VERIFY_NATIVE_SCOPE:JSON.stringify({...scope,realm:'Other Realm'})}});
    await reject('Different guild refused',{...body,nativeGuild:'Olympus'},{env:{VERIFY_NATIVE_SCOPE:JSON.stringify({...scope,guild:'Olympus'})}});
    for (const [label,changed] of Object.entries({
      absent:{nativeScopeBinding:undefined},extra:{nativeScopeBinding:{...marker,extra:true}},malformed:{nativeScopeBinding:null},
      version:{nativeScopeBinding:{...marker,version:'1'}},kind:{nativeScopeBinding:{...marker,kind:'officer'}},
      guessed:{nativeScopeBinding:{...marker,observerGuid:members[1].guid}},
      missingRealm:{nativeRealm:undefined},missingTotal:{nativeRosterTotal:undefined},incomplete:{nativeRosterTotal:members.length+1},
      future:{exportedAt:t+100},expired:{exportedAt:t-601},notObserved:{nativeRankTable:false},
      duplicateGuid:{members:members.map((m,i)=>i===3?{...m,guid:members[1].guid}:m)},
      noGM:{members:members.map(m=>({...m,rank:'Member',rankIndex:8}))},
      twoGMs:{members:members.map((m,i)=>i===2?{...m,rank:'Guild Master',rankIndex:0}:m)},
      changedGM:{members:members.map((m,i)=>i===0?{...m,guid:'Player-9999-FFFFFFFF'}:m)},
      unrelatedGuild:{members:members.map((m,i)=>i>0?{...m,guid:'Player-1111-'+String(i).padStart(8,'0')}:m)},
    }))await reject('Binding refuses '+label,{...body,...changed});
    const changed=members.map((m,i)=>i===1?{...m,rankIndex:6,rank:'Veteran'}:m);
    const admitted=await call({...body,members:changed}),first=await latest();
    check('Changed complete roster is admitted with canonical source',admitted.status===200&&first.id!==base.id&&first.source===base.source&&
      first.trusted===1&&first.complete===1&&first.exported_at===body.exportedAt,admitted);
    const read=await db.prepare('SELECT name,rank,rank_index FROM roster_members WHERE snapshot_id=?1 AND guid=?2').bind(first.id,members[1].guid).first();
    check('Accented member retains exact spelling, GUID and observed new rank',read?.name===names[1]&&read?.rank==='Veteran'&&read?.rank_index===6,read);
    const display=await worker.fetch(new Request('https://verify.example/queue/unverified?keyVersion=launch-roster-display-v2',
      {headers:{Authorization:'Bearer '+token}}),env,ctx),report=await display.json();
    check('Strict v2 display reads the fresh accented character under the canonical PRIME scope',display.status===200&&
      report.snapshotAt===first.exported_at&&report.realm===scope.realm&&report.unverified?.some(row=>row.name===names[1]&&row.guid===members[1].guid),report);
    const hex=value=>Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('');
    const encoder=new TextEncoder(),mode=captureLaunchVerification(env),code='ABC2345',nameKey='Ñò example';
    const scopeHash=hex(await crypto.subtle.digest('SHA-256',encoder.encode('native-scope|1|'+scope.guild+'|'+scope.realm))).slice(0,16);
    const hmac=await crypto.subtle.importKey('raw',encoder.encode(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const mac=hex(await crypto.subtle.sign('HMAC',hmac,encoder.encode(['membership',1,nameKey,members[1].guid,code,1,t,scopeHash].join('|')))).slice(0,32);
    const signed=captureNativeMembershipProof({version:1,member:true,observedAt:t,scopeHash,mac});
    const proof=await verifyNativeMembershipProof(env,mode,signed,names[1],members[1].guid,code);
    const joined=proof&&captureLaunchMembershipSource(env,mode,{snapshotId:first.id,exportedAt:first.exported_at,guid:members[1].guid,source:first.source},nameKey,proof);
    check('Existing per-character membership HMAC and GUID join accept the accented member under canonical scope',joined?.snapshotId===first.id&&joined?.nameKey===nameKey);
    check('Different spelling cannot reuse the accented character membership proof',await verifyNativeMembershipProof(env,mode,signed,'No Example',members[1].guid,code)===null);
    const again={...body,members:changed,exportedAt:t-60};
    const writer={...env,DB:createPrivacyWriteAdmissionDatabase(db,'writer',layout,EPOCH)};
    const earlierNamedRefresh=writer.DB.prepare(REFRESH_ROSTER_SNAPSHOT)
      .bind(first.id,t-70,t,1,String(first.id),1);
    const earlierChangedNamedUpload=writer.DB.prepare(START_ROSTER_SNAPSHOT)
      .bind(t-70,t,first.source,changed.length,'fixture-changed-fingerprint',first.id,first.exported_at,first.source,first.complete,first.trusted);
    const refreshed=await call(again),current=await latest();
    check('An unchanged roster refresh keeps its canonical snapshot ID',refreshed.status===200&&current.id===first.id&&current.exported_at===again.exportedAt,refreshed);
    check('Older named refresh captured before the marked refresh cannot move its clock backwards',
      !await earlierNamedRefresh.first()&&(await latest()).exported_at===again.exportedAt);
    const staleInsert=await earlierChangedNamedUpload.run();
    check('Earlier changed named upload cannot allocate a later snapshot ID after the marked refresh',
      staleInsert.meta.changes===0&&(await latest()).id===first.id&&(await latest()).exported_at===again.exportedAt);
    const audit=()=>db.prepare("SELECT subject,details FROM audit WHERE action='roster.prime_realm_binding' ORDER BY id").all();
    const auditRows=(await audit()).results,details=auditRows.map(row=>JSON.parse(row.details));
    check('Changed and unchanged observations each preserve raw blank and predecessor in a snapshot-bound audit',auditRows.length===2&&
      auditRows.every(row=>row.subject===String(first.id))&&details.every(d=>d.nativeRealm===''&&d.kind===marker.kind&&d.version===1)&&
      details[0].previousSnapshot===base.id&&details[1].previousSnapshot===first.id&&details[0].exportedAt===body.exportedAt&&
      details[1].exportedAt===again.exportedAt&&!JSON.stringify(details).includes(marker.observerGuid),{auditRows,base,first,at:body.exportedAt,refreshed:again.exportedAt});
    const retry=await call(again);
    check('Identical replay preserves clocks and does not duplicate the binding audit',retry.status===200&&
      (await latest()).exported_at===again.exportedAt&&(await audit()).results.length===2,retry);
    const checkNextMemberStep=await checkSelected(check,env,writer,current,ctx,async()=>{
      const response=await call({...named,members:changed,exportedAt:current.exported_at+1});
      check('Named background fixture uploads through the native ingestion route',response.status===200,response);
      return latest();
    });
    await reject('Smaller previously trusted guild snapshot cannot be truncated',{...again,exportedAt:t-40,
      members:changed.slice(0,-1),nativeRosterTotal:changed.length-1},{},422);
    const priorAdmission=await admitPrimeRoster(writer,mode.scope,{...again,exportedAt:t-25});
    check('Genuine D1 preflight observes existing trusted predecessor',!!priorAdmission);
    const alternate=await call({...named,exportedAt:t-30,members:members.map((m,i)=>i===0?{...m,guid:'Player-1111-FFFFFFFF'}:m)});
    check('A subsequent normal realm observation can report a leader change',alternate.status===200,alternate);
    const staleCompletion=await writer.DB.prepare(COMPLETE_ROSTER_SNAPSHOT).bind(first.id,0).run();
    check('An older storage writer cannot finish its superseded snapshot after recovery',
      staleCompletion.meta.changes===0&&(await db.prepare('SELECT trusted FROM roster_snapshots WHERE id=?1').bind(first.id).first()).trusted===1);
    await reject('Latest trusted predecessor must still name the enrolled guild master',{...again,exportedAt:t-20});
    const beforeRace=await witness();
    let aborted=false;
    try {
      await writer.DB.batch([
        writer.DB.prepare("INSERT INTO audit(ts,actor,action,subject) VALUES(unixepoch(),'fixture','test.binding_race','rollback')"),
        recordPrimeBinding(writer,priorAdmission,current.id,t-25,changed.length),
      ]);
    } catch {aborted=true;}
    check('A competing completed export after admission rolls back the entire attempted audit transaction',aborted&&
      await witness()===beforeRace&&!(await db.prepare("SELECT id FROM audit WHERE action='test.binding_race'").first()));
    const last=await latest();
    const interrupted=await writer.DB.prepare(START_ROSTER_SNAPSHOT).bind(t-16,t,last.source,members.length,'fixture-interrupted',
      last.id,last.exported_at,last.source,last.complete,last.trusted).run();
    const incomplete=Number(interrupted.meta.last_row_id),recovery={...named,exportedAt:t-10};
    const duringGrace=await call(recovery);
    check('An in-progress write still holds the next ordinary export for retry',duringGrace.status>=500&&(await latest()).id===incomplete,duringGrace);
    await writer.DB.prepare('UPDATE roster_snapshots SET first_received_at=?1 WHERE id=?2').bind(t-700,incomplete).run();
    const recovered=await call(recovery),recoveryRow=await latest();
    check('Ordinary export rebuilds an interrupted snapshot after its grace',recovered.status===200&&recoveryRow.id>incomplete&&
      recoveryRow.complete===1&&recoveryRow.trusted===1&&recoveryRow.exported_at===recovery.exportedAt,recovered);
    const updated=await call({...body,exportedAt:Math.floor(Date.now()/1000),members:members.map((m,i)=>i===5?{...m,rank:'Alt',rankIndex:7}:m)});
    check('Attended Member step test uses a newly accepted current blank-realm roster',updated.status===200,updated);
    await checkNextMemberStep(await latest());
    return Response.json({checks});
  } catch(error) { return Response.json({checks,error:String(error?.stack??error)},{status:500}); }
}};
