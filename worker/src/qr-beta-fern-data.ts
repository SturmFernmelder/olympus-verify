/** Own beta provenance; no flag or live signer authority is needed to erase expired historical custody. */
import type {Env} from './env';
import {FormError} from './policy-form-core';
import {ownCopyDate} from './privacy-account-coverage';
import {PRIVACY_DB_NOW as T,PRIVACY_YEAR as YEAR} from './privacy-serving-authority';
export const BETA_WINDOW_COLUMNS='id,actor,account_incarnation,subject_generation,session_version,session_expires,guild_id,application_id,signer_guid,signer_name,guild_name,realm_name,guild_realm,game_build,game_interface,native_rank,native_rank_index,native_rank_count,roster_id,links_not_before,created_at,expires_at,review_digest,revoked_at,requester_id,requester_name,requester_guid,requester_generation,requester_account_incarnation,request_code,request_created_at,request_expires_at,membership_role';
/** Called LAST in the original QR erasure batch, after its unresolved provider probe and all FK children. */
export const betaWindowErasureStatement=(env:Env,id:string)=>env.DB.prepare('DELETE FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1').bind(id);
/** Both immutable participant relationships remain readable after OFF/expiry; no operational identifiers are copied. */
export const BETA_WINDOW_OWN_FIELDS='own_actor,own_requester,created_at,expires_at,revoked_at,own_native_rank,own_native_rank_index,own_native_rank_count,own_request_created_at,own_request_expires_at';
const betaWindowOwnColumns="CASE WHEN actor=?1 THEN 1 ELSE 0 END AS own_actor,CASE WHEN requester_id=?1 THEN 1 ELSE 0 END AS own_requester,created_at,expires_at,revoked_at,CASE WHEN actor=?1 THEN native_rank ELSE NULL END AS own_native_rank,CASE WHEN actor=?1 THEN native_rank_index ELSE NULL END AS own_native_rank_index,CASE WHEN actor=?1 THEN native_rank_count ELSE NULL END AS own_native_rank_count,CASE WHEN requester_id=?1 THEN request_created_at ELSE NULL END AS own_request_created_at,CASE WHEN requester_id=?1 THEN request_expires_at ELSE NULL END AS own_request_expires_at";
export const betaWindowOwnSelect='SELECT '+betaWindowOwnColumns+' FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1 ORDER BY created_at,rowid';
/** Native rowid is private traversal metadata and is removed by the same closed projector. */
export const betaWindowOwnHistorySelect='SELECT rowid AS __history_id,0 AS __history_at,'+betaWindowOwnColumns+' FROM qr_beta_fern_windows WHERE actor=?1 OR requester_id=?1';
const betaCopyRefuse=():never=>{throw new FormError('privacy_copy_unconfirmed',503);};
const betaCopyField=(r:Record<string,unknown>,key:string):unknown=>{const d=Object.getOwnPropertyDescriptor(r,key);return d&&Object.hasOwn(d,'value')?d.value:betaCopyRefuse();};
const betaCopyTime=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=999999999999;
export function projectOwnBetaWindowCopy(r:Record<string,unknown>):Record<string,unknown>{
 if(!r||typeof r!=='object'||Array.isArray(r))return betaCopyRefuse();
 const actor=betaCopyField(r,'own_actor'),requester=betaCopyField(r,'own_requester'),created=betaCopyField(r,'created_at'),expires=betaCopyField(r,'expires_at'),revoked=betaCopyField(r,'revoked_at');
 if((actor!==0&&actor!==1)||(requester!==0&&requester!==1)||actor+requester!==1||!betaCopyTime(created)||!betaCopyTime(expires)||expires<=created||expires>created+86400||!(revoked===null||betaCopyTime(revoked)&&revoked>=created))return betaCopyRefuse();
 const rank=betaCopyField(r,'own_native_rank'),index=betaCopyField(r,'own_native_rank_index'),count=betaCopyField(r,'own_native_rank_count'),requestCreated=betaCopyField(r,'own_request_created_at'),requestExpires=betaCopyField(r,'own_request_expires_at');
 if(actor===1?(rank!=='Officer'||index!==1||count!==5||requestCreated!==null||requestExpires!==null):(rank!==null||index!==null||count!==null||!betaCopyTime(requestCreated)||!betaCopyTime(requestExpires)||requestExpires<=requestCreated||requestExpires>requestCreated+600||expires>requestExpires))return betaCopyRefuse();
 return {relation:actor===1?'actor':'requester',createdAt:ownCopyDate(created),expiresAt:ownCopyDate(expires),revokedAt:ownCopyDate(revoked,true),actorNativeRank:actor===1?{name:rank,index,count}:null,requestCreatedAt:requester===1?ownCopyDate(requestCreated):null,requestExpiresAt:requester===1?ownCopyDate(requestExpires):null};
}
/** All six bounded pages age from immutable original clocks, never a later OFF toggle or lookup. */
export function betaProvenanceRetentionStatements(env:Env):D1PreparedStatement[]{return[
 env.DB.prepare(`DELETE FROM role_settlements WHERE id IN(SELECT r.id FROM role_settlements r JOIN verification_proofs p ON p.id=r.proof_id WHERE p.beta_window_id IS NOT NULL AND r.state IN('settled','held') AND r.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM role_settlements debt WHERE debt.request_digest=r.id OR (debt.subject=r.subject AND debt.attempts=1 AND debt.state IN('dispatching','unknown'))) ORDER BY r.expires_at,r.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM verification_proofs WHERE id IN(SELECT p.id FROM verification_proofs p WHERE p.beta_window_id IS NOT NULL AND p.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM role_settlements r WHERE r.proof_id=p.id) ORDER BY p.expires_at,p.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM verification_requests WHERE code IN(SELECT v.code FROM verification_requests v WHERE (v.beta_window_id IS NOT NULL OR EXISTS(SELECT 1 FROM qr_beta_fern_windows w WHERE w.request_code=v.code)) AND v.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.code=v.code) ORDER BY v.expires_at,v.code LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM councillor_challenges WHERE nonce IN(SELECT c.nonce FROM councillor_challenges c WHERE c.beta_window_id IS NOT NULL AND c.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.challenge=c.nonce) ORDER BY c.expires_at,c.nonce LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM councillor_keys WHERE id IN(SELECT k.id FROM councillor_keys k WHERE k.beta_window_id IS NOT NULL AND k.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM councillor_challenges c WHERE c.key_id=k.id) AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.key_id=k.id) ORDER BY k.expires_at,k.id LIMIT 1000)`),
 env.DB.prepare(`DELETE FROM qr_beta_fern_windows WHERE id IN(SELECT w.id FROM qr_beta_fern_windows w WHERE w.expires_at<=${T}-${YEAR} AND NOT EXISTS(SELECT 1 FROM councillor_keys k WHERE k.beta_window_id=w.id) AND NOT EXISTS(SELECT 1 FROM councillor_challenges c WHERE c.beta_window_id=w.id) AND NOT EXISTS(SELECT 1 FROM verification_proofs p WHERE p.beta_window_id=w.id) AND NOT EXISTS(SELECT 1 FROM verification_requests v WHERE v.beta_window_id=w.id OR v.code=w.request_code) ORDER BY w.expires_at,w.id LIMIT 1000)`),
 ];}
