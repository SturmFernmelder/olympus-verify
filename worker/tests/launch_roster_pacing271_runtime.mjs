// Genuine Workerd/D1 fixture. Only the runner's external Discord HTTP is synthetic.
import {readLaunchOperations229,readPromotionSelection273,handleLaunchOperations229} from '../src/site-launch229.ts';
import {captureLaunchVerification} from '../src/launch-verification227.ts';
import {ADMISSION_EXPECTED_JSON, ADMISSION_PROTOCOL} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {strictRosterDisplay} from '../src/unverified.ts';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import worker from '../src/index.ts';
import {countingD1, fullScans, scanCounts} from './d1_statement_budget.mjs';
import {CANONICAL233_SWEEP249_SELECT, NATIVE232_SWEEP249_SELECT} from '../src/full-release-roles.ts';
import {ROSTER_INGEST_STATEMENTS} from '../src/scheduled-budget.ts';

const EPOCH = 'a'.repeat(32);
const MODES = new Set(['full', 'partial-recover', 'credential-change', 'slow-read', '429-body', '429-header', '429-reset', '429-persistent',
  'malformed', 'skip-native', 'source-change', 'link-churn', 'identity-switch',
  'await-privacy', 'await-denial', 'await-native', 'await-cutoff', 'await-credential', 'await-secret']);
let fixture;
const proofSQL = 'SELECT name_key,name,discord_id,status,bound_at,verified_at,source,guid FROM characters ORDER BY name_key';
const effectSQL = 'SELECT (SELECT COUNT(*) FROM role_settlements) roles,(SELECT COUNT(*) FROM invite_queue) invites,(SELECT COUNT(*) FROM pending) pending';
const checks = [];
const check = (name, value) => { if (!value) throw Error(name); checks.push({name, passed: true}); };
const REVIEW_ANCHOR = index => 'c'.repeat(30) + index.toString(16).padStart(2, '0');
const REVIEW_NEW_ANCHOR = 'd'.repeat(32);

