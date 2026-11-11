/** Read-only launch operations view. Existing Native roster/links; no new storage or queue writes. */
import type { Env } from './env';
import { linksNotBefore, now } from './db';
import { API, credentialFetch } from './discord';
import { apiJson } from './site-core';
import { captureLaunchVerification, type LaunchVerificationCapture } from './launch-verification227';
import { FLAGSHIP_GUILD_NAME, canonicalOlympusGuildName } from './guild-affiliation229';
import { readOfficerInvites233 } from './officer-invites233';
import { classifyKnightRoles229, projectLaunchOperations229, LAUNCH_ROLE_PAGE229, LAUNCH_ROLE_TTL229, LAUNCH_SCAN_TTL229, LAUNCH_OPERATIONS_PROTOCOL229, type KnightState229, type LaunchRosterRow229 } from './launch-operations229';

type SourceRow229 = LaunchRosterRow229 & {snapshotId: number; snapshotAt: number; memberCount: number; discordId: string | null};
type Cursor229 = {version: 1; snapshotId: number; snapshotAt: number; scopeHash: string; rowsDigest: string; offset: number; issuedAt: number; expiresAt: number};
class LaunchCursor229 extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const digest229 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const held229 = (at: number, reason: string) => {const dto = projectLaunchOperations229(null, [], new Map(), at, at + LAUNCH_ROLE_TTL229); dto.heldReasons.push(reason); return dto;};
const bytes229 = (value: string) => new Uint8Array(value.match(/../g)!.map(n => parseInt(n, 16)));
function encoded229(value: string) { return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function secret229(env: Env): string | null { const d=Object.getOwnPropertyDescriptor(env,'VERIFY_SECRET');return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&d.value?d.value:null; }
async function cursorKey229(secret: string) {return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function writeCursor229(value: Cursor229, secret: string) {const body=encoded229(JSON.stringify(value)),mac=hex(await crypto.subtle.sign('HMAC',await cursorKey229(secret),new TextEncoder().encode('officer-operations-cursor|233|'+body)));return body+'.'+mac;}
async function readCursor229(raw: string, secret: string, at: number): Promise<Cursor229> {
  if(raw.length>2048||!/^[-_A-Za-z0-9]+\.[a-f0-9]{64}$/.test(raw))throw new LaunchCursor229('invalid_launch_cursor');
  const [body,mac]=raw.split('.');
  if(!await crypto.subtle.verify('HMAC',await cursorKey229(secret),bytes229(mac),new TextEncoder().encode('officer-operations-cursor|233|'+body)))throw new LaunchCursor229('invalid_launch_cursor');
  let v: Cursor229;try{const decoded=atob(body.replace(/-/g,'+').replace(/_/g,'/'));v=JSON.parse(decoded);if(encoded229(JSON.stringify(v))!==body)throw Error();}catch{throw new LaunchCursor229('invalid_launch_cursor');}
  if(!v||Object.keys(v).sort().join(',')!=='expiresAt,issuedAt,offset,rowsDigest,scopeHash,snapshotAt,snapshotId,version'||v.version!==1
    ||!Number.isSafeInteger(v.snapshotId)||v.snapshotId<1||!Number.isSafeInteger(v.snapshotAt)||!Number.isSafeInteger(v.offset)||v.offset<0||v.offset>=1000||v.offset%LAUNCH_ROLE_PAGE229!==0
    ||!Number.isSafeInteger(v.issuedAt)||!Number.isSafeInteger(v.expiresAt)||v.issuedAt>at||v.expiresAt!==Math.min(v.issuedAt+LAUNCH_SCAN_TTL229,v.snapshotAt+LAUNCH_SCAN_TTL229)||v.expiresAt<=at
    ||!/^[a-f0-9]{16}$/.test(v.scopeHash)||!/^[a-f0-9]{64}$/.test(v.rowsDigest))throw new LaunchCursor229('expired_or_invalid_launch_cursor');
  return v;
}
async function sourceRows229(env: Env, launch: LaunchVerificationCapture, at: number, cutoff: number): Promise<SourceRow229[]> {
  const rows=await env.DB.prepare(`WITH snapshot AS MATERIALIZED (
    SELECT id,exported_at,member_count FROM roster_snapshots
    WHERE id=(SELECT MAX(id) FROM roster_snapshots) AND source=?1 AND complete=1 AND trusted=1
      AND member_count BETWEEN 1 AND 1000 AND exported_at BETWEEN MAX(?3,?2-599) AND ?2
      AND member_count=(SELECT COUNT(*) FROM roster_members WHERE snapshot_id=roster_snapshots.id)
  ), linked_guids AS MATERIALIZED (SELECT guid,COUNT(*) AS links FROM characters WHERE guid IS NOT NULL GROUP BY guid)
  SELECT s.id AS snapshotId,s.exported_at AS snapshotAt,s.member_count AS memberCount,
    rm.name,rm.guid,rm.rank,rm.rank_index AS currentSlot,rm.level,rm.last_online AS lastOnlineSeconds,
    CASE
      WHEN c.name_key IS NULL AND g.guid IS NULL THEN CASE WHEN EXISTS(
        SELECT 1 FROM pending p WHERE p.name_key=rm.name_key AND p.consumed_at IS NULL AND p.expires_at>?2 AND p.created_at>=?3
          AND NOT EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=p.discord_id AND ps.state<>'active')) THEN 'pending' ELSE 'unverified' END
      WHEN c.status='member' AND c.guid=rm.guid AND g.links=1 AND COALESCE(c.verified_at,c.bound_at)>=?3
        AND typeof(COALESCE(c.verified_at,c.bound_at))='integer'
        AND COALESCE(c.verified_at,c.bound_at) BETWEEN 1 AND ?2
        AND COALESCE(m.banned,0)=0 AND COALESCE(u.denied,0)=0
        AND NOT EXISTS(SELECT 1 FROM privacy_subjects ps WHERE ps.subject_id=c.discord_id AND ps.state<>'active') THEN 'verified'
      ELSE 'unknown' END AS verification,
    c.discord_id AS discordId
  FROM snapshot s JOIN roster_members rm ON rm.snapshot_id=s.id
  LEFT JOIN characters c ON c.name_key=rm.name_key LEFT JOIN linked_guids g ON g.guid=rm.guid
  LEFT JOIN members m ON m.discord_id=c.discord_id LEFT JOIN site_users u ON u.discord_id=c.discord_id
  ORDER BY rm.name_key LIMIT 1000`).bind(launch.scope!.provenance,at,cutoff).all<SourceRow229>();
  if(!rows.success)throw Error('launch_source_read_unavailable');return rows.results;
}
function roleConfiguration229(env: Env) {
  const keys=['SITE_GUILD_ID','DISCORD_BOT_TOKEN'] as const,values=keys.map(key=>Object.getOwnPropertyDescriptor(env,key));
  if(values.some(d=>!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value))return null;
  const guild=values[0]!.value as string,token=values[1]!.value as string;if(!/^\d{17,20}$/.test(guild))return null;
  return {guild,token,current:()=>keys.every((key,i)=>{const d=Object.getOwnPropertyDescriptor(env,key);return !!d&&Object.hasOwn(d,'value')&&d.value===values[i]!.value;})};
}
export async function readLaunchOperations229(env: Env, cursor: string | null = null) {
  const at=now(),launch=captureLaunchVerification(env),secret=secret229(env);
  if(launch.mode!=='members-only'||!launch.scope||!launch.current()||canonicalOlympusGuildName(launch.scope.guild)!==FLAGSHIP_GUILD_NAME)return held229(at,'flagship-native-scope-unconfirmed');
  if(!secret)return held229(at,'native-secret-unconfigured');
  const captured=cursor?await readCursor229(cursor,secret,at):null,cutoff=linksNotBefore(env),rows=await sourceRows229(env,launch,at,cutoff),first=rows[0];
  if(!first||rows.length!==first.memberCount){if(captured)throw new LaunchCursor229('launch_cursor_source_changed',409);return held229(at,'native-snapshot-unavailable');}
  const scopeHash=(await digest229('native-scope|1|'+launch.scope.guild+'|'+launch.scope.realm)).slice(0,16),rowsDigest=await digest229(JSON.stringify(rows));
  if(captured&&(captured.snapshotId!==first.snapshotId||captured.snapshotAt!==first.snapshotAt||captured.scopeHash!==scopeHash||captured.rowsDigest!==rowsDigest))throw new LaunchCursor229('launch_cursor_source_changed',409);
  const issuedAt=captured?.issuedAt??at,scanExpiresAt=captured?.expiresAt??Math.min(at+LAUNCH_SCAN_TTL229,first.snapshotAt+LAUNCH_SCAN_TTL229),expiresAt=Math.min(at+LAUNCH_ROLE_TTL229,scanExpiresAt),offset=captured?.offset??0;
  const scanId=(await digest229(JSON.stringify(['officer-operations-scan',233,scopeHash,rowsDigest,issuedAt,scanExpiresAt]))).slice(0,32);
  const page=rows.slice(offset,offset+LAUNCH_ROLE_PAGE229),roleRows=page.filter(r=>r.verification==='verified'),configuration=roleConfiguration229(env),states=new Map<string,KnightState229>();
  let retryAfterSeconds: number|null=null,rateLimited=false,roleUnavailable=false,next=0;
  const accountStates=new Map<string,Promise<KnightState229>>();
  const readRole=async(id:string):Promise<KnightState229>=>{
    if(!configuration||!/^\d{17,20}$/.test(id)||rateLimited)return 'unknown';
    if(!accountStates.has(id))accountStates.set(id,(async()=>{
      try {
        if(!launch.current()||!configuration.current())return 'unknown';
        // A single bounded credential GET. A 429 is a held result, never retried here.
        const response=await credentialFetch(API+'/guilds/'+configuration.guild+'/members/'+id,{method:'GET',headers:{Authorization:'Bot '+configuration.token,'Content-Type':'application/json'}},()=>{if(!launch.current()||!configuration.current())throw Error('launch_source_changed');});
        if(!launch.current()||!configuration.current())return 'unknown';
        if(response.status===429){rateLimited=true;const header=Number(response.headers.get('Retry-After'));retryAfterSeconds=Number.isFinite(header)&&header>0?Math.min(3600,Math.ceil(header)):60;return 'unknown';}
        if(!response.ok){roleUnavailable=true;return 'unknown';}
        const member=await response.json() as {user?:{id?:unknown};roles?:unknown};
        if(member?.user?.id!==id)return 'unknown';return classifyKnightRoles229(member.roles);
      }catch{roleUnavailable=true;return 'unknown';}
    })());
    return accountStates.get(id)!;
  };
  await Promise.all(Array.from({length:Math.min(4,roleRows.length)},async()=>{while(next<roleRows.length){const row=roleRows[next++];states.set(row.guid,await readRole(row.discordId??''));}}));
  // One first-page invite read uses a separate three-request ceiling, so it
  // cannot starve any of the twenty roster evidence rows on that page.
  const invitePage=offset===0?await readOfficerInvites233(env,{limit:3,attempts:0,retries:0},3,at):{invites:[],heldReasons:[]};
  // Re-read the exact Native source and linked/denied/privacy state after provider awaits.
  // For the admin route this also consumes the original signed actor session again.
  const after=await sourceRows229(env,launch,now(),cutoff);
  if(!launch.current()||configuration&&!configuration.current()||linksNotBefore(env)!==cutoff||await digest229(JSON.stringify(after))!==rowsDigest)return held229(now(),'native-snapshot-changed');
  const dto=projectLaunchOperations229({snapshotId:first.snapshotId,snapshotAt:first.snapshotAt,memberCount:first.memberCount,guild:launch.scope.guild,realm:launch.scope.realm,scopeHash},rows,states,now(),expiresAt);
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
  dto.entitlements={offset,pageSize:LAUNCH_ROLE_PAGE229,scanned:page.length,total:rows.length,unscanned:Math.max(0,rows.length-offset-page.length),retryAfterSeconds};
  if(rateLimited)dto.heldReasons.push('discord-rate-limited');if(roleUnavailable||!configuration)dto.heldReasons.push('discord-entitlement-unavailable');
  if(dto.status!=='held'){
    const witness={version:1 as const,snapshotId:first.snapshotId,snapshotAt:first.snapshotAt,scopeHash,rowsDigest,issuedAt,expiresAt:scanExpiresAt};
    dto.pageCursor=await writeCursor229({...witness,offset},secret);
    if(offset+page.length<rows.length&&!rateLimited)dto.nextCursor=await writeCursor229({...witness,offset:offset+page.length},secret);
  }
  if(dto.status!=='held')dto.status=dto.entitlements.unscanned||dto.held.some(r=>r.reason==='discord-entitlement-unknown')?'partial':'ready';
  if(!launch.current()||configuration&&!configuration.current()||linksNotBefore(env)!==cutoff)return held229(now(),'native-snapshot-changed');
  return dto;
}
export async function handleLaunchOperations229(request: Request, env: Env, watcher = false): Promise<Response> {
  const q=new URL(request.url).searchParams,allowed=watcher?['keyVersion','cursor']:['cursor'];
  if(request.method!=='GET'||[...q.keys()].some(k=>!allowed.includes(k))||[...new Set(q.keys())].some(k=>q.getAll(k).length!==1)
    ||watcher&&q.get('keyVersion')!==LAUNCH_OPERATIONS_PROTOCOL229||q.has('cursor')&&!q.get('cursor'))return apiJson({error:'invalid_launch_query'},400);
  try{return apiJson(await readLaunchOperations229(env,q.get('cursor')),200,{'Cache-Control':'private, no-store, no-transform'});}
  catch(error){if(error instanceof LaunchCursor229)return apiJson({error:error.code},error.status);throw error;}
}
