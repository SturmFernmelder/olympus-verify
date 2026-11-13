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
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {parseLaunchNativeScope} from '../src/launch-verification227.ts';

const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const policy=(version,profile,enabled=true)=>JSON.stringify({version,enabled,profile,guildId:CANONICAL_GUILD233,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
export const CANONICAL_V1_SMOKE_SUBJECT280='800000000000000399';
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
 return {...base,DB:writer,PRIVACY_WRITE_ADMISSION_EPOCH:epoch};
}