// Synthetic source facts in physical D1, never production repair authority.
async function reviewRecords275(action, input) {
  const {env,db,rows}=fixture,at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
  if(action==='setup'){
    if(fixture.review275)throw Error('review fixture already active');
    const snapshot=await db.prepare('SELECT source,exported_at,trusted FROM roster_snapshots WHERE id=1').first();
    fixture.review275={snapshot,env:Object.fromEntries(['GUILD_ID','CANONICAL_RANKS233','NATIVE_RANK_SYNC232','VERIFY_NATIVE_SCOPE'].map(key=>[key,{present:Object.hasOwn(env,key),value:env[key]}]))};
    env.GUILD_ID=CANONICAL_GUILD233;
    env.CANONICAL_RANKS233=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:CANONICAL_GUILD233,ranks:CANONICAL_RANKS233.map(rank=>({...rank,permissions:'0'}))});
    env.VERIFY_NATIVE_SCOPE=JSON.stringify({version:1,...NATIVE_SCOPE232});
    const launch=captureLaunchVerification(env),statements=[
      env.DB.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=1').bind(launch.scope.provenance),
      ...[0,3,4,5,6,7,8,9].map(index=>env.DB.prepare('UPDATE characters SET bound_at=?1,verified_at=?1 WHERE name_key=?2').bind(fixture.at-7200,rows[index].key)),
      ...[1,2].map(index=>env.DB.prepare("UPDATE characters SET status='unbound',guid=NULL WHERE name_key=?1").bind(rows[index].key)),
      env.DB.prepare("INSERT INTO pending(discord_id,name_key,name,created_at,expires_at,nonce) VALUES(?1,?2,?3,?4,?5,'review275-pending')").bind(rows[2].subject,rows[2].key,rows[2].name,at-1,at+300),
      env.DB.prepare('INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?1,?2,?2,1)').bind(rows[6].subject,at),
      env.DB.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'retiring',0,?3,?3)").bind(rows[7].subject,'b'.repeat(32),at),
      env.DB.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,guid,nonce,state,decided_by,decided_at) VALUES(?1,?2,?2,?3,?4,'review275-rename','reapply',?5,?6)").bind(rows[8].subject,rows[8].name,rows[8].key,rows[8].guid,rows[0].subject,at),
    ];
    for(const index of [0,3,4,5,6,7,8])statements.push(env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,created_at,expires_at,checked_at)
      VALUES(?1,?2,'canonical_routine233',?3,?4,1,'settled','canonical233_observed_without_dispatch',?5,?6,1,?7,?8,9,'Initiate',0,?9,?10,?11)`)
      .bind(REVIEW_ANCHOR(index),rows[index].subject,CANONICAL_GUILD233,CANONICAL_RANKS233[11].roleId,index===4?'e'.repeat(32):[0,7].includes(index)?'b'.repeat(32):null,index===3?'malformed-digest':'c'.repeat(64),rows[index===5?9:index].guid,CANONICAL_PROFILE233,at-5,at+295,at-4));
    await env.DB.batch(statements);
    fixture.review275.originalAnchor=await db.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(REVIEW_ANCHOR(0)).first();
    return {complete:true,actualLocalWorkerdD1:true,syntheticSourceFacts:true,guids:rows.slice(0,11).map(row=>row.guid)};
  }
  if(!fixture.review275)throw Error('review fixture not active');
  if(action==='mutate'){
    const {kind,restore=false}=input;
    if(kind==='anchor-restore'){
      const a=fixture.review275.originalAnchor;
      await env.DB.prepare('UPDATE role_settlements SET subject=?1,native_guid=?2,role_id=?3,native_rank=?4,native_rank_name=?5,request_digest=?6,subject_generation=?7,created_at=?8,expires_at=?9,checked_at=?10 WHERE id=?11')
        .bind(a.subject,a.native_guid,a.role_id,a.native_rank,a.native_rank_name,a.request_digest,a.subject_generation,a.created_at,a.expires_at,a.checked_at,a.id).run();
    }else if(kind.startsWith('anchor-')){
      const fields={
        'anchor-subject':['subject',rows[1].subject],'anchor-guid':['native_guid',rows[1].guid],
        'anchor-role':['role_id','800000000000009998'],'anchor-rank':['native_rank_name','Member'],
        'anchor-digest':['request_digest','malformed-digest'],'anchor-generation':['subject_generation','e'.repeat(32)],
      };
      if(fields[kind]){
        const [column,value]=fields[kind];await env.DB.prepare('UPDATE role_settlements SET '+column+'=?1 WHERE id=?2').bind(value,REVIEW_ANCHOR(0)).run();
      }else if(kind==='anchor-precutoff')await env.DB.prepare('UPDATE role_settlements SET created_at=?1,checked_at=?2,expires_at=?3 WHERE id=?4').bind(fixture.at-7200,fixture.at-7199,fixture.at-6900,REVIEW_ANCHOR(0)).run();
      else if(kind==='anchor-historical'){
        await env.DB.prepare('UPDATE role_settlements SET created_at=?1,checked_at=?2,expires_at=?3 WHERE id=?4').bind(fixture.at-900,fixture.at-899,fixture.at-600,REVIEW_ANCHOR(0)).run();
        const anchor=await db.prepare('SELECT created_at,checked_at,expires_at FROM role_settlements WHERE id=?1').bind(REVIEW_ANCHOR(0)).first();
        return {complete:true,postCutoff:anchor.created_at>=Number(env.LINKS_NOT_BEFORE),originalIntervalSeconds:anchor.expires_at-anchor.created_at,originalCheckWithinInterval:anchor.checked_at>=anchor.created_at&&anchor.checked_at<anchor.expires_at,originalIntervalExpired:anchor.expires_at<at};
      }
      else if(kind==='anchor-future')await env.DB.prepare('UPDATE role_settlements SET created_at=?1,checked_at=?2,expires_at=?3 WHERE id=?4').bind(at+30,at+31,at+330,REVIEW_ANCHOR(0)).run();
      else if(kind==='anchor-interval')await env.DB.prepare('UPDATE role_settlements SET expires_at=created_at WHERE id=?1').bind(REVIEW_ANCHOR(0)).run();
      else throw Error('unknown anchor mutation');
    }else if(kind==='newer-anchor')await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,created_at,expires_at,checked_at) SELECT ?1,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,?2,?3,?4 FROM role_settlements WHERE id=?5`).bind(REVIEW_NEW_ANCHOR,at-1,at+299,at,REVIEW_ANCHOR(0)).run();
    else if(kind==='remove-old-anchor')await env.DB.prepare('DELETE FROM role_settlements WHERE id=?1').bind(REVIEW_ANCHOR(0)).run();
    else if(kind==='generation')await env.DB.prepare('UPDATE privacy_subjects SET generation=?1 WHERE subject_id=?2').bind((restore?'b':'e').repeat(32),rows[0].subject).run();
    else if(kind==='owner-conflict'){
      if(restore)await env.DB.prepare("DELETE FROM characters WHERE name_key='review275 current owner'").run();
      else await env.DB.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) VALUES('review275 current owner','Review275 Current Owner',?1,'member',?2,?2,'whisper',?3)").bind(rows[999].subject,at-1,rows[1].guid).run();
    }else if(kind==='denial')await env.DB.prepare('UPDATE site_users SET denied=?1 WHERE discord_id=?2').bind(restore?0:1,rows[0].subject).run();
    else if(kind==='privacy')await env.DB.prepare('UPDATE privacy_subjects SET state=?1 WHERE subject_id=?2').bind(restore?'active':'retiring',rows[0].subject).run();
    else if(kind==='rename'){
      if(restore)await env.DB.prepare("DELETE FROM rename_holds WHERE nonce='review275-target-rename'").run();
      else await env.DB.prepare("INSERT INTO rename_holds(discord_id,old_name,new_name,char_key,guid,nonce,state,decided_by,decided_at) VALUES(?1,?2,?2,?3,?4,'review275-target-rename','reapply',?1,?5)").bind(rows[0].subject,rows[0].name,rows[0].key,rows[0].guid,at).run();
    }else if(kind==='native-duplicate')await env.DB.prepare('UPDATE roster_members SET guid=?1 WHERE snapshot_id=1 AND name_key=?2').bind(restore?rows[11].guid:rows[0].guid,rows[11].key).run();
    else if(kind==='stale')await env.DB.prepare('UPDATE roster_snapshots SET exported_at=?1 WHERE id=1').bind(restore?fixture.review275.snapshot.exported_at:at-3601).run();
    else if(kind==='scope'){
      env.VERIFY_NATIVE_SCOPE=restore?JSON.stringify({version:1,...NATIVE_SCOPE232}):fixture.review275.env.VERIFY_NATIVE_SCOPE.value;
      await env.DB.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=1').bind(captureLaunchVerification(env).scope.provenance).run();
    }else if(kind==='config')env.CANONICAL_RANKS233=restore?JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:CANONICAL_GUILD233,ranks:CANONICAL_RANKS233.map(rank=>({...rank,permissions:'0'}))}):'off';
    else if(kind==='native-config'){
      if(!restore)env.NATIVE_RANK_SYNC232='off';
      else {const saved=fixture.review275.env.NATIVE_RANK_SYNC232;if(saved.present)env.NATIVE_RANK_SYNC232=saved.value;else delete env.NATIVE_RANK_SYNC232;}
    }
    else throw Error('unknown review mutation');
    return {complete:true};
  }
  if(action==='read'){
    env.DISCORD_BOT_TOKEN='synthetic-roster-pacing-'+(input.mode??'review-records');
    const observe=async()=>JSON.stringify({proofs:(await db.prepare(proofSQL).all()).results,effects:await db.prepare(effectSQL).first(),settlements:(await db.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results});
    const original=await observe(),display=await strictRosterDisplay(env,captureLaunchVerification(env),'launch-roster-display-v2');
    const selection=input.selection?await readPromotionSelection273(env,input.selection,input.cursor??null):null;
    const page=selection?selection.page:await readLaunchOperations229(env,input.cursor??null);
    return {complete:true,actualLocalWorkerdD1:true,display,page,selection,readOnlySourceUnchanged:original===await observe()};
  }
  if(action==='restore'){
    await env.DB.batch([
      ...rows.slice(0,10).map(row=>env.DB.prepare("UPDATE characters SET status='member',guid=?1,bound_at=?2,verified_at=?2 WHERE name_key=?3").bind(row.guid,fixture.at-60,row.key)),
      env.DB.prepare("DELETE FROM characters WHERE name_key='review275 current owner'"),
      env.DB.prepare("DELETE FROM pending WHERE nonce='review275-pending'"),env.DB.prepare("DELETE FROM rename_holds WHERE nonce IN('review275-rename','review275-target-rename')"),
      env.DB.prepare('DELETE FROM site_users WHERE discord_id=?1').bind(rows[6].subject),env.DB.prepare('DELETE FROM privacy_subjects WHERE subject_id=?1').bind(rows[7].subject),
      env.DB.prepare("UPDATE privacy_subjects SET generation=?1,state='active' WHERE subject_id=?2").bind('b'.repeat(32),rows[0].subject),
      env.DB.prepare('DELETE FROM role_settlements WHERE id IN(SELECT value FROM json_each(?1))').bind(JSON.stringify([...Array.from({length:10},(_,i)=>REVIEW_ANCHOR(i)),REVIEW_NEW_ANCHOR])),
      env.DB.prepare('UPDATE roster_snapshots SET source=?1,exported_at=?2,trusted=?3 WHERE id=1').bind(fixture.review275.snapshot.source,fixture.review275.snapshot.exported_at,fixture.review275.snapshot.trusted),
      env.DB.prepare('UPDATE roster_members SET guid=?1 WHERE snapshot_id=1 AND name_key=?2').bind(rows[11].guid,rows[11].key),
      env.DB.prepare('UPDATE site_users SET denied=0 WHERE discord_id=?1').bind(rows[0].subject),
    ]);
    for(const [key,value]of Object.entries(fixture.review275.env)){if(value.present)env[key]=value.value;else delete env[key];}
    fixture.review275=null;
    return {complete:true,originalProofsRestored:fixture.originalProofs===JSON.stringify((await db.prepare(proofSQL).all()).results),originalEffectsRestored:fixture.originalEffects===JSON.stringify(await db.prepare(effectSQL).first())};
  }
  throw Error('unknown review action');
}

