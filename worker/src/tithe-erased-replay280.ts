/** Owner-approved erased-receipt replay protection. Only opaque receipt key and
 * ORIGINAL expiry survive. This is not an identity link, financial credit, role
 * receipt, restore_replay row, or authority to retry an unknown attempt. */
import type {Env} from './env';

export const TITHE_ERASED_REPLAY_ACTION280='treasury.erased_replay280';
export const TITHE_ERASED_REPLAY_COVERAGE280='After account erasure, an unlinked opaque receipt key and its original expiry may remain solely to prevent replay until the original thirty-day deadline. No account, name, GUID, amount, correspondence, item, evidence or payload hash is kept in that marker. Markers have no remaining account index, so this own-account copy cannot enumerate them or report a private count.';
const NOW="CAST(strftime('%s','now') AS INTEGER)",MAX='9007199254740991';
/** Bounded balanced expressions preserve SQLite's unchanged depth100 limit. */
const join=(operator:'AND'|'OR',parts:readonly string[]):string=>{
 if(!parts.length)return operator==='AND'?'1':'0';if(parts.length===1)return parts[0]!;
 const half=Math.ceil(parts.length/2);return '('+join(operator,parts.slice(0,half))+' '+operator+' '+join(operator,parts.slice(half))+')';
};
const all=(parts:readonly string[])=>join('AND',parts);
const safe=(a:string)=>`CASE WHEN json_valid(${a}.details) THEN ${a}.details ELSE '{}' END`;
const field=(a:string,key:string)=>`json_extract(${safe(a)},'$.${key}')`;
const kind=(a:string,key:string)=>`json_type(${safe(a)},'$.${key}')`;
const keySql=(x:string)=>all([`typeof(${x})='text'`,`length(${x})=24`,`length(CAST(${x} AS BLOB))=24`,`${x} NOT GLOB '*[^0-9a-f]*'`]);
const integer=(x:string)=>all([`typeof(${x})='integer'`,`${x}>0`,`${x}<=${MAX}`]);
/** Closed purpose, not an alphabet-based exception to generic erasure. For this
 * action alone audit.ts is the original expiry, NEVER an activity timestamp. */
export function erasedReceiptMarkerSql280(a='audit'):string{
 return all([`${a}.action='${TITHE_ERASED_REPLAY_ACTION280}'`,`${a}.actor IS 'system'`,`${a}.details IS NULL`,keySql(`${a}.subject`),integer(`${a}.ts`)]);
}
/** A logically expired valid marker supplies no blocking authority even if its
 * bounded physical purge has not reached it. Malformed same-key custody holds. */
export function erasedReceiptBlocksSql280(a:string,key:string):string{
 const valid=erasedReceiptMarkerSql280(a);
 return all([`${a}.action='${TITHE_ERASED_REPLAY_ACTION280}'`,`${a}.subject=${key}`,`(NOT(${valid}) OR ${a}.ts>${NOW})`]);
}
/** The unchanged full account audit attribution is shared with the actual
 * terminal DELETE. It is not receipt ownership or a new erasure permission. */
export function accountAuditAttributionSql280(a='audit'):string{
 return `(${a}.actor=?1 OR ${a}.subject=?1 OR instr(COALESCE(${a}.details,''),?1)>0
 OR EXISTS(SELECT 1 FROM characters c WHERE c.discord_id=?1 AND ${a}.ts>=c.bound_at AND
 (${a}.subject=c.name COLLATE NOCASE OR ${a}.subject=c.name_key COLLATE NOCASE) AND
 ((${a}.actor='watcher' AND ${a}.action IN('note.set','note.failed','invite.failed','invite.fired','invite.joined','verify.roster_not_current','verify.guid_pinned','roster.remove_failed','roster.removed_unlinked'))
 OR (${a}.actor='system' AND ${a}.action IN('invite.declined','invite.expired','role.remove_held','role.remove_failed','nick.failed')))))`;
}
const modern=(a:string)=>`${field(a,'source')} IS 'tithe-gold-v2'`;
/** Scalar source tuple read only inside the original account terminal batch.
 * Never return or keep the original personal body or payload commitment. */
