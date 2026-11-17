// Actual routine issuer and final predicates over genuine local Workerd/D1.
// All identities/receipts are synthetic seed data; no provider is contacted.
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {STEWARD_CANONICAL_PROFILE,STEWARD_RANK_NAMES,NATIVE_RANK_SCHEMES} from '../src/native-rank-constants.ts';
import {qualifiedNativeSnapshotSource} from '../src/native-rank-schemes.ts';
import * as Routine from '../src/routine-membership-authority232.ts';
const CUTOFF=1793833200,MAIN='Player-4613-12345678',OLD='Player-4613-AABBCCDD';
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const H=async value=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
export const LEGACY_LEFT_CASES295=Object.freeze(['valid-guid','null-guid','serving-v1-valid-guid','serving-v1-null-guid','member-null-guid','null-guid-no-current-proof','no-current-proof','no-current-member','inert-only','left-pending','postcutoff-bound','postcutoff-verified','bad-clock','bad-source','bad-guid','empty-guid','bad-key','duplicate-old-guid','native-name','native-guid','unknown-rank-name','unknown-rank-guid','unknown-guid-name','canonical-off','race-status','race-clock','race-native-name','race-native-guid','race-canonical','race-anchor','race-key']);
export function fixture295(seed){const used=new Set();return{async fetch(request,bindings){
 const kind=new URL(request.url).pathname.slice(1);if(request.method!=='POST'||!LEGACY_LEFT_CASES295.includes(kind)||used.has(kind))return new Response(null,{status:404});used.add(kind);
 const raw=bindings.DB,subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,scope={version:1,...NATIVE_SCOPE232};
 const closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure);
 const servingV1=kind.startsWith('serving-v1-'),profile=servingV1?CANONICAL_PROFILE233:STEWARD_CANONICAL_PROFILE;
 const policy=JSON.stringify({version:servingV1?1:3,enabled:true,profile,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const config={...seed.config,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),LINKS_NOT_BEFORE:String(CUTOFF),ROSTER_MIN_MEMBERS:'1',NATIVE_RANK_SYNC232:'off',CANONICAL_RANKS233:policy,SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON)};
 const create=seed.objects.filter(o=>o.type!=='trigger'&&!o.name.startsWith('sqlite_')).map(o=>raw.prepare(o.sql));while(create.length)await raw.batch(create.splice(0,40));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 const source=qualifiedNativeSnapshotSource(scope.guild,scope.realm,NATIVE_RANK_SCHEMES[1]);
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};if(table.name==='site_settings'&&row.key==='membership230:closure:'+closure.operationId)row.value=closureJSON;if(table.name==='roster_snapshots'){row.source=source;row.member_count=1000;}if(table.name==='roster_members'){row.rank='Member';row.rank_index=8;}const keys=Object.keys(row);await raw.prepare('INSERT INTO "'+table.name+'"('+keys.map(k=>'"'+k+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 const sid=(await raw.prepare('SELECT snapshot_id FROM roster_members LIMIT 1').first()).snapshot_id,fill=[];for(let i=0;i<999;i++)fill.push(raw.prepare('INSERT INTO roster_members(snapshot_id,name,name_key,guid,rank,rank_index)VALUES(?1,?2,?3,?4,?5,?6)').bind(sid,'Synthetic '+i,'synthetic '+i,'Player-4613-'+(0x10000000+i).toString(16).toUpperCase(),STEWARD_RANK_NAMES[i%10],i%10));while(fill.length)await raw.batch(fill.splice(0,40));
 await raw.prepare('INSERT OR IGNORE INTO members(discord_id)VALUES(?1)').bind(subject).run();
 await raw.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',0,?3,?3)").bind(subject,'a'.repeat(32),seed.now-100).run();
 const oldGuid=['null-guid','serving-v1-null-guid','member-null-guid','null-guid-no-current-proof','unknown-guid-name'].includes(kind)?null:kind==='bad-guid'?'Player-invalid':kind==='empty-guid'?'':OLD;
 await raw.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,'Legacy Absent',?2,?3,?4,?5,?6,?7)").bind(kind==='bad-key'?'':'legacy absent',subject,kind==='member-null-guid'?'member':kind==='left-pending'?'left_pending':'left',kind==='postcutoff-bound'?CUTOFF+1:CUTOFF-1000,['postcutoff-bound','postcutoff-verified'].includes(kind)?CUTOFF+1:kind==='bad-clock'?CUTOFF-1001:CUTOFF-1000,kind==='bad-source'?'note':'whisper',oldGuid).run();
 if(kind==='duplicate-old-guid')await raw.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('legacy second','Legacy Second',?1,'left',?2,?2,'whisper',?3)").bind(subject,CUTOFF-900,OLD).run();
 if(kind!=='inert-only'){
  await raw.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES('fern melder','Fern Melder',?1,'member',?2,?2,'whisper',?3)").bind(subject,seed.now-100,MAIN).run();
  if(!['no-current-proof','null-guid-no-current-proof'].includes(kind))for(const [id,at]of[['b',seed.now-90],['c',seed.now-80]])await raw.prepare("INSERT INTO role_settlements(id,subject,subject_generation,purpose,guild_id,role_id,desired,state,reason,attempts,request_digest,created_at,expires_at,checked_at,roster_id,native_guid,native_profile,native_rank,native_rank_name)VALUES(?1,?2,?3,'canonical_identity233',?4,'1552077551839617104',1,'settled','canonical233_original_control_verified',0,?5,?6,?7,?8,?9,?10,?11,8,'Member')").bind(id.repeat(32),subject,'a'.repeat(32),config.GUILD_ID,'d'.repeat(64),at,at+300,at+1,sid,MAIN,profile).run();
 }
 if(kind==='no-current-member'||kind==='inert-only')await raw.prepare("UPDATE roster_members SET name='Other Current',name_key='other current',guid='Player-4613-EEFFFFFF' WHERE guid=?1").bind(MAIN).run();
 if(['native-name','unknown-rank-name','unknown-guid-name'].includes(kind))await raw.prepare("UPDATE roster_members SET name_key='legacy absent',name='Legacy Absent',guid=?1,rank=?2,rank_index=?3 WHERE name_key='synthetic 0'").bind(kind==='unknown-guid-name'?null:'Player-4613-EEFFFFFA',kind==='unknown-rank-name'?'Unknown':'Member',kind==='unknown-rank-name'?null:8).run();
 if(['native-guid','unknown-rank-guid'].includes(kind))await raw.prepare("UPDATE roster_members SET guid=?1,rank=?2,rank_index=?3 WHERE name_key='synthetic 0'").bind(OLD,kind==='unknown-rank-guid'?'Unknown':'Member',kind==='unknown-rank-guid'?null:8).run();
 if(kind==='canonical-off')config.CANONICAL_RANKS233='off';
 const triggers=seed.objects.filter(o=>o.type==='trigger').map(o=>raw.prepare(o.sql));while(triggers.length)await raw.batch(triggers.splice(0,40));
 const before={links:(await raw.prepare('SELECT * FROM characters ORDER BY name_key').all()).results,receipts:(await raw.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results};
 const env={...config,DB:createPrivacyWriteAdmissionDatabase(raw,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)};
 const diagnostic=await Routine.captureRoutineMembershipAudit285(env,subject),cap=diagnostic.cap;let facts=null,admitted=false,integrityAdmitted=false,afterRace=null,error=null,raceMutationApplied=false;
 try{if(cap){facts=Routine.routineMembership232Facts(cap);const predicate=Routine.routineMembership232Predicate(env,cap);
  if(kind==='race-status')await env.DB.prepare("UPDATE characters SET status='left_pending' WHERE name_key='legacy absent'").run();
  if(kind==='race-clock')await env.DB.prepare("UPDATE characters SET verified_at=verified_at+1 WHERE name_key='legacy absent'").run();
  if(kind==='race-key')await env.DB.prepare("UPDATE characters SET name_key='changed absent' WHERE name_key='legacy absent'").run();
  if(kind==='race-native-name')await env.DB.prepare("UPDATE roster_members SET name_key='legacy absent' WHERE name_key='synthetic 0'").run();
  if(kind==='race-native-guid')await env.DB.prepare("UPDATE roster_members SET guid=?1 WHERE name_key='synthetic 0'").bind(OLD).run();
  if(kind==='race-anchor')await env.DB.prepare("UPDATE role_settlements SET reason='synthetic_changed' WHERE id=?1").bind('c'.repeat(32)).run();
  if(kind==='race-canonical')env.CANONICAL_RANKS233='off';
  raceMutationApplied=kind.startsWith('race-');
  afterRace={links:(await raw.prepare('SELECT * FROM characters ORDER BY name_key').all()).results,receipts:(await raw.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results};
  try{Routine.assertRoutineMembership232(env,cap);admitted=!!await env.DB.prepare('SELECT 1 AS admitted WHERE '+predicate.sql).bind(...predicate.values).first();integrityAdmitted=!!await env.DB.prepare('SELECT 1 AS admitted WHERE '+predicate.receiptSourceIntegritySql).bind(...predicate.values).first();}catch(e){error=String(e?.message??e);}
  Routine.closeRoutineMembership232(cap);
 }}catch(e){error=String(e?.message??e);}
 const after={links:(await raw.prepare('SELECT * FROM characters ORDER BY name_key').all()).results,receipts:(await raw.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results};
 return Response.json({kind,actualWorkerdD1:true,syntheticOnly:true,rosterRows:1000,cap:!!cap,holdReason:diagnostic.holdReason,facts,admitted,integrityAdmitted,error,before,after,afterRace,raceMutationApplied,oldRowsAndReceiptsUnchanged:JSON.stringify(before)===JSON.stringify(after),noRoleCalls:true});
}};}
