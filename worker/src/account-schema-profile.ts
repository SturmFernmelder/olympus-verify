/** Fixed complete source-profile read; a schema result grants no account/ticket/installation authority.
 * The central lowerer binds three immutable complete profiles. No SQL-normalization or mixed layouts. */
import {ACCOUNT_SCHEMA_SOURCE_MARKER,SOURCE_SCHEMA_PROFILE_VERSION,readOriginalCompleteSchema,sourceSchemaObjectCount} from './privacy-schema-source-plan';
import {PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} from './privacy-provider-metadata';
export const ACCOUNT_SCHEMA_PROFILE_VERSION=SOURCE_SCHEMA_PROFILE_VERSION;
/** Same original predicate in every consuming statement. Native consumes a fresh whole profile each time. */
export function accountSchemaFenceSql():string{return ACCOUNT_SCHEMA_SOURCE_MARKER;}
/** Logical source plan only. The fixed reader performs the private physical binding before Native prepare. */
export function accountSchemaAdmissionSql():string{return `SELECT CASE WHEN ${ACCOUNT_SCHEMA_SOURCE_MARKER} THEN 1 ELSE 0 END AS admitted,(SELECT count(*) FROM (SELECT 1 FROM main.sqlite_master WHERE ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} LIMIT 444)) AS object_count,'${ACCOUNT_SCHEMA_PROFILE_VERSION}' AS profile_version`;}
export interface SchemaReadDatabase {prepare(sql:string):{first():Promise<unknown>}}
export type SchemaReadStatus=Readonly<{state:'qualified'|'held';reason:'physical-schema-current'|'schema-mismatch'|'schema-unreadable';profile:typeof ACCOUNT_SCHEMA_PROFILE_VERSION;attempts:1;accountAuthority:false}>;
const status=(state:SchemaReadStatus['state'],reason:SchemaReadStatus['reason']):SchemaReadStatus=>Object.freeze({state,reason,profile:ACCOUNT_SCHEMA_PROFILE_VERSION,attempts:1,accountAuthority:false});
function fields(raw:unknown):Readonly<Record<string,unknown>>|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;try{const keys=Reflect.ownKeys(raw),out:Record<string,unknown>={};if(keys.length!==3||keys.some(k=>typeof k!=='string'||!['admitted','object_count','profile_version'].includes(k)))return null;
 for(const key of ['admitted','object_count','profile_version']){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d||!Object.hasOwn(d,'value'))return null;out[key]=d.value;}return Object.freeze(out);}catch{return null;}}
/** Trusted database port only. Strict result shape; no result/caller can replace the compiled profile. */
export async function readAccountSchemaProfile(db:SchemaReadDatabase):Promise<SchemaReadStatus>{
 try{const d=fields(await readOriginalCompleteSchema(db));if(!d||d.profile_version!==ACCOUNT_SCHEMA_PROFILE_VERSION||!Number.isSafeInteger(d.object_count)||(d.object_count as number)<0||(d.admitted!==0&&d.admitted!==1))return status('held','schema-unreadable');
 if(d.admitted!==1||!sourceSchemaObjectCount(d.object_count as number))return status('held','schema-mismatch');return status('qualified','physical-schema-current');
 }catch{return status('held','schema-unreadable');}}