// `record` receives the seed checks: the promotion fixture's go to the module list, the budget database's to its own
// list under their own names, so neither is counted twice (12 Nov review of CL2-024).
async function seed(db, record = check) {
  const catalogue = JSON.parse(ADMISSION_EXPECTED_JSON);
  const install = [...catalogue.tables, ...catalogue.indexes].map(row => db.prepare(row.sql));
  install.push(db.prepare(catalogue.slotSQL));
  while (install.length) await db.batch(install.splice(0, 40));
  const at = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
  const env = {DB: null, VERIFY_MEMBERSHIP_ONLY: 'true',
    VERIFY_NATIVE_SCOPE: JSON.stringify({version: 1, guild: 'OLYMPUS PRIME', realm: 'Fixture Realm'}),
    VERIFY_SECRET: 'synthetic-roster-pacing-only', LINKS_NOT_BEFORE: String(at - 3600),
    SITE_GUILD_ID: '800000000000000001', DISCORD_BOT_TOKEN: 'synthetic-roster-pacing-full',
    PRIVACY_WRITE_ADMISSION_ENABLED: 'true', PRIVACY_WRITE_ADMISSION_LAYOUT: 'canonical',
    PRIVACY_WRITE_ADMISSION_EPOCH: EPOCH};
  const launch = captureLaunchVerification(env);
  record('actual exact native capture admits only the synthetic fixture scope', launch.mode === 'members-only' && launch.current());
  const rows = Array.from({length: 1000}, (_, i) => ({
    name: 'Pacing Member ' + String(i).padStart(4, '0'),
    key: 'pacing member ' + String(i).padStart(4, '0'),
    subject: String(800000000000001000n + BigInt(i)),
    guid: 'Player-6933-' + (i + 1).toString(16).padStart(8, '0'),
  }));
  const json = JSON.stringify(rows);
  await db.batch([
    db.prepare("INSERT INTO privacy_write_admission VALUES(1,?1,0,'','',0,0,?2,'serving')").bind(ADMISSION_PROTOCOL, EPOCH),
    db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
    db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('auditTypedNames','115',?1)").bind(at),
    db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,complete,trusted) VALUES(1,?1,?1,?1,?2,1000,1,1)").bind(at - 120, launch.scope.provenance),
    db.prepare("INSERT INTO members(discord_id,banned) SELECT json_extract(value,'$.subject'),0 FROM json_each(?1)").bind(json),
    db.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level) SELECT 1,json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.guid'),'Initiate',9,60 FROM json_each(?1)").bind(json),
    db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) SELECT json_extract(value,'$.key'),json_extract(value,'$.name'),json_extract(value,'$.subject'),'member',?2,?2,'whisper',json_extract(value,'$.guid') FROM json_each(?1)").bind(json, at - 60),
    db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES(?1,?2,'active',0,?3,?3)").bind(rows[0].subject, 'b'.repeat(32), at),
    db.prepare("INSERT INTO members(discord_id,banned) VALUES('800000000000009999',0)"),
    db.prepare('INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?1,?2,?2,0)').bind(rows[0].subject, at),
  ]);
  const triggers = catalogue.triggers.map(row => db.prepare(row.sql));
  while (triggers.length) await db.batch(triggers.splice(0, 40));
  env.DB = createPrivacyWriteAdmissionDatabase(db, 'writer', 'canonical', EPOCH);
  const originalProofs = JSON.stringify((await db.prepare(proofSQL).all()).results);
  const originalEffects = JSON.stringify(await db.prepare(effectSQL).first());
  const native = await db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT guid) guids FROM roster_members WHERE snapshot_id=1').first();
  const linked = await db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT guid) guids FROM characters').first();
  record('genuine D1 holds exactly 1000 distinct native GUIDs and original fresh links',
    native.n === 1000 && native.guids === 1000 && linked.n === 1000 && linked.guids === 1000);
  return {env, db, at, rows, originalProofs, originalEffects};
}

