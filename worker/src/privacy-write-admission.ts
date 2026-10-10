/** Source-qualified transaction transport. Entry selection is explicit and installation is separate.
 * Original generation/session/custody predicates remain payload authority. The global slot supplies
 * only transaction-local exclusion of old unwrapped writers. A committed active slot is refused.
 */
import {ADMISSION_CONTROL_TABLE as SLOT,ADMISSION_PROTOCOL as VERSION,ADMISSION_EXPECTED_JSON,ADMISSION_PHYSICAL_EXPECTED_JSON,ADMISSION_CONTROL_DDL} from './privacy-write-admission-catalogue';
const registered=new WeakSet<D1Database>();
export type AdmissionLayout='canonical'|'recorded-live-20261010';
const catalogues=new WeakMap<D1Database,string>();
const expectedLayout=(layout:AdmissionLayout):string=>{
 if(layout==='canonical')return ADMISSION_EXPECTED_JSON;
 if(layout==='recorded-live-20261010')return ADMISSION_PHYSICAL_EXPECTED_JSON;
 throw new PrivacyWriteAdmissionHeld('unqualified_layout');
};
const countedReads=new WeakMap<D1Database,()=>void>();
const statements=new WeakMap<D1PreparedStatement,{sql:string;raw:D1PreparedStatement;origin:object}>();
export class PrivacyWriteAdmissionHeld extends Error {constructor(reason:string){super(`privacy_write_admission_held:${reason}`);}}
export const isPrivacyWriteAdmissionDatabase=(db:D1Database):boolean=>registered.has(db);
/** Source-owned counted facade only; preserve protocol identity and charge native proof reads. */
export function registerAdmissionCountedDatabase(wrapper:D1Database,base:D1Database,onRead:()=>void):void{
 if(!registered.has(base))return;registered.add(wrapper);natives.set(wrapper,nativeFor(base));catalogues.set(wrapper,catalogues.get(base)!);countedReads.set(wrapper,onRead);
}
/** Conservative source-plan classification. It can overcharge a read mentioning DML; it never exempts a writer. */
export const admissionPlanWrites=(sql:string):boolean=>/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
export const admissionTransportCost=(sqls:readonly string[]):number=>sqls.some(admissionPlanWrites)?4:0;

const CATALOGUE_CTE=`WITH business AS MATERIALIZED(SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND name<>'${SLOT}'),
 expected AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.columns') AS columns FROM json_each(?3,'$.tables')),
 actual_columns AS MATERIALIZED(SELECT m.name,p.name AS column_name FROM business m JOIN pragma_table_info(m.name) p),
 wanted_columns AS MATERIALIZED(SELECT e.name,j.value AS column_name FROM expected e JOIN json_each(e.columns) j),
 expected_triggers AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql FROM json_each(?3,'$.triggers')),
 expected_indexes AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.tbl_name') AS tbl_name FROM json_each(?3,'$.indexes'))`;
const TABLES_CURRENT=`(SELECT sql FROM sqlite_master WHERE type='table' AND name='${SLOT}')=json_extract(?3,'$.slotSQL')
 AND (SELECT COUNT(*) FROM pragma_table_info('${SLOT}'))=7
 AND NOT EXISTS(SELECT name FROM pragma_table_info('${SLOT}') EXCEPT SELECT value FROM json_each(?3,'$.slotColumns'))
 AND (SELECT COUNT(*) FROM business)=66 AND (SELECT COUNT(*) FROM expected)=66
 AND NOT EXISTS(SELECT name,sql FROM business EXCEPT SELECT name,sql FROM expected)
 AND NOT EXISTS(SELECT name,sql FROM expected EXCEPT SELECT name,sql FROM business)
 AND NOT EXISTS(SELECT name,column_name FROM actual_columns EXCEPT SELECT name,column_name FROM wanted_columns)
 AND NOT EXISTS(SELECT name,column_name FROM wanted_columns EXCEPT SELECT name,column_name FROM actual_columns)
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' EXCEPT SELECT name,sql,tbl_name FROM expected_indexes)
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM expected_indexes EXCEPT SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_')`;
const SCHEMA_CURRENT=`${TABLES_CURRENT} AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger')=198
 AND NOT EXISTS(SELECT name,sql FROM sqlite_master WHERE type='trigger' EXCEPT SELECT name,sql FROM expected_triggers)
 AND NOT EXISTS(SELECT name,sql FROM expected_triggers EXCEPT SELECT name,sql FROM sqlite_master WHERE type='trigger')`;
