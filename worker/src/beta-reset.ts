/** Bounded reset-only continuation. No public member list, appointment writes, role grants or implicit arming.
 * One discovery page and at most six one-use removal intents per invocation. Discovery restarts after
 * every complete pass so later external assignments are observed; a clean page/pass is not final completion.
 */
import type { Env } from './env';
import { DB_NOW, randomGeneration, sha256 } from './account-generation-contracts';
import { rest, type AttemptBudget } from './discord';
import { BETA_RESET_POLICY_KEY,BETA_RESET_EPOCH,BETA_RESET_CUTOFF,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS,parseBetaResetPolicy,
 captureBetaGrant,resetGuardEnabled,betaResetCurrent,betaResetSql,captureBetaResetScan,betaResetScanSql,betaResetScanCurrent,
 type BetaGrantCapture,type BetaResetScanCapture } from './beta-reset-policy';
import { settleBetaResetRemoval } from './role-settlements';

export const BETA_RESET_CRON='* * * * *';
/** Separate original minute-entry qualification; ordinary schedule evidence cannot enable removal dispatch. */
export const BETA_RESET_SCHEDULE_QUALIFIED=false as const;
export const BETA_RESET_CAPS=Object.freeze({membersPerPage:1000,roleIntentsPerRun:6,network:40,physicalStatements:300});
export { BETA_RESET_SCAN_KEY } from './beta-reset-scan';
import { BETA_RESET_SCAN_KEY,parseBetaResetScan as parseScan,type BetaResetScan as Scan } from './beta-reset-scan';
export type BetaResetSlice=Readonly<{state:'inactive'|'held'|'busy'|'progress';reason:string;discoveryPages:number;discoveredMembers:number;
 observedAssignments:number;processed:number;settled:number;unknown:number;held:number;http:number;completedPasses:number|null}>;