// Evergreen 12 Nov 2026 (CL2-024): per-request physical D1 statement ceilings and query plans on a separate 1,000-member
// genuine D1 database, so the measurement cannot disturb the paced promotion fixture above. Each measured request goes
// through the actual Worker entry (host routing, watcher bearer, members-only protocol, ensureSchema and the admission
// layer) with the counter in the place of the genuine binding, so every physical statement that reaches D1 is counted.
// Ceilings: the directive's "<100 statements" for the officer launch-operations page and the strict roster display; the
// shipped per-invocation admission model (scheduled-budget.ts ROSTER_INGEST_STATEMENTS) for a 1,000-member roster ingest,
// whose "<100" reading is an open owner question (CL2-030).
// Plans: every statement each request sent, and both Native sweep selectors, are explained against EVERY table in the
// database (12 Nov review: a fixed list of two tables let scans of audit, characters, members and privacy_subjects pass
// unreported). The scans the shipped code already does are pinned below with their exact plan text and count, so the
// gate stays green on the shipped plans and turns red on any new scan, any changed one or any extra occurrence. Counts
// are per physical statement (a read sent twice scans twice). Two kinds are inherent and stay: sqlite_master (the
// schema catalogue, which the admission schema proof reads on every request) and privacy_write_admission (a one-row
// control table). Every other entry is a defect recorded on dfca7a2 on 12 Nov 2026 and handed to its runtime owner (see
// docs/release-qualification.md, "Known full scans"); remove the entry when its query is fixed.
const DIRECTIVE_STATEMENT_LIMIT = 100;
// Statements that begin with the admission catalogue CTE (privacy-write-admission.ts CATALOGUE_CTE) read sqlite_master
// ten times and privacy_write_admission once each. The full schema proof among them also scans audit, through its
// NOT EXISTS(... FROM audit WHERE action='site.settings' ...) clause, which no index serves.
const CATALOGUE_SCANS = (statements, proofs) => ({'audit: SCAN audit': proofs,
  'privacy_write_admission: SCAN privacy_write_admission': statements,
  'sqlite_master: SCAN main.sqlite_master': 3 * statements, 'sqlite_master: SCAN sqlite_master': 7 * statements});