const CONTROL_ROW=`(SELECT COUNT(*) FROM ${SLOT})=1 AND EXISTS(SELECT 1 FROM ${SLOT} WHERE singleton=1 AND protocol='${VERSION}'
 AND typeof(singleton)='integer' AND typeof(active)='integer' AND typeof(entry_changes)='integer' AND entry_changes>=0
 AND typeof(logical_changes)='integer' AND logical_changes>=0`;
const ADMIT=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=1 AND nonce=?1 AND purpose=?2)
 THEN 1 ELSE json_extract('privacy_write_catalogue_or_control_refused','$') END AS admitted`;
const CURRENT=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='') THEN 1 ELSE 0 END AS current`;
const CURRENT_SCHEMA=`${CATALOGUE_CTE} SELECT CASE WHEN ${SCHEMA_CURRENT} AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='')
 AND EXISTS(SELECT 1 FROM site_settings WHERE key='auditTypedNames' AND value='115')
 AND NOT EXISTS(SELECT 1 FROM site_applications WHERE position IN('raid_leader','raid_assist'))
 AND NOT EXISTS(SELECT 1 FROM site_votes WHERE ballot='raid_leader')
 AND NOT EXISTS(SELECT 1 FROM audit WHERE action='site.settings' AND CASE WHEN json_valid(details)
 THEN json_type(details,'$.appointed') IS NOT NULL OR json_type(details,'$.notice')='text' ELSE 1 END)
 THEN 1 ELSE json_extract('privacy_current_schema_requires_attended_setup','$') END AS current`;
/** Explicit installation only, never invoked by fetch/cron. Exact canonical business/schema data,
 * neutral control and zero preexisting triggers are prerequisites. Every DDL/proof shares one native
 * transaction; failure rolls back. A lost commit reply is preserved and never automatically retried.
 * This does not qualify old accepted HTTP effects or historic differing physical CREATE text.
 */
