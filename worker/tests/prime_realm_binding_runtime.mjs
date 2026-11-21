import worker from '../src/index.ts';
import {ADMISSION_EXPECTED_JSON,ADMISSION_PROTOCOL,ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {admitPrimeRoster,recordPrimeBinding} from '../src/prime-realm-binding.ts';
import {captureLaunchVerification,captureNativeMembershipProof,verifyNativeMembershipProof,captureLaunchMembershipSource} from '../src/launch-verification227.ts';
import {NATIVE_GUILD232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {STEWARD_RANK_NAMES} from '../src/native-rank-schemes.ts';
import {REFRESH_ROSTER_SNAPSHOT,START_ROSTER_SNAPSHOT,COMPLETE_ROSTER_SNAPSHOT} from '../src/roster.ts';

const EPOCH='a'.repeat(32), token='synthetic-roster-only-bearer-for-this-fixture';
const names=['Fixture Master','Ñò Example','Other Member','Fourth Member','Fifth Member','Sixth Member'];
const members=names.map((name,i)=>({name,guid:'Player-9999-'+String(i+1).padStart(8,'0'),
  rankIndex:i?8:0,rank:i?'Member':'Guild Master'}));
const rankTable={version:1,names:STEWARD_RANK_NAMES};
const marker={version:1,kind:'prime-guild-master',observerGuid:members[0].guid};
const scope={version:1,...NATIVE_SCOPE232};
const endpoint='/ingest/roster?keyVersion=native-roster-v2';

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
    const layout=new URL(request.url).pathname==='/recorded-live'?'recorded-live-pre-seal-20261017':'canonical';
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
      missingRealm:{nativeRealm:undefined},missingTotal:{nativeRosterTotal:undefined},incomplete:{nativeRosterTotal:7},
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
    await reject('Smaller previously trusted guild snapshot cannot be truncated',{...again,exportedAt:t-40,
      members:changed.slice(0,-1),nativeRosterTotal:5},{},422);
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
    return Response.json({checks});
  } catch(error) { return Response.json({checks,error:String(error?.stack??error)},{status:500}); }
}};
