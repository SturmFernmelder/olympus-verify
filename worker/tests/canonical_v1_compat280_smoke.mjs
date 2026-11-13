// Genuine local Native cutover, issued character code and verification. Reuses
// the existing reconciliation database; only the runner mocks Discord HTTP.
import {captureSharedMember230Fence,executeSharedMember230Fence,captureSharedMember230Open,executeSharedMember230Open,SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL} from '../src/privacy-shared-member-cutover230.ts';
import {SHARED_MEMBER230_CONTRACT,captureRuntimeVenue230} from '../src/shared-membership-cutover230.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {requestCharacterCode242} from '../src/interactions.ts';
import {postRoster,postVerify} from '../src/ingest.ts';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233,NATIVE_NAMES233,parseCanonicalRankPolicy233,currentOriginalCanonicalPolicy233,currentDirectiveCanonicalPolicy233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE,DIRECTIVE_RANK_NAMES,qualifiedNativeSnapshotSource,nativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {canonicalRankSource280,canonicalRankSnapshotSql280,canonicalRankWitnessMatches280,originalCanonicalSnapshotSource280} from '../src/canonical-native-authority280.ts';
import {captureRoutineMembership232,routineMembership232Facts,closeRoutineMembership232} from '../src/routine-membership-authority232.ts';
import {reconcileCanonicalRanks233} from '../src/role-settlements.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {callBudget} from '../src/roles.ts';
import {NEUTRAL_IDENTITY_PURPOSE280,NEUTRAL_IDENTITY_REASON280} from '../src/consumed-identity280.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {parseLaunchNativeScope} from '../src/launch-verification227.ts';