export async function installCurrentPrivacyWriteAdmission(native:D1Database,layout:AdmissionLayout='canonical'):Promise<{statements:number;tables:number;triggers:number}>{
 if(registered.has(native))throw new PrivacyWriteAdmissionHeld('installer_requires_native');
 const expected=expectedLayout(layout),manifest=JSON.parse(expected) as {triggers:{sql:string}[]};
 const before=`${CATALOGUE_CTE} SELECT CASE WHEN ${TABLES_CURRENT} AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger')=0
 AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='')
 AND EXISTS(SELECT 1 FROM site_settings WHERE key='auditTypedNames' AND value='115')
 THEN 1 ELSE json_extract('privacy_installation_source_refused','$') END AS admitted`;
 const statements=[native.prepare(ADMISSION_CONTROL_DDL.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ')),
 native.prepare(`INSERT OR IGNORE INTO ${SLOT} VALUES(1,'${VERSION}',0,'','',0,0)`),
 native.prepare(before).bind('','',expected),...manifest.triggers.map(t=>native.prepare(t.sql)),
 native.prepare(CURRENT_SCHEMA).bind('','',expected)];
 const out=await native.batch<{current?:number;admitted?:number}>(statements);
 if(out.length!==statements.length||out[2]?.results[0]?.admitted!==1||out.at(-1)?.results[0]?.current!==1)throw new PrivacyWriteAdmissionHeld('installation_commit_unconfirmed');
 return {statements:statements.length,tables:67,triggers:198};
}
const HEADER=`UPDATE ${SLOT} SET entry_changes=changes(),active=1,nonce=?1,purpose=?2 WHERE singleton=1 AND protocol='${VERSION}'
 AND active=0 AND nonce='' AND purpose='' AND typeof(singleton)='integer' AND typeof(active)='integer'
 AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0`;
const CLEAR=`UPDATE ${SLOT} SET logical_changes=changes(),active=CASE WHEN protocol='${VERSION}' AND active=1 AND nonce=?1 AND purpose=?2 THEN 0 ELSE -1 END,nonce='',purpose=''
 WHERE singleton=1 RETURNING active,nonce,purpose,entry_changes,logical_changes`;
const TERMINAL=`SELECT CASE WHEN changes()=1 AND ${CONTROL_ROW} AND active=0 AND nonce='' AND purpose='') THEN 1
 ELSE json_extract('privacy_terminal_write_control_refused','$') END AS closed`;
const randomHex=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
function assertSourcePlan(plan:readonly {sql:string}[]):void {
 if(plan.length>150)throw new PrivacyWriteAdmissionHeld('plan_too_large');
 for(const s of plan)if(s.sql.includes(SLOT)||/\b(?:CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/i.test(s.sql)||!/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql))throw new PrivacyWriteAdmissionHeld('unsupported_constructor');
 const first=plan.findIndex(s=>admissionPlanWrites(s.sql));
 for(let i=0;i<plan.length;i++)if(/\bchanges\s*\(/i.test(plan[i].sql)&&(first<0||i<=first))throw new PrivacyWriteAdmissionHeld('first_changes_requires_closed_constructor');
}
/** Exact source-derived proof; neither an installed control name nor arbitrary namespace grants an exemption. */
export async function admissionCatalogueCurrent(db:D1Database):Promise<boolean>{
 if(!registered.has(db))return false;
 countedReads.get(db)?.();
 const row=await nativeFor(db).prepare(CURRENT).bind('', '', catalogues.get(db)!).first<{current:number}>();
 return row?.current===1;
}
const natives=new WeakMap<D1Database,D1Database>();
const nativeFor=(db:D1Database):D1Database=>{const n=natives.get(db);if(!n)throw new PrivacyWriteAdmissionHeld('unregistered_database');return n;};
/** This branch is a read only proof. Missing migration/marker/legacy rewrite is held, never performed here. */
export async function assertAdmissionCurrentSchema(db:D1Database):Promise<void>{
 countedReads.get(db)?.();
 const row=await nativeFor(db).prepare(CURRENT_SCHEMA).bind('', '', catalogues.get(db)!).first<{current:number}>();
 if(row?.current!==1)throw new PrivacyWriteAdmissionHeld('current_schema_unconfirmed');
}
/** Installation and provider-transition closure are separately measured prerequisites.
 * Unknown prepared objects/DDL/native first changes consumers are refused. Payload metadata and slots
 * are returned unchanged after a known native commit. Lost primary replies are never retried.
 * Physical changes() across calls is unsupported; last_insert_rowid() is untouched by control UPDATEs.
 */
export function createPrivacyWriteAdmissionDatabase(native:D1Database,purpose:'writer'|'lifecycle'='writer',layout:AdmissionLayout='canonical'):D1Database {
 if(purpose!=='writer'&&purpose!=='lifecycle')throw new PrivacyWriteAdmissionHeld('purpose');
 const expected=expectedLayout(layout);
 const origin=Object.freeze({native,purpose});
 const execute=async(plan:D1PreparedStatement[]):Promise<D1Result<Record<string,unknown>>[]>=>{
  const source=plan.map(s=>{const p=statements.get(s);if(!p||p.origin!==origin)throw new PrivacyWriteAdmissionHeld('foreign_statement_scope');return p;});
  assertSourcePlan(source);
  if(!source.some(s=>admissionPlanWrites(s.sql)))return native.batch<Record<string,unknown>>(source.map(s=>s.raw));
  const nonce=randomHex(),out=await native.batch<Record<string,unknown>>([
   native.prepare(HEADER).bind(nonce,purpose),native.prepare(ADMIT).bind(nonce,purpose,expected),
   ...source.map(s=>s.raw),native.prepare(CLEAR).bind(nonce,purpose),native.prepare(TERMINAL),
  ]);
  const closed=out.at(-2)?.results;
  if(closed?.length!==1||closed[0].active!==0||closed[0].nonce!==''||closed[0].purpose!==''||out.at(-1)?.results[0]?.closed!==1)throw new PrivacyWriteAdmissionHeld('known_commit_reply_unconfirmed');
  return out.slice(2,-2);
 };
 const prepare=(sql:string,raw=native.prepare(sql)):D1PreparedStatement=>{
  const statement={
   bind(...values:unknown[]){return prepare(sql,raw.bind(...values));},
   async all<T=unknown>(){return (await execute([statement as unknown as D1PreparedStatement]))[0] as D1Result<T>;},
   async run<T=unknown>(){return (await execute([statement as unknown as D1PreparedStatement]))[0] as D1Result<T>;},
   async first<T=unknown>(column?:string){const row=(await execute([statement as unknown as D1PreparedStatement]))[0]?.results[0]??null;return (column&&row!==null?(row as Record<string,unknown>)[column]??null:row) as T|null;},
   raw<T=unknown>(options?:{columnNames?:boolean}){assertSourcePlan([{sql}]);if(admissionPlanWrites(sql))throw new PrivacyWriteAdmissionHeld('raw_writer');return options?.columnNames?raw.raw<T>({columnNames:true}):raw.raw<T>();},
  };
  statements.set(statement as unknown as D1PreparedStatement,{sql,raw,origin});return statement as unknown as D1PreparedStatement;
 };
 const db={prepare,batch:execute,exec(){throw new PrivacyWriteAdmissionHeld('exec');},dump(){throw new PrivacyWriteAdmissionHeld('dump');},withSession(){throw new PrivacyWriteAdmissionHeld('session');}} as unknown as D1Database;
 registered.add(db);natives.set(db,native);catalogues.set(db,expected);return db;
}
