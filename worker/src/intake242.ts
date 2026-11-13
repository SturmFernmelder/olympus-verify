/** Authenticated watcher observations; addon role/action fields never confer authority. */
import type {Env} from './env';
import {now,likeArg,audit} from './db';
import {json} from './discord';
import {postVerify} from './ingest';
import {normalizeCharacter} from './codes';
import './treasury-data242';
import {communityContext,admittedRead,FENCE_REFUSED} from './community-context';
import {apiJson} from './site-core';
import {errorRef} from './log';
import {captureLaunchVerification,captureNativeMembershipProof,verifyNativeMembershipProof} from './launch-verification227';
import {nativeMembershipSourceMatches,nativeMembershipSourceSql} from './native-rank-schemes';
import {recordTitheReceipt280,ordinaryIntakeShape280,TitheReceiptPolicyHeld280,TitheCollectorPending280,TITHE_SOURCE280,storedTitheShape280} from './tithe-receipt280';
const ACTION='treasury.receipt242',ID=/^[A-Za-z0-9:._-]{1,128}$/;
const createdRoleRequestResponses280=new WeakMap<Response,boolean>();
/** Source-owned creation receipt only; copied/client JSON cannot request a wake. */
export const intakeCreatedRoleRequest280=(response:Response):boolean=>createdRoleRequestResponses280.get(response)===true;
// .251: a valid receipt's original observation fixes its lifetime, regardless of relay arrival.
const RECEIPT_DEADLINE="CASE WHEN json_valid(details) THEN CASE WHEN json_type(details,'$.observedAt')='integer' AND json_extract(details,'$.observedAt')>0 AND json_extract(details,'$.observedAt')<=ts+5 AND json_type(details,'$.retainUntil')='integer' AND json_extract(details,'$.retainUntil')=json_extract(details,'$.observedAt')+2592000 THEN json_extract(details,'$.retainUntil') END END";
/** One fixed page, independent of new uploads. Root must charge its measured
 * Native cost in the existing schedule before wiring a quiet cron call. */