function originalTuple(a:string):string{
 return all([`${a}.action='treasury.receipt242'`,`${a}.actor IS 'watcher'`,`typeof(${a}.details)='text'`,`json_type(${safe(a)})='object'`,
  `(SELECT COUNT(*) FROM json_each(${safe(a)}))=(SELECT COUNT(DISTINCT key) FROM json_each(${safe(a)}))`,
  `${kind(a,'version')}='integer'`,`${field(a,'version')}=2`,`${kind(a,'source')}='text'`,modern(a),
  `${kind(a,'sourceId')}='text'`,keySql(field(a,'sourceId')),`${a}.subject IS ('intake242:'||${field(a,'sourceId')})`,
  integer(`${a}.ts`),`${a}.ts<=${NOW}+5`,`${kind(a,'observedAt')}='integer'`,integer(field(a,'observedAt')),`${field(a,'observedAt')}<=${a}.ts+5`,`${field(a,'observedAt')}<=${NOW}+5`,
  `${kind(a,'retainUntil')}='integer'`,integer(field(a,'retainUntil')),`${field(a,'retainUntil')}=${field(a,'observedAt')}+2592000`]);
}
/** Pure source-authored plan builder. The ONLY executing caller is the private
 * original account terminal producer; constructing this plan grants no erase or
 * retention authority. The same guarded Native batch owns marker+deletion ACK. */
export function erasedReceiptMarkerStatements280(env:Env,subject:string,ownReceiptSql:string):D1PreparedStatement[]{
 const targets=`(SELECT id,ts,actor,action,subject,details FROM audit WHERE (${ownReceiptSql}))`,tuple=originalTuple('r'),key=field('r','sourceId'),expiry=field('r','retainUntil');
 const live=all([tuple,`${expiry}>${NOW}`]);
 const blocking=erasedReceiptBlocksSql280('m',key);
 const insert=env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details)
 SELECT ${expiry},'system','${TITHE_ERASED_REPLAY_ACTION280}',${key},NULL
 FROM ${targets} r WHERE ${live} AND NOT EXISTS(SELECT 1 FROM audit m WHERE ${blocking}) ORDER BY r.id LIMIT 1001`).bind(subject);
 const exact=all([erasedReceiptMarkerSql280('m'),`m.subject=${key}`,`m.ts=${expiry}`]);
 const assertions=all([
  // Never destroy attributable malformed replay custody and then claim full
  // erasure: no exemption/normalization is granted; this original batch holds.
  `NOT EXISTS(SELECT 1 FROM audit m WHERE m.action='${TITHE_ERASED_REPLAY_ACTION280}' AND NOT(${erasedReceiptMarkerSql280('m')}) AND ${accountAuditAttributionSql280('m')})`,
  `NOT EXISTS(SELECT 1 FROM ${targets} r WHERE ${modern('r')} AND NOT(${tuple}))`,
  `(SELECT COUNT(*) FROM(SELECT 1 FROM ${targets} r WHERE ${live} LIMIT 1001))<=1000`,
  `NOT EXISTS(SELECT 1 FROM ${targets} r WHERE ${live} AND (
   (SELECT COUNT(*) FROM audit original WHERE original.action='treasury.receipt242' AND original.subject=r.subject)<>1
   OR (SELECT COUNT(*) FROM audit m WHERE ${blocking})<>1
   OR NOT EXISTS(SELECT 1 FROM audit m WHERE ${exact})))`,
 ]);
 const complete=env.DB.prepare(`SELECT CASE WHEN ${assertions} THEN 1 ELSE json_extract('erased_receipt_replay_scope_held','$') END AS retained`).bind(subject);
 return [insert,complete];
}