const outcome=(state:BetaResetSlice['state'],reason:string,more:Partial<BetaResetSlice>={}):BetaResetSlice=>({state,reason,discoveryPages:0,discoveredMembers:0,observedAssignments:0,processed:0,settled:0,unknown:0,held:0,http:0,completedPasses:null,...more});
const ID=/^\d{17,20}$/;
function freshScan(digest:string,at:number):Scan{return {version:1,epoch:BETA_RESET_EPOCH,digest,pass:1,after:'0',lease:'',leaseUntil:0,passStartedAt:at,scanned:0,observedAssignments:0,completedPasses:0,lastPassCompletedAt:null,lastPassScanned:0,lastPassAssignments:0,lastError:null};}
const control=(env:Env)=>env.DB.prepare(`SELECT (SELECT value FROM site_settings WHERE key=?1) AS raw,${DB_NOW} AS at`).bind(BETA_RESET_SCAN_KEY).first<{raw:string|null;at:number}>();
/** Owner-only aggregate status. A completed discovery pass is not proof of a permanently empty server. */
export async function betaRoleResetStatus(env:Env){
 const c=await captureBetaGrant(env,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS[0]!),r=await control(env);
 if(!r||!Number.isSafeInteger(r.at))throw Error('beta_reset_status_held');
 const policy=parseBetaResetPolicy(c.raw,env),digest=policy?await sha256(c.raw!):null,scan=digest&&r.raw!==null?parseScan(r.raw,digest):null;
 const q=await env.DB.prepare(`SELECT
  SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) pending,
  SUM(CASE WHEN state='held' THEN 1 ELSE 0 END) held,
  SUM(CASE WHEN state IN ('unknown','dispatching') THEN 1 ELSE 0 END) unknown,
  SUM(CASE WHEN state='settled' THEN 1 ELSE 0 END) settled
  FROM role_settlements WHERE purpose='beta_reset' AND desired=0 AND guild_id=?1 AND request_digest=?2
  AND reason<>'beta_reset_observation_consumed'`).bind(BETA_RESET_GUILD_ID,digest).first<{pending:number|null;held:number|null;unknown:number|null;settled:number|null}>();
 const known={pending:q?.pending??0,held:q?.held??0,unknown:q?.unknown??0,settledOperations:q?.settled??0};
 const custody=await env.DB.prepare(`SELECT
  SUM(CASE WHEN desired=1 OR purpose='grant_compensation' THEN 1 ELSE 0 END) AS n,
  SUM(CASE WHEN desired=0 AND purpose<>'grant_compensation' AND NOT(purpose='beta_reset' AND request_digest IS ?3) THEN 1 ELSE 0 END) AS other
  FROM role_settlements WHERE guild_id=?1 AND role_id IN(SELECT value FROM json_each(?2))
  AND attempts=1 AND state IN('unknown','dispatching')`)
  .bind(BETA_RESET_GUILD_ID,JSON.stringify(BETA_RESET_ROLE_IDS),digest).first<{n:number|null;other:number|null}>();
 const unresolvedGrantCustody=custody?.n??0,unresolvedOtherRoleCustody=custody?.other??0;
 const active=await betaResetCurrent(env,c),closed=r.at>=BETA_RESET_CUTOFF,clean=!!scan?.completedPasses&&scan.lastPassAssignments===0;
 const phase=!closed?(c.mode==='held'?'held':'before_cutoff'):!['beta_cutoff_reached','beta_source_epoch_closed'].includes(c.reason)?'held':!resetGuardEnabled(env)?'inactive':!active?'held':r.raw!==null&&!scan?'held':
  scan?.lastError?'held':known.unknown||known.held||unresolvedGrantCustody||unresolvedOtherRoleCustody?'held':known.pending?'draining':clean?'awaiting_new_source':'discovering';
 return {epoch:BETA_RESET_EPOCH,cutoff:BETA_RESET_CUTOFF,serverTime:r.at,guildId:BETA_RESET_GUILD_ID,roleIds:BETA_RESET_ROLE_IDS,
  sourcePhase:closed?'closed_awaiting_new_source':'beta_source_open',phase,policyArmed:!!policy,removalsActive:active,
  reason:c.reason,canArm:c.mode==='open'&&c.raw===null&&r.at<BETA_RESET_CUTOFF,
  preserved:['manual leadership','manual Council','Developer','server moderators','website appointments','leadership directory'],
  discovery:{membersPerPage:BETA_RESET_CAPS.membersPerPage,pagesPerMinute:1,continuous:active,completedPasses:scan?.completedPasses??0,
   currentPassScanned:scan?.scanned??0,currentPassObservedAssignments:scan?.observedAssignments??0,
   lastPassCompletedAt:scan?.lastPassCompletedAt??null,lastPassScanned:scan?.lastPassScanned??0,lastPassObservedAssignments:scan?.lastPassAssignments??0,
   lastError:scan?.lastError??null,fullServerCountKnown:false},
  removals:{roleIntentsPerMinute:BETA_RESET_CAPS.roleIntentsPerRun,...known,unresolvedGrantCustody,unresolvedOtherRoleCustody},finalCompletion:false,
  newSourceRequired:true,roleReuseReady:false};
}
async function release(env:Env,captured:BetaGrantCapture,original:BetaResetScanCapture,next:Scan):Promise<boolean>{
 const g=betaResetScanSql(captured,original,4);return !!await env.DB.prepare(`UPDATE site_settings SET value=?1,updated_at=${DB_NOW},updated_by='system:beta-reset'
 WHERE key=?2 AND value=?3 COLLATE BINARY AND ${g.sql} RETURNING key`).bind(JSON.stringify(next),BETA_RESET_SCAN_KEY,original.raw,...g.values).first();
}
/** Only exact scope is persisted. Provider names, avatars and unrelated roles never enter the job store. */
async function page(env:Env,after:string,b:AttemptBudget,readAdmission:()=>Promise<boolean>):Promise<{subject:string;roles:string[]}[]>{
 if(!await readAdmission())throw Error('beta_reset_scan_held');
 if(b.attempts>=b.limit)throw Error('beta_reset_network_budget');b.attempts++;
 const value=await rest<unknown>(env,'GET',`/guilds/${BETA_RESET_GUILD_ID}/members?limit=${BETA_RESET_CAPS.membersPerPage}&after=${after}`,undefined,1,undefined,b);
 if(!Array.isArray(value)||value.length>BETA_RESET_CAPS.membersPerPage)throw Error('beta_reset_inventory_shape');
 let previous=BigInt(after);const out:{subject:string;roles:string[]}[]=[];
 for(const member of value){const subject=member?.user?.id,roles=member?.roles;
  if(typeof subject!=='string'||!ID.test(subject)||BigInt(subject)<=previous||!Array.isArray(roles)||roles.length>250
   ||roles.some(r=>typeof r!=='string'||!ID.test(r))||new Set(roles).size!==roles.length)throw Error('beta_reset_inventory_order_or_shape');
  previous=BigInt(subject);out.push({subject,roles:roles.filter(r=>BETA_RESET_ROLE_IDS.includes(r))});
 }
 return out;
}
export async function runBetaResetSlice(env:Env):Promise<BetaResetSlice>{
 if(!resetGuardEnabled(env))return outcome('inactive','beta_reset_off');
 const captured=await captureBetaGrant(env,BETA_RESET_GUILD_ID,BETA_RESET_ROLE_IDS[0]!);
 if(!await betaResetCurrent(env,captured))return outcome('held',captured.reason);
 const digest=await sha256(captured.raw!),read=await control(env);if(!read||!Number.isSafeInteger(read.at))return outcome('held','beta_reset_control_read');
 let scan=read.raw===null?freshScan(digest,read.at):parseScan(read.raw,digest);if(!scan)return outcome('held','beta_reset_control_invalid');
 if(scan.lease&&scan.leaseUntil>read.at)return outcome('busy','beta_reset_lease');
 scan={...scan,lease:randomGeneration(),leaseUntil:read.at+120};let raw=JSON.stringify(scan);
 const g=betaResetSql(captured,4);
 const claimed=read.raw===null?await env.DB.prepare(`INSERT INTO site_settings(key,value,updated_at,updated_by)
 SELECT ?1,?2,${DB_NOW},'system:beta-reset' WHERE ?3 IS NULL AND ${DB_NOW}<json_extract(?2,'$.leaseUntil') AND ${g.sql}
 ON CONFLICT(key) DO NOTHING RETURNING key`).bind(BETA_RESET_SCAN_KEY,raw,read.raw,...g.values).first():
 await env.DB.prepare(`UPDATE site_settings SET value=?2,updated_at=${DB_NOW},updated_by='system:beta-reset'
 WHERE key=?1 AND value=?3 COLLATE BINARY AND ${DB_NOW}<json_extract(?2,'$.leaseUntil') AND ${g.sql} RETURNING key`).bind(BETA_RESET_SCAN_KEY,raw,read.raw,...g.values).first();
 if(!claimed)return outcome('busy','beta_reset_claim_changed');
 let original=captureBetaResetScan(env,captured,raw);if(!original)return outcome('held','beta_reset_scan_held');
 const b:AttemptBudget={limit:BETA_RESET_CAPS.network,attempts:0,retries:0};let discovered=0,assignments=0,pages=0,processed=0,settled=0,unknown=0,held=0;
 try{
  const members=await page(env,scan.after,b,()=>betaResetScanCurrent(env,captured,original!));
  if(!await betaResetScanCurrent(env,captured,original))return outcome('held','beta_reset_scan_held',{http:b.attempts});
  const observed:{id:string;subject:string;role:string}[]=[];
  for(const m of members)for(const role of m.roles)observed.push({id:(await sha256(`${digest}:${scan.pass}:${m.subject}:${role}`)).slice(0,32),subject:m.subject,role});
  discovered=members.length;assignments=observed.length;
  const at=await control(env);if(!at||at.raw!==raw||at.at>=scan.leaseUntil)return outcome('held','beta_reset_scan_changed',{http:b.attempts});
  const ended=members.length<BETA_RESET_CAPS.membersPerPage;
  const next:Scan={...scan,after:ended?'0':members.at(-1)!.subject,scanned:ended?0:scan.scanned+members.length,
   observedAssignments:ended?0:scan.observedAssignments+observed.length,lastError:null,
   ...(ended?{pass:scan.pass+1,passStartedAt:at.at,completedPasses:scan.completedPasses+1,lastPassCompletedAt:at.at,
    lastPassScanned:scan.scanned+members.length,lastPassAssignments:scan.observedAssignments+observed.length}:{})};
  const nextRaw=JSON.stringify(next),guard=betaResetScanSql(captured,original,7);
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,created_at,expires_at)
    SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.subject'),'beta_reset',?3,json_extract(j.value,'$.role'),0,'pending','beta_inventory_observed',?4,${DB_NOW},${DB_NOW}+300
    FROM json_each(?5) j WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM site_settings WHERE key=?1 AND value=?2 COLLATE BINARY)
    AND NOT EXISTS(SELECT 1 FROM role_settlements r WHERE r.subject=json_extract(j.value,'$.subject') AND r.guild_id=?3
     AND r.role_id=json_extract(j.value,'$.role') AND r.purpose='beta_reset' AND r.request_digest=?4
     AND r.state<>'settled' AND r.reason<>'beta_reset_observation_consumed') AND ?6 IS NOT NULL`)
    .bind(BETA_RESET_SCAN_KEY,raw,BETA_RESET_GUILD_ID,digest,JSON.stringify(observed),nextRaw,...guard.values),
   env.DB.prepare(`UPDATE site_settings SET value=?6,updated_at=${DB_NOW},updated_by='system:beta-reset'
    WHERE key=?1 AND value=?2 COLLATE BINARY AND ?3 IS NOT NULL AND ?4 IS NOT NULL AND ?5 IS NOT NULL AND ${guard.sql} RETURNING key`)
    .bind(BETA_RESET_SCAN_KEY,raw,BETA_RESET_GUILD_ID,digest,JSON.stringify(observed),nextRaw,...guard.values)
  ]);
  if(!result[1]?.results.length)return outcome('held','beta_reset_scan_commit_held',{http:b.attempts});
  const nextOriginal=captureBetaResetScan(env,captured,nextRaw,original);if(!nextOriginal)return outcome('held','beta_reset_scan_held',{http:b.attempts});
  original=nextOriginal;scan=next;raw=nextRaw;pages=1;
  const selection=betaResetScanSql(captured,original,3);
  const selected=await env.DB.prepare(`SELECT id FROM role_settlements WHERE purpose='beta_reset' AND desired=0 AND guild_id=?1 AND request_digest=?2
   AND state<>'settled' AND reason<>'beta_reset_observation_consumed'
   AND (state='pending' OR checked_at IS NULL OR checked_at<=${DB_NOW}-1800) AND ${selection.sql}
   ORDER BY CASE WHEN state='pending' THEN 0 ELSE 1 END,COALESCE(checked_at,0),created_at,id LIMIT ${BETA_RESET_CAPS.roleIntentsPerRun}`)
   .bind(BETA_RESET_GUILD_ID,digest,...selection.values).all<{id:string}>();
  for(const row of selected.results){
   const r=await settleBetaResetRemoval(env,row.id,captured,b,original);processed++;if(r.state==='settled')settled++;else if(r.state==='unknown')unknown++;else held++;
   if(r.reason==='beta_reset_scan_held')break;
  }
  const released=await release(env,captured,original,{...scan,lease:'',leaseUntil:0});
  return outcome(released?'progress':'held',released?'beta_reset_slice_recorded':'beta_reset_release_held',
   {discoveryPages:pages,discoveredMembers:discovered,observedAssignments:assignments,processed,settled,unknown,held,http:b.attempts,completedPasses:scan.completedPasses});
 }catch{
  // Unknown discovery/commit outcomes are not replayed here. A later slice reads the durable cursor.
  await release(env,captured,original,{...scan,lease:'',leaseUntil:0,lastError:'beta_reset_discovery_or_storage_held'}).catch(()=>false);
  return outcome('held','beta_reset_discovery_or_storage_held',{discoveryPages:pages,discoveredMembers:discovered,observedAssignments:assignments,processed,settled,unknown,held,http:b.attempts,completedPasses:scan.completedPasses});
 }
}
