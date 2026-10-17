/** Custody for legacy grants within the source-defined beta epoch.
 * A grant attempt is durable before HTTP. A late/lost PUT that loses its original policy
 * owes a separate one-use removal; an unknown DELETE is never retried automatically.
 * This is not the bulk reset executor, and does not clear appointments or other roles.
 */
import type { Env } from './env';
import { DB_NOW, randomGeneration } from './account-generation-contracts';
import { rest, DiscordError, type AttemptBudget } from './discord';
import { betaGrantCurrent, betaGrantSql, betaResetDispatchSql, betaResetDispatchMode, type BetaGrantCapture } from './beta-reset-policy';

type Receipt=Readonly<{id:string;nonce:string;subject:string;guildId:string;roleId:string;capture:BetaGrantCapture}>;
const receipts=new WeakSet<object>();
const validId=(s:string)=>/^\d{17,20}$/.test(s);
const tupleSql=`id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND claim_nonce=?5
 AND purpose='beta_guard_grant' AND desired=1 AND attempts=1`;
const args=(r:Receipt)=>[r.id,r.subject,r.guildId,r.roleId,r.nonce];
function counted(b:AttemptBudget|undefined){if(!b)return;b.attempts++;if('calls' in b)(b as AttemptBudget&{calls:number}).calls++;}
async function memberPresent(env:Env,r:Receipt,b?:AttemptBudget):Promise<boolean>{
 counted(b);try{const m=await rest<{roles:string[]}>(env,'GET',`/guilds/${r.guildId}/members/${r.subject}`,undefined,1,undefined,b);
 if(!Array.isArray(m?.roles))throw Error('beta_confirmation_shape');return m.roles.includes(r.roleId);
 }catch(e){if(e instanceof DiscordError&&e.status===404)return false;throw e;}
}
/** Original policy and own dispatch custody are checked again before the caller's one PUT. */
export async function beginBetaLegacyGrant(env:Env,capture:BetaGrantCapture,subject:string):Promise<Receipt|null>{
 if(!validId(subject)||capture.mode!=='open'||!await betaGrantCurrent(env,capture))return null;
 const id=randomGeneration(),nonce=randomGeneration(),guard=betaGrantSql(capture,6);
 const row=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,claim_nonce,attempts,created_at,expires_at)
 SELECT ?1,?2,'beta_guard_grant',?3,?4,1,'dispatching','beta_guard_before_put',?5,1,${DB_NOW},${DB_NOW}+300 WHERE ${betaResetDispatchSql(env,capture,guard.sql)}
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE subject=?2 AND guild_id=?3 AND role_id=?4
 AND (purpose='beta_guard_grant' OR purpose='grant_compensation') AND attempts=1 AND state IN('dispatching','unknown')) RETURNING id`)
 .bind(id,subject,capture.guildId,capture.roleId,nonce,...guard.values).first();
 if(!row)return null;
 const receipt=Object.freeze({id,nonce,subject,guildId:capture.guildId,roleId:capture.roleId,capture});receipts.add(receipt);return receipt;
}
async function stillOwned(env:Env,r:Receipt):Promise<boolean>{
 if(!receipts.has(r)||!await betaGrantCurrent(env,r.capture))return false;
 const guard=betaGrantSql(r.capture,6);
 const row=await env.DB.prepare(`SELECT 1 FROM role_settlements WHERE ${tupleSql} AND state='dispatching'
 AND expires_at>${DB_NOW} AND ${betaResetDispatchSql(env,r.capture,guard.sql)}`).bind(...args(r),...guard.values).first();
 return !!row&&betaResetDispatchMode(env,r.capture)!=='held';
}
/** Cleanup authority comes from this exact attempted PUT, never from a fabricated ban or roster fact. */
async function compensate(env:Env,r:Receipt,b?:AttemptBudget,putAcknowledged=true):Promise<'held'>{
 const removal=randomGeneration(),nonce=randomGeneration();
 const claimed=await env.DB.prepare(`INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,request_digest,claim_nonce,attempts,created_at,expires_at)
 SELECT ?6,subject,'grant_compensation',guild_id,role_id,0,'dispatching',?8,id,?7,1,${DB_NOW},${DB_NOW}+300
 FROM role_settlements WHERE ${betaResetDispatchSql(env,r.capture,tupleSql)} AND (state IN('dispatching','unknown') OR state='settled' AND reason='legacy_put_acknowledged')
 AND NOT EXISTS(SELECT 1 FROM role_settlements WHERE purpose='grant_compensation' AND request_digest=?1) RETURNING id`)
 .bind(...args(r),removal,nonce,putAcknowledged?'beta_acknowledged_put_cleanup':'beta_unknown_put_cleanup').first();
 if(!claimed||betaResetDispatchMode(env,r.capture)==='held')return 'held';
 try{
  counted(b);await rest(env,'DELETE',`/guilds/${r.guildId}/members/${r.subject}/roles/${r.roleId}`,undefined,1,'Olympus beta cutoff: compensate this attempted grant',b);
  if(await memberPresent(env,r,b))throw Error('beta_compensation_present');
  await env.DB.batch([
   env.DB.prepare(`UPDATE role_settlements SET state='settled',reason=?3,checked_at=${DB_NOW} WHERE id=?1 AND claim_nonce=?2 AND state='dispatching'`).bind(removal,nonce,putAcknowledged?'beta_acknowledged_put_cleanup_acknowledged':'beta_unknown_put_cleanup_acknowledged'),
   // A successful DELETE cannot prove a previous lost PUT has finished. Keep that original
   // operation unknown, including its nonce and attempt, even after this cleanup returned.
   env.DB.prepare(`UPDATE role_settlements SET state=?6,reason=?7 WHERE ${tupleSql}`)
    .bind(...args(r),putAcknowledged?'held':'unknown',putAcknowledged?'removed_after_beta_guard':'beta_put_unconfirmed_cleanup_observed')
  ]);
 }catch{
  await env.DB.batch([
   env.DB.prepare("UPDATE role_settlements SET state='unknown',reason=?3 WHERE id=?1 AND claim_nonce=?2").bind(removal,nonce,putAcknowledged?'beta_acknowledged_put_cleanup_unknown':'beta_unknown_put_cleanup_unknown'),
   env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason=?6 WHERE ${tupleSql}`).bind(...args(r),putAcknowledged?'beta_acknowledged_put_cleanup_unknown':'beta_unknown_put_cleanup_unknown')
  ]);
 }
 return 'held';
}
/** The caller reserves the PUT and cleanup; this path counts it and disables Discord's 429 retry. */
export async function dispatchBetaLegacyGrant(env:Env,r:Receipt,reason:string,b?:AttemptBudget):Promise<'granted'|'held'>{
 if(!receipts.has(r)||!await stillOwned(env,r))return 'held';
 if(b&&b.attempts>=b.limit)return 'held';counted(b);
 try{await rest(env,'PUT',`/guilds/${r.guildId}/members/${r.subject}/roles/${r.roleId}`,undefined,1,reason,b);}
 catch(e){
  // The original durable attempt remains custody even when this diagnostic write fails.
  try{await env.DB.prepare(`UPDATE role_settlements SET state='unknown',reason='beta_put_outcome_unknown' WHERE ${tupleSql} AND state='dispatching'`).bind(...args(r)).run();}catch{}
  if(!await betaGrantCurrent(env,r.capture))return compensate(env,r,b,false);
  throw e;
 }
 try{
  if(!await betaGrantCurrent(env,r.capture))return compensate(env,r,b);
  const guard=betaGrantSql(r.capture,6),settled=await env.DB.prepare(`UPDATE role_settlements SET state='settled',reason='legacy_put_acknowledged',checked_at=${DB_NOW}
  WHERE ${tupleSql} AND state='dispatching' AND ${guard.sql} RETURNING id`).bind(...args(r),...guard.values).first();
  if(!settled)return compensate(env,r,b);
  return 'granted';
 }catch(e){
  // An acknowledged PUT or a committed receipt with a lost reply still owes cutoff cleanup.
  if(!await betaGrantCurrent(env,r.capture))return compensate(env,r,b);
  throw e;
 }
}
