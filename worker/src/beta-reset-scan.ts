/** Private pagination cursor lifecycle. This never authorizes Discord effects or changes policy. */
import type { Env } from './env';
import { BETA_RESET_EPOCH } from './beta-reset-policy';
const NOW="CAST(strftime('%s','now') AS INTEGER)";
export const BETA_RESET_SCAN_KEY='betaResetScanV1';
export const BETA_RESET_CURSOR_STALE_SECONDS=300;
export type BetaResetScan={version:1;epoch:string;digest:string;pass:number;after:string;lease:string;leaseUntil:number;passStartedAt:number;
 scanned:number;observedAssignments:number;completedPasses:number;lastPassCompletedAt:number|null;lastPassScanned:number;lastPassAssignments:number;lastError:string|null};
const NUMBERS=['pass','leaseUntil','passStartedAt','scanned','observedAssignments','completedPasses','lastPassScanned','lastPassAssignments'];
const KEYS=['version','epoch','digest','after','lease','lastPassCompletedAt','lastError',...NUMBERS];
const MAX=Number.MAX_SAFE_INTEGER;
export function parseBetaResetScan(raw:unknown,digest:string):BetaResetScan|null{
 try{if(typeof raw!=='string'||raw.length>2000)return null;const s=JSON.parse(raw);
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join(',')!==[...KEYS].sort().join(','))return null;
  const names=Array.from(raw.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g),m=>JSON.parse('"'+m[1]+'"'));
  if(names.length!==KEYS.length||new Set(names).size!==KEYS.length)return null;
  if(s.version!==1||s.epoch!==BETA_RESET_EPOCH||s.digest!==digest||typeof s.digest!=='string'||!/^[0-9a-f]{64}$/.test(s.digest)
   ||typeof s.after!=='string'||s.after!=='0'&&!/^\d{17,20}$/.test(s.after)
   ||typeof s.lease!=='string'||s.lease!==''&&!/^[0-9a-f]{32}$/.test(s.lease))return null;
  for(const key of NUMBERS)if(!Number.isSafeInteger(s[key])||s[key]<0)return null;
  if(s.pass<1||s.pass>=MAX||s.lastPassCompletedAt!==null&&(!Number.isSafeInteger(s.lastPassCompletedAt)||s.lastPassCompletedAt<0)
   ||s.lastError!==null&&s.lastError!=='beta_reset_discovery_or_storage_held')return null;
  return s as BetaResetScan;
 }catch{return null;}
}
/** Only source-owned expressions are accepted here. CASE protects every JSON operation from malformed input. */
export function betaResetScanValidSql(value:string):string{
 const x=(k:string)=>`json_extract(${value},'$.${k}')`,t=(k:string)=>`json_type(${value},'$.${k}')`;
 return `(CASE WHEN typeof(${value})='text' AND length(${value})<=2000 AND json_valid(${value}) THEN
  json_type(${value})='object' AND (SELECT COUNT(*) FROM json_each(${value}))=${KEYS.length}
  AND (SELECT COUNT(DISTINCT key) FROM json_each(${value}))=${KEYS.length}
  AND NOT EXISTS(SELECT 1 FROM json_each(${value}) WHERE key NOT IN(${KEYS.map(k=>"'"+k+"'").join(',')}))
  AND ${t('version')}='integer' AND ${x('version')}=1 AND ${t('epoch')}='text' AND ${x('epoch')}='${BETA_RESET_EPOCH}'
  AND ${t('digest')}='text' AND instr(${x('digest')},char(0))=0 AND length(${x('digest')})=64 AND ${x('digest')} NOT GLOB '*[^0-9a-f]*'
  AND ${t('after')}='text' AND instr(${x('after')},char(0))=0 AND (${x('after')}='0' OR (length(${x('after')}) BETWEEN 17 AND 20 AND ${x('after')} NOT GLOB '*[^0-9]*'))
  AND ${t('lease')}='text' AND instr(${x('lease')},char(0))=0 AND (${x('lease')}='' OR (length(${x('lease')})=32 AND ${x('lease')} NOT GLOB '*[^0-9a-f]*'))
  AND ${NUMBERS.map(k=>`${t(k)}='integer' AND ${x(k)} BETWEEN 0 AND ${MAX}`).join(' AND ')}
  AND ${x('pass')}>=1 AND ${x('pass')}<${MAX}
  AND (${t('lastPassCompletedAt')}='null' OR (${t('lastPassCompletedAt')}='integer' AND ${x('lastPassCompletedAt')} BETWEEN 0 AND ${MAX}))
  AND (${t('lastError')}='null' OR (${t('lastError')}='text' AND ${x('lastError')}='beta_reset_discovery_or_storage_held'))
  ELSE 0 END)`;
}
/** One atomic current-row mutation, no stale read to adopt. The raw cursor/lease is the global scan's
 * authority, not an account session. At consumption both lease expiry and last progress are checked.
 * Clearing it changes the exact raw state, so every already captured scan loses future effect admission.
 * Existing unknown provider receipts remain untouched. Malformed records require attended recovery.
 */
export function betaResetCursorRetentionStatement(env:Env):D1PreparedStatement{
 return env.DB.prepare(`UPDATE site_settings SET
  value=json_set(value,'$.after','0','$.lease','','$.leaseUntil',0,'$.pass',json_extract(value,'$.pass')+1,
   '$.passStartedAt',${NOW},'$.scanned',0,'$.observedAssignments',0),updated_at=${NOW},updated_by='system:beta-reset'
  WHERE key='${BETA_RESET_SCAN_KEY}' AND ${betaResetScanValidSql('site_settings.value')}
  AND typeof(updated_at)='integer' AND updated_at>0 AND updated_at<=${NOW}-${BETA_RESET_CURSOR_STALE_SECONDS}
  AND CASE WHEN ${betaResetScanValidSql('site_settings.value')} THEN json_extract(value,'$.after')<>'0'
   AND json_extract(value,'$.leaseUntil')<=${NOW} ELSE 0 END`);
}
