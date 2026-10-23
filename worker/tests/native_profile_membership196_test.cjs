// Real source, installed Native entry epoch and admitted SQLite writes. Current queue producers
// plus read-only settlement of synthetic pre-existing historical A rows. Discord is simulated;
// no role PUT/DELETE, schema change or profile/signature activation is authorized by this fixture.
'use strict';
const assert = require('node:assert/strict');
const H = require('./helpers/beta_item15_harness.cjs');
const M = H.NEW, native = M.load('native-rank-adapter'), qr = M.load('qr-phase1');
let passed = 0;
function check(name, value) { assert.ok(value, name); passed++; console.log('PASS ' + name); }
const oldNames = Array.from(qr.NATIVE_RANKS);
const choices = [
  { profile: 'ten-rank-treasurer-v1', names: Array.from(qr.TREASURER_NATIVE_RANKS) },
  { profile: 'ten-rank-council-treasurer-v1', names: Array.from(qr.COUNCIL_TREASURER_NATIVE_RANKS) },
];
const map = (profile, roles = H.LABELS) => JSON.stringify({ profile, roles: Array.from(roles) });
async function world(names, raw, { partial = false, privileged = false, transition = false, mapping = true } = {}) {
  const s = await H.freshEntry(M, {
    // The original non-transition writer is enabled by erasure. Transition configuration
    // already validates a supplied native map, so its historical failure is tested separately.
    PRIVACY_ERASURE_ENABLED: 'true', QR_RANK_MAPPING_ENABLED: mapping ? 'true' : 'false', QR_NATIVE_ROLE_MAP: raw,
    ...(transition ? { MEMBERSHIP_ROLE_SETTLEMENT_ENABLED: 'true', MEMBERSHIP_RETIRED_ROLE_ID: H.FRESH } : {}),
    ...(privileged ? { QR_PRIVILEGED_RANK_MAPPING_ENABLED: 'true' } : {}),
  });
  // The shared current-entry helper deliberately applies erasure-OFF after its inputs.
  // Enable only this synthetic queue-producer world's intended erasure-backed writer.
  s.env.PRIVACY_ERASURE_ENABLED = 'true';
  const membershipPolicy = M.load('membership-role-transition');
  assert.equal(s.env.PRIVACY_ERASURE_ENABLED, 'true');
  assert.equal(membershipPolicy.membershipSettlementEnabled(s.env), true);
  assert.equal(membershipPolicy.membershipTransitionEnabled(s.env), transition);
  assert.equal(s.env.DB, s.admitted, 'original admitted Native database must be retained');
  const indices = partial ? [7, 2, 9, 8] : names.map((_, index) => index);
  await s.write("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,content_hash,complete,trusted) VALUES(1,?,?,'test',?,'fixture',1,1)", H.clockState.now, H.clockState.now, indices.length);
  for (const index of indices) await s.write('INSERT INTO roster_members(snapshot_id,name_key,name,rank,rank_index,guid) VALUES(1,?,?,?,?,?)',
    index === 7 ? 'actual member' : 'profile ' + index, index === 7 ? 'Actual Member' : 'Profile ' + index,
    names[index], index, index === 7 ? H.GUID : 'Player-1234-' + String(index + 20).padStart(8, '0'));
  s.trace.length = 0; s.requests.length = 0;
  return s;
}
const membership = s => M.rs.queueRosterMembershipRole(s.env, H.SUBJECT, 1, H.G);
const rankRows = s => s.db.prepare("SELECT * FROM role_settlements WHERE purpose IN('roster_native_rank','roster_privileged_rank') ORDER BY id").all();
const allRows = s => s.db.prepare('SELECT * FROM role_settlements ORDER BY id').all();
async function withWorld(names, raw, options, run) {
  const s = await world(names, raw, options);
  try { await run(s); check('queue-only world makes no provider calls', s.requests.length === 0); }
  finally { s.db.close(); }
}
(async () => {
  const legacyPartial = [7, 2, 9, 8].map(rank_index => ({ rank: oldNames[rank_index], rank_index }));
  check('historical partial roster still identifies ten-rank by default', native.identifyNativeProfile(legacyPartial) === 'ten-rank');
  const invalidOld = ['{', '{}', '[]', map('unknown-profile'), map('ten-rank', H.LABELS.slice(1)), map('ten-rank', [H.TWELVE[0], ...H.LABELS.slice(1)])];
  for (const raw of invalidOld) await withWorld(oldNames, raw, { partial: true }, async s => {
    const id = await membership(s), row = H.row(s, id);
    check('legacy malformed/unknown map does not newly gate membership: ' + raw.slice(0, 45), row?.purpose === 'roster_membership' && row.native_profile === 'ten-rank');
    await assert.rejects(() => M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G));
    check('bad legacy native map still refuses native rows before effects', rankRows(s).length === 0);
  });
  for (const raw of invalidOld) await withWorld(oldNames, raw, { partial: true, transition: true }, async s => {
    await assert.rejects(() => membership(s));
    check('historical transition map validation remains held for invalid old configuration', allRows(s).length === 0);
  });
  for (const choice of choices) {
    const rejectedCurrentA=choice.profile==='ten-rank-treasurer-v1';
    const compatibilityMap=native.parseNativeRoleMap(map(choice.profile));
    const compatibilityRows=choice.names.map((rank,rank_index)=>({rank,rank_index}));
    check('historical named profile parser and every exact ordinal remain available: '+choice.profile,compatibilityMap.profile===choice.profile&&compatibilityMap.roles.length===10&&choice.names.every((name,index)=>native.mappedNativeRole(name,index,compatibilityMap)===H.LABELS[index])&&native.identifyConfiguredNativeProfile(compatibilityRows,compatibilityMap)===choice.profile);
    assert.throws(()=>native.identifyConfiguredNativeProfile(oldNames.map((rank,rank_index)=>({rank,rank_index})),compatibilityMap),/native_profile_name_index_mismatch/);
    assert.throws(()=>native.privilegedNativeMap(choice.profile,{ROLE_GUILD_LEADER:H.TWELVE[0],ROLE_OFFICER:H.TWELVE[1],ROLE_RAID_LEADER:H.TWELVE[2]}),/privileged_rank_profile_not_qualified/);
    check('historical name/index contradiction and privileged gate remain exact: '+choice.profile,true);
    await withWorld(oldNames, map(choice.profile), { partial: true, mapping: false }, async s => {
      const id = await membership(s);
      check('disabled mapping cannot select ' + choice.profile + ' over the historical default', H.row(s, id)?.native_profile === 'ten-rank');
      await assert.rejects(() => M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G), /rank_mapping_disabled_or_invalid/);
      check('disabled configured mapping queues no native roles', rankRows(s).length === 0);
    });
    for (const partial of [false, true]) await withWorld(choice.names, map(choice.profile), { partial }, async s => {
      if(rejectedCurrentA) {
        await assert.rejects(()=>membership(s),/native_profile_not_current/);
        await assert.rejects(()=>M.rs.queueRosterRankRoles(s.env,H.SUBJECT,1,H.G),/native_profile_not_current/);
        check('rejected ladder A cannot create current membership or native rank intents '+partial,allRows(s).length===0);
      } else {
        const id = await membership(s);
        check('explicit ' + choice.profile + ' membership stores its exact profile ' + partial, H.row(s, id)?.native_profile === choice.profile);
        const ids = await M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G), rows = rankRows(s);
        check('explicit ' + choice.profile + ' queues only ten configured native roles ' + partial, ids.length === 10 && rows.length === 10 && rows.every(r => r.purpose === 'roster_native_rank' && r.native_profile === choice.profile && H.LABELS.includes(r.role_id)));
        check('explicit configured Member slot has one desired native grant ' + partial, rows.filter(r => r.desired === 1).length === 1 && rows.some(r => r.role_id === H.LABELS[7] && r.desired === 1));
      }
    });
    for (const raw of [map(choice.profile, H.LABELS.slice(1)), map(choice.profile, [H.TWELVE[0], ...H.LABELS.slice(1)]), JSON.stringify({ profile: choice.profile, roles: H.LABELS, extra: true })])
      await withWorld(choice.names, raw, {}, async s => {
        await assert.rejects(() => membership(s));
        await assert.rejects(() => M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G));
        check('explicit new invalid map never falls back to legacy membership or rank rows', allRows(s).length === 0);
      });
    await withWorld(choice.names, map(choice.profile), { privileged: true }, async s => {
      await assert.rejects(() => M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G), rejectedCurrentA ? /native_profile_not_current/ : /privileged_rank_profile_not_qualified/);
      check('new native profile never qualifies privileged role rows', rankRows(s).length === 0);
    });
    await withWorld(oldNames, map(choice.profile), {}, async s => {
      await assert.rejects(() => membership(s), rejectedCurrentA ? /native_profile_not_current/ : /native_profile_name_index_mismatch/);
      check('explicit map does not reinterpret a contradictory historical whole ladder', allRows(s).length === 0);
    });
    await withWorld(choice.names, map(choice.profile), {}, async s => {
      await s.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", H.SUBJECT);
      await assert.rejects(() => membership(s), rejectedCurrentA ? /native_profile_not_current/ : /membership_currentness_changed/);
      await assert.rejects(() => M.rs.queueRosterRankRoles(s.env, H.SUBJECT, 1, H.G), /subject_held/);
      check('new configured profile retains original retiring-subject SQL and rank admission fences', allRows(s).length === 0);
    });
  }
  // A zero-permission role can still carry staff/channel authority. Reject every configured
  // reserved identity before a new native intent; retain the independent ten-rank membership path.
  const reservedKeys=['GUILD_ID','SITE_GUILD_ID','DISCORD_APP_ID','ROLE_GUILD_MEMBER','MEMBERSHIP_RETIRED_ROLE_ID','ROLE_OFFICER','ROLE_MODERATOR','ROLE_GUILD_LEADER','ROLE_GUILD_MASTER','ROLE_RAID_LEADER','LINK_ROLE_ID','BLOCKING_ROLE_IDS','INTROS_ROLES'];
  const currentB=choices.find(choice=>choice.profile==='ten-rank-council-treasurer-v1');
  for(const choice of [{profile:'ten-rank',names:oldNames},currentB])for(const key of reservedKeys){
    // Put the original configured identity into the map where it is present, or configure a
    // synthetic reserved identity when the optional value is absent. No provider is contacted.
    const probe=await world(choice.names,map(choice.profile));
    try{
      const rawValue=key==='BLOCKING_ROLE_IDS'||key==='INTROS_ROLES'?'  '+H.LABELS[0]+' , '+H.FRESH:probe.env[key]||H.LABELS[0];
      const collision=(key==='BLOCKING_ROLE_IDS'||key==='INTROS_ROLES')?H.LABELS[0]:String(rawValue).trim();
      probe.env[key]=rawValue;
      const labels=Array.from(H.LABELS);labels[0]=collision;
      probe.env.QR_NATIVE_ROLE_MAP=map(choice.profile,labels);
      if(choice.profile==='ten-rank'){
        const id=await membership(probe);
        check('legacy membership stays independent of reserved native map '+key,H.row(probe,id)?.purpose==='roster_membership');
      }else{
        await assert.rejects(()=>membership(probe),/rank_mapping_configuration/);
        check('current B membership cannot select reserved native role '+key,allRows(probe).length===0);
      }
      await assert.rejects(()=>M.rs.queueRosterRankRoles(probe.env,H.SUBJECT,1,H.G),/rank_mapping_configuration/);
      check('reserved '+key+' refuses every native intent for '+choice.profile,rankRows(probe).length===0);
      check('reserved-map refusal makes no simulated provider request',probe.requests.length===0);
    }finally{probe.db.close();}
  }
  // Historical rows are setup only, never created through a rejected current-A producer.
  // These direct calls exercise the original central custody paths around the new-dispatch hold.
  const historicalA=choices.find(choice=>choice.profile==='ten-rank-treasurer-v1');
  const stableIntent=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['state','reason','checked_at'].includes(key)));
  const historicalCases=[
    {name:'unspent pending A cannot dispatch',state:'pending',attempts:0,present:false,reconcileOnly:false,stale:false,expectedState:'held',expectedReason:'native_profile_not_current',unchanged:true},
    {name:'spent A absent reconciliation stays unknown without retry',state:'unknown',attempts:1,present:false,reconcileOnly:true,stale:false,expectedState:'unknown',expectedReason:'explicit_reconciliation_required',unchanged:true},
    {name:'spent A current fresh presence keeps the original receipt path',state:'unknown',attempts:1,present:true,reconcileOnly:true,stale:false,expectedState:'settled',expectedReason:'fresh_server_confirmed',unchanged:false},
    {name:'spent A stale proof keeps the original absence-only receipt',state:'unknown',attempts:1,present:false,reconcileOnly:true,stale:true,expectedState:'held',expectedReason:'past_effect_absent',unchanged:false},
  ];
  for(const scenario of historicalCases){
    const s=await world(historicalA.names,map(historicalA.profile));
    try{
      const id='7'.repeat(32),nonce=scenario.attempts?'4'.repeat(32):null;
      await s.write("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,created_at,expires_at,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,claim_nonce) VALUES(?,?,'roster_native_rank',?,?,1,?,'original_fixture_custody',?,?,?,?,?,?,7,'Member',?,?)",
        id,H.SUBJECT,s.env.GUILD_ID,H.LABELS[7],scenario.state,H.G,H.clockState.now-20,H.clockState.now+280,1,H.GUID,historicalA.profile,scenario.attempts,nonce);
      if(scenario.stale)await s.write('UPDATE roster_snapshots SET trusted=0 WHERE id=1');
      s.members[H.SUBJECT]=scenario.present?[H.LABELS[7]]:[];
      const original=H.row(s,id);
      assert.equal(original.native_profile,historicalA.profile);
      assert.equal(original.attempts,scenario.attempts);
      s.trace.length=0;s.requests.length=0;
      const outcome=await M.rs.settleRoleIntent(s.env,id,scenario.reconcileOnly);
      const retained=H.row(s,id);
      check(scenario.name+': exact central outcome',outcome.operationId===id&&outcome.state===scenario.expectedState&&outcome.reason===scenario.expectedReason);
      if(scenario.unchanged){
        assert.deepEqual(retained,original);
        check(scenario.name+': original row is byte-for-byte scalar-identical',true);
      }else{
        assert.deepEqual(stableIntent(retained),stableIntent(original));
        check(scenario.name+': only original receipt fields change, with exact custody/deadlines retained',retained.state===scenario.expectedState&&retained.reason===scenario.expectedReason&&retained.checked_at===H.clockState.now&&retained.attempts===1&&retained.claim_nonce===nonce);
      }
      check(scenario.name+': no new CAS claim or second operation',allRows(s).length===1&&!s.trace.some(call=>call.sql.includes("SET state='dispatching',attempts=1")));
      const expectedPaths=['/api/v10/users/@me','/api/v10/guilds/'+s.env.GUILD_ID+'/roles','/api/v10/guilds/'+s.env.GUILD_ID+'/members/'+H.BOT,'/api/v10/guilds/'+s.env.GUILD_ID+'/members/'+H.SUBJECT];
      assert.deepEqual(s.requests.map(request=>request.path),expectedPaths);
      assert.deepEqual(s.unexpected,[]);
      check(scenario.name+': exactly four simulated inventory GETs and no role effect',H.onlyGets(s)&&H.puts(s).length===0&&H.deletes(s).length===0&&JSON.stringify(s.members[H.SUBJECT])===JSON.stringify(scenario.present?[H.LABELS[7]]:[]));
    }finally{s.db.close();}
  }
  check('all current QR signer and historical native arrays remain the original named observation', qr.SIGNER_NATIVE_RANKS === qr.NATIVE_RANKS && qr.QR_PROFILE.revision === 'forever-beta-pvp2-v1');
  console.log('native profile membership196: ' + passed + '/' + passed + ' passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => H.restore());
