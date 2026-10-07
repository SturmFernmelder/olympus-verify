/** Separate privacy purposes. No route, identity provider, account creation, member access or eraser is enabled here. */
import { Database, DB_NOW, id, randomGeneration, snapshotDataFields, token } from './account-generation-contracts';

export const PRIVACY_PURPOSES = ['privacy_identity','privacy_export','privacy_site_erase','privacy_full_erase','privacy_bnet_unlink'] as const;
export type PrivacyPurpose = typeof PRIVACY_PURPOSES[number];
export type PrivacyLifecycle = 'active'|'retiring'|'retired';
export type PrivacyCapture = Readonly<{subject:string;accountGeneration:string;purposeGeneration:string;epoch:string;purpose:PrivacyPurpose;lifecycle:PrivacyLifecycle}>;
function privacyPurpose(p:unknown):asserts p is PrivacyPurpose {
 if(typeof p!=='string'||!(PRIVACY_PURPOSES as readonly string[]).includes(p))throw Error('invalid_privacy_purpose');
}
function lifecycle(value:unknown):asserts value is PrivacyLifecycle {
 if(typeof value!=='string'||!['active','retiring','retired'].includes(value))throw Error('invalid_privacy_lifecycle');
}
function eligible(p:PrivacyPurpose,state:PrivacyLifecycle):boolean {return p!=='privacy_full_erase'||state!=='retired';}
/** Exact primitive snapshot, including lifecycle. No coercion, extra fields, NULL-current fallback or shared object. */
export function snapshotPrivacyCapture(input:PrivacyCapture):PrivacyCapture {
 const d=snapshotDataFields(input,['subject','accountGeneration','purposeGeneration','epoch','purpose','lifecycle'],'invalid_privacy_capture');
 const v={subject:d.subject,accountGeneration:d.accountGeneration,purposeGeneration:d.purposeGeneration,epoch:d.epoch,purpose:d.purpose,lifecycle:d.lifecycle} as PrivacyCapture;
 id(v.subject);token(v.accountGeneration);token(v.purposeGeneration);token(v.epoch);privacyPurpose(v.purpose);lifecycle(v.lifecycle);
 if(!eligible(v.purpose,v.lifecycle))throw Error('privacy_purpose_not_eligible');
 return Object.freeze(v);
}
export const privacyValues=(c:PrivacyCapture):unknown[]=>[c.subject,c.accountGeneration,c.purpose,c.purposeGeneration,c.epoch,c.lifecycle];
/** Parameters1..6: subject/account generation/purpose/purpose generation/global epoch/exact captured lifecycle.
 * Copy this authored predicate into the actual admitted SQL read/mutation; a previous current() is not a write fence.
 * Retired accounts receive only their existing limited rights. Full erasure of a retired account reads existing status.
 */
export const PRIVACY_FENCE=`EXISTS(SELECT 1 FROM account_generations a
 JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation
 JOIN generation_control g ON g.singleton=1
 WHERE a.account_id=?1 AND a.generation=?2 AND p.purpose=?3 AND p.generation=?4
 AND g.epoch=?5 AND g.restore_hold=0 AND a.state=?6
 AND p.purpose IN('privacy_identity','privacy_export','privacy_site_erase','privacy_full_erase','privacy_bnet_unlink')
 AND (p.purpose<>'privacy_full_erase' OR a.state IN('active','retiring')))`;

/** Trusted identity/control coordinator supplies already-verified facts. This never creates or reopens an account.
 * Purpose rotation is a compare-and-set of the existing generation, with NULL meaning explicit row absence only.
 */
export async function rotatePrivacyPurpose(db:Database,subject:string,accountGeneration:string,state:PrivacyLifecycle,epoch:string,p:PrivacyPurpose,expected:string|null):Promise<PrivacyCapture|null> {
 id(subject);token(accountGeneration);lifecycle(state);token(epoch);privacyPurpose(p);if(expected!==null)token(expected);
 if(!eligible(p,state))return null;
 const generation=randomGeneration();
 const row=await db.prepare(`INSERT INTO account_purpose_generations(account_id,account_generation,purpose,generation,updated_at)
 SELECT ?1,?2,?3,?4,${DB_NOW} WHERE EXISTS(SELECT 1 FROM account_generations a,generation_control g
 WHERE a.account_id=?1 AND a.generation=?2 AND a.state=?7 AND g.singleton=1 AND g.epoch=?5 AND g.restore_hold=0)
 AND (?3<>'privacy_full_erase' OR ?7 IN('active','retiring'))
 AND (SELECT generation FROM account_purpose_generations WHERE account_id=?1 AND purpose=?3) IS ?6
 ON CONFLICT(account_id,purpose) DO UPDATE SET account_generation=?2,generation=?4,revision=revision+1,updated_at=${DB_NOW}
 RETURNING generation`).bind(subject,accountGeneration,p,generation,epoch,expected,state).first<{generation:string}>();
 return row?snapshotPrivacyCapture({subject,accountGeneration,purpose:p,purposeGeneration:row.generation,epoch,lifecycle:state}):null;
}

/** One atomic current tuple read. Missing/obsolete purposes and restore hold are closed; no authority is minted. */
export async function readPrivacyCapture(db:Database,subject:string,p:PrivacyPurpose):Promise<PrivacyCapture|null> {
 id(subject);privacyPurpose(p);
 const row=await db.prepare(`SELECT a.account_id AS subject,a.generation AS accountGeneration,p.generation AS purposeGeneration,g.epoch,p.purpose,a.state AS lifecycle
 FROM account_generations a JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation
 JOIN generation_control g ON g.singleton=1 WHERE a.account_id=?1 AND p.purpose=?2 AND g.restore_hold=0
 AND (p.purpose<>'privacy_full_erase' OR a.state IN('active','retiring'))`).bind(subject,p).first<PrivacyCapture>();
 return row?snapshotPrivacyCapture(row):null;
}
export async function currentPrivacyCapture(db:Database,input:PrivacyCapture):Promise<boolean> {
 const captured=snapshotPrivacyCapture(input);
 return !!await db.prepare(`SELECT 1 AS present WHERE ${PRIVACY_FENCE}`).bind(...privacyValues(captured)).first<{present:number}>();
}
/** Trusted sign-out/revocation coordinator only. Revoke all five own privacy purposes without ordinary account/role writes.
 * Exact lifecycle/account/epoch admission is required; historical purposes are not an unbounded deletion selector.
 */
export async function revokePrivacyCaptures(db:Database,subject:string,accountGeneration:string,state:PrivacyLifecycle,epoch:string):Promise<number> {
 id(subject);token(accountGeneration);lifecycle(state);token(epoch);
 const out=await db.prepare(`DELETE FROM account_purpose_generations WHERE account_id=?1 AND account_generation=?2
 AND purpose IN('privacy_identity','privacy_export','privacy_site_erase','privacy_full_erase','privacy_bnet_unlink')
 AND EXISTS(SELECT 1 FROM account_generations a,generation_control g WHERE a.account_id=?1 AND a.generation=?2
 AND a.state=?3 AND g.singleton=1 AND g.epoch=?4 AND g.restore_hold=0)`).bind(subject,accountGeneration,state,epoch).run();
 return Number(out.meta?.changes??0);
}