const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const policy=(version,profile,enabled=true)=>JSON.stringify({version,enabled,profile,guildId:CANONICAL_GUILD233,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
export const CANONICAL_V1_SMOKE_SUBJECT280='800000000000000399';
const LIVE_NAMES280=Object.freeze(['Guild Master','Steward','High Council','Officer','Officer Alt','Raid Leader','Veteran','Alt','Member','Initiate']);
const LIVE_MEMBER280='800000000000000400',LIVE_OFFICER280='800000000000000401',LIVE_ALT280='800000000000000402';
async function liveOriginalTableSmoke280(env,writer,venue,check){
 const now=async()=>(await writer.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").first()).at;
 const table={version:1,names:LIVE_NAMES280},original=parseCanonicalRankPolicy233(env.CANONICAL_RANKS233);
 const members=[['Canonical Smoke','ABCDEF12',0],['Live Member','ABCDEF13',8],['Live Officer','ABCDEF14',3],['Live Steward','ABCDEF15',1],['Live Alt','ABCDEF16',7],['Unlinked Steward','ABCDEF17',1],['Unlinked Alt','ABCDEF18',7]].map(([name,suffix,rankIndex])=>({name,guid:'Player-4613-'+suffix,rank:LIVE_NAMES280[rankIndex],rankIndex,level:60}));
 const publish=async(names=LIVE_NAMES280)=>{
  const rows=members.map(row=>({...row,rank:names[row.rankIndex]}));
  const response=await postRoster(env,{exportedAt:await now(),nativeGuild:NATIVE_SCOPE232.guild,nativeRealm:NATIVE_SCOPE232.realm,nativeRankTable:{version:1,names},members:rows},undefined,undefined,true);
  check('actual observed-table ingress accepted '+names[1],response.status===200,{status:response.status});
  return writer.prepare('SELECT id,source FROM roster_snapshots ORDER BY id DESC LIMIT 1').first();
 };
 let snapshot=await publish();
 const expectedSource=nativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,table,members);
 check('live Steward1/Alt7 observation retains its exact scoped null-profile source',snapshot.source===expectedSource&&JSON.parse(snapshot.source.slice(16)).rankProfile===null&&canonicalRankSource280(original,snapshot.source,NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)==='original-native-v2');
 const query=async(source,id=snapshot.id)=>!!(await writer.prepare('SELECT 1 AS allowed WHERE '+canonicalRankSnapshotSql280(original,'?1',NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,source)).bind(id).first());
 check('coherent live table qualifies original policy without aliasing its unknown names',await query(snapshot.source));
 const value=JSON.parse(expectedSource.slice(16)),sourceWith=change=>'addon-native-v2:'+JSON.stringify({...value,...change});
 const invalid=[
  ['malformed JSON','addon-native-v2:{'],
  ['NUL observed label',sourceWith({rankNames:LIVE_NAMES280.map((x,i)=>i===1?'Steward\0':x)})],
  ['over96 UTF8 label',sourceWith({rankNames:LIVE_NAMES280.map((x,i)=>i===1?'é'.repeat(49):x)})],
  ['duplicate observed label',sourceWith({rankNames:LIVE_NAMES280.map((x,i)=>i===1?LIVE_NAMES280[0]:x)})],
  ['extra source key',sourceWith({extra:true})],
  ['duplicate source key',expectedSource.replace('"rankProfile":null','"rankProfile":null,"rankProfile":null')],
  ['noncanonical source JSON','addon-native-v2:'+JSON.stringify(value,null,1)],
  ['missing table',sourceWith({rankNames:null})],
  ['foreign scope',sourceWith({guild:'Different guild'})],
  ['non-null profile',sourceWith({rankProfile:'unqualified-profile'})],
  ['table extra key',nativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,{...table,extra:true},members)],
  ['explicit undefined',undefined],['explicit null',null],['nonstring source',7],
 ];
 for(const [label,source]of invalid)check('malformed original observation returns0 before dynamic SQL: '+label,canonicalRankSnapshotSql280(original,'?1',NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,source)==='0');
 const quoted=LIVE_NAMES280.map((name,index)=>index===1?"Steward'; DROP TABLE members;--":name);
 const quotedSnapshot=await publish(quoted);
 check('quoted injection-shaped unknown label remains literal source/CASE data',canonicalRankSource280(original,quotedSnapshot.source,NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)==='original-native-v2'&&await query(quotedSnapshot.source,quotedSnapshot.id)&&(await writer.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='members'").first()).n===1);
 snapshot=await publish();
 const verify=async(subject,name,grant)=>{
  const native=members.find(row=>row.name===name),issued=await requestCharacterCode242(env,{id:subject,username:'live-original-smoke'},name),message=(await issued.json()).data?.content;
  const code=typeof message==='string'?/`([A-Z2-9]{6,7})`/.exec(message)?.[1]:null;
  check('actual current named request issues a code for '+name,typeof code==='string');
  const pending=await writer.prepare('SELECT * FROM pending WHERE discord_id=?1 AND consumed_at IS NULL AND name_key=?2 ORDER BY id DESC LIMIT 1').bind(subject,name.toLowerCase()).first();
  const observedAt=await now(),scopeHash=(await hash('native-scope|1|'+NATIVE_SCOPE232.guild+'|'+NATIVE_SCOPE232.realm)).slice(0,16),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('membership|1|'+name.toLowerCase()+'|'+native.guid+'|'+code+'|1|'+observedAt+'|'+scopeHash))).slice(0,32);
  const response=await postVerify(env,{character:name,code,source:'whisper',guid:native.guid,nativeMembership:{version:1,member:true,observedAt,scopeHash,mac}}),body=await response.json();
  check('observed-table verification consumes its exact original identity: '+name,response.status===200&&body.result==='member'&&body.pendingConsumed===true,{status:response.status,body});
  check('observed-table verification has the intended rank outcome: '+name,grant?body.roleGranted===true:body.roleGranted!==true,body);
  const after=await writer.prepare('SELECT * FROM pending WHERE id=?1').bind(pending.id).first(),expected={...pending,consumed_at:after.consumed_at,consumed_source:'whisper',name_key:name.toLowerCase(),name};
  check('observed-table original pending tuple and consume clocks remain exact: '+name,Object.keys(after).sort().join(',')===Object.keys(expected).sort().join(',')&&Object.keys(expected).every(k=>after[k]===expected[k])&&Number.isSafeInteger(after.consumed_at)&&after.consumed_at>=pending.created_at&&after.consumed_at<pending.expires_at);
  const linked=await writer.prepare('SELECT status,guid FROM characters WHERE discord_id=?1 AND name_key=?2').bind(subject,name.toLowerCase()).first();
  const rows=(await writer.prepare('SELECT purpose,reason,role_id,native_profile,native_guid,native_rank,native_rank_name,attempts,state FROM role_settlements WHERE subject=?1 AND native_guid=?2').bind(subject,native.guid).all()).results;
  check('observed-table identity remains linked to its exact GUID: '+name,linked?.status==='member'&&linked.guid===native.guid);
  if(grant)check('observed-table grant has exact original profile/index/name/role: '+name,rows.some(r=>r.purpose==='canonical_consumed233'&&r.attempts===1&&r.state==='settled'&&r.role_id===grant&&r.native_profile===CANONICAL_PROFILE233&&r.native_rank===native.rankIndex&&r.native_rank_name===native.rank));
  else check('unknown live rank retains neutral identity without a role effect: '+name,rows.some(r=>r.purpose===NEUTRAL_IDENTITY_PURPOSE280&&r.reason===NEUTRAL_IDENTITY_REASON280&&r.attempts===0)&&!rows.some(r=>r.attempts!==0));
 };
 await verify(LIVE_MEMBER280,'Live Member',CANONICAL_RANKS233[9].roleId);
 let cap=await captureRoutineMembership232(env,LIVE_MEMBER280);
 try{const f=cap&&routineMembership232Facts(cap);check('good main initially has current original profile while unrelated unknown rows do not block it',f?.canonicalRankProfile===CANONICAL_PROFILE233&&f.primary?.index===8&&f.rankQualified===false);}finally{if(cap)closeRoutineMembership232(cap);}
 await verify(LIVE_MEMBER280,'Live Steward',null);
 cap=await captureRoutineMembership232(env,LIVE_MEMBER280);try{check('an unknown linked Steward alt holds its own otherwise-good main',cap===null);}finally{if(cap)closeRoutineMembership232(cap);}
 const mixed=await runNativeSubject232(env,LIVE_MEMBER280,callBudget(env),2);check('unknown linked alt routine remains held rather than lowering/removing current main',mixed.state==='held'&&mixed.requests===0,mixed);
 await verify(LIVE_OFFICER280,'Live Officer',CANONICAL_RANKS233[2].roleId);
 await verify(LIVE_ALT280,'Live Alt',null);
 cap=await captureRoutineMembership232(env,LIVE_ALT280);try{check('unknown live Alt7 does not become canonical Raider or Alt authority',cap===null);}finally{if(cap)closeRoutineMembership232(cap);}
 const alt=await runNativeSubject232(env,LIVE_ALT280,callBudget(env),2);check('unknown live Alt routine has zero provider requests',alt.state==='held'&&alt.requests===0,alt);
 const subjectRows=async()=>(await writer.prepare('SELECT * FROM role_settlements WHERE subject=?1 ORDER BY id').bind(CANONICAL_V1_SMOKE_SUBJECT280).all()).results;
 const beforeCross=await subjectRows();await publish(DIRECTIVE_RANK_NAMES);
 cap=await captureRoutineMembership232(env,CANONICAL_V1_SMOKE_SUBJECT280);
 try{const f=cap&&routineMembership232Facts(cap);check('qualified Directive source cannot become original-policy authority even with shared GM0 present',f?.rankQualified===true&&f.canonicalRankProfile===null);}finally{if(cap)closeRoutineMembership232(cap);}
 const cross=await runNativeSubject232(env,CANONICAL_V1_SMOKE_SUBJECT280,callBudget(env),2);
 check('cross-qualified source holds without replacing existing GM history or dispatch',cross.state==='held'&&cross.requests===0&&JSON.stringify(beforeCross)===JSON.stringify(await subjectRows()),cross);
 snapshot=await publish();
 for(const drift of ['source','row']){
  cap=await captureRoutineMembership232(env,CANONICAL_V1_SMOKE_SUBJECT280);check('actual original GM issuer exists before '+drift+' CAS drift',!!cap&&routineMembership232Facts(cap).canonicalRankProfile===CANONICAL_PROFILE233);
  const before=await subjectRows();
  try{
   if(drift==='source')await writer.prepare("UPDATE roster_snapshots SET source=source||':fixture-drift' WHERE id=?1").bind(snapshot.id).run();
   else await writer.prepare("UPDATE roster_members SET rank='Contradictory rank' WHERE snapshot_id=?1 AND guid='Player-4613-ABCDEF14'").bind(snapshot.id).run();
   const budget=callBudget(env),outcome=await reconcileCanonicalRanks233(env,cap,venue.venue,budget,2);
   check('original current '+drift+' CAS drift holds a real captured issuer without changing role history',outcome.state==='held'&&JSON.stringify(before)===JSON.stringify(await subjectRows()),{outcome,requests:budget.attempts});
  }finally{
   if(cap)closeRoutineMembership232(cap);
   if(drift==='source')await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(snapshot.source,snapshot.id).run();
   else await writer.prepare("UPDATE roster_members SET rank='Officer' WHERE snapshot_id=?1 AND guid='Player-4613-ABCDEF14'").bind(snapshot.id).run();
  }
 }
}
export async function originalCanonicalSmoke280(db,base,check){
 const at=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").first()).at,epoch='b'.repeat(32);
 const closure={version:1,contract:SHARED_MEMBER230_CONTRACT,operationId:'c'.repeat(32),priorEpoch:base.PRIVACY_WRITE_ADMISSION_EPOCH,writeEpoch:epoch,
  sourceCommit:'d'.repeat(40),sourceTree:'e'.repeat(40),bundleSHA256:'f'.repeat(64),providerA:'11111111-2222-4333-8444-555555555555',
  writerCoverageSHA256:'1'.repeat(64),debtPredicateSHA256:await hash(SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL),createdAt:at,expiresAt:at+300};
 const raw=JSON.stringify(closure),digest=await hash(raw);
 check('unrelated scheduling hints do not bypass the actual original cutover debt proof',(await db.prepare('SELECT ('+SHARED_MEMBER230_OLD_CUSTODY_CLEAR_SQL+') AS clear').first()).clear===1);
 await executeSharedMember230Open(await captureSharedMember230Open(await executeSharedMember230Fence(await captureSharedMember230Fence(db,raw,digest)),'enabled'));
 const writer=createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',epoch);
 const env={...base,DB:writer,PRIVACY_WRITE_ADMISSION_EPOCH:epoch,GUILD_ID:CANONICAL_GUILD233,ROLE_GUILD_MEMBER:CANONICAL_RANKS233[9].roleId,
  PRIVACY_ERASURE_ENABLED:'true',PRIVACY_NATIVE_ERASURE_ENABLED:'true',
  CANONICAL_RANKS233:policy(1,CANONICAL_PROFILE233),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',
  VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),MEMBERSHIP_ROLE_SETTLEMENT_ENABLED:'true',
  SHARED_MEMBERSHIP230_MODE:'enabled',SHARED_MEMBERSHIP230_CLOSURE_JSON:raw,SHARED_MEMBERSHIP230_CLOSURE_SHA256:digest,
  ADMISSION_MODE:'auto',ROSTER_MIN_MEMBERS:'0',ROSTER_MAX_SHRINK_PCT:'100',LINKS_NOT_BEFORE:String(at-1),OFFICER_CHARACTERS:'Fern Melder'};
 const venue=await captureRuntimeVenue230(env);
 check('production-v1 fixture has its actual source-qualified Native runtime venue',venue.mode==='enabled',{mode:venue.mode,reason:venue.reason});
 const name='Canonical Smoke',guid='Player-4613-ABCDEF12',members=[{name,guid,rank:NATIVE_NAMES233[0],rankIndex:0,level:60}],table={version:1,names:NATIVE_NAMES233};
 const legacyRoster=await postRoster(env,{exportedAt:at,nativeGuild:NATIVE_SCOPE232.guild,nativeRealm:NATIVE_SCOPE232.realm,members},undefined,undefined,false);
 const originalSource=await writer.prepare('SELECT source FROM roster_snapshots ORDER BY id DESC LIMIT 1').first();
 check('actual original ingress bytes match the configured v1 scope factory',legacyRoster.status===200&&originalSource.source===parseLaunchNativeScope(env.VERIFY_NATIVE_SCOPE)?.provenance&&canonicalRankSource280(parseCanonicalRankPolicy233(env.CANONICAL_RANKS233),originalSource.source,NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)==='original-native-v1');
 const roster=await postRoster(env,{exportedAt:at,nativeGuild:NATIVE_SCOPE232.guild,nativeRealm:NATIVE_SCOPE232.realm,nativeRankTable:table,members},undefined,undefined,true);
 check('production-v1 smoke accepts an actual nativev2 original-ten roster',roster.status===200);
 const snapshot=await writer.prepare('SELECT id,source FROM roster_snapshots ORDER BY id DESC LIMIT 1').first();
 check('actual ingress retains exact original table with null Directive profile and digest',snapshot.source===originalCanonicalSnapshotSource280(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm));
 const original=parseCanonicalRankPolicy233(env.CANONICAL_RANKS233),directive=parseCanonicalRankPolicy233(policy(2,DIRECTIVE_CANONICAL_PROFILE));
 check('exact original policy is parser-issued without becoming Directive',currentOriginalCanonicalPolicy233(original)&&!currentDirectiveCanonicalPolicy233(original));
 check('cloned original policy cannot issue a source or profile witness',!currentOriginalCanonicalPolicy233({...original})&&canonicalRankSource280({...original},snapshot.source,NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)===null);
 check('Directive still requires its independent rankQualified witness',!canonicalRankWitnessMatches280(directive,DIRECTIVE_CANONICAL_PROFILE,false)&&canonicalRankWitnessMatches280(directive,DIRECTIVE_CANONICAL_PROFILE,true));
 for(const [version,profile,enabled]of [[1,DIRECTIVE_CANONICAL_PROFILE,true],[2,CANONICAL_PROFILE233,true],[3,CANONICAL_PROFILE233,true],[1,'unknown-canonical-profile',true],[1,'olympus-prime-live-20261105-v1',true],[1,CANONICAL_PROFILE233,false]]){
  let parsed=null;try{parsed=parseCanonicalRankPolicy233(policy(version,profile,enabled));}catch{}
  check('unknown/mixed/disabled policy stays held '+version+':'+profile+':'+enabled,!canonicalRankWitnessMatches280(parsed,CANONICAL_PROFILE233,false)&&canonicalRankSnapshotSql280(parsed,'?1',NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)==='0');
 }
 const source=snapshot.source,old='addon-native-v1:'+JSON.stringify({version:1,...NATIVE_SCOPE232}),qualified=qualifiedNativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm);
 const query=async p=>!!(await writer.prepare('SELECT 1 AS allowed WHERE '+canonicalRankSnapshotSql280(p,'?1',NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm)).bind(snapshot.id).first());
 check('original-v2 source qualifies only original policy',await query(original)&&!await query(directive));
 await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(qualified,snapshot.id).run();
 check('shared GM0 cannot borrow Directive source under original policy',!await query(original)&&await query(directive));
 await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(nativeSnapshotSource(NATIVE_SCOPE232.guild,NATIVE_SCOPE232.realm,null,[]),snapshot.id).run();
 check('arbitrary null profile without complete table qualifies neither policy',!await query(original)&&!await query(directive));
 await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(source,snapshot.id).run();
 await writer.prepare("UPDATE roster_members SET rank='Officer',rank_index=2 WHERE snapshot_id=?1").bind(snapshot.id).run();
 check('original-v2 table with Directive name-index row mismatch stays held',!await query(original));
 await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(old,snapshot.id).run();
 check('v1 transport does not acquire a new global row-schema gate',await query(original));
 await writer.prepare('UPDATE roster_members SET rank=?1,rank_index=0 WHERE snapshot_id=?2').bind(NATIVE_NAMES233[0],snapshot.id).run();
 await writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=?2').bind(source,snapshot.id).run();
 // Negative snapshot mutations above precede every pending/identity/role cap.
 // Restore exact actual-ingress bytes before issuing the real character code.
 const issued=await requestCharacterCode242(env,{id:CANONICAL_V1_SMOKE_SUBJECT280,username:'canonical-v1-smoke'},name),message=(await issued.json()).data?.content;
 const code=typeof message==='string'?/`([A-Z2-9]{6,7})`/.exec(message)?.[1]:null;
 check('actual current character request issues the code rather than a fabricated pending ACK',typeof code==='string');
 const pending=await writer.prepare('SELECT * FROM pending WHERE discord_id=?1 AND consumed_at IS NULL ORDER BY id DESC LIMIT 1').bind(CANONICAL_V1_SMOKE_SUBJECT280).first();
 const observedAt=(await writer.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) AS at").first()).at,scopeHash=(await hash('native-scope|1|'+NATIVE_SCOPE232.guild+'|'+NATIVE_SCOPE232.realm)).slice(0,16);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('membership|1|canonical smoke|'+guid+'|'+code+'|1|'+observedAt+'|'+scopeHash))).slice(0,32);
 const response=await postVerify(env,{character:name,code,source:'whisper',guid,nativeMembership:{version:1,member:true,observedAt,scopeHash,mac}}),result=await response.json();
 check('production-v1 real verification consumes its original request and grants canonical GM',response.status===200&&result.result==='member'&&result.pendingConsumed===true&&result.roleGranted===true,{status:response.status,body:result});
 const after=await writer.prepare('SELECT * FROM pending WHERE id=?1').bind(pending.id).first();
 const expectedPending={...pending,consumed_at:after.consumed_at,consumed_source:'whisper',name_key:'canonical smoke',name};
 check('original pending owner/nonce/issue/expiry are retained with the exact consumed whisper fields',Object.keys(after).sort().join(',')===Object.keys(expectedPending).sort().join(',')&&Object.keys(expectedPending).every(k=>after[k]===expectedPending[k])&&Number.isSafeInteger(after.consumed_at)&&after.consumed_at>=pending.created_at&&after.consumed_at<pending.expires_at,{before:pending,after});
 const linked=await writer.prepare('SELECT status,guid,bound_at,verified_at,source FROM characters WHERE discord_id=?1 AND name_key=?2').bind(CANONICAL_V1_SMOKE_SUBJECT280,'canonical smoke').first();
 check('fresh link retains the exact observed GUID and original consume clock',linked?.status==='member'&&linked.guid===guid&&linked.bound_at===after.consumed_at&&linked.verified_at===after.consumed_at&&linked.source==='whisper');
 const rows=(await writer.prepare('SELECT purpose,role_id,native_profile,attempts,state,reason,native_guid,roster_id,native_rank,native_rank_name,request_digest FROM role_settlements WHERE subject=?1').bind(CANONICAL_V1_SMOKE_SUBJECT280).all()).results;
 const control=rows.find(r=>r.purpose==='canonical_identity233'),grant=rows.find(r=>r.purpose==='canonical_consumed233'&&r.attempts===1);
 check('new role receipt retains original canonical profile without mirror or Member stack',grant?.native_profile===CANONICAL_PROFILE233&&grant.role_id===CANONICAL_RANKS233[0].roleId&&grant.state==='settled'&&grant.native_guid===guid&&grant.roster_id===snapshot.id&&grant.native_rank===0&&grant.native_rank_name===NATIVE_NAMES233[0]&&!rows.some(r=>r.attempts===1&&r.role_id!==CANONICAL_RANKS233[0].roleId));
 check('actual control and provider ACK retain their original consumed fingerprint and source facts',control?.native_profile===CANONICAL_PROFILE233&&control.attempts===0&&control.native_guid===guid&&control.roster_id===snapshot.id&&/^[0-9a-f]{64}$/.test(grant.request_digest)&&control.request_digest===grant.request_digest);
 const cap=await captureRoutineMembership232(env,CANONICAL_V1_SMOKE_SUBJECT280);
 try{const facts=cap&&routineMembership232Facts(cap);check('original policy retains separate captured profile and never sets Directive rankQualified',facts?.canonicalRankProfile===CANONICAL_PROFILE233&&facts.rankQualified===false);}finally{if(cap)closeRoutineMembership232(cap);}
 await liveOriginalTableSmoke280(env,writer,venue,check);
 return {...base,DB:writer,PRIVACY_WRITE_ADMISSION_EPOCH:epoch};
}
