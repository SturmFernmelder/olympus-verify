/** Private evidence for a nondestructive attended cutoff confirmation; no member or role data. */
import type {Env} from './env';
import {DB_NOW} from './account-generation-contracts';
import {BETA_RESET_CUTOFF} from './beta-reset-policy';
import {BETA_RETENTION_ANCHOR_KEY,CONFIRMED_BETA_CUTOFF_SQL} from './privacy-retention-clocks';
export type BetaRetentionEvidence=Readonly<{at:number;anchor:string|null;closed:string|null;reset:string|null;cutoff:number|null}>;
export async function betaRetentionEvidence(env:Env):Promise<BetaRetentionEvidence>{
 const r=await env.DB.prepare(`SELECT ${DB_NOW} AS at,
  (SELECT value FROM site_settings WHERE key='${BETA_RETENTION_ANCHOR_KEY}') AS anchor,
  (SELECT value FROM site_settings WHERE key='betaClosedAt') AS closed,
  (SELECT value FROM site_settings WHERE key='betaResetFor') AS reset,${CONFIRMED_BETA_CUTOFF_SQL} AS cutoff`).first<BetaRetentionEvidence>();
 if(!r||!Number.isSafeInteger(r.at)||r.at<=0||[r.anchor,r.closed,r.reset].some(v=>v!==null&&typeof v!=='string')||r.cutoff!==null&&(!Number.isSafeInteger(r.cutoff)||r.cutoff<=0))throw Error('beta_retention_evidence_held');
 return Object.freeze({...r});
}
export const betaRetentionCanConfirm=(e:BetaRetentionEvidence)=>e.at>=BETA_RESET_CUTOFF&&e.anchor===null
 &&(e.closed===null&&e.reset===null||e.closed!==null&&e.reset!==null&&e.cutoff===BETA_RESET_CUTOFF);
/** Excludes the read time, so an original form remains usable within its signed five-minute lifetime. */
export const betaRetentionBinding=(e:BetaRetentionEvidence)=>({anchor:e.anchor,closed:e.closed,reset:e.reset,cutoff:e.cutoff});
export function betaRetentionStatus(e:BetaRetentionEvidence){return Object.freeze({
 cutoff:BETA_RESET_CUTOFF,confirmed:e.cutoff!==null,confirmedCutoff:e.cutoff,
 evidence:e.anchor!==null?(e.cutoff===null?'held':'cutoff_anchor'):e.closed!==null||e.reset!==null?(e.cutoff===null?'held':'legacy'):'absent',
 canConfirm:betaRetentionCanConfirm(e),removalCompletion:false,
 });}