const KNOWN_REQUEST_SCANS = Object.freeze({
  // site-launch229.ts linked_guids CTE: GROUP BY guid over the whole characters table, in each of the two launch reads.
  page: {...CATALOGUE_SCANS(3, 3), 'characters: SCAN characters': 2},
  // unverified.ts linked_guids CTE: the same whole-table GROUP BY.
  display: {...CATALOGUE_SCANS(2, 2), 'characters: SCAN characters': 1},
  ingest: {...CATALOGUE_SCANS(29, 5),
    // Plus 24 post-write checks (SELECT CASE WHEN changes()=1 AND (SELECT COUNT(*) FROM privacy_write_admission)=1 ...).
    'privacy_write_admission: SCAN privacy_write_admission': 29 + 24,
    // roster.ts:728-733: per member row, EXISTS(... privacy_subjects ps ... instr(note, ps.subject_id)) for the public and
    // the officer note; no index can serve instr(), so each 50-row statement scans privacy_subjects twice per row.
    'privacy_subjects: SCAN ps': 40,
    // roster.ts:153 BOUND_SELECT: every bound character, joined to members, read in full.
    'characters: SCAN c': 1, 'members: SCAN m': 1,
    // roster.ts:1211: the latest-snapshot status read walks roster_snapshots and roster_effect_runs.
    'roster_snapshots: SCAN s': 1, 'roster_snapshots: SCAN a': 1, 'roster_effect_runs: SCAN d': 1, 'roster_effect_runs: SCAN u': 1},
});
const KNOWN_SWEEP_SCANS = Object.freeze({
  // full-release-roles.ts CANONICAL233_SWEEP249_SELECT: role_settlements walked twice through its subject index, the
  // distinct linked subjects through characters_discord, and the latest266 subquery over roster_snapshots.
  canonical: {'role_settlements: SCAN role_settlements USING INDEX role_settlement_subject': 1, 'role_settlements: SCAN r USING INDEX role_settlement_subject': 1,
    'characters: SCAN c USING INDEX characters_discord': 1, 'roster_snapshots: SCAN roster_snapshots': 1},
  // full-release-roles.ts NATIVE232_SWEEP249_SELECT: the candidates CTE walks role_settlements and characters by index.
  native: {'role_settlements: SCAN role_settlements USING INDEX role_settlement_subject': 1, 'characters: SCAN c USING INDEX characters_discord': 1},
});
const TIMING_CEILING_MS = 1000;
const BUDGET_WATCHER_TOKEN = 'synthetic-budget-watcher-only-' + 'b'.repeat(40);
let budgeted = false;
async function budget(genuine, ctx) {
  const local = [], own = (name, value) => { if (!value) throw Error(name); local.push({name, passed: true}); };
  // The budget database's seed checks are this target's own, named apart from the promotion fixture's.
  const seeded = await seed(genuine, (name, value) => own('budget database: ' + name, value)), counter = countingD1(genuine);
  const env = {...seeded.env, DB: counter.native, PUBLIC_BASE_URL: 'https://verify.example', WATCHER_TOKEN: BUDGET_WATCHER_TOKEN,
    DISCORD_BOT_TOKEN: 'synthetic-roster-pacing-budget'};
  const call = async (method, path, body) => {
    const request = new Request('https://verify.example' + path, {method, body: body ? JSON.stringify(body) : undefined,
      headers: {Authorization: 'Bearer ' + BUDGET_WATCHER_TOKEN, ...(body ? {'Content-Type': 'application/json'} : {})}});
    const started = performance.now();
    counter.start();
    let response, text, log;
    try { response = await worker.fetch(request, env, ctx); text = await response.text(); } finally { log = counter.stop(); }
    return {status: response.status, json: JSON.parse(text), statements: log.length, milliseconds: Math.round(performance.now() - started), log};
  };
  const plans = {}, timings = {};
  // `known` maps 'table: plan detail' to its exact number of occurrences.
  const pinned = async (name, log, known) => {
    const result = await fullScans(genuine, log), found = scanCounts(result.scans);
    const expected = Object.fromEntries(Object.entries(known).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    const ok = result.explained > 0 && result.unresolved.length === 0 && JSON.stringify(found) === JSON.stringify(expected);
    plans[name] = {explained: result.explained, scans: found, unresolved: result.unresolved, statements: result.scans};
    own(name + ' query plans, explained against every table, add no full scan beyond the recorded ones'
      + (ok ? '' : ' -- found ' + JSON.stringify(found) + ' unresolved ' + JSON.stringify(result.unresolved)), ok);
  };
  // Sub-second plans (directive Pillar 7): each read statement is run again, alone, on the genuine 1,000-member database
  // and timed, on the same data state the request saw (before the ingest writes a new snapshot). Writes are never re-run.
  // One second is a ceiling against a runaway plan on a shared CI host, not a latency target.
  const timed = async (name, log) => {
    let slowest = 0, count = 0;
    for (const {sql, values} of log) {
      if (!/^\s*(?:WITH|SELECT)\b/i.test(sql) || /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(sql)) continue;
      const prepared = genuine.prepare(sql), started = performance.now();
      await (values.length ? prepared.bind(...values) : prepared).all();
      slowest = Math.max(slowest, performance.now() - started); count++;
    }
    timings[name] = {timed: count, slowestMilliseconds: Math.round(slowest)};
    own(name + ' read statements each run in under one second on the 1,000-member fixture', count > 0 && slowest < TIMING_CEILING_MS);
  };
  const page = await call('GET', '/queue/launch-operations?keyVersion=officer-operations-v233');
  own('launch-operations page answers for the 1,000-member roster through the actual Worker', page.status === 200 && page.json.memberCount === 1000 && page.json.entitlements?.total === 1000);
  own('launch-operations page stays under ' + DIRECTIVE_STATEMENT_LIMIT + ' physical D1 statements', page.statements > 0 && page.statements < DIRECTIVE_STATEMENT_LIMIT);
  const display = await call('GET', '/queue/unverified?keyVersion=launch-roster-display-v2');
  own('strict roster display answers for the 1,000-member roster through the actual Worker', display.status === 200 && display.json.verified?.length + display.json.unverified?.length + display.json.unknown?.length === 1000);
  own('strict roster display stays under ' + DIRECTIVE_STATEMENT_LIMIT + ' physical D1 statements', display.statements > 0 && display.statements < DIRECTIVE_STATEMENT_LIMIT);
  // Both reads, and the sweep selectors, are planned and timed before the ingest changes the data they read.
  await pinned('page', page.log, KNOWN_REQUEST_SCANS.page);
  await pinned('display', display.log, KNOWN_REQUEST_SCANS.display);
  await timed('page', page.log);
  await timed('display', display.log);
  const sweepBinds = ['800000000000000001', '', 50, 0, 'f'.repeat(32)];
  const sweeps = {canonical: CANONICAL233_SWEEP249_SELECT, native: NATIVE232_SWEEP249_SELECT};
  for (const [name, sql] of Object.entries(sweeps)) await pinned(name + 'Sweep', [{sql, values: sweepBinds}], KNOWN_SWEEP_SCANS[name]);
  await timed('sweeps', Object.values(sweeps).map(sql => ({sql, values: sweepBinds})));
  const members = seeded.rows.map((row, i) => ({name: row.name, guid: row.guid, rank: i === 0 ? 'Leader' : 'Initiate', rankIndex: i === 0 ? 0 : 9, level: 60, class: 'WARRIOR', online: i % 7 === 0}));
  const exportedAt = (await genuine.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n - 5;
  const ingest = await call('POST', '/ingest/roster?keyVersion=launch-membership-v1', {exportedAt, members, nativeGuild: 'OLYMPUS PRIME', nativeRealm: 'Fixture Realm'});
  own('a changed 1,000-member roster export is stored whole through the actual Worker', ingest.status === 200 && ingest.json.members === 1000 && ingest.json.trusted === true && ingest.json.unchanged === false);
  own('the 1,000-member roster ingest stays within the shipped per-invocation admission model of ' + ROSTER_INGEST_STATEMENTS + ' physical D1 statements', ingest.statements > 0 && ingest.statements <= ROSTER_INGEST_STATEMENTS);
  await pinned('ingest', ingest.log, KNOWN_REQUEST_SCANS.ingest);
  const brief = r => ({status: r.status, statements: r.statements, milliseconds: r.milliseconds});
  return {complete: true, actualLocalWorkerdD1: true, checks: local, page: brief(page), display: brief(display), ingest: brief(ingest),
    ceilings: {directive: DIRECTIVE_STATEMENT_LIMIT, rosterIngestModel: ROSTER_INGEST_STATEMENTS, readMilliseconds: TIMING_CEILING_MS}, timings, plans};
}

export default {async fetch(request, bindings, ctx) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return new Response(null, {status: 404});
  try {
    if (url.pathname === '/seed' && !fixture) {
      fixture = await seed(bindings.DB);
      return Response.json({complete: true, actualLocalWorkerdD1: true, at: fixture.at, checks});
    }
    if (url.pathname === '/budget' && !budgeted) { budgeted = true; return Response.json(await budget(bindings.DB_BUDGET, ctx)); }
    if (!fixture) return new Response(null, {status: 404});
    const {env, db} = fixture;
    if (url.pathname === '/review-records275') {
      const input=await request.json();return Response.json(await reviewRecords275(input.action,input));
    }
    if (url.pathname === '/batch-observe') {
      const {indices}=await request.json();
      if(!Array.isArray(indices)||indices.length<1||indices.length>21||indices.some(index=>!Number.isInteger(index)||!fixture.rows[index]))return new Response(null,{status:400});
      const source=await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) at,id AS snapshotId,exported_at AS snapshotAt FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)").first();
      return Response.json({complete:true,...source,targetGuids:indices.map(index=>fixture.rows[index].guid).sort()});
    }
    if (url.pathname === '/batch-scope') {
      const {restore=false}=await request.json();
      if(restore){env.VERIFY_NATIVE_SCOPE=fixture.batchScope;delete fixture.batchScope;}
      else {fixture.batchScope=env.VERIFY_NATIVE_SCOPE;env.VERIFY_NATIVE_SCOPE=JSON.stringify({version:1,guild:'OLYMPUS PRIME',realm:'Other Batch Realm'});}
      return Response.json({complete:true});
    }
    if (url.pathname === '/batch-selection' || url.pathname === '/batch-boundary') {
      const input=await request.json(),mode=input.mode??'batch-full',selection=input.selection;
      if(typeof mode!=='string'||!mode.startsWith('batch-')||!selection||typeof selection!=='object')return new Response(null,{status:400});
      env.DISCORD_BOT_TOKEN='synthetic-roster-pacing-'+mode;
      let cursor=input.cursor??null;
      if(url.pathname==='/batch-boundary'){
        // Fixture-only private-MAC boundary; production clock, D1, reader and
        // validation stay real. This is not a historical server-minted cursor.
        const value=JSON.parse(atob(cursor.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))),at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
        let shared=false,purpose='promotion-selection-cursor|276|';
        if(input.kind==='shared-secret'){value.roleReads[0][1]='knight';value.roleReads[0][2]=at;shared=true;}
        else if(input.kind==='legacy-purpose')purpose='promotion-selection-cursor|273|';
        else if(input.kind==='wrong-digest')value.targetsDigest='f'.repeat(64);
        else if(input.kind==='wrong-guid')value.roleReads[0][0]=fixture.rows[999].guid;
        else if(input.kind==='expired-role'){
          selection.selectionId=String(at-90)+':901';value.selectionId=selection.selectionId;value.issuedAt=at-90;
          value.expiresAt=Math.min(value.issuedAt+600,value.snapshotAt+600);value.roleReads=value.roleReads.map(row=>row.map((v,i)=>i===2?at-61:v));
        }else if(input.kind==='expired-read'){
          selection.selectionId=String(at-700)+':902';value.selectionId=selection.selectionId;value.issuedAt=at-700;value.expiresAt=Math.min(value.issuedAt+600,value.snapshotAt+600);value.roleReads=[];
        }else return new Response(null,{status:400});
        const body=btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        const secret=shared?env.VERIFY_SECRET:JSON.stringify(['promotion-selection-cursor',276,env.VERIFY_SECRET,env.SITE_GUILD_ID,env.DISCORD_BOT_TOKEN]);
        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(purpose+body))),n=>n.toString(16).padStart(2,'0')).join('');cursor=body+'.'+mac;
      }
      const query=new URLSearchParams({keyVersion:'officer-operations-v233',...Object.fromEntries(Object.entries(selection).map(([key,value])=>[key,key==='targetGuids'?JSON.stringify(value):String(value)]))});
      if(cursor!==null)query.set('cursor',cursor);
      const response=await handleLaunchOperations229(new Request('https://fixture.invalid/queue/launch-operations?'+(input.rawQuery??query.toString())),env,input.admin!==true),value=await response.json();
      return Response.json(response.ok?{complete:true,actualLocalWorkerdD1:true,selection:value,cacheControl:response.headers.get('Cache-Control'),syntheticSignedInputBoundary:url.pathname==='/batch-boundary'}:{complete:false,error:value.error},{status:response.status});
    }
    if (url.pathname === '/selection-observe') {
      const {index=399}=await request.json();
      if(!Number.isInteger(index)||!fixture.rows[index])return new Response(null,{status:400});
      const source=await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) at,id AS snapshotId,exported_at AS snapshotAt FROM roster_snapshots WHERE id=(SELECT MAX(id) FROM roster_snapshots)").first();
      return Response.json({complete:true,...source,targetGuid:fixture.rows[index].guid});
    }
    if (url.pathname === '/selection-native') {
      const {kind}=await request.json(),moved=fixture.rows[950],target=fixture.rows[399];
      if(kind==='routine')await env.DB.batch([
        env.DB.prepare('UPDATE roster_members SET level=59,last_online=3600 WHERE snapshot_id=1 AND name_key=?1').bind(fixture.rows[900].key),
        env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-1 WHERE id=1"),
      ]);
      else if(kind==='near-expiry')await env.DB.prepare("UPDATE roster_snapshots SET exported_at=CAST(strftime('%s','now') AS INTEGER)-590 WHERE id=1").run();
      else if(kind==='long-guids'){
        const statements=[];
        for(let index=0;index<20;index++){
          const row=fixture.rows[index],guid='Player-999999-'+(index+1).toString(16).padStart(16,'0');
          statements.push(env.DB.prepare('UPDATE roster_members SET guid=?1 WHERE snapshot_id=1 AND name_key=?2').bind(guid,row.key),env.DB.prepare('UPDATE characters SET guid=?1 WHERE name_key=?2').bind(guid,row.key));
          row.guid=guid;
        }
        await env.DB.batch(statements);
      }
      else if(kind==='reorder')await env.DB.batch([
        env.DB.prepare("UPDATE roster_members SET name_key='aa reordered',name='AA Reordered' WHERE snapshot_id=1 AND name_key=?1").bind(moved.key),
        env.DB.prepare("UPDATE characters SET name_key='aa reordered',name='AA Reordered' WHERE name_key=?1").bind(moved.key),
      ]);
      else if(kind==='missing')await env.DB.prepare('UPDATE roster_members SET guid=NULL WHERE snapshot_id=1 AND name_key=?1').bind(target.key).run();
      else if(kind==='duplicate')await env.DB.prepare('UPDATE roster_members SET guid=?1 WHERE snapshot_id=1 AND name_key=?2').bind(target.guid,fixture.rows[398].key).run();
      else if(kind==='rank-complete')await env.DB.prepare("UPDATE roster_members SET rank='Member',rank_index=8 WHERE snapshot_id=1 AND name_key=?1").bind(target.key).run();
      else if(kind==='mixed')await env.DB.prepare('DELETE FROM characters WHERE name_key=?1').bind(fixture.rows[381].key).run();
      else if(kind==='drift')await env.DB.prepare('UPDATE roster_members SET level=59 WHERE snapshot_id=1 AND name_key=?1').bind(fixture.rows[901].key).run();
      else if(kind==='restore')await env.DB.batch([
        ...Array.from({length:20},(_,index)=>{
          const row=fixture.rows[index],guid='Player-6933-'+(index+1).toString(16).padStart(8,'0');row.guid=guid;
          return [env.DB.prepare('UPDATE roster_members SET guid=?1 WHERE snapshot_id=1 AND name_key=?2').bind(guid,row.key),env.DB.prepare('UPDATE characters SET guid=?1 WHERE name_key=?2').bind(guid,row.key)];
        }).flat(),
        env.DB.prepare('UPDATE roster_members SET name_key=?1,name=?2 WHERE snapshot_id=1 AND guid=?3').bind(moved.key,moved.name,moved.guid),
        env.DB.prepare("UPDATE characters SET name_key=?1,name=?2 WHERE name_key='aa reordered'").bind(moved.key,moved.name),
        ...[398,399].map(index=>env.DB.prepare('UPDATE roster_members SET guid=?1,rank=\'Initiate\',rank_index=9 WHERE snapshot_id=1 AND name_key=?2').bind(fixture.rows[index].guid,fixture.rows[index].key)),
        env.DB.prepare('UPDATE roster_members SET level=60,last_online=NULL WHERE snapshot_id=1'),
        env.DB.prepare('UPDATE roster_snapshots SET exported_at=?1,trusted=1 WHERE id=1').bind(fixture.at-120),
        env.DB.prepare("INSERT OR IGNORE INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid) VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)").bind(fixture.rows[381].key,fixture.rows[381].name,fixture.rows[381].subject,fixture.at-60,fixture.rows[381].guid),
      ]);
      else return new Response(null,{status:400});
      return Response.json({complete:true});
    }
    if (url.pathname === '/selection' || url.pathname === '/selection-boundary') {
      const input=await request.json(),mode=input.mode??'selected',selection=input.selection;
      if(typeof mode!=='string'||!mode.startsWith('selected')||!selection||typeof selection!=='object')return new Response(null,{status:400});
      env.DISCORD_BOT_TOKEN='synthetic-roster-pacing-'+mode;
      let cursor=input.cursor??null;
      if(url.pathname==='/selection-boundary'){
        // Fixture-only signed input boundary. Production reader, D1 and clock
        // remain real; this does not claim a historical server-minted cursor.
        const value=JSON.parse(atob(cursor.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))),at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
        let shared=false,purpose='promotion-selection-cursor|273|';
        if(input.kind==='shared-secret'){
          value.roleReads[0][1]='knight';value.roleReads[0][2]=at;shared=true;
        }else if(input.kind==='legacy-purpose')purpose='officer-operations-cursor|233|';
        else if(input.kind==='wrong-guid')value.roleReads[0][0]=fixture.rows[999].guid;
        else if(input.kind==='wrong-offset')value.offset+=20;
        else if(input.kind==='expired-role'||input.kind==='aged-cache'){
          selection.selectionId=String(at-90)+':701';value.selectionId=selection.selectionId;value.issuedAt=at-90;
          value.expiresAt=Math.min(value.issuedAt+600,value.snapshotAt+600);value.roleReads=value.roleReads.map(row=>row.map((v,i)=>i===2?at-(input.kind==='aged-cache'?30:61):v));
        }else if(input.kind==='expired-read'){
          selection.selectionId=String(at-700)+':702';value.selectionId=selection.selectionId;value.issuedAt=at-700;value.expiresAt=Math.min(value.issuedAt+600,value.snapshotAt+600);value.roleReads=[];
        }else return new Response(null,{status:400});
        const body=btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        const secret=shared?env.VERIFY_SECRET:JSON.stringify(['promotion-selection-cursor',273,env.VERIFY_SECRET,env.SITE_GUILD_ID,env.DISCORD_BOT_TOKEN]);
        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
        const mac=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(purpose+body))),n=>n.toString(16).padStart(2,'0')).join('');cursor=body+'.'+mac;
      }
      const query=new URLSearchParams({keyVersion:'officer-operations-v233',...Object.fromEntries(Object.entries(selection).map(([key,value])=>[key,String(value)]))});
      if(cursor!==null)query.set('cursor',cursor);
      const response=await handleLaunchOperations229(new Request('https://fixture.invalid/queue/launch-operations?'+(input.rawQuery??query.toString())),env,input.admin!==true),value=await response.json();
      return Response.json(response.ok?{complete:true,actualLocalWorkerdD1:true,selection:value,cacheControl:response.headers.get('Cache-Control'),syntheticSignedInputBoundary:url.pathname==='/selection-boundary'}:{complete:false,error:value.error},{status:response.status});
    }
    if (url.pathname === '/page') {
      const {mode, cursor = null} = await request.json();
      if (!MODES.has(mode) || cursor !== null && typeof cursor !== 'string') return new Response(null, {status: 400});
      env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-' + mode;
      const page = await readLaunchOperations229(env, cursor);
      return Response.json({complete: true, actualLocalWorkerdD1: true, page});
    }
    if (url.pathname === '/legacy-page') {
      // The real missing-role-configuration path mints an actual cache-free v1
      // page. No historical SQL digest or source classification is reconstructed.
      env.DISCORD_BOT_TOKEN = undefined;
      try {
        const page = await readLaunchOperations229(env);
        return Response.json({complete: true, actualLocalWorkerdD1: true, page});
      } finally {
        env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-partial-recover';
      }
    }
    if (url.pathname === '/cursor-boundary') {
      // Explicit signed-input boundary, not an assertion that this old cursor was
      // historically minted. Current clock, D1 source and reader remain genuine.
      const {cursor, kind, injectedReads} = await request.json();
      let value = JSON.parse(atob(cursor.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      const at = (await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) n").first()).n;
      let sharedKeyOnly = false;
      if (kind === 'expired-role') {
        value.issuedAt = at - 90;
        value.expiresAt = Math.min(value.issuedAt + 600, value.snapshotAt + 600);
        value.roleReads = value.roleReads.map(row => row.map((entry, index) => index === 2 ? at - 61 : entry));
      } else if (kind === 'expired-scan') {
        value.issuedAt = at - 700;
        value.expiresAt = Math.min(value.issuedAt + 600, value.snapshotAt + 600);
        value.roleReads = [];
      } else if (kind === 'wrong-guid') {
        value.roleReads[0][0] = fixture.rows[999].guid;
      } else if (kind === 'wrong-role-scope') {
        value.roleScope = 'f'.repeat(64);
      } else if (kind === 'shared-secret-forgery') {
        if (value.roleReads.length) { value.roleReads[0][1] = 'knight'; value.roleReads[0][2] = at; }
        else value.roleReads = [[fixture.rows[0].guid, 'knight', at]];
        sharedKeyOnly = true;
      } else if (kind === 'legacy-v1-cache-forgery') {
        const {snapshotId, snapshotAt, scopeHash, rowsDigest, offset, issuedAt, expiresAt} = value;
        value = {version: 1, snapshotId, snapshotAt, scopeHash, rowsDigest, offset, issuedAt, expiresAt, roleReads: injectedReads};
        sharedKeyOnly = true;
      } else return new Response(null, {status: 400});
      const body = btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-partial-recover';
      const signingKey = sharedKeyOnly ? env.VERIFY_SECRET
        : JSON.stringify(['officer-role-cursor', value.version >= 3 ? 272 : 271, env.VERIFY_SECRET, env.SITE_GUILD_ID, env.DISCORD_BOT_TOKEN]);
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
      const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('officer-operations-cursor|233|' + body))), n => n.toString(16).padStart(2, '0')).join('');
      const page = await readLaunchOperations229(env, body + '.' + signature);
      return Response.json({complete: true, actualLocalWorkerdD1: true, syntheticSignedInputBoundary: true, page});
    }
    if (url.pathname === '/source-state') {
      const {kind, index = 0, restore = false} = await request.json();
      if (!Number.isInteger(index) || index < 0 || index >= fixture.rows.length) return new Response(null, {status: 400});
      const row = fixture.rows[index];
      if (kind === 'privacy') await env.DB.prepare('UPDATE privacy_subjects SET state=?1 WHERE subject_id=?2').bind(restore ? 'active' : 'retiring', row.subject).run();
      else if (kind === 'link') await env.DB.prepare('UPDATE characters SET guid=?1 WHERE name_key=?2').bind(restore ? row.guid : null, row.key).run();
      else if (kind === 'identity') await env.DB.prepare('UPDATE characters SET discord_id=?1 WHERE name_key=?2').bind(restore ? row.subject : '800000000000009999', row.key).run();
      else if (kind === 'denial') await env.DB.prepare('UPDATE site_users SET denied=?1 WHERE discord_id=?2').bind(restore ? 0 : 1, row.subject).run();
      else if (kind === 'native') await env.DB.prepare('UPDATE roster_snapshots SET trusted=?1 WHERE id=1').bind(restore ? 1 : 0).run();
      else if (kind === 'cutoff') env.LINKS_NOT_BEFORE = String(restore ? fixture.at - 3600 : fixture.at);
      else if (kind === 'credential') env.DISCORD_BOT_TOKEN = 'synthetic-roster-pacing-await-credential' + (restore ? '' : '-rotated');
      else if (kind === 'secret') env.VERIFY_SECRET = 'synthetic-roster-pacing-only' + (restore ? '' : '-rotated');
      else return new Response(null, {status: 400});
      return Response.json({complete: true});
    }
    if (url.pathname === '/source-observe') {
      const {index = 0} = await request.json();
      const row = fixture.rows[index];
      if (!row) return new Response(null, {status: 400});
      const current = await db.prepare('SELECT guid,discord_id FROM characters WHERE name_key=?1').bind(row.key).first();
      return Response.json({complete: true, guid: current.guid, originalIdentity: current.discord_id === row.subject});
    }
    if (url.pathname === '/ranks') {
      const names = ['Guild Master', 'Stewart', 'High Council', 'Officer', 'Officer Alt', 'Raid Leader', 'Veteran'];
      await env.DB.batch(names.map((rank, i) => env.DB.prepare('UPDATE roster_members SET rank=?1,rank_index=?2 WHERE snapshot_id=1 AND name_key=?3').bind(rank, i, fixture.rows[i].key)));
      return Response.json({complete: true});
    }
    if (url.pathname === '/source-change') {
      await env.DB.prepare('UPDATE roster_snapshots SET trusted=0 WHERE id=1').run();
      return Response.json({complete: true});
    }
    if (url.pathname === '/audit') {
      check('all 1000 original identity and proof anchors are unchanged', fixture.originalProofs === JSON.stringify((await db.prepare(proofSQL).all()).results));
      check('read projections created no roles invitations or pending requests', fixture.originalEffects === JSON.stringify(await db.prepare(effectSQL).first()));
      check('genuine D1 foreign-key integrity remains intact', (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0);
      return Response.json({complete: true, actualLocalWorkerdD1: true, checks});
    }
    return new Response(null, {status: 404});
  } catch (error) {
    return Response.json({complete: false, actualLocalWorkerdD1: true, checks, error: String(error?.stack || error)},
      {status: [400, 409].includes(error?.status) ? error.status : 500});
  }
}};
