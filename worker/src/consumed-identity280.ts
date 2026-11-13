/** EXPLORATORY option-B identity-only vocabulary. Never a provider/effect receipt. */
export const NEUTRAL_IDENTITY_PURPOSE280='original_identity_intent280';
export const NEUTRAL_IDENTITY_PROFILE280='olympus-original-identity-20261113-v1';
export const NEUTRAL_IDENTITY_REASON280='original_identity_link_atomic';
export const NEUTRAL_IDENTITY_GUILD280='236932545793490944';
// The guild/everyone ID is never a grantable or removable entitlement.
export const NEUTRAL_IDENTITY_CARRIER280=NEUTRAL_IDENTITY_GUILD280;
const token=(x:string,n:number)=>`(typeof(${x})='text' AND length(${x})=${n} AND length(CAST(${x} AS BLOB))=${n} AND ${x} NOT GLOB '*[^0-9a-f]*')`;
/** Source-authored aliases only. This classifier is identity history, never an effect gate. */
export function neutralIdentityTagged280(a:string):string {
 if(!/^[a-z][a-z0-9_]*$/.test(a))throw Error('neutral_alias_held');
 return `(${a}.purpose='${NEUTRAL_IDENTITY_PURPOSE280}' OR ${a}.native_profile='${NEUTRAL_IDENTITY_PROFILE280}')`;
}
export function neutralIdentityShape280(a:string):string {
 neutralIdentityTagged280(a);
 return and([
 `${a}.purpose='${NEUTRAL_IDENTITY_PURPOSE280}'`,`${a}.native_profile='${NEUTRAL_IDENTITY_PROFILE280}'`,`${a}.reason='${NEUTRAL_IDENTITY_REASON280}'`,
 `${a}.guild_id='${NEUTRAL_IDENTITY_GUILD280}'`,`${a}.role_id='${NEUTRAL_IDENTITY_CARRIER280}'`,`${a}.desired=1`,`${a}.state='settled'`,`${a}.attempts=0`,
 `${a}.claim_nonce IS NULL`,`${a}.proof_id IS NULL`,`${a}.native_rank IS NULL`,`${a}.native_rank_name IS NULL`,
 token(a+'.id',32),token(a+'.request_digest',64),`${a}.id=substr(${a}.request_digest,1,32)`,
 `typeof(${a}.subject)='text'`,`length(${a}.subject) BETWEEN 17 AND 20`,`${a}.subject GLOB '[1-9]*'`,`${a}.subject NOT GLOB '*[^0-9]*'`,`length(CAST(${a}.subject AS BLOB))=length(${a}.subject)`,
 `(${a}.subject_generation IS NULL OR ${token(a+'.subject_generation',32)})`,
 `typeof(${a}.roster_id)='integer'`,`${a}.roster_id>0`,`typeof(${a}.native_guid)='text'`,`substr(${a}.native_guid,1,7)='Player-'`,`length(CAST(${a}.native_guid AS BLOB))=length(${a}.native_guid)`,`instr(${a}.native_guid,char(0))=0`,
 `length(substr(${a}.native_guid,8,instr(substr(${a}.native_guid,8),'-')-1)) BETWEEN 1 AND 6`,`substr(${a}.native_guid,8,instr(substr(${a}.native_guid,8),'-')-1) NOT GLOB '*[^0-9]*'`,
 `length(substr(${a}.native_guid,8+instr(substr(${a}.native_guid,8),'-'))) BETWEEN 4 AND 16`,`substr(${a}.native_guid,8+instr(substr(${a}.native_guid,8),'-')) NOT GLOB '*[^0-9A-Fa-f]*'`,
 `typeof(${a}.created_at)='integer'`,`${a}.created_at>0`,`typeof(${a}.expires_at)='integer'`,`${a}.expires_at>${a}.created_at`,`${a}.expires_at<=${a}.created_at+300`,
 `${a}.checked_at=${a}.created_at`,`typeof(${a}.checked_at)='integer'`,`${a}.created_at<=CAST(strftime('%s','now') AS INTEGER)`]);
}
function and(parts:readonly string[]):string {if(parts.length===1)return '('+parts[0]+')';const half=Math.floor(parts.length/2);return '('+and(parts.slice(0,half))+' AND '+and(parts.slice(half))+')';}

