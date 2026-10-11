/** Erasure-only custody projection. A historical grant does not prove exclusive current ownership.
 * No provider effect, operation renewal, role target change or staff removal authority is supplied here.
 */
import type {Env} from './env';
export type StaffAccessDetails={classification:'historical-bot-issued'|'unqualified'|'none'|'unknown';accessObserved:'present'|'none'|'unknown';historicalBotIssued:number|null;unresolvedBotCustody:number|null;manualAssignment:'unqualified';automaticStaffRemoval:false};
export type StaffCustodyCounts={staffSubjectPresent:number;historicalBotIssued:number;unresolvedBotCustody:number};
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const privileged=(g:string)=>`${g}.purpose IN('verified_privileged_rank','roster_privileged_rank') AND ${g}.desired=1 AND ${g}.attempts=1`;
const related=(g:string,identity:string)=>`(${g}.subject=${identity} OR ${g}.proof_id IN(SELECT id FROM verification_proofs WHERE requester=${identity} OR signer=${identity}))`;
/** A successful original effect reply is distinct from a presence/absence-only reconciliation.
 * Missing stored generation/claim provenance remains held. This is not an HTTP drain inference.
 */
const token=(v:string)=>`(typeof(${v})='text' AND length(${v})=32 AND ${v} NOT GLOB '*[^0-9a-f]*')`;
const provenance=(g:string)=>`${token(g+'.claim_nonce')} AND ${token(g+'.subject_generation')}`;
const originalReturned=(g:string)=>`(${g}.state='settled' AND ${g}.reason='effect_and_current_server_confirmed'
 AND ${g}.checked_at>=${g}.created_at AND ${g}.checked_at<=${NOW} AND ${provenance(g)})`;
const compensation=(g:string,a:string)=>`${a}.purpose='grant_compensation' AND ${a}.request_digest=${g}.id
 AND ${a}.attempts=1 AND ${a}.reason='removed' AND ${token(a+'.claim_nonce')}`;
const laterMatching=(g:string,a:string)=>`${a}.rowid>${g}.rowid AND ${a}.subject=${g}.subject AND ${a}.guild_id=${g}.guild_id
 AND ${a}.role_id=${g}.role_id AND ${a}.subject_generation IS ${g}.subject_generation AND ${a}.desired=0 AND ${a}.state='settled'
 AND ${a}.checked_at>=COALESCE(${g}.checked_at,${g}.created_at) AND ${a}.checked_at<=${NOW}`;
/** Existing source writes this parent reason only after a compensation for a returned original PUT.
 * Its child must retain exact parent lineage, confirmed DELETE reason and generation/nonce provenance.
 * Legacy compensation rows without a stored generation remain held; no provenance is manufactured.
 */
const compensatedOriginal=(g:string)=>`(${g}.state='held' AND ${g}.reason='removed_after_admission_changed' AND ${provenance(g)}
 AND EXISTS(SELECT 1 FROM role_settlements a WHERE ${laterMatching(g,'a')} AND ${compensation(g,'a')}))`;
const knownReturnedOriginal=(g:string)=>`(${originalReturned(g)} OR ${compensatedOriginal(g)})`;
/** Unknown/dispatched/past-absence grants never borrow later GETs as original request completion.
 * A known returned original PUT may be discharged by a later exact fixed-target absence/removal;
 * row order here orders receipts after that independently qualified original completion.
 */
export function unresolvedStaffGrantSql(g='g'):string{return `${privileged(g)} AND NOT COALESCE((
 ${compensatedOriginal(g)} OR (${originalReturned(g)} AND EXISTS(SELECT 1 FROM role_settlements a WHERE ${laterMatching(g,'a')} AND (
 (${compensation(g,'a')}) OR (a.purpose IN('verified_privileged_rank','roster_privileged_rank') AND a.native_profile IS ${g}.native_profile
 AND a.reason IN('fresh_server_confirmed','effect_and_current_server_confirmed','fresh_server_absence_batch')))))),0)`;}
/** Authored SQL expressions only. The identity expression is fixed by the caller, never request text. */
export function relatedUnresolvedStaffSql(identity:string):string{return `EXISTS(SELECT 1 FROM role_settlements g WHERE ${related('g',identity)} AND ${unresolvedStaffGrantSql()})`;}
export function staffCustodyProjectionSql(identity:string):string{return `CASE WHEN ${identity} IS NOT NULL THEN 1 ELSE 0 END AS staffSubjectPresent,
 (SELECT COUNT(*) FROM role_settlements g WHERE g.subject=${identity} AND ${privileged('g')} AND ${knownReturnedOriginal('g')}) AS historicalBotIssued,
 (SELECT COUNT(*) FROM role_settlements g WHERE ${related('g',identity)} AND ${unresolvedStaffGrantSql()}) AS unresolvedBotCustody`;}
export function qualifiedStaffCustodyCounts(value:unknown):value is StaffCustodyCounts{
 if(!value||typeof value!=='object')return false;const v=value as StaffCustodyCounts;
 return v.staffSubjectPresent===1&&Number.isSafeInteger(v.historicalBotIssued)&&v.historicalBotIssued>=0&&Number.isSafeInteger(v.unresolvedBotCustody)&&v.unresolvedBotCustody>=0;
}
export function staffAccessDetails(access:'human-managed'|'none'|'unknown',counts?:unknown):StaffAccessDetails{
 const qualified=qualifiedStaffCustodyCounts(counts),historical=qualified?counts.historicalBotIssued:null,unresolved=qualified?counts.unresolvedBotCustody:null;
 return {classification:historical!==null&&historical>0?'historical-bot-issued':access==='human-managed'||unresolved!==null&&unresolved>0?'unqualified':access==='none'&&qualified?'none':'unknown',
 accessObserved:access==='human-managed'?'present':access,historicalBotIssued:historical,unresolvedBotCustody:unresolved,manualAssignment:'unqualified',automaticStaffRemoval:false};
}
export async function readStaffCustody(env:Env,subject:string):Promise<StaffCustodyCounts|null>{
 const row=await env.DB.prepare(`SELECT ${staffCustodyProjectionSql('?1')}`).bind(subject).first<StaffCustodyCounts>();
 return qualifiedStaffCustodyCounts(row)?row:null;
}
