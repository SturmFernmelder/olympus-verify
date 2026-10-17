/** Isolated epoch-2 candidate. Native installation/closure only; no restore/reopen/provider authority.
 * The originating native database and original full control tuple are held in a private capability.
 * Byte/source hashes qualify constructor inputs; they never authenticate a remote current origin.
 */
import {ADMISSION_CONTROL_TABLE as SLOT,ADMISSION_PROTOCOL as VERSION,ADMISSION_CONTROL_DDL,
 ADMISSION_EXPECTED_JSON,ADMISSION_PHYSICAL_EXPECTED_JSON,ADMISSION_PREDECESSOR_JSON} from './privacy-write-admission-catalogue';
import {isPrivacyWriteAdmissionDatabase,type AdmissionLayout,PrivacyWriteAdmissionHeld} from './privacy-write-admission';
import {PROVIDER_METADATA_CURRENT_SQL,PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} from './privacy-provider-metadata';
type Manifest={tables:{name:string;sql:string;columns:string[]}[];indexes:{name:string;sql:string;tbl_name:string}[];triggers:{name:string;sql:string}[];slotSQL:string;slotColumns:string[]};
type Original=Readonly<{operationId:string;layout:AdmissionLayout;nextEpoch:string}>;
export type NativeEpochCapability=Readonly<{kind:'offline_native_epoch_candidate_only';operationId:string;layout:AdmissionLayout;nextEpoch:string;capturedAt:number;expiresAt:number;readyToReopen:false}>;
type Stored={native:D1Database;kind:'install'|'close';old:Manifest;next:Manifest;tuple:string;originalEpoch:string|null;spent:boolean};
const captures=new WeakMap<NativeEpochCapability,Stored>();
const hex=(v:unknown):v is string=>typeof v==='string'&&v.length===32&&!/[^0-9a-f]/.test(v);
const NOW="CAST(strftime('%s','now') AS INTEGER)";
const predecessor=JSON.parse(ADMISSION_PREDECESSOR_JSON) as {protocol:string;canonical:Manifest;'recorded-live-20261010':Manifest};
const nextManifest=(layout:AdmissionLayout):Manifest=>JSON.parse(layout==='canonical'?ADMISSION_EXPECTED_JSON:ADMISSION_PHYSICAL_EXPECTED_JSON) as Manifest;
function originalInput(x:Original):Original{
 if(!x||Object.keys(x).sort().join(',')!=='layout,nextEpoch,operationId')throw new PrivacyWriteAdmissionHeld('epoch_original_input');
 const original=Object.freeze({operationId:x.operationId,layout:x.layout,nextEpoch:x.nextEpoch});
 if(!hex(original.operationId)||!hex(original.nextEpoch)||!['canonical','recorded-live-20261010'].includes(original.layout))throw new PrivacyWriteAdmissionHeld('epoch_original_input');
 return original;
}
const tupleSql=(legacy:boolean)=>`json_array(singleton,protocol,active,nonce,purpose,entry_changes,logical_changes${legacy?'':',epoch,mode'})`;
const columnTuple=(legacy:boolean)=>legacy?'singleton,protocol,active,nonce,purpose,entry_changes,logical_changes':'singleton,protocol,active,nonce,purpose,entry_changes,logical_changes,epoch,mode';
function proof(m:Manifest,legacy:boolean,mode:'closed'|'serving'|null,original:boolean):string{
 const epochClause=legacy?" AND ?4=''":` AND epoch=?4 AND mode='${mode}' AND typeof(epoch)='text' AND length(epoch)=32 AND epoch NOT GLOB '*[^0-9a-f]*'`;
 return `WITH business AS MATERIALIZED(SELECT name,sql FROM sqlite_master WHERE type='table' AND substr(lower(name),1,7)<>'sqlite_' AND name<>'_cf_KV' AND ${PROVIDER_METADATA_APPLICATION_OBJECT_FILTER_SQL} AND name<>'${SLOT}'),
 expected AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.columns') AS columns FROM json_each(?1,'$.tables')),
 actual_columns AS MATERIALIZED(SELECT m.name,p.name AS column_name FROM business m JOIN pragma_table_info(m.name) p),
 wanted_columns AS MATERIALIZED(SELECT e.name,j.value AS column_name FROM expected e JOIN json_each(e.columns) j),
 expected_indexes AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql,json_extract(value,'$.tbl_name') AS tbl_name FROM json_each(?1,'$.indexes')),
 expected_triggers AS MATERIALIZED(SELECT json_extract(value,'$.name') AS name,json_extract(value,'$.sql') AS sql FROM json_each(?1,'$.triggers'))
 SELECT CASE WHEN ${PROVIDER_METADATA_CURRENT_SQL} AND (SELECT COUNT(*) FROM business)=${m.tables.length} AND (SELECT COUNT(*) FROM expected)=${m.tables.length}
 AND NOT EXISTS(SELECT name,sql FROM business EXCEPT SELECT name,sql FROM expected)
 AND NOT EXISTS(SELECT name,sql FROM expected EXCEPT SELECT name,sql FROM business)
 AND NOT EXISTS(SELECT name,column_name FROM actual_columns EXCEPT SELECT name,column_name FROM wanted_columns)
 AND NOT EXISTS(SELECT name,column_name FROM wanted_columns EXCEPT SELECT name,column_name FROM actual_columns)
 AND (SELECT sql FROM sqlite_master WHERE type='table' AND name='${SLOT}')=json_extract(?1,'$.slotSQL')
 AND (SELECT COUNT(*) FROM pragma_table_info('${SLOT}'))=${legacy?7:9}
 AND NOT EXISTS(SELECT name FROM pragma_table_info('${SLOT}') EXCEPT SELECT value FROM json_each(?1,'$.slotColumns'))
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger')=${m.triggers.length}
 AND NOT EXISTS(SELECT name,sql FROM sqlite_master WHERE type='trigger' EXCEPT SELECT name,sql FROM expected_triggers)
 AND NOT EXISTS(SELECT name,sql FROM expected_triggers EXCEPT SELECT name,sql FROM sqlite_master WHERE type='trigger')
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_' EXCEPT SELECT name,sql,tbl_name FROM expected_indexes)
 AND NOT EXISTS(SELECT name,sql,tbl_name FROM expected_indexes EXCEPT SELECT name,sql,tbl_name FROM sqlite_master WHERE type='index' AND substr(lower(name),1,7)<>'sqlite_')
 AND (SELECT COUNT(*) FROM ${SLOT})=1 AND EXISTS(SELECT 1 FROM ${SLOT} WHERE singleton=1 AND typeof(singleton)='integer'
 AND protocol='${legacy?predecessor.protocol:VERSION}' AND typeof(active)='integer' AND active=0 AND nonce='' AND purpose=''
 AND typeof(entry_changes)='integer' AND entry_changes>=0 AND typeof(logical_changes)='integer' AND logical_changes>=0${epochClause}${original?` AND ${tupleSql(legacy)}=?2`:''})
 AND EXISTS(SELECT 1 FROM site_settings WHERE key='auditTypedNames' AND value='115')
 AND NOT EXISTS(SELECT 1 FROM site_applications WHERE position IN('raid_leader','raid_assist'))
 AND NOT EXISTS(SELECT 1 FROM site_votes WHERE ballot='raid_leader')
 AND NOT EXISTS(SELECT 1 FROM audit WHERE action='site.settings' AND CASE WHEN json_valid(details) THEN json_type(details,'$.appointed') IS NOT NULL OR json_type(details,'$.notice')='text' ELSE 1 END)
 AND ${NOW}<?3 THEN 1 ELSE json_extract('privacy_epoch_transition_source_refused','$') END AS admitted,
 (SELECT ${tupleSql(legacy)} FROM ${SLOT} WHERE singleton=1) AS original,${NOW} AS observed_at`;
}
async function capture(native:D1Database,x:Original,kind:'install'|'close',originalEpoch:string|null):Promise<NativeEpochCapability>{
 x=originalInput(x);
 // The serving-only predecessor layout has no restore/install manifest or authority.
 if(x.layout!=='canonical'&&x.layout!=='recorded-live-20261010')throw new PrivacyWriteAdmissionHeld('epoch_original_input');
 if(isPrivacyWriteAdmissionDatabase(native)||kind==='close'&&(!hex(originalEpoch)||x.nextEpoch===originalEpoch))throw new PrivacyWriteAdmissionHeld('epoch_native_original_required');
 const old=kind==='install'?predecessor[x.layout]:nextManifest(x.layout),next=nextManifest(x.layout),legacy=kind==='install';
 // Current next-profile closure is distinct from the historical402 installation contract.
 // The latter is deliberately held against this68/83/213 source; it is not an installation path.
 if(kind==='close'){
  if(old.tables.length!==68||old.indexes.length!==83||old.triggers.length!==213||next.tables.length!==68||next.indexes.length!==83||next.triggers.length!==213)throw new PrivacyWriteAdmissionHeld('epoch_source_manifest');
 }else if(old.tables.length!==66||old.indexes.length!==78||old.triggers.length!==(legacy?198:199)||next.triggers.length!==199)throw new PrivacyWriteAdmissionHeld('epoch_source_manifest');
 // Native time and exact installed layout are observed together; no JavaScript clock renewal.
 const row=await native.prepare(proof(old,legacy,legacy?null:'serving',false)).bind(JSON.stringify(old),'',Number.MAX_SAFE_INTEGER,originalEpoch??'').first<{admitted:number;original:string;observed_at:number}>();
 if(!row||row.admitted!==1||typeof row.original!=='string'||!Number.isSafeInteger(row.observed_at)||row.observed_at<=0)throw new PrivacyWriteAdmissionHeld('epoch_capture_unconfirmed');
 const c=Object.freeze({kind:'offline_native_epoch_candidate_only' as const,operationId:x.operationId,layout:x.layout,nextEpoch:x.nextEpoch,capturedAt:row.observed_at,expiresAt:row.observed_at+86400,readyToReopen:false as const});
 captures.set(c,{native,kind,old,next,tuple:row.original,originalEpoch,spent:false});return c;
}
export function captureClosedEpochInstallation(native:D1Database,original:Original):Promise<NativeEpochCapability>{return capture(native,original,'install',null);}
export function captureServingEpochClosure(native:D1Database,original:Original&Readonly<{originalEpoch:string}>):Promise<NativeEpochCapability>{
 if(!original||Object.keys(original).sort().join(',')!=='layout,nextEpoch,operationId,originalEpoch')throw new PrivacyWriteAdmissionHeld('epoch_closure_input');
 return capture(native,{operationId:original.operationId,layout:original.layout,nextEpoch:original.nextEpoch},'close',original.originalEpoch);
}
function consume(c:NativeEpochCapability,kind:'install'|'close'):Stored{
 const r=captures.get(c);if(!r||r.kind!==kind||r.spent)throw new PrivacyWriteAdmissionHeld('epoch_capability_unqualified_or_spent');
 r.spent=true;return r;
}
const heldReceipt=(c:NativeEpochCapability,statements:number)=>{
 const r=captures.get(c);if(!r)throw new PrivacyWriteAdmissionHeld('epoch_receipt_original_required');
 return Object.freeze({operationId:c.operationId,epoch:c.nextEpoch,mode:'closed' as const,statements,tables:r.kind==='close'?r.next.tables.length+1:67,triggers:r.kind==='close'?r.next.triggers.length:199,readyToReopen:false as const,remoteRestoreQualified:false as const,authenticatedCurrentOrigin:false as const,providerClosure:'unqualified' as const});
};
export async function installCapturedClosedEpoch(c:NativeEpochCapability):Promise<ReturnType<typeof heldReceipt>>{
 const r=consume(c,'install'),native=r.native;
 const statements=[native.prepare(proof(r.old,true,null,true)).bind(JSON.stringify(r.old),r.tuple,c.expiresAt,''),
 ...r.old.triggers.map(t=>native.prepare(`DROP TRIGGER "${t.name}"`)),native.prepare(`DROP TABLE ${SLOT}`),native.prepare(ADMISSION_CONTROL_DDL),
 native.prepare(`INSERT INTO ${SLOT}(${columnTuple(false)}) VALUES(1,?,0,'','',0,0,?,'closed')`).bind(VERSION,c.nextEpoch),
 ...r.next.triggers.map(t=>native.prepare(t.sql)),native.prepare(proof(r.next,false,'closed',false)).bind(JSON.stringify(r.next),'',c.expiresAt,c.nextEpoch)];
 if(statements.length!==402)throw new PrivacyWriteAdmissionHeld('epoch_installation_count');
 const out=await native.batch<{admitted?:number}>(statements);
 if(out.length!==402||out[0]?.results[0]?.admitted!==1||out.at(-1)?.results[0]?.admitted!==1)throw new PrivacyWriteAdmissionHeld('epoch_installation_commit_unconfirmed');
 return heldReceipt(c,402);
}
export async function closeCapturedServingEpoch(c:NativeEpochCapability):Promise<ReturnType<typeof heldReceipt>>{
 const r=consume(c,'close'),native=r.native;
 const out=await native.batch<{admitted?:number}>([
 native.prepare(proof(r.old,false,'serving',true)).bind(JSON.stringify(r.old),r.tuple,c.expiresAt,r.originalEpoch),
 native.prepare(`UPDATE ${SLOT} SET epoch=?1,mode='closed' WHERE singleton=1 AND protocol=?2 AND active=0 AND nonce='' AND purpose='' AND epoch=?3 AND mode='serving' AND ${tupleSql(false)}=?4 RETURNING epoch,mode`).bind(c.nextEpoch,VERSION,r.originalEpoch,r.tuple),
 native.prepare(proof(r.next,false,'closed',false).replace('SELECT CASE WHEN','SELECT CASE WHEN changes()=1 AND')).bind(JSON.stringify(r.next),'',c.expiresAt,c.nextEpoch),
 ]);
 if(out.length!==3||out[0]?.results[0]?.admitted!==1||out[1]?.meta.changes!==1||out.at(-1)?.results[0]?.admitted!==1)throw new PrivacyWriteAdmissionHeld('epoch_closure_commit_unconfirmed');
 return heldReceipt(c,3);
}
/** Observation cannot retry a spent migration or discharge provider effects. */
export async function observeCapturedEpoch(c:NativeEpochCapability):Promise<ReturnType<typeof heldReceipt>>{
 const r=captures.get(c);if(!r||!r.spent)throw new PrivacyWriteAdmissionHeld('epoch_observation_requires_spent_original');
 const row=await r.native.prepare(proof(r.next,false,'closed',false)).bind(JSON.stringify(r.next),'',c.expiresAt,c.nextEpoch).first<{admitted:number}>();
 if(row?.admitted!==1)throw new PrivacyWriteAdmissionHeld('epoch_readback_unconfirmed');
 return heldReceipt(c,1);
}
export function reopenPrivacyEpoch():never{throw new PrivacyWriteAdmissionHeld('epoch_current_origin_credentials_provider_and_replay_unqualified');}
