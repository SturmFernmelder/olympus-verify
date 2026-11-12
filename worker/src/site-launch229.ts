/** Read-only launch operations view. Existing Native roster/links; no new storage or queue writes. */
import type { Env } from './env';
import { linksNotBefore, now } from './db';
import { API, credentialFetch } from './discord';
import { apiJson } from './site-core';
import { captureLaunchVerification, type LaunchVerificationCapture } from './launch-verification227';
import { FLAGSHIP_GUILD_NAME, canonicalOlympusGuildName } from './guild-affiliation229';
import { readOfficerInvites233 } from './officer-invites233';
import { classifyKnightRoles229, needsLaunchRole229, projectLaunchOperations229, projectSelectedPromotions274, SELECTED_PROMOTION_TTL274, LAUNCH_ROLE_PAGE229, LAUNCH_ROLE_TTL229, LAUNCH_SCAN_TTL229, LAUNCH_OPERATIONS_PROTOCOL229, type KnightState229, type LaunchRosterRow229 } from './launch-operations229';
import { LaunchRolePacer271 } from './launch-discord-reads271';
import { captureRosterLineage275,rosterVerificationSql275,type RosterLineageCapture275 } from './roster-verification275';

type SourceRow229 = LaunchRosterRow229 & {
  snapshotId: number; snapshotAt: number; memberCount: number; discordId: string | null;
  nativeSource: string; nativeContentHash: string | null; nativeNameKey: string;
  nativeClass: string | null; publicNote: string | null; officerNote: string | null;
  linkedGuid: string | null; linkStatus: string | null; linkSource: string | null;
  verifiedAt: unknown; boundAt: unknown; guidLinks: number | null;
  banned: number; denied: number; privacyGeneration: string | null;
  privacyState: string | null; privacyRevision: number | null; lineageAnchorId:string|null;
};
type RoleRead229 = [guid: string, state: 'knight' | 'non-knight', observedAt: number, identityDigest?: string];
type Cursor229 = {version: 1 | 2 | 3; snapshotId: number; snapshotAt: number; scopeHash: string; rowsDigest: string; offset: number; issuedAt: number; expiresAt: number; roleScope?: string; roleReads?: RoleRead229[]};
export type PromotionSelection273 = Readonly<{selectionId:string;targetGuid:string;snapshotId:number;snapshotAt:number}>;
type SelectionCursor273 = Omit<Cursor229,'version'|'roleReads'|'roleScope'> & PromotionSelection273 & {version:4;roleScope:string;roleReads:RoleRead229[]};
const SELECTION_PROTOCOL274='promotion-selection-v274';
const GUID273=/^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/;
class LaunchCursor229 extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const digest229 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const held229 = (at: number, reason: string) => {const dto = projectLaunchOperations229(null, [], new Map(), at, at + LAUNCH_ROLE_TTL229); dto.heldReasons.push(reason); return dto;};
const bytes229 = (value: string) => new Uint8Array(value.match(/../g)!.map(n => parseInt(n, 16)));
function encoded229(value: string) { return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function secret229(env: Env): string | null { const d=Object.getOwnPropertyDescriptor(env,'VERIFY_SECRET');return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&d.value?d.value:null; }
async function cursorKey229(secret: string) {return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function writeCursor229(value: Cursor229, secret: string) {const body=encoded229(JSON.stringify(value)),mac=hex(await crypto.subtle.sign('HMAC',await cursorKey229(secret),new TextEncoder().encode('officer-operations-cursor|233|'+body)));return body+'.'+mac;}
async function readCursor229(raw: string, secret: string, at: number, roleSecret271: string | null, roleSecret272: string | null): Promise<Cursor229> {
  if(raw.length>4096||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(raw))throw new LaunchCursor229('invalid_launch_cursor');
  const [body,mac]=raw.split('.');
  let v: Cursor229;try{const decoded=atob(body.replace(/-/g,'+').replace(/_/g,'/'));v=JSON.parse(decoded);if(encoded229(JSON.stringify(v))!==body)throw Error();}catch{throw new LaunchCursor229('invalid_launch_cursor');}
  // VERIFY_SECRET also exists on the officer client. It can select legacy pages,
  // but must never mint or redate a cached Discord entitlement. V2/V3 require a
  // separate purpose key derived from the existing server-only bot credential.
  const key=v?.version===3?roleSecret272:v?.version===2?roleSecret271:secret;
  if(!key||!await crypto.subtle.verify('HMAC',await cursorKey229(key),bytes229(mac),new TextEncoder().encode('officer-operations-cursor|233|'+body)))throw new LaunchCursor229('invalid_launch_cursor');
  if(!v||![1,2,3].includes(v.version)||Object.keys(v).sort().join(',')!==(v.version===1?'expiresAt,issuedAt,offset,rowsDigest,scopeHash,snapshotAt,snapshotId,version':'expiresAt,issuedAt,offset,roleReads,roleScope,rowsDigest,scopeHash,snapshotAt,snapshotId,version')
    ||!Number.isSafeInteger(v.snapshotId)||v.snapshotId<1||!Number.isSafeInteger(v.snapshotAt)||!Number.isSafeInteger(v.offset)||v.offset<0||v.offset>=1000||v.offset%LAUNCH_ROLE_PAGE229!==0
    ||!Number.isSafeInteger(v.issuedAt)||!Number.isSafeInteger(v.expiresAt)||v.issuedAt>at||v.expiresAt!==Math.min(v.issuedAt+LAUNCH_SCAN_TTL229,v.snapshotAt+LAUNCH_SCAN_TTL229)||v.expiresAt<=at
    ||!/^[a-f0-9]{16}$/.test(v.scopeHash)||!/^[a-f0-9]{64}$/.test(v.rowsDigest))throw new LaunchCursor229('expired_or_invalid_launch_cursor');
  if(v.version!==1&&(!/^[a-f0-9]{64}$/.test(v.roleScope??'')||!Array.isArray(v.roleReads)||v.roleReads.length>LAUNCH_ROLE_PAGE229
    ||v.roleReads.some(r=>!Array.isArray(r)||r.length!==(v.version===3?4:3)||typeof r[0]!=='string'||!/^Player-\d{1,6}-[0-9A-Fa-f]{4,16}$/.test(r[0])
      ||!['knight','non-knight'].includes(r[1])||!Number.isSafeInteger(r[2])||r[2]<v.issuedAt||r[2]>at
      ||v.version===3&&!/^[a-f0-9]{64}$/.test(r[3]??''))
    ||new Set(v.roleReads.map(r=>r[0])).size!==v.roleReads.length))throw new LaunchCursor229('invalid_launch_cursor');
  return v;
}
function selection273(input:unknown,cursor:string|null,at:number):PromotionSelection273 {
  if(!input||typeof input!=='object'||Reflect.ownKeys(input).map(String).sort().join(',')!=='selectionId,snapshotAt,snapshotId,targetGuid')throw new LaunchCursor229('invalid_selection_request');
  const values:Record<string,unknown>={};
  for(const name of ['selectionId','targetGuid','snapshotId','snapshotAt']){const d=Object.getOwnPropertyDescriptor(input,name);if(!d||!Object.hasOwn(d,'value'))throw new LaunchCursor229('invalid_selection_request');values[name]=d.value;}
  const {selectionId,targetGuid,snapshotId,snapshotAt}=values,match=typeof selectionId==='string'&&/^([0-9]{9,11}):[0-9]{1,10}$/.exec(selectionId);
  if(!match||typeof targetGuid!=='string'||!GUID273.test(targetGuid)||!Number.isSafeInteger(snapshotId)||(snapshotId as number)<1||!Number.isSafeInteger(snapshotAt)||(snapshotAt as number)<1)throw new LaunchCursor229('invalid_selection_request');
  const issued=Number(match[1]);
  if(!Number.isSafeInteger(issued)||issued>at+5||!cursor&&issued<at-60)throw new LaunchCursor229('expired_selection_request');
  return Object.freeze({selectionId:selectionId as string,targetGuid,snapshotId:snapshotId as number,snapshotAt:snapshotAt as number});
}
async function writeSelectionCursor273(value:SelectionCursor273,secret:string){
  const body=encoded229(JSON.stringify(value)),mac=hex(await crypto.subtle.sign('HMAC',await cursorKey229(secret),new TextEncoder().encode('promotion-selection-cursor|273|'+body)));
  return body+'.'+mac;
}
async function readSelectionCursor273(raw:string,secret:string,selection:PromotionSelection273,at:number):Promise<SelectionCursor273>{
  if(raw.length>4096||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(raw))throw new LaunchCursor229('invalid_selection_cursor');
  const [body,mac]=raw.split('.');let v:SelectionCursor273;
  try{v=JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));if(encoded229(JSON.stringify(v))!==body)throw Error();}catch{throw new LaunchCursor229('invalid_selection_cursor');}
  if(!await crypto.subtle.verify('HMAC',await cursorKey229(secret),bytes229(mac),new TextEncoder().encode('promotion-selection-cursor|273|'+body)))throw new LaunchCursor229('invalid_selection_cursor');
  if(!v||v.version!==4||Object.keys(v).sort().join(',')!=='expiresAt,issuedAt,offset,roleReads,roleScope,rowsDigest,scopeHash,selectionId,snapshotAt,snapshotId,targetGuid,version'
    ||v.selectionId!==selection.selectionId||v.targetGuid!==selection.targetGuid||v.snapshotId!==selection.snapshotId||v.snapshotAt!==selection.snapshotAt
    ||v.issuedAt!==Number(selection.selectionId.split(':')[0])||v.issuedAt>at||!Number.isSafeInteger(v.expiresAt)||v.expiresAt!==Math.min(v.issuedAt+LAUNCH_SCAN_TTL229,v.snapshotAt+LAUNCH_SCAN_TTL229)||v.expiresAt<=at
    ||!Number.isSafeInteger(v.offset)||v.offset<0||v.offset>=1000||v.offset%LAUNCH_ROLE_PAGE229!==0||!/^[a-f0-9]{16}$/.test(v.scopeHash)||!/^[a-f0-9]{64}$/.test(v.rowsDigest)||!/^[a-f0-9]{64}$/.test(v.roleScope)
    ||!Array.isArray(v.roleReads)||v.roleReads.length>LAUNCH_ROLE_PAGE229||v.roleReads.some(r=>!Array.isArray(r)||r.length!==4||typeof r[0]!=='string'||!GUID273.test(r[0])||!['knight','non-knight'].includes(r[1])||!Number.isSafeInteger(r[2])||r[2]<v.issuedAt||r[2]>at||typeof r[3]!=='string'||!/^[a-f0-9]{64}$/.test(r[3]))||new Set(v.roleReads.map(r=>r[0])).size!==v.roleReads.length)throw new LaunchCursor229('invalid_selection_cursor');
  return v;
}
async function sourceRows229(env: Env, launch: LaunchVerificationCapture, at: number, cutoff: number,lineage:RosterLineageCapture275): Promise<SourceRow229[]> {
  const verification=rosterVerificationSql275('?2','?3','?4','?5');
  const rows=await env.DB.prepare(`WITH snapshot AS MATERIALIZED (
    SELECT id,exported_at,member_count,source,content_hash FROM roster_snapshots
    WHERE id=(SELECT MAX(id) FROM roster_snapshots) AND source=?1 AND complete=1 AND trusted=1
      AND member_count BETWEEN 1 AND 1000 AND exported_at BETWEEN MAX(?3,?2-599) AND ?2
      AND member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=roster_snapshots.id)
  ), linked_guids AS MATERIALIZED (SELECT guid,COUNT(*) AS links FROM characters WHERE guid IS NOT NULL GROUP BY guid),
  native_guids AS MATERIALIZED (SELECT rm.guid,COUNT(*) AS links FROM roster_members rm JOIN snapshot s ON s.id=rm.snapshot_id
    WHERE rm.guid IS NOT NULL GROUP BY rm.guid)
  SELECT s.id AS snapshotId,s.exported_at AS snapshotAt,s.member_count AS memberCount,
    rm.name,rm.guid,rm.rank,rm.rank_index AS currentSlot,rm.level,rm.last_online AS lastOnlineSeconds,
    ${verification.status} AS verification,
    c.discord_id AS discordId,
    s.source AS nativeSource,s.content_hash AS nativeContentHash,rm.name_key AS nativeNameKey,
    rm.class AS nativeClass,rm.public_note AS publicNote,rm.officer_note AS officerNote,
    c.guid AS linkedGuid,c.status AS linkStatus,c.source AS linkSource,
    c.verified_at AS verifiedAt,c.bound_at AS boundAt,g.links AS guidLinks,
    COALESCE(m.banned,0) AS banned,COALESCE(u.denied,0) AS denied,
    p.generation AS privacyGeneration,p.state AS privacyState,p.revision AS privacyRevision,
    ${verification.anchorId} AS lineageAnchorId
  FROM snapshot s JOIN roster_members rm ON rm.snapshot_id=s.id
  LEFT JOIN characters c ON c.name_key=rm.name_key LEFT JOIN linked_guids g ON g.guid=rm.guid
  LEFT JOIN native_guids ng ON ng.guid=rm.guid
  LEFT JOIN members m ON m.discord_id=c.discord_id LEFT JOIN site_users u ON u.discord_id=c.discord_id
  LEFT JOIN privacy_subjects p ON p.subject_id=c.discord_id
  ORDER BY rm.name_key LIMIT 1000`).bind(launch.scope!.provenance,at,cutoff,lineage.nativePolicy,lineage.canonicalPolicy).all<SourceRow229>();
  if(!rows.success)throw Error('launch_source_read_unavailable');return rows.results;
}
/** V1/V2 keep their original global authority digest; never reinterpret an old cache. */
function legacyRows229(rows: readonly SourceRow229[]) {
  return rows.map(row=>({snapshotId:row.snapshotId,snapshotAt:row.snapshotAt,memberCount:row.memberCount,
    name:row.name,guid:row.guid,rank:row.rank,currentSlot:row.currentSlot,level:row.level,
    lastOnlineSeconds:row.lastOnlineSeconds,verification:row.verification,discordId:row.discordId}));
}
/** Native pagination identity excludes live verification activity, not native fields. */
function nativeRows272(rows: readonly SourceRow229[]) {
  return rows.map(row=>[row.snapshotId,row.snapshotAt,row.memberCount,row.nativeSource,row.nativeContentHash,
    row.nativeNameKey,row.name,row.guid,row.rank,row.currentSlot,row.level,row.nativeClass,
    row.publicNote,row.officerNote,row.lastOnlineSeconds]);
}
function roleIdentity272(row: SourceRow229) {
  return digest229(JSON.stringify(['launch-role-subject',272,row.guid,row.verification,row.discordId,
    row.linkedGuid,row.linkStatus,row.linkSource,row.verifiedAt,row.boundAt,row.guidLinks,row.banned,row.denied,
    row.privacyGeneration,row.privacyState,row.privacyRevision,row.lineageAnchorId]));
}
function roleConfiguration229(env: Env) {
  const keys=['SITE_GUILD_ID','DISCORD_BOT_TOKEN'] as const,values=keys.map(key=>Object.getOwnPropertyDescriptor(env,key));
  if(values.some(d=>!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value))return null;
  const guild=values[0]!.value as string,token=values[1]!.value as string;if(!/^\d{17,20}$/.test(guild))return null;
  return {guild,token,current:()=>keys.every((key,i)=>{const d=Object.getOwnPropertyDescriptor(env,key);return !!d&&Object.hasOwn(d,'value')&&d.value===values[i]!.value;})};
}
export async function readLaunchOperations229(env: Env, cursor: string | null = null) {return readLaunchPage229(env,cursor);}
export async function readPromotionSelection273(env:Env,input:unknown,cursor:string|null=null){
  const selection=selection273(input,cursor,now());let coveredGuids:string[]=[];
  const page=await readLaunchPage229(env,cursor,selection,guids=>{coveredGuids=guids;});
  return {version:1 as const,protocol:SELECTION_PROTOCOL274,controlId:selection.selectionId,targetGuid:selection.targetGuid,coveredGuids,page};
}
async function readLaunchPage229(env: Env, cursor: string | null = null,selection:PromotionSelection273|null=null,coverage?:(guids:string[])=>void) {
  const at=now(),launch=captureLaunchVerification(env),secret=secret229(env);
  if(launch.mode!=='members-only'||!launch.scope||!launch.current()||canonicalOlympusGuildName(launch.scope.guild)!==FLAGSHIP_GUILD_NAME)return held229(at,'flagship-native-scope-unconfirmed');
  const lineage=captureRosterLineage275(env,launch);
  if(!secret)return held229(at,'native-secret-unconfigured');
  const configuration=roleConfiguration229(env);
  const roleSecret271=configuration?JSON.stringify(['officer-role-cursor',271,secret,configuration.guild,configuration.token]):null;
  const roleSecret272=configuration?JSON.stringify(['officer-role-cursor',272,secret,configuration.guild,configuration.token]):null;
  const selectionSecret=configuration?JSON.stringify(['promotion-selection-cursor',273,secret,configuration.guild,configuration.token]):null;
  if(selection&&(!selectionSecret||Number(selection.selectionId.split(':')[0])>at))return held229(at,'selection-source-not-current');
  const captured=cursor?(selection?await readSelectionCursor273(cursor,selectionSecret!,selection,at):await readCursor229(cursor,secret,at,roleSecret271,roleSecret272)):null,cutoff=linksNotBefore(env),rows=await sourceRows229(env,launch,at,cutoff,lineage),first=rows[0];
  if(!first||rows.length!==first.memberCount){if(captured)throw new LaunchCursor229('launch_cursor_source_changed',409);return held229(at,'native-snapshot-unavailable');}
  if(selection&&(selection.snapshotId!==first.snapshotId||selection.snapshotAt!==first.snapshotAt))throw new LaunchCursor229('selection_native_source_changed',409);
  const selectedIndices=selection?rows.flatMap((row,index)=>row.guid===selection.targetGuid?[index]:[]):[];
  if(selection&&selectedIndices.length!==1)return held229(at,'selected-target-unavailable');
  const legacy=captured?.version===1||captured?.version===2||!roleSecret272;
  const scopeHash=(await digest229('native-scope|1|'+launch.scope.guild+'|'+launch.scope.realm)).slice(0,16),nativeDigest=await digest229(JSON.stringify(nativeRows272(rows)));
  const rowsDigest=legacy?await digest229(JSON.stringify(legacyRows229(rows))):nativeDigest;
  if(captured&&(captured.snapshotId!==first.snapshotId||captured.snapshotAt!==first.snapshotAt||captured.scopeHash!==scopeHash||captured.rowsDigest!==rowsDigest))throw new LaunchCursor229('launch_cursor_source_changed',409);
  const issuedAt=captured?.issuedAt??(selection?Number(selection.selectionId.split(':')[0]):at),scanExpiresAt=captured?.expiresAt??Math.min(issuedAt+LAUNCH_SCAN_TTL229,first.snapshotAt+LAUNCH_SCAN_TTL229),offset=captured?.offset??(selection?Math.floor(selectedIndices[0]!/LAUNCH_ROLE_PAGE229)*LAUNCH_ROLE_PAGE229:0);
  if(selection&&offset!==Math.floor(selectedIndices[0]!/LAUNCH_ROLE_PAGE229)*LAUNCH_ROLE_PAGE229)throw new LaunchCursor229('launch_cursor_source_changed',409);
  const observationTtl=selection?SELECTED_PROMOTION_TTL274:LAUNCH_ROLE_TTL229;
  let expiresAt=Math.min(at+observationTtl,scanExpiresAt);
  const scanId=(await digest229(JSON.stringify(selection?['promotion-selection',273,selection.selectionId,selection.targetGuid,scopeHash,rowsDigest,issuedAt,scanExpiresAt]:['officer-operations-scan',233,scopeHash,rowsDigest,issuedAt,scanExpiresAt]))).slice(0,32);
  const page=rows.slice(offset,offset+LAUNCH_ROLE_PAGE229),roleRows=page.filter(needsLaunchRole229),states=new Map<string,KnightState229>();
  const coveredGuids=page.map(row=>row.guid);
  if(selection&&(coveredGuids.some(g=>typeof g!=='string'||!GUID273.test(g))||new Set(coveredGuids).size!==coveredGuids.length))return held229(at,'selected-native-page-ambiguous');
  // The signed exact Native digest and offset derive this same coverage on
  // every retry. Repeating20GUIDs in the cursor would exceed4096bytes when a
  // late429 preserves19maximum-length identity-bound role observations.
  const pageDigest=await digest229(JSON.stringify(page));
  const identities=new Map(await Promise.all(roleRows.map(async row=>[row.guid,await roleIdentity272(row)] as const)));
  // The signed retry cursor carries only this page's exact prior successes, with
  // their original observation dates. Successful/recheck cursors carry none.
  const roleScope=await digest229('launch-role-scope|271|'+(configuration?.guild??'')+'|'+(configuration?.token??''));
  const reads=new Map<string,RoleRead229>();
  if(captured&&captured.version!==1){
    if(captured.roleScope!==roleScope||captured.roleReads!.some(r=>!roleRows.some(row=>row.guid===r[0])))throw new LaunchCursor229('launch_cursor_role_source_changed',409);
    for(const read of captured.roleReads!)if(read[2]+LAUNCH_ROLE_TTL229>at
      &&(captured.version===2||read[3]===identities.get(read[0])))reads.set(read[0],read);
  }
  let retryAfterSeconds: number|null=null,rateLimited=false,roleUnavailable=false,readWindowHeld=false;
  const pacer=new LaunchRolePacer271(roleScope),accountStates=new Map<string,{state:KnightState229;observedAt:number}>();
  const current=()=>{if(!launch.current()||!lineage.current()||configuration&&!configuration.current()||secret229(env)!==secret||linksNotBefore(env)!==cutoff||selection&&now()>=scanExpiresAt)throw Error('launch_source_changed');};
  // The Watcher has a 20-second HTTP timeout. Don't hold that request through a
  // long reset; return its signed progress and known cooldown to the same scan.
  const readDeadline=Math.min(Date.now()/1000+10,expiresAt,scanExpiresAt);
  for(const row of roleRows){
    const saved=reads.get(row.guid);
    if(saved){states.set(row.guid,saved[1]);expiresAt=Math.min(expiresAt,saved[2]+observationTtl);continue;}
    const id=row.discordId??'';
    if(!configuration||!/^\d{17,20}$/.test(id)||rateLimited||readWindowHeld){states.set(row.guid,'unknown');continue;}
    let observation=accountStates.get(id);
    if(!observation){
      observation={state:'unknown',observedAt:now()};
      try{
        current();
        if(!await pacer.wait(readDeadline,current)){
          if(pacer.cooling()){rateLimited=true;retryAfterSeconds=pacer.delay();}else readWindowHeld=true;
          states.set(row.guid,'unknown');continue;
        }
        current();observation.observedAt=now();
        // At most one attempt for each account in this page, serial/header-paced.
        const response=await credentialFetch(API+'/guilds/'+configuration.guild+'/members/'+id,{method:'GET',headers:{Authorization:'Bot '+configuration.token,'Content-Type':'application/json'}},current);
        current();
        if(response.status===429){rateLimited=true;retryAfterSeconds=await pacer.limited(response);current();}
        else if(!response.ok){roleUnavailable=true;await response.body?.cancel();}
        else{
          pacer.success(response);
          const member=await response.json() as {user?:{id?:unknown};roles?:unknown};current();
          if(member?.user?.id===id)observation.state=classifyKnightRoles229(member.roles);
          if(observation.state==='unknown')roleUnavailable=true;
        }
      }catch{roleUnavailable=true;}
      accountStates.set(id,observation);
    }
    states.set(row.guid,observation.state);
    if(observation.state!=='unknown'){
      reads.set(row.guid,legacy?[row.guid,observation.state,observation.observedAt]
        :[row.guid,observation.state,observation.observedAt,identities.get(row.guid)!]);
      expiresAt=Math.min(expiresAt,observation.observedAt+observationTtl);
    }
  }
  // One first-page invite read uses a separate three-request ceiling, so it
  // cannot starve any of the twenty roster evidence rows on that page.
  const invitePage=!selection&&offset===0?(rateLimited||readWindowHeld?{invites:[],heldReasons:['officer-invite-read-deferred']}:
    await readOfficerInvites233(env,{limit:3,attempts:0,retries:0},3,at,{
      before:()=>pacer.wait(readDeadline,current),
      observe:async response=>{if(response.status===429)await pacer.limited(response);else if(response.ok)pacer.success(response);current();},
    })):{invites:[],heldReasons:[]};
  // Re-read the exact Native source and linked/denied/privacy state after provider awaits.
  // For the admin route this also consumes the original signed actor session again.
  const after=await sourceRows229(env,launch,now(),cutoff,lineage);
  if(!launch.current()||!lineage.current()||configuration&&!configuration.current()||secret229(env)!==secret||linksNotBefore(env)!==cutoff
    ||await digest229(JSON.stringify(nativeRows272(after)))!==nativeDigest
    ||legacy&&await digest229(JSON.stringify(legacyRows229(after)))!==rowsDigest)return held229(now(),'native-snapshot-changed');
  // Only this page can consume its current account/privacy facts or cached roles.
  // Activity on another page must not invalidate immutable Native pagination.
  if(await digest229(JSON.stringify(after.slice(offset,offset+LAUNCH_ROLE_PAGE229)))!==pageDigest)return held229(now(),'launch-page-verification-changed');
  if(selection&&now()>=scanExpiresAt)return held229(now(),'selection-read-expired');
  if(readWindowHeld)return held229(now(),'launch-read-window-exhausted');
  const project=selection?projectSelectedPromotions274:projectLaunchOperations229;
  const dto=project({snapshotId:first.snapshotId,snapshotAt:first.snapshotAt,memberCount:first.memberCount,guild:launch.scope.guild,realm:launch.scope.realm,scopeHash},rows,states,now(),expiresAt);
  dto.scan={id:scanId,startedAt:issuedAt,expiresAt:scanExpiresAt};
  const pageGuids=new Set(page.map(row=>row.guid));
  // Page every native row, not just linked accounts: risk/held data stays bounded
  // too, and every GUID can be examined without repeating snapshot-wide rows.
  dto.promotions.splice(0,dto.promotions.length,...dto.promotions.filter(row=>pageGuids.has(row.guid)));
  dto.held.splice(0,dto.held.length,...dto.held.filter(row=>pageGuids.has(row.guid)));
  dto.riskBuffer.splice(0,dto.riskBuffer.length,...dto.riskBuffer.filter(row=>pageGuids.has(row.guid)));
  if(dto.status!=='held')dto.invites.push(...invitePage.invites.filter(row=>row.expiresAt>now()&&row.observedAt<=at+5));
  if(dto.invites.length){const i=dto.heldReasons.indexOf('native-unguilded-proof-required');if(i>=0)dto.heldReasons.splice(i,1);}
  dto.heldReasons.push(...invitePage.heldReasons);
  if(selection){
    dto.riskBuffer.splice(0); // A selected promotion read supplies no purge-review authority.
    const i=dto.heldReasons.indexOf('native-unguilded-proof-required');if(i>=0)dto.heldReasons.splice(i,1);
  }
  dto.entitlements={offset,pageSize:LAUNCH_ROLE_PAGE229,scanned:page.length,total:rows.length,unscanned:Math.max(0,rows.length-offset-page.length),retryAfterSeconds};
  if(rateLimited)dto.heldReasons.push('discord-rate-limited');if(roleUnavailable||!configuration)dto.heldReasons.push('discord-entitlement-unavailable');
  if(dto.status!=='held'){
    const source={snapshotId:first.snapshotId,snapshotAt:first.snapshotAt,scopeHash,rowsDigest,issuedAt,expiresAt:scanExpiresAt};
    if(selection){dto.pageCursor=await writeSelectionCursor273({version:4,...source,...selection,offset,roleScope,roleReads:rateLimited?[...reads.values()]:[]},selectionSecret!);}
    else{
      const roleSecret=legacy?roleSecret271:roleSecret272;
      const witness=roleSecret?{version:legacy?2 as const:3 as const,...source,roleScope,roleReads:[] as RoleRead229[]}:{version:1 as const,...source};
      dto.pageCursor=await writeCursor229({...witness,offset,...(roleSecret?{roleReads:rateLimited?[...reads.values()]:[]}:{})},roleSecret??secret);
      if(offset+page.length<rows.length&&!rateLimited)dto.nextCursor=await writeCursor229({...witness,offset:offset+page.length},roleSecret??secret);
    }
  }
  if(dto.status!=='held')dto.status=dto.entitlements.unscanned||dto.held.some(r=>r.reason==='discord-entitlement-unknown')?'partial':'ready';
  if(!launch.current()||!lineage.current()||configuration&&!configuration.current()||secret229(env)!==secret||linksNotBefore(env)!==cutoff)return held229(now(),'native-snapshot-changed');
  if(selection)coverage?.(coveredGuids as string[]);
  return dto;
}
export async function handleLaunchOperations229(request: Request, env: Env, watcher = false): Promise<Response> {
  const q=new URL(request.url).searchParams,selected=['selectionId','targetGuid','snapshotId','snapshotAt'],hasSelection=selected.some(key=>q.has(key)),allowed=watcher?['keyVersion','cursor',...selected]:['cursor'];
  if(request.method!=='GET'||[...q.keys()].some(k=>!allowed.includes(k))||[...new Set(q.keys())].some(k=>q.getAll(k).length!==1)
    ||watcher&&q.get('keyVersion')!==LAUNCH_OPERATIONS_PROTOCOL229||q.has('cursor')&&!q.get('cursor')||hasSelection&&(!watcher||selected.some(key=>!q.get(key))||!/^\d{1,16}$/.test(q.get('snapshotId')!)||!/^\d{1,16}$/.test(q.get('snapshotAt')!)))return apiJson({error:'invalid_launch_query'},400);
  try{return apiJson(hasSelection?await readPromotionSelection273(env,{selectionId:q.get('selectionId'),targetGuid:q.get('targetGuid'),snapshotId:Number(q.get('snapshotId')),snapshotAt:Number(q.get('snapshotAt'))},q.get('cursor')):await readLaunchOperations229(env,q.get('cursor')),200,{'Cache-Control':'private, no-store, no-transform'});}
  catch(error){if(error instanceof LaunchCursor229)return apiJson({error:error.code},error.status);throw error;}
}