export async function purgeReceipt242(env:Env):Promise<{deleted:number;limit:100}>{
 const result=await env.DB.prepare(`DELETE FROM audit WHERE id IN(SELECT id FROM audit WHERE action='treasury.receipt242' AND COALESCE((${RECEIPT_DEADLINE}),ts+2592000)<=CAST(strftime('%s','now') AS INTEGER) ORDER BY id LIMIT 100)`).run();
 const deleted=result.meta.changes;if(!result.success||!Number.isSafeInteger(deleted)||deleted<0||deleted>100)throw Error('receipt_retention_unknown');
 return {deleted,limit:100};
}
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';
const hash=async(v:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v)))),b=>b.toString(16).padStart(2,'0')).join('');
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const mac=async(env:Env,message:string)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VERIFY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))).slice(0,32);};
const equal=(a:string,b:unknown)=>{if(typeof b!=='string'||!/^[0-9a-f]{32}$/.test(b))return false;let x=0;for(let i=0;i<32;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
async function mailWitness242(env:Env,e:Record<string,unknown>,name:string,code:string):Promise<{guid:string;nativeMembership:unknown}|null>{
 const p=e.mailProof242 as Record<string,unknown>|undefined,launch=captureLaunchVerification(env);
 if(!p||launch.mode!=='members-only'||!launch.scope||p.version!==242||p.sender!==name||p.code!==code||p.guild!==launch.scope.guild||p.realm!==launch.scope.realm||typeof p.collectorGuid!=='string'||!/^Player-[0-9]+-[0-9A-Fa-f]+$/.test(p.collectorGuid)||typeof p.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(p.fingerprint)||!Number.isSafeInteger(p.observedAt)||Number(p.observedAt)<=now()-600||Number(p.observedAt)>now()+5)return null;
 const message=['mail-origin','242',normalizeCharacter(name),code,p.observedAt,p.guild,p.realm,p.collectorGuid,p.fingerprint].join('|');
 if(!equal(await mac(env,message),p.mac)||!launch.current())return null;
 // Native mail supplied identity; roster supplies only the unique current GUID corroboration, never code/ownership.
 const rows=await env.DB.prepare(`SELECT r.guid,s.source FROM roster_members r JOIN roster_snapshots s ON s.id=r.snapshot_id WHERE r.name_key=?1 AND s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND ${nativeMembershipSourceSql('s.source','?2')} AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER) AND s.member_count=(SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id) AND EXISTS(SELECT 1 FROM roster_members collector WHERE collector.snapshot_id=s.id AND collector.guid=?3) LIMIT 2`).bind(normalizeCharacter(name),launch.scope.provenance,p.collectorGuid).all<{guid:string;source:string}>();
 if(rows.results.length!==1||!/^Player-[0-9]+-[0-9A-Fa-f]+$/.test(rows.results[0]!.guid)||!launch.current()||!nativeMembershipSourceMatches(rows.results[0]!.source,launch.scope.guild,launch.scope.realm))return null;
 const guid=rows.results[0]!.guid,scopeHash=(await hashText('native-scope|1|'+launch.scope.guild+'|'+launch.scope.realm)).slice(0,16),observedAt=Number(p.observedAt);
 const nativeMembership={version:1,member:true,observedAt,scopeHash,mac:await mac(env,['membership','1',normalizeCharacter(name),guid,code,'1',observedAt,scopeHash].join('|'))};
 if(!launch.current()||observedAt<=now()-600)return null;
 return {guid,nativeMembership};
}
const hashText=async(v:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
async function nativeDiscord242(env:Env,e:Record<string,unknown>,subject:string,guid:string,name:string):Promise<boolean>{
 const p=e.nativeDiscord as Record<string,unknown>|undefined,launch=captureLaunchVerification(env);
 if(!p||launch.mode!=='members-only'||!launch.scope||p.version!==242||p.fromDiscord!==true||p.userID!==subject||p.lastOnlineGUID!==guid||p.lastOnlineName!==name||p.guild!==launch.scope.guild||p.realm!==launch.scope.realm||!Number.isSafeInteger(p.observedAt)||Number(p.observedAt)<=now()-600||Number(p.observedAt)>now()+5||typeof p.collectorGuid!=='string')return false;
 const message=['native-discord','242',subject,guid,normalizeCharacter(name),p.observedAt,p.guild,p.realm,p.collectorGuid].join('|');
 if(!equal(await mac(env,message),p.mac)||!launch.current())return false;
 const snapshot=await env.DB.prepare(`SELECT s.id,s.source FROM roster_snapshots s WHERE s.id=(SELECT MAX(id) FROM roster_snapshots) AND s.complete=1 AND s.trusted=1 AND ${nativeMembershipSourceSql('s.source','?1')} AND s.exported_at>CAST(strftime('%s','now') AS INTEGER)-600 AND s.exported_at<=CAST(strftime('%s','now') AS INTEGER) AND s.member_count=(SELECT COUNT(*) FROM roster_members x WHERE x.snapshot_id=s.id) AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND r.guid=?2 AND r.name_key=?3) AND EXISTS(SELECT 1 FROM roster_members r WHERE r.snapshot_id=s.id AND r.guid=?4)`).bind(launch.scope.provenance,guid,normalizeCharacter(name),p.collectorGuid).first<{id:number;source:string}>();
 if(!snapshot||!launch.current()||!nativeMembershipSourceMatches(snapshot.source,launch.scope.guild,launch.scope.realm))return false;
 await audit(env,'watcher','guild.discord_observation242',subject,{guid,character:name,observedAt:p.observedAt,source:'native-discord-event242'});
 return launch.current();
}
export async function postIntake242(env:Env,body:{entries?:unknown}):Promise<Response>{
 const rows=Array.isArray(body.entries)?body.entries:body.entries&&typeof body.entries==='object'?Object.values(body.entries):null;
 if(!rows||rows.length>25)return json({error:'entries_limit_25'},400);
 const acknowledgements:Record<string,unknown>[]=[],deferred:Record<string,unknown>[]=[],policyHolds:Record<string,unknown>[]=[];let createdAny=false;
 // Bounded retention of this evidence family only; no unrelated audit history touched.
 // Unreadable historical deadlines stay hidden; arrival+30 days remains their deletion-only fallback bound.
 await purgeReceipt242(env);
 for(const value of rows){
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  const e=value as Record<string,unknown>,id=typeof e.id==='string'?e.id:'';
  if(!ID.test(id))continue;
  if(e.type!=='donation'&&!ordinaryIntakeShape280(e)){policyHolds.push({id,outcome:'intake_policy_held'});continue;}
  const character=e.type==='donation'&&typeof e.character==='string'?e.character:clean(e.character??e.name,100),base={id,character,guid:clean(e.guid,40)};
  try{
   const launch=captureLaunchVerification(env);
   if(['verify','role','guild'].includes(String(e.type))&&typeof e.guild==='string'&&launch.mode==='members-only'&&launch.scope&&e.guild!==launch.scope.guild){deferred.push({...base,outcome:'approved_branch_authority_pending',originalNoEffect:true});continue;}
   if(e.type==='donation'){acknowledgements.push({...base,status:'done',outcome:await recordTitheReceipt280(env,e)});continue;}
   if(e.type==='verify'){
    const observedAt=Number(e.observedAt??e.requestedAt??e.ts);let proof=e.nativeMembership,guid=clean(e.guid,40);
    if(e.source==='mail'&&e.mailProof242){const witness=await mailWitness242(env,e,character,String(e.code??''));if(witness){proof=witness.nativeMembership;guid=witness.guid;}}
    if(!Number.isSafeInteger(observedAt)||observedAt<1||observedAt>now()+5){acknowledgements.push({...base,status:'rejected',outcome:'invalid_source_time'});continue;}
    if(observedAt<=now()-600){acknowledgements.push({...base,status:'rejected',outcome:'source_expired'});continue;}
    if(!proof||!guid){acknowledgements.push({...base,status:'rejected',outcome:'membership-proof-required'});continue;}
    const response=await postVerify(env,{character,code:String(e.code??''),source:e.source==='mail'?'mail':'whisper',ts:observedAt,guid,nativeMembership:proof});
    const result=await response.json() as Record<string,unknown>;let outcome=String(result.result??'outcome_unknown');
    if(outcome==='no_pending'){
     const launch=captureLaunchVerification(env),captured=captureNativeMembershipProof(proof);
     const positive=await verifyNativeMembershipProof(env,launch,captured,character,guid,String(e.code??''));
     if(positive?.member===true){const known=await env.DB.prepare("SELECT c.discord_id FROM characters c WHERE c.guid=?1 AND c.name_key=?2 AND c.status='member' AND c.verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM members m WHERE m.discord_id=c.discord_id AND m.banned=1) AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=c.discord_id AND p.state<>'active') LIMIT 2").bind(guid,normalizeCharacter(character)).all<{discord_id:string}>();if(known.results.length===1&&launch.current())outcome='already_verified';}
    }
    if(outcome==='membership_source_pending'){deferred.push({...base,outcome,originalNoEffect:true});continue;}
    if(response.status>=500||outcome==='outcome_unknown'||outcome==='privacy_held')continue;
    const done=['verified','member','resumed','already_verified'].includes(outcome);
    acknowledgements.push({...base,guid,status:done?'done':'rejected',outcome});continue;
   }
   if(e.type==='role'||e.type==='guild'){
    // Existing server-owned GUID link only. Names, rank and remote roleId/action are hints, never a new binding.
    const guid=clean(e.guid,40);if(!/^Player-[0-9]+-[0-9A-Fa-f]+$/.test(guid)){acknowledgements.push({...base,status:'rejected',outcome:'existing_guid_link_required'});continue;}
    const linked=await env.DB.prepare('SELECT discord_id,name FROM characters WHERE guid=?1 AND name_key=?2 AND status=\'member\' LIMIT 2').bind(guid,normalizeCharacter(character)).all<{discord_id:string;name:string}>();
    if(linked.results.length!==1){acknowledgements.push({...base,status:'rejected',outcome:'existing_guid_link_required'});continue;}
    if(e.source==='native-discord-event242'&&!await nativeDiscord242(env,e,linked.results[0]!.discord_id,guid,character)){acknowledgements.push({...base,status:'rejected',outcome:'native_discord_observation_not_qualified'});continue;}
    const {requestRoleReconciliation242}=await import('./role-reconcile242');
    const requested=await requestRoleReconciliation242(env,linked.results[0]!.discord_id,'authenticated-addon-intake');
    if(requested.kind!=='created'&&requested.kind!=='already_pending')continue;
    if(requested.kind==='created')createdAny=true;
    acknowledgements.push({...base,status:'done',outcome:'server_reconciliation_requested'});continue;
   }
   acknowledgements.push({...base,status:'rejected',outcome:'unsupported_intake_type'});
  }catch(error){if(error instanceof TitheReceiptPolicyHeld280){policyHolds.push({id,outcome:'intake_policy_held'});continue;}if(error instanceof TitheCollectorPending280){deferred.push(error.original);continue;}console.error('intake242',errorRef(error));/* no ACK for an unknown write/transport outcome */}
 }
 const response=json({version:242,acknowledgements,deferred,policyHolds});createdRoleRequestResponses280.set(response,createdAny);return response;
}
/** Existing authenticated staff admission; cursor pagination and literal LIKE escaping. */
export async function treasuryLedger242(request:Request,env:Env):Promise<Response>{
 const ctx=await communityContext(env,request),url=new URL(request.url),before=Math.max(0,Number(url.searchParams.get('cursor'))||0),q=likeArg((url.searchParams.get('q')??'').slice(0,100));
 if(!ctx.capabilities.communityStaff)return apiJson({error:'forbidden'},403);
 const results=await admittedRead(env,ctx,'applicantWrite',[env.DB.prepare(`SELECT id,ts,CASE WHEN json_valid(details) THEN json_remove(details,'$.note','$.items') ELSE '{}' END AS details FROM audit WHERE action=?1 AND (?2=0 OR id<?2) AND (${RECEIPT_DEADLINE})>CAST(strftime('%s','now') AS INTEGER) AND ((CASE WHEN json_valid(details) THEN CASE WHEN json_type(details,'$.character')='text' THEN json_extract(details,'$.character') ELSE '' END ELSE '' END) LIKE ?3 ESCAPE '\\' OR (CASE WHEN json_valid(details) THEN CASE WHEN json_type(details,'$.guid')='text' THEN json_extract(details,'$.guid') ELSE '' END ELSE '' END) LIKE ?3 ESCAPE '\\' OR (CASE WHEN json_valid(details) THEN CASE WHEN json_type(details,'$.reference')='text' THEN json_extract(details,'$.reference') ELSE '' END ELSE '' END) LIKE ?3 ESCAPE '\\') ORDER BY id DESC LIMIT 101`).bind(ACTION,before,q)]);
 if(results===FENCE_REFUSED)return apiJson({error:'forbidden'},403);
 const rows=results[0]!.results as {id:number;ts:number;details:string}[];
 return apiJson({classification:'unclassified_receipts',rows:rows.slice(0,100).map(r=>{const parsed=JSON.parse(r.details),d=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{},current=storedTitheShape280(d,r.ts);return {id:r.id,source:current?TITHE_SOURCE280:'legacy_capture_held',donor:typeof d.character==='string'?d.character:'Unclassified legacy record',donorGuid:typeof d.guid==='string'?d.guid:'',copper:Number.isSafeInteger(d.copper)?d.copper:0,items:[],note:'',at:Number.isSafeInteger(d.observedAt)?d.observedAt:null,status:current?'unclassified_receipt':'legacy_capture_held',reference:current?d.reference:null,kind:current?d.kind:null,evidence:current?{kind:d.evidence.kind,confirmedLocal:d.evidence.confirmedLocal,automaticCredit:d.evidence.automaticCredit}:null};}),nextCursor:rows.length>100?String(rows[99]!.id):null});
}
